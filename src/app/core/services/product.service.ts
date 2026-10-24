import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getCountFromServer,
  increment,
  orderBy,
  serverTimestamp,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery, fromDocRef } from '../firebase/firestore.utils';
import { AuthService } from './auth.service';
import { requireTenantId, tenantQuery, withTenant } from './tenant-data';
import { TenantService } from './tenant.service';
import { ProductAttribute } from '../utils/product-variants';

export interface Product {
  id: string;
  name: string;
  barcode: string;
  price: number;
  cost: number;
  quantity: number;
  unit: string;
  /** Optional alternate sale units (e.g. primary "dona", alts "quti"/"karobka") — stock
   *  quantity itself always stays in the primary unit; this is only used to let POS/staff
   *  enter quantities in a more convenient unit and convert on the fly. `factor` is how
   *  many primary units make up 1 of that alt unit (e.g. unit "quti", factor 20 → 1 quti = 20 dona). */
  altUnits?: { unit: string; factor: number }[];
  /** Optional extra search terms (synonyms/loanwords/abbreviations) an admin can tag
   *  onto a product so it's also found under a name it isn't actually called — e.g. a
   *  product named "Quvur" tagged with "truba" (both mean "pipe"). Unlike
   *  `normalizeForSearch()`'s Latin/Cyrillic script matching, this covers genuinely
   *  different words with the same meaning, which has no deterministic mapping. */
  searchKeywords?: string[];
  /** MXIK (IKPU) — 17-digit code from the tax committee classifier (tasnif.soliq.uz).
   *  null until the store fills it in; needed once fiscal/tax integration arrives. */
  mxikCode?: string | null;
  /** What tells this variant apart from the others in its family, e.g. Hajm = 80 L.
   *  `color`/`size` below are kept in sync for "Rang"/"O'lcham" (older screens, Excel import). */
  attributes?: ProductAttribute[];
  minQuantity?: number;
  categoryId: string;
  description?: string;
  sku?: string;
  color?: string;
  size?: string;
  familyId?: string;
  imageUrl?: string;
  variantImageUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);
  private tenantService = inject(TenantService);

  getProducts(): Observable<Product[]> {
    const productsQuery = tenantQuery(this.firestore, 'products', requireTenantId(this.authService), orderBy('name'));
    return fromCollectionQuery<Product>(productsQuery);
  }

  getProductById(id: string): Observable<Product | undefined> {
    return fromDocRef<Product>(doc(this.firestore, 'products', id));
  }

  addProduct(product: Omit<Product, 'id'>): Observable<void> {
    return this.addProducts([product]);
  }

  addProducts(products: Omit<Product, 'id'>[]): Observable<void> {
    return from(this.addProductsAsync(products));
  }

  /** Throws PRODUCT_LIMIT_REACHED when the store's plan caps the catalog size. */
  private async assertProductLimit(tenantId: string, adding: number): Promise<void> {
    const max = this.tenantService.tenant()?.maxProducts;
    if (!max) return;
    const current = await getCountFromServer(tenantQuery(this.firestore, 'products', tenantId));
    if (current.data().count + adding > max) {
      throw new Error('PRODUCT_LIMIT_REACHED');
    }
  }

  private async addProductsAsync(products: Omit<Product, 'id'>[]): Promise<void> {
    const tenantId = requireTenantId(this.authService);
    await this.assertProductLimit(tenantId, products.length);
    const batch = writeBatch(this.firestore);
    for (const product of products) {
      const productRef = doc(collection(this.firestore, 'products'));
      // Firestore rejects explicit undefined values for optional product metadata.
      const data: Record<string, unknown> = {
        ...withTenant(product, tenantId),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      for (const key of Object.keys(data)) {
        if (data[key] === undefined) delete data[key];
      }
      batch.set(productRef, data);
    }
    await batch.commit();
  }

  updateProduct(id: string, product: Partial<Product>): Observable<void> {
    // Here an explicit `undefined` (e.g. clearing altUnits in the edit form) means
    // "remove this field" — convert it to Firestore's deleteField() sentinel so the
    // old value actually gets cleared instead of being silently skipped.
    const data: Record<string, unknown> = { ...product, updatedAt: serverTimestamp() };
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) data[key] = deleteField();
    }
    return from(updateDoc(doc(this.firestore, 'products', id), data));
  }

  deleteProduct(id: string): Observable<void> {
    return from(deleteDoc(doc(this.firestore, 'products', id)));
  }

  /** Applies a relative quantity change (e.g. -2) without a read-then-write race. */
  adjustQuantity(id: string, delta: number): Observable<void> {
    return from(
      updateDoc(doc(this.firestore, 'products', id), {
        quantity: increment(delta),
        updatedAt: serverTimestamp()
      })
    );
  }
}
