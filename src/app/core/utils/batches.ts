import { daysUntilExpiry, expiryState, ExpiryState } from './price-tier';

/**
 * Stock batches (lots): one delivery of a product with its own dates and remaining
 * quantity. Used for any product with `trackExpiry` — dairy and meat in a grocery,
 * detergents in a household shop, cement / paint / sealant in a building-materials
 * store. Products without tracking (nails, tiles, rebar) never create batches and
 * none of this logic applies to them.
 */
export interface StockBatch {
  id: string;
  productId: string;
  /** Remaining quantity, in the product's primary unit. */
  quantity: number;
  /** Quantity received, for history. */
  initialQuantity: number;
  /** Best-before date. Required for a tracked product. */
  expiryDate: Date;
  manufactureDate?: Date | null;
  batchNo?: string | null;
  /** Purchase cost per unit of this delivery — what a write-off loses. */
  costPrice?: number;
  supplierId?: string | null;
  createdAt?: Date;
}

/** One slice of a sale line taken from a batch. Stored on the sale item, so a return
 *  can put the goods back into the batch they came from. */
export interface BatchAllocation {
  batchId: string;
  quantity: number;
}

export interface AllocationResult {
  allocations: BatchAllocation[];
  /** Quantity not covered by any batch (untracked older stock, or overselling). */
  unallocated: number;
  /** True when an expired batch had to be used. */
  usedExpired: boolean;
}

const EPS = 1e-9;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Best-before date from a manufacture date and a shelf life in days. */
export function expiryFromShelfLife(manufactureDate: Date | null | undefined, shelfLifeDays: number | null | undefined): Date | null {
  if (!manufactureDate || !shelfLifeDays || shelfLifeDays <= 0) return null;
  const d = new Date(manufactureDate);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Math.round(shelfLifeDays));
  return d;
}

/** Remaining batches, nearest expiry first (FEFO order). */
export function sortFefo(batches: StockBatch[]): StockBatch[] {
  return batches
    .filter((b) => b.quantity > EPS)
    .slice()
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
}

export function isExpired(batch: Pick<StockBatch, 'expiryDate'>, now = new Date()): boolean {
  return (daysUntilExpiry(batch.expiryDate, now) ?? 0) < 0;
}

/**
 * First-expired-first-out: takes `quantity` from the batches with the nearest
 * expiry. Expired batches are skipped unless `allowExpired` — a cashier must not
 * hand them out silently; a manager may, after confirming.
 */
export function allocateFefo(
  batches: StockBatch[],
  quantity: number,
  options: { allowExpired?: boolean; now?: Date } = {}
): AllocationResult {
  const now = options.now ?? new Date();
  let left = quantity;
  const allocations: BatchAllocation[] = [];
  let usedExpired = false;

  const ordered = sortFefo(batches);
  const fresh = ordered.filter((b) => !isExpired(b, now));
  const expired = options.allowExpired ? ordered.filter((b) => isExpired(b, now)) : [];

  for (const [list, expiredList] of [[fresh, false], [expired, true]] as const) {
    for (const b of list) {
      if (left <= EPS) break;
      const take = Math.min(b.quantity, left);
      allocations.push({ batchId: b.id, quantity: round3(take) });
      left = round3(left - take);
      if (expiredList) usedExpired = true;
    }
  }
  return { allocations, unallocated: Math.max(0, round3(left)), usedExpired };
}

/**
 * For a return of `quantity` units from a sale line: which batches get them back.
 * The most recently consumed slices are refilled first (last in, first out), and
 * never more than was taken from each batch.
 */
export function restoreAllocation(taken: BatchAllocation[] | undefined, quantity: number): BatchAllocation[] {
  if (!taken?.length) return [];
  let left = quantity;
  const out: BatchAllocation[] = [];
  for (const slice of taken.slice().reverse()) {
    if (left <= EPS) break;
    const give = Math.min(slice.quantity, left);
    out.push({ batchId: slice.batchId, quantity: round3(give) });
    left = round3(left - give);
  }
  return out;
}

/** `taken` minus slices already given back (by earlier returns), per batch. */
export function subtractAllocations(taken: BatchAllocation[] | undefined, given: BatchAllocation[]): BatchAllocation[] {
  const left = mergeAllocations([given]);
  const out: BatchAllocation[] = [];
  for (const slice of taken ?? []) {
    const back = Math.min(slice.quantity, left.get(slice.batchId) ?? 0);
    left.set(slice.batchId, round3((left.get(slice.batchId) ?? 0) - back));
    const rest = round3(slice.quantity - back);
    if (rest > EPS) out.push({ batchId: slice.batchId, quantity: rest });
  }
  return out;
}

/** Sums allocations per batch — a Firestore batch rejects two writes to one document. */
export function mergeAllocations(lists: (BatchAllocation[] | undefined)[]): Map<string, number> {
  const byBatch = new Map<string, number>();
  for (const list of lists) {
    for (const a of list ?? []) byBatch.set(a.batchId, round3((byBatch.get(a.batchId) ?? 0) + a.quantity));
  }
  return byBatch;
}

export interface ProductBatchSummary {
  /** Quantity in batches that are still good. */
  freshQty: number;
  expiredQty: number;
  /** Nearest expiry among remaining batches (expired ones included). */
  nearestExpiry: Date | null;
  state: ExpiryState;
}

/** Per-product rollup used by the POS tiles, product list and dashboard. */
export function summarizeBatches(batches: StockBatch[], warnDays = 30, now = new Date()): ProductBatchSummary {
  const remaining = sortFefo(batches);
  let freshQty = 0;
  let expiredQty = 0;
  for (const b of remaining) {
    if (isExpired(b, now)) expiredQty += b.quantity;
    else freshQty += b.quantity;
  }
  const nearestExpiry = remaining[0] ? new Date(remaining[0].expiryDate) : null;
  return {
    freshQty: round3(freshQty),
    expiredQty: round3(expiredQty),
    nearestExpiry,
    state: expiryState(nearestExpiry, warnDays, now)
  };
}

/** Groups batches by product id. */
export function batchesByProduct(batches: StockBatch[]): Map<string, StockBatch[]> {
  const map = new Map<string, StockBatch[]>();
  for (const b of batches) {
    const list = map.get(b.productId);
    if (list) list.push(b);
    else map.set(b.productId, [b]);
  }
  return map;
}

/**
 * Can a cashier sell this product right now? Blocked only when the product is
 * tracked, has expired stock, and nothing sellable is left: no fresh batch and no
 * untracked remainder (stock that existed before tracking was switched on).
 */
export function isBlockedExpired(productQty: number, summary: ProductBatchSummary | undefined): boolean {
  if (!summary || summary.expiredQty <= EPS) return false;
  const untracked = Math.max(0, productQty - summary.freshQty - summary.expiredQty);
  return summary.freshQty <= EPS && untracked <= EPS;
}

/**
 * Products needing attention: with expired stock, and with stock expiring within
 * `warnDays`. Batches count first; a product still dated the old way (one date on
 * the product) counts by that date until it is re-saved.
 */
export function expiryAttention(
  products: { id: string; quantity: number; expiryDate?: Date | null }[],
  batches: StockBatch[],
  warnDays = 30,
  now = new Date()
): { expired: Set<string>; expiring: Set<string> } {
  const expired = new Set<string>();
  const expiring = new Set<string>();
  const withBatches = new Set<string>();
  for (const b of batches) {
    if (b.quantity <= EPS) continue;
    withBatches.add(b.productId);
    const state = expiryState(b.expiryDate, warnDays, now);
    if (state === 'expired') expired.add(b.productId);
    else if (state === 'soon') expiring.add(b.productId);
  }
  for (const p of products) {
    if (withBatches.has(p.id) || p.quantity <= 0 || !p.expiryDate) continue;
    const state = expiryState(p.expiryDate, warnDays, now);
    if (state === 'expired') expired.add(p.id);
    else if (state === 'soon') expiring.add(p.id);
  }
  return { expired, expiring };
}
