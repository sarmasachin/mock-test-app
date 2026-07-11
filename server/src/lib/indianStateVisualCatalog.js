'use strict';

/**
 * Indian states / UTs — circular mock-test Level 2 visuals (slug, colors, icon key).
 * iconKey stored as state:<slug> e.g. state:br
 */

const STATE_VISUALS = [
  { slug: 'ap', english: 'Andhra Pradesh', hindi: 'आंध्र प्रदेश', aliases: ['andhra'] },
  { slug: 'ar', english: 'Arunachal Pradesh', hindi: 'अरुणाचल प्रदेश', aliases: ['arunachal'] },
  { slug: 'as', english: 'Assam', hindi: 'असम', aliases: [] },
  { slug: 'br', english: 'Bihar', hindi: 'बिहार', aliases: [] },
  { slug: 'cg', english: 'Chhattisgarh', hindi: 'छत्तीसगढ़', aliases: ['chhattisgarh'] },
  { slug: 'ga', english: 'Goa', hindi: 'गोवा', aliases: [] },
  { slug: 'gj', english: 'Gujarat', hindi: 'गुजरात', aliases: [] },
  { slug: 'hr', english: 'Haryana', hindi: 'हरियाणा', aliases: [] },
  { slug: 'hp', english: 'Himachal Pradesh', hindi: 'हिमाचल प्रदेश', aliases: ['himachal', 'hp'] },
  { slug: 'jh', english: 'Jharkhand', hindi: 'झारखंड', aliases: [] },
  { slug: 'ka', english: 'Karnataka', hindi: 'कर्नाटक', aliases: [] },
  { slug: 'kl', english: 'Kerala', hindi: 'केरल', aliases: [] },
  { slug: 'mp', english: 'Madhya Pradesh', hindi: 'मध्य प्रदेश', aliases: ['madhya pradesh'] },
  { slug: 'mh', english: 'Maharashtra', hindi: 'महाराष्ट्र', aliases: [] },
  { slug: 'mn', english: 'Manipur', hindi: 'मणिपुर', aliases: [] },
  { slug: 'ml', english: 'Meghalaya', hindi: 'मेघालय', aliases: [] },
  { slug: 'mz', english: 'Mizoram', hindi: 'मिजोरम', aliases: [] },
  { slug: 'nl', english: 'Nagaland', hindi: 'नागालैंड', aliases: [] },
  { slug: 'od', english: 'Odisha', hindi: 'ओडिशा', aliases: ['orissa'] },
  { slug: 'pb', english: 'Punjab', hindi: 'पंजाब', aliases: [] },
  { slug: 'rj', english: 'Rajasthan', hindi: 'राजस्थान', aliases: [] },
  { slug: 'sk', english: 'Sikkim', hindi: 'सिक्किम', aliases: [] },
  { slug: 'tn', english: 'Tamil Nadu', hindi: 'तमिलनाडु', aliases: ['tamil nadu'] },
  { slug: 'tg', english: 'Telangana', hindi: 'तेलंगाना', aliases: [] },
  { slug: 'tr', english: 'Tripura', hindi: 'त्रिपुरा', aliases: [] },
  { slug: 'up', english: 'Uttar Pradesh', hindi: 'उत्तर प्रदेश', aliases: ['uttar pradesh'] },
  { slug: 'uk', english: 'Uttarakhand', hindi: 'उत्तराखंड', aliases: ['uttarakhand'] },
  { slug: 'wb', english: 'West Bengal', hindi: 'पश्चिम बंगाल', aliases: ['west bengal', 'bengal'] },
  { slug: 'an', english: 'Andaman & Nicobar', hindi: 'अंडमान निकोबार', aliases: ['andaman', 'nicobar'] },
  { slug: 'ch', english: 'Chandigarh', hindi: 'चंडीगढ़', aliases: [] },
  { slug: 'dn', english: 'Dadra & Nagar Haveli', hindi: 'दादरा और नगर हवेली', aliases: ['dadra', 'daman', 'diu'] },
  { slug: 'dl', english: 'Delhi', hindi: 'दिल्ली', aliases: ['nct delhi', 'new delhi'] },
  { slug: 'jk', english: 'Jammu & Kashmir', hindi: 'जम्मू और कश्मीर', aliases: ['jammu', 'kashmir', 'j&k'] },
  { slug: 'la', english: 'Ladakh', hindi: 'लद्दाख', aliases: [] },
  { slug: 'ld', english: 'Lakshadweep', hindi: 'लक्षद्वीप', aliases: [] },
  { slug: 'py', english: 'Puducherry', hindi: 'पुडुचेरी', aliases: ['pondicherry', 'puducherry'] },
];

function normalizeStateLookupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isStateExamLevel1(level1) {
  const key = normalizeStateLookupKey(level1);
  if (!key) return false;
  return key === 'state' || key === 'state exams' || key === 'state exam' || key.startsWith('state ');
}

function isRemoteIconKey(value) {
  const v = String(value || '').trim().toLowerCase();
  return v.startsWith('http://') || v.startsWith('https://');
}

function parseStateSlugFromIconKey(iconKey) {
  const raw = String(iconKey || '').trim().toLowerCase();
  if (raw.startsWith('state:')) return raw.slice(6).trim();
  if (/^[a-z]{2,3}$/.test(raw)) return raw;
  return '';
}

function resolveIndianStateSlug(level2Label, iconKey = '') {
  const fromIcon = parseStateSlugFromIconKey(iconKey);
  if (fromIcon && STATE_VISUALS.some((s) => s.slug === fromIcon)) return fromIcon;

  const key = normalizeStateLookupKey(level2Label);
  if (!key) return '';

  for (const row of STATE_VISUALS) {
    const englishKey = normalizeStateLookupKey(row.english);
    const hindiKey = normalizeStateLookupKey(row.hindi);
    if (key === englishKey || key === hindiKey) return row.slug;
    if (key.startsWith(`${englishKey} `) || key.includes(` ${englishKey}`)) return row.slug;
    for (const alias of row.aliases) {
      const aliasKey = normalizeStateLookupKey(alias);
      if (key === aliasKey || key.startsWith(`${aliasKey} `) || key.includes(` ${aliasKey}`)) {
        return row.slug;
      }
    }
  }
  return '';
}

function resolveAutoStateIconKey(level1, level2, iconKey = '') {
  const existing = String(iconKey || '').trim();
  if (existing && isRemoteIconKey(existing)) return existing;
  if (existing.startsWith('state:')) return existing;
  if (!isStateExamLevel1(level1)) return existing;
  const slug = resolveIndianStateSlug(level2, existing);
  return slug ? `state:${slug}` : existing;
}

function findIndianStateVisual(level2Label, iconKey = '') {
  const slug = resolveIndianStateSlug(level2Label, iconKey);
  if (!slug) return null;
  const row = STATE_VISUALS.find((s) => s.slug === slug);
  if (!row) return null;
  return { ...row, iconKey: `state:${row.slug}` };
}

module.exports = {
  STATE_VISUALS,
  isStateExamLevel1,
  resolveIndianStateSlug,
  resolveAutoStateIconKey,
  findIndianStateVisual,
};
