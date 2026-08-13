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

export interface Category {
  id: string;
  name: string;
  imageUrl?: string;
  createdAt?: Date;
}

export interface CategoryInput {
  name: string;
  imageUrl?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private firestore = inject(FIRESTORE);

  getCategories(): Observable<Category[]> {
    const categoriesQuery = query(collection(this.firestore, 'categories'), orderBy('name'));
    return fromCollectionQuery<Category>(categoriesQuery);
  }

  addCategory(input: CategoryInput): Observable<void> {
    const data: Record<string, unknown> = { name: input.name, createdAt: serverTimestamp() };
    if (input.imageUrl) data['imageUrl'] = input.imageUrl;

    return from(addDoc(collection(this.firestore, 'categories'), data)).pipe(map(() => undefined));
  }

  updateCategory(id: string, input: CategoryInput): Observable<void> {
    const data: Record<string, unknown> = { name: input.name, imageUrl: input.imageUrl ?? null };
    return from(updateDoc(doc(this.firestore, 'categories', id), data));
  }

  deleteCategory(id: string): Observable<void> {
    return from(deleteDoc(doc(this.firestore, 'categories', id)));
  }
}
