import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatPaginatorModule } from '@angular/material/paginator';
import { AuditLogEntry, AuditLogService } from '../../../core/services/audit-log.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { createPagination } from '../../../core/utils/pagination';

/** Every `action` value written by the call sites wired up in this feature —
 *  keeps the filter dropdown and the `auditLog.action*` i18n keys in sync. */
const KNOWN_ACTIONS = [
  'stock_adjustment',
  'product_update',
  'product_delete',
  'product_bulk_import',
  'role_change',
  'active_toggle'
] as const;
const KNOWN_ENTITY_TYPES = ['product', 'user'] as const;

interface DiffRow {
  key: string;
  before: unknown;
  after: unknown;
}

@Component({
  selector: 'app-audit-log-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslatePipe,
    TranslateModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatPaginatorModule
  ],
  templateUrl: './audit-log-list.component.html',
  styleUrl: './audit-log-list.component.css'
})
export class AuditLogListComponent {
  private auditLogService = inject(AuditLogService);

  readonly actions = KNOWN_ACTIONS;
  readonly entityTypes = KNOWN_ENTITY_TYPES;

  entries = toSignal(this.auditLogService.getAuditLog(), { initialValue: [] });

  entityTypeFilter = signal<string>('');
  actionFilter = signal<string>('');
  fromDate = signal<Date | null>(null);
  toDate = signal<Date | null>(null);

  expandedIds = signal<Set<string>>(new Set());

  filteredEntries = computed(() => {
    const entityType = this.entityTypeFilter();
    const action = this.actionFilter();
    const from = this.fromDate();
    const to = this.toDate();

    return this.entries().filter((entry) => {
      if (entityType && entry.entityType !== entityType) return false;
      if (action && entry.action !== action) return false;

      if (from || to) {
        if (!entry.createdAt) return false;
        const createdAt = new Date(entry.createdAt);
        if (from && createdAt < from) return false;
        if (to) {
          const toEnd = new Date(to);
          toEnd.setHours(23, 59, 59, 999);
          if (createdAt > toEnd) return false;
        }
      }

      return true;
    });
  });

  pagination = createPagination(this.filteredEntries);

  clearFilters() {
    this.entityTypeFilter.set('');
    this.actionFilter.set('');
    this.fromDate.set(null);
    this.toDate.set(null);
    this.pagination.reset();
  }

  onEntityTypeFilterChange(value: string) {
    this.entityTypeFilter.set(value);
    this.pagination.reset();
  }

  onActionFilterChange(value: string) {
    this.actionFilter.set(value);
    this.pagination.reset();
  }

  onFromDateChange(value: Date | null) {
    this.fromDate.set(value);
    this.pagination.reset();
  }

  onToDateChange(value: Date | null) {
    this.toDate.set(value);
    this.pagination.reset();
  }

  actionLabelKey(action: string): string {
    const camel = action.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    return `auditLog.action${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  toggleExpanded(id: string) {
    this.expandedIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  /** Flattens `before`/`after` (plain objects, or a bare scalar for e.g. quantity)
   *  into rows for a simple key-value diff table. */
  diffRows(entry: AuditLogEntry): DiffRow[] {
    const before = (entry.before ?? {}) as Record<string, unknown>;
    const after = (entry.after ?? {}) as Record<string, unknown>;
    const isPlainBefore = entry.before && typeof entry.before === 'object';
    const isPlainAfter = entry.after && typeof entry.after === 'object';

    if (!isPlainBefore && !isPlainAfter) {
      return [{ key: '-', before: entry.before, after: entry.after }];
    }

    const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
    return Array.from(keys).map((key) => ({ key, before: before[key], after: after[key] }));
  }

  formatValue(value: unknown): string {
    if (value === undefined || value === null || value === '') return '-';
    if (value instanceof Date) return value.toLocaleString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
