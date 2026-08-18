import { Injectable, inject } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import {
  WriteBatch,
  addDoc,
  collection,
  doc,
  orderBy,
  query,
  serverTimestamp
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery } from '../firebase/firestore.utils';
import { AuthService } from './auth.service';

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  createdAt?: Date;
}

/** What a call site provides — `userId`/`userName` are always filled in from the
 *  signed-in user by this service (never trusted from the caller), matching the
 *  `firestore.rules` invariant `request.resource.data.userId == request.auth.uid`. */
export type AuditLogInput = Omit<AuditLogEntry, 'id' | 'userId' | 'userName' | 'createdAt'>;

export interface AuditLogFilters {
  entityType?: string;
  action?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuditLogService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);

  /** Plain (non-batched) write — used at call sites that don't already hold an
   *  open `writeBatch` (e.g. after a successful `updateDoc`/`deleteDoc`). */
  log(entry: AuditLogInput): Observable<void> {
    const data = this.buildData(entry);
    return from(addDoc(collection(this.firestore, 'auditLog'), data)).pipe(map(() => undefined));
  }

  /** Batch-friendly variant for call sites that already have an open `writeBatch`
   *  (e.g. `StockService.recordMovement()`) — adds the log write to that same
   *  batch so it commits atomically with the rest of the operation. */
  logInBatch(batch: WriteBatch, entry: AuditLogInput): void {
    const data = this.buildData(entry);
    const ref = doc(collection(this.firestore, 'auditLog'));
    batch.set(ref, data);
  }

  /** Full collection, newest first. Filtering (entityType/action/date range) is
   *  intentionally left to the caller as client-side `computed()` filters over
   *  this list — matching the convention already used by product-list/sales-history
   *  rather than building server-side range queries (would also need composite
   *  Firestore indexes for every entityType/action combination). `filters` is a
   *  light convenience for callers that only need one dimension server-side. */
  getAuditLog(filters?: AuditLogFilters): Observable<AuditLogEntry[]> {
    const auditQuery = query(collection(this.firestore, 'auditLog'), orderBy('createdAt', 'desc'));
    return fromCollectionQuery<AuditLogEntry>(auditQuery).pipe(
      map((entries) =>
        entries.filter((entry) => {
          if (filters?.entityType && entry.entityType !== filters.entityType) return false;
          if (filters?.action && entry.action !== filters.action) return false;
          return true;
        })
      )
    );
  }

  private buildData(entry: AuditLogInput): Record<string, unknown> {
    const user = this.authService.getCurrentUser();
    const data: Record<string, unknown> = {
      ...entry,
      userId: user?.uid ?? '',
      userName: user?.displayName,
      createdAt: serverTimestamp()
    };
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) delete data[key];
    }
    return data;
  }
}
