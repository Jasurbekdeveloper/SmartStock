import { parseAltUnitsInput, formatAltUnitsForInput } from './alt-units-parser.util';

describe('alt-units-parser', () => {
  describe('parseAltUnitsInput', () => {
    it('parses a normal comma-separated unit:factor list', () => {
      expect(parseAltUnitsInput('quti:20,karobka:100')).toEqual([
        { unit: 'quti', factor: 20 },
        { unit: 'karobka', factor: 100 }
      ]);
    });

    it('trims whitespace around units, factors, and segments', () => {
      expect(parseAltUnitsInput(' quti : 20 , karobka : 100 ')).toEqual([
        { unit: 'quti', factor: 20 },
        { unit: 'karobka', factor: 100 }
      ]);
    });

    it('parses a single unit:factor pair with no comma', () => {
      expect(parseAltUnitsInput('quti:20')).toEqual([{ unit: 'quti', factor: 20 }]);
    });

    it('skips segments missing a colon', () => {
      expect(parseAltUnitsInput('quti20,karobka:100')).toEqual([{ unit: 'karobka', factor: 100 }]);
    });

    it('skips segments with a non-numeric factor', () => {
      expect(parseAltUnitsInput('quti:abc,karobka:100')).toEqual([{ unit: 'karobka', factor: 100 }]);
    });

    it('skips segments with a zero or negative factor', () => {
      expect(parseAltUnitsInput('quti:0,karobka:-5,rulon:10')).toEqual([{ unit: 'rulon', factor: 10 }]);
    });

    it('skips segments with an empty unit name', () => {
      expect(parseAltUnitsInput(':20,karobka:100')).toEqual([{ unit: 'karobka', factor: 100 }]);
    });

    it('skips empty segments produced by stray/trailing commas', () => {
      expect(parseAltUnitsInput('quti:20,,karobka:100,')).toEqual([
        { unit: 'quti', factor: 20 },
        { unit: 'karobka', factor: 100 }
      ]);
    });

    it('de-duplicates by unit name, last occurrence wins', () => {
      expect(parseAltUnitsInput('quti:20,quti:50')).toEqual([{ unit: 'quti', factor: 50 }]);
    });

    it('returns an empty array for an empty string', () => {
      expect(parseAltUnitsInput('')).toEqual([]);
    });

    it('returns an empty array for undefined-ish falsy input', () => {
      expect(parseAltUnitsInput(undefined as unknown as string)).toEqual([]);
    });

    it('returns an empty array when nothing parses', () => {
      expect(parseAltUnitsInput('garbage,,,:::')).toEqual([]);
    });
  });

  describe('formatAltUnitsForInput', () => {
    it('formats an alt-units array back into unit:factor,unit:factor form', () => {
      expect(
        formatAltUnitsForInput([
          { unit: 'quti', factor: 20 },
          { unit: 'karobka', factor: 100 }
        ])
      ).toBe('quti:20,karobka:100');
    });

    it('formats a single-entry array with no trailing comma', () => {
      expect(formatAltUnitsForInput([{ unit: 'quti', factor: 20 }])).toBe('quti:20');
    });

    it('returns an empty string for undefined', () => {
      expect(formatAltUnitsForInput(undefined)).toBe('');
    });

    it('returns an empty string for an empty array', () => {
      expect(formatAltUnitsForInput([])).toBe('');
    });
  });

  describe('round-trip', () => {
    it('format then parse reproduces the original array', () => {
      const original = [
        { unit: 'quti', factor: 20 },
        { unit: 'karobka', factor: 100 }
      ];
      expect(parseAltUnitsInput(formatAltUnitsForInput(original))).toEqual(original);
    });

    it('parse then format is stable (idempotent) for already-clean input', () => {
      const text = 'quti:20,karobka:100';
      expect(formatAltUnitsForInput(parseAltUnitsInput(text))).toBe(text);
    });
  });
});
