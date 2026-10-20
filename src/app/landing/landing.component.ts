import { Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../core/pipes/translate.pipe';
import { SettingsService } from '../core/services/settings.service';
import { AuthService } from '../core/services/auth.service';
import { Language, TranslationService } from '../core/services/translation.service';
import { ThemeService } from '../core/services/theme.service';

interface Category {
  icon: string;
  key: string;
}

/** Public storefront page for "Original qurilish do'koni" — no login required. Contact
 *  details come from `settings/general` (publicly readable) so the admin edits them
 *  in Settings instead of in code. */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterModule, MatIconModule, TranslatePipe],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.css'
})
export class LandingComponent {
  private settingsService = inject(SettingsService);
  private translation = inject(TranslationService);
  themeService = inject(ThemeService);

  settings = toSignal(this.settingsService.getGeneralSettings(), { initialValue: undefined });
  private user = toSignal(inject(AuthService).currentUser$, { initialValue: null });
  isSignedIn = computed(() => !!this.user());

  menuOpen = signal(false);
  readonly year = new Date().getFullYear();

  phoneHref = computed(() => {
    const phone = this.settings()?.storePhone;
    return phone ? 'tel:' + phone.replace(/[^\d+]/g, '') : null;
  });

  telegramHref = computed(() => {
    const tg = this.settings()?.storeTelegram;
    return tg ? 'https://t.me/' + tg.replace(/^@/, '') : null;
  });

  mapHref = computed(() => {
    const address = this.settings()?.storeAddress;
    return address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address) : null;
  });

  /** Primary call to action: Telegram if configured, otherwise a phone call. */
  orderHref = computed(() => this.telegramHref() ?? this.phoneHref());

  readonly categories: Category[] = [
    { icon: 'foundation', key: 'cement' },
    { icon: 'grid_view', key: 'bricks' },
    { icon: 'hardware', key: 'metal' },
    { icon: 'format_paint', key: 'paint' },
    { icon: 'plumbing', key: 'plumbing' },
    { icon: 'electrical_services', key: 'electrical' },
    { icon: 'handyman', key: 'tools' },
    { icon: 'roofing', key: 'roofing' }
  ];

  readonly features = [
    { icon: 'verified', key: 'original' },
    { icon: 'sell', key: 'prices' },
    { icon: 'local_shipping', key: 'delivery' },
    { icon: 'support_agent', key: 'advice' },
    { icon: 'credit_card', key: 'payment' },
    { icon: 'handshake', key: 'wholesale' }
  ];

  readonly steps = ['call', 'prepare', 'deliver'];

  readonly languages: { code: Language; label: string }[] = [
    { code: 'uz', label: 'UZ' },
    { code: 'uz-cyrillic', label: 'ЎЗ' },
    { code: 'ru', label: 'RU' },
    { code: 'en', label: 'EN' }
  ];

  currentLanguage = () => this.translation.getLanguage();

  setLanguage(code: Language) {
    this.translation.setLanguage(code);
  }

  closeMenu() {
    this.menuOpen.set(false);
  }
}
