import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
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
  notes?: string;
  createdAt?: Date;
}

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
}

@Injectable({
  providedIn: 'root'
})
export class StockService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);
  private auditLogService = inject(AuditLogService);
  private batchService = inject(BatchService);

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

  adjustStock(input: StockAdjustmentInput): Observable<void> {
    return this.recordMovement({
      productId: input.productId,
      type: 'adjustment',
      quantity: input.countedQuantity,
      previousQuantity: input.currentQuantity,
      newQuantity: input.countedQuantity,
      notes: input.notes
    });
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

    return from(batch.commit());
  }
}
