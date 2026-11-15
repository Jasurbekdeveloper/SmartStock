import { describe, expect, it } from 'vitest';
import { hashPin, isValidPin, newSalt } from './pin-hash';

describe('approval PIN hash', () => {
  it('accepts 4 to 8 digits only', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12345678')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });

  it('gives the same hash for the same PIN and salt, another for another PIN', async () => {
    const salt = newSalt();
    const a = await hashPin('4321', salt, 1000);
    expect(await hashPin('4321', salt, 1000)).toBe(a);
    expect(await hashPin('4322', salt, 1000)).not.toBe(a);
    expect(await hashPin('4321', newSalt(), 1000)).not.toBe(a);
  });
});
