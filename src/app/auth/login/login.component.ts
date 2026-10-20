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
import { AuthService } from '../../core/services/auth.service';
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
    MatProgressSpinnerModule
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
  ) {}

  login() {
    if (!this.email || !this.password) {
      this.error.set('auth.invalidCredentials');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.authService.login(this.email, this.password).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard';
        this.router.navigateByUrl(returnUrl);
      },
      error: (err) => {
        console.error('Login error:', err);
        this.error.set('auth.invalidCredentials');
        this.loading.set(false);
      }
    });
  }
}
