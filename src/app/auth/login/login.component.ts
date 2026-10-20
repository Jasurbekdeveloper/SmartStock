import { Component, inject, signal } from '@angular/core';
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
  loading = signal(false);
  showPassword = signal(false);
  readonly telegramBotName = environment.telegramBotUsername;

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
  }

  login() {
    if (!this.email || !this.password) {
      this.error.set('auth.invalidCredentials');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.authService.login(this.email, this.password).subscribe({
      next: (user) => this.redirectAfterLogin(user),
      error: (err) => {
        console.error('Login error:', err);
        this.error.set(this.loginErrorKey(err));
        this.loading.set(false);
      }
    });
  }

  loginWithTelegram(data: TelegramAuthData) {
    this.loading.set(true);
    this.error.set(null);
    this.authService.loginWithTelegram(data).subscribe({
      next: (user) => this.redirectAfterLogin(user),
      error: (err) => {
        console.error('Telegram login error:', err);
        this.error.set(telegramErrorKey(err));
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

  private loginErrorKey(err: unknown): string {
    const message = (err as Error)?.message;
    if (message === 'TENANT_SUSPENDED') return 'auth.storeSuspended';
    if (message === 'INACTIVE') return 'auth.inactive';
    return 'auth.invalidCredentials';
  }
}
