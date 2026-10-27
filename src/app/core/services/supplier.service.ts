import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  increment,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  WriteBatch,
  writeBatch
} from 'firebase/firestore';
import { commitOrQueue, stripUndefined } from './sales.service';
import { roundMoney } from '../utils/pos-math';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery, fromDocRef } from '../firebase/firestore.utils';
import { AuthService } from './auth.service';
import { requireTenantId, tenantQuery, withTenant } from './tenant-data';

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  contactPerson?: string;
  notes?: string;
  /** What the store owes this supplier right now (purchases on credit − payments). */
  balance?: number;
  createdAt?: Date;
}

export type SupplierPaymentMethod = 'cash' | 'card' | 'bank';

/** A purchase on credit or a payment (`supplierTransactions/{id}`), immutable. */
export interface SupplierTransaction {
  id: string;
  supplierId: string;
  type: 'purchase' | 'payment' | 'adjustment';
  /** purchase: invoice total; payment: amount paid. */
  amount: number;
  /** purchase: how much was paid on delivery. */
  paidNow?: number;
  /** Change of the balance this record caused (+ owed more, − owed less). */
  balanceChange: number;
  method?: SupplierPaymentMethod;
  invoiceNo?: string;
  dueDate?: Date | null;
  itemsCount?: number;
  /** Cash taken from this shift's drawer. */
  shiftId?: string;
  note?: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

export interface SupplierPaymentInput {
  supplierId: string;
  supplierName: string;
  amount: number;
  method: SupplierPaymentMethod;
  /** Cash from the current user's open till: also a cash-out of that drawer. */
  drawerShiftId?: string;
  note?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SupplierService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);

  getSuppliers(): Observable<Supplier[]> {
    const suppliersQuery = tenantQuery(this.firestore, 'suppliers', requireTenantId(this.authService), orderBy('name'));
    return fromCollectionQuery<Supplier>(suppliersQuery);
  }

  getSupplierById(id: string): Observable<Supplier | undefined> {
    return fromDocRef<Supplier>(doc(this.firestore, 'suppliers', id));
  }

  addSupplier(supplier: Omit<Supplier, 'id'>): Observable<string> {
    // Optional fields left unset must not reach Firestore as explicit `undefined` —
    // addDoc rejects that. Simplest for a new doc: drop them.
    const data: Record<string, unknown> = withTenant({ ...supplier, createdAt: serverTimestamp() }, requireTenantId(this.authService));
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) delete data[key];
    }
    return from(addDoc(collection(this.firestore, 'suppliers'), data)).pipe(map((ref) => ref.id));
  }

  updateSupplier(id: string, supplier: Partial<Supplier>): Observable<void> {
    // Here an explicit `undefined` (e.g. clearing a field in the edit form) means
    // "remove this field" — convert it to Firestore's deleteField() sentinel so the
    // old value actually gets cleared instead of being silently skipped.
    const data: Record<string, unknown> = { ...supplier };
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) data[key] = deleteField();
    }
    return from(updateDoc(doc(this.firestore, 'suppliers', id), data));
  }

  getTransactions(supplierId: string): Observable<SupplierTransaction[]> {
    const q = tenantQuery(this.firestore, 'supplierTransactions', requireTenantId(this.authService), where('supplierId', '==', supplierId));
    return fromCollectionQuery<SupplierTransaction>(q).pipe(
      map((list) => list.slice().sort((a, b) => (b.createdAt?.getTime?.() ?? Date.now()) - (a.createdAt?.getTime?.() ?? Date.now())))
    );
  }

  /**
   * Adds a received delivery to an existing write batch: a "purchase" record and the
   * unpaid part on the supplier's balance. Used by StockService.receiveGoods so the
   * stock, the invoice and the debt to the supplier commit together.
   */
  addPurchaseToWrite(
    wb: WriteBatch,
    input: { supplierId: string; total: number; paidNow: number; method?: SupplierPaymentMethod; invoiceNo?: string; dueDate?: Date | null; itemsCount: number; shiftId?: string; note?: string }
  ): void {
    const user = this.authService.getCurrentUser();
    const owed = roundMoney(input.total - input.paidNow);
    wb.set(
      doc(collection(this.firestore, 'supplierTransactions')),
      withTenant(
        stripUndefined({
          supplierId: input.supplierId,
          type: 'purchase',
          amount: roundMoney(input.total),
          paidNow: roundMoney(input.paidNow),
          balanceChange: owed,
          method: input.paidNow > 0 ? input.method : undefined,
          invoiceNo: input.invoiceNo?.trim() || undefined,
          dueDate: input.dueDate ?? null,
          itemsCount: input.itemsCount,
          shiftId: input.shiftId,
          note: input.note?.trim() || undefined,
          createdBy: user?.uid ?? '',
          createdByName: user?.displayName ?? '',
          createdAt: serverTimestamp()
        }),
        requireTenantId(this.authService)
      )
    );
    if (owed !== 0) {
      wb.update(doc(this.firestore, 'suppliers', input.supplierId), { balance: increment(owed) });
    }
  }

  /** Pays (part of) what the store owes; cash from the till also leaves that drawer. */
  pay(input: SupplierPaymentInput): Observable<void> {
    const tenantId = requireTenantId(this.authService);
    const user = this.authService.getCurrentUser();
    const amount = roundMoney(input.amount);
    const wb = writeBatch(this.firestore);
    const fromDrawer = input.method === 'cash' && !!input.drawerShiftId;
    wb.set(
      doc(collection(this.firestore, 'supplierTransactions')),
      withTenant(
        stripUndefined({
          supplierId: input.supplierId,
          type: 'payment',
          amount,
          balanceChange: -amount,
          method: input.method,
          shiftId: fromDrawer ? input.drawerShiftId : undefined,
          note: input.note?.trim() || undefined,
          createdBy: user?.uid ?? '',
          createdByName: user?.displayName ?? '',
          createdAt: serverTimestamp()
        }),
        tenantId
      )
    );
    wb.update(doc(this.firestore, 'suppliers', input.supplierId), { balance: increment(-amount) });
    if (fromDrawer) {
      wb.set(
        doc(collection(this.firestore, 'cashMovements')),
        withTenant(
          stripUndefined({
            shiftId: input.drawerShiftId,
            type: 'out',
            amount,
            reason: 'supplierPayment',
            note: input.supplierName,
            cashierId: user?.uid ?? '',
            cashierName: user?.displayName ?? '',
            createdAt: serverTimestamp()
          }),
          tenantId
        )
      );
    }
    return from(commitOrQueue(wb));
  }

  deleteSupplier(id: string): Observable<void> {
    return from(deleteDoc(doc(this.firestore, 'suppliers', id)));
  }
}
