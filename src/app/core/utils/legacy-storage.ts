/**
 * Browser-storage keys that carried the old product names (SmartStock) and their
 * MarketHisob replacements. Renaming a key alone would drop what's stored under it —
 * notably a cashier's held carts — so the value is moved once at startup.
 */
export const RENAMED_STORAGE_KEYS: Readonly<Record<string, string>> = {
  smartstock_pos_numpad: 'markethisob_pos_numpad',
  smartstock_pos_osk: 'markethisob_pos_osk',
  smartstock_pos_view: 'markethisob_pos_view',
  smartstock_pos_held_carts: 'markethisob_pos_held_carts',
  smartstock_quick_entry: 'markethisob_quick_entry'
};

/** Moves values from the old keys to the new ones; a value already under the new key wins. */
export function migrateLegacyStorage(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): void {
  try {
    for (const [oldKey, newKey] of Object.entries(RENAMED_STORAGE_KEYS)) {
      const value = storage.getItem(oldKey);
      if (value === null) continue;
      if (storage.getItem(newKey) === null) storage.setItem(newKey, value);
      storage.removeItem(oldKey);
    }
  } catch {
    // Storage blocked (private mode): nothing to migrate.
  }
}
