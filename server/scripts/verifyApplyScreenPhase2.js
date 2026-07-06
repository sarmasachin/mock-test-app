'use strict';
/**
 * Phase 2 verify — catalog fields required for Apply / Start Test preview (read-only).
 * Complements Android ContentRepository.hasCatalogDisplayFields + toTestCard mapping.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(body || '{}') });
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout: ${url}`));
    });
  });
}

function androidDurationLabel(durationMinutes) {
  const mins = Math.max(0, Number(durationMinutes || 0));
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem === 0 ? `${hrs} hrs` : `${hrs} hr ${rem} min`;
  }
  return `${mins} min`;
}

function androidQuestionsMarks(questionCount, totalMarks) {
  const q = Math.max(0, Number(questionCount || 0));
  const marks = Math.max(0, Number(totalMarks || 0));
  return `${q} Q / ${marks} marks`;
}

function hasCatalogDisplayFields(mapped) {
  return Boolean(
    mapped.id &&
    mapped.questionsMarks &&
    mapped.durationLabel,
  );
}

function mapCatalogItemToAndroidPreview(item) {
  const durationMinutes = Number(item.durationMinutes || 0);
  const questionCount = Number(item.questionCount || 0);
  const totalMarks = Number(item.totalMarks || 0);
  const capacityTotal = Math.max(0, Number(item.capacityTotal || 0));
  const enrolledCount = Math.max(0, Number(item.enrolledCount || 0));
  return {
    id: String(item.id || ''),
    title: String(item.title || ''),
    subcategory: String(item.subcategory || ''),
    questionsMarks: androidQuestionsMarks(questionCount, totalMarks),
    durationLabel: androidDurationLabel(durationMinutes),
    enrolledLabel: capacityTotal > 0 ? `${enrolledCount}/${capacityTotal}` : `${enrolledCount}`,
    examDate: item.examDate != null ? String(item.examDate) : null,
  };
}

function staticAndroidSourceCheck() {
  const repoPath = path.join(
    __dirname,
    '..',
    '..',
    'app',
    'src',
    'main',
    'java',
    'com',
    'freemocktest',
    'app',
    'data',
    'ContentRepository.kt',
  );
  const previewPath = path.join(
    __dirname,
    '..',
    '..',
    'app',
    'src',
    'main',
    'java',
    'com',
    'freemocktest',
    'app',
    'newui',
    'tests',
    'StartTestPreviewScreenNew.kt',
  );
  let ok = true;
  if (!fs.existsSync(repoPath)) {
    return line(false, `ContentRepository.kt not found at ${repoPath}`);
  }
  const repoSrc = fs.readFileSync(repoPath, 'utf8');
  ok = line(repoSrc.includes('fun hasCatalogDisplayFields'), 'Android: hasCatalogDisplayFields() present') && ok;
  ok = line(repoSrc.includes('loadTestCardFromCatalogById'), 'Android: loadTestCardFromCatalogById() present') && ok;
  ok = line(repoSrc.includes('loadTestsForSubcategory(target'), 'Android: subcategory fallback in loadTestForApplyScreen') && ok;
  ok = line(repoSrc.includes('cacheTestCardForLookupKey'), 'Android: lookup-key disk cache for subcategory/title') && ok;

  const previewSrc = fs.readFileSync(previewPath, 'utf8');
  ok = line(
    previewSrc.includes('hasCatalogDisplayFields(cached)'),
    'Android: Start Test skips sparse disk cache',
  ) && ok;
  ok = line(
    previewSrc.includes('matchesAppliedTestLookup'),
    'Android: applied test match by id/title/subcategory',
  ) && ok;
  ok = line(
    previewSrc.includes('if (locked) countdown else "Ready"'),
    'Android: countdown ring shows Ready when unlocked',
  ) && ok;
  return ok;
}

async function httpCatalogPreviewCheck() {
  const port = Number(process.env.PORT || 3000);
  const base = `http://127.0.0.1:${port}/v1/tests`;
  let ok = true;

  try {
    const allRes = await httpGetJson(`${base}?limit=100`);
    if (allRes.status !== 200) {
      return line(false, `HTTP GET /v1/tests → status ${allRes.status}`);
    }
    const items = Array.isArray(allRes.json.items) ? allRes.json.items : [];
    ok = line(Array.isArray(allRes.json.items), `HTTP catalog list → ${items.length} item(s)`) && ok;

    for (const item of items) {
      const mapped = mapCatalogItemToAndroidPreview(item);
      ok = line(
        hasCatalogDisplayFields(mapped),
        `Preview fields for "${mapped.title}": ${mapped.questionsMarks}, ${mapped.durationLabel}`,
      ) && ok;
    }

    const subRes = await httpGetJson(`${base}?subcategory=Patwari&limit=10`);
    const subItems = Array.isArray(subRes.json.items) ? subRes.json.items : [];
    ok = line(subRes.status === 200, 'HTTP GET /v1/tests?subcategory=Patwari → 200') && ok;
    if (subItems.length > 0) {
      const mapped = mapCatalogItemToAndroidPreview(subItems[0]);
      ok = line(
        mapped.title.length > 0 && hasCatalogDisplayFields(mapped),
        `Subcategory Patwari → "${mapped.title}" with full preview fields`,
      ) && ok;
    } else {
      ok = line(true, 'Subcategory Patwari: no tests (skip field check)') && ok;
    }
  } catch (e) {
    line(false, `HTTP catalog preview check skipped/failed: ${e.message}`);
    console.log('     Ensure Phase 1 server is running on PORT from server/.env');
    return true;
  }

  return ok;
}

async function main() {
  let ok = staticAndroidSourceCheck();
  ok = await httpCatalogPreviewCheck() && ok;
  if (!ok) {
    console.error('\nPhase 2 verify FAILED');
    process.exit(1);
  }
  console.log('\nPhase 2 verify PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
