import { Product } from '../services/product.service';
import { Debt } from '../services/debt.service';
import { NotificationState } from '../services/notification-state.service';

/** Don't re-alert about the same product/debt more than once within this window,
 *  whether that's the in-app toast (localStorage-backed) or the shared Telegram
 *  alert (Firestore-backed) — both dedup mechanisms use the same 24h window. */
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
function isOutsideDedupWindow(lastSentAtIso: string | undefined): boolean {
  if (!lastSentAtIso) return true;
  return Date.now() - new Date(lastSentAtIso).getTime() >= ALERT_DEDUP_WINDOW_MS;
}

/** Low-stock products that (a) are below their min quantity AND (b) haven't had a
 *  Telegram alert sent for them within the last 24h, per the shared Firestore
 *  `notificationState/telegram` doc. */
export function productsNeedingTelegramAlert(products: Product[], state: NotificationState): Product[] {
  return products.filter((p) => isLowStock(p) && isOutsideDedupWindow(state.lowStockLastSentAt?.[p.id]));
}

/** Overdue debts that haven't had a Telegram alert sent for them within the last 24h,
 *  per the shared Firestore `notificationState/telegram` doc. */
export function debtsNeedingTelegramAlert(debts: Debt[], state: NotificationState): Debt[] {
  return debts.filter((d) => isOverdueDebt(d) && isOutsideDedupWindow(state.debtDueLastSentAt?.[d.id]));
}

/** localStorage key used to dedup the in-app toast for a given low-stock product —
 *  inherently per-device, unlike the Firestore-backed Telegram dedup above, which is
 *  intentional: the in-app toast is only ever seen by whoever's device it fires on,
 *  so there's no cross-device spam problem to solve for it. */
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
