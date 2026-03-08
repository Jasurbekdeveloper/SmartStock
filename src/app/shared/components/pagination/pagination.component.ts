import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div class="flex justify-center items-center gap-2 mt-4">
      <button
        (click)="previousPage()"
        [disabled]="currentPage() === 1"
        class="px-3 py-2 border rounded hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700"
      >
        {{ 'buttons.previous' | translate }}
      </button>

      <span class="mx-4 dark:text-gray-300">
        Page {{ currentPage() }} of {{ totalPages() }}
      </span>

      <button
        (click)="nextPage()"
        [disabled]="currentPage() === totalPages()"
        class="px-3 py-2 border rounded hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700"
      >
        {{ 'buttons.next' | translate }}
      </button>
    </div>
  `,
  styles: []
})
export class PaginationComponent {
  currentPage = input(1);
  totalPages = input(1);
  pageChange = output<number>();

  previousPage() {
    if (this.currentPage() > 1) {
      this.pageChange.emit(this.currentPage() - 1);
    }
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.pageChange.emit(this.currentPage() + 1);
    }
  }
}
