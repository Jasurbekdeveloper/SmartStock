import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginatorModule } from '@angular/material/paginator';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { AppUser, UserRole } from '../../../core/services/auth.service';
import { UserManagementService } from '../../../core/services/user-management.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { createPagination } from '../../../core/utils/pagination';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    TranslatePipe,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatPaginatorModule
  ],
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.css'
})
export class UserListComponent {
  private userManagementService = inject(UserManagementService);
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);

  users = toSignal(this.userManagementService.getUsers(), { initialValue: [] });
  pagination = createPagination(this.users);

  showCreateForm = signal(false);
  submitting = signal(false);
  errorKey = signal<string | null>(null);

  readonly roles: UserRole[] = ['admin', 'cashier', 'manager'];

  createForm = this.fb.nonNullable.group({
    displayName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    tempPassword: ['', [Validators.required, Validators.minLength(6)]],
    role: ['cashier' as UserRole, Validators.required]
  });

  roleLabelKey(role: UserRole): string {
    return `users.role${role.charAt(0).toUpperCase()}${role.slice(1)}`;
  }

  openCreateForm() {
    this.createForm.reset({ displayName: '', email: '', tempPassword: '', role: 'cashier' });
    this.errorKey.set(null);
    this.showCreateForm.set(true);
  }

  cancelCreate() {
    this.showCreateForm.set(false);
  }

  submitCreate() {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);

    const { displayName, email, tempPassword, role } = this.createForm.getRawValue();

    this.userManagementService.createEmployee({ displayName, email, password: tempPassword, role }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showCreateForm.set(false);
      },
      error: () => {
        this.submitting.set(false);
        this.errorKey.set('messages.error');
      }
    });
  }

  requestToggleActive(user: AppUser) {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { titleKey: 'users.deactivate', messageKey: 'users.confirmDeactivate' }
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.userManagementService.setActive(user.uid, !user.active, user.active).subscribe();
        }
      });
  }
}
