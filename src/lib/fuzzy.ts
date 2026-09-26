/**
 * Tiny fuzzy matcher for the command palette and settings search.
 *
 * A query is split into words; every word must match the title or a keyword (as a
 * case-insensitive subsequence) or the subtitle (as a substring). Matches score higher
 * when they are contiguous, start at word boundaries or at the very start of the text,
 * so "nap" prefers "Take a *nap*" over "tur*n* on *a*... *p*", and "rwi" finds
 * "*R*oam *w*hen *i*dle".
 */

export interface Match {
  score: number;
  /** Indices into the matched text, ascending. */
  indices: number[];
}

export interface SearchFields {
  title: string;
  subtitle?: string;
  keywords?: readonly string[];
}

export interface Ranked<T> {
  item: T;
  score: number;
  /** Matched indices into the title (for highlighting). */
  indices: number[];
}

// Contiguity dominates so "treat" finds "Give a treat" before "Turn off react to clicks";
// word starts still make acronyms like "rwi" -> "Roam when idle" work.
const SCORE = {
  char: 1,
  contiguous: 5,
  wordStart: 4,
  prefix: 4,
  /** Per unmatched char between the first and last match. */
  spread: 1,
} as const;

/** How much a match in each field counts relative to a title match. */
const FIELD_WEIGHT = { title: 1, keywords: 0.75, subtitle: 0.5 } as const;

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);
const isWordStart = (text: string, i: number) => i === 0 || (!isWordChar(text[i - 1]) && isWordChar(text[i]));

/** Greedy subsequence walk; `smart` jumps ahead to word starts when not continuing a run. */
function walk(q: string, t: string, text: string, smart: boolean): number[] | null {
  const indices: number[] = [];
  let pos = 0;
  for (const ch of q) {
    let found = -1;
    const prev = indices[indices.length - 1];
    if (smart && prev !== undefined && t[prev + 1] === ch) {
      found = prev + 1;
    } else if (smart) {
      for (let i = pos; i < t.length; i++) {
        if (t[i] === ch && isWordStart(text, i)) {
          found = i;
          break;
        }
      }
    }
    if (found === -1) found = t.indexOf(ch, pos);
    if (found === -1) return null;
    indices.push(found);
    pos = found + 1;
  }
  return indices;
}

/** Longest jump allowed into the middle of a word (tolerates a dropped letter or two). */
const MAX_MIDWORD_GAP = 2;

/**
 * Reject scattered matches like "idle" in "H*id*e during fu*l*lscr*e*en": after the first
 * run, every new run must start a word or follow closely.
 */
function isPlausible(text: string, indices: number[]): boolean {
  for (let n = 1; n < indices.length; n++) {
    const gap = indices[n] - indices[n - 1] - 1;
    if (gap > MAX_MIDWORD_GAP && !isWordStart(text, indices[n])) return false;
  }
  return true;
}

function scoreIndices(text: string, indices: number[]): number {
  let score = 0;
  indices.forEach((i, n) => {
    score += SCORE.char;
    if (n > 0 && indices[n - 1] === i - 1) score += SCORE.contiguous;
    if (isWordStart(text, i)) score += SCORE.wordStart;
  });
  if (indices[0] === 0) score += SCORE.prefix;
  const spread = indices[indices.length - 1] - indices[0] + 1 - indices.length;
  return score - spread * SCORE.spread;
}

/**
 * Match a single word (no whitespace handling) against `text`. With `contiguous`, only
 * real substrings count (used for long prose, where subsequences match almost anything).
 */
export function fuzzyMatch(query: string, text: string, contiguous = false): Match | null {
  const q = query.toLowerCase();
  if (!q) return { score: 0, indices: [] };
  const t = text.toLowerCase();

  // Candidates: every substring occurrence, then a smart walk and a plain walk.
  const candidates: number[][] = [];
  for (let at = t.indexOf(q); at !== -1; at = t.indexOf(q, at + 1)) {
    candidates.push(Array.from({ length: q.length }, (_, k) => at + k));
  }
  for (const smart of contiguous ? [] : [true, false]) {
    const found = walk(q, t, text, smart);
    if (found && isPlausible(text, found)) candidates.push(found);
  }
  let best: Match | null = null;
  for (const indices of candidates) {
    const score = scoreIndices(text, indices);
    if (!best || score > best.score) best = { score, indices };
  }
  return best;
}

export function queryWords(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

/**
 * Score a multi-word query against a record's fields. Every word must match somewhere.
 * Returns the summed score plus title indices for highlighting, or null.
 */
export function scoreFields(query: string, fields: SearchFields): Match | null {
  const words = queryWords(query);
  if (words.length === 0) return { score: 0, indices: [] };
  let total = 0;
  const titleIndices = new Set<number>();
  for (const word of words) {
    const title = fuzzyMatch(word, fields.title);
    let best = title ? title.score * FIELD_WEIGHT.title : -Infinity;
    for (const keyword of fields.keywords ?? []) {
      const m = fuzzyMatch(word, keyword);
      if (m) best = Math.max(best, m.score * FIELD_WEIGHT.keywords);
    }
    const sub = fields.subtitle ? fuzzyMatch(word, fields.subtitle, true) : null;
    if (sub) best = Math.max(best, sub.score * FIELD_WEIGHT.subtitle);
    if (best === -Infinity) return null;
    // Highlight the title whenever the word matches there, even if a keyword scored higher.
    title?.indices.forEach((i) => titleIndices.add(i));
    total += best;
  }
  return { score: total, indices: [...titleIndices].sort((a, b) => a - b) };
}

/**
 * Filter and rank items (best first; ties keep their original order). An empty query
 * returns every item unranked.
 */
export function fuzzyFilter<T>(query: string, items: readonly T[], fieldsOf: (item: T) => SearchFields): Ranked<T>[] {
  const ranked: Ranked<T>[] = [];
  for (const item of items) {
    const m = scoreFields(query, fieldsOf(item));
    if (m) ranked.push({ item, score: m.score, indices: m.indices });
  }
  // Array.prototype.sort is stable, so equal scores keep roster/definition order.
  return ranked.sort((a, b) => b.score - a.score);
}

export interface Segment {
  text: string;
  match: boolean;
}

/** Split `text` into runs of matched / unmatched characters for rendering highlights. */
export function highlightSegments(text: string, indices: readonly number[]): Segment[] {
  if (indices.length === 0) return text ? [{ text, match: false }] : [];
  const hit = new Set(indices);
  const segments: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const match = hit.has(i);
    const last = segments[segments.length - 1];
    if (last && last.match === match) last.text += text[i];
    else segments.push({ text: text[i], match });
  }
  return segments;
}
