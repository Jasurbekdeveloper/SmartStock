import { describe, expect, it } from 'vitest';
import { cleanAltUnits, emptyExtras, extrasFromProduct, extrasToProductFields, fromDateInput, initialBatchFromExtras, validateExtras } from './product-extras';

describe('product extras', () => {
  it('round-trips a product', () => {
    const draft = extrasFromProduct({
      wholesalePrice: 9000,
      wholesaleMinQty: 12,
      altUnits: [{ unit: 'quti', factor: 12 }],
      expiryDate: new Date(2027, 2, 5),
      batchNo: 'L-77'
    });
    expect(draft.expiryDate).toBe('2027-03-05');
    expect(draft.trackExpiry).toBe(true);
    const fields = extrasToProductFields(draft, 'dona');
    // The old single date moves to a batch: the product keeps only the switch.
    expect(fields).toMatchObject({ wholesalePrice: 9000, wholesaleMinQty: 12, trackExpiry: true, expiryDate: null, batchNo: null });
    expect(initialBatchFromExtras(draft, 40, 9000)).toMatchObject({ quantity: 40, batchNo: 'L-77', costPrice: 9000 });
  });

  it('clears values so an edit can remove them', () => {
    expect(extrasToProductFields(emptyExtras())).toEqual({
      wholesalePrice: null,
      wholesaleMinQty: null,
      altUnits: undefined,
      trackExpiry: false,
      shelfLifeDays: null,
      expiryDate: null,
      batchNo: null
    });
  });

  it('drops a threshold without a wholesale price', () => {
    expect(extrasToProductFields({ ...emptyExtras(), wholesaleMinQty: 5 }).wholesaleMinQty).toBeNull();
  });

  it('cleans alternate units', () => {
    expect(
      cleanAltUnits(
        [
          { unit: ' quti ', factor: 20 },
          { unit: '', factor: 5 },
          { unit: 'blok', factor: 0 },
          { unit: 'dona', factor: 1 },
          { unit: 'quti', factor: 24 }
        ],
        'dona'
      )
    ).toEqual([{ unit: 'quti', factor: 24 }]);
  });

  it('parses dates as local days', () => {
    expect(fromDateInput('2026-12-31')?.getDate()).toBe(31);
    expect(fromDateInput('31.12.2026')).toBeNull();
  });

  it('validates', () => {
    expect(validateExtras(emptyExtras())).toBeNull();
    expect(validateExtras({ ...emptyExtras(), altUnits: [{ unit: 'quti', factor: null }] })).toBe('products.invalidAltUnit');
    expect(validateExtras({ ...emptyExtras(), wholesalePrice: -1 })).toBe('products.invalidWholesale');
  });

  it('derives the expiry from manufacture date and shelf life', () => {
    const d = { ...emptyExtras(), trackExpiry: true, manufactureDate: '2026-10-20', shelfLifeDays: 10 };
    expect(initialBatchFromExtras(d, 5)?.expiryDate).toEqual(new Date(2026, 9, 30));
    expect(initialBatchFromExtras({ ...d, trackExpiry: false }, 5)).toBeUndefined();
    expect(initialBatchFromExtras(d, 0)).toBeUndefined();
  });

  it('requires a date for stock of a tracked product', () => {
    const d = { ...emptyExtras(), trackExpiry: true };
    expect(validateExtras(d, { batchQuantity: 10 })).toBe('products.expiryRequired');
    expect(validateExtras(d, { batchQuantity: 0 })).toBeNull();
    expect(validateExtras({ ...d, manufactureDate: '2026-10-20', expiryDate: '2026-10-01' }, { batchQuantity: 1 })).toBe('products.expiryBeforeManufacture');
  });
});
