import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery } from '../firebase/firestore.utils';
import { AuthService } from './auth.service';
import { requireTenantId, tenantQuery, withTenant } from './tenant-data';

export interface Category {
  id: string;
  name: string;
  imageUrl?: string;
  /** Variant characteristics suggested for new products in this category, e.g. ["Hajm", "Quvvat"]. */
  variantAttributes?: string[];
  /** New products in this category start with expiry tracking on (dairy, meat,
   *  detergents, paint…). Each product can still switch it off. */
  trackExpiry?: boolean;
  createdAt?: Date;
}

export interface CategoryInput {
  name: string;
  imageUrl?: string;
  variantAttributes?: string[];
  trackExpiry?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);

  getCategories(): Observable<Category[]> {
    const categoriesQuery = tenantQuery(this.firestore, 'categories', requireTenantId(this.authService), orderBy('name'));
    return fromCollectionQuery<Category>(categoriesQuery);
  }

  addCategory(input: CategoryInput): Observable<void> {
    const data: Record<string, unknown> = withTenant({ name: input.name, createdAt: serverTimestamp() }, requireTenantId(this.authService));
    if (input.imageUrl) data['imageUrl'] = input.imageUrl;
    if (input.variantAttributes?.length) data['variantAttributes'] = input.variantAttributes;
    if (input.trackExpiry) data['trackExpiry'] = true;

    return from(addDoc(collection(this.firestore, 'categories'), data)).pipe(map(() => undefined));
  }

  updateCategory(id: string, input: CategoryInput): Observable<void> {
    const data: Record<string, unknown> = {
      name: input.name,
      imageUrl: input.imageUrl ?? null,
      variantAttributes: input.variantAttributes?.length ? input.variantAttributes : null
    };
    return from(updateDoc(doc(this.firestore, 'categories', id), data));
  }

  setTrackExpiry(id: string, trackExpiry: boolean): Observable<void> {
    return from(updateDoc(doc(this.firestore, 'categories', id), { trackExpiry }));
  }

  deleteCategory(id: string): Observable<void> {
    return from(deleteDoc(doc(this.firestore, 'categories', id)));
  }
}
