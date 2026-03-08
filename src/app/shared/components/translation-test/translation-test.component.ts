import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-translation-test',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div class="p-8 bg-gray-100 dark:bg-gray-900 min-h-screen">
      <div class="max-w-2xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h1 class="text-3xl font-bold mb-6 text-gray-900 dark:text-white">Tarjima Test</h1>
        
        <div class="space-y-4">
          <div class="p-4 bg-blue-50 dark:bg-blue-900 rounded">
            <p class="text-gray-700 dark:text-gray-300">
              <strong>{{ 'common.search' | translate }}:</strong> {{ 'common.search' | translate }}
            </p>
          </div>
          
          <div class="p-4 bg-green-50 dark:bg-green-900 rounded">
            <p class="text-gray-700 dark:text-gray-300">
              <strong>{{ 'navigation.dashboard' | translate }}:</strong> {{ 'navigation.dashboard' | translate }}
            </p>
          </div>
          
          <div class="p-4 bg-purple-50 dark:bg-purple-900 rounded">
            <p class="text-gray-700 dark:text-gray-300">
              <strong>{{ 'products.title' | translate }}:</strong> {{ 'products.title' | translate }}
            </p>
          </div>
          
          <div class="p-4 bg-orange-50 dark:bg-orange-900 rounded">
            <p class="text-gray-700 dark:text-gray-300">
              <strong>{{ 'pos.title' | translate }}:</strong> {{ 'pos.title' | translate }}
            </p>
          </div>
          
          <div class="p-4 bg-red-50 dark:bg-red-900 rounded">
            <p class="text-gray-700 dark:text-gray-300">
              <strong>{{ 'common.logout' | translate }}:</strong> {{ 'common.logout' | translate }}
            </p>
          </div>
        </div>
        
        <p class="mt-6 text-gray-600 dark:text-gray-400 text-sm">
          Header-da 🌐 tugmasini bosib, tilni o'zgartirganda yuqoridagi matnlar avtomatik o'zgarishi kerak.
        </p>
      </div>
    </div>
  `,
  styles: []
})
export class TranslationTestComponent {}
