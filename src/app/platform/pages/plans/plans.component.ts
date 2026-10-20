import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PlatformService } from '../../../core/services/platform.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { Plan } from '../../../core/models/saas';
import { money } from '../../platform-ui';

@Component({
  selector: 'app-plans',
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
  templateUrl: './plans.component.html'
})
export class PlansComponent {
  private platform = inject(PlatformService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

  plans = toSignal(this.platform.getPlans(), { initialValue: undefined });
  readonly money = money;

  /** null = form closed, '' = new plan, otherwise the id being edited. */
  editingId = signal<string | null>(null);
  saving = signal(false);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    priceMonthly: [0, [Validators.required, Validators.min(0)]],
    maxUsers: [0, [Validators.required, Validators.min(0)]],
    maxProducts: [0, [Validators.required, Validators.min(0)]],
    active: [true]
  });

  startNew() {
    this.form.reset({ name: '', priceMonthly: 0, maxUsers: 3, maxProducts: 1000, active: true });
    this.editingId.set('');
  }

  edit(plan: Plan) {
    this.form.reset({
      name: plan.name,
      priceMonthly: plan.priceMonthly,
      maxUsers: plan.maxUsers,
      maxProducts: plan.maxProducts,
      active: plan.active
    });
    this.editingId.set(plan.id);
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.platform.savePlan(this.form.getRawValue(), this.editingId() || undefined).subscribe({
      next: () => {
        this.saving.set(false);
        this.editingId.set(null);
        this.toast.success(this.translation.translate('platform.plans.saved'));
      },
      error: () => {
        this.saving.set(false);
        this.toast.error(this.translation.translate('messages.error'));
      }
    });
  }

  seed() {
    this.saving.set(true);
    this.platform.seedSamplePlans().subscribe({
      next: () => this.saving.set(false),
      error: () => {
        this.saving.set(false);
        this.toast.error(this.translation.translate('messages.error'));
      }
    });
  }

  limit(value: number): string {
    return value > 0 ? String(value) : '∞';
  }
}
