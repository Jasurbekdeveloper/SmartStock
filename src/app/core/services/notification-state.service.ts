import { Injectable, inject } from '@angular/core';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';

/**
 * `notificationState/telegram` — shared (cross-device/cross-cashier) dedup bookkeeping
 * for the Telegram low-stock/debt-due alert (11-band). Deliberately a one-shot
 * `getDoc`/`setDoc` pair, NOT a live subscription — this is only ever consulted right
 * before an imperative "should I send a Telegram message now?" decision, not rendered
 * anywhere, so a live listener would be pure overhead.
 *
 * Kept as its own collection (rather than writing a timestamp onto the `products`/
 * `debts` docs themselves) because `firestore.rules` restricts non-staff writes on
 * `products` to `['quantity','updatedAt']` only — piggybacking a notification
 * timestamp there would require loosening that rule for no real benefit.
 */
export interface NotificationState {
  /** productId -> ISO timestamp the low-stock Telegram alert was last sent for it. */
  lowStockLastSentAt?: Record<string, string>;
  /** debtId -> ISO timestamp the overdue-debt Telegram alert was last sent for it. */
  debtDueLastSentAt?: Record<string, string>;
}

const STATE_DOC_ID = 'telegram';

@Injectable({
  providedIn: 'root'
})
export class NotificationStateService {
  private firestore = inject(FIRESTORE);

  private stateRef() {
    return doc(this.firestore, 'notificationState', STATE_DOC_ID);
  }

  /** One-shot read (not a live subscription — see class doc). */
  async getState(): Promise<NotificationState> {
    const snap = await getDoc(this.stateRef());
    return snap.exists() ? (snap.data() as NotificationState) : {};
  }

  async markLowStockSent(productId: string): Promise<void> {
    await setDoc(
      this.stateRef(),
      { lowStockLastSentAt: { [productId]: new Date().toISOString() } },
      { merge: true }
    );
  }

  async markDebtDueSent(debtId: string): Promise<void> {
    await setDoc(
      this.stateRef(),
      { debtDueLastSentAt: { [debtId]: new Date().toISOString() } },
      { merge: true }
    );
  }
}
