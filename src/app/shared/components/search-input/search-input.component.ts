import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <input
      type="text"
      [(ngModel)]="query"
      (input)="onSearchChange()"
      [placeholder]="placeholder() | translate"
      class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
    />
  `,
  styles: []
})
export class SearchInputComponent {
  placeholder = input('common.search');
  search = output<string>();

  query = signal('');

  onSearchChange() {
    this.search.emit(this.query());
  }
}
