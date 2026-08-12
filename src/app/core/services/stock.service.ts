import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import {
  collection,
  doc,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery } from '../firebase/firestore.utils';

export type StockMovementType = 'in' | 'out' | 'adjustment';

export interface StockEntry {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason?: string;
  supplier?: string;
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
  costPrice: number;
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

  getStockEntries(): Observable<StockEntry[]> {
    const entriesQuery = query(collection(this.firestore, 'stockEntries'), orderBy('createdAt', 'desc'));
    return fromCollectionQuery<StockEntry>(entriesQuery);
  }

  getStockByProductId(productId: string): Observable<StockEntry[]> {
    const entriesQuery = query(
      collection(this.firestore, 'stockEntries'),
      where('productId', '==', productId),
      orderBy('createdAt', 'desc')
    );
    return fromCollectionQuery<StockEntry>(entriesQuery);
  }

  stockIn(input: StockInInput): Observable<void> {
    const newQuantity = input.currentQuantity + input.quantity;
    return this.recordMovement({
      productId: input.productId,
      type: 'in',
      quantity: input.quantity,
      previousQuantity: input.currentQuantity,
      newQuantity,
      supplier: input.supplier,
      costPrice: input.costPrice,
      totalCost: input.quantity * input.costPrice
    });
  }

  stockOut(input: StockOutInput): Observable<void> {
    const newQuantity = Math.max(0, input.currentQuantity - input.quantity);
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

  private recordMovement(entry: Omit<StockEntry, 'id' | 'createdAt'>): Observable<void> {
    const batch = writeBatch(this.firestore);
    const entryRef = doc(collection(this.firestore, 'stockEntries'));

    const data: Record<string, unknown> = { ...entry, createdAt: serverTimestamp() };
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) delete data[key];
    }

    batch.set(entryRef, data);
    batch.update(doc(this.firestore, 'products', entry.productId), {
      quantity: entry.newQuantity,
      updatedAt: serverTimestamp()
    });

    return from(batch.commit());
  }
}
