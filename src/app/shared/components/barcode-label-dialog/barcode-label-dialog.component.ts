import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import JsBarcode from 'jsbarcode';
import { DomSanitizer } from '@angular/platform-browser';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SettingsService } from '../../../core/services/settings.service';
import { formatNumber } from '../../../core/utils/format-number';
import {
  LABEL_MM,
  LabelItem,
  LabelSettings,
  LabelSize,
  barcodeFormatFor,
  buildLabelsHtml,
  clampCopies,
  totalLabels,
  withLabelDefaults
} from '../../../core/utils/labels';

export interface BarcodeLabelDialogData {
  /** One or many products; `copies` is the starting count (e.g. received quantity). */
  items: LabelItem[];
}

/**
 * Prints barcode labels: any number of products, N copies each, with or without
 * the price. Defaults come from Settings → Labels; changes here apply to this print only.
 */
@Component({
  selector: 'app-barcode-label-dialog',
  standalone: true,
  imports: [TranslatePipe, MatDialogModule, MatButtonModule, MatIconModule, MatSlideToggleModule],
  template: `
    <h2 mat-dialog-title>{{ 'labels.title' | translate }}</h2>
    <mat-dialog-content class="lbl">
      <div class="lbl__opts">
        <div class="seg">
          @for (s of sizes; track s) {
          <button type="button" [class.seg--on]="opts().size === s" (click)="patch({ size: s })">{{ s === 'a4' ? 'A4' : s + ' mm' }}</button>
          }
        </div>
        <div class="flex flex-wrap gap-x-5 gap-y-2">
          <mat-slide-toggle [checked]="opts().showPrice" (change)="patch({ showPrice: $event.checked })">{{ 'labels.showPrice' | translate }}</mat-slide-toggle>
          <mat-slide-toggle [checked]="opts().showName" (change)="patch({ showName: $event.checked })">{{ 'labels.showName' | translate }}</mat-slide-toggle>
          <mat-slide-toggle [checked]="opts().showStore" (change)="patch({ showStore: $event.checked })">{{ 'labels.showStore' | translate }}</mat-slide-toggle>
        </div>
      </div>

      <div class="lbl__list">
        @for (item of items(); track $index; let i = $index) {
        <div class="lbl__row">
          <div class="min-w-0 flex-1">
            <p class="font-semibold truncate">{{ item.name }}</p>
            <p class="text-xs text-muted money">{{ item.barcode || ('labels.noBarcode' | translate) }}</p>
          </div>
          <div class="lbl__qty">
            <button type="button" (click)="setCopies(i, item.copies - 1)" [attr.aria-label]="'pos.decreaseQuantity' | translate">−</button>
            <input type="text" inputmode="numeric" class="money" [value]="item.copies" (input)="setCopies(i, $any($event.target).value)" [attr.aria-label]="'labels.copies' | translate" />
            <button type="button" (click)="setCopies(i, item.copies + 1)" [attr.aria-label]="'pos.increaseQuantity' | translate">+</button>
          </div>
        </div>
        }
      </div>

      @if (previewSvg(); as svg) {
      <p class="text-xs text-muted mt-4 mb-2">{{ 'labels.preview' | translate }}</p>
      <div class="lbl__preview" [style.width.mm]="mm().w" [style.height.mm]="mm().h">
        @if (opts().showStore && storeName()) { <div class="text-[7pt] text-gray-600">{{ storeName() }}</div> }
        @if (opts().showName) { <div class="lbl__pname">{{ items()[0].name }}</div> }
        <div class="lbl__svg" [innerHTML]="svg"></div>
        @if (opts().showPrice && items()[0].price) { <div class="lbl__pprice">{{ price(items()[0].price!) }}</div> }
      </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <span class="text-sm text-muted mr-auto">{{ 'labels.total' | translate }}: <b class="money">{{ total() }}</b></span>
      <button mat-button (click)="dialogRef.close()">{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button color="primary" [disabled]="total() === 0" (click)="print()">
        <mat-icon>print</mat-icon>{{ 'buttons.print' | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .lbl { min-width: min(560px, 88vw); }
    .lbl__opts { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem; }
    .lbl__list { display: flex; flex-direction: column; gap: 0.4rem; max-height: 40vh; overflow-y: auto; }
    .lbl__row { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 12px; }
    .lbl__qty { display: flex; align-items: center; border: 1px solid var(--border-strong); border-radius: 10px; overflow: hidden; }
    .lbl__qty button { width: 2.6rem; height: 2.6rem; font-size: 1.2rem; font-weight: 700; background: var(--surface-2); color: var(--text); }
    .lbl__qty input { width: 3.5rem; height: 2.6rem; text-align: center; border: 0; outline: 0; background: var(--surface); color: var(--text); font-weight: 700; }
    .lbl__preview { background: #fff; color: #000; border: 1px dashed #999; border-radius: 4px; padding: 1.5mm 2mm; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; text-align: center; max-width: 100%; }
    .lbl__pname { font: 700 8.5pt Arial, sans-serif; line-height: 1.1; max-height: 2.3em; overflow: hidden; }
    .lbl__pprice { font: 800 12pt Arial, sans-serif; }
    .lbl__svg { flex: 1 1 auto; min-height: 0; width: 100%; display: flex; align-items: center; justify-content: center; }
    :host ::ng-deep .lbl__svg svg { max-width: 100%; max-height: 100%; height: auto; }
  `
})
export class BarcodeLabelDialogComponent {
  dialogRef = inject(MatDialogRef<BarcodeLabelDialogComponent>);
  private data = inject<BarcodeLabelDialogData>(MAT_DIALOG_DATA);
  private settingsService = inject(SettingsService);

  readonly sizes: LabelSize[] = ['58x40', '40x30', '30x20', 'a4'];
  private settings = toSignal(this.settingsService.getGeneralSettings(), { initialValue: undefined });
  /** Changes made in this dialog; until then the saved settings apply. */
  private override = signal<Partial<LabelSettings>>({});
  opts = computed<LabelSettings>(() => ({ ...withLabelDefaults(this.settings()?.labelSettings), ...this.override() }));
  mm = computed(() => LABEL_MM[this.opts().size]);
  storeName = computed(() => this.settings()?.storeName ?? '');

  items = signal<LabelItem[]>(this.data.items.map((i) => ({ ...i, copies: clampCopies(i.copies || 1) })));
  total = computed(() => totalLabels(this.items().filter((i) => !!i.barcode)));
  private sanitizer = inject(DomSanitizer);
  /** Generated here by JsBarcode, so it's safe; Angular would otherwise strip the SVG. */
  previewSvg = computed(() => {
    const first = this.items().find((i) => i.barcode);
    return first ? this.sanitizer.bypassSecurityTrustHtml(this.barcodeSvg(first.barcode)) : null;
  });

  patch(p: Partial<LabelSettings>) {
    this.override.update((o) => ({ ...o, ...p }));
  }

  setCopies(index: number, value: unknown) {
    this.items.update((list) => list.map((item, i) => (i === index ? { ...item, copies: clampCopies(value) } : item)));
  }

  price(n: number): string {
    return `${formatNumber(n, 0)} ${this.settingsService.currencySymbol()}`;
  }

  private barcodeSvg(value: string): string {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      const small = this.opts().size === '30x20';
      JsBarcode(svg, value, {
        format: barcodeFormatFor(value),
        displayValue: true,
        width: small ? 1.4 : 2,
        height: small ? 34 : 60,
        fontSize: small ? 12 : 16,
        margin: 2
      });
    } catch {
      JsBarcode(svg, value, { format: 'CODE128', displayValue: true, width: 2, height: 60, margin: 2 });
    }
    return svg.outerHTML;
  }

  /** Prints through a hidden frame so only the labels are on the page, at label size. */
  print() {
    const html = buildLabelsHtml(this.items(), this.opts(), {
      storeName: this.storeName(),
      formatPrice: (n) => this.price(n),
      barcodeSvg: (v) => this.barcodeSvg(v)
    });
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1000);
    }, 200);
  }
}
