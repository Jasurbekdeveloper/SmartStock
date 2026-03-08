import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  email?: string;
}

export interface Debt {
  id: string;
  customerId: string;
  customer?: Customer;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  createdAt: Date;
  lastPaymentDate?: Date;
  notes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DebtService {
  private debts$ = new BehaviorSubject<Debt[]>([]);
  private customers$ = new BehaviorSubject<Customer[]>([]);

  constructor() {}

  getDebts(): Observable<Debt[]> {
    return this.debts$.asObservable();
  }

  getDebtById(id: string): Observable<Debt | undefined> {
    return new Observable(observer => {
      observer.next(this.debts$.value.find(d => d.id === id));
      observer.complete();
    });
  }

  getCustomerDebts(customerId: string): Observable<Debt[]> {
    return new Observable(observer => {
      observer.next(
        this.debts$.value.filter(d => d.customerId === customerId)
      );
      observer.complete();
    });
  }

  createDebt(debt: Debt): Observable<Debt> {
    const newDebt = { ...debt, id: Date.now().toString() };
    this.debts$.next([...this.debts$.value, newDebt]);
    return new Observable(observer => {
      observer.next(newDebt);
      observer.complete();
    });
  }

  payDebt(debtId: string, amount: number): Observable<Debt> {
    const updatedDebts = this.debts$.value.map(d => {
      if (d.id === debtId) {
        const newPaidAmount = d.paidAmount + amount;
        return {
          ...d,
          paidAmount: newPaidAmount,
          remainingAmount: Math.max(0, d.totalAmount - newPaidAmount),
          lastPaymentDate: new Date()
        };
      }
      return d;
    });
    this.debts$.next(updatedDebts);
    return new Observable(observer => {
      observer.next(updatedDebts.find(d => d.id === debtId)!);
      observer.complete();
    });
  }

  getCustomers(): Observable<Customer[]> {
    return this.customers$.asObservable();
  }

  addCustomer(customer: Customer): Observable<Customer> {
    const newCustomer = { ...customer, id: Date.now().toString() };
    this.customers$.next([...this.customers$.value, newCustomer]);
    return new Observable(observer => {
      observer.next(newCustomer);
      observer.complete();
    });
  }
}
