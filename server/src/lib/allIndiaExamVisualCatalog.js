'use strict';

const { isStateExamLevel1, resolveAutoStateIconKey } = require('./indianStateVisualCatalog');
const { isHimachalStateLevel2, resolveAutoHimachalIconKey } = require('./himachalExamVisualCatalog');

const TESTS = [
  { slug: 'upsc-cse', subLabel: 'UPSC CSE', aliases: ['cse', 'civil service'] },
  { slug: 'upsc-ifs', subLabel: 'UPSC IFS', aliases: [] },
  { slug: 'upsc-ese', subLabel: 'UPSC ESE', aliases: [] },
  { slug: 'upsc-cms', subLabel: 'UPSC CMS', aliases: [] },
  { slug: 'ssc-cgl', subLabel: 'SSC CGL', aliases: ['cgl'] },
  { slug: 'ssc-cpo', subLabel: 'SSC CPO', aliases: ['cpo'] },
  { slug: 'ssc-chsl', subLabel: 'SSC CHSL', aliases: ['chsl'] },
  { slug: 'ssc-mts', subLabel: 'SSC MTS', aliases: ['mts'] },
  { slug: 'ssc-gd', subLabel: 'SSC GD', aliases: ['gd'] },
  { slug: 'sbi-po', subLabel: 'SBI PO', aliases: [] },
  { slug: 'sbi-clerk', subLabel: 'SBI CLERK', aliases: [] },
  { slug: 'ibps-po', subLabel: 'IBPS PO', aliases: ['ibps po'] },
  { slug: 'ibps-rrb', subLabel: 'IBPS RRB', aliases: [] },
  { slug: 'rbi-grade-b', subLabel: 'RBI GRADE B', aliases: ['rbi grade b'] },
  { slug: 'rrb-ntpc', subLabel: 'RRB NTPC', aliases: ['ntpc'] },
  { slug: 'rrb-alp', subLabel: 'RRB ALP', aliases: ['alp'] },
  { slug: 'rrb-je', subLabel: 'RRB JE', aliases: ['je'] },
  { slug: 'rrb-group-d', subLabel: 'GROUP D', aliases: ['group d'] },
  { slug: 'nda', subLabel: 'NDA', aliases: [] },
  { slug: 'cds', subLabel: 'CDS', aliases: [] },
  { slug: 'afcat', subLabel: 'AFCAT', aliases: [] },
  { slug: 'agniveer', subLabel: 'AGNIVEER', aliases: [] },
  { slug: 'ugc-net', subLabel: 'UGC NET', aliases: ['ugc net'] },
  { slug: 'ctet', subLabel: 'CTET', aliases: [] },
  { slug: 'neet-ug', subLabel: 'NEET UG', aliases: ['neet'] },
  { slug: 'gate', subLabel: 'GATE', aliases: [] },
  { slug: 'jee-mains', subLabel: 'JEE MAINS', aliases: ['jee main', 'jee mains'] },
  { slug: 'lic-aao', subLabel: 'LIC AAO', aliases: ['lic aao'] },
];

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAllIndiaExamLevel1(level1) {
  const key = normalizeKey(level1);
  if (!key) return false;
  return key === 'all india' || key.startsWith('all india ');
}

function isRemoteIconKey(value) {
  const v = String(value || '').trim().toLowerCase();
  return v.startsWith('http://') || v.startsWith('https://');
}

function parseSlugFromIconKey(iconKey) {
  const raw = String(iconKey || '').trim().toLowerCase();
  if (!raw.startsWith('allindia:')) return '';
  return raw.slice(9).trim();
}

function resolveTestSlug(level3, level2, iconKey = '') {
  const fromIcon = parseSlugFromIconKey(iconKey);
  if (fromIcon && TESTS.some((t) => t.slug === fromIcon)) return fromIcon;
  const key = normalizeKey(level3);
  if (!key) return '';
  for (const row of TESTS) {
    if (key === normalizeKey(row.subLabel)) return row.slug;
    for (const alias of row.aliases) {
      if (key.includes(normalizeKey(alias))) return row.slug;
    }
  }
  return '';
}

function resolveAutoAllIndiaIconKey(level1, level2, level3, iconKey = '') {
  const existing = String(iconKey || '').trim();
  if (existing && isRemoteIconKey(existing)) return existing;
  if (existing.startsWith('allindia:')) return existing;
  if (!isAllIndiaExamLevel1(level1)) return existing;
  const slug = resolveTestSlug(level3, level2, existing);
  return slug ? `allindia:${slug}` : existing;
}

function resolveExamCategoryIconKey(level1, level2, level3, iconKey = '') {
  const l1 = String(level1 || '').trim();
  const l2 = String(level2 || '').trim();
  const l3 = String(level3 || '').trim();
  const existing = String(iconKey || '').trim();
  if (isAllIndiaExamLevel1(l1)) {
    return resolveAutoAllIndiaIconKey(l1, l2, l3, existing);
  }
  if (isStateExamLevel1(l1)) {
    if (isHimachalStateLevel2(l2) && l3) {
      const hpKey = resolveAutoHimachalIconKey(l1, l2, l3, existing);
      if (hpKey && hpKey.startsWith('hp:')) return hpKey;
    }
    return resolveAutoStateIconKey(l1, l2, existing);
  }
  return existing;
}

module.exports = {
  isAllIndiaExamLevel1,
  resolveAutoAllIndiaIconKey,
  resolveExamCategoryIconKey,
  resolveTestSlug,
};
