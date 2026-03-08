import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Product {
  id: string;
  name: string;
  barcode: string;
  price: number;
  cost: number;
  quantity: number;
  unit: string;
  category: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private products$ = new BehaviorSubject<Product[]>([]);

  constructor() {}

  getProducts(): Observable<Product[]> {
    return this.products$.asObservable();
  }

  getProductById(id: string): Observable<Product | undefined> {
    return new Observable(observer => {
      observer.next(this.products$.value.find(p => p.id === id));
      observer.complete();
    });
  }

  searchProducts(query: string): Observable<Product[]> {
    return new Observable(observer => {
      const filtered = this.products$.value.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.barcode.includes(query)
      );
      observer.next(filtered);
      observer.complete();
    });
  }

  getProductByBarcode(barcode: string): Observable<Product | undefined> {
    return new Observable(observer => {
      observer.next(this.products$.value.find(p => p.barcode === barcode));
      observer.complete();
    });
  }

  addProduct(product: Product): Observable<Product> {
    const newProduct = { ...product, id: Date.now().toString() };
    this.products$.next([...this.products$.value, newProduct]);
    return new Observable(observer => {
      observer.next(newProduct);
      observer.complete();
    });
  }

  updateProduct(id: string, product: Partial<Product>): Observable<Product> {
    const updatedProducts = this.products$.value.map(p =>
      p.id === id ? { ...p, ...product } : p
    );
    this.products$.next(updatedProducts);
    return new Observable(observer => {
      observer.next(updatedProducts.find(p => p.id === id)!);
      observer.complete();
    });
  }

  deleteProduct(id: string): Observable<void> {
    this.products$.next(this.products$.value.filter(p => p.id !== id));
    return new Observable(observer => {
      observer.next();
      observer.complete();
    });
  }
}
