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
import { Sale } from './sales.service';

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
  notes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ShiftService {
  private firestore = inject(FIRESTORE);

  /** Opens a new shift for the given cashier, starting with the cash float they counted into the drawer. */
  openShift(cashierId: string, cashierName: string, startingCash: number): Observable<string> {
    return from(
      addDoc(collection(this.firestore, 'shifts'), {
        cashierId,
        cashierName,
        startingCash,
        status: 'open',
        openedAt: serverTimestamp()
      })
    ).pipe(map((ref) => ref.id));
  }

  /**
   * Closes the shift: pulls every sale linked to it, nets out the cash-only drawer
   * movement (amount tendered minus change handed back) on top of the starting float
   * to get `expectedCash`, then records the cashier's physical count and the variance
   * between the two (positive = surplus, negative = shortage).
   */
  closeShift(shiftId: string, countedCash: number): Observable<void> {
    return forkJoin({
      shiftSnap: from(getDoc(doc(this.firestore, 'shifts', shiftId))),
      sales: this.getShiftSales(shiftId).pipe(take(1))
    }).pipe(
      switchMap(({ shiftSnap, sales }) => {
        const startingCash = (shiftSnap.data()?.['startingCash'] as number) ?? 0;
        const cashDrawerDelta = sales
          .filter((s) => s.paymentMethod === 'cash')
          .reduce((sum, s) => sum + (s.paidAmount - s.change), 0);
        const expectedCash = startingCash + cashDrawerDelta;
        const variance = countedCash - expectedCash;
        const salesCount = sales.length;
        const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);

        return from(
          updateDoc(doc(this.firestore, 'shifts', shiftId), {
            status: 'closed',
            closedAt: serverTimestamp(),
            expectedCash,
            countedCash,
            variance,
            salesCount,
            totalRevenue
          })
        );
      })
    );
  }

  /** The cashier's currently open shift, if any — drives the POS soft-enforcement banner. */
  getOpenShiftForUser(uid: string): Observable<Shift | undefined> {
    const openShiftQuery = query(
      collection(this.firestore, 'shifts'),
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
      return fromCollectionQuery<Shift>(query(shiftsCollection, orderBy('openedAt', 'desc')));
    }
    return fromCollectionQuery<Shift>(query(shiftsCollection, where('cashierId', '==', uid))).pipe(
      map((shifts) => shifts.slice().sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime()))
    );
  }

  getShiftSales(shiftId: string): Observable<Sale[]> {
    if (!shiftId) return of([]);
    const salesQuery = query(collection(this.firestore, 'sales'), where('shiftId', '==', shiftId));
    return fromCollectionQuery<Sale>(salesQuery);
  }
}
