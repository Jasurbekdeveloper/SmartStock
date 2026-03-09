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

  constructor() {
    // Dastlabki ma'lumotlar bilan to'ldirish
    this.customers$.next([
      {
        id: '1',
        name: 'Ali Valiyev',
        phone: '+998901234567',
        address: 'Toshkent shahri',
        email: 'ali@example.com'
      },
      {
        id: '2',
        name: 'Bekzod Karimov',
        phone: '+998931112233',
        address: 'Samarqand',
        email: 'bekzod@example.com'
      },
      {
        id: '3',
        name: 'Dilshod Rasulov',
        phone: '+998909876543',
        address: 'Andijon'
      },
      {
        id: '4',
        name: 'Jasmina Akhmedova',
        phone: '+998935556677',
        email: 'jasmina@example.com'
      }
    ]);
    this.debts$.next([
      {
        id: 'd1',
        customerId: '1',
        customer: this.customers$.value[0],
        totalAmount: 500000,
        paidAmount: 200000,
        remainingAmount: 300000,
        createdAt: new Date('2026-03-01'),
        lastPaymentDate: new Date('2026-03-05'),
        notes: 'Telefon uchun qarz'
      },
      {
        id: 'd2',
        customerId: '2',
        customer: this.customers$.value[1],
        totalAmount: 750000,
        paidAmount: 250000,
        remainingAmount: 500000,
        createdAt: new Date('2026-02-20'),
        lastPaymentDate: new Date('2026-03-02'),
        notes: 'Maishiy texnika'
      },
      {
        id: 'd3',
        customerId: '3',
        customer: this.customers$.value[2],
        totalAmount: 300000,
        paidAmount: 100000,
        remainingAmount: 200000,
        createdAt: new Date('2026-02-25'),
        notes: 'Aksessuarlar'
      },
      {
        id: 'd4',
        customerId: '4',
        customer: this.customers$.value[3],
        totalAmount: 1000000,
        paidAmount: 400000,
        remainingAmount: 600000,
        createdAt: new Date('2026-01-15'),
        lastPaymentDate: new Date('2026-02-10'),
        notes: 'Noutbuk uchun qarz'
      }
    ]);
  }

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
