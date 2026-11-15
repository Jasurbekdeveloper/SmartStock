import { describe, expect, it } from 'vitest';
import { storeFeatures } from './store-type';

describe('storeFeatures', () => {
  it('keeps everything on for older stores without a type', () => {
    expect(storeFeatures(undefined)).toEqual(storeFeatures('mixed'));
    expect(storeFeatures(undefined).expiry).toBe(true);
  });

  it('hides expiry handling in a building-materials store', () => {
    expect(storeFeatures('building')).toMatchObject({ expiry: false, blockExpired: false });
    expect(storeFeatures('grocery')).toMatchObject({ expiry: true, blockExpired: true });
  });
});
