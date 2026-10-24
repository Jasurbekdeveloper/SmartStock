import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PosComponent } from './pos.component';
import { Product, ProductService } from '../core/services/product.service';
import { CategoryService } from '../core/services/category.service';
import { SalesService } from '../core/services/sales.service';
import { DebtService } from '../core/services/debt.service';
import { AuthService } from '../core/services/auth.service';
import { ShiftService } from '../core/services/shift.service';
import { TranslationService } from '../core/services/translation.service';
import { ToastService } from '../core/services/toast.service';
import { SettingsService } from '../core/services/settings.service';

const cement: Product = {
  id: 'p1', name: 'Sement M400', barcode: '2000000000008', price: 50000, cost: 42000,
  quantity: 100, unit: 'dona', categoryId: 'c1', sku: 'SEM-400'
};
const nails: Product = {
  id: 'p2', name: 'Mix 100 mm', barcode: '2000000000015', price: 3000, cost: 2000,
  quantity: 500, unit: 'dona', categoryId: 'c2', sku: 'MIX-100'
};
const cashier = { uid: 'u1', email: 'k@x.uz', displayName: 'Kassir', role: 'cashier' as const, tenantId: 't1', active: true };

/** The cashier's full flow through the real POS template and real Material dialogs:
 *  add goods -> pay -> success dialog -> next sale starts clean. */
describe('PosComponent checkout (cashier)', () => {
  let createSale: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createSale = vi.fn(() => of('sale-1'));
    await TestBed.configureTestingModule({
      imports: [PosComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: ProductService, useValue: { getProducts: () => of([cement, nails]) } },
        { provide: CategoryService, useValue: { getCategories: () => of([]) } },
        { provide: SalesService, useValue: { getSalesInRange: () => of([]), createSale } },
        { provide: DebtService, useValue: { getCustomers: () => of([]), getCustomerDebts: () => of([]) } },
        { provide: AuthService, useValue: { currentUser$: of(cashier), getCurrentUser: () => cashier, can: () => true } },
        { provide: ShiftService, useValue: { getOpenShiftForUser: () => of({ id: 'sh1', cashierId: 'u1', startingCash: 0, status: 'open' }) } },
        { provide: TranslationService, useValue: { translate: (k: string) => k } },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
        { provide: SettingsService, useValue: { vatRate: signal(0), pricesIncludeVat: signal(true), currencySymbol: signal("so'm") } }
      ]
    }).compileComponents();
  });

  afterEach(() => {
    document.body.querySelectorAll('.cdk-overlay-container').forEach((el) => (el.innerHTML = ''));
  });

  async function setup() {
    const fixture = TestBed.createComponent(PosComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      await fixture.whenStable();
    };
    const tile = (name: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('.pos-tile')].find((b) => b.textContent?.includes(name))!;
    const payButton = () => root.querySelector<HTMLButtonElement>('.pos-pay')!;
    const overlayButtons = () => [...document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container button')];
    const dialogs = () => document.querySelectorAll('mat-dialog-container').length;
    return { fixture, root, settle, tile, payButton, overlayButtons, dialogs };
  }

  async function payAndFinish(t: Awaited<ReturnType<typeof setup>>) {
    t.payButton().click();
    await t.settle();
    expect(t.dialogs()).toBe(1);
    // Confirm button of the payment dialog is the last one in its actions row.
    const confirm = t.overlayButtons().filter((b) => b.classList.contains('mat-mdc-unelevated-button')).at(-1)!;
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await t.settle();
    // Success dialog: "Yangi savdo" is its primary button.
    expect(t.dialogs()).toBe(1);
    const newSale = t.overlayButtons().find((b) => b.textContent?.includes('pos.newSale'))!;
    newSale.click();
    await t.settle();
  }

  it('starts the next sale with an empty cart and working buttons', async () => {
    const t = await setup();
    const pos = t.fixture.componentInstance;

    t.tile('Sement').click();
    t.tile('Sement').click();
    t.tile('Mix').click();
    await t.settle();
    expect(pos.cart().length).toBe(2);
    expect(t.payButton().disabled).toBe(false);

    await payAndFinish(t);

    expect(createSale).toHaveBeenCalledTimes(1);
    expect(createSale.mock.calls[0][0].items.map((i: { quantity: number }) => i.quantity)).toEqual([2, 1]);
    expect(t.dialogs()).toBe(0);
    expect(pos.cart()).toEqual([]);
    expect(pos.submitting()).toBe(false);
    expect(t.root.querySelectorAll('.pos-line').length).toBe(0);
    expect(t.payButton().disabled).toBe(true);

    // Second sale: only the new product, quantity from 1, and checkout works again.
    t.tile('Mix').click();
    await t.settle();
    expect(pos.cart().map((i) => [i.productId, i.quantity])).toEqual([['p2', 1]]);
    expect(t.root.querySelectorAll('.pos-line').length).toBe(1);
    expect(t.payButton().disabled).toBe(false);

    await payAndFinish(t);
    expect(createSale).toHaveBeenCalledTimes(2);
    expect(createSale.mock.calls[1][0].items).toHaveLength(1);
    expect(pos.cart()).toEqual([]);
  });

  it('keeps the till usable when saving the sale fails', async () => {
    createSale.mockImplementationOnce(() => throwError(() => new Error('permission-denied')));
    const t = await setup();
    const pos = t.fixture.componentInstance;

    t.tile('Sement').click();
    await t.settle();
    t.payButton().click();
    await t.settle();
    t.overlayButtons().filter((b) => b.classList.contains('mat-mdc-unelevated-button')).at(-1)!.click();
    await t.settle();

    expect(pos.submitting()).toBe(false);
    expect(pos.cart().length).toBe(1);
    expect(t.payButton().disabled).toBe(false);
    expect(t.dialogs()).toBe(0);
  });

  it('does not lock the till when building the sale throws', async () => {
    createSale.mockImplementationOnce(() => {
      throw new Error('Unsupported field value: undefined');
    });
    const t = await setup();
    const pos = t.fixture.componentInstance;

    t.tile('Sement').click();
    await t.settle();
    t.payButton().click();
    await t.settle();
    t.overlayButtons().filter((b) => b.classList.contains('mat-mdc-unelevated-button')).at(-1)!.click();
    await t.settle();

    expect(pos.submitting()).toBe(false);
    expect(t.payButton().disabled).toBe(false);
  });

  it('still sells when the recent-sales read fails (e.g. index not built yet)', async () => {
    TestBed.overrideProvider(SalesService, {
      useValue: { getSalesInRange: () => throwError(() => new Error('failed-precondition')), createSale }
    });
    const t = await setup();
    t.tile('Sement').click();
    await t.settle();
    expect(t.fixture.componentInstance.cart().length).toBe(1);
    await payAndFinish(t);
    expect(createSale).toHaveBeenCalledTimes(1);
    expect(t.fixture.componentInstance.cart()).toEqual([]);
  });
});
