import { describe, expect, it } from 'vitest';
import { hasDuplicateProductIdentifiers } from './product-identifiers';

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
