import { describe, expect, it } from 'vitest';
import { GS, barcodeMatchesGtin, normalizeMarkingCode, parseMarkingCode } from './marking';

const WATER = `0104780069000130215Ab3dEfGh1JkLm${GS}93dGVz`;

describe('parseMarkingCode', () => {
  it('reads GTIN and serial from a code with the group separator', () => {
    const m = parseMarkingCode(WATER)!;
    expect(m.gtin).toBe('04780069000130');
    expect(m.serial).toBe('5Ab3dEfGh1JkLm');
    expect(m.code).toBe(WATER);
  });

  it('still recognises a code whose scanner dropped the separator', () => {
    const m = parseMarkingCode('0104780069000130215Ab3dEfGh1JkLm93dGVz')!;
    expect(m.gtin).toBe('04780069000130');
    expect(m.serial).toBeNull();
  });

  it('ignores ordinary barcodes and short strings', () => {
    expect(parseMarkingCode('4780069000130')).toBeNull();
    expect(parseMarkingCode('0104780069000130')).toBeNull();
    expect(parseMarkingCode('hello')).toBeNull();
  });

  it('undoes a Russian keyboard layout and a symbology prefix', () => {
    // "Ab" typed on ЙЦУКЕН comes out as "Фи"
    expect(normalizeMarkingCode(']d20104780069000130215Фи3')).toBe('0104780069000130215Ab3');
  });
});

describe('barcodeMatchesGtin', () => {
  it('matches EAN-13 and GTIN-14 forms of the same item', () => {
    expect(barcodeMatchesGtin('4780069000130', '04780069000130')).toBe(true);
    expect(barcodeMatchesGtin('04780069000130', '04780069000130')).toBe(true);
    expect(barcodeMatchesGtin('4780069000131', '04780069000130')).toBe(false);
    expect(barcodeMatchesGtin('', '04780069000130')).toBe(false);
  });
});
