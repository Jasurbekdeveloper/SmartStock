import { describe, expect, it } from 'vitest';
import { readMxikCell, readPackageCodeCell } from './product-excel-import.util';

describe('readMxikCell', () => {
  it('accepts a 17-digit text code, ignoring spaces and a leading apostrophe', () => {
    expect(readMxikCell('02202001001000000')).toEqual({ code: '02202001001000000' });
    expect(readMxikCell(' 022 0200 1001 000000 ')).toEqual({ code: '02202001001000000' });
    expect(readMxikCell("'02202001001000000")).toEqual({ code: '02202001001000000' });
  });

  it('leaves an empty cell empty', () => {
    expect(readMxikCell('')).toEqual({});
    expect(readMxikCell(undefined)).toEqual({});
    expect(readMxikCell('   ')).toEqual({});
  });

  it('refuses a numeric cell, which has already lost digits', () => {
    expect(readMxikCell(2202001001000000)).toEqual({ error: 'number' });
  });

  it('refuses a code that is not 17 digits', () => {
    expect(readMxikCell('1234')).toEqual({ error: 'format' });
    expect(readMxikCell('0220200100100000A')).toEqual({ error: 'format' });
  });
});

describe('readPackageCodeCell', () => {
  it('reads text and numeric cells', () => {
    expect(readPackageCodeCell('1501453')).toBe('1501453');
    expect(readPackageCodeCell(1501453)).toBe('1501453');
  });

  it('returns undefined for empty and null for non-digits', () => {
    expect(readPackageCodeCell('')).toBeUndefined();
    expect(readPackageCodeCell('dona')).toBeNull();
  });
});
