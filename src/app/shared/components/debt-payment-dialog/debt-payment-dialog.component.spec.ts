import { TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DebtPaymentDialogComponent } from './debt-payment-dialog.component';
import { DebtService } from '../../../core/services/debt.service';
import { AuthService } from '../../../core/services/auth.service';
import { ShiftService } from '../../../core/services/shift.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';

describe('DebtPaymentDialogComponent physical keyboard', () => {
  async function setup() {
    const collectPayment = vi.fn(() => of({}));
    TestBed.configureTestingModule({
      imports: [DebtPaymentDialogComponent],
      providers: [
        provideTranslateService(),
        { provide: MAT_DIALOG_DATA, useValue: { customerId: 'c1' } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: DebtService,
          useValue: {
            getCustomers: () => of([{ id: 'c1', name: 'Test', phone: '+998' }]),
            getDebts: () => of([{ id: 'd1', customerId: 'c1', remainingAmount: 267897, createdAt: new Date() }]),
            collectPayment
          }
        },
        { provide: AuthService, useValue: { getCurrentUser: () => ({ uid: 'u1' }) } },
        { provide: ShiftService, useValue: { getOpenShiftForUser: () => of(undefined) } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: TranslationService, useValue: { translate: (k: string) => k } }
      ]
    });
    TestBed.overrideComponent(DebtPaymentDialogComponent, {
      remove: { imports: [CurrencyDisplayPipe] },
      add: { imports: [StubCurrencyPipe] }
    });
    const fixture = TestBed.createComponent(DebtPaymentDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, dialog: fixture.componentInstance, collectPayment };
  }

  async function press(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }, key: string) {
    // Longer than the scanner's burst window: this is a person typing.
    await new Promise((r) => setTimeout(r, 60));
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('types the amount and accepts it with Enter', async () => {
    const { fixture, dialog, collectPayment } = await setup();
    for (const key of ['5', '0', '0', '0', '0']) await press(fixture, key);
    expect(dialog.amountText()).toBe('50000');
    await press(fixture, 'Backspace');
    expect(dialog.amountText()).toBe('5000');
    await press(fixture, 'Enter');
    expect(collectPayment).toHaveBeenCalledTimes(1);
    expect((collectPayment.mock.calls as unknown as [{ amount: number }][])[0][0].amount).toBe(5000);
  });

  it('replaces a quick amount on the next key instead of appending to it', async () => {
    const { fixture, dialog } = await setup();
    dialog.setQuickAmount(dialog.owedNow());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(dialog.amount()).toBe(267897);
    await press(fixture, '5');
    expect(dialog.amountText()).toBe('5');
  });

  it('does nothing on Enter with no amount', async () => {
    const { fixture, collectPayment } = await setup();
    await press(fixture, 'Enter');
    expect(collectPayment).not.toHaveBeenCalled();
  });
});


@Pipe({ name: 'currencyDisplay', standalone: true })
class StubCurrencyPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return String(value ?? 0);
  }
}
