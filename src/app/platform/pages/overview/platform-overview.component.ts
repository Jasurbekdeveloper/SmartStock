import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PlatformService } from '../../../core/services/platform.service';
import { SubscriptionState, getSubscriptionInfo } from '../../../core/models/saas';
import { STATE_BADGE, money, stateKey } from '../../platform-ui';

const DAY_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-platform-overview',
  standalone: true,
  imports: [DatePipe, RouterModule, MatCardModule, MatButtonModule, MatIconModule, TranslatePipe],
  templateUrl: './platform-overview.component.html'
})
export class PlatformOverviewComponent {
  private platform = inject(PlatformService);

  tenants = toSignal(this.platform.getTenants(), { initialValue: [] });
  plans = toSignal(this.platform.getPlans(), { initialValue: [] });
  payments = toSignal(this.platform.getPayments(undefined, 10), { initialValue: [] });

  readonly states: SubscriptionState[] = ['active', 'trial', 'grace', 'readonly', 'suspended'];
  readonly badge = STATE_BADGE;
  readonly stateKey = stateKey;
  readonly money = money;

  withState = computed(() => this.tenants().map((t) => ({ tenant: t, info: getSubscriptionInfo(t) })));

  countByState = computed(() => {
    const counts: Record<SubscriptionState, number> = { active: 0, trial: 0, grace: 0, readonly: 0, suspended: 0 };
    for (const { info } of this.withState()) counts[info.state]++;
    return counts;
  });

  /** Monthly recurring revenue: plan price of every paying store still allowed to work. */
  mrr = computed(() => {
    const price = new Map(this.plans().map((p) => [p.id, p.priceMonthly]));
    return this.withState()
      .filter(({ info, tenant }) => tenant.status === 'active' && (info.state === 'active' || info.state === 'grace'))
      .reduce((sum, { tenant }) => sum + (price.get(tenant.planId ?? '') ?? 0), 0);
  });

  /** Stores whose paid or trial period ends within 7 days, or already in grace/read-only. */
  attention = computed(() => {
    const soon = Date.now() + 7 * DAY_MS;
    return this.withState()
      .filter(({ tenant, info }) =>
        info.state === 'grace' || info.state === 'readonly' ||
        ((info.state === 'active' || info.state === 'trial') && !!tenant.paidUntil && tenant.paidUntil.getTime() < soon))
      .sort((a, b) => (a.tenant.paidUntil?.getTime() ?? 0) - (b.tenant.paidUntil?.getTime() ?? 0));
  });
}
