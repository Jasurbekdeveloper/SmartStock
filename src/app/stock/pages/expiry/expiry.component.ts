import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { Product, ProductService } from '../../../core/services/product.service';
import { AuthService } from '../../../core/services/auth.service';
import { TranslationService } from '../../../core/services/translation.service';
import { PRODUCT_UNITS } from '../../../core/constants/units';
import { daysUntilExpiry, expiryState } from '../../../core/utils/price-tier';
import { roundMoney } from '../../../core/utils/pos-math';

type ExpiryFilter = 'expired' | 'soon' | 'all';

/** Products with a best-before date: what has expired, what expires soon. */
@Component({
  selector: 'app-expiry',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, TranslatePipe, CurrencyDisplayPipe, SumPipe],
  templateUrl: './expiry.component.html'
})
export class ExpiryComponent {
  private translation = inject(TranslationService);
  private auth = inject(AuthService);
  canSeeCost = computed(() => this.auth.can('products.viewCost'));
  products = toSignal(inject(ProductService).getProducts(), { initialValue: [] as Product[] });

  warnDays = signal(30);
  filter = signal<ExpiryFilter>('soon');

  private tracked = computed(() =>
    this.products()
      .filter((p) => p.expiryDate)
      .map((p) => ({ product: p, days: daysUntilExpiry(p.expiryDate) as number, state: expiryState(p.expiryDate, this.warnDays()) }))
      .sort((a, b) => a.days - b.days)
  );

  expired = computed(() => this.tracked().filter((r) => r.state === 'expired' && r.product.quantity > 0));
  soon = computed(() => this.tracked().filter((r) => r.state === 'soon' && r.product.quantity > 0));

  rows = computed(() => {
    switch (this.filter()) {
      case 'expired':
        return this.expired();
      case 'soon':
        return [...this.expired(), ...this.soon()];
      default:
        return this.tracked();
    }
  });

  private value = (rows: { product: Product }[]) => roundMoney(rows.reduce((s, r) => s + r.product.quantity * (r.product.cost || 0), 0));
  expiredValue = computed(() => this.value(this.expired()));
  soonValue = computed(() => this.value(this.soon()));
  trackedCount = computed(() => this.tracked().length);

  unitLabel(unit: string | undefined): string {
    if (!unit) return '';
    return (PRODUCT_UNITS as readonly string[]).includes(unit) ? this.translation.translate('units.' + unit) : unit;
  }
}
