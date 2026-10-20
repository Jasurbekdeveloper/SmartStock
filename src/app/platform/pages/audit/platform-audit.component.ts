import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PlatformService } from '../../../core/services/platform.service';

@Component({
  selector: 'app-platform-audit',
  standalone: true,
  imports: [DatePipe, RouterModule, MatCardModule, TranslatePipe],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="page-title">{{ 'platform.audit.title' | translate }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ 'platform.audit.subtitle' | translate }}</p>
      </div>
      <mat-card class="!p-0 overflow-hidden">
        @if (entries().length === 0) {
        <p class="p-8 text-center text-gray-500 dark:text-gray-400">{{ 'platform.audit.empty' | translate }}</p>
        } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400">
              <tr>
                <th class="px-5 py-2 text-left font-medium">{{ 'platform.payments.date' | translate }}</th>
                <th class="px-5 py-2 text-left font-medium">{{ 'platform.audit.action' | translate }}</th>
                <th class="px-5 py-2 text-left font-medium">{{ 'platform.tenants.store' | translate }}</th>
                <th class="px-5 py-2 text-left font-medium">{{ 'platform.audit.details' | translate }}</th>
                <th class="px-5 py-2 text-left font-medium">{{ 'platform.audit.by' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (e of entries(); track e.id) {
              <tr class="border-t border-gray-100 dark:border-gray-800">
                <td class="px-5 py-2.5 whitespace-nowrap tabular-nums">{{ e.createdAt | date: 'dd.MM.yyyy HH:mm' }}</td>
                <td class="px-5 py-2.5 whitespace-nowrap">{{ 'platform.audit.actions.' + e.action | translate }}</td>
                <td class="px-5 py-2.5">
                  @if (e.tenantId) {
                  <a [routerLink]="['/platform/tenants', e.tenantId]" class="hover:text-brand-600">{{ e.tenantName }}</a>
                  }
                </td>
                <td class="px-5 py-2.5 text-gray-600 dark:text-gray-300 break-words">{{ e.details }}</td>
                <td class="px-5 py-2.5">{{ e.userName }}</td>
              </tr>
              }
            </tbody>
          </table>
        </div>
        }
      </mat-card>
    </div>
  `
})
export class PlatformAuditComponent {
  entries = toSignal(inject(PlatformService).getAudit(), { initialValue: [] });
}
