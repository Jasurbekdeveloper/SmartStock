import { describe, expect, it } from 'vitest';
import { applyNumpadKey } from './numpad.component';

describe('applyNumpadKey', () => {
  it('replaces a lone zero instead of appending to it', () => {
    expect(applyNumpadKey('0', '5')).toBe('5');
    expect(applyNumpadKey('', '0')).toBe('0');
    expect(applyNumpadKey('0', '0')).toBe('0');
  });
  it('types, deletes and clears', () => {
    expect(['1', '5', '0', '0', '0'].reduce((v, k) => applyNumpadKey(v, k), '')).toBe('15000');
    expect(applyNumpadKey('150', '⌫')).toBe('15');
    expect(applyNumpadKey('150', 'C')).toBe('');
  });
  it('allows one decimal separator when decimals are on', () => {
    expect(applyNumpadKey('', ',', { decimal: true })).toBe('0.');
    expect(applyNumpadKey('2.5', ',', { decimal: true })).toBe('2.5');
    expect(applyNumpadKey('2', ',', { decimal: false })).toBe('2');
    expect(applyNumpadKey('2.125', '7', { decimal: true })).toBe('2.125');
  });
});
