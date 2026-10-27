import { describe, expect, it } from 'vitest';
import { applyTextKey } from './onscreen-keyboard.component';

describe('applyTextKey', () => {
  it('types Uzbek letters, spaces and deletes', () => {
    expect(["s", "o'", "y", "a"].reduce(applyTextKey, '')).toBe("so'ya");
    expect(applyTextKey('sut', 'space')).toBe('sut ');
    expect(applyTextKey('sut ', 'space')).toBe('sut ');
    expect(applyTextKey('', 'space')).toBe('');
    expect(applyTextKey('sut', '⌫')).toBe('su');
  });
});
