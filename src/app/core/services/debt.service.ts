import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, from } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  addDoc,
  collection,
  doc,
  increment,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery, fromDocRef } from '../firebase/firestore.utils';
import { Customer } from './customer.service';
import { AuthService } from './auth.service';
import { requireTenantId, tenantQuery, withTenant } from './tenant-data';
import { commitOrQueue, stripUndefined } from './sales.service';
import { roundMoney } from '../utils/pos-math';
import { FiscalLine, LegacyVcrPosition, legacyPositionToLine, toTiyin } from '../utils/fiscal-receipt';
import { FiscalService } from './fiscal.service';
import { SettingsService } from './settings.service';

export type DebtPaymentMethod = 'cash' | 'card' | 'bank';

/** One payment against one debt (`debtPayments/{id}`), immutable. */
export interface DebtPayment {
  id: string;
  debtId: string;
  customerId: string;
  amount: number;
  method: DebtPaymentMethod;
  /** Shift the cash went into, when taken at a till. */
  shiftId?: string;
  cashMovementId?: string;
  /** Credit receipt (Receipt.Credit) the virtual cash register issued for this repayment. */
  fiscalCreditId?: string;
  cashierId: string;
  cashierName: string;
  note?: string;
  createdAt: Date;
}

export interface CollectPaymentInput {
  customerId: string;
  customerName?: string;
  amount: number;
  method: DebtPaymentMethod;
  /** Open shift of the current user: cash then goes into that drawer. */
  shiftId?: string;
  /** Pay one specific debt; otherwise oldest debts are paid first. */
  debtId?: string;
  note?: string;
}

export interface CollectPaymentResult {
  /** What was actually applied (never more than the customer owes). */
  applied: number;
  paidDebts: { debtId: string; amount: number }[];
}

/** Splits a payment over open debts, oldest first. Pure — unit tested. */
export function allocateDebtPayment(
  debts: Pick<Debt, 'id' | 'remainingAmount' | 'createdAt'>[],
  amount: number
): { debtId: string; amount: number }[] {
  let left = roundMoney(amount);
  const out: { debtId: string; amount: number }[] = [];
  const open = debts
    .filter((d) => d.remainingAmount > 0.005)
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const d of open) {
    if (left <= 0.005) break;
    const take = roundMoney(Math.min(d.remainingAmount, left));
    out.push({ debtId: d.id, amount: take });
    left = roundMoney(left - take);
  }
  return out;
}

// Customer now lives in customer.service.ts (its own CRUD module — see 5-band CRM
// plan); re-exported here so existing imports across pos/sale-detail/statistics/debt
// pages keep working unchanged.
export type { Customer } from './customer.service';

export interface DebtItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Debt {
  id: string;
  customerId: string;
  customer?: Customer;
  /** Set when this debt was opened from a POS sale's unpaid remainder. */
  saleId?: string;
  /** What was bought on credit, if this debt came from a POS sale. Manually
   * recorded debts (via the "add debt" form) have no items — that's fine. */
  items?: DebtItem[];
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  createdAt: Date;
  lastPaymentDate?: Date;
  notes?: string;
  /** Optional "pay by" date, set at debt creation. Used by the 11-band low-stock/debt-due
   *  alert check (dashboard) to flag debts that are now overdue. */
  dueDate?: Date;
  /** Set when the debt sale went to the tax office: its goods, for the credit receipt
   *  of every repayment. */
  /** `positions`: debts saved before the fiscal agent existed. */
  fiscalCredit?: { saleReceiptId: string; lines?: FiscalLine[]; positions?: LegacyVcrPosition[] };
}

@Injectable({
  providedIn: 'root'
})
export class DebtService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);
  private fiscal = inject(FiscalService);
  private settings = inject(SettingsService);
  /** Credit receipts of the repayment being taken, kept until that repayment is saved. */
  private pendingCredits: { key: string; codes: string[]; receiptIds: string[] } | null = null;

  getDebts(): Observable<Debt[]> {
    const debtsQuery = tenantQuery(this.firestore, 'debts', requireTenantId(this.authService), orderBy('createdAt', 'desc'));
    return fromCollectionQuery<Debt>(debtsQuery);
  }

  getDebtById(id: string): Observable<Debt | undefined> {
    return fromDocRef<Debt>(doc(this.firestore, 'debts', id));
  }

  getCustomerDebts(customerId: string): Observable<Debt[]> {
    const debtsQuery = query(
      collection(this.firestore, 'debts'),
      where('tenantId', '==', requireTenantId(this.authService)),
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc')
    );
    return fromCollectionQuery<Debt>(debtsQuery);
  }

  createDebt(debt: {
    customerId: string;
    totalAmount: number;
    notes?: string;
    dueDate?: Date;
  }): Observable<void> {
    const data: Record<string, unknown> = withTenant({
      customerId: debt.customerId,
      totalAmount: debt.totalAmount,
      paidAmount: 0,
      remainingAmount: debt.totalAmount,
      createdAt: serverTimestamp()
    }, requireTenantId(this.authService));
    if (debt.notes) data['notes'] = debt.notes;
    if (debt.dueDate) data['dueDate'] = debt.dueDate;

    return from(addDoc(collection(this.firestore, 'debts'), data)).pipe(map(() => undefined));
  }

  /** Payment history of one customer, newest first. */
  getCustomerPayments(customerId: string): Observable<DebtPayment[]> {
    const q = tenantQuery(this.firestore, 'debtPayments', requireTenantId(this.authService), where('customerId', '==', customerId));
    return fromCollectionQuery<DebtPayment>(q).pipe(
      map((list) => list.slice().sort((a, b) => (b.createdAt?.getTime?.() ?? Date.now()) - (a.createdAt?.getTime?.() ?? Date.now())))
    );
  }

  /** Pays one specific debt. */
  payDebt(debtId: string, amount: number, method: DebtPaymentMethod = 'cash', shiftId?: string): Observable<CollectPaymentResult> {
    return from(
      this.getDebtOnce(debtId).then((d) =>
        d ? this.collectPaymentAsync({ customerId: d.customerId, amount, method, shiftId, debtId }) : { applied: 0, paidDebts: [] }
      )
    );
  }

  /**
   * A customer pays off debt — at the till by a cashier, or in the back office.
   * One atomic write: each debt touched gets its paid/remaining amounts moved by an
   * increment and a `debtPayments` record; cash taken during an open shift also
   * becomes a "debt payment" cash-in of that drawer, so the Z-report and the drawer
   * total include it.
   */
  collectPayment(input: CollectPaymentInput): Observable<CollectPaymentResult> {
    return from(this.collectPaymentAsync(input));
  }

  private async getDebtOnce(id: string): Promise<Debt | undefined> {
    return firstValueFrom(this.getDebtById(id));
  }

  private async collectPaymentAsync(input: CollectPaymentInput): Promise<CollectPaymentResult> {
    const tenantId = requireTenantId(this.authService);
    const user = this.authService.getCurrentUser();
    const debts = input.debtId
      ? [await this.getDebtOnce(input.debtId)].filter((d): d is Debt => !!d)
      : await firstValueFrom(this.getCustomerDebts(input.customerId));
    const slices = allocateDebtPayment(debts, input.amount);
    const applied = roundMoney(slices.reduce((s, x) => s + x.amount, 0));
    if (applied <= 0) return { applied: 0, paidDebts: [] };

    const wb = writeBatch(this.firestore);
    const cashIntoDrawer = input.method === 'cash' && !!input.shiftId;
    const movementRef = cashIntoDrawer ? doc(collection(this.firestore, 'cashMovements')) : null;
    const paymentRefs = slices.map(() => doc(collection(this.firestore, 'debtPayments')));

    // Credit receipts go first: if the cash register refuses, nothing is recorded and
    // the cashier can retry. Bank transfers don't pass through the till.
    const creditIds = new Map<string, string>();
    const policy = this.settings.fiscalPolicy();
    if (this.fiscal.enabled() && policy.send && policy.sendDebt && input.method !== 'bank') {
      // A retry of the same payment keeps its codes and the receipts already issued:
      // a receipt may exist even though its answer never came, or the save failed after it.
      const key = JSON.stringify({ customerId: input.customerId, method: input.method, slices });
      if (this.pendingCredits?.key !== key) {
        this.pendingCredits = { key, codes: paymentRefs.map((ref) => `Q-${ref.id}`), receiptIds: [] };
      }
      const attempt = this.pendingCredits;
      for (const [i, slice] of slices.entries()) {
        const credit = debts.find((d) => d.id === slice.debtId)?.fiscalCredit;
        const lines = credit?.lines ?? credit?.positions?.map(legacyPositionToLine) ?? [];
        const amountTiyin = toTiyin(slice.amount);
        if (amountTiyin <= 0 || lines.every((l) => l.paidTiyin <= 0)) continue;
        attempt.receiptIds[i] ??= (
          await this.fiscal.credit({
            code: attempt.codes[i],
            lines,
            method: input.method === 'card' ? 'card' : 'cash',
            amountTiyin,
            cashierName: user?.displayName
          })
        ).id;
        creditIds.set(slice.debtId, attempt.receiptIds[i]);
      }
    }

    for (const [i, slice] of slices.entries()) {
      const paymentRef = paymentRefs[i];
      wb.set(
        paymentRef,
        withTenant(
          stripUndefined({
            debtId: slice.debtId,
            customerId: input.customerId,
            amount: slice.amount,
            method: input.method,
            shiftId: input.shiftId,
            cashMovementId: movementRef?.id,
            fiscalCreditId: creditIds.get(slice.debtId),
            cashierId: user?.uid ?? '',
            cashierName: user?.displayName ?? '',
            note: input.note?.trim() || undefined,
            createdAt: serverTimestamp()
          }),
          tenantId
        )
      );
      wb.update(doc(this.firestore, 'debts', slice.debtId), {
        paidAmount: increment(slice.amount),
        remainingAmount: increment(-slice.amount),
        lastPaymentDate: serverTimestamp(),
        lastPaymentId: paymentRef.id
      });
    }

    if (movementRef) {
      wb.set(
        movementRef,
        withTenant(
          stripUndefined({
            shiftId: input.shiftId,
            type: 'in',
            amount: applied,
            reason: 'debtPayment',
            note: input.customerName ? `${input.customerName}` : undefined,
            cashierId: user?.uid ?? '',
            cashierName: user?.displayName ?? '',
            createdAt: serverTimestamp()
          }),
          tenantId
        )
      );
    }
    await commitOrQueue(wb);
    this.pendingCredits = null;
    return { applied, paidDebts: slices };
  }

  getCustomers(): Observable<Customer[]> {
    const customersQuery = tenantQuery(this.firestore, 'customers', requireTenantId(this.authService), orderBy('name'));
    return fromCollectionQuery<Customer>(customersQuery);
  }

  addCustomer(customer: Omit<Customer, 'id'>): Observable<string> {
    return from(
      addDoc(collection(this.firestore, 'customers'), withTenant({ ...customer, createdAt: serverTimestamp() }, requireTenantId(this.authService)))
    ).pipe(map((ref) => ref.id));
  }
}
