/**
 * User-facing nouns for the bookable resource of a shop vertical (bàn / phòng / sân).
 * Used by the POS table flows so a cafe never sees "phòng" and a hotel never sees "bàn".
 */
export type ResourceNouns = {
  /** lower case: "bàn", "phòng", "sân", "bàn/phòng" */
  noun: string;
  /** capitalized: "Bàn", "Phòng", "Sân", "Bàn/phòng" */
  Noun: string;
};

const NOUNS: Record<string, string> = {
  fnb: 'bàn',
  billiards: 'bàn',
  lodging: 'phòng',
  sports_court: 'sân',
};

const FALLBACK_NOUN = 'bàn/phòng';

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function getResourceNoun(vertical?: string | null): string {
  return (vertical && NOUNS[vertical]) || FALLBACK_NOUN;
}

export function getResourceNounCap(vertical?: string | null): string {
  return capitalize(getResourceNoun(vertical));
}

export function getResourceNouns(vertical?: string | null): ResourceNouns {
  const noun = getResourceNoun(vertical);
  return { noun, Noun: capitalize(noun) };
}

/**
 * Prefer the resource's own name ("Bàn 4", "P.203"); fall back to the vertical noun.
 * `capitalized` only affects the fallback.
 */
export function getResourceDisplayName(resource: { name?: string | null } | null | undefined, vertical?: string | null, capitalized = true): string {
  const name = resource?.name ? String(resource.name).trim() : '';
  if (name) return name;
  return capitalized ? getResourceNounCap(vertical) : getResourceNoun(vertical);
}
