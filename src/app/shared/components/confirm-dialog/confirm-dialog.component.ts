import { Component, input, output, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    @if (isOpen()) {
    <div
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm">
        <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">{{ title() }}</h2>
        <p class="text-gray-600 dark:text-gray-300 mb-6">{{ message() }}</p>
        <div class="flex gap-3 justify-end">
          <button
            (click)="onCancel()"
            class="px-4 py-2 bg-gray-400 dark:bg-gray-600 text-white rounded hover:bg-gray-500 dark:hover:bg-gray-700 transition"
          >
            {{ 'common.cancel' | translate }}
          </button>
          <button
            (click)="onConfirm()"
            class="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded hover:bg-red-700 dark:hover:bg-red-800 transition"
          >
            {{ 'common.submit' | translate }}
          </button>
        </div>
      </div>
    </div>
    }
  `,
  styles: []
})
export class ConfirmDialogComponent {
  isOpen = model(false);
  title = input('Confirm');
  message = input('Are you sure?');
  confirmed = output<void>();
  cancelled = output<void>();

  onConfirm() {
    this.confirmed.emit();
    this.isOpen.set(false);
  }

  onCancel() {
    this.cancelled.emit();
    this.isOpen.set(false);
  }
}
