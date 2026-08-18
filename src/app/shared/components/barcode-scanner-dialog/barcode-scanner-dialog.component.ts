import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import type { IScannerControls } from '@zxing/browser';

/**
 * Opens the device camera and decodes a barcode/QR code continuously until
 * a match is found, closing the dialog with the decoded text. The zxing
 * library is dynamically imported so it never inflates the initial bundle.
 */
@Component({
  selector: 'app-barcode-scanner-dialog',
  standalone: true,
  imports: [CommonModule, TranslatePipe, MatDialogModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <div class="text-center">
      <h2 mat-dialog-title>{{ 'pos.scanBarcode' | translate }}</h2>
      <mat-dialog-content>
        @if (errorKey()) {
        <div class="p-4 text-red-600 dark:text-red-400">{{ errorKey()! | translate }}</div>
        } @else {
        <div class="relative w-full flex items-center justify-center min-h-[220px]">
          <video #video class="w-full max-w-sm rounded-lg bg-black" autoplay muted playsinline></video>
          @if (scanning()) {
          <mat-spinner diameter="32" class="absolute"></mat-spinner>
          }
        </div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="center">
        <button mat-button (click)="close()">{{ 'common.cancel' | translate }}</button>
      </mat-dialog-actions>
    </div>
  `
})
export class BarcodeScannerDialogComponent implements AfterViewInit, OnDestroy {
  dialogRef = inject(MatDialogRef<BarcodeScannerDialogComponent>);

  @ViewChild('video') videoRef?: ElementRef<HTMLVideoElement>;

  scanning = signal(true);
  errorKey = signal<string | null>(null);

  private controls: IScannerControls | null = null;

  async ngAfterViewInit() {
    const videoElement = this.videoRef?.nativeElement;
    if (!videoElement) return;

    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();

      this.controls = await reader.decodeFromVideoDevice(undefined, videoElement, (result, _error, controls) => {
        if (result) {
          this.scanning.set(false);
          controls.stop();
          this.dialogRef.close(result.getText());
        }
      });
    } catch (err) {
      console.error('Barcode scanner error:', err);
      this.scanning.set(false);
      this.errorKey.set('pos.cameraError');
    }
  }

  close() {
    this.controls?.stop();
    this.dialogRef.close();
  }

  ngOnDestroy() {
    this.controls?.stop();
  }
}
