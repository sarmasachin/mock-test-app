export type IndianStateVisualRow = {
  slug: string;
  english: string;
  hindi: string;
  aliases?: string[];
};

const STATE_VISUALS: IndianStateVisualRow[] = [
  { slug: 'ap', english: 'Andhra Pradesh', hindi: 'आंध्र प्रदेश', aliases: ['andhra'] },
  { slug: 'ar', english: 'Arunachal Pradesh', hindi: 'अरुणाचल प्रदेश', aliases: ['arunachal'] },
  { slug: 'as', english: 'Assam', hindi: 'असम' },
  { slug: 'br', english: 'Bihar', hindi: 'बिहार' },
  { slug: 'cg', english: 'Chhattisgarh', hindi: 'छत्तीसगढ़', aliases: ['chhattisgarh'] },
  { slug: 'ga', english: 'Goa', hindi: 'गोवा' },
  { slug: 'gj', english: 'Gujarat', hindi: 'गुजरात' },
  { slug: 'hr', english: 'Haryana', hindi: 'हरियाणा' },
  { slug: 'hp', english: 'Himachal Pradesh', hindi: 'हिमाचल प्रदेश', aliases: ['himachal', 'hp'] },
  { slug: 'jh', english: 'Jharkhand', hindi: 'झारखंड' },
  { slug: 'ka', english: 'Karnataka', hindi: 'कर्नाटक' },
  { slug: 'kl', english: 'Kerala', hindi: 'केरल' },
  { slug: 'mp', english: 'Madhya Pradesh', hindi: 'मध्य प्रदेश', aliases: ['madhya pradesh'] },
  { slug: 'mh', english: 'Maharashtra', hindi: 'महाराष्ट्र' },
  { slug: 'mn', english: 'Manipur', hindi: 'मणिपुर' },
  { slug: 'ml', english: 'Meghalaya', hindi: 'मेघालय' },
  { slug: 'mz', english: 'Mizoram', hindi: 'मिजोरम' },
  { slug: 'nl', english: 'Nagaland', hindi: 'नागालैंड' },
  { slug: 'od', english: 'Odisha', hindi: 'ओडिशा', aliases: ['orissa'] },
  { slug: 'pb', english: 'Punjab', hindi: 'पंजाब' },
  { slug: 'rj', english: 'Rajasthan', hindi: 'राजस्थान' },
  { slug: 'sk', english: 'Sikkim', hindi: 'सिक्किम' },
  { slug: 'tn', english: 'Tamil Nadu', hindi: 'तमिलनाडु', aliases: ['tamil nadu'] },
  { slug: 'tg', english: 'Telangana', hindi: 'तेलंगाना' },
  { slug: 'tr', english: 'Tripura', hindi: 'त्रिपुरा' },
  { slug: 'up', english: 'Uttar Pradesh', hindi: 'उत्तर प्रदेश', aliases: ['uttar pradesh'] },
  { slug: 'uk', english: 'Uttarakhand', hindi: 'उत्तराखंड', aliases: ['uttarakhand'] },
  { slug: 'wb', english: 'West Bengal', hindi: 'पश्चिम बंगाल', aliases: ['west bengal', 'bengal'] },
  { slug: 'an', english: 'Andaman & Nicobar', hindi: 'अंडमान निकोबार', aliases: ['andaman', 'nicobar'] },
  { slug: 'ch', english: 'Chandigarh', hindi: 'चंडीगढ़' },
  { slug: 'dn', english: 'Dadra & Nagar Haveli', hindi: 'दादरा और नगर हवेली', aliases: ['dadra', 'daman', 'diu'] },
  { slug: 'dl', english: 'Delhi', hindi: 'दिल्ली', aliases: ['nct delhi', 'new delhi'] },
  { slug: 'jk', english: 'Jammu & Kashmir', hindi: 'जम्मू और कश्मीर', aliases: ['jammu', 'kashmir', 'j&k'] },
  { slug: 'la', english: 'Ladakh', hindi: 'लद्दाख' },
  { slug: 'ld', english: 'Lakshadweep', hindi: 'लक्षद्वीप' },
  { slug: 'py', english: 'Puducherry', hindi: 'पुडुचेरी', aliases: ['pondicherry', 'puducherry'] },
];

export const INDIA_STATE_OPTIONS: IndianStateVisualRow[] = STATE_VISUALS;

function normalizeStateLookupKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isStateExamLevel1(level1: string): boolean {
  const key = normalizeStateLookupKey(level1);
  if (!key) return false;
  return key === 'state' || key === 'state exams' || key === 'state exam' || key.startsWith('state ');
}

function isRemoteIconKey(value: string): boolean {
  const v = String(value || '').trim().toLowerCase();
  return v.startsWith('http://') || v.startsWith('https://');
}

function parseStateSlugFromIconKey(iconKey: string): string {
  const raw = String(iconKey || '').trim().toLowerCase();
  if (raw.startsWith('state:')) return raw.slice(6).trim();
  if (/^[a-z]{2,3}$/.test(raw)) return raw;
  return '';
}

export function resolveIndianStateSlug(level2Label: string, iconKey = ''): string {
  const fromIcon = parseStateSlugFromIconKey(iconKey);
  if (fromIcon && STATE_VISUALS.some((s) => s.slug === fromIcon)) return fromIcon;

  const key = normalizeStateLookupKey(level2Label);
  if (!key) return '';

  for (const row of STATE_VISUALS) {
    const englishKey = normalizeStateLookupKey(row.english);
    const hindiKey = normalizeStateLookupKey(row.hindi);
    if (key === englishKey || key === hindiKey) return row.slug;
    if (key.startsWith(`${englishKey} `) || key.includes(` ${englishKey}`)) return row.slug;
    for (const alias of row.aliases || []) {
      const aliasKey = normalizeStateLookupKey(alias);
      if (key === aliasKey || key.startsWith(`${aliasKey} `) || key.includes(` ${aliasKey}`)) {
        return row.slug;
      }
    }
  }
  return '';
}

export function resolveAutoStateIconKey(level1: string, level2: string, iconKey = ''): string {
  const existing = String(iconKey || '').trim();
  if (existing && isRemoteIconKey(existing)) return existing;
  if (existing.startsWith('state:')) return existing;
  if (!isStateExamLevel1(level1)) return existing;
  const slug = resolveIndianStateSlug(level2, existing);
  return slug ? `state:${slug}` : existing;
}

export function findIndianStateVisual(level2Label: string, iconKey = '') {
  const slug = resolveIndianStateSlug(level2Label, iconKey);
  if (!slug) return null;
  const row = STATE_VISUALS.find((s) => s.slug === slug);
  if (!row) return null;
  return { ...row, iconKey: `state:${row.slug}` };
}
