import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, terminate } from 'firebase/firestore';
import { of } from 'rxjs';
import { Debt, DebtService, allocateDebtPayment } from './debt.service';
import { AuthService } from './auth.service';
import { FiscalService } from './fiscal.service';
import { SettingsService } from './settings.service';
import { FIRESTORE } from '../firebase/firebase.providers';
import { FiscalLine } from '../utils/fiscal-receipt';

describe('allocateDebtPayment', () => {
  const debts = [
    { id: 'new', remainingAmount: 300000, createdAt: new Date(2026, 9, 20) },
    { id: 'old', remainingAmount: 120000, createdAt: new Date(2026, 8, 1) },
    { id: 'paid', remainingAmount: 0, createdAt: new Date(2026, 7, 1) }
  ];

  it('pays the oldest debt first and never more than is owed', () => {
    expect(allocateDebtPayment(debts, 200000)).toEqual([
      { debtId: 'old', amount: 120000 },
      { debtId: 'new', amount: 80000 }
    ]);
    expect(allocateDebtPayment(debts, 1000000).reduce((s, x) => s + x.amount, 0)).toBe(420000);
    expect(allocateDebtPayment(debts, 0)).toEqual([]);
  });
});

describe('DebtService credit receipts', () => {
  const line = { paidTiyin: 100 } as FiscalLine;
  const fiscalCredit = { saleReceiptId: 's1', lines: [line] };
  const debts = [
    { id: 'old', customerId: 'c1', remainingAmount: 1000, createdAt: new Date(2026, 8, 1), fiscalCredit },
    { id: 'new', customerId: 'c1', remainingAmount: 1000, createdAt: new Date(2026, 9, 1), fiscalCredit }
  ] as Debt[];
  const payment = { customerId: 'c1', amount: 1500, method: 'cash' as const };

  // Writes wait on a port nothing listens on, so nothing leaves this machine.
  const app = initializeApp({ projectId: 'demo-debt-spec', apiKey: 'test' }, 'debt-spec');
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 1);

  function setup(credit: ReturnType<typeof vi.fn>) {
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: firestore },
        { provide: AuthService, useValue: { getCurrentUser: () => ({ uid: 'u1', displayName: 'Kassir', tenantId: 't1' }) } },
        { provide: FiscalService, useValue: { enabled: () => true, credit } },
        { provide: SettingsService, useValue: { fiscalPolicy: () => ({ send: true, sendDebt: true }) } }
      ]
    });
    const service = TestBed.inject(DebtService);
    vi.spyOn(service, 'getCustomerDebts').mockReturnValue(of(debts));
    return service;
  }

  /** Runs a payment that reaches the save, whose wait for the (absent) server is a timer. */
  async function saved(service: DebtService, input: Parameters<DebtService['collectPayment']>[0]) {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const done = new Promise((resolve, reject) => service.collectPayment(input).subscribe({ next: resolve, error: reject }));
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    vi.useRealTimers();
  }

  function failed(service: DebtService, input: Parameters<DebtService['collectPayment']>[0]) {
    return new Promise((resolve, reject) => service.collectPayment(input).subscribe({ next: reject, error: resolve }));
  }

  const codes = (credit: ReturnType<typeof vi.fn>) => credit.mock.calls.map(([request]) => request.code as string);

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  afterAll(async () => {
    await terminate(firestore);
    await deleteApp(app);
  });

  it('keeps the codes on a retry and does not reissue a receipt that came through', async () => {
    const credit = vi
      .fn()
      .mockResolvedValueOnce({ id: 'r-old' })
      .mockRejectedValueOnce(new Error('no answer'))
      .mockResolvedValueOnce({ id: 'r-new' });
    const service = setup(credit);

    await failed(service, payment);
    await saved(service, payment);

    const [first, second, retry] = codes(credit);
    expect(credit).toHaveBeenCalledTimes(3);
    expect(first).not.toBe(second);
    expect(retry).toBe(second);
  });

  it('takes new codes when the amount changes, and after a payment was saved', async () => {
    const credit = vi.fn().mockRejectedValueOnce(new Error('no answer')).mockResolvedValue({ id: 'r1' });
    const service = setup(credit);

    await failed(service, { ...payment, amount: 500 });
    await saved(service, { ...payment, amount: 400 });
    await saved(service, { ...payment, amount: 400 });

    const [failedCode, savedCode, nextCode] = codes(credit);
    expect(savedCode).not.toBe(failedCode);
    expect(nextCode).not.toBe(savedCode);
  });
});
