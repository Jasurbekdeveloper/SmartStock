import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, from } from 'rxjs';
import { doc, setDoc } from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromDocRef } from '../firebase/firestore.utils';

/** Supported thermal-printer roll widths, in millimeters. Mirrors receipt.component.ts. */
export type ReceiptPaperWidth = '58' | '80';

/**
 * `settings/general` — readable by ANY signed-in user (cashiers need VAT rate and
 * currency symbol at checkout in the POS), writable only by admin. Kept separate from
 * `settings/integrations` on purpose: bundling the Telegram bot token into a doc that
 * every cashier can read would leak it to non-admin roles.
 */
export interface GeneralSettings {
  vatRate: number;
  currencySymbol: string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeTaxId?: string;
  receiptPaperWidth: ReceiptPaperWidth;
}

/** `settings/integrations` — read AND write restricted to admin only (Telegram bot
 *  credentials), separate doc from `settings/general` for that reason. */
export interface IntegrationSettings {
  telegramBotToken?: string;
  telegramChatId?: string;
}

/** Fallbacks used everywhere until an admin has saved `settings/general` for the first
 *  time (a brand-new store's very first admin visit, before the doc exists at all). */
export const DEFAULT_VAT_RATE = 0.12;
export const DEFAULT_CURRENCY_SYMBOL = "so'm";
export const DEFAULT_STORE_NAME = 'SmartStock';
export const DEFAULT_RECEIPT_PAPER_WIDTH: ReceiptPaperWidth = '80';

/** `setDoc`, like `addDoc`, rejects explicit `undefined` values — optional fields left
 *  blank in the Settings form (e.g. store address) must simply be omitted rather than
 *  sent as `undefined`, so the merge write leaves any previously-saved value untouched. */
function stripUndefined<T extends Record<string, unknown>>(data: T): Partial<T> {
  const result: Partial<T> = { ...data };
  for (const key of Object.keys(result) as (keyof T)[]) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private firestore = inject(FIRESTORE);

  getGeneralSettings(): Observable<GeneralSettings | undefined> {
    return fromDocRef<GeneralSettings>(doc(this.firestore, 'settings', 'general'));
  }

  getIntegrationSettings(): Observable<IntegrationSettings | undefined> {
    return fromDocRef<IntegrationSettings>(doc(this.firestore, 'settings', 'integrations'));
  }

  /** `setDoc(..., {merge: true})` rather than `updateDoc` — the doc may not exist yet
   *  (first-ever admin visit to the Settings page), and `updateDoc` would reject that. */
  updateGeneralSettings(data: Partial<GeneralSettings>): Observable<void> {
    return from(setDoc(doc(this.firestore, 'settings', 'general'), stripUndefined(data), { merge: true }));
  }

  updateIntegrationSettings(data: Partial<IntegrationSettings>): Observable<void> {
    return from(setDoc(doc(this.firestore, 'settings', 'integrations'), stripUndefined(data), { merge: true }));
  }

  /** Live, app-wide read of `settings/general`, kept as a signal here (rather than only
   *  an Observable) so services/pipes that aren't components — e.g. `CurrencyDisplayPipe`
   *  — can synchronously read the latest value. `undefined` until the first snapshot
   *  arrives, or forever if the doc has never been saved. */
  private generalSettings = toSignal(this.getGeneralSettings(), { initialValue: undefined });

  /** Dynamic currency suffix used app-wide, falling back to "so'm" until Settings has
   *  been saved at least once. */
  currencySymbol = computed(() => this.generalSettings()?.currencySymbol || DEFAULT_CURRENCY_SYMBOL);

  vatRate = computed(() => this.generalSettings()?.vatRate ?? DEFAULT_VAT_RATE);
}
