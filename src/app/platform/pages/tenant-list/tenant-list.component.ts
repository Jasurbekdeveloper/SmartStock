import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PlatformService } from '../../../core/services/platform.service';
import { SubscriptionState, getSubscriptionInfo } from '../../../core/models/saas';
import { normalizeForSearch } from '../../../core/utils/uzbek-transliteration';
import { STATE_BADGE, stateKey } from '../../platform-ui';

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
