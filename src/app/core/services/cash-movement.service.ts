import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Timestamp, addDoc, collection, endAt, orderBy, serverTimestamp, where } from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery } from '../firebase/firestore.utils';
import { AuthService } from './auth.service';
import { requireTenantId, tenantQuery, withTenant } from './tenant-data';
import { stripUndefined } from './sales.service';

/** Why cash entered or left the drawer outside a sale (labels: i18n `finance.reason.<id>`). */
export const CASH_IN_REASONS = ['float', 'debtPayment', 'other'] as const;
export const CASH_OUT_REASONS = ['collection', 'expense', 'supplierPayment', 'other'] as const;
export type CashReason = (typeof CASH_IN_REASONS)[number] | (typeof CASH_OUT_REASONS)[number];

export interface CashMovement {
  id: string;
  shiftId: string;
  type: 'in' | 'out';
  amount: number;
  reason: CashReason;
  note?: string;
  /** Set when the movement was created by an expense paid from the till. */
  expenseId?: string;
  cashierId: string;
  cashierName: string;
  createdAt: Date;
}

export type CashMovementInput = Pick<CashMovement, 'type' | 'amount' | 'reason' | 'note'>;

/** Cash put into / taken out of the drawer during a shift (float top-up, collection to
 *  the owner, small expenses). Immutable once written; counted in the shift's Z-report. */
@Injectable({ providedIn: 'root' })
export class CashMovementService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);

  add(shiftId: string, input: CashMovementInput): Observable<string> {
    const user = this.authService.getCurrentUser();
    return from(
      addDoc(
        collection(this.firestore, 'cashMovements'),
        withTenant(
          stripUndefined({
            ...input,
            note: input.note?.trim() || undefined,
            shiftId,
            cashierId: user?.uid ?? '',
            cashierName: user?.displayName ?? '',
            createdAt: serverTimestamp()
          }),
          requireTenantId(this.authService)
        )
      )
    ).pipe(map((ref) => ref.id));
  }

  /** Equality filters only — served by single-field indexes. A cashier's own shift only,
   *  so the cashierId filter keeps the query within what firestore.rules let them read. */
  getForShift(shiftId: string): Observable<CashMovement[]> {
    const user = this.authService.getCurrentUser();
    const own = user && !this.authService.can('shifts.viewAll') ? [where('cashierId', '==', user.uid)] : [];
    const q = tenantQuery(this.firestore, 'cashMovements', requireTenantId(this.authService), where('shiftId', '==', shiftId), ...own);
    return fromCollectionQuery<CashMovement>(q).pipe(
      map((list) => list.slice().sort((a, b) => (a.createdAt?.getTime?.() ?? Date.now()) - (b.createdAt?.getTime?.() ?? Date.now())))
    );
  }

  /** Every movement since `fromDate`, newest first (cash book; staff only). Cursor-based
   *  like SalesService.getSalesInRange so pending offline writes still show. */
  getSince(fromDate: Date): Observable<CashMovement[]> {
    const q = tenantQuery(
      this.firestore,
      'cashMovements',
      requireTenantId(this.authService),
      orderBy('createdAt', 'desc'),
      endAt(Timestamp.fromDate(fromDate))
    );
    return fromCollectionQuery<CashMovement>(q);
  }
}
