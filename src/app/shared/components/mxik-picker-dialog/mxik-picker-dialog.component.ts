import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { MxikPackage, MxikResult, MxikSelection, MxikService } from '../../../core/services/mxik.service';
import { pickPackageForUnit } from '../../../core/utils/fiscal-receipt';

export interface MxikPickerData {
  /** Product name — the first search. */
  name: string;
  barcode?: string | null;
  currentCode?: string | null;
  /** Product unit (dona, kg, qop…): the matching package is pre-selected. */
  unit?: string | null;
}

/**
 * Finds the MXIK (IKPU) code without leaving the form: searches tasnif.soliq.uz by the
 * product's barcode and name (Latin or Cyrillic, Uzbek or Russian), then offers the
 * code's package (o'lchov birligi) codes. Closes with an MxikSelection.
 */
@Component({
  selector: 'app-mxik-picker-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'mxik.title' | translate }}</h2>
    <mat-dialog-content class="!pt-1 mxik">
      @if (!picked()) {
      <label class="search-box !min-w-0 w-full">
        <mat-icon>search</mat-icon>
        <input
          type="search"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          (keydown.enter)="run(); $event.preventDefault()"
          [placeholder]="'mxik.placeholder' | translate"
          autocomplete="off"
          cdkFocusInitial
        />
        <button mat-flat-button color="primary" type="button" class="!h-9 shrink-0" (click)="run()">{{ 'common.search' | translate }}</button>
      </label>
      <p class="text-xs text-muted mt-2">{{ 'mxik.hint' | translate }}</p>
      @if (loading()) { <mat-progress-bar mode="indeterminate" class="mt-3" /> }

      <div class="mt-3 space-y-2">
        @for (r of results(); track r.mxikCode) {
        <button type="button" class="mxik__row" [class.mxik__row--best]="r.byBarcode" (click)="choose(r)">
          <span class="min-w-0 flex-1 text-left">
            <span class="block font-semibold leading-snug">{{ r.name }}</span>
            @if (r.path) { <span class="block text-xs text-muted truncate">{{ r.path }}</span> }
          </span>
          <span class="shrink-0 text-right">
            <span class="block money text-sm font-semibold">{{ r.mxikCode }}</span>
            @if (r.byBarcode) { <span class="badge badge--green">{{ 'mxik.byBarcode' | translate }}</span> }
            @if (r.mxikCode === data.currentCode) { <span class="badge badge--gray">{{ 'mxik.current' | translate }}</span> }
          </span>
        </button>
        }
        @if (searched() && !loading() && results().length === 0) {
        <p class="text-sm text-muted py-4 text-center">{{ 'mxik.nothing' | translate }}</p>
        }
      </div>
      } @else {
      @let p = picked()!;
      <div class="rounded-xl border p-3" style="border-color: var(--border)">
        <p class="font-semibold leading-snug">{{ p.name }}</p>
        <p class="money text-sm mt-1">{{ p.mxikCode }}</p>
      </div>
      <p class="font-semibold mt-4 mb-1">{{ 'mxik.package' | translate }}</p>
      <p class="text-xs text-muted mb-2">{{ 'mxik.packageHint' | translate }}</p>
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      <div class="flex flex-wrap gap-2">
        @for (pk of packages(); track pk.code) {
        <button type="button" class="chip" [class.chip--active]="packageCode() === pk.code" (click)="packageCode.set(pk.code)">
          {{ pk.name || pk.code }}
        </button>
        }
        @if (!loading() && packages().length === 0) { <p class="text-sm text-muted">{{ 'mxik.noPackages' | translate }}</p> }
      </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <a mat-button href="https://tasnif.soliq.uz/" target="_blank" rel="noopener" class="!mr-auto">
        <mat-icon>open_in_new</mat-icon>tasnif.soliq.uz
      </a>
      @if (picked()) {
      <button mat-button type="button" (click)="picked.set(null)">{{ 'common.back' | translate }}</button>
      <button mat-flat-button color="primary" type="button" (click)="confirm()">{{ 'common.select' | translate }}</button>
      } @else {
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .mxik { min-width: min(640px, 86vw); }
    .mxik__row {
      width: 100%; display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 0.85rem;
      border-radius: 12px; border: 1px solid var(--border); background: var(--surface); color: var(--text);
      min-height: 3.5rem;
    }
    .mxik__row--best { border-color: var(--success); background: var(--success-soft, var(--surface-2)); }
    @media (hover: hover) { .mxik__row:hover { border-color: var(--brand); } }
  `
})
export class MxikPickerDialogComponent {
  readonly data = inject<MxikPickerData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<MxikPickerDialogComponent, MxikSelection>);
  private mxik = inject(MxikService);

  query = signal(this.data.name ?? '');
  results = signal<MxikResult[]>([]);
  loading = signal(false);
  searched = signal(false);
  picked = signal<MxikResult | null>(null);
  packages = signal<MxikPackage[]>([]);
  packageCode = signal<string | null>(null);
  private runId = 0;

  constructor() {
    if (this.query().trim() || this.data.barcode) this.run();
  }

  async run() {
    const id = ++this.runId;
    this.loading.set(true);
    const results = await this.mxik.search(this.query(), this.data.barcode);
    if (id !== this.runId) return;
    this.results.set(results);
    this.searched.set(true);
    this.loading.set(false);
  }

  async choose(result: MxikResult) {
    this.picked.set(result);
    this.packages.set([]);
    this.packageCode.set(null);
    this.loading.set(true);
    const card = await this.mxik.card(result.mxikCode);
    this.loading.set(false);
    if (this.picked() !== result) return;
    const packages = card?.packages ?? [];
    this.packages.set(packages);
    // Each MXIK code has its own packages; the one matching the product's unit is
    // chosen for the cashier (most codes have a single package anyway).
    this.packageCode.set(pickPackageForUnit(packages, this.data.unit)?.code ?? null);
  }

  confirm() {
    const p = this.picked();
    if (!p) return;
    const pk = this.packages().find((x) => x.code === this.packageCode()) ?? null;
    this.ref.close({ mxikCode: p.mxikCode, mxikName: p.name, packageCode: pk?.code ?? null, packageName: pk?.name ?? null });
  }
}
