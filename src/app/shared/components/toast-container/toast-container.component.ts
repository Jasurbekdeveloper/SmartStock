import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="fixed bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-5 sm:translate-x-0 z-[1100] w-full max-w-sm space-y-2 px-4 sm:px-0 pointer-events-none" aria-live="polite">
      @for (toast of toastService.toasts(); track toast.id) {
      <div class="toast pointer-events-auto animate-toast-in" [class.toast--error]="toast.type === 'error'" role="status">
        <span class="toast__icon"><mat-icon>{{ toast.type === 'success' ? 'check' : 'priority_high' }}</mat-icon></span>
        <span class="flex-1 min-w-0 text-sm font-medium">{{ toast.message }}</span>
        <button type="button" class="toast__close" (click)="toastService.dismiss(toast.id)" aria-label="close">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      }
    </div>
  `,
  styles: `
    .toast {
      display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 0.6rem 0.7rem 0.75rem;
      border-radius: 16px; color: #fff; background: #0e1624; box-shadow: 0 18px 40px -16px rgba(0, 0, 0, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .toast__icon {
      display: grid; place-items: center; width: 1.9rem; height: 1.9rem; flex-shrink: 0; border-radius: 10px;
      background: rgba(74, 222, 128, 0.18); color: #86efac;
    }
    .toast--error .toast__icon { background: rgba(248, 113, 113, 0.2); color: #fca5a5; }
    .toast__icon mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .toast__close { display: grid; place-items: center; width: 1.8rem; height: 1.8rem; border-radius: 999px; color: rgba(255, 255, 255, 0.55); }
    .toast__close:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
    .toast__close mat-icon { font-size: 16px; width: 16px; height: 16px; }
  `
})
export class ToastContainerComponent {
  toastService = inject(ToastService);
}
