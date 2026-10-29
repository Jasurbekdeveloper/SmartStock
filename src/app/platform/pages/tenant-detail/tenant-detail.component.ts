import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PlatformService } from '../../../core/services/platform.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { AppUser, StoreRole } from '../../../core/services/auth.service';
import {
  PaymentMethod,
  SubscriptionPayment,
  Tenant,
  TenantStatus,
  extendPaidUntil,
  getSubscriptionInfo
} from '../../../core/models/saas';
import { authCreateErrorKey } from '../../../core/firebase/create-auth-account';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { STATE_BADGE, generatePassword, money, stateKey } from '../../platform-ui';
import { NumericInputDirective } from '../../../shared/directives/numeric-input.directive';

@Component({
  selector: 'app-tenant-detail',
  standalone: true,
  imports: [NumericInputDirective, 
    DatePipe,
    FormsModule,
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
  templateUrl: './tenant-detail.component.html'
})
export class TenantDetailComponent {
  private platform = inject(PlatformService);
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

  /** Route param, bound via withComponentInputBinding(). */
  id = input.required<string>();

  private id$ = toObservable(this.id);
  tenant = toSignal(this.id$.pipe(switchMap((id) => this.platform.getTenant(id))), { initialValue: undefined });
  users = toSignal(this.id$.pipe(switchMap((id) => this.platform.getTenantUsers(id))), { initialValue: [] });
  payments = toSignal(this.id$.pipe(switchMap((id) => this.platform.getPayments(id))), { initialValue: [] });
  plans = toSignal(this.platform.getPlans(), { initialValue: [] });

  readonly badge = STATE_BADGE;
  readonly stateKey = stateKey;
  readonly money = money;
  readonly monthOptions = [1, 3, 6, 12];
  readonly methods: PaymentMethod[] = ['cash', 'card', 'transfer'];
  readonly roles: StoreRole[] = ['admin', 'manager', 'cashier'];

  info = computed(() => {
    const tenant = this.tenant();
    return tenant ? getSubscriptionInfo(tenant) : null;
  });
  activeUsers = computed(() => this.users().filter((u) => u.active).length);
  currentPlan = computed(() => this.plans().find((p) => p.id === this.tenant()?.planId));

  busy = signal(false);
  selectedPlanId = signal('');

  paymentForm = this.fb.nonNullable.group({
    months: [1, Validators.required],
    amount: [0, [Validators.required, Validators.min(0)]],
    method: ['cash' as PaymentMethod, Validators.required],
    note: ['']
  });
  private paymentMonths = toSignal(this.paymentForm.controls.months.valueChanges, { initialValue: 1 });
  newPaidUntil = computed(() => extendPaidUntil(this.tenant()?.paidUntil, this.paymentMonths()));

  showUserForm = signal(false);
  userError = signal<string | null>(null);
  userForm = this.fb.nonNullable.group({
    displayName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: [generatePassword(), [Validators.required, Validators.minLength(6)]],
    role: ['admin' as StoreRole, Validators.required]
  });
  createdUser = signal<{ email: string; password: string } | null>(null);

  editingInfo = signal(false);
  infoForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    phone: [''],
    address: ['']
  });

  /** Only the newest active payment can be voided, so periods unwind in order. */
  voidablePaymentId = computed(() => this.payments().find((p) => !p.voided)?.id ?? null);

  constructor() {
    effect(() => {
      const tenant = this.tenant();
      if (tenant && !this.selectedPlanId()) this.selectedPlanId.set(tenant.planId ?? '');
    });
    // Suggest plan price × months as the amount; still editable (discounts, partial).
    effect(() => {
      const price = this.currentPlan()?.priceMonthly ?? 0;
      this.paymentForm.controls.amount.setValue(price * this.paymentMonths());
    });
  }

  roleLabelKey(role: string): string {
    return `users.role${role.charAt(0).toUpperCase()}${role.slice(1)}`;
  }

  isOwner(user: AppUser): boolean {
    return user.uid === this.tenant()?.ownerId;
  }

  canBecomeOwner(user: AppUser): boolean {
    return !this.isOwner(user) && user.role === 'admin' && user.active;
  }

  startEditInfo(tenant: Tenant) {
    this.infoForm.reset({ name: tenant.name, phone: tenant.phone ?? '', address: tenant.address ?? '' });
    this.editingInfo.set(true);
  }

  saveInfo(tenant: Tenant) {
    if (this.infoForm.invalid) {
      this.infoForm.markAllAsTouched();
      return;
    }
    const value = this.infoForm.getRawValue();
    this.run(
      this.platform.updateTenantInfo(tenant, {
        name: value.name.trim(),
        phone: value.phone.trim() || undefined,
        address: value.address.trim() || undefined
      }),
      'platform.detail.infoSaved',
      () => this.editingInfo.set(false)
    );
  }

  makeOwner(tenant: Tenant, user: AppUser) {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { titleKey: 'platform.detail.makeOwner', messageKey: 'platform.detail.confirmMakeOwner' }
      })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.run(this.platform.transferOwnership(tenant, user), 'platform.detail.ownerChanged');
      });
  }

  voidPayment(tenant: Tenant, payment: SubscriptionPayment) {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { titleKey: 'platform.detail.voidPayment', messageKey: 'platform.detail.confirmVoidPayment' }
      })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.run(this.platform.voidPayment(tenant, payment), 'platform.detail.paymentVoided');
      });
  }

  changePlan(tenant: Tenant) {
    const plan = this.plans().find((p) => p.id === this.selectedPlanId());
    if (!plan || plan.id === tenant.planId) return;
    this.run(this.platform.changePlan(tenant, plan), 'platform.detail.planChanged');
  }

  recordPayment(tenant: Tenant) {
    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }
    const value = this.paymentForm.getRawValue();
    this.run(
      this.platform.recordPayment(tenant, {
        amount: value.amount,
        months: value.months,
        method: value.method,
        note: value.note.trim() || undefined
      }),
      'platform.detail.paymentSaved',
      () => this.paymentForm.controls.note.setValue('')
    );
  }

  setStatus(tenant: Tenant, status: TenantStatus) {
    const suspending = status === 'suspended';
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          titleKey: suspending ? 'platform.detail.suspend' : 'platform.detail.activate',
          messageKey: suspending ? 'platform.detail.confirmSuspend' : 'platform.detail.confirmActivate'
        }
      })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.run(this.platform.setStatus(tenant, status), 'platform.detail.statusChanged');
      });
  }

  toggleUser(tenant: Tenant, user: AppUser) {
    this.run(this.platform.setUserActive(tenant, user, !user.active), 'platform.detail.userUpdated');
  }

  openUserForm() {
    this.userForm.reset({ displayName: '', email: '', password: generatePassword(), role: 'admin' });
    this.userError.set(null);
    this.createdUser.set(null);
    this.showUserForm.set(true);
  }

  addUser(tenant: Tenant) {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }
    const value = this.userForm.getRawValue();
    this.busy.set(true);
    this.userError.set(null);
    this.platform
      .addTenantUser(tenant, { ...value, displayName: value.displayName.trim(), email: value.email.trim() })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.showUserForm.set(false);
          this.createdUser.set({ email: value.email.trim(), password: value.password });
        },
        error: (err) => {
          console.error('Add tenant user failed', err);
          this.busy.set(false);
          this.userError.set(authCreateErrorKey(err));
        }
      });
  }

  private run(action: ReturnType<PlatformService['setStatus']>, successKey: string, after?: () => void) {
    this.busy.set(true);
    action.subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(this.translation.translate(successKey));
        after?.();
      },
      error: (err) => {
        console.error(err);
        this.busy.set(false);
        this.toast.error(this.translation.translate('messages.error'));
      }
    });
  }
}
