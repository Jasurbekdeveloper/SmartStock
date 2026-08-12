import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed top-4 right-4 z-[100] w-full max-w-sm space-y-2 px-4 sm:px-0 pointer-events-none">
      @for (toast of toastService.toasts(); track toast.id) {
      <div
        class="pointer-events-auto rounded-lg shadow-lg px-4 py-3 text-white font-medium flex items-start justify-between gap-3 animate-toast-in"
        [class.bg-green-600]="toast.type === 'success'"
        [class.bg-red-600]="toast.type === 'error'"
      >
        <span>{{ toast.message }}</span>
        <button (click)="toastService.dismiss(toast.id)" class="opacity-80 hover:opacity-100 leading-none">✕</button>
      </div>
      }
    </div>
  `
})
export class ToastContainerComponent {
  toastService = inject(ToastService);
}
