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
import { CashMovementService } from '../core/services/cash-movement.service';
import { BatchService } from '../core/services/batch.service';
import { TenantService } from '../core/services/tenant.service';
import { StockBatch } from '../core/utils/batches';

const cement: Product = {
  id: 'p1', name: 'Sement M400', barcode: '2000000000008', price: 50000, cost: 42000,
  quantity: 100, unit: 'dona', categoryId: 'c1', sku: 'SEM-400'
};
const nails: Product = {
  id: 'p2', name: 'Mix 100 mm', barcode: '2000000000015', price: 3000, cost: 2000,
  quantity: 500, unit: 'dona', categoryId: 'c2', sku: 'MIX-100'
};
const tiles: Product = {
  id: 'p3', name: 'Kafel 30x30', barcode: '2000000000022', price: 12000, cost: 9000,
  quantity: 400, unit: 'dona', categoryId: 'c2', wholesalePrice: 10000, wholesaleMinQty: 10
};
const milk: Product = {
  id: 'p4', name: 'Sut 1L', barcode: '2000000000039', price: 12000, cost: 9000,
  quantity: 5, unit: 'dona', categoryId: 'c3', trackExpiry: true
};
const inDays = (n: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
};
const activeBatches: StockBatch[] = [
  // Cement: the later delivery is listed first — FEFO must still pick the nearer date.
  { id: 'b-late', productId: 'p1', quantity: 60, initialQuantity: 60, expiryDate: inDays(200) },
  { id: 'b-soon', productId: 'p1', quantity: 1, initialQuantity: 10, expiryDate: inDays(20) },
  // Milk: only expired stock left.
  { id: 'b-milk', productId: 'p4', quantity: 5, initialQuantity: 5, expiryDate: inDays(-2) }
];
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
        { provide: ProductService, useValue: { getProducts: () => of([cement, nails, tiles, milk]) } },
        { provide: BatchService, useValue: { getActiveBatches: () => of(activeBatches) } },
        { provide: TenantService, useValue: { tenant: signal({ name: 'Test' }) } },
        { provide: CategoryService, useValue: { getCategories: () => of([]) } },
        { provide: SalesService, useValue: { getSalesInRange: () => of([]), getReturnsForShift: () => of([]), createSale } },
        { provide: CashMovementService, useValue: { getForShift: () => of([]), add: vi.fn(() => of('m1')) } },
        { provide: DebtService, useValue: { getCustomers: () => of([]), getCustomerDebts: () => of([]) } },
        { provide: AuthService, useValue: { currentUser$: of(cashier), getCurrentUser: () => cashier, can: () => true } },
        { provide: ShiftService, useValue: { getOpenShiftForUser: () => of({ id: 'sh1', cashierId: 'u1', startingCash: 0, status: 'open' }), getShiftSales: () => of([]) } },
        { provide: TranslationService, useValue: { translate: (k: string) => k, getLanguage: () => 'uz', setLanguage: () => undefined } },
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

  it('takes tracked goods from the nearest-expiry batch and blocks expired-only stock for a cashier', async () => {
    const t = await setup();
    const pos = t.fixture.componentInstance;

    t.tile('Sut').click();
    await t.settle();
    expect(pos.cart()).toEqual([]);

    t.tile('Sement').click();
    t.tile('Sement').click();
    t.tile('Mix').click();
    await t.settle();
    await payAndFinish(t);

    const [cementLine, nailsLine] = createSale.mock.calls[0][0].items;
    expect(cementLine.batches).toEqual([
      { batchId: 'b-soon', quantity: 1 },
      { batchId: 'b-late', quantity: 1 }
    ]);
    expect(nailsLine.batches).toBeUndefined();
  });

  it('sets quantity and discount of the selected line from the on-screen keypad', async () => {
    const t = await setup();
    const pos = t.fixture.componentInstance;
    t.tile('Sement').click();
    await t.settle();
    pos.selectLine('p1', 'qty');
    // The first key replaces the shown "1" instead of being appended to it.
    pos.onNumpadInput('5');
    pos.commitNumpad();
    expect(pos.cart()[0].quantity).toBe(5);
    pos.setNumpadMode('percent');
    pos.onNumpadInput('10');
    pos.commitNumpad();
    expect(pos.cart()[0].discount).toBe(25000);
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

  it('applies the wholesale price from the threshold and the ticket switch', async () => {
    const t = await setup();
    const pos = t.fixture.componentInstance;

    t.tile('Kafel').click();
    await t.settle();
    expect(pos.cart()[0].price).toBe(12000);

    pos.updateQuantity('p3', 10);
    await t.settle();
    expect(pos.cart()[0]).toMatchObject({ price: 10000, tier: 'wholesale' });

    pos.updateQuantity('p3', 2);
    expect(pos.cart()[0].price).toBe(12000);

    pos.setPriceTier('wholesale');
    expect(pos.cart()[0].price).toBe(10000);

    await payAndFinish(t);
    expect(createSale.mock.calls[0][0].items[0]).toMatchObject({ price: 10000, priceTier: 'wholesale' });
    expect(pos.priceTier()).toBe('retail');
  });
});
