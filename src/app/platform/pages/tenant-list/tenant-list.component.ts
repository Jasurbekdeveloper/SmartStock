import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, from, map, mergeMap, of, scan, startWith, switchMap } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PlatformService, TenantUsage } from '../../../core/services/platform.service';
import { formatNumber } from '../../../core/utils/format-number';
import { SubscriptionState, getSubscriptionInfo } from '../../../core/models/saas';
import { normalizeForSearch } from '../../../core/utils/uzbek-transliteration';
import { STATE_BADGE, formatBytes, stateKey } from '../../platform-ui';

/** How many stores' usage is read at once; each read lists that store's files. */
const USAGE_CONCURRENCY = 3;

type UsageResult = TenantUsage | 'error';

@Component({
  selector: 'app-tenant-list',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslatePipe
  ],
  templateUrl: './tenant-list.component.html'
})
export class TenantListComponent {
  private platform = inject(PlatformService);

  tenants = toSignal(this.platform.getTenants(), { initialValue: undefined });
  search = signal('');
  stateFilter = signal<SubscriptionState | ''>(
    (inject(ActivatedRoute).snapshot.queryParamMap.get('state') as SubscriptionState | null) ?? ''
  );

  readonly states: SubscriptionState[] = ['active', 'trial', 'grace', 'readonly', 'suspended'];
  readonly badge = STATE_BADGE;
  readonly stateKey = stateKey;
  readonly bytes = formatBytes;
  readonly num = (v: number) => formatNumber(v, 0);

  /** Catalog size and uploaded files per store id, filled in as each store's numbers
   *  arrive; 'error' when the usage function can't be reached. */
  usage = toSignal(
    toObservable(this.tenants).pipe(
      switchMap((tenants) =>
        from(tenants ?? []).pipe(
          mergeMap(
            (tenant) =>
              this.platform.tenantUsage(tenant.id).pipe(
                map((u): [string, UsageResult] => [tenant.id, u]),
                catchError((err) => {
                  console.error('Tenant usage error:', tenant.id, err);
                  return of<[string, UsageResult]>([tenant.id, 'error']);
                })
              ),
            USAGE_CONCURRENCY
          ),
          scan((all, [id, u]) => ({ ...all, [id]: u }), {} as Record<string, UsageResult>),
          startWith({} as Record<string, UsageResult>)
        )
      )
    ),
    { initialValue: {} as Record<string, UsageResult> }
  );

  /** Products and uploaded bytes across all stores that have reported so far. */
  totals = computed(() => {
    let products = 0;
    let bytes = 0;
    for (const u of Object.values(this.usage())) {
      if (typeof u === 'object') {
        products += u.products;
        bytes += u.files.bytes;
      }
    }
    return { products, bytes };
  });

  rows = computed(() => {
    const q = normalizeForSearch(this.search().trim());
    const state = this.stateFilter();
    return (this.tenants() ?? [])
      .map((tenant) => ({ tenant, info: getSubscriptionInfo(tenant) }))
      .filter(({ info }) => !state || info.state === state)
      .filter(({ tenant }) =>
        !q ||
        normalizeForSearch(`${tenant.name} ${tenant.ownerName ?? ''} ${tenant.ownerEmail ?? ''} ${tenant.phone ?? ''}`).includes(q)
      );
  });
}
