import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Timestamp, collection, deleteDoc, doc, orderBy, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery } from '../firebase/firestore.utils';
import { AuthService } from './auth.service';
import { requireTenantId, tenantQuery, withTenant } from './tenant-data';
import { ExpenseCategory } from '../utils/finance';
import { stripUndefined } from './sales.service';

/** 'none' — no money moved (stock written off). */
export type ExpenseMethod = 'cash' | 'card' | 'bank' | 'none';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  /** When the money was spent (user-picked, defaults to today). */
  date: Date;
  method: ExpenseMethod;
  note?: string;
  /** Set when the cash was taken from the till of an open shift — a matching
   *  cashMovement (type "out") was written in the same batch. */
  shiftId?: string;
  cashMovementId?: string;
  createdBy: string;
  createdByName: string;
  createdAt?: Date;
}

export type ExpenseInput = Pick<Expense, 'category' | 'amount' | 'date' | 'method' | 'note'>;

/** Expenses (rent, salaries, utilities…) for the P&L. Staff-only (permission finance.manage). */
@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);

  /** Expenses dated within [from, to], newest first. */
  getExpenses(fromDate: Date, toDate: Date): Observable<Expense[]> {
    const q = tenantQuery(
      this.firestore,
      'expenses',
      requireTenantId(this.authService),
      where('date', '>=', Timestamp.fromDate(fromDate)),
      where('date', '<=', Timestamp.fromDate(toDate)),
      orderBy('date', 'desc')
    );
    return fromCollectionQuery<Expense>(q);
  }

  /**
   * Records an expense. With `fromShiftId` the cash is taken out of that open shift's
   * drawer: a cash movement is written in the same batch so the Z-report expects less cash.
   */
  addExpense(input: ExpenseInput, fromShiftId?: string): Observable<string> {
    const tenantId = requireTenantId(this.authService);
    const user = this.authService.getCurrentUser();
    const batch = writeBatch(this.firestore);
    const expenseRef = doc(collection(this.firestore, 'expenses'));
    let cashMovementId: string | undefined;

    if (fromShiftId) {
      const movementRef = doc(collection(this.firestore, 'cashMovements'));
      cashMovementId = movementRef.id;
      batch.set(
        movementRef,
        withTenant(
          stripUndefined({
            shiftId: fromShiftId,
            type: 'out',
            amount: input.amount,
            reason: 'expense',
            note: input.note || undefined,
            expenseId: expenseRef.id,
            cashierId: user?.uid ?? '',
            cashierName: user?.displayName ?? '',
            createdAt: serverTimestamp()
          }),
          tenantId
        )
      );
    }

    batch.set(
      expenseRef,
      withTenant(
        stripUndefined({
          ...input,
          note: input.note?.trim() || undefined,
          date: Timestamp.fromDate(input.date),
          shiftId: fromShiftId,
          cashMovementId,
          createdBy: user?.uid ?? '',
          createdByName: user?.displayName ?? '',
          createdAt: serverTimestamp()
        }),
        tenantId
      )
    );
    return from(batch.commit()).pipe(map(() => expenseRef.id));
  }

  /** Editing an expense taken from a till is limited to the note/category — the cash
   *  movement it created is immutable, so the amount must stay in step with it. */
  updateExpense(id: string, patch: Partial<ExpenseInput>): Observable<void> {
    const data: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
    if (patch.date) data['date'] = Timestamp.fromDate(patch.date);
    return from(updateDoc(doc(this.firestore, 'expenses', id), stripUndefined(data)));
  }

  deleteExpense(id: string): Observable<void> {
    return from(deleteDoc(doc(this.firestore, 'expenses', id)));
  }
}
