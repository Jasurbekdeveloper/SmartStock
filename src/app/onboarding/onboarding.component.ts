import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { updatePassword } from 'firebase/auth';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslatePipe } from '../core/pipes/translate.pipe';
import { TenantService } from '../core/services/tenant.service';
import { FIREBASE_AUTH } from '../core/firebase/firebase.providers';

/** First login of a new store's owner: replace the temporary password and fill in
 *  the store details printed on receipts. */
@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    TranslatePipe
  ],
  template: `
    <div class="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 class="page-title">{{ 'onboarding.title' | translate }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ 'onboarding.subtitle' | translate }}</p>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-6">
        <mat-card class="!p-6">
          <h2 class="font-semibold mb-4 flex items-center gap-2"><mat-icon class="text-brand-600">storefront</mat-icon>{{ 'onboarding.storeSection' | translate }}</h2>
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>{{ 'platform.create.storeName' | translate }}</mat-label>
            <input matInput formControlName="storeName" />
          </mat-form-field>
          <div class="grid gap-x-4 sm:grid-cols-2">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'platform.create.phone' | translate }}</mat-label>
              <input matInput formControlName="phone" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'platform.detail.address' | translate }}</mat-label>
              <input matInput formControlName="address" />
            </mat-form-field>
          </div>
          <mat-slide-toggle formControlName="pricesIncludeVat">{{ 'onboarding.pricesIncludeVat' | translate }}</mat-slide-toggle>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ 'onboarding.pricesIncludeVatHint' | translate }}</p>
        </mat-card>

        <mat-card class="!p-6">
          <h2 class="font-semibold mb-1 flex items-center gap-2"><mat-icon class="text-brand-600">lock</mat-icon>{{ 'onboarding.passwordSection' | translate }}</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">{{ 'onboarding.passwordHint' | translate }}</p>
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>{{ 'onboarding.newPassword' | translate }}</mat-label>
            <input matInput type="password" formControlName="newPassword" autocomplete="new-password" />
          </mat-form-field>
        </mat-card>

        @if (errorKey(); as key) {
        <div class="p-3 rounded-lg bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-sm">{{ key | translate }}</div>
        }

        <div class="flex flex-wrap justify-end gap-2">
          <button mat-button type="button" [disabled]="saving()" (click)="skip()">{{ 'onboarding.later' | translate }}</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
            <mat-icon>rocket_launch</mat-icon>
            {{ 'onboarding.finish' | translate }}
          </button>
        </div>
      </form>
    </div>
  `
})
export class OnboardingComponent {
  private tenantService = inject(TenantService);
  private auth = inject(FIREBASE_AUTH);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errorKey = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    storeName: ['', Validators.required],
    phone: [''],
    address: [''],
    pricesIncludeVat: [true],
    newPassword: ['', Validators.minLength(6)]
  });

  constructor() {
    let filled = false;
    effect(() => {
      const tenant = this.tenantService.tenant();
      if (tenant && !filled) {
        filled = true;
        this.form.patchValue({ storeName: tenant.name, phone: tenant.phone ?? '', address: tenant.address ?? '' });
      }
    });
  }

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.errorKey.set(null);
    try {
      if (value.newPassword && this.auth.currentUser) {
        await updatePassword(this.auth.currentUser, value.newPassword);
      }
      this.tenantService
        .completeOnboarding({
          storeName: value.storeName.trim(),
          phone: value.phone.trim() || undefined,
          address: value.address.trim() || undefined,
          pricesIncludeVat: value.pricesIncludeVat
        })
        .subscribe({
          next: () => this.router.navigateByUrl('/dashboard'),
          error: () => {
            this.saving.set(false);
            this.errorKey.set('messages.error');
          }
        });
    } catch (err) {
      this.saving.set(false);
      const code = (err as { code?: string }).code;
      this.errorKey.set(code === 'auth/requires-recent-login' ? 'onboarding.reloginForPassword' : 'users.weakPassword');
    }
  }

  skip() {
    this.saving.set(true);
    this.tenantService.skipOnboarding().subscribe({
      next: () => this.router.navigateByUrl('/dashboard'),
      error: () => this.saving.set(false)
    });
  }
}
