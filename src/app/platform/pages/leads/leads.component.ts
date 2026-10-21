import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
import { LEAD_STATUSES, Lead, LeadStatus } from '../../../core/models/site-content';

const STATUS_BADGE: Record<LeadStatus, string> = {
  new: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  contacted: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  demo: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  won: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  lost: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
};

/** Demo requests left on the website: call, note, move through statuses, open a store. */
@Component({
  selector: 'app-leads',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    TranslatePipe
  ],
  templateUrl: './leads.component.html'
})
export class LeadsComponent {
  private platform = inject(PlatformService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);
  private router = inject(Router);

  leads = toSignal(this.platform.getLeads(), { initialValue: undefined });
  readonly statuses = LEAD_STATUSES;
  readonly badge = STATUS_BADGE;

  filter = signal<LeadStatus | 'all'>('all');
  /** Unsaved notes per lead id. */
  notesDraft = signal<Record<string, string>>({});

  counts = computed(() => {
    const result: Record<string, number> = { all: 0 };
    for (const lead of this.leads() ?? []) {
      result['all']++;
      result[lead.status] = (result[lead.status] ?? 0) + 1;
    }
    return result;
  });

  visible = computed(() => {
    const f = this.filter();
    return (this.leads() ?? []).filter((l) => f === 'all' || l.status === f);
  });

  tel(phone: string): string {
    return 'tel:' + phone.replace(/[^\d+]/g, '');
  }

  /** Opens a Telegram chat by phone number (works when the person allows it). */
  telegram(phone: string): string {
    return 'https://t.me/' + phone.replace(/[^\d+]/g, '');
  }

  setStatus(lead: Lead, status: LeadStatus) {
    this.platform.updateLead(lead.id, { status }).subscribe({
      error: () => this.toast.error(this.translation.translate('messages.error'))
    });
  }

  notes(lead: Lead): string {
    return this.notesDraft()[lead.id] ?? lead.notes ?? '';
  }

  editNotes(lead: Lead, value: string) {
    this.notesDraft.update((d) => ({ ...d, [lead.id]: value }));
  }

  notesChanged(lead: Lead): boolean {
    const draft = this.notesDraft()[lead.id];
    return draft !== undefined && draft !== (lead.notes ?? '');
  }

  saveNotes(lead: Lead) {
    const notes = this.notes(lead).trim();
    this.platform.updateLead(lead.id, { notes }).subscribe({
      next: () => {
        this.notesDraft.update((d) => {
          const { [lead.id]: _, ...rest } = d;
          return rest;
        });
        this.toast.success(this.translation.translate('platform.leads.notesSaved'));
      },
      error: () => this.toast.error(this.translation.translate('messages.error'))
    });
  }

  openStore(lead: Lead) {
    this.router.navigate(['/platform/tenants/new'], {
      queryParams: { storeName: lead.storeName || '', phone: lead.phone, ownerName: lead.name, lead: lead.id }
    });
  }

}
