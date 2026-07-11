'use strict';

const { isStateExamLevel1 } = require('./indianStateVisualCatalog');

const TESTS = [
  { slug: 'hp-gk-mix', subLabel: 'HP GK Full Mix', aliases: ['hp gk', 'hp gk mix', 'hp gk full'] },
  { slug: 'hp-history', subLabel: 'HP History', aliases: ['history'] },
  { slug: 'hp-geography', subLabel: 'HP Geography', aliases: ['geography'] },
  { slug: 'hp-rivers', subLabel: 'Rivers & Lakes', aliases: ['rivers', 'lakes'] },
  { slug: 'hp-culture', subLabel: 'Culture & Fairs', aliases: ['culture', 'fairs'] },
  { slug: 'hp-budget', subLabel: 'Budget & Eco', aliases: ['budget'] },
  { slug: 'hp-district', subLabel: 'District Wise', aliases: ['district'] },
  { slug: 'hpas', subLabel: 'HPAS (SDM/DSP)', aliases: ['hpas', 'sdm', 'dsp'] },
  { slug: 'hp-naib-tehsildar', subLabel: 'HP Revenue', aliases: ['naib tehsildar', 'tehsildar'] },
  { slug: 'hpfs', subLabel: 'HPFS', aliases: ['acf', 'forest service'] },
  { slug: 'hp-judicial', subLabel: 'HP Judicial', aliases: ['judicial'] },
  { slug: 'hp-allied', subLabel: 'HP Allied', aliases: ['allied'] },
  { slug: 'joa-it', subLabel: 'JOA IT', aliases: ['joa'] },
  { slug: 'hp-si', subLabel: 'HP Police SI', aliases: ['sub inspector', 'si'] },
  { slug: 'hp-junior-auditor', subLabel: 'Junior Auditor', aliases: ['clerk', 'auditor'] },
  { slug: 'hp-police', subLabel: 'HP Police', aliases: ['constable'] },
  { slug: 'hp-jail', subLabel: 'Jail Warder', aliases: ['jail'] },
  { slug: 'hp-home-guard', subLabel: 'Home Guards', aliases: ['home guard'] },
  { slug: 'hp-tet', subLabel: 'HP TET', aliases: ['tet'] },
  { slug: 'hp-pgt', subLabel: 'HP PGT', aliases: ['pgt', 'lecturer'] },
  { slug: 'hp-tgt', subLabel: 'HP TGT', aliases: ['tgt'] },
  { slug: 'hp-jbt', subLabel: 'JBT / NTT', aliases: ['jbt', 'ntt'] },
  { slug: 'hp-prof', subLabel: 'College Cadre', aliases: ['professor'] },
  { slug: 'hp-patwari', subLabel: 'HP Patwari', aliases: ['patwari'] },
  { slug: 'hp-forest-guard', subLabel: 'Forest Guard', aliases: ['forest guard'] },
  { slug: 'hp-je', subLabel: 'HP JE', aliases: ['je'] },
  { slug: 'hpseb', subLabel: 'HPSEB Staff', aliases: ['hpseb', 'lineman'] },
  { slug: 'hp-mo', subLabel: 'Medical Officer', aliases: ['medical officer'] },
  { slug: 'hp-nurse', subLabel: 'HP Staff Nurse', aliases: ['nurse', 'anm'] },
  { slug: 'hp-hc-clerk', subLabel: 'HP High Court', aliases: ['high court'] },
  { slug: 'hp-ado', subLabel: 'ADO / HDO', aliases: ['agriculture', 'horticulture'] },
  { slug: 'hp-hrtc', subLabel: 'HRTC Exam', aliases: ['hrtc', 'conductor'] },
  { slug: 'hp-vet', subLabel: 'Vet Pharmacist', aliases: ['vet'] },
  { slug: 'hp-stats', subLabel: 'Statistical Asst.', aliases: ['statistical'] },
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

function isRemoteIconKey(value) {
  const v = String(value || '').trim().toLowerCase();
  return v.startsWith('http://') || v.startsWith('https://');
}

function isHimachalStateLevel2(level2) {
  const key = normalizeKey(level2);
  if (!key) return false;
  return (
    key === 'himachal pradesh' ||
    key === 'himachal' ||
    key === 'hp' ||
    key.includes('himachal')
  );
}

function parseSlugFromIconKey(iconKey) {
  const raw = String(iconKey || '').trim().toLowerCase();
  if (!raw.startsWith('hp:')) return '';
  return raw.slice(3).trim();
}

function resolveTestSlug(level3, iconKey = '') {
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

function resolveAutoHimachalIconKey(level1, level2, level3, iconKey = '') {
  const existing = String(iconKey || '').trim();
  if (existing && isRemoteIconKey(existing)) return existing;
  if (existing.startsWith('hp:')) return existing;
  if (!isStateExamLevel1(level1) || !isHimachalStateLevel2(level2)) return existing;
  const slug = resolveTestSlug(level3, existing);
  return slug ? `hp:${slug}` : existing;
}

module.exports = {
  isHimachalStateLevel2,
  resolveAutoHimachalIconKey,
  resolveTestSlug,
};
