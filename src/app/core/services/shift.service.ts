import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery, fromDocRef } from '../firebase/firestore.utils';
import { Sale, SaleReturn, SalesService, saleCardIn, saleCashIn } from './sales.service';
import { roundMoney } from '../utils/pos-math';
import { AuthService } from './auth.service';
import { CashMovement, CashMovementService } from './cash-movement.service';
import { requireTenantId, tenantQuery, withTenant } from './tenant-data';

export interface Shift {
  id: string;
  cashierId: string;
  cashierName: string;
  startingCash: number;
  status: 'open' | 'closed';
  openedAt: Date;
  closedAt?: Date;
  expectedCash?: number;
  countedCash?: number;
  variance?: number;
  salesCount?: number;
  totalRevenue?: number;
  cashTotal?: number;
  cardTotal?: number;
  refundTotal?: number;
  /** Cash put into / taken out of the drawer outside sales (see CashMovementService). */
  cashInTotal?: number;
  cashOutTotal?: number;
  notes?: string;
}

/** Z-report figures for one shift — shared by the live close screen and closeShift(). */
export interface ShiftTotals {
  salesCount: number;
  /** Revenue net of refunds. */
  totalRevenue: number;
  cashTotal: number;
  cardTotal: number;
  debtTotal: number;
  refundTotal: number;
  cashRefunds: number;
  /** Cash added to / removed from the drawer outside sales (float, collection, expenses). */
  cashIn: number;
  cashOut: number;
  /** Net cash movement in the drawer: cash kept from sales − cash refunds + cash in − cash out. */
  cashDrawerDelta: number;
}

export function computeShiftTotals(sales: Sale[], returns: SaleReturn[], movements: CashMovement[] = []): ShiftTotals {
  const sum = <T>(list: T[], pick: (x: T) => number) => roundMoney(list.reduce((s, x) => s + pick(x), 0));
  const cashTotal = sum(sales, saleCashIn);
  const cashRefunds = sum(
    returns.filter((r) => r.refundMethod === 'cash'),
    (r) => r.refundAmount
  );
  const refundTotal = sum(returns, (r) => r.refundAmount);
  const cashIn = sum(movements.filter((m) => m.type === 'in'), (m) => m.amount);
  const cashOut = sum(movements.filter((m) => m.type === 'out'), (m) => m.amount);
  return {
    salesCount: sales.length,
    totalRevenue: roundMoney(sum(sales, (s) => s.total) - refundTotal),
    cashTotal,
    cardTotal: sum(sales, saleCardIn),
    debtTotal: sum(sales, (s) => s.debtAmount ?? 0),
    refundTotal,
    cashRefunds,
    cashIn,
    cashOut,
    cashDrawerDelta: roundMoney(cashTotal - cashRefunds + cashIn - cashOut)
  };
}

@Injectable({
  providedIn: 'root'
})
export class ShiftService {
  private firestore = inject(FIRESTORE);
  private salesService = inject(SalesService);
  private authService = inject(AuthService);
  private cashMovements = inject(CashMovementService);

  /** Opens a new shift for the given cashier, starting with the cash float they counted into the drawer. */
  openShift(cashierId: string, cashierName: string, startingCash: number): Observable<string> {
    return from(
      addDoc(collection(this.firestore, 'shifts'), withTenant({
        cashierId,
        cashierName,
        startingCash,
        status: 'open',
        openedAt: serverTimestamp()
      }, requireTenantId(this.authService)))
    ).pipe(map((ref) => ref.id));
  }

  /**
   * Closes the shift: pulls every sale and return linked to it, adds the net cash
   * drawer movement (cash kept from sales minus cash refunds, plus cash put in, minus
   * cash taken out) to the starting float
   * to get `expectedCash`, then records the cashier's physical count and the variance
   * between the two (positive = surplus, negative = shortage).
   */
  closeShift(shiftId: string, countedCash: number): Observable<void> {
    return forkJoin({
      shiftSnap: from(getDoc(doc(this.firestore, 'shifts', shiftId))),
      sales: this.getShiftSales(shiftId).pipe(take(1)),
      returns: this.salesService.getReturnsForShift(shiftId).pipe(take(1)),
      movements: this.cashMovements.getForShift(shiftId).pipe(take(1))
    }).pipe(
      switchMap(({ shiftSnap, sales, returns, movements }) => {
        const startingCash = (shiftSnap.data()?.['startingCash'] as number) ?? 0;
        const totals = computeShiftTotals(sales, returns, movements);
        const expectedCash = roundMoney(startingCash + totals.cashDrawerDelta);
        const variance = roundMoney(countedCash - expectedCash);
        const { salesCount, totalRevenue, cashTotal, cardTotal, refundTotal, cashIn, cashOut } = totals;

        return from(
          updateDoc(doc(this.firestore, 'shifts', shiftId), {
            status: 'closed',
            closedAt: serverTimestamp(),
            expectedCash,
            countedCash,
            variance,
            salesCount,
            totalRevenue,
            cashTotal,
            cardTotal,
            refundTotal,
            cashInTotal: cashIn,
            cashOutTotal: cashOut
          })
        );
      })
    );
  }

  /** The cashier's currently open shift, if any — drives the POS soft-enforcement banner. */
  getOpenShiftForUser(uid: string): Observable<Shift | undefined> {
    const openShiftQuery = query(
      collection(this.firestore, 'shifts'),
      where('tenantId', '==', requireTenantId(this.authService)),
      where('cashierId', '==', uid),
      where('status', '==', 'open')
    );
    return fromCollectionQuery<Shift>(openShiftQuery).pipe(map((shifts) => shifts[0]));
  }

  getShiftById(id: string): Observable<Shift | undefined> {
    return fromDocRef<Shift>(doc(this.firestore, 'shifts', id));
  }

  /**
   * All shifts for the history list. Cashiers only ever see their own Z-reports
   * (matches `firestore.rules`' per-cashier update restriction); admin/manager see
   * everyone's. Filtering by uid avoids requiring a composite (cashierId + openedAt)
   * index, so the sort for that branch happens client-side instead.
   */
  getShifts(uid: string, seeAll: boolean): Observable<Shift[]> {
    const shiftsCollection = collection(this.firestore, 'shifts');
    if (seeAll) {
      return fromCollectionQuery<Shift>(tenantQuery(this.firestore, 'shifts', requireTenantId(this.authService), orderBy('openedAt', 'desc')));
    }
    return fromCollectionQuery<Shift>(query(shiftsCollection, where('tenantId', '==', requireTenantId(this.authService)), where('cashierId', '==', uid))).pipe(
      map((shifts) => shifts.slice().sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime()))
    );
  }

  getShiftSales(shiftId: string): Observable<Sale[]> {
    if (!shiftId) return of([]);
    const salesQuery = tenantQuery(
      this.firestore, 'sales', requireTenantId(this.authService),
      where('shiftId', '==', shiftId), ...this.salesService.ownSalesOnly()
    );
    return fromCollectionQuery<Sale>(salesQuery);
  }
}
