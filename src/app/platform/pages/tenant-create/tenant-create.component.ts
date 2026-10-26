import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PlatformService } from '../../../core/services/platform.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { DEFAULT_TRIAL_DAYS } from '../../../core/models/saas';
import { authCreateErrorKey } from '../../../core/firebase/create-auth-account';
import { generatePassword, money } from '../../platform-ui';
import { NumericInputDirective } from '../../../shared/directives/numeric-input.directive';

interface CreatedStore {
  tenantId: string;
  storeName: string;
  email: string;
  password: string;
}

@Component({
  selector: 'app-tenant-create',
  standalone: true,
  imports: [NumericInputDirective, 
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    TranslatePipe
  ],
  templateUrl: './tenant-create.component.html'
})
export class TenantCreateComponent {
  private platform = inject(PlatformService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);
  private route = inject(ActivatedRoute);

  /** Set when opened from a website demo request (leads page). */
  private leadId = this.route.snapshot.queryParamMap.get('lead');

  plans = toSignal(this.platform.getPlans(), { initialValue: [] });
  activePlans = computed(() => this.plans().filter((p) => p.active));
  readonly money = money;

  submitting = signal(false);
  errorKey = signal<string | null>(null);
  created = signal<CreatedStore | null>(null);

  form = this.fb.nonNullable.group({
    storeName: ['', Validators.required],
    phone: [''],
    planId: ['', Validators.required],
    trialDays: [DEFAULT_TRIAL_DAYS, [Validators.required, Validators.min(0), Validators.max(365)]],
    ownerName: ['', Validators.required],
    ownerEmail: ['', [Validators.required, Validators.email]],
    ownerPassword: [generatePassword(), [Validators.required, Validators.minLength(6)]]
  });

  constructor() {
    // Prefill from a website demo request.
    const params = this.route.snapshot.queryParamMap;
    this.form.patchValue({
      storeName: params.get('storeName') ?? '',
      phone: params.get('phone') ?? '',
      ownerName: params.get('ownerName') ?? ''
    });

    // Preselect the cheapest active plan once plans load.
    effect(() => {
      const first = this.activePlans()[0];
      if (first && !this.form.controls.planId.value) {
        this.form.controls.planId.setValue(first.id);
      }
    });
  }

  regeneratePassword() {
    this.form.controls.ownerPassword.setValue(generatePassword());
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const plan = this.plans().find((p) => p.id === value.planId);
    if (!plan) return;

    this.submitting.set(true);
    this.errorKey.set(null);
    this.platform
      .createTenant({
        storeName: value.storeName.trim(),
        phone: value.phone.trim() || undefined,
        plan,
        trialDays: value.trialDays,
        ownerName: value.ownerName.trim(),
        ownerEmail: value.ownerEmail.trim(),
        ownerPassword: value.ownerPassword
      })
      .subscribe({
        next: (tenantId) => {
          this.submitting.set(false);
          if (this.leadId) {
            this.platform.updateLead(this.leadId, { status: 'won', tenantId }).subscribe({ error: (err) => console.error(err) });
            this.leadId = null;
          }
          this.created.set({ tenantId, storeName: value.storeName.trim(), email: value.ownerEmail.trim(), password: value.ownerPassword });
        },
        error: (err) => {
          console.error('Create tenant failed', err);
          this.submitting.set(false);
          this.errorKey.set(authCreateErrorKey(err));
        }
      });
  }

  credentialsText(store: CreatedStore): string {
    return [
      `${this.translation.translate('platform.create.credentialsFor')}: ${store.storeName}`,
      `${this.translation.translate('platform.create.loginUrl')}: ${location.origin}/auth/login`,
      `${this.translation.translate('auth.email')}: ${store.email}`,
      `${this.translation.translate('auth.password')}: ${store.password}`
    ].join('\n');
  }

  async copyCredentials(store: CreatedStore) {
    try {
      await navigator.clipboard.writeText(this.credentialsText(store));
      this.toast.success(this.translation.translate('platform.create.copied'));
    } catch {
      this.toast.error(this.translation.translate('messages.error'));
    }
  }

  createAnother() {
    this.created.set(null);
    this.form.reset({ trialDays: DEFAULT_TRIAL_DAYS, ownerPassword: generatePassword(), planId: this.activePlans()[0]?.id ?? '' });
  }
}
