import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import {
  Timestamp,
  WriteBatch,
  collection,
  doc,
  increment,
  serverTimestamp,
  where,
  writeBatch
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery } from '../firebase/firestore.utils';
import { AuthService } from './auth.service';
import { AuditLogService } from './audit-log.service';
import { requireTenantId, tenantQuery, withTenant } from './tenant-data';
import { stripUndefined } from './sales.service';
import { StockBatch } from '../utils/batches';
import { roundMoney } from '../utils/pos-math';

/** What arrives with a delivery of a tracked product. */
export interface NewBatchInput {
  quantity: number;
  expiryDate: Date;
  manufactureDate?: Date | null;
  batchNo?: string | null;
  costPrice?: number;
  supplierId?: string | null;
}

export interface WriteOffInput {
  batch: Pick<StockBatch, 'id' | 'productId' | 'quantity' | 'expiryDate' | 'batchNo' | 'costPrice'>;
  productName: string;
  /** Product cost, used when the batch has no cost of its own. */
  fallbackCost: number;
  /** Product stock before the write-off, for the stock history entry. */
  currentQuantity: number;
  /** Units to write off; defaults to everything left in the batch. */
  quantity?: number;
  reason?: string;
}

/**
 * Stock batches (`stockBatches/{id}`) for products with expiry tracking. Sales and
 * returns move batch quantities inside their own write batches (SalesService);
 * this service creates batches and writes expired stock off.
 */
@Injectable({ providedIn: 'root' })
export class BatchService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);
  private auditLog = inject(AuditLogService);

  /** Every batch with stock left — small even for a large store (only tracked goods). */
  getActiveBatches(): Observable<StockBatch[]> {
    return fromCollectionQuery<StockBatch>(
      tenantQuery(this.firestore, 'stockBatches', requireTenantId(this.authService), where('quantity', '>', 0))
    );
  }

  /** All batches of one product, including used-up ones (history). */
  getBatchesForProduct(productId: string): Observable<StockBatch[]> {
    return fromCollectionQuery<StockBatch>(
      tenantQuery(this.firestore, 'stockBatches', requireTenantId(this.authService), where('productId', '==', productId))
    );
  }

  /** Creates one batch on its own (e.g. dating stock already on hand). */
  create(productId: string, input: NewBatchInput): Observable<void> {
    const wb = writeBatch(this.firestore);
    this.addToWrite(wb, productId, input);
    return from(wb.commit());
  }

  /** Adds a new batch to an existing write batch; returns its id. */
  addToWrite(wb: WriteBatch, productId: string, input: NewBatchInput): string {
    const ref = doc(collection(this.firestore, 'stockBatches'));
    wb.set(ref, batchDocData(productId, input, requireTenantId(this.authService)));
    return ref.id;
  }

  /**
   * Changes a batch's best-before date — e.g. the supplier extended it, or it was
   * typed wrong. A product still dated the old way gets its own date changed.
   */
  updateExpiry(batch: Pick<StockBatch, 'id' | 'productId' | 'expiryDate'>, expiryDate: Date): Observable<void> {
    const wb = writeBatch(this.firestore);
    const isLegacy = batch.id.startsWith(LEGACY_PREFIX);
    wb.update(
      doc(this.firestore, isLegacy ? 'products' : 'stockBatches', isLegacy ? batch.productId : batch.id),
      { expiryDate: Timestamp.fromDate(expiryDate), updatedAt: serverTimestamp() }
    );
    this.auditLog.logInBatch(wb, {
      action: 'batch_expiry_changed',
      entityType: 'product',
      entityId: batch.productId,
      before: { batchId: batch.id, expiryDate: batch.expiryDate },
      after: { expiryDate }
    });
    return from(wb.commit());
  }

  /**
   * Writes expired (or damaged) stock off in one atomic write: the batch and the
   * product lose the quantity, the stock history gets an "out" entry, and — when
   * the goods had a cost — an expense of category "writeOff" so the loss shows in
   * the profit & loss report.
   */
  writeOff(input: WriteOffInput): Observable<void> {
    const tenantId = requireTenantId(this.authService);
    const user = this.authService.getCurrentUser();
    const qty = Math.min(input.quantity ?? input.batch.quantity, input.batch.quantity);
    const unitCost = input.batch.costPrice ?? input.fallbackCost ?? 0;
    const loss = roundMoney(qty * unitCost);
    const wb = writeBatch(this.firestore);
    const isLegacy = input.batch.id.startsWith(LEGACY_PREFIX);

    if (!isLegacy) {
      wb.update(doc(this.firestore, 'stockBatches', input.batch.id), {
        quantity: increment(-qty),
        updatedAt: serverTimestamp()
      });
    }
    wb.update(doc(this.firestore, 'products', input.batch.productId), {
      quantity: increment(-qty),
      updatedAt: serverTimestamp(),
      // A product dated the old way (one date on the product) is cleared once written off.
      ...(isLegacy ? { expiryDate: null, batchNo: null } : {})
    });
    wb.set(
      doc(collection(this.firestore, 'stockEntries')),
      withTenant(
        stripUndefined({
          productId: input.batch.productId,
          type: 'out',
          quantity: qty,
          previousQuantity: input.currentQuantity,
          newQuantity: roundMoney(input.currentQuantity - qty),
          reason: input.reason ?? 'expired',
          batchId: isLegacy ? undefined : input.batch.id,
          costPrice: unitCost,
          totalCost: loss,
          notes: input.batch.batchNo ? `#${input.batch.batchNo}` : undefined,
          createdAt: serverTimestamp()
        }),
        tenantId
      )
    );
    if (loss > 0) {
      wb.set(
        doc(collection(this.firestore, 'expenses')),
        withTenant(
          stripUndefined({
            category: 'writeOff',
            amount: loss,
            date: Timestamp.fromDate(new Date()),
            method: 'none',
            note: `${input.productName} — ${qty}${input.batch.batchNo ? ` (#${input.batch.batchNo})` : ''}`,
            productId: input.batch.productId,
            batchId: isLegacy ? undefined : input.batch.id,
            createdBy: user?.uid ?? '',
            createdByName: user?.displayName ?? '',
            createdAt: serverTimestamp()
          }),
          tenantId
        )
      );
    }
    this.auditLog.logInBatch(wb, {
      action: 'stock_write_off',
      entityType: 'product',
      entityId: input.batch.productId,
      before: { batchId: input.batch.id, quantity: input.batch.quantity },
      after: { writtenOff: qty, loss }
    });
    return from(wb.commit());
  }
}

/** Id prefix for a "batch" synthesized from the old single expiry date on a product. */
export const LEGACY_PREFIX = 'legacy:';

export function batchDocData(productId: string, input: NewBatchInput, tenantId: string): Record<string, unknown> {
  return withTenant(
    stripUndefined({
      productId,
      quantity: input.quantity,
      initialQuantity: input.quantity,
      expiryDate: Timestamp.fromDate(input.expiryDate),
      manufactureDate: input.manufactureDate ? Timestamp.fromDate(input.manufactureDate) : null,
      batchNo: input.batchNo?.trim() || null,
      costPrice: input.costPrice,
      supplierId: input.supplierId ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }),
    tenantId
  );
}
