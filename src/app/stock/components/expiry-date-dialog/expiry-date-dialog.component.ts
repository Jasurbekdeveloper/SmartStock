import { Component, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCalendar, MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

export interface ExpiryDateDialogData {
  productName: string;
  /** Current best-before date of the batch. */
  expiryDate: Date;
  manufactureDate?: Date | null;
  /** e.g. "#A-102 · 12 dona" */
  detail?: string;
}

/**
 * Picks a new best-before date on a calendar — for extending a batch whose date the
 * supplier prolonged, or fixing a typo. Quick buttons add days to the current date.
 * Closes with the chosen Date, or undefined when cancelled.
 */
@Component({
  selector: 'app-expiry-date-dialog',
  standalone: true,
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatDatepickerModule, MatIconModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title class="!flex items-center gap-2">
      <mat-icon>edit_calendar</mat-icon>{{ 'expiry.changeDate' | translate }}
    </h2>
    <mat-dialog-content class="!pt-1">
      <p class="font-semibold leading-snug">{{ data.productName }}</p>
      @if (data.detail) { <p class="text-sm text-muted">{{ data.detail }}</p> }
      <p class="text-sm mt-1">
        {{ 'expiry.currentDate' | translate }}: <b>{{ data.expiryDate | date: 'dd.MM.yyyy' }}</b>
        @if (data.manufactureDate) {
        <span class="text-muted"> · {{ 'products.manufactureDate' | translate }}: {{ data.manufactureDate | date: 'dd.MM.yyyy' }}</span>
        }
      </p>

      <div class="flex flex-wrap gap-2 mt-3">
        @for (d of quick; track d) {
        <button mat-stroked-button type="button" class="!h-8 !px-3" (click)="extend(d)">+{{ d }} {{ 'expiry.days' | translate }}</button>
        }
      </div>

      <mat-calendar class="mt-2 rounded-xl" [selected]="picked()" [startAt]="picked()" [minDate]="minDate" (selectedChange)="pick($event)" />

      <p class="text-center text-sm">
        {{ 'expiry.newDate' | translate }}: <b class="text-base">{{ picked() | date: 'dd.MM.yyyy' }}</b>
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button color="primary" type="button" [disabled]="unchanged()" (click)="ref.close(picked())">
        <mat-icon>check</mat-icon>{{ 'common.save' | translate }}
      </button>
    </mat-dialog-actions>
  `
})
export class ExpiryDateDialogComponent {
  data = inject<ExpiryDateDialogData>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<ExpiryDateDialogComponent, Date | undefined>);

  readonly quick = [7, 30, 90, 180];
  /** A batch cannot expire before it was made. */
  readonly minDate = this.data.manufactureDate ? startOfDay(this.data.manufactureDate) : null;
  picked = signal(startOfDay(this.data.expiryDate));
  private calendar = viewChild(MatCalendar<Date>);

  pick(date: Date | null) {
    if (date) this.picked.set(startOfDay(date));
  }

  /** Adds days to the current best-before date (not to today). */
  extend(days: number) {
    const d = startOfDay(this.data.expiryDate);
    d.setDate(d.getDate() + days);
    this.picked.set(d);
    // Turn the calendar to the month of the new date.
    const cal = this.calendar();
    if (cal) cal.activeDate = d;
  }

  unchanged(): boolean {
    return this.picked().getTime() === startOfDay(this.data.expiryDate).getTime();
  }
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
