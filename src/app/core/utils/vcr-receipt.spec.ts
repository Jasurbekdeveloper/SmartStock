import { describe, expect, it } from 'vitest';
import { buildPartPayments, buildVcrPayments, buildVcrPositions, scaleVcrPositions, fiscalProblems, pickPackageForUnit, vcrBarcode, vcrQuantity, vcrVatValue } from './vcr-receipt';

const sut = { productId: 'p1', name: 'Sut 1L', barcode: '4780069000130', mxikCode: '00401001001000000', packageCode: '1500001', unit: 'dona' };

describe('VCR receipt', () => {
  it('converts money to tiyin, pieces to thousandths and VAT to x100', () => {
    const [p] = buildVcrPositions([{ ...sut, quantity: 2, paid: 22000, discount: 2000 }], 0.12);
    expect(p).toMatchObject({ amount: 2400000, discount: 200000, quantity: 2000, vat_value: 1200, icps: '00401001001000000', package_code: '1500001', barcode: '4780069000130' });
    expect(vcrVatValue(0)).toBe(-1);
    expect(vcrQuantity(1.25, 'kg')).toBe(1250);
    expect(vcrQuantity(250, 'g')).toBe(250);
  });

  it('puts every marked unit on its own position with its code', () => {
    const codes = ['0104780069000130215AAA\u001d93xx', '0104780069000130215BBB\u001d93yy', '0104780069000130215CCC\u001d93zz'];
    const ps = buildVcrPositions([{ ...sut, barcode: '', quantity: 3, paid: 10000, discount: 1, markingCodes: codes }], 0.12);
    expect(ps).toHaveLength(3);
    expect(ps.map((p) => p.label)).toEqual(codes);
    expect(ps.every((p) => p.quantity === 1000)).toBe(true);
    expect(ps.reduce((s, p) => s + p.amount - p.discount, 0)).toBe(1000000);
    expect(ps[0].barcode).toBe('4780069000130');
  });

  it('splits payments so they add up exactly', () => {
    const ps = buildVcrPositions([{ ...sut, quantity: 1, paid: 12345.67, discount: 0 }], 0.12);
    expect(buildVcrPayments(ps, 5000)).toEqual([{ type: 1, value: 734567 }, { type: 2, value: 500000 }]);
    expect(buildVcrPayments(ps, 0)).toEqual([{ type: 1, value: 1234567 }]);
    expect(buildVcrPayments(ps, 0, 'pay-1')).toEqual([{ type: 2, payment_id: 'pay-1' }]);
  });

  it('a debt sale only pays what was taken now', () => {
    expect(buildPartPayments(30000, 0)).toEqual([{ type: 1, value: 3000000 }]);
    expect(buildPartPayments(10000, 5000)).toEqual([{ type: 1, value: 1000000 }, { type: 2, value: 500000 }]);
    expect(buildPartPayments(0, 0)).toEqual([{ type: 1, value: 0 }]);
  });

  it('scales the sale goods to a debt repayment exactly, without marking codes', () => {
    const codes = ['0104780069000130215AAA\u001d93xx', '0104780069000130215BBB\u001d93yy'];
    const sale = buildVcrPositions(
      [
        { ...sut, quantity: 2, paid: 20000, discount: 0, markingCodes: codes },
        { ...sut, productId: 'p2', name: 'Non', quantity: 1, paid: 3333.33, discount: 500 }
      ],
      0.12
    );
    const credit = scaleVcrPositions(sale, 1000001);
    expect(credit.reduce((s, p) => s + p.amount, 0)).toBe(1000001);
    expect(credit.every((p) => p.discount === 0 && p.label === undefined)).toBe(true);
    expect(scaleVcrPositions(sale, 999999999).reduce((s, p) => s + p.amount, 0)).toBe(2333333);
    expect(scaleVcrPositions(sale, 0)).toEqual([]);
  });

  it('reports lines without MXIK or package', () => {
    expect(fiscalProblems([{ ...sut, mxikCode: null, quantity: 1, paid: 1, discount: 0 }])[0].key).toBe('fiscal.noMxik');
    expect(fiscalProblems([{ ...sut, packageCode: null, quantity: 1, paid: 1, discount: 0 }])[0].key).toBe('fiscal.noPackage');
    expect(vcrBarcode('123')).toBe('');
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
