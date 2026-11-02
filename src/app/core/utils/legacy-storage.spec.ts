import { describe, expect, it } from 'vitest';
import { RENAMED_STORAGE_KEYS, migrateLegacyStorage } from './legacy-storage';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k)
  };
}

describe('migrateLegacyStorage', () => {
  it('moves held carts and settings to the new keys', () => {
    const s = fakeStorage({ smartstock_pos_held_carts: '[{"id":"1"}]', smartstock_pos_view: 'list' });
    migrateLegacyStorage(s);
    expect(s.data.get('markethisob_pos_held_carts')).toBe('[{"id":"1"}]');
    expect(s.data.get('markethisob_pos_view')).toBe('list');
    expect(s.data.has('smartstock_pos_held_carts')).toBe(false);
    expect(s.data.has('smartstock_pos_view')).toBe(false);
  });

  it('keeps a value already stored under the new key', () => {
    const s = fakeStorage({ smartstock_pos_osk: '1', markethisob_pos_osk: '0' });
    migrateLegacyStorage(s);
    expect(s.data.get('markethisob_pos_osk')).toBe('0');
    expect(s.data.has('smartstock_pos_osk')).toBe(false);
  });

  it('does nothing when there is nothing to move, and survives blocked storage', () => {
    const s = fakeStorage();
    migrateLegacyStorage(s);
    expect(s.data.size).toBe(0);
    expect(() => migrateLegacyStorage({ getItem: () => { throw new Error('blocked'); }, setItem: () => {}, removeItem: () => {} })).not.toThrow();
  });

  it('maps every old key to a MarketHisob key', () => {
    for (const [oldKey, newKey] of Object.entries(RENAMED_STORAGE_KEYS)) {
      expect(oldKey.startsWith('smartstock_')).toBe(true);
      expect(newKey.startsWith('markethisob_')).toBe(true);
    }
  });
});
