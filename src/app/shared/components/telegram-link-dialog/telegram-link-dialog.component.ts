import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
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

/** Lets a signed-in user connect, switch or disconnect their Telegram account.
 *
 *  Two ways to connect:
 *  - the Login Widget: one click, but it always answers with the Telegram account
 *    this browser used last, so it can't switch to another account;
 *  - the bot: t.me/<bot>?start=link_<code> opens in Telegram, the user presses Start
 *    in whichever account they want, and the bot links that one. */
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
      <button mat-button type="button" class="mt-3 w-full" [disabled]="busy()" (click)="linkViaBot()">
        <mat-icon>swap_horiz</mat-icon>{{ 'telegram.switchAccount' | translate }}
      </button>
      } @else if (botName) {
      <div class="space-y-3">
        <button mat-flat-button color="primary" type="button" class="w-full !h-12" [disabled]="busy()" (click)="linkViaBot()">
          <mat-icon>send</mat-icon>{{ 'telegram.linkViaBot' | translate }}
        </button>
        <p class="text-xs text-gray-500 text-center">{{ 'telegram.linkViaBotHint' | translate }}</p>
        <div class="flex items-center gap-2 text-xs text-gray-400"><span class="flex-1 border-t"></span>{{ 'telegram.or' | translate }}<span class="flex-1 border-t"></span></div>
        <app-telegram-login-button [botName]="botName" size="medium" (authenticated)="link($event)"></app-telegram-login-button>
        <p class="text-xs text-gray-500 text-center">{{ 'telegram.widgetHint' | translate }}</p>
      </div>
      } @else {
      <p class="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-3 text-sm text-amber-800 dark:text-amber-200">{{ 'telegram.notConfigured' | translate }}</p>
      }

      @if (botLink(); as url) {
      <div class="mt-4 rounded-xl bg-sky-50 dark:bg-sky-900/30 p-3 text-sm">
        <p class="font-semibold">{{ 'telegram.waitingStart' | translate }}</p>
        <a class="mt-1 inline-flex items-center gap-1 text-sky-700 dark:text-sky-300 underline break-all" [href]="url" target="_blank" rel="noopener">
          <mat-icon class="!w-4 !h-4 !text-base">open_in_new</mat-icon>{{ 'telegram.openBot' | translate }}
        </a>
      </div>
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
  /** Set while we wait for the user to press Start in the bot. */
  botLink = signal<string | null>(null);
  private telegramBeforeBot: number | null | undefined;

  constructor() {
    // The profile is live: when the bot links an account, telegramId changes here.
    effect(() => {
      const id = this.user()?.telegramId ?? null;
      if (this.botLink() && id && id !== this.telegramBeforeBot) {
        this.botLink.set(null);
        this.toast.success(this.translation.translate('telegram.linkedOk'));
      }
    });
    inject(DestroyRef).onDestroy(() => this.botLink.set(null));
  }

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

  linkViaBot() {
    // Open the tab right away (inside the click) so popup blockers allow it; the
    // address is filled in once the one-time code arrives.
    const tab = window.open('', '_blank');
    this.busy.set(true);
    this.telegramBeforeBot = this.user()?.telegramId ?? null;
    this.authService.createTelegramLinkCode().subscribe({
      next: ({ start }) => {
        this.busy.set(false);
        const url = `https://t.me/${this.botName}?start=${encodeURIComponent(start)}`;
        this.botLink.set(url);
        if (tab) tab.location.href = url;
      },
      error: (err) => {
        tab?.close();
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
