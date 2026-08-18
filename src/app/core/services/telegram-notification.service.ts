import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from './settings.service';

/**
 * Sends plain-text alerts to the store's Telegram chat via the Bot API, straight from
 * the browser with native `fetch` (deliberately NOT Angular's `HttpClient` — this is a
 * fire-and-forget call to a third-party API, and going through `HttpClient` would drag
 * it through any app-wide interceptors that assume they're talking to our own backend).
 *
 * There is no Cloud Functions backend in this project (Hosting only), so this can only
 * ever be a client-triggered send — true server-side background push notifications,
 * independent of anyone having the app open, are not feasible here.
 */
@Injectable({
  providedIn: 'root'
})
export class TelegramNotificationService {
  private settingsService = inject(SettingsService);

  /**
   * No-ops silently (just a console warning) if the admin hasn't configured a bot
   * token/chat ID yet in Settings — this is expected/common until an admin visits
   * Settings for the first time, so it must never throw or surface an error toast
   * to a cashier who has no way to fix it anyway.
   *
   * Returns whether the message was actually handed off to the Telegram API —
   * callers (the dashboard alert check) use this to decide whether it's safe to mark
   * the item as "sent" in the shared `notificationState` dedup doc; a no-op or a
   * failed `fetch` must NOT be recorded as sent, or a later-configured token would
   * silently skip re-sending it for the rest of the dedup window.
   */
  async sendMessage(text: string): Promise<boolean> {
    const integrations = await firstValueFrom(this.settingsService.getIntegrationSettings());
    const token = integrations?.telegramBotToken;
    const chatId = integrations?.telegramChatId;

    if (!token || !chatId) {
      console.warn('TelegramNotificationService: bot token/chat ID not configured, skipping send.');
      return false;
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
      });
      return res.ok;
    } catch (err) {
      console.warn('TelegramNotificationService: failed to send message.', err);
      return false;
    }
  }
}
