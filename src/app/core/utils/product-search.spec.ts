import { describe, expect, it } from 'vitest';
import { findByCode, searchProducts } from './product-search';

const products = [
  { id: '1', name: 'Qurt', barcode: '4780105770041', sku: '4780105770041' },
  { id: '2', name: "O'zbek choyi", barcode: '4780000000017', searchKeywords: ['чой'] },
  { id: '3', name: 'Sement M400', barcode: '2000000000015', sku: 'CEM-M400' }
];

describe('product search', () => {
  it('finds a scanned barcode or SKU exactly', () => {
    expect(findByCode(products, ' 4780105770041 ')?.id).toBe('1');
    expect(findByCode(products, 'CEM-M400')?.id).toBe('3');
    expect(findByCode(products, '123')).toBeUndefined();
  });

  it('matches names and keywords in either script', () => {
    expect(searchProducts(products, 'qurt').map((p) => p.id)).toEqual(['1']);
    expect(searchProducts(products, 'чой').map((p) => p.id)).toEqual(['2']);
    expect(searchProducts(products, 'ўзбек').map((p) => p.id)).toEqual(['2']);
  });

  it('matches the start of a barcode or SKU', () => {
    expect(searchProducts(products, '4780').map((p) => p.id)).toEqual(['1', '2']);
    expect(searchProducts(products, 'cem').map((p) => p.id)).toEqual(['3']);
  });

  it('puts the exact code first and returns nothing for an empty query', () => {
    expect(searchProducts(products, '4780000000017')[0].id).toBe('2');
    expect(searchProducts(products, '  ')).toEqual([]);
  });
});

describe('package barcodes', () => {
  it('finds the product of a box barcode', () => {
    const list = [{ id: 'p1', name: 'Cola 0.5', barcode: '111', altUnits: [{ unit: 'quti', factor: 12, barcode: '999' }] }];
    expect(findByCode(list, '999')?.id).toBe('p1');
  });
});
