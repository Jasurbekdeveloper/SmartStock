import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, from } from 'rxjs';
import {
  collection,
  doc,
  increment,
  orderBy,
  query,
  serverTimestamp,
  where,
  WriteBatch,
  writeBatch
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery } from '../firebase/firestore.utils';
import { AuditLogService } from './audit-log.service';
import { roundMoney } from '../utils/pos-math';
import { AuthService } from './auth.service';
import { requireTenantId, tenantQuery, withTenant } from './tenant-data';
import { BatchService } from './batch.service';
import { SupplierPaymentMethod, SupplierService } from './supplier.service';
import { commitOrQueue, stripUndefined } from './sales.service';
import { StockBatch, sortFefo } from '../utils/batches';

export type StockMovementType = 'in' | 'out' | 'adjustment';

export interface StockEntry {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason?: string;
  /** Batch this movement created (stock in) or reduced (write-off). */
  batchId?: string;
  /** Free-text supplier name, kept for backward compatibility with older entries
   *  and for one-off suppliers that never get added to the catalog. When
   *  `supplierId` is set, this is a denormalized copy of that supplier's name
   *  so existing rendering code (which only reads `supplier`) keeps working. */
  supplier?: string;
  /** Links this entry to a `suppliers/{id}` catalog document, when the stock-in
   *  was recorded against a known supplier rather than typed in manually. */
  supplierId?: string;
  costPrice?: number;
  totalCost?: number;
  /** Supplier's invoice (nakladnoy) number of a delivery. */
  invoiceNo?: string;
  notes?: string;
  createdAt?: Date;
}

/** One line of a delivery received from a supplier. */
export interface ReceiveLine {
  productId: string;
  quantity: number;
  /** Stock and cost before this delivery (weighted average cost). */
  currentQuantity: number;
  currentCost: number;
  costPrice: number;
  sellingPrice: number;
  batch?: { expiryDate: Date; manufactureDate?: Date | null; batchNo?: string | null };
}

export interface ReceiveGoodsInput {
  lines: ReceiveLine[];
  supplierId?: string;
  supplierName: string;
  invoiceNo?: string;
  /** Paid on delivery; the rest becomes debt to the supplier (needs `supplierId`). */
  paidNow: number;
  method?: SupplierPaymentMethod;
  /** Cash paid from the current user's open till. */
  drawerShiftId?: string;
  dueDate?: Date | null;
  note?: string;
}

/** Most lines one delivery may have: ≤ 3 writes per line, Firestore allows 500 per commit. */
export const MAX_RECEIVE_LINES = 150;

export interface StockInInput {
  productId: string;
  quantity: number;
  currentQuantity: number;
  supplier: string;
  supplierId?: string;
  costPrice: number;
  /** Product's cost before this delivery — for the weighted average. */
  currentCost?: number;
  sellingPrice: number;
  /** Dates of this delivery — required for products with expiry tracking. */
  batch?: { expiryDate: Date; manufactureDate?: Date | null; batchNo?: string | null };
}

export interface StockOutInput {
  productId: string;
  quantity: number;
  currentQuantity: number;
  reason: string;
  notes?: string;
}

export interface StockAdjustmentInput {
  productId: string;
  countedQuantity: number;
  currentQuantity: number;
  notes?: string;
  /**
   * 'count' (default): an inventory count — the shelf holds exactly `countedQuantity`.
   * 'delta': a correction of what the form showed (`currentQuantity` → `countedQuantity`),
   * applied as a difference so sales made meanwhile are not overwritten.
   */
  mode?: 'count' | 'delta';
}

@Injectable({
  providedIn: 'root'
})
export class StockService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);
  private auditLogService = inject(AuditLogService);
  private batchService = inject(BatchService);
  private supplierService = inject(SupplierService);

  getStockEntries(): Observable<StockEntry[]> {
    const entriesQuery = tenantQuery(this.firestore, 'stockEntries', requireTenantId(this.authService), orderBy('createdAt', 'desc'));
    return fromCollectionQuery<StockEntry>(entriesQuery);
  }

  getStockByProductId(productId: string): Observable<StockEntry[]> {
    const entriesQuery = query(
      collection(this.firestore, 'stockEntries'),
      where('tenantId', '==', requireTenantId(this.authService)),
      where('productId', '==', productId),
      orderBy('createdAt', 'desc')
    );
    return fromCollectionQuery<StockEntry>(entriesQuery);
  }

  getStockEntriesBySupplierId(supplierId: string): Observable<StockEntry[]> {
    const entriesQuery = query(
      collection(this.firestore, 'stockEntries'),
      where('tenantId', '==', requireTenantId(this.authService)),
      where('supplierId', '==', supplierId),
      orderBy('createdAt', 'desc')
    );
    return fromCollectionQuery<StockEntry>(entriesQuery);
  }

  /**
   * Weighted average cost (AVCO): the product's cost becomes the average of what's
   * already on the shelf and what just arrived, so profit on old stock isn't
   * restated at the newest purchase price.
   */
  static averageCost(currentQty: number, currentCost: number, inQty: number, inCost: number): number {
    const onHand = Math.max(0, currentQty);
    const total = onHand + inQty;
    if (total <= 0) return inCost;
    return roundMoney((onHand * (currentCost || 0) + inQty * inCost) / total);
  }

  stockIn(input: StockInInput): Observable<void> {
    const newQuantity = input.currentQuantity + input.quantity;
    const cost = StockService.averageCost(input.currentQuantity, input.currentCost ?? input.costPrice, input.quantity, input.costPrice);
    return this.recordMovement(
      {
        productId: input.productId,
        type: 'in',
        quantity: input.quantity,
        previousQuantity: input.currentQuantity,
        newQuantity,
        supplier: input.supplier,
        supplierId: input.supplierId,
        costPrice: input.costPrice,
        totalCost: input.quantity * input.costPrice
      },
      // Restocking is when cost/selling prices actually change in this business,
      // so keep the product record in sync instead of only logging it here.
      { cost, price: input.sellingPrice },
      input.batch
        ? (wb) =>
            this.batchService.addToWrite(wb, input.productId, {
              ...input.batch!,
              quantity: input.quantity,
              costPrice: input.costPrice,
              supplierId: input.supplierId ?? null
            })
        : undefined
    );
  }

  stockOut(input: StockOutInput): Observable<void> {
    const newQuantity = input.currentQuantity - input.quantity;
    return this.recordMovement({
      productId: input.productId,
      type: 'out',
      quantity: input.quantity,
      previousQuantity: input.currentQuantity,
      newQuantity,
      reason: input.reason,
      notes: input.notes
    });
  }

  /**
   * Inventory count or correction. When the shelf holds less than the dated batches
   * say, the shortfall is taken off the batches that expire first, so the expiry
   * page and the POS stop counting goods that are no longer there.
   */
  adjustStock(input: StockAdjustmentInput): Observable<void> {
    return from(this.adjustStockAsync(input));
  }

  private async adjustStockAsync(input: StockAdjustmentInput): Promise<void> {
    let batches: StockBatch[] = [];
    try {
      batches = await firstValueFrom(this.batchService.getBatchesForProduct(input.productId));
    } catch {
      batches = [];
    }
    const delta = roundQty(input.countedQuantity - input.currentQuantity);
    const batched = roundQty(batches.reduce((s, b) => s + Math.max(0, b.quantity), 0));
    const newTotal = input.mode === 'delta' ? null : input.countedQuantity;
    // Units the batches must lose so they never hold more than the shelf.
    const target = newTotal ?? Math.max(0, input.currentQuantity + delta);
    let excess = roundQty(batched - target);

    await firstValueFrom(
      this.recordMovement(
        {
          productId: input.productId,
          type: 'adjustment',
          quantity: input.countedQuantity,
          previousQuantity: input.currentQuantity,
          newQuantity: input.countedQuantity,
          notes: input.notes
        },
        input.mode === 'delta' ? { quantity: increment(delta) } : undefined,
        (wb) => {
          for (const b of sortFefo(batches)) {
            if (excess <= 0) break;
            const take = roundQty(Math.min(b.quantity, excess));
            wb.update(doc(this.firestore, 'stockBatches', b.id), { quantity: increment(-take), updatedAt: serverTimestamp() });
            excess = roundQty(excess - take);
          }
        }
      )
    );
  }

  /**
   * A delivery (nakladnoy) with many lines, in ONE atomic write: every product's stock
   * and weighted cost, a stock entry per line, dated batches for tracked goods, the
   * purchase on the supplier's account (the unpaid part raises what the store owes),
   * and — when paid in cash from the till — the drawer's cash-out.
   */
  receiveGoods(input: ReceiveGoodsInput): Observable<void> {
    const tenantId = requireTenantId(this.authService);
    const user = this.authService.getCurrentUser();
    const wb = writeBatch(this.firestore);
    let total = 0;

    for (const line of input.lines) {
      const lineTotal = roundMoney(line.quantity * line.costPrice);
      total += lineTotal;
      const batchId = line.batch
        ? this.batchService.addToWrite(wb, line.productId, {
            ...line.batch,
            quantity: line.quantity,
            costPrice: line.costPrice,
            supplierId: input.supplierId ?? null
          })
        : undefined;
      wb.set(
        doc(collection(this.firestore, 'stockEntries')),
        withTenant(
          stripUndefined({
            productId: line.productId,
            type: 'in',
            quantity: line.quantity,
            previousQuantity: line.currentQuantity,
            newQuantity: roundQty(line.currentQuantity + line.quantity),
            supplier: input.supplierName,
            supplierId: input.supplierId,
            costPrice: line.costPrice,
            totalCost: lineTotal,
            invoiceNo: input.invoiceNo?.trim() || undefined,
            batchId,
            createdAt: serverTimestamp()
          }),
          tenantId
        )
      );
      wb.update(doc(this.firestore, 'products', line.productId), {
        quantity: increment(line.quantity),
        cost: StockService.averageCost(line.currentQuantity, line.currentCost || line.costPrice, line.quantity, line.costPrice),
        price: line.sellingPrice,
        updatedAt: serverTimestamp()
      });
    }
    total = roundMoney(total);
    const paidNow = roundMoney(Math.min(Math.max(0, input.paidNow), total));

    if (input.supplierId) {
      this.supplierService.addPurchaseToWrite(wb, {
        supplierId: input.supplierId,
        total,
        paidNow,
        method: input.method,
        invoiceNo: input.invoiceNo,
        dueDate: input.dueDate,
        itemsCount: input.lines.length,
        shiftId: input.method === 'cash' && paidNow > 0 ? input.drawerShiftId : undefined,
        note: input.note
      });
    }
    if (input.method === 'cash' && paidNow > 0 && input.drawerShiftId) {
      wb.set(
        doc(collection(this.firestore, 'cashMovements')),
        withTenant(
          stripUndefined({
            shiftId: input.drawerShiftId,
            type: 'out',
            amount: paidNow,
            reason: 'supplierPayment',
            note: [input.supplierName, input.invoiceNo ? '#' + input.invoiceNo : ''].filter(Boolean).join(' '),
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

  private recordMovement(
    entry: Omit<StockEntry, 'id' | 'createdAt'>,
    productUpdates?: Record<string, unknown>,
    /** Extra writes in the same batch; may return the id of a created stock batch. */
    extra?: (wb: WriteBatch) => string | void
  ): Observable<void> {
    const batch = writeBatch(this.firestore);
    const entryRef = doc(collection(this.firestore, 'stockEntries'));
    const batchId = extra?.(batch);
    if (batchId) entry = { ...entry, batchId };

    const data: Record<string, unknown> = withTenant({ ...entry, createdAt: serverTimestamp() }, requireTenantId(this.authService));
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) delete data[key];
    }

    batch.set(entryRef, data);
    // In/out move stock by a delta (increment), so a POS sale committed between
    // reading the product and saving this movement isn't overwritten. Only an
    // inventory count sets an absolute value — that's the point of a count.
    const delta = entry.type === 'in' ? entry.quantity : -entry.quantity;
    batch.update(doc(this.firestore, 'products', entry.productId), {
      quantity: entry.type === 'adjustment' ? entry.newQuantity : increment(delta),
      updatedAt: serverTimestamp(),
      // May override `quantity` (an adjustment applied as a difference).
      ...productUpdates
    });

    // Inventory counts (not routine in/out) are the "sensitive" stock action worth
    // auditing — log it in the SAME batch so it commits atomically with the entry.
    if (entry.type === 'adjustment') {
      this.auditLogService.logInBatch(batch, {
        action: 'stock_adjustment',
        entityType: 'product',
        entityId: entry.productId,
        before: { quantity: entry.previousQuantity },
        after: { quantity: entry.newQuantity }
      });
    }

    return from(commitOrQueue(batch));
  }
}

const roundQty = (n: number) => Math.round(n * 1000) / 1000;
