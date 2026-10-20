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
  ReceiptPaperWidth,
  SettingsService
} from '../../../core/services/settings.service';
import { TenantService } from '../../../core/services/tenant.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';

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
}

interface IntegrationFormModel {
  telegramBotToken: string;
  telegramChatId: string;
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatCardModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule
  ],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css'
})
export class SettingsPageComponent implements OnInit {
  private settingsService = inject(SettingsService);
  private tenantService = inject(TenantService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

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
    receiptFooter: ''
  });

  integrations = signal<IntegrationFormModel>({
    telegramBotToken: '',
    telegramChatId: ''
  });

  loadingGeneral = signal(true);
  loadingIntegrations = signal(true);
  savingGeneral = signal(false);
  savingIntegrations = signal(false);

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
              receiptFooter: doc.receiptFooter ?? ''
            });
          }
          this.loadingGeneral.set(false);
        },
        error: (err) => {
          console.error('Load general settings error:', err);
          this.loadingGeneral.set(false);
        }
      });

    this.settingsService
      .getIntegrationSettings()
      .pipe(take(1))
      .subscribe({
        next: (doc) => {
          if (doc) {
            this.integrations.set({
              telegramBotToken: doc.telegramBotToken ?? '',
              telegramChatId: doc.telegramChatId ?? ''
            });
          }
          this.loadingIntegrations.set(false);
        },
        error: (err) => {
          console.error('Load integration settings error:', err);
          this.loadingIntegrations.set(false);
        }
      });
  }

  setPricesIncludeVat(value: boolean) {
    this.general.update((g) => ({ ...g, pricesIncludeVat: value }));
  }

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
        receiptFooter: f.receiptFooter.trim() || undefined
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

  saveIntegrations() {
    const f = this.integrations();
    this.savingIntegrations.set(true);

    this.settingsService
      .updateIntegrationSettings({
        telegramBotToken: f.telegramBotToken.trim() || undefined,
        telegramChatId: f.telegramChatId.trim() || undefined
      })
      .subscribe({
        next: () => {
          this.savingIntegrations.set(false);
          this.toast.success(this.translation.translate('messages.saved'));
        },
        error: (err) => {
          console.error('Save integration settings error:', err);
          this.savingIntegrations.set(false);
          this.toast.error(this.translation.translate('messages.error'));
        }
      });
  }
}
