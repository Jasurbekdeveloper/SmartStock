import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PlatformService } from '../../../core/services/platform.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { StoreRole } from '../../../core/services/auth.service';
import {
  LOCKED_PERMISSIONS,
  PERMISSION_GROUPS,
  Permission,
  ROLE_PERMISSIONS,
  RolePermissionMap,
  STORE_ROLES,
  normalizeRolePermissions
} from '../../../core/auth/permissions';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

/** What each store role may do — for every store on the platform. */
@Component({
  selector: 'app-platform-roles',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatSlideToggleModule, TranslatePipe],
  template: `
    <div class="pf-head">
      <div>
        <h1 class="pf-title">{{ 'platform.roles.title' | translate }}</h1>
        <p class="pf-sub">{{ 'platform.roles.subtitle' | translate }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button mat-stroked-button type="button" (click)="resetToDefaults()" [disabled]="saving()">
          <mat-icon>restart_alt</mat-icon>{{ 'platform.roles.defaults' | translate }}
        </button>
        <button mat-flat-button color="primary" type="button" (click)="save()" [disabled]="saving() || !dirty()">
          <mat-icon>save</mat-icon>{{ 'common.save' | translate }}
        </button>
      </div>
    </div>

    @if (problem()) {
    <p class="pf-note pf-note--warn" role="alert"><mat-icon>error</mat-icon>{{ problem()! | translate }}</p>
    }
    @if (dirty()) {
    <p class="pf-note pf-note--warn"><mat-icon>edit_note</mat-icon>{{ 'platform.roles.unsaved' | translate }}</p>
    }

    <div class="pf-card overflow-x-auto">
      <table class="pf-table">
        <thead>
          <tr>
            <th class="text-left">{{ 'permissions.permission' | translate }}</th>
            @for (role of roles; track role) {
            <th class="text-center min-w-[8.5rem]">
              <span class="block">{{ roleLabelKey(role) | translate }}</span>
              <span class="block text-xs font-normal pf-muted">{{ count(role) }} / {{ total }}</span>
            </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (group of groups; track group.id) {
          <tr class="pf-group">
            <td [attr.colspan]="roles.length + 1">{{ 'permissions.group.' + group.id | translate }}</td>
          </tr>
          @for (permission of group.permissions; track permission) {
          <tr>
            <td>
              <span class="block">{{ 'permissions.p.' + permission | translate }}</span>
              <code class="pf-code">{{ permission }}</code>
            </td>
            @for (role of roles; track role) {
            <td class="text-center">
              <mat-slide-toggle
                [checked]="has(role, permission)"
                [disabled]="locked(role, permission)"
                (change)="toggle(role, permission, $event.checked)"
                [attr.aria-label]="(roleLabelKey(role) | translate) + ': ' + ('permissions.p.' + permission | translate)"
              ></mat-slide-toggle>
              @if (locked(role, permission)) {
              <mat-icon class="pf-lock" [attr.title]="'platform.roles.locked' | translate">lock</mat-icon>
              } @else if (changed(role, permission)) {
              <span class="pf-dot" [attr.title]="'platform.roles.changedFromDefault' | translate"></span>
              }
            </td>
            }
          </tr>
          }
          }
        </tbody>
      </table>
    </div>

    <p class="pf-note"><mat-icon>info</mat-icon>{{ 'platform.roles.note' | translate }}</p>
  `,
  styles: `
    :host { display: block; }
    .pf-table { width: 100%; font-size: 0.875rem; border-collapse: collapse; }
    .pf-table th { padding: 0.75rem 1rem; font-weight: 600; color: var(--text); background: var(--surface-2, var(--app-bg)); border-bottom: 1px solid var(--border); }
    .pf-table td { padding: 0.6rem 1rem; border-bottom: 1px solid var(--border); color: var(--text); vertical-align: middle; }
    .pf-group td { padding: 0.5rem 1rem; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); background: var(--app-bg); }
    .pf-code { font: 500 0.7rem var(--font-mono); color: var(--text-faint); }
    .pf-lock { width: 16px !important; height: 16px !important; font-size: 16px !important; color: var(--text-faint); vertical-align: middle; margin-left: 0.25rem; }
    .pf-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--warning); margin-left: 0.35rem; vertical-align: middle; }
  `
})
export class PlatformRolesComponent {
  private platform = inject(PlatformService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);
  private dialog = inject(MatDialog);

  readonly roles = STORE_ROLES;
  readonly groups = PERMISSION_GROUPS;
  readonly total = PERMISSION_GROUPS.reduce((n, g) => n + g.permissions.length, 0);

  /** i18n key of what went wrong (config unreadable, save refused), shown above the table. */
  problem = signal<string | null>(null);

  /** An unreadable config (e.g. the rules aren't deployed yet) must not blank the page:
   *  the table falls back to the defaults and says why. */
  private stored = toSignal(
    this.platform.getRolePermissions().pipe(
      catchError((err) => {
        console.error('Load role permissions error:', err);
        this.problem.set('platform.roles.loadFailed');
        return of(undefined);
      })
    ),
    { initialValue: undefined }
  );
  /** What the table shows; null until the admin changes something (then it's a draft). */
  private draft = signal<RolePermissionMap | null>(null);
  saving = signal(false);

  current = computed<RolePermissionMap>(() => this.draft() ?? normalizeRolePermissions(this.stored() ?? null));
  dirty = computed(() => this.draft() !== null);

  roleLabelKey(role: string): string {
    return `users.role${role.charAt(0).toUpperCase()}${role.slice(1)}`;
  }

  has(role: StoreRole, permission: Permission): boolean {
    return this.current()[role].includes(permission);
  }

  locked(role: StoreRole, permission: Permission): boolean {
    return (LOCKED_PERMISSIONS[role] ?? []).includes(permission);
  }

  changed(role: StoreRole, permission: Permission): boolean {
    return this.has(role, permission) !== ROLE_PERMISSIONS[role].includes(permission);
  }

  count(role: StoreRole): number {
    return this.current()[role].length;
  }

  toggle(role: StoreRole, permission: Permission, on: boolean) {
    const next = { ...this.current() };
    const set = new Set(next[role]);
    if (on) set.add(permission);
    else set.delete(permission);
    next[role] = [...set];
    this.draft.set(normalizeRolePermissions(next));
  }

  resetToDefaults() {
    this.draft.set(normalizeRolePermissions(ROLE_PERMISSIONS));
  }

  save() {
    const map = this.draft();
    if (!map || this.saving()) return;
    this.dialog
      .open(ConfirmDialogComponent, { data: { titleKey: 'platform.roles.confirmTitle', messageKey: 'platform.roles.confirmText' } })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.saving.set(true);
        const details = STORE_ROLES.map((r) => `${r}: ${map[r].length}`).join(', ');
        this.platform.saveRolePermissions(map, details).subscribe({
          next: () => {
            this.saving.set(false);
            this.draft.set(null);
            this.problem.set(null);
            this.toast.success(this.translation.translate('messages.saved'));
          },
          error: (err) => {
            console.error('Save role permissions error:', err);
            this.saving.set(false);
            const denied = (err as { code?: string } | null)?.code === 'permission-denied';
            this.problem.set(denied ? 'platform.roles.saveDenied' : null);
            this.toast.error(this.translation.translate(denied ? 'platform.roles.saveDenied' : 'messages.error'));
          }
        });
      });
  }
}
