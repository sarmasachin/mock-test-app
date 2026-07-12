'use strict';

/**
 * Phase 6 — seed examCategories rows from Himachal + All India hardcoded catalogs.
 * Mirrors Android HimachalExamVisualCatalog / AllIndiaExamVisualCatalog catalogTestSeeds().
 */

const { resolveIndianStateSlug } = require('./indianStateVisualCatalog');
const {
  suggestSectionSlugFromLevel3,
  normalizeStateExamCategoryRow,
} = require('./stateExamDynamicSpec');

const HP_STATE = 'Himachal Pradesh';
const ALL_INDIA_L1 = 'All India';

/** Himachal UI section slug → dynamic stateExam section slug */
const HP_SECTION_TO_DYNAMIC = {
  'hp-gk': 'gk',
  'hp-admin': 'admin',
  'hp-allied': 'admin',
  'hp-police': 'police',
  'hp-teach': 'teaching',
  'hp-rev': 'revenue',
  'hp-court': 'medical',
  'hp-misc': 'other',
};

/** slug, hindiName (level3 / apply), subLabel, hpSectionSlug */
const HIMACHAL_CATALOG_TESTS = [
  ['hp-gk-mix', 'HP GK मिक्स मॉक टेस्ट', 'HP GK Full Mix', 'hp-gk'],
  ['hp-history', 'हिमाचल का इतिहास', 'HP History', 'hp-gk'],
  ['hp-geography', 'हिमाचल का भूगोल', 'HP Geography', 'hp-gk'],
  ['hp-rivers', 'नदियां और झीलें', 'Rivers & Lakes', 'hp-gk'],
  ['hp-culture', 'संस्कृति, मेले व त्यौहार', 'Culture & Fairs', 'hp-gk'],
  ['hp-budget', 'HP बजट व आर्थिक सर्वे', 'Budget & Eco', 'hp-gk'],
  ['hp-district', 'जिलेवार सामान्य ज्ञान', 'District Wise', 'hp-gk'],
  ['hpas', 'हिमाचल प्रशासनिक सेवा', 'HPAS (SDM/DSP)', 'hp-admin'],
  ['hp-naib-tehsildar', 'नायब तहसीलदार', 'HP Revenue', 'hp-admin'],
  ['hpfs', 'वन सेवा (ACF)', 'HPFS', 'hp-admin'],
  ['hp-judicial', 'न्यायिक सेवा', 'HP Judicial', 'hp-admin'],
  ['hp-allied', 'अलाइड सर्विसेज', 'HP Allied', 'hp-allied'],
  ['joa-it', 'जेओए आईटी', 'JOA IT', 'hp-allied'],
  ['hp-si', 'सब-इंस्पेक्टर पुलिस', 'HP Police SI', 'hp-allied'],
  ['hp-junior-auditor', 'जूनियर ऑपरेटर / क्लर्क', 'Junior Auditor', 'hp-allied'],
  ['hp-police', 'पुलिस कांस्टेबल', 'HP Police', 'hp-police'],
  ['hp-jail', 'जेल वार्डर', 'Jail Warder', 'hp-police'],
  ['hp-home-guard', 'होम गार्ड स्टाफ', 'Home Guards', 'hp-police'],
  ['hp-tet', 'हिमाचल टीईटी', 'HP TET', 'hp-teach'],
  ['hp-pgt', 'स्कूल लेक्चरर (PGT)', 'HP PGT', 'hp-teach'],
  ['hp-tgt', 'टीजीटी शिक्षक', 'HP TGT', 'hp-teach'],
  ['hp-jbt', 'जेबीटी / एनटीटी', 'JBT / NTT', 'hp-teach'],
  ['hp-prof', 'असिस्टेंट प्रोफेसर', 'College Cadre', 'hp-teach'],
  ['hp-patwari', 'हिमाचल पटवारी', 'HP Patwari', 'hp-rev'],
  ['hp-forest-guard', 'वन रक्षक', 'Forest Guard', 'hp-rev'],
  ['hp-je', 'जूनियर इंजीनियर', 'HP JE', 'hp-rev'],
  ['hpseb', 'बिजली बोर्ड लाइनमैन', 'HPSEB Staff', 'hp-rev'],
  ['hp-mo', 'मेडिकल ऑफिसर', 'Medical Officer', 'hp-court'],
  ['hp-nurse', 'स्टाफ नर्स / एएनएम', 'HP Staff Nurse', 'hp-court'],
  ['hp-hc-clerk', 'हाई कोर्ट क्लर्क', 'HP High Court', 'hp-court'],
  ['hp-ado', 'कृषि / बागवानी अधिकारी', 'ADO / HDO', 'hp-misc'],
  ['hp-hrtc', 'एचआरटीसी कंडक्टर', 'HRTC Exam', 'hp-misc'],
  ['hp-vet', 'पशुपालन फार्मासिस्ट', 'Vet Pharmacist', 'hp-misc'],
  ['hp-stats', 'सांख्यिकी सहायक', 'Statistical Asst.', 'hp-misc'],
];

const ALL_INDIA_SECTIONS = {
  upsc: 'UPSC',
  ssc: 'SSC',
  bank: 'Banking',
  rrb: 'Railways',
  def: 'Defence',
  other: 'Other Exams',
};

/** slug, hindiName, subLabel, sectionSlug */
const ALL_INDIA_CATALOG_TESTS = [
  ['upsc-cse', 'सिविल सर्विसेज', 'UPSC CSE', 'upsc'],
  ['upsc-ifs', 'वन सेवा', 'UPSC IFS', 'upsc'],
  ['upsc-ese', 'इंजीनियरिंग सेवा', 'UPSC ESE', 'upsc'],
  ['upsc-cms', 'मेडिकल सेवा', 'UPSC CMS', 'upsc'],
  ['ssc-cgl', 'एसएससी CGL', 'SSC CGL', 'ssc'],
  ['ssc-cpo', 'सब-इंस्पेक्टर', 'SSC CPO', 'ssc'],
  ['ssc-chsl', 'एसएससी CHSL', 'SSC CHSL', 'ssc'],
  ['ssc-mts', 'एसएससी MTS', 'SSC MTS', 'ssc'],
  ['ssc-gd', 'कांस्टेबल GD', 'SSC GD', 'ssc'],
  ['sbi-po', 'एसबीआई PO', 'SBI PO', 'bank'],
  ['sbi-clerk', 'एसबीआई क्लर्क', 'SBI CLERK', 'bank'],
  ['ibps-po', 'आईबीपीएस PO', 'IBPS PO', 'bank'],
  ['ibps-rrb', 'ग्रामीण बैंक', 'IBPS RRB', 'bank'],
  ['rbi-grade-b', 'आरबीआई ग्रेड B', 'RBI GRADE B', 'bank'],
  ['rrb-ntpc', 'रेलवे एनटीपीसी', 'RRB NTPC', 'rrb'],
  ['rrb-alp', 'लोको पायलट', 'RRB ALP', 'rrb'],
  ['rrb-je', 'जूनियर इंजीनियर', 'RRB JE', 'rrb'],
  ['rrb-group-d', 'रेलवे ग्रुप D', 'GROUP D', 'rrb'],
  ['nda', 'एनडीए परीक्षा', 'NDA', 'def'],
  ['cds', 'सीडीएस परीक्षा', 'CDS', 'def'],
  ['afcat', 'एएफसीएटी', 'AFCAT', 'def'],
  ['agniveer', 'अग्निवीर भर्ती', 'AGNIVEER', 'def'],
  ['ugc-net', 'यूजीसी नेट', 'UGC NET', 'other'],
  ['ctet', 'सीटीईटी पात्रता', 'CTET', 'other'],
  ['neet-ug', 'नीट यूजी', 'NEET UG', 'other'],
  ['gate', 'गेट परीक्षा', 'GATE', 'other'],
  ['jee-mains', 'जेईई मेन्स', 'JEE MAINS', 'other'],
  ['lic-aao', 'एलआईसी AAO', 'LIC AAO', 'other'],
];

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildHimachalSeedRows() {
  return HIMACHAL_CATALOG_TESTS.map(([slug, hindiName, subLabel, hpSection], index) => {
    const sectionSlug = HP_SECTION_TO_DYNAMIC[hpSection] || suggestSectionSlugFromLevel3(subLabel);
    return {
      id: `exam-cat-seed-hp-${slug}`,
      level1: 'State',
      level2: HP_STATE,
      level3: hindiName,
      iconKey: `hp:${slug}`,
      enabled: true,
      sectionSlug,
      itemSortOrder: index + 1,
      featured: false,
      linkedTestId: null,
      _seedMeta: { catalog: 'himachal', slug, subLabel },
    };
  });
}

function buildAllIndiaSeedRows() {
  return ALL_INDIA_CATALOG_TESTS.map(([slug, hindiName, subLabel, sectionSlug], index) => {
    const level2 = ALL_INDIA_SECTIONS[sectionSlug] || sectionSlug;
    return {
      id: `exam-cat-seed-ai-${slug}`,
      level1: ALL_INDIA_L1,
      level2,
      level3: hindiName,
      iconKey: `allindia:${slug}`,
      enabled: true,
      sectionSlug,
      itemSortOrder: index + 1,
      featured: false,
      linkedTestId: null,
      _seedMeta: { catalog: 'allindia', slug, subLabel },
    };
  });
}

function buildCatalogExamCategorySeeds() {
  return [...buildHimachalSeedRows(), ...buildAllIndiaSeedRows()];
}

function rowExists(existingItems, seed) {
  const iconKey = String(seed.iconKey || '').trim().toLowerCase();
  const level3Lower = String(seed.level3 || '').trim().toLowerCase();
  const stateSlug = resolveIndianStateSlug(seed.level2, seed.iconKey);
  const l1 = String(seed.level1 || '').trim().toLowerCase();

  for (const row of existingItems) {
    if (row.enabled === false) continue;
    const existingIcon = String(row.iconKey || '').trim().toLowerCase();
    if (iconKey && existingIcon === iconKey) return true;

    const existingL3 = String(row.level3 || '').trim().toLowerCase();
    const existingL1 = String(row.level1 || '').trim().toLowerCase();
    const existingL2 = String(row.level2 || '').trim().toLowerCase();

    if (l1 === 'state' && existingL1.includes('state')) {
      if (resolveIndianStateSlug(row.level2, row.iconKey) === stateSlug && existingL3 === level3Lower) {
        return true;
      }
    }
    if (l1.includes('all india') && existingL1.includes('all india') && existingL3 === level3Lower) {
      return true;
    }
  }
  return false;
}

function linkTestsToSeeds(seedRows, tests) {
  const testList = Array.isArray(tests) ? tests : [];
  const bySub = new Map();
  for (const t of testList) {
    const sub = String(t.subcategory || t.title || '').trim().toLowerCase();
    if (sub) bySub.set(sub, t.id);
    const title = String(t.title || '').trim().toLowerCase();
    if (title && !bySub.has(title)) bySub.set(title, t.id);
  }

  return seedRows.map((seed) => {
    const meta = seed._seedMeta || {};
    const candidates = [
      String(seed.level3 || '').trim().toLowerCase(),
      String(meta.subLabel || '').trim().toLowerCase(),
    ].filter(Boolean);
    let linkedTestId = seed.linkedTestId;
    for (const c of candidates) {
      if (bySub.has(c)) {
        linkedTestId = bySub.get(c);
        break;
      }
    }
    const { _seedMeta, ...rest } = seed;
    return { ...rest, linkedTestId: linkedTestId || null };
  });
}

/**
 * Merge catalog seeds into existing examCategories items (idempotent).
 */
function mergeCatalogSeedsIntoExamCategories(existingItems, options = {}) {
  const items = Array.isArray(existingItems) ? [...existingItems] : [];
  const seeds = buildCatalogExamCategorySeeds();
  const tests = options.tests || [];
  const linkedSeeds = linkTestsToSeeds(seeds, tests);

  let added = 0;
  let skipped = 0;
  const addedRows = [];

  for (const seed of linkedSeeds) {
    if (rowExists(items, seed)) {
      skipped += 1;
      continue;
    }
    items.push(seed);
    addedRows.push(seed);
    added += 1;
  }

  return {
    items,
    stats: {
      seedTotal: linkedSeeds.length,
      added,
      skipped,
      himachalSeeds: HIMACHAL_CATALOG_TESTS.length,
      allIndiaSeeds: ALL_INDIA_CATALOG_TESTS.length,
    },
    addedRows,
  };
}

function normalizeMergedCatalogItems(items, sectionTemplates) {
  const normalized = [];
  const errors = [];
  for (let index = 0; index < items.length; index += 1) {
    const result = normalizeStateExamCategoryRow(items[index], index, { sectionTemplates });
    if (!result.ok) {
      errors.push({ index, error: result.error });
      continue;
    }
    normalized.push(result.row);
  }
  return { items: normalized, errors };
}

module.exports = {
  HP_STATE,
  ALL_INDIA_L1,
  HIMACHAL_CATALOG_TESTS,
  ALL_INDIA_CATALOG_TESTS,
  buildCatalogExamCategorySeeds,
  mergeCatalogSeedsIntoExamCategories,
  linkTestsToSeeds,
  normalizeMergedCatalogItems,
  rowExists,
};
