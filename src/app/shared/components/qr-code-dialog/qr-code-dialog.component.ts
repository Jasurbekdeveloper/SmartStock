import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as QRCode from 'qrcode';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

export interface QrCodeDialogData {
  title: string;
  subtitle?: string;
  value: string;
}

@Component({
  selector: 'app-qr-code-dialog',
  standalone: true,
  imports: [CommonModule, TranslatePipe, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="text-center print:shadow-none print:max-w-none">
      <h2 mat-dialog-title>{{ data.title }}</h2>
      <mat-dialog-content>
        @if (data.subtitle) {
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">{{ data.subtitle }}</p>
        }
        @if (qrDataUrl()) {
        <img [src]="qrDataUrl()" alt="QR code" class="mx-auto w-48 h-48 mt-2" />
        }
      </mat-dialog-content>
      <mat-dialog-actions align="center" class="print:hidden">
        <button mat-flat-button color="primary" [disabled]="!qrDataUrl()" (click)="print()">
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
export class QrCodeDialogComponent implements OnInit {
  dialogRef = inject(MatDialogRef<QrCodeDialogComponent>);
  data = inject<QrCodeDialogData>(MAT_DIALOG_DATA);

  qrDataUrl = signal<string | null>(null);

  ngOnInit() {
    if (!this.data.value) return;
    QRCode.toDataURL(this.data.value, { width: 240, margin: 1 })
      .then((url) => this.qrDataUrl.set(url))
      .catch((err) => {
        console.error('QR generation error:', err);
        this.qrDataUrl.set(null);
      });
  }

  print() {
    window.print();
  }
}
