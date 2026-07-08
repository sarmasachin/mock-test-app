'use strict';

const { correctTextAtIndex } = require('../../src/mcqShuffle');

const PROD_DAY_KEY = 20260708;

const PROD_ITEMS = [
  {
    id: 'dq-1783448245640-2243',
    questionPrompt: 'HP state animal',
    optionA: 'Monal',
    optionB: 'Brown Bear',
    optionC: 'Musk Deer',
    optionD: 'Snow Leopard',
    correctIndex: 3,
    isPublished: true,
  },
  {
    id: 'dq-1783448166666-1961',
    questionPrompt: 'HP district count',
    optionA: '11',
    optionB: '10',
    optionC: '12',
    optionD: '13',
    correctIndex: 2,
    isPublished: true,
  },
  {
    id: 'dq-1783448124430-8780',
    questionPrompt: 'HP statehood date',
    optionA: '15 Aug 1948',
    optionB: '25 Jan 1950',
    optionC: '1 Nov 1966',
    optionD: '25 Jan 1971',
    correctIndex: 3,
    isPublished: true,
  },
];

const DISTRICTS_IDENTITY_PATTERN = ['11', '10', '12', '13'];

function line(ok, msg) {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${msg}`);
  return ok;
}

function adminOptions(item) {
  return [item.optionA, item.optionB, item.optionC, item.optionD].map((x) => String(x || ''));
}

function adminCorrectText(item) {
  return correctTextAtIndex(adminOptions(item), item.correctIndex);
}

function isSameStringArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]) !== String(b[i])) return false;
  }
  return true;
}

function verifyDeliveredItem(adminItem, delivered) {
  const opts = Array.isArray(delivered?.options) ? delivered.options : [];
  const idx = Number(delivered?.correctIndex);
  const expected = adminCorrectText(adminItem);
  if (opts.length !== 4) return { ok: false, reason: `expected 4 options, got ${opts.length}` };
  if (!(Number.isInteger(idx) && idx >= 0 && idx < 4)) {
    return { ok: false, reason: `correctIndex out of range: ${delivered?.correctIndex}` };
  }
  if (String(opts[idx] ?? '').trim() !== expected) {
    return { ok: false, reason: `correct text mismatch: "${opts[idx]}" !== "${expected}"` };
  }
  const multiset = [...opts].sort().join('\0');
  const adminMultiset = adminOptions(adminItem).sort().join('\0');
  if (multiset !== adminMultiset) {
    return { ok: false, reason: 'option multiset differs from admin source' };
  }
  return { ok: true };
}

function verifyLiveDeliveryShape(delivered) {
  const opts = Array.isArray(delivered?.options) ? delivered.options : [];
  const idx = Number(delivered?.correctIndex);
  if (opts.length !== 4) return { ok: false, reason: `expected 4 options, got ${opts.length}` };
  if (!(Number.isInteger(idx) && idx >= 0 && idx < 4)) {
    return { ok: false, reason: `correctIndex out of range: ${delivered?.correctIndex}` };
  }
  if (!String(opts[idx] ?? '').trim()) {
    return { ok: false, reason: 'correctIndex points at empty option' };
  }
  return { ok: true };
}

function deliveryFingerprint(items) {
  return items.map((x) => ({
    id: String(x.id || ''),
    correctIndex: Number(x.correctIndex),
    options: (Array.isArray(x.options) ? x.options : []).map((o) => String(o || '')),
  }));
}

function sameDeliveryFingerprint(a, b) {
  const left = deliveryFingerprint(a);
  const right = deliveryFingerprint(b);
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i].id !== right[i].id) return false;
    if (left[i].correctIndex !== right[i].correctIndex) return false;
    if (left[i].options.length !== right[i].options.length) return false;
  }
  return true;
}

function sampleItems(n, idPrefix = 'dq-verify') {
  return Array.from({ length: n }, (_, i) => ({
    id: `${idPrefix}-${i + 1}`,
    questionPrompt: `Q${i + 1}`,
    optionA: `A${i}`,
    optionB: `B${i}`,
    optionC: `C${i}`,
    optionD: `D${i}`,
    correctIndex: i % 4,
    isPublished: true,
  }));
}

function itemWithCorrectIndex(correctIndex) {
  return {
    id: `dq-ci-${correctIndex}`,
    questionPrompt: 'Correct index sweep',
    optionA: 'Alpha',
    optionB: 'Bravo',
    optionC: 'Charlie',
    optionD: 'Delta',
    correctIndex,
    isPublished: true,
  };
}

/**
 * Core shuffle regression (Phase 1 + Phase 2). Returns false if any check fails.
 */
function runCoreShuffleRegression(buildDailyQuizItemsForDay, shuffleQuizOptions) {
  let ok = true;

  const builtProd = buildDailyQuizItemsForDay(PROD_ITEMS, PROD_DAY_KEY);
  const adminOrder = PROD_ITEMS.map((x) => x.id);
  const builtOrder = builtProd.map((x) => x.id);

  ok = line(builtProd.length === 3, 'production snapshot builds 3 items') && ok;
  ok = line(!isSameStringArray(adminOrder, builtOrder), `dayKey ${PROD_DAY_KEY}: question order differs from admin`) && ok;

  const districts = PROD_ITEMS.find((x) => x.id === 'dq-1783448166666-1961');
  const districtsDelivered = builtProd.find((x) => x.id === 'dq-1783448166666-1961');
  ok =
    line(
      districtsDelivered && !isSameStringArray(adminOptions(districts), districtsDelivered.options),
      `dayKey ${PROD_DAY_KEY}: districts options not identity`,
    ) && ok;

  for (const delivered of builtProd) {
    const adminItem = PROD_ITEMS.find((x) => x.id === delivered.id);
    const check = verifyDeliveredItem(adminItem, delivered);
    ok = line(check.ok, `${delivered.id}: correctIndex invariant`) && ok;
    ok =
      line(
        !isSameStringArray(adminOptions(adminItem), delivered.options),
        `${delivered.id}: options differ from admin A-D order`,
      ) && ok;
  }

  const three = sampleItems(3);
  const adminIds = three.map((x) => x.id);
  let questionIdentityDays = 0;
  let optionIdentityCount = 0;
  let invariantFailures = 0;

  for (let offset = 0; offset < 365; offset += 1) {
    const dayKey = 20260101 + offset;
    const built = buildDailyQuizItemsForDay(three, dayKey);
    if (isSameStringArray(adminIds, built.map((x) => x.id))) {
      questionIdentityDays += 1;
    }
    for (const delivered of built) {
      const adminItem = three.find((x) => x.id === delivered.id);
      if (isSameStringArray(adminOptions(adminItem), delivered.options)) {
        optionIdentityCount += 1;
      }
      const check = verifyDeliveredItem(adminItem, delivered);
      if (!check.ok) invariantFailures += 1;
    }
  }

  ok = line(questionIdentityDays === 0, `365 days (n=3): question identity ${questionIdentityDays}`) && ok;
  ok = line(optionIdentityCount === 0, `365 days (n=3): option identity ${optionIdentityCount}`) && ok;
  ok = line(invariantFailures === 0, `365 days (n=3): invariant failures ${invariantFailures}`) && ok;

  const two = sampleItems(2, 'dq-two');
  const twoAdminIds = two.map((x) => x.id);
  let twoIdentity = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    const built = buildDailyQuizItemsForDay(two, 20260101 + offset);
    if (isSameStringArray(twoAdminIds, built.map((x) => x.id))) {
      twoIdentity += 1;
    }
  }
  ok = line(twoIdentity === 0, `365 days (n=2): question identity ${twoIdentity}`) && ok;

  const ten = sampleItems(10, 'dq-ten');
  const tenAdminIds = ten.map((x) => x.id);
  let tenIdentity = 0;
  for (let offset = 0; offset < 100; offset += 1) {
    const built = buildDailyQuizItemsForDay(ten, 20260201 + offset);
    if (isSameStringArray(tenAdminIds, built.map((x) => x.id))) {
      tenIdentity += 1;
    }
  }
  ok = line(tenIdentity === 0, `100 days (n=10): question identity ${tenIdentity}`) && ok;

  const one = sampleItems(1);
  const soloBuilt = buildDailyQuizItemsForDay(one, PROD_DAY_KEY);
  ok = line(soloBuilt.length === 1, 'single published question returns 1 item') && ok;
  ok =
    line(
      !isSameStringArray(adminOptions(one[0]), soloBuilt[0].options),
      'single question: options differ from admin order',
    ) && ok;

  const builtA = buildDailyQuizItemsForDay(PROD_ITEMS, PROD_DAY_KEY);
  const builtB = buildDailyQuizItemsForDay(PROD_ITEMS, PROD_DAY_KEY);
  ok = line(JSON.stringify(builtA) === JSON.stringify(builtB), 'deterministic: same inputs → same delivery') && ok;

  const opt = shuffleQuizOptions(PROD_ITEMS[1], PROD_DAY_KEY);
  ok = line(!isSameStringArray(adminOptions(PROD_ITEMS[1]), opt.options), 'shuffleQuizOptions: not identity') && ok;
  ok = line(opt.options[opt.correctIndex] === adminCorrectText(PROD_ITEMS[1]), 'shuffleQuizOptions: correct text at index') && ok;

  for (let ci = 0; ci <= 3; ci += 1) {
    const item = itemWithCorrectIndex(ci);
    const delivered = shuffleQuizOptions(item, PROD_DAY_KEY);
    const check = verifyDeliveredItem(item, delivered);
    ok = line(check.ok, `correctIndex sweep ${ci}: invariant`) && ok;
    ok =
      line(
        !isSameStringArray(adminOptions(item), delivered.options),
        `correctIndex sweep ${ci}: options shuffled`,
      ) && ok;
  }

  const mixed = [
    { ...PROD_ITEMS[0], isPublished: false },
    PROD_ITEMS[1],
    PROD_ITEMS[2],
  ];
  ok = line(buildDailyQuizItemsForDay(mixed, PROD_DAY_KEY).length === 2, 'unpublished items excluded') && ok;

  return ok;
}

module.exports = {
  PROD_DAY_KEY,
  PROD_ITEMS,
  DISTRICTS_IDENTITY_PATTERN,
  line,
  adminOptions,
  adminCorrectText,
  isSameStringArray,
  verifyDeliveredItem,
  verifyLiveDeliveryShape,
  deliveryFingerprint,
  sameDeliveryFingerprint,
  sampleItems,
  itemWithCorrectIndex,
  runCoreShuffleRegression,
};
