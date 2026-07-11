export function isAllIndiaExamLevel1(level1: string): boolean {
  const key = String(level1 || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!key) return false;
  return key === 'all india' || key.startsWith('all india ');
}

function isRemoteIconKey(value: string): boolean {
  const v = String(value || '').trim().toLowerCase();
  return v.startsWith('http://') || v.startsWith('https://');
}

const TESTS = [
  { slug: 'ssc-cgl', subLabel: 'SSC CGL', aliases: ['cgl'] },
  { slug: 'ibps-po', subLabel: 'IBPS PO', aliases: ['ibps po'] },
  { slug: 'rrb-ntpc', subLabel: 'RRB NTPC', aliases: ['ntpc'] },
  { slug: 'nda', subLabel: 'NDA', aliases: [] },
  { slug: 'upsc-cse', subLabel: 'UPSC CSE', aliases: ['cse'] },
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

function resolveTestSlug(level3: string, iconKey = ''): string {
  const raw = String(iconKey || '').trim().toLowerCase();
  if (raw.startsWith('allindia:')) return raw.slice(9).trim();
  const key = normalizeKey(level3);
  for (const row of TESTS) {
    if (key === normalizeKey(row.subLabel)) return row.slug;
    for (const alias of row.aliases) {
      if (key.includes(normalizeKey(alias))) return row.slug;
    }
  }
  return '';
}

export function resolveAutoAllIndiaIconKey(
  level1: string,
  level2: string,
  level3: string,
  iconKey = '',
): string {
  const existing = String(iconKey || '').trim();
  if (existing && isRemoteIconKey(existing)) return existing;
  if (existing.startsWith('allindia:')) return existing;
  if (!isAllIndiaExamLevel1(level1)) return existing;
  const slug = resolveTestSlug(level3, existing);
  return slug ? `allindia:${slug}` : existing;
}
