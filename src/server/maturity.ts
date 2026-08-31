/**
 * Content ratings normalized to one comparable scale.
 *
 * Providers hand back ratings from several systems (US movie, US TV, and a few
 * international boards). Comparing them as text is hopeless, so each known
 * rating maps to a maturity level: a small integer that only has to order
 * correctly. A member's limit is a level, and anything above it is hidden.
 */
export const MATURITY_LEVELS: Record<string, number> = {
  // US movie ratings
  G: 0, PG: 10, 'PG-13': 13, R: 17, 'NC-17': 18,
  // US TV ratings
  'TV-Y': 0, 'TV-Y7': 7, 'TV-G': 0, 'TV-PG': 10, 'TV-14': 14, 'TV-MA': 17,
  // Common international boards seen in TMDB data
  U: 0, UC: 0, '0': 0, '6': 6, '7': 7, '9': 9, '10': 10, '11': 11, '12': 12, '12A': 12,
  '13': 13, '14': 14, '15': 15, '16': 16, '18': 18, '18+': 18,
  A: 18, AA: 14, R18: 18, X: 18, M: 15, MA15: 15, 'MA 15+': 15, 'R18+': 18,
  BTL: 0, ATP: 0, PG13: 13,
};

/** The ladder offered in the admin UI, coarsest first. */
export const MATURITY_CHOICES: Array<{ level: number; label: string; description: string }> = [
  { level: 0, label: 'Little kids', description: 'G · TV-Y · TV-G' },
  { level: 7, label: 'Older kids', description: 'TV-Y7 and below' },
  { level: 10, label: 'Family', description: 'PG · TV-PG and below' },
  { level: 13, label: 'Teens', description: 'PG-13 and below' },
  { level: 14, label: 'Older teens', description: 'TV-14 and below' },
  { level: 17, label: 'Mature', description: 'R · TV-MA and below' },
];

/** Titles whose rating the provider never supplied. */
export const UNRATED_LEVEL = 99;

/**
 * Map a provider rating to a level. Unknown or missing ratings are treated as
 * unrated rather than as safe: a restricted account should not see a title just
 * because metadata is thin.
 */
export function maturityLevel(contentRating?: string | null): number {
  if (!contentRating) return UNRATED_LEVEL;
  const key = contentRating.trim().toUpperCase();
  if (key in MATURITY_LEVELS) return MATURITY_LEVELS[key];
  // "TV-14" style values sometimes arrive with a country prefix, e.g. "US:TV-14".
  const tail = key.includes(':') ? key.slice(key.lastIndexOf(':') + 1).trim() : undefined;
  if (tail && tail in MATURITY_LEVELS) return MATURITY_LEVELS[tail];
  // A bare age like "16" that is not in the table still orders correctly.
  const age = Number(key.replace(/[^0-9]/g, ''));
  return Number.isFinite(age) && age > 0 && age <= 21 ? age : UNRATED_LEVEL;
}

/** Human label for a limit, for the admin list and the member's own profile. */
export function maturityLabel(level: number | null | undefined): string {
  if (level == null) return 'No limit';
  const choice = MATURITY_CHOICES.find((entry) => entry.level === level);
  return choice ? `${choice.label} (${choice.description})` : `Level ${level}`;
}

/** Whether a viewer with `limit` may see an item at `level`. */
export function isVisibleAt(level: number, limit: number | null | undefined): boolean {
  if (limit == null) return true;
  return level <= limit;
}
