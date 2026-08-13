import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  template: `
    <div class="fixed top-4 right-4 z-[100] w-full max-w-sm space-y-2 px-4 sm:px-0 pointer-events-none">
      @for (toast of toastService.toasts(); track toast.id) {
      <div
        class="pointer-events-auto rounded-lg shadow-lg px-4 py-3 text-white font-medium flex items-center justify-between gap-3 animate-toast-in"
        [class.bg-green-600]="toast.type === 'success'"
        [class.bg-red-600]="toast.type === 'error'"
      >
        <div class="flex items-center gap-2">
          <mat-icon>{{ toast.type === 'success' ? 'check_circle' : 'error' }}</mat-icon>
          <span>{{ toast.message }}</span>
        </div>
        <button mat-icon-button class="!text-white !w-8 !h-8 !leading-8" (click)="toastService.dismiss(toast.id)">
          <mat-icon class="!text-lg">close</mat-icon>
        </button>
      </div>
      }
    </div>
  `
})
export class ToastContainerComponent {
  toastService = inject(ToastService);
}
