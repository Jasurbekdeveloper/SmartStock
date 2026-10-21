import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import type { IScannerControls } from '@zxing/browser';

/** Formats printed on retail goods, plus our own Code128 labels and QR. */
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];

/** Minimal typing for the Shape Detection API (Chrome on Android/macOS/ChromeOS). */
interface NativeBarcodeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
interface NativeBarcodeDetectorCtor {
  new (options: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

/**
 * Opens the device camera and decodes a barcode/QR code continuously until
 * a match is found, closing the dialog with the decoded text.
 *
 * Laptop webcams are low-resolution and fixed-focus, so the stream is requested
 * at HD with continuous focus, and decoding is limited to retail formats. The
 * browser's built-in BarcodeDetector is used when present; otherwise zxing is
 * loaded on demand so it never inflates the initial bundle.
 */
@Component({
  selector: 'app-barcode-scanner-dialog',
  standalone: true,
  imports: [CommonModule, TranslatePipe, MatDialogModule, MatButtonModule, MatFormFieldModule, MatSelectModule, MatIconModule],
  template: `
    <h2 mat-dialog-title class="text-center">{{ 'pos.scanBarcode' | translate }}</h2>
    <mat-dialog-content>
      @if (errorKey()) {
      <div class="p-4 text-center text-red-600 dark:text-red-400">{{ errorKey()! | translate }}</div>
      } @else {
      <div class="relative w-full overflow-hidden rounded-lg bg-black aspect-[4/3]">
        <video #video class="w-full h-full object-cover" autoplay muted playsinline></video>
        <!-- Aiming frame: a barcode filling this box decodes far more reliably. -->
        <div class="pointer-events-none absolute inset-x-[12%] top-1/2 -translate-y-1/2 h-[38%] rounded-md border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]">
          <div class="absolute inset-x-2 top-1/2 h-0.5 bg-red-500/90 animate-pulse"></div>
        </div>
      </div>
      <p class="mt-3 text-xs text-center text-gray-500 dark:text-gray-400">{{ 'scanner.hint' | translate }}</p>
      @if (cameras().length > 1) {
      <mat-form-field appearance="outline" class="w-full mt-2" subscriptSizing="dynamic">
        <mat-label>{{ 'scanner.camera' | translate }}</mat-label>
        <mat-select [value]="cameraId()" (selectionChange)="switchCamera($event.value)">
          @for (camera of cameras(); track camera.deviceId; let i = $index) {
          <mat-option [value]="camera.deviceId">{{ camera.label || ('scanner.camera' | translate) + ' ' + (i + 1) }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="center">
      <button mat-button (click)="close()">{{ 'common.cancel' | translate }}</button>
    </mat-dialog-actions>
  `
})
export class BarcodeScannerDialogComponent implements AfterViewInit, OnDestroy {
  dialogRef = inject(MatDialogRef<BarcodeScannerDialogComponent>);

  @ViewChild('video') videoRef?: ElementRef<HTMLVideoElement>;

  errorKey = signal<string | null>(null);
  cameras = signal<MediaDeviceInfo[]>([]);
  cameraId = signal<string | undefined>(undefined);

  private controls: IScannerControls | null = null;
  private stream: MediaStream | null = null;
  private nativeTimer: ReturnType<typeof setTimeout> | null = null;
  private done = false;

  async ngAfterViewInit() {
    await this.start();
    // Labels are only exposed after permission is granted, so list cameras afterwards.
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.cameras.set(devices.filter((d) => d.kind === 'videoinput'));
    } catch {
      /* camera picker is optional */
    }
  }

  async switchCamera(deviceId: string) {
    this.cameraId.set(deviceId);
    this.stopCamera();
    await this.start();
  }

  private constraints(): MediaStreamConstraints {
    const deviceId = this.cameraId();
    return {
      audio: false,
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        // Not in the TS DOM typings yet; ignored by browsers/cameras that lack it.
        advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet]
      }
    };
  }

  private async start() {
    const video = this.videoRef?.nativeElement;
    if (!video) return;
    try {
      const Detector = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor }).BarcodeDetector;
      const supported = Detector ? await Detector.getSupportedFormats() : [];
      const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
      if (Detector && formats.length > 0) {
        await this.startNative(video, new Detector({ formats }));
      } else {
        await this.startZxing(video);
      }
    } catch (err) {
      console.error('Barcode scanner error:', err);
      this.errorKey.set('pos.cameraError');
    }
  }

  private async startNative(video: HTMLVideoElement, detector: NativeBarcodeDetector) {
    this.stream = await navigator.mediaDevices.getUserMedia(this.constraints());
    video.srcObject = this.stream;
    await video.play();
    const tick = async () => {
      if (this.done || !this.stream) return;
      try {
        const [hit] = await detector.detect(video);
        if (hit?.rawValue) return this.finish(hit.rawValue);
      } catch {
        /* frame not ready yet */
      }
      this.nativeTimer = setTimeout(tick, 120);
    };
    void tick();
  }

  private async startZxing(video: HTMLVideoElement) {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library')
    ]);
    const hints = new Map<number, unknown>([
      [
        DecodeHintType.POSSIBLE_FORMATS,
        [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE
        ]
      ],
      [DecodeHintType.TRY_HARDER, true]
    ]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
    this.controls = await reader.decodeFromConstraints(this.constraints(), video, (result) => {
      if (result) this.finish(result.getText());
    });
  }

  private finish(code: string) {
    if (this.done) return;
    this.done = true;
    this.stopCamera();
    this.dialogRef.close(code.trim());
  }

  private stopCamera() {
    if (this.nativeTimer) clearTimeout(this.nativeTimer);
    this.nativeTimer = null;
    this.controls?.stop();
    this.controls = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  close() {
    this.done = true;
    this.stopCamera();
    this.dialogRef.close();
  }

  ngOnDestroy() {
    this.done = true;
    this.stopCamera();
  }
}
