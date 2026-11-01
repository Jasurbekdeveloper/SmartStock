import { describe, expect, it } from 'vitest';
import { barcodeFormatFor, buildLabelsHtml, clampCopies, totalLabels, withLabelDefaults } from './labels';

describe('barcodeFormatFor', () => {
  it('uses EAN for valid retail codes and Code 128 otherwise', () => {
    expect(barcodeFormatFor('4780069000130')).toBe('EAN13');
    expect(barcodeFormatFor('4780069000131')).toBe('CODE128');
    expect(barcodeFormatFor('96385074')).toBe('EAN8');
    expect(barcodeFormatFor('QT-001')).toBe('CODE128');
  });
});

describe('labels', () => {
  const opts = { storeName: 'Do\'kon', formatPrice: (n: number) => `${n} so'm`, barcodeSvg: (v: string) => `<svg data-v="${v}"></svg>` };

  it('prints each product as many times as asked', () => {
    const html = buildLabelsHtml(
      [{ name: 'Sut', barcode: '111', price: 12000, copies: 3 }, { name: 'Non', barcode: '222', price: 5000, copies: 2 }],
      withLabelDefaults(null),
      opts
    );
    expect(html.match(/data-v="111"/g)).toHaveLength(3);
    expect(html.match(/data-v="222"/g)).toHaveLength(2);
    expect(html).toContain('12000 so');
  });

  it('can leave the price and name off', () => {
    const html = buildLabelsHtml([{ name: 'Sut <b>', barcode: '111', price: 12000, copies: 1 }], withLabelDefaults({ showPrice: false, showName: false }), opts);
    expect(html).not.toContain('12000');
    expect(html).not.toContain('Sut');
  });

  it('escapes names and clamps copies', () => {
    const html = buildLabelsHtml([{ name: 'A<script>', barcode: '1', copies: 1 }], withLabelDefaults(null), opts);
    expect(html).toContain('A&lt;script&gt;');
    expect(clampCopies(-3)).toBe(0);
    expect(clampCopies('7.9')).toBe(7);
    expect(clampCopies(99999)).toBe(500);
    expect(totalLabels([{ name: 'a', barcode: '1', copies: 2 }, { name: 'b', barcode: '2', copies: 4 }])).toBe(6);
  });
});
