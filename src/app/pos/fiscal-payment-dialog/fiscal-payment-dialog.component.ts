import { AfterViewInit, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../core/pipes/currency-display.pipe';
import { FiscalPaymentState, FiscalService, PaymentSystem, fiscalErrorText } from '../../core/services/fiscal.service';
import { TranslationService } from '../../core/services/translation.service';

export interface FiscalPaymentDialogData {
  system: PaymentSystem;
  /** So'm. */
  amount: number;
}

/**
 * Takes a payment through the virtual cash register (Click Pass, Payme Go, Uzum, a bank
 * terminal…). Token systems: the cashier scans the code on the customer's phone. QR
 * systems: the customer scans the QR shown here. Closes with the payment id, which the
 * sale's fiscal receipt then refers to.
 */
@Component({
  selector: 'app-fiscal-payment-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule, TranslatePipe, CurrencyDisplayPipe],
  template: `
    <h2 mat-dialog-title>{{ data.system.name }} · {{ data.amount | currencyDisplay:0 }}</h2>
    <mat-dialog-content class="vp">
      @switch (stage()) {
      @case ('token') {
      <p class="text-sm mb-3">{{ 'payments.scanCustomerCode' | translate }}</p>
      <label class="search-box !min-w-0 w-full">
        <mat-icon>qr_code_scanner</mat-icon>
        <input #tokenInput type="text" inputmode="numeric" autocomplete="off" [value]="token()" (input)="token.set($any($event.target).value)"
          (keydown.enter)="submitToken(); $event.preventDefault()" [placeholder]="'payments.codePlaceholder' | translate" />
      </label>
      }
      @case ('qr') {
      <p class="text-sm mb-3 text-center">{{ 'payments.customerScansQr' | translate }}</p>
      <div class="vp__qr" [innerHTML]="qrSvg()"></div>
      <mat-progress-bar mode="indeterminate" class="mt-3" />
      }
      @case ('waiting') {
      <p class="text-sm mb-3">{{ 'payments.waiting' | translate }}</p>
      <mat-progress-bar mode="indeterminate" />
      }
      @case ('done') {
      <p class="text-lg font-bold text-profit flex items-center gap-2"><mat-icon>check_circle</mat-icon>{{ 'payments.paid' | translate }}</p>
      }
      }
      @if (error()) { <p class="badge badge--red !flex !rounded-lg !px-3 !py-2 mt-3 w-full">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancel()">{{ 'common.cancel' | translate }}</button>
      @if (stage() === 'token') {
      <button mat-flat-button color="primary" type="button" [disabled]="!token().trim() || busy()" (click)="submitToken()">{{ 'payments.charge' | translate }}</button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .vp { min-width: min(420px, 86vw); }
    .vp__qr { display: flex; justify-content: center; background: #fff; padding: 12px; border-radius: 12px; }
    :host ::ng-deep .vp__qr svg { width: 240px; height: 240px; }
  `
})
export class FiscalPaymentDialogComponent implements AfterViewInit {
  readonly data = inject<FiscalPaymentDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<FiscalPaymentDialogComponent, string>);
  private fiscal = inject(FiscalService);
  private translation = inject(TranslationService);
  private tokenInput = viewChild<ElementRef<HTMLInputElement>>('tokenInput');

  stage = signal<'token' | 'qr' | 'waiting' | 'done'>(this.data.system.needsToken ? 'token' : 'waiting');
  token = signal('');
  busy = signal(false);
  error = signal<string | null>(null);
  qrSvg = signal<SafeHtml>('');
  private sanitizer = inject(DomSanitizer);
  /** Same id on a retry → the register returns the same payment instead of charging twice. */
  private externalId = `mh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  private payment: FiscalPaymentState | null = null;
  private stopped = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.stopped = true));
    if (!this.data.system.needsToken) void this.start();
  }

  ngAfterViewInit() {
    setTimeout(() => this.tokenInput()?.nativeElement.focus(), 50);
  }

  private amountTiyin() {
    return Math.round(this.data.amount * 100);
  }

  async submitToken() {
    const token = this.token().trim();
    if (!token || this.busy()) return;
    await this.start(token);
  }

  private async start(token?: string) {
    this.busy.set(true);
    this.error.set(null);
    try {
      let p = this.payment ?? (await this.fiscal.startPayment(this.data.system.id, this.amountTiyin(), this.externalId, token));
      if (this.payment && token) p = await this.fiscal.confirmPayment(this.payment.id, token);
      this.payment = p;
      if (p.needsToken && !token) {
        this.stage.set('token');
        return;
      }
      if (p.qrText) {
        this.stage.set('qr');
        await this.renderQr(p.qrText);
      } else {
        this.stage.set('waiting');
      }
      await this.poll();
    } catch (err) {
      this.error.set(fiscalErrorText(err as Error, (k) => this.translation.translate(k)));
      if (this.data.system.needsToken) this.stage.set('token');
    } finally {
      this.busy.set(false);
    }
  }

  private async poll() {
    const deadline = Date.now() + 5 * 60_000;
    while (!this.stopped && this.payment && Date.now() < deadline) {
      if (this.data.system.success.includes(this.payment.status)) {
        this.stage.set('done');
        const id = this.payment.id;
        setTimeout(() => this.ref.close(id), 600);
        return;
      }
      if (this.data.system.failure.includes(this.payment.status)) {
        this.error.set(this.translation.translate('payments.failed'));
        this.payment = null;
        this.externalId = `mh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (this.data.system.needsToken) {
          this.token.set('');
          this.stage.set('token');
        }
        return;
      }
      await new Promise((r) => setTimeout(r, Math.max(1, this.payment!.pollAfter ?? 2) * 1000));
      if (this.stopped) return;
      this.payment = await this.fiscal.getPayment(this.payment.id);
    }
  }

  private async renderQr(text: string) {
    const { BrowserQRCodeSvgWriter } = await import('@zxing/browser');
    const svg = new BrowserQRCodeSvgWriter().write(text, 240, 240);
    // Markup we just generated ourselves; Angular would otherwise strip the SVG.
    this.qrSvg.set(this.sanitizer.bypassSecurityTrustHtml(svg.outerHTML));
  }

  async cancel() {
    this.stopped = true;
    const p = this.payment;
    if (p && !this.data.system.success.includes(p.status)) {
      // Nothing must stay "half paid": cancel what was started (ignore if it can't be).
      this.fiscal.cancelPayment(p.id).catch(() => undefined);
    }
    this.ref.close();
  }
}
