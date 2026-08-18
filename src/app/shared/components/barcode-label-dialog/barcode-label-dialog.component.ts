import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import JsBarcode from 'jsbarcode';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

export interface BarcodeLabelDialogData {
  title: string;
  subtitle?: string;
  value: string;
}

@Component({
  selector: 'app-barcode-label-dialog',
  standalone: true,
  imports: [CommonModule, TranslatePipe, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="text-center print:shadow-none print:max-w-none">
      <h2 mat-dialog-title>{{ data.title }}</h2>
      <mat-dialog-content>
        @if (data.subtitle) {
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">{{ data.subtitle }}</p>
        }
        <canvas #barcodeCanvas class="mx-auto mt-2"></canvas>
      </mat-dialog-content>
      <mat-dialog-actions align="center" class="print:hidden">
        <button mat-flat-button color="primary" (click)="print()">
          <mat-icon>print</mat-icon>
          {{ 'buttons.print' | translate }}
        </button>
        <button mat-button (click)="dialogRef.close()">
          {{ 'common.cancel' | translate }}
        </button>
      </mat-dialog-actions>
    </div>
  `
})
export class BarcodeLabelDialogComponent implements AfterViewInit {
  dialogRef = inject(MatDialogRef<BarcodeLabelDialogComponent>);
  data = inject<BarcodeLabelDialogData>(MAT_DIALOG_DATA);

  @ViewChild('barcodeCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;

  ngAfterViewInit() {
    if (!this.data.value || !this.canvasRef) return;
    try {
      JsBarcode(this.canvasRef.nativeElement, this.data.value, {
        format: 'CODE128',
        displayValue: true,
        width: 2,
        height: 80,
        margin: 8
      });
    } catch (err) {
      console.error('Barcode generation error:', err);
    }
  }

  print() {
    window.print();
  }
}
