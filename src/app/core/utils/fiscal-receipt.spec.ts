import { describe, expect, it } from 'vitest';
import { fiscalProblems, isFiscalQrUrl, legacyPositionToLine, pickPackageForUnit, toFiscalLines } from './fiscal-receipt';

const sut = { productId: 'p1', name: 'Sut 1L', barcode: '4780069000130', mxikCode: '00401001001000000', packageCode: '1500001', unit: 'dona' };

describe('Fiscal receipt lines', () => {
  it('converts money to tiyin and carries the VAT rate', () => {
    expect(toFiscalLines([{ ...sut, quantity: 2, paid: 12345.67, discount: 2000 }], 0.12)).toEqual([
      { ...sut, quantity: 2, paidTiyin: 1234567, discountTiyin: 200000, vatRate: 0.12 }
    ]);
  });

  it('never gives Firestore an undefined value', () => {
    const [line] = toFiscalLines([{ productId: 'p1', name: 'Non', quantity: 1, paid: 1, discount: -1, barcode: undefined, markingCodes: [] }], 0);
    expect(Object.values(line)).not.toContain(undefined);
    expect(line).not.toHaveProperty('markingCodes');
    expect(line.discountTiyin).toBe(0);
  });

  it('keeps the marking codes of marked goods', () => {
    const codes = ['0104780069000130215AAA\u001d93xx'];
    expect(toFiscalLines([{ ...sut, quantity: 1, paid: 1, discount: 0, markingCodes: codes }], 0)[0].markingCodes).toEqual(codes);
  });

  it('reads goods saved on a debt in the old VCR format', () => {
    expect(
      legacyPositionToLine({ name: 'Sut', barcode: '4780069000130', icps: '00401001001000000', package_code: '1500001', quantity: 2000, amount: 2400000, discount: 200000, vat_value: 1200, code: 'p1' })
    ).toEqual({ productId: 'p1', name: 'Sut', quantity: 2, paidTiyin: 2200000, discountTiyin: 200000, vatRate: 0.12, barcode: '4780069000130', mxikCode: '00401001001000000', packageCode: '1500001', unit: null });
    expect(legacyPositionToLine({ name: 'Non', barcode: '', icps: '1', package_code: '1', quantity: 250, amount: 1, discount: 0, vat_value: -1 })).toMatchObject({ productId: '', quantity: 0.25, vatRate: 0 });
  });

  it('tells a real receipt QR link from a hidden or mistyped one', () => {
    expect(isFiscalQrUrl('https://ofd.soliq.uz/check?t=TEST000001&r=187&c=20261030120000&s=123456789012')).toBe(true);
    expect(isFiscalQrUrl(' https://ofd.soliq.uz/check?t=1 ')).toBe(true);
    expect(isFiscalQrUrl('***')).toBe(false);
    expect(isFiscalQrUrl('')).toBe(false);
    expect(isFiscalQrUrl(null)).toBe(false);
    // What a scanner types while the keyboard layout is Russian.
    expect(isFiscalQrUrl('реезыЖ..щаю')).toBe(false);
  });

  it('reports lines without MXIK or package', () => {
    expect(fiscalProblems([{ ...sut, mxikCode: null, quantity: 1, paid: 1, discount: 0 }])[0].key).toBe('fiscal.noMxik');
    expect(fiscalProblems([{ ...sut, packageCode: null, quantity: 1, paid: 1, discount: 0 }])[0].key).toBe('fiscal.noPackage');
  });

  it('picks the package that matches the product unit', () => {
    const packages = [
      { code: '1', name: 'қоп (50 кг)', isUnit: false },
      { code: '2', name: 'килограмм', isUnit: false },
      { code: '3', name: 'дона', isUnit: true }
    ];
    expect(pickPackageForUnit(packages, 'kg')?.code).toBe('2');
    expect(pickPackageForUnit(packages, 'qop')?.code).toBe('1');
    expect(pickPackageForUnit(packages, 'litr')?.code).toBe('3');
    expect(pickPackageForUnit([], 'kg')).toBeNull();
  });
});
