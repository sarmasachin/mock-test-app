import { isStateExamLevel1 } from './indianStateVisualCatalog';

const TESTS = [
  { slug: 'hp-gk-mix', subLabel: 'HP GK Full Mix', aliases: ['hp gk', 'hp gk mix'] },
  { slug: 'hp-tet', subLabel: 'HP TET', aliases: ['tet'] },
  { slug: 'hp-patwari', subLabel: 'HP Patwari', aliases: ['patwari'] },
  { slug: 'hp-police', subLabel: 'HP Police', aliases: ['constable'] },
  { slug: 'hpas', subLabel: 'HPAS (SDM/DSP)', aliases: ['hpas'] },
];

function normalizeKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRemoteIconKey(value: string): boolean {
  const v = String(value || '').trim().toLowerCase();
  return v.startsWith('http://') || v.startsWith('https://');
}

export function isHimachalStateLevel2(level2: string): boolean {
  const key = normalizeKey(level2);
  if (!key) return false;
  return key === 'himachal pradesh' || key === 'himachal' || key === 'hp' || key.includes('himachal');
}

function resolveTestSlug(level3: string, iconKey = ''): string {
  const raw = String(iconKey || '').trim().toLowerCase();
  if (raw.startsWith('hp:')) return raw.slice(3).trim();
  const key = normalizeKey(level3);
  for (const row of TESTS) {
    if (key === normalizeKey(row.subLabel)) return row.slug;
    for (const alias of row.aliases) {
      if (key.includes(normalizeKey(alias))) return row.slug;
    }
  }
  return '';
}

export function resolveAutoHimachalIconKey(
  level1: string,
  level2: string,
  level3: string,
  iconKey = '',
): string {
  const existing = String(iconKey || '').trim();
  if (existing && isRemoteIconKey(existing)) return existing;
  if (existing.startsWith('hp:')) return existing;
  if (!isStateExamLevel1(level1) || !isHimachalStateLevel2(level2)) return existing;
  const slug = resolveTestSlug(level3, existing);
  return slug ? `hp:${slug}` : existing;
}
