import { describe, expect, it } from 'vitest';
import { validateAttributeRows, validateProductForm } from './product-form-validation';

const product = { name: 'Quvur', sku: 'Q-1', barcode: '2000000000008', price: 12000, cost: 10000, quantity: 5, mxikCode: null };
const variant = { sku: 'Q-2', barcode: '', values: ['25 mm'], price: 12000, cost: 10000, quantity: 0 };

describe('validateProductForm', () => {
  it('accepts a valid product with a variant', () => {
    expect(validateProductForm({ ...product, values: ['20 mm'] }, [variant], { requireCost: true, axes: ['Diametr'] })).toEqual({});
  });

  it('names the exact fields that are wrong', () => {
    const errors = validateProductForm(
      { ...product, name: ' ', cost: 0, quantity: -1, mxikCode: '123' },
      [{ ...variant, price: 0, quantity: -2 }],
      { requireCost: true }
    );
    expect(errors).toEqual({
      name: 'products.errRequired',
      cost: 'products.errCost',
      quantity: 'products.errQuantity',
      mxik: 'products.invalidMxik',
      'v0.price': 'products.errPrice',
      'v0.quantity': 'products.errQuantity'
    });
  });

  it('does not require cost from cashiers', () => {
    expect(validateProductForm({ ...product, cost: 0 }, [], { requireCost: false })).toEqual({});
  });

  it('marks duplicate codes inside the form and against the store', () => {
    expect(validateProductForm(product, [{ ...variant, barcode: '2000000000008' }], { requireCost: true }))
      .toEqual({ barcode: 'products.errDuplicate', 'v0.barcode': 'products.errDuplicate' });
    expect(validateProductForm(product, [], { requireCost: true, taken: [' q-1 '] }))
      .toEqual({ sku: 'products.errDuplicate' });
  });

  it('lets one product use its barcode as its SKU', () => {
    expect(validateProductForm({ ...product, sku: '2000000000008' }, [], { requireCost: true })).toEqual({});
  });
});

describe('variant characteristics', () => {
  it('needs a value on every row once there are variants', () => {
    expect(validateProductForm(product, [{ ...variant, values: [''] }], { requireCost: true, axes: ['Diametr'] }))
      .toEqual({ 'base.a0': 'products.errVariantValue', 'v0.a0': 'products.errVariantValue' });
  });

  it('rejects two rows with the same values and unnamed or repeated axes', () => {
    expect(validateProductForm({ ...product, values: ['80 L', 'vertikal'] }, [{ ...variant, values: ['80 l', 'Vertikal'] }],
      { requireCost: true, axes: ['Hajm', 'Shakl'] }))
      .toEqual({ 'v0.a0': 'products.errDuplicateVariant', 'v0.a1': 'products.errDuplicateVariant' });
    expect(validateProductForm(product, [], { requireCost: true, axes: ['', 'Hajm', 'hajm'] }))
      .toEqual({ axis0: 'products.errRequired', axis2: 'products.errDuplicateAxis' });
  });

  it('checks edit-form name/value rows', () => {
    expect(validateAttributeRows([{ name: 'Hajm', value: '' }, { name: '', value: '' }, { name: '', value: '5' }]))
      .toEqual({ 'attr0.value': 'products.errRequired', 'attr2.name': 'products.errRequired' });
  });
});
