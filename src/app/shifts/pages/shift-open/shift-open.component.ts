import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../../core/services/auth.service';
import { ShiftService } from '../../../core/services/shift.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { ToastService } from '../../../core/services/toast.service';
import { FiscalService, fiscalErrorText } from '../../../core/services/fiscal.service';
import { SettingsService } from '../../../core/services/settings.service';
import { TranslationService } from '../../../core/services/translation.service';
import { NumericInputDirective } from '../../../shared/directives/numeric-input.directive';

@Component({
  selector: 'app-shift-open',
  standalone: true,
  imports: [NumericInputDirective, 
    CommonModule,
    FormsModule,
    RouterModule,
    TranslatePipe,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './shift-open.component.html',
  styleUrl: './shift-open.component.css'
})
export class ShiftOpenComponent {
  private authService = inject(AuthService);
  private shiftService = inject(ShiftService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private fiscal = inject(FiscalService);
  private settingsService = inject(SettingsService);
  private translation = inject(TranslationService);

  startingCash: number | null = null;
  submitting = signal(false);
  errorKey = signal<string | null>(null);

  submit() {
    const user = this.authService.getCurrentUser();
    if (!user) return;
    if (this.startingCash === null || this.startingCash < 0) {
      this.errorKey.set('messages.error');
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);

    this.shiftService.openShift(user.uid, user.displayName, this.startingCash).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toast.success(this.translation.translate('shifts.shiftOpened'));
        // The virtual cash register's fiscal shift (Z-report) opens with ours.
        if (this.fiscal.enabled() && this.settingsService.fiscalPolicy().send) {
          this.fiscal.openShift().catch((err: Error) => this.toast.error(`${this.translation.translate('fiscal.shiftFailed')}: ${fiscalErrorText(err, (k) => this.translation.translate(k))}`));
        }
        this.router.navigate(['/pos']);
      },
      error: (err) => {
        console.error('Open shift error:', err);
        this.errorKey.set('messages.error');
        this.submitting.set(false);
      }
    });
  }
}
