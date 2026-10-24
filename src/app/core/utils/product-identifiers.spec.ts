import { describe, expect, it } from 'vitest';
import { ean13CheckDigit, generateStoreBarcode, hasDuplicateProductIdentifiers, isValidMxikCode } from './product-identifiers';

describe('hasDuplicateProductIdentifiers', () => {
  it('allows one product to use its barcode as its SKU', () => {
    expect(hasDuplicateProductIdentifiers([{ sku: 'ABC-1', barcode: 'abc-1' }])).toBe(false);
  });

  it('detects repeated SKUs or barcodes across products regardless of case or whitespace', () => {
    expect(hasDuplicateProductIdentifiers([
      { sku: 'shirt-red-m', barcode: '10001' },
      { sku: ' SHIRT-RED-M ', barcode: '10002' }
    ])).toBe(true);
    expect(hasDuplicateProductIdentifiers([
      { sku: 'shirt-red-m', barcode: '10001' },
      { sku: 'shirt-red-l', barcode: ' 10001 ' }
    ])).toBe(true);
  });

  it('ignores empty identifiers', () => {
    expect(hasDuplicateProductIdentifiers([{ sku: '', barcode: '' }, {}])).toBe(false);
  });
});

describe('generateStoreBarcode', () => {
  it('computes the EAN-13 check digit', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1); // 4006381333931
  });

  it('returns a valid in-store EAN-13 that is not already taken', () => {
    const values = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const code = generateStoreBarcode(['2000000000008'], () => values[i++]);
    expect(code).toBe('2555555555553');
    expect(code).toMatch(/^2\d{12}$/);
    expect(Number(code[12])).toBe(ean13CheckDigit(code.slice(0, 12)));
  });
});

describe('isValidMxikCode', () => {
  it('accepts exactly 17 digits', () => {
    expect(isValidMxikCode('06901001001000000')).toBe(true);
    expect(isValidMxikCode('0690100100100000')).toBe(false);
    expect(isValidMxikCode('0690100100100000a')).toBe(false);
    expect(isValidMxikCode(null)).toBe(false);
  });
});
