/**
 * Deterministic Uzbek Cyrillic <-> Latin transliteration + search normalization.
 *
 * Uzbek is officially written in both Latin ("o'zbek tili") and Cyrillic
 * ("ўзбек тили") script, and — unlike free translation — the mapping between the two
 * is close to a fixed lookup table. That means a hand-written table here works
 * reliably for every product/customer/supplier name in the database, with zero
 * per-record data entry, and it keeps working automatically for names added in the
 * future (see plan item 13 — this deliberately replaces a per-product
 * `searchKeywords` approach, which would need perpetual manual upkeep).
 *
 * `normalizeForSearch` is the function actually used at match time: both the live
 * search query and each candidate's text are run through it before `.includes()`,
 * so a query typed in either script reliably matches a name stored in either script.
 */

/** Every apostrophe-like character real Uzbek Latin text uses for the o'/g' digraphs,
 *  depending on keyboard/font: straight quote, right single quote, and the two
 *  IPA modifier-letter apostrophes. */
const APOSTROPHES = ["'", '’', 'ʻ', 'ʼ', '`'];

/** Cyrillic (lowercase) -> Latin. Cyrillic has exactly one character per phoneme, so
 *  this direction needs no greedy scanning — multi-letter Latin results (sh, ch, ts,
 *  yo, yu, ya, o', g') simply fall out of the single-character lookup below. */
const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh',
  ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ғ: "g'", қ: 'q', ҳ: 'h', ў: "o'"
};

/** Latin (lowercase) two-letter digraphs -> Cyrillic. These MUST be checked before
 *  the single-character map in `toCyrillic`'s scanner, or a word like "shifokor"
 *  would be corrupted into с+ҳ+... instead of ш+... (the exact double-substitution
 *  bug a naive chain of `.replace()` calls would produce). o'/g' are handled
 *  separately below since the second "letter" is an apostrophe, not a fixed char. */
const LAT_DIGRAPHS: Record<string, string> = {
  sh: 'ш', ch: 'ч', yo: 'ё', yu: 'ю', ya: 'я', ts: 'ц'
};

const LAT_SINGLE: Record<string, string> = {
  a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж',
  k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с',
  t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з',
  // Bare "c" (outside the ch/ts digraphs) doesn't occur in standard Uzbek Latin
  // orthography; mapped as a best-effort fallback for stray loanword spellings.
  c: 'к'
};

function isApostrophe(ch: string | undefined): boolean {
  return !!ch && APOSTROPHES.includes(ch);
}

function isUpperCaseChar(ch: string): boolean {
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

/**
 * Latin -> Cyrillic, via a manual character-by-character scanner with lookahead
 * (NOT a chain of `.replace()` calls — chained replaces on independent single chars
 * is exactly how you'd accidentally corrupt an already-converted digraph, e.g.
 * replacing "s" and "h" separately would mangle a word that legitimately contains "sh").
 * At every position this greedily prefers the longest possible match: the o'/g'
 * digraph first (any apostrophe variant), then two-letter digraphs, then falls back
 * to a single character.
 */
export function toCyrillic(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const lower = ch.toLowerCase();
    const isUpper = isUpperCaseChar(ch);

    // Longest match: o' / g' (any apostrophe variant) -> ў / ғ.
    if ((lower === 'o' || lower === 'g') && isApostrophe(text[i + 1])) {
      const mapped = lower === 'o' ? 'ў' : 'ғ';
      result += isUpper ? mapped.toUpperCase() : mapped;
      i++; // consume the apostrophe too
      continue;
    }

    // Next-longest: two-letter digraphs (sh, ch, yo, yu, ya, ts) — checked BEFORE
    // the single-character fallback below.
    const two = lower + (text[i + 1] ?? '').toLowerCase();
    const digraph = LAT_DIGRAPHS[two];
    if (digraph) {
      result += isUpper ? digraph.toUpperCase() : digraph;
      i++;
      continue;
    }

    // Fallback: single character.
    const single = LAT_SINGLE[lower];
    if (single) {
      result += isUpper ? single.toUpperCase() : single;
    } else {
      result += ch; // punctuation, digits, spaces, already-Cyrillic text, etc.
    }
  }
  return result;
}

/** Cyrillic -> Latin. No greedy scanning needed (see `CYR_TO_LAT` doc comment) —
 *  Latin text passed in comes back unchanged, since none of its characters match
 *  the Cyrillic-only lookup table. That makes this function idempotent for
 *  already-Latin input, which `normalizeForSearch` relies on below. */
export function toLatin(text: string): string {
  let result = '';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const isUpper = ch !== lower;
    const mapped = CYR_TO_LAT[lower];
    if (mapped === undefined) {
      result += ch;
      continue;
    }
    if (!isUpper || mapped.length === 0) {
      result += mapped;
    } else if (mapped.length === 1) {
      result += mapped.toUpperCase();
    } else {
      // Multi-char result (e.g. ш -> sh): capitalize only the first letter, matching
      // standard transliteration convention (Шохрух -> Shohruh, not SHohruh).
      result += mapped[0].toUpperCase() + mapped.slice(1);
    }
  }
  return result;
}

/**
 * Normalizes arbitrary Uzbek text (Latin OR Cyrillic, any apostrophe variant) to one
 * canonical form for matching: lowercase, one canonical apostrophe, one canonical
 * script (Latin, per the plan). Both the live search query and every candidate's
 * name/text must be run through this before `.includes()` — that's what makes a
 * query typed in either script match a name stored in either script.
 */
export function normalizeForSearch(text: string): string {
  if (!text) return '';

  let normalized = text;
  // Canonicalize every apostrophe variant to a plain "'" FIRST, before lowercasing/
  // converting script — otherwise "o‘zbek" and "o'zbek" (same word, different
  // apostrophe glyph) would stay distinct strings even after both go through toLatin.
  for (const apostrophe of APOSTROPHES) {
    normalized = normalized.split(apostrophe).join("'");
  }

  normalized = normalized.toLowerCase();

  // Convert to the one canonical script. This is a no-op for text that's already
  // Latin (see `toLatin`'s doc comment), so it's safe to call unconditionally
  // regardless of which script the input was actually typed in.
  normalized = toLatin(normalized);

  return normalized;
}
