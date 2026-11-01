import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AppUser, AuthService, TelegramAuthData } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { TelegramLoginButtonComponent } from '../../shared/components/telegram-login-button/telegram-login-button.component';
import { telegramErrorKey } from '../../shared/components/telegram-link-dialog/telegram-errors';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { Language, TranslationService } from '../../core/services/translation.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslatePipe,
    RouterModule,
    MatIconModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    TelegramLoginButtonComponent
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  email = '';
  password = '';
  error = signal<string | null>(null);
  /** Raw Firebase/app code shown under the message, so the real cause is visible. */
  errorCode = signal<string | null>(null);
  /** Everyone except the super admin is told to contact their administrator. */
  contactAdmin = signal(false);
  loading = signal(false);
  showPassword = signal(false);
  readonly telegramBotName = environment.telegramBotUsername;
  /** Sign-in through the bot: link to open, and what we're waiting for. */
  botLogin = signal<{ url: string; state: 'waiting' | 'expired' | 'rejected' } | null>(null);
  private botPoll: ReturnType<typeof setTimeout> | null = null;
  private botCode: string | null = null;

  private translation = inject(TranslationService);
  themeService = inject(ThemeService);

  readonly languages: { code: Language; label: string }[] = [
    { code: 'uz', label: 'UZ' },
    { code: 'uz-cyrillic', label: 'ЎЗ' },
    { code: 'ru', label: 'RU' },
    { code: 'en', label: 'EN' }
  ];

  currentLanguage = this.translation.currentLanguage$;

  setLanguage(code: Language) {
    this.translation.setLanguage(code);
  }

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    if (this.route.snapshot.queryParamMap.get('reason') === 'suspended') {
      this.error.set('auth.storeSuspended');
    }
    inject(DestroyRef).onDestroy(() => this.stopBotLogin());
  }

  /**
   * Sign in with any Telegram account: the Login Widget always shows the account this
   * browser used last, the bot answers whichever account presses Start.
   */
  loginViaBot() {
    // Open the tab inside the click so popup blockers allow it; the address follows.
    const tab = window.open('', '_blank');
    this.stopBotLogin();
    this.showError(null, null, false);
    this.loading.set(true);
    this.authService.createTelegramLoginCode().subscribe({
      next: ({ code, start }) => {
        this.loading.set(false);
        const url = `https://t.me/${this.telegramBotName}?start=${encodeURIComponent(start)}`;
        if (tab) tab.location.href = url;
        this.botCode = code;
        this.botLogin.set({ url, state: 'waiting' });
        this.scheduleBotCheck(Date.now() + 5 * 60 * 1000);
      },
      error: (err) => {
        tab?.close();
        this.loading.set(false);
        this.showError(telegramErrorKey(err), (err as { code?: string })?.code || null, false);
      }
    });
  }

  cancelBotLogin() {
    this.stopBotLogin();
    this.botLogin.set(null);
  }

  private stopBotLogin() {
    if (this.botPoll) clearTimeout(this.botPoll);
    this.botPoll = null;
    this.botCode = null;
  }

  private scheduleBotCheck(deadline: number) {
    this.botPoll = setTimeout(() => this.checkBotLogin(deadline), 2500);
  }

  private async checkBotLogin(deadline: number) {
    const code = this.botCode;
    if (!code) return;
    try {
      const result = await this.authService.checkTelegramLogin(code);
      if (code !== this.botCode) return;
      if (result.status === 'confirmed') {
        this.stopBotLogin();
        this.botLogin.set(null);
        this.redirectAfterLogin(result.user);
        return;
      }
      if (result.status === 'pending' && Date.now() < deadline) {
        this.scheduleBotCheck(deadline);
        return;
      }
      this.stopBotLogin();
      this.botLogin.update((b) => (b ? { ...b, state: result.status === 'rejected' ? 'rejected' : 'expired' } : b));
    } catch (err) {
      if (code !== this.botCode) return;
      const message = (err as Error)?.message;
      if (message === 'INACTIVE' || message === 'TENANT_SUSPENDED' || message === 'NO_PROFILE' || (err as { code?: string })?.code === 'functions/permission-denied') {
        this.stopBotLogin();
        this.botLogin.set(null);
        this.showError(this.loginErrorKey(err), (err as { code?: string })?.code || message || null, true);
        return;
      }
      // A network hiccup: keep waiting until the deadline.
      if (Date.now() < deadline) this.scheduleBotCheck(deadline);
    }
  }

  login() {
    if (!this.email || !this.password) {
      this.showError('auth.fillFields', null, false);
      return;
    }

    this.loading.set(true);
    this.showError(null, null, false);

    this.authService.login(this.email, this.password).subscribe({
      next: (user) => this.redirectAfterLogin(user),
      error: (err) => {
        console.error('Login error:', err);
        const key = this.loginErrorKey(err);
        const code = (err as { code?: string })?.code || (err as Error)?.message || null;
        // Messages that already name who to contact don't get the extra hint.
        const named = key === 'auth.storeSuspended' || key === 'auth.inactive' || key === 'auth.noProfile';
        this.showError(key, code, !named && (err as { role?: string })?.role !== 'superadmin');
        this.loading.set(false);
      }
    });
  }

  loginWithTelegram(data: TelegramAuthData) {
    this.loading.set(true);
    this.showError(null, null, false);
    this.authService.loginWithTelegram(data).subscribe({
      next: (user) => this.redirectAfterLogin(user),
      error: (err) => {
        console.error('Telegram login error:', err);
        this.showError(telegramErrorKey(err), (err as { code?: string })?.code || null, (err as { role?: string })?.role !== 'superadmin');
        this.loading.set(false);
      }
    });
  }

  private redirectAfterLogin(user: AppUser) {
    if (user.role === 'superadmin') {
      this.router.navigateByUrl('/platform');
      return;
    }
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    this.router.navigateByUrl(returnUrl && !returnUrl.startsWith('/platform') ? returnUrl : '/dashboard');
  }

  private showError(key: string | null, code: string | null, contactAdmin: boolean) {
    this.error.set(key);
    this.errorCode.set(code);
    this.contactAdmin.set(contactAdmin);
  }

  /** Firebase Auth / Firestore codes and AuthService.finishLogin errors -> message keys. */
  private loginErrorKey(err: unknown): string {
    const message = (err as Error)?.message;
    const code = (err as { code?: string })?.code ?? '';
    if (message === 'TENANT_SUSPENDED') return 'auth.storeSuspended';
    if (message === 'INACTIVE') return 'auth.inactive';
    if (message === 'NO_PROFILE') return 'auth.noProfile';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
      case 'auth/invalid-email':
        return 'auth.invalidCredentials';
      case 'auth/user-disabled':
        return 'auth.userDisabled';
      case 'auth/too-many-requests':
        return 'auth.tooManyRequests';
      case 'auth/network-request-failed':
      case 'unavailable':
        return 'auth.network';
      case 'permission-denied':
        return 'auth.permissionDenied';
      default:
        return 'auth.unknownError';
    }
  }
}
