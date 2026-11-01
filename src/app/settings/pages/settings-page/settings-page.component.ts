import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { take } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import {
  DEFAULT_CURRENCY_SYMBOL,
  DEFAULT_PRICES_INCLUDE_VAT,
  DEFAULT_RECEIPT_PAPER_WIDTH,
  DEFAULT_STORE_NAME,
  DEFAULT_VAT_RATE,
  FiscalPolicy,
  ReceiptPaperWidth,
  SettingsService,
  TelegramReportSettings
} from '../../../core/services/settings.service';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';
import { telegramErrorKey } from '../../../shared/components/telegram-link-dialog/telegram-errors';
import { TenantService } from '../../../core/services/tenant.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FiscalConfig, FiscalService } from '../../../core/services/fiscal.service';
import { LabelSettings, LabelSize, withLabelDefaults } from '../../../core/utils/labels';
import { NumericInputDirective } from '../../../shared/directives/numeric-input.directive';

/** Local editable model for the General tab. `vatRatePercent` is what the admin types
 *  (e.g. 12) — it's converted to/from the stored fraction (0.12) on load/save so the
 *  Firestore doc keeps using the same `vatRate` fraction the rest of the app (POS tax
 *  math) already expects. */
interface GeneralFormModel {
  vatRatePercent: number;
  pricesIncludeVat: boolean;
  currencySymbol: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeTaxId: string;
  storeTelegram: string;
  workingHours: string;
  receiptPaperWidth: ReceiptPaperWidth;
  receiptFooter: string;
  labels: LabelSettings;
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [NumericInputDirective, 
    CommonModule,
    FormsModule,
    TranslateModule,
    MatCardModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatSlideToggleModule
  ],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css'
})
export class SettingsPageComponent implements OnInit {
  private settingsService = inject(SettingsService);
  private tenantService = inject(TenantService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);
  private fiscal = inject(FiscalService);
  private authService = inject(AuthService);

  // ---------------------------------------------------------------- store-wide fiscal policy (admin)
  fiscalPolicy = this.settingsService.fiscalPolicy;

  setFiscalPolicy(patch: Partial<FiscalPolicy>) {
    this.settingsService.updateGeneralSettings({ fiscalPolicy: { ...this.fiscalPolicy(), ...patch } }).subscribe({
      next: () => this.toast.success(this.translation.translate('messages.saved')),
      error: () => this.toast.error(this.translation.translate('messages.error'))
    });
  }

  // ---------------------------------------------------------------- Telegram reports (MarketHisob bot)
  reports = this.settingsService.telegramReports;
  readonly reportBot = environment.telegramBotUsername;
  reportKinds = ['daily', 'weekly', 'monthly', 'lowStock', 'debtDue'] as const;
  reportBusy = signal(false);

  setReports(patch: Partial<TelegramReportSettings>) {
    // Only the switches: the group is set by the bot itself (merge keeps it).
    const { groupChatId: _g, groupTitle: _t, ...current } = this.reports();
    this.settingsService.updateGeneralSettings({ telegramReports: { ...current, ...patch } }).subscribe({
      next: () => this.toast.success(this.translation.translate('messages.saved')),
      error: () => this.toast.error(this.translation.translate('messages.error'))
    });
  }

  connectReportGroup() {
    const tab = window.open('', '_blank');
    this.reportBusy.set(true);
    this.authService.createTelegramGroupCode().subscribe({
      next: ({ start }) => {
        this.reportBusy.set(false);
        const url = `https://t.me/${this.reportBot}?startgroup=${encodeURIComponent(start)}`;
        if (tab) tab.location.href = url;
        else window.location.href = url;
        this.toast.success(this.translation.translate('reports.groupPick'));
      },
      error: (err) => {
        tab?.close();
        this.reportBusy.set(false);
        this.toast.error(this.translation.translate(telegramErrorKey(err)));
      }
    });
  }

  disconnectReportGroup() {
    this.setReports({ groupChatId: null, groupTitle: null });
  }

  sendReportNow(kind: (typeof this.reportKinds)[number]) {
    this.reportBusy.set(true);
    this.authService.sendTelegramReportNow(kind).subscribe({
      next: ({ sent, recipients }) => {
        this.reportBusy.set(false);
        if (recipients === 0) this.toast.error(this.translation.translate('reports.noRecipients'));
        else this.toast.success(`${this.translation.translate('reports.sent')}: ${sent}/${recipients}`);
      },
      error: (err) => {
        this.reportBusy.set(false);
        this.toast.error(this.translation.translate(telegramErrorKey(err)));
      }
    });
  }

  // ---------------------------------------------------------------- fiscal register (this device)
  fiscalForm = signal<FiscalConfig>({ ...this.fiscal.config() });
  fiscalTesting = signal(false);
  fiscalStatus = signal<{ ok: boolean; text: string } | null>(null);

  patchFiscal(patch: Partial<FiscalConfig>) {
    this.fiscalForm.update((f) => ({ ...f, ...patch }));
  }

  saveFiscal() {
    this.fiscal.saveConfig(this.fiscalForm());
    this.toast.success(this.translation.translate('messages.saved'));
  }

  /** Sys.Initialize with the values typed (before saving), so a wrong address shows at once. */
  async testFiscal() {
    this.fiscalTesting.set(true);
    this.fiscalStatus.set(null);
    try {
      const info = await this.fiscal.initialize({ ...this.fiscalForm(), url: this.fiscalForm().url.trim().replace(/\/+$/, '') });
      this.fiscalStatus.set({
        ok: true,
        text: `${this.translation.translate('fiscal.connected')}: ${info.TerminalID} · ${this.translation.translate('fiscal.receiptsLeft')} ${info.ReceiptMaxCount - info.ReceiptCount}`
      });
    } catch (err) {
      const msg = (err as Error).message === 'VCR_UNREACHABLE' ? this.translation.translate('fiscal.unreachable') : (err as Error).message;
      this.fiscalStatus.set({ ok: false, text: msg });
    } finally {
      this.fiscalTesting.set(false);
    }
  }

  general = signal<GeneralFormModel>({
    vatRatePercent: DEFAULT_VAT_RATE * 100,
    pricesIncludeVat: DEFAULT_PRICES_INCLUDE_VAT,
    currencySymbol: DEFAULT_CURRENCY_SYMBOL,
    storeName: DEFAULT_STORE_NAME,
    storeAddress: '',
    storePhone: '',
    storeTaxId: '',
    storeTelegram: '',
    workingHours: '',
    receiptPaperWidth: DEFAULT_RECEIPT_PAPER_WIDTH,
    receiptFooter: '',
    labels: withLabelDefaults(null)
  });

  loadingGeneral = signal(true);
  savingGeneral = signal(false);

  ngOnInit() {
    // `take(1)`: load the current value once to seed the form. Staying subscribed to
    // the live onSnapshot stream would clobber whatever the admin is mid-typing every
    // time this doc's own save round-trips back down.
    this.settingsService
      .getGeneralSettings()
      .pipe(take(1))
      .subscribe({
        next: (doc) => {
          if (doc) {
            this.general.set({
              vatRatePercent: (doc.vatRate ?? DEFAULT_VAT_RATE) * 100,
              pricesIncludeVat: doc.pricesIncludeVat ?? DEFAULT_PRICES_INCLUDE_VAT,
              currencySymbol: doc.currencySymbol ?? DEFAULT_CURRENCY_SYMBOL,
              storeName: doc.storeName ?? DEFAULT_STORE_NAME,
              storeAddress: doc.storeAddress ?? '',
              storePhone: doc.storePhone ?? '',
              storeTaxId: doc.storeTaxId ?? '',
              storeTelegram: doc.storeTelegram ?? '',
              workingHours: doc.workingHours ?? '',
              receiptPaperWidth: doc.receiptPaperWidth ?? DEFAULT_RECEIPT_PAPER_WIDTH,
              receiptFooter: doc.receiptFooter ?? '',
              labels: withLabelDefaults(doc.labelSettings)
            });
          }
          this.loadingGeneral.set(false);
        },
        error: (err) => {
          console.error('Load general settings error:', err);
          this.loadingGeneral.set(false);
        }
      });
  }

  setPricesIncludeVat(value: boolean) {
    this.general.update((g) => ({ ...g, pricesIncludeVat: value }));
  }

  setLabels(patch: Partial<LabelSettings>) {
    this.general.update((g) => ({ ...g, labels: { ...g.labels, ...patch } }));
  }

  readonly labelSizes: LabelSize[] = ['58x40', '40x30', '30x20', 'a4'];

  setPaperWidth(width: ReceiptPaperWidth) {
    this.general.update((g) => ({ ...g, receiptPaperWidth: width }));
  }

  saveGeneral() {
    const f = this.general();
    this.savingGeneral.set(true);

    this.settingsService
      .updateGeneralSettings({
        vatRate: f.vatRatePercent / 100,
        pricesIncludeVat: f.pricesIncludeVat,
        currencySymbol: f.currencySymbol.trim() || DEFAULT_CURRENCY_SYMBOL,
        storeName: f.storeName.trim() || DEFAULT_STORE_NAME,
        storeAddress: f.storeAddress.trim() || undefined,
        storePhone: f.storePhone.trim() || undefined,
        storeTaxId: f.storeTaxId.trim() || undefined,
        storeTelegram: f.storeTelegram.trim().replace(/^@/, '') || undefined,
        workingHours: f.workingHours.trim() || undefined,
        receiptPaperWidth: f.receiptPaperWidth,
        receiptFooter: f.receiptFooter.trim() || undefined,
        labelSettings: f.labels
      })
      .subscribe({
        next: () => {
          this.savingGeneral.set(false);
          this.toast.success(this.translation.translate('messages.saved'));
          // The platform lists stores by tenant name; keep it in step with the receipt name.
          this.tenantService.syncStoreName(f.storeName.trim() || DEFAULT_STORE_NAME).subscribe({ error: () => {} });
        },
        error: (err) => {
          console.error('Save general settings error:', err);
          this.savingGeneral.set(false);
          this.toast.error(this.translation.translate('messages.error'));
        }
      });
  }
}
