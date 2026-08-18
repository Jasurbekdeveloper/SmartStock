import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../../core/services/auth.service';
import { ShiftService } from '../../../core/services/shift.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { createPagination } from '../../../core/utils/pagination';

@Component({
  selector: 'app-shift-history',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, CurrencyDisplayPipe, MatCardModule, MatPaginatorModule, MatButtonModule],
  templateUrl: './shift-history.component.html',
  styleUrl: './shift-history.component.css'
})
export class ShiftHistoryComponent {
  private authService = inject(AuthService);
  private shiftService = inject(ShiftService);

  currentUser = toSignal(this.authService.currentUser$, { initialValue: null });

  /** Cashiers only ever see their own past shifts; admin/manager see everyone's
   * (ShiftService.getShifts() enforces the actual filtering, matching this
   * codebase's convention of doing per-user visibility at the query layer). */
  private shifts$ = this.authService.currentUser$.pipe(
    switchMap((user) => {
      if (!user) return of([]);
      const seeAll = user.role === 'admin' || user.role === 'manager';
      return this.shiftService.getShifts(user.uid, seeAll);
    })
  );

  shifts = toSignal(this.shifts$, { initialValue: [] });
  pagination = createPagination(this.shifts);

  /** `firestore.rules` only lets the cashier who opened a shift close it — even
   * admin/manager can't close someone else's — so only show the action there. */
  canCloseOwnShift(cashierId: string, status: string): boolean {
    return status === 'open' && cashierId === this.currentUser()?.uid;
  }
}
