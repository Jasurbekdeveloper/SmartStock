import { Product } from '../services/product.service';
import { Debt } from '../services/debt.service';

/** Don't show the in-app toast about the same product/debt more than once within this
 *  window. (Telegram alerts are sent by the server's scheduled reports.) */
export const ALERT_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True if `product.quantity` has dropped to/below its configured `minQuantity`. */
export function isLowStock(product: Product): boolean {
  return !!product.minQuantity && product.quantity <= product.minQuantity;
}

/** True if `debt.dueDate` is set and has already passed, and there's still an
 *  outstanding balance (a debt that's fully paid off doesn't need a due-date nag). */
export function isOverdueDebt(debt: Debt): boolean {
  return !!debt.dueDate && new Date(debt.dueDate).getTime() < Date.now() && debt.remainingAmount > 0;
}

/** True if `lastSentAtIso` is missing, or older than `ALERT_DEDUP_WINDOW_MS`. */
function isOutsideDedupWindow(lastSentAtIso: string | null | undefined): boolean {
  if (!lastSentAtIso) return true;
  return Date.now() - new Date(lastSentAtIso).getTime() >= ALERT_DEDUP_WINDOW_MS;
}

/** localStorage key used to dedup the in-app toast for a given low-stock product —
 *  per-device on purpose: the toast is only ever seen on the device it fires on. */
export function lowStockToastStorageKey(productId: string): string {
  return `low_stock_notified_${productId}`;
}

/** localStorage key used to dedup the in-app toast for a given overdue debt. */
export function debtDueToastStorageKey(debtId: string): string {
  return `debt_due_notified_${debtId}`;
}

/** Reads a localStorage dedup timestamp and reports whether enough time has passed
 *  (or it was never set) to show the toast again. */
export function shouldShowToast(storageKey: string): boolean {
  const lastSentAtIso = localStorage.getItem(storageKey) ?? undefined;
  return isOutsideDedupWindow(lastSentAtIso);
}

/** Records "shown now" for a localStorage-backed toast dedup key. */
export function markToastShown(storageKey: string): void {
  localStorage.setItem(storageKey, new Date().toISOString());
}
