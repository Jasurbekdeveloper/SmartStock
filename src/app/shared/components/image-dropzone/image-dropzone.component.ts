import { Component, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

/** Max upload size, same as storage.rules. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isAcceptableImage(file: File): boolean {
  return file.type.startsWith('image/') && file.size <= MAX_IMAGE_BYTES;
}

/** Click / drag-and-drop / paste image picker with a preview. Emits the File; the
 *  parent owns validation messages, object URLs and the upload. */
@Component({
  selector: 'app-image-dropzone',
  standalone: true,
  imports: [MatIconModule, TranslatePipe],
  template: `
    <div
      class="dropzone relative overflow-hidden"
      [class.dropzone--over]="over()"
      [class.!p-0]="!!preview()"
      [style.aspect-ratio]="aspect()"
      role="button"
      tabindex="0"
      (click)="input.click()"
      (keydown.enter)="input.click()"
      (keydown.space)="$event.preventDefault(); input.click()"
      (dragover)="$event.preventDefault(); over.set(true)"
      (dragleave)="over.set(false)"
      (drop)="onDrop($event)"
      (paste)="onPaste($event)"
    >
      @if (preview(); as src) {
      <img [src]="src" alt="" class="absolute inset-0 h-full w-full object-cover" />
      <span class="dz__change">
        <mat-icon>photo_camera</mat-icon>{{ 'products.changeImage' | translate }}
      </span>
      } @else {
      <mat-icon class="!w-10 !h-10 !text-[40px] opacity-70">add_photo_alternate</mat-icon>
      <span class="font-semibold">{{ 'products.dropImage' | translate }}</span>
      <span class="text-xs opacity-80">PNG, JPG, WebP · 5 MB</span>
      }
      <input #input type="file" accept="image/*" class="hidden" [disabled]="disabled()" (change)="onPick($event)" />
    </div>
    @if (preview() && removable()) {
    <button type="button" class="mt-2 text-xs font-medium text-loss hover:underline" (click)="removed.emit()">
      {{ 'products.removeImage' | translate }}
    </button>
    }
  `,
  styles: `
    :host { display: block; }
    .dz__change {
      position: absolute; inset: auto 0.5rem 0.5rem auto; display: inline-flex; align-items: center; gap: 0.3rem;
      padding: 0.3rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
      color: #fff; background: rgba(8, 13, 23, 0.65); backdrop-filter: blur(4px);
    }
    .dz__change mat-icon { font-size: 16px; width: 16px; height: 16px; }
  `
})
export class ImageDropzoneComponent {
  preview = input<string | null | undefined>(null);
  disabled = input(false);
  removable = input(false);
  aspect = input('4 / 3');
  selected = output<File>();
  removed = output<void>();
  over = signal(false);

  onPick(event: Event) {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    if (file) this.selected.emit(file);
    el.value = '';
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.over.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && !this.disabled()) this.selected.emit(file);
  }

  onPaste(event: ClipboardEvent) {
    const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (file && !this.disabled()) this.selected.emit(file);
  }
}
