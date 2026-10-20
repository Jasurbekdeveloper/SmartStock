import { Component, DestroyRef, ElementRef, inject, input, output, viewChild, effect } from '@angular/core';
import { TelegramAuthData } from '../../../core/services/auth.service';

let callbackCounter = 0;

/**
 * Renders Telegram's official Login Widget (an iframe button). The widget only works
 * on the domain registered for the bot via @BotFather → /setdomain, so it shows
 * nothing on localhost.
 */
@Component({
  selector: 'app-telegram-login-button',
  standalone: true,
  template: `<div #host class="flex justify-center min-h-[40px]"></div>`
})
export class TelegramLoginButtonComponent {
  botName = input.required<string>();
  size = input<'large' | 'medium' | 'small'>('large');
  authenticated = output<TelegramAuthData>();

  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private callbackName = `onTelegramAuth_${++callbackCounter}`;

  constructor() {
    const w = window as unknown as Record<string, unknown>;
    w[this.callbackName] = (user: TelegramAuthData) => this.authenticated.emit(user);
    inject(DestroyRef).onDestroy(() => delete w[this.callbackName]);

    effect(() => {
      const el = this.host().nativeElement;
      el.replaceChildren();
      if (!this.botName()) return;
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', this.botName());
      script.setAttribute('data-size', this.size());
      script.setAttribute('data-radius', '10');
      script.setAttribute('data-request-access', 'write');
      script.setAttribute('data-onauth', `${this.callbackName}(user)`);
      el.appendChild(script);
    });
  }
}
