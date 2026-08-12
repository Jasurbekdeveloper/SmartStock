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
  createdAt?: Date;
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

  addCategory(name: string): Observable<void> {
    return from(
      addDoc(collection(this.firestore, 'categories'), { name, createdAt: serverTimestamp() })
    ).pipe(map(() => undefined));
  }

  updateCategory(id: string, name: string): Observable<void> {
    return from(updateDoc(doc(this.firestore, 'categories', id), { name }));
  }

  deleteCategory(id: string): Observable<void> {
    return from(deleteDoc(doc(this.firestore, 'categories', id)));
  }
}
