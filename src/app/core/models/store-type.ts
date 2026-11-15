/**
 * Kind of shop, chosen by the super admin. One app for every shop: the type only
 * switches defaults and hides sections a shop doesn't use. A store's own settings
 * (Settings → Till rules) still win over these defaults.
 */
export type StoreType = 'grocery' | 'building' | 'mixed';

export const STORE_TYPES: readonly StoreType[] = ['grocery', 'building', 'mixed'];

export interface StoreFeatures {
  /** Expiry dates, FEFO batches, the expiry page. */
  expiry: boolean;
  /** Expired goods are blocked at the till by default. */
  blockExpired: boolean;
  /** Wholesale price tier on the till. */
  wholesale: boolean;
}

const FEATURES: Record<StoreType, StoreFeatures> = {
  grocery: { expiry: true, blockExpired: true, wholesale: true },
  building: { expiry: false, blockExpired: false, wholesale: true },
  mixed: { expiry: true, blockExpired: true, wholesale: true }
};

/** Missing type (stores created before this existed) = mixed: everything on. */
export function storeFeatures(type: StoreType | null | undefined): StoreFeatures {
  return FEATURES[type ?? 'mixed'] ?? FEATURES.mixed;
}
