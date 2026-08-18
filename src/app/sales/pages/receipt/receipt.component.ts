import { Component, DOCUMENT, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SalesService, Sale } from '../../../core/services/sales.service';
import { DebtService } from '../../../core/services/debt.service';
import {
  DEFAULT_RECEIPT_PAPER_WIDTH,
  DEFAULT_STORE_NAME,
  SettingsService
} from '../../../core/services/settings.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';

/**
 * Dedicated, isolated print target for one sale — kept as its own route
 * (rather than reusing sale-detail's page) so the `@page` print CSS only
 * ever applies to this narrow receipt layout, never to the full app shell.
 */
@Component({
  selector: 'app-receipt',
  standalone: true,
  imports: [CommonModule, TranslatePipe, SumPipe, CurrencyDisplayPipe, MatButtonModule, MatIconModule],
  templateUrl: './receipt.component.html',
  styleUrl: './receipt.component.css'
})
export class ReceiptComponent implements OnInit {
  private salesService = inject(SalesService);
  private debtService = inject(DebtService);
  private settingsService = inject(SettingsService);
  private route = inject(ActivatedRoute);
  private document = inject(DOCUMENT);

  sale = signal<Sale | null>(null);
  customers = toSignal(this.debtService.getCustomers(), { initialValue: [] });

  /** `null` until `settings/general` has been saved at least once — both signals below
   *  fall back to sensible defaults in that case. */
  generalSettings = toSignal(this.settingsService.getGeneralSettings(), { initialValue: null });

  paperWidth = computed(() => this.generalSettings()?.receiptPaperWidth ?? DEFAULT_RECEIPT_PAPER_WIDTH);

  storeName = computed(() => this.generalSettings()?.storeName ?? DEFAULT_STORE_NAME);

  private printTriggered = false;

  constructor() {
    // The @page rule's `size` can't react to a template class binding, so we
    // keep it in sync with the paperWidth signal by writing a small <style>
    // tag into <head> directly.
    effect(() => {
      const mm = this.paperWidth() === '58' ? '58' : '80';
      let styleEl = this.document.getElementById('receipt-page-size') as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = this.document.createElement('style');
        styleEl.id = 'receipt-page-size';
        this.document.head.appendChild(styleEl);
      }
      styleEl.textContent = `@page { size: ${mm}mm auto; margin: 0; }`;
    });

    // Auto-trigger the print dialog once the sale has actually loaded, so a
    // cashier who opened this via "Print Receipt" doesn't have to click
    // anything else — but only once, and only after real data is in.
    effect(() => {
      const sale = this.sale();
      if (sale && !this.printTriggered) {
        this.printTriggered = true;
        setTimeout(() => window.print(), 150);
      }
    });
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.salesService.getSaleById(id).subscribe(sale => {
        this.sale.set(sale ?? null);
      });
    }
  }

  customerName(customerId: string): string {
    return this.customers().find(c => c.id === customerId)?.name ?? customerId;
  }

  print() {
    window.print();
  }
}
