import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { ReturnDialogComponent, ReturnDialogData } from './return-dialog.component';
import { Sale } from '../../../core/services/sales.service';

const sale = {
  id: 's1',
  total: 10000,
  items: [{ productId: 'p1', productName: 'Sut', quantity: 2, price: 5000, total: 10000, finalTotal: 10000 }]
} as unknown as Sale;

function dialog(needsFiscalQr: boolean) {
  const close = vi.fn();
  const data: ReturnDialogData = { sale, previousReturns: [], needsFiscalQr };
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close } }
    ]
  });
  const component = TestBed.runInInjectionContext(() => new ReturnDialogComponent());
  component.setQty(0, 1);
  return { component, close };
}

describe('ReturnDialogComponent fiscal QR', () => {
  it('waits for the QR code of the paper receipt when the refund is fiscal', () => {
    const { component, close } = dialog(true);
    expect(component.canSubmit()).toBe(false);
    component.submit();
    expect(close).not.toHaveBeenCalled();

    component.fiscalQr.set('***');
    expect(component.canSubmit()).toBe(false);

    component.fiscalQr.set(' https://ofd.soliq.uz/check?t=VG1 ');
    expect(component.canSubmit()).toBe(true);
    component.submit();
    expect(close.mock.calls[0][0].originalQrCodeUrl).toBe('https://ofd.soliq.uz/check?t=VG1');
  });

  it('asks for nothing when the refund is not fiscal', () => {
    const { component, close } = dialog(false);
    expect(component.canSubmit()).toBe(true);
    component.submit();
    expect(close.mock.calls[0][0]).not.toHaveProperty('originalQrCodeUrl');
  });
});
