import { Component, computed, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { TenantService } from '../../core/services/tenant.service';
import { AuthService } from '../../core/services/auth.service';
import { EXPIRY_WARNING_DAYS } from '../../core/models/saas';

interface Banner {
  tone: string;
  icon: string;
  messageKey: string;
  days: number | null;
}

/** Thin strip above every store page: trial countdown, upcoming expiry, grace period
 *  or read-only mode. Hidden when the subscription is comfortably paid. */
@Component({
  selector: 'app-subscription-banner',
  standalone: true,
  imports: [RouterModule, MatIconModule, TranslatePipe],
  template: `
    @if (banner(); as b) {
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 lg:px-6 py-2 text-sm" [class]="b.tone" role="status">
      <mat-icon class="!w-5 !h-5 !text-[20px] shrink-0">{{ b.icon }}</mat-icon>
      <span class="flex-1 min-w-0">
        {{ b.messageKey | translate }}
        @if (b.days !== null) {
        <b class="tabular-nums">{{ b.days }} {{ 'subscription.daysShort' | translate }}</b>
        }
      </span>
      @if (isAdmin()) {
      <a routerLink="/settings/subscription" class="font-semibold underline underline-offset-2 whitespace-nowrap">{{ 'subscription.details' | translate }}</a>
      }
    </div>
    }
  `
})
export class SubscriptionBannerComponent {
  private tenantService = inject(TenantService);
  private authService = inject(AuthService);

  isAdmin = computed(() => {
    this.tenantService.tenant();
    return this.authService.hasRole('admin');
  });

  banner = computed<Banner | null>(() => {
    if (!this.tenantService.tenant()) return null;
    const { state, daysLeft } = this.tenantService.subscription();
    switch (state) {
      case 'trial':
        return { tone: 'bg-sky-50 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100', icon: 'hourglass_top', messageKey: 'subscription.banner.trial', days: daysLeft };
      case 'active':
        return daysLeft !== null && daysLeft <= EXPIRY_WARNING_DAYS
          ? { tone: 'bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100', icon: 'event', messageKey: 'subscription.banner.expiresSoon', days: daysLeft }
          : null;
      case 'grace':
        return { tone: 'bg-red-50 text-red-900 dark:bg-red-900/40 dark:text-red-100', icon: 'warning', messageKey: 'subscription.banner.grace', days: daysLeft };
      case 'readonly':
        return { tone: 'bg-red-600 text-white', icon: 'lock', messageKey: 'subscription.banner.readonly', days: null };
      case 'suspended':
        return { tone: 'bg-gray-800 text-white', icon: 'block', messageKey: 'subscription.banner.suspended', days: null };
    }
  });
}
