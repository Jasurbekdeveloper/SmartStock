import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { AuthService, TelegramAuthData } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { environment } from '../../../../environments/environment';
import { TelegramLoginButtonComponent } from '../telegram-login-button/telegram-login-button.component';
import { telegramErrorKey } from './telegram-errors';

/** Lets a signed-in user connect (or disconnect) their Telegram account, after which
 *  "Log in with Telegram" on the login page signs them straight in. */
@Component({
  selector: 'app-telegram-link-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe, TelegramLoginButtonComponent],
  template: `
    <h2 mat-dialog-title>{{ 'telegram.linkTitle' | translate }}</h2>
    <mat-dialog-content class="!pt-1">
      <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">{{ 'telegram.linkHelp' | translate }}</p>

      @if (user()?.telegramId) {
      <div class="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
        <mat-icon class="text-sky-500">send</mat-icon>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold">{{ 'telegram.linked' | translate }}</div>
          <div class="text-xs text-gray-500 truncate">
            {{ user()?.telegramUsername ? '@' + user()?.telegramUsername : 'ID ' + user()?.telegramId }}
          </div>
        </div>
        <button mat-stroked-button color="warn" [disabled]="busy()" (click)="unlink()">{{ 'telegram.unlink' | translate }}</button>
      </div>
      } @else if (botName) {
      <app-telegram-login-button [botName]="botName" (authenticated)="link($event)"></app-telegram-login-button>
      } @else {
      <p class="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-3 text-sm text-amber-800 dark:text-amber-200">{{ 'telegram.notConfigured' | translate }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.close' | translate }}</button>
    </mat-dialog-actions>
  `
})
export class TelegramLinkDialogComponent {
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

  readonly botName = environment.telegramBotUsername;
  user = toSignal(this.authService.currentUser$, { initialValue: null });
  busy = signal(false);

  link(data: TelegramAuthData) {
    this.busy.set(true);
    this.authService.linkTelegram(data).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(this.translation.translate('telegram.linkedOk'));
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(this.translation.translate(telegramErrorKey(err)));
      }
    });
  }

  unlink() {
    this.busy.set(true);
    this.authService.unlinkTelegram().subscribe({
      next: () => this.busy.set(false),
      error: (err) => {
        this.busy.set(false);
        this.toast.error(this.translation.translate(telegramErrorKey(err)));
      }
    });
  }
}
