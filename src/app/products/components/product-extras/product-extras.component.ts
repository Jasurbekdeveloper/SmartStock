import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { ProductExtrasDraft, fromDateInput, toDateInput } from '../../../core/utils/product-extras';
import { expiryFromShelfLife } from '../../../core/utils/batches';
import { formatNumber } from '../../../core/utils/format-number';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { NumericInputDirective } from '../../../shared/directives/numeric-input.directive';

/**
 * Wholesale price, alternate sale units and expiry/batch — one block reused by the
 * create, edit and quick-entry screens. Mutates the passed draft in place (template
 * forms elsewhere in those screens work the same way).
 */
@Component({
  selector: 'app-product-extras',
  standalone: true,
  imports: [SumPipe, NumericInputDirective, FormsModule, MatFormFieldModule, MatInputModule, MatIconModule, MatButtonModule, MatSlideToggleModule, MatTooltipModule, TranslatePipe],
  template: `
    @let d = draft();
    @if (section() === 'pricing' || section() === 'all') {
    <div class="field-grid">
      <mat-form-field appearance="outline" class="w-full" subscriptSizing="dynamic">
        <mat-label>{{ 'products.wholesalePrice' | translate }}</mat-label>
        <input matInput type="number" min="0" step="any" [(ngModel)]="d.wholesalePrice" [ngModelOptions]="{ standalone: true }" placeholder="0" />
        <mat-icon matSuffix class="!text-gray-400" [matTooltip]="'products.wholesaleHint' | translate">info</mat-icon>
        @if (wholesaleHint(); as note) {
        <mat-hint [class.text-loss]="note.bad">{{ note.text }}</mat-hint>
        }
      </mat-form-field>
      <mat-form-field appearance="outline" class="w-full" subscriptSizing="dynamic">
        <mat-label>{{ 'products.wholesaleMinQty' | translate }}</mat-label>
        <input matInput type="number" min="0" step="any" [(ngModel)]="d.wholesaleMinQty" [ngModelOptions]="{ standalone: true }" [disabled]="!(+(d.wholesalePrice ?? 0) > 0)" placeholder="—" />
        <span matTextSuffix class="text-xs opacity-70">{{ unitLabel() }}</span>
        <mat-hint>{{ 'products.wholesaleMinQtyHint' | translate }}</mat-hint>
      </mat-form-field>
    </div>
    }

    @if (section() === 'stock' || section() === 'all') {
    <div class="space-y-2">
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-sm font-semibold">{{ 'products.altUnits' | translate }}</p>
          <p class="text-xs text-muted">{{ 'products.altUnitsShortHint' | translate }}</p>
        </div>
        <button mat-stroked-button type="button" (click)="addUnit()">
          <mat-icon>add</mat-icon>{{ 'products.addUnit' | translate }}
        </button>
      </div>
      @for (row of d.altUnits; track $index; let i = $index) {
      <div class="xu-row">
        <span class="text-sm text-muted">1</span>
        <input class="xu-input" [(ngModel)]="row.unit" [ngModelOptions]="{ standalone: true }" [placeholder]="'products.unitNamePlaceholder' | translate" list="xu-presets" />
        <span class="text-sm text-muted">=</span>
        <input class="xu-input xu-input--num money" type="number" min="0" step="any" [(ngModel)]="row.factor" [ngModelOptions]="{ standalone: true }" placeholder="20" />
        <span class="text-sm text-muted truncate">{{ unitLabel() }}</span>
        <button type="button" class="xu-del" (click)="removeUnit(i)" [attr.aria-label]="'common.delete' | translate">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      }
      <datalist id="xu-presets">
        <option value="quti"></option><option value="karobka"></option><option value="blok"></option>
        <option value="pachka"></option><option value="qop"></option><option value="yashik"></option>
      </datalist>
    </div>

    <div class="mt-5 rounded-2xl p-4 xu-expiry">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-start gap-3">
          <span class="stat__icon tone-amber !w-9 !h-9"><mat-icon class="!text-[20px] !w-5 !h-5">event</mat-icon></span>
          <div>
            <p class="text-sm font-semibold">{{ 'products.trackExpiry' | translate }}</p>
            <p class="text-xs text-muted">{{ 'products.trackExpiryHint' | translate }}</p>
          </div>
        </div>
        <mat-slide-toggle [(ngModel)]="d.trackExpiry" [ngModelOptions]="{ standalone: true }" (ngModelChange)="trackExpiryChange.emit($event)" [attr.aria-label]="'products.trackExpiry' | translate"></mat-slide-toggle>
      </div>
      @if (d.trackExpiry) {
      <div class="field-grid mt-4">
        <mat-form-field appearance="outline" class="w-full" subscriptSizing="dynamic">
          <mat-label>{{ 'products.shelfLifeDays' | translate }}</mat-label>
          <input matInput type="number" min="0" step="1" [(ngModel)]="d.shelfLifeDays" [ngModelOptions]="{ standalone: true }" (ngModelChange)="autoExpiry()" placeholder="—" />
          <span matTextSuffix class="text-xs opacity-70">{{ 'expiry.days' | translate }}</span>
          <mat-hint>{{ 'products.shelfLifeHint' | translate }}</mat-hint>
        </mat-form-field>
      </div>

      @if (batchQuantity() > 0) {
      <div class="mt-4 rounded-xl p-3 xu-batch">
        <p class="mb-3 text-sm font-semibold">
          {{ (batchMode() === 'existing' ? 'products.batchForStock' : 'products.batchForNew') | translate }}
          <span class="font-normal text-muted">— {{ batchQuantity() | sum:3 }} {{ unitLabel() }}</span>
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-3 items-start">
          <mat-form-field appearance="outline" class="w-full" subscriptSizing="dynamic">
            <mat-label>{{ 'products.manufactureDate' | translate }}</mat-label>
            <input matInput type="date" [(ngModel)]="d.manufactureDate" [ngModelOptions]="{ standalone: true }" (ngModelChange)="autoExpiry()" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="w-full" subscriptSizing="dynamic">
            <mat-label>{{ 'products.expiryDate' | translate }} *</mat-label>
            <input matInput type="date" [(ngModel)]="d.expiryDate" [ngModelOptions]="{ standalone: true }" (ngModelChange)="expiryTouched = true" />
            @if (autoFilled) { <mat-hint>{{ 'products.expiryAuto' | translate }}</mat-hint> }
          </mat-form-field>
          <mat-form-field appearance="outline" class="w-full" subscriptSizing="dynamic">
            <mat-label>{{ 'products.batchNo' | translate }}</mat-label>
            <input matInput [(ngModel)]="d.batchNo" [ngModelOptions]="{ standalone: true }" maxlength="40" />
          </mat-form-field>
        </div>
      </div>
      } @else {
      <p class="mt-3 text-xs text-muted flex items-center gap-1.5">
        <mat-icon class="!w-4 !h-4 !text-base">info</mat-icon>{{ 'products.batchesViaStockIn' | translate }}
      </p>
      }
      }
    </div>
    }
  `,
  styles: `
    :host { display: block; }
    .xu-row {
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto 6.5rem minmax(0, 5rem) auto;
      align-items: center; gap: 0.5rem; padding: 0.4rem 0.4rem 0.4rem 0.8rem;
      border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2);
    }
    .xu-input {
      width: 100%; padding: 0.45rem 0.6rem; border: 1px solid var(--border-strong); border-radius: 9px;
      background: var(--surface); color: var(--text); outline: none; font-size: 0.9rem;
    }
    .xu-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-ring); }
    .xu-input--num { text-align: right; }
    .xu-del { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 999px; color: var(--text-faint); }
    .xu-del:hover { background: var(--danger-soft); color: var(--danger); }
    .xu-del mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .xu-expiry { background: var(--surface-2); border: 1px solid var(--border); }
    .xu-batch { background: var(--surface); border: 1px dashed var(--border-strong); }
  `
})
export class ProductExtrasComponent {
  draft = input.required<ProductExtrasDraft>();
  /** Which part to render, so a form can place pricing and stock in different sections. */
  section = input<'pricing' | 'stock' | 'all'>('all');
  unitLabel = input('');
  /** Retail price and cost, for the wholesale hint. */
  price = input<number | null | undefined>(0);
  cost = input<number | null | undefined>(0);
  showCost = input(false);
  /** Units the form brings in (create: initial quantity; edit: stock on hand without
   *  batches yet). > 0 shows the date fields for that first batch. */
  batchQuantity = input(0);
  /** 'new' = stock entered with a new product, 'existing' = stock already on hand. */
  batchMode = input<'new' | 'existing'>('new');
  /** Emits when the user flips the switch by hand. */
  trackExpiryChange = output<boolean>();

  /** The expiry was typed by hand — stop overwriting it from the shelf life. */
  expiryTouched = false;
  autoFilled = false;

  /** Manufacture date + shelf life → expiry, unless the user typed one. */
  autoExpiry() {
    const d = this.draft();
    if (this.expiryTouched && d.expiryDate) return;
    const exp = expiryFromShelfLife(fromDateInput(d.manufactureDate), Number(d.shelfLifeDays) || null);
    if (exp) {
      d.expiryDate = toDateInput(exp);
      this.autoFilled = true;
    }
  }

  addUnit() {
    this.draft().altUnits.push({ unit: '', factor: null });
  }

  removeUnit(index: number) {
    this.draft().altUnits.splice(index, 1);
  }

  /** Discount of the wholesale price vs retail, and margin vs cost (staff only). */
  wholesaleHint(): { text: string; bad: boolean } | null {
    const w = Number(this.draft().wholesalePrice);
    const p = Number(this.price());
    if (!(w > 0) || !(p > 0)) return null;
    const off = Math.round((1 - w / p) * 1000) / 10;
    const c = Number(this.cost());
    const parts = [`${off > 0 ? '−' : '+'}${Math.abs(off)}%`];
    if (this.showCost() && c > 0) parts.push(`${formatNumber(w - c, 0)}`);
    return { text: parts.join(' · '), bad: this.showCost() && c > 0 && w < c };
  }
}
