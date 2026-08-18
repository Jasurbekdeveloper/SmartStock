import { toCyrillic, toLatin, normalizeForSearch } from './uzbek-transliteration';

describe('uzbek-transliteration', () => {
  describe('toCyrillic — basic mapping rules', () => {
    it('maps a simple single-character word (real word: salom = hello)', () => {
      expect(toCyrillic('salom')).toBe('салом');
    });

    it('maps each two-letter digraph directly (rule check, not a dictionary word)', () => {
      expect(toCyrillic('sh')).toBe('ш');
      expect(toCyrillic('ch')).toBe('ч');
      expect(toCyrillic('ts')).toBe('ц');
      expect(toCyrillic('yo')).toBe('ё');
      expect(toCyrillic('yu')).toBe('ю');
      expect(toCyrillic('ya')).toBe('я');
    });

    it('does NOT corrupt a word containing "sh" by substituting s and h independently (real word: shifokor = doctor)', () => {
      const result = toCyrillic('shifokor');
      expect(result).toBe('шифокор');
      // Explicitly guard against the double-substitution bug the plan calls out:
      // a naive chain of .replace('s','с').replace('h','ҳ') would produce "сҳ..."
      // instead of a single "ш".
      expect(result).not.toContain('сҳ');
    });

    it('handles "sh" in the middle of a word without corruption (real word: Toshkent)', () => {
      const result = toCyrillic('Toshkent');
      expect(result).toBe('Тошкент');
      expect(result).not.toContain('сҳ');
      expect(result).not.toContain('Сҳ');
    });
  });

  describe('toCyrillic — o\' / g\' apostrophe variants', () => {
    it('maps o\' with a straight quote (real word: bo\'yoq family not needed — using o\'zbek)', () => {
      expect(toCyrillic("o'zbek")).toBe('ўзбек');
    });

    it('maps o\' with a right single quote (U+2019)', () => {
      expect(toCyrillic('o’zbek')).toBe('ўзбек');
    });

    it('maps o\' with modifier letter turned comma (U+02BB)', () => {
      expect(toCyrillic('oʻzbek')).toBe('ўзбек');
    });

    it('maps o\' with modifier letter apostrophe (U+02BC)', () => {
      expect(toCyrillic('oʼzbek')).toBe('ўзбек');
    });

    it('maps g\' the same way across apostrophe variants (real word: bog\' = garden)', () => {
      expect(toCyrillic("bog'")).toBe('боғ');
      expect(toCyrillic('bog’')).toBe('боғ');
      expect(toCyrillic('bogʻ')).toBe('боғ');
    });
  });

  describe('toLatin — Cyrillic to Latin round trips', () => {
    it('round-trips simple words', () => {
      expect(toLatin('салом')).toBe('salom');
      expect(toLatin('шифокор')).toBe('shifokor');
    });

    it('round-trips a word with "ш" back to "sh" without corruption', () => {
      expect(toLatin('Тошкент')).toBe('Toshkent');
    });

    it('round-trips ў and ғ back to o\' and g\'', () => {
      expect(toLatin('ўзбек')).toBe("o'zbek");
      expect(toLatin('боғ')).toBe("bog'");
    });

    it('is idempotent / a no-op on text that is already Latin', () => {
      expect(toLatin('shifokor')).toBe('shifokor');
      expect(toLatin("bog'")).toBe("bog'");
    });
  });

  describe('normalizeForSearch', () => {
    it('lowercases and leaves already-normalized Latin text unchanged', () => {
      expect(normalizeForSearch('Shifokor')).toBe('shifokor');
    });

    it('converts Cyrillic input to canonical lowercase Latin', () => {
      expect(normalizeForSearch('Тошкент')).toBe('toshkent');
    });

    it('matches a query typed in Cyrillic against text stored in Latin', () => {
      const productNameLatin = "Bog' uchun mix"; // "Nails for the garden"
      const queryCyrillic = 'боғ';
      expect(normalizeForSearch(productNameLatin).includes(normalizeForSearch(queryCyrillic))).toBe(true);
    });

    it('matches a query typed in Latin against text stored in Cyrillic', () => {
      const productNameCyrillic = 'Шифокор бўлими учун'; // some product in a "doctor" category
      const queryLatin = 'shifokor';
      expect(normalizeForSearch(productNameCyrillic).includes(normalizeForSearch(queryLatin))).toBe(true);
    });

    it('treats every apostrophe variant for o\'/g\' as equivalent when matching', () => {
      const canonical = normalizeForSearch("o'zbek");
      expect(normalizeForSearch('o’zbek')).toBe(canonical);
      expect(normalizeForSearch('oʻzbek')).toBe(canonical);
      expect(normalizeForSearch('oʼzbek')).toBe(canonical);
      expect(normalizeForSearch('ўзбек')).toBe(canonical);
    });

    it('does not corrupt "sh" through the full normalize pipeline', () => {
      expect(normalizeForSearch('SHIFOKOR')).toBe('shifokor');
    });
  });
});
