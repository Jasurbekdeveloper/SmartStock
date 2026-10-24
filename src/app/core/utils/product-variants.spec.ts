import { describe, expect, it } from 'vitest';
import {
  attributeCombinations, legacyColorSize, parseAxisValues, presetExamples, toAttributes, variantLabel, variantSkuSuffix
} from './product-variants';

describe('product variants', () => {
  it('parses axis values without blanks or repeats', () => {
    expect(parseAxisValues(' 50 L, 80 L,, 50 l ')).toEqual(['50 L', '80 L']);
  });

  it('builds every combination of the axes', () => {
    expect(attributeCombinations([
      { name: 'Hajm', values: ['50 L', '80 L'] },
      { name: 'Shakl', values: ['vertikal', 'gorizontal'] }
    ])).toEqual([
      ['50 L', 'vertikal'], ['50 L', 'gorizontal'], ['80 L', 'vertikal'], ['80 L', 'gorizontal']
    ]);
    expect(attributeCombinations([{ name: 'Hajm', values: [] }])).toEqual([]);
  });

  it('makes a SKU suffix and a label', () => {
    expect(variantSkuSuffix(['80 L', 'вертикал'])).toBe('80L-VERTIKAL');
    expect(variantLabel({ attributes: toAttributes(['Hajm', 'Shakl'], ['80 L', '']) })).toBe('80 L');
    expect(variantLabel({ color: 'oq', size: 'XL' })).toBe('oq · XL');
  });

  it('maps Rang/O\'lcham to the legacy fields and knows preset examples', () => {
    expect(legacyColorSize([{ name: 'rang', value: 'oq' }, { name: 'Hajm', value: '5 L' }])).toEqual({ color: 'oq', size: undefined });
    expect(presetExamples('hajm')).toContain('80 L');
  });
});
