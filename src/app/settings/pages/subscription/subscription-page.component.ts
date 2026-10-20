import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { TenantService } from '../../../core/services/tenant.service';
import { UserManagementService } from '../../../core/services/user-management.service';
import { STATE_BADGE, money, stateKey } from '../../../platform/platform-ui';

/** Store admin's read-only view of their plan, paid period, limits and payments. */
@Component({
  selector: 'app-subscription-page',
  standalone: true,
  imports: [DatePipe, MatCardModule, MatIconModule, TranslatePipe],
  template: `
    <div class="space-y-6 max-w-5xl">
      <div>
        <h1 class="page-title">{{ 'subscription.title' | translate }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ 'subscription.subtitle' | translate }}</p>
      </div>

      @if (tenant(); as t) {
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <mat-card class="!p-5">
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ 'subscription.status' | translate }}</p>
          <span class="mt-2 inline-block text-sm font-semibold px-2.5 py-0.5 rounded-full" [class]="badge[sub().state]">{{ stateKey(sub().state) | translate }}</span>
        </mat-card>
        <mat-card class="!p-5">
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ 'subscription.plan' | translate }}</p>
          <p class="mt-1 text-xl font-bold">{{ t.planName || '—' }}</p>
        </mat-card>
        <mat-card class="!p-5">
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ 'subscription.paidUntil' | translate }}</p>
          <p class="mt-1 text-xl font-bold tabular-nums">{{ t.paidUntil ? (t.paidUntil | date: 'dd.MM.yyyy') : ('subscription.noExpiry' | translate) }}</p>
          @if (sub().daysLeft !== null) {
          <p class="text-xs text-gray-500">{{ sub().daysLeft }} {{ 'subscription.daysShort' | translate }}</p>
          }
        </mat-card>
        <mat-card class="!p-5">
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ 'subscription.staffUsage' | translate }}</p>
          <p class="mt-1 text-xl font-bold tabular-nums">{{ activeUsers() }} / {{ t.maxUsers ? t.maxUsers : '∞' }}</p>
          <p class="text-xs text-gray-500">{{ 'subscription.productLimit' | translate }}: {{ t.maxProducts ? t.maxProducts : '∞' }}</p>
        </mat-card>
      </div>

      <mat-card class="!p-5 flex gap-3 items-start">
        <mat-icon class="text-brand-600 shrink-0">support_agent</mat-icon>
        <div class="text-sm">
          <p class="font-semibold">{{ 'subscription.howToPayTitle' | translate }}</p>
          <p class="text-gray-600 dark:text-gray-300">{{ 'subscription.howToPayText' | translate }}</p>
        </div>
      </mat-card>

      <mat-card class="!p-0 overflow-hidden">
        <h2 class="px-5 pt-5 pb-3 font-semibold">{{ 'subscription.payments' | translate }}</h2>
        @if (payments().length === 0) {
        <p class="px-5 pb-5 text-sm text-gray-500 dark:text-gray-400">{{ 'platform.payments.none' | translate }}</p>
        } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400">
              <tr>
                <th class="px-5 py-2 text-left font-medium">{{ 'platform.payments.date' | translate }}</th>
                <th class="px-5 py-2 text-right font-medium">{{ 'platform.payments.amount' | translate }}</th>
                <th class="px-5 py-2 text-left font-medium">{{ 'platform.payments.months' | translate }}</th>
                <th class="px-5 py-2 text-left font-medium">{{ 'platform.payments.paidUntil' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (p of payments(); track p.id) {
              <tr class="border-t border-gray-100 dark:border-gray-800">
                <td class="px-5 py-2.5 whitespace-nowrap">{{ p.createdAt | date: 'dd.MM.yyyy' }}</td>
                <td class="px-5 py-2.5 text-right tabular-nums whitespace-nowrap" [class.line-through]="p.voided" [class.text-gray-400]="p.voided">
                  {{ money(p.amount) }}
                  @if (p.voided) {
                  <div class="text-xs text-red-600 dark:text-red-400 no-underline">{{ 'platform.payments.voided' | translate }}</div>
                  }
                </td>
                <td class="px-5 py-2.5">{{ p.months }}</td>
                <td class="px-5 py-2.5 tabular-nums">{{ p.paidUntilAfter | date: 'dd.MM.yyyy' }}</td>
              </tr>
              }
            </tbody>
          </table>
        </div>
        }
      </mat-card>
      } @else {
      <p class="p-8 text-center text-gray-500">{{ 'messages.loading' | translate }}</p>
      }
    </div>
  `
})
export class SubscriptionPageComponent {
  private tenantService = inject(TenantService);

  tenant = this.tenantService.tenant;
  sub = this.tenantService.subscription;
  payments = toSignal(this.tenantService.getPayments(), { initialValue: [] });
  private users = toSignal(inject(UserManagementService).getUsers(), { initialValue: [] });
  activeUsers = computed(() => this.users().filter((u) => u.active).length);

  readonly badge = STATE_BADGE;
  readonly stateKey = stateKey;
  readonly money = money;
}
