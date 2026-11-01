import { createHash, randomBytes } from 'node:crypto';

/** How long a "link via bot" code stays valid. */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;

/** Prefix of the /start payload that links an account (t.me/<bot>?start=link_<code>). */
export const LINK_PREFIX = 'link_';

/** A random, URL-safe one-time code. Telegram allows [A-Za-z0-9_-] up to 64 chars in /start. */
export function newLinkCode() {
  return randomBytes(18).toString('base64url');
}

/**
 * Secret Telegram sends back in the X-Telegram-Bot-Api-Secret-Token header, so the
 * webhook only accepts updates that really come from Telegram for this bot.
 * Derived from the bot token: nothing extra to store.
 */
export function webhookSecret(botToken) {
  return createHash('sha256').update(`${botToken}:webhook`).digest('hex').slice(0, 48);
}

/** Returns the link code from "/start link_<code>" (or "/start@bot link_<code>"), else null. */
export function parseLinkCode(text) {
  if (typeof text !== 'string') return null;
  const match = /^\/start(?:@\w+)?\s+(\S+)\s*$/.exec(text.trim());
  if (!match || !match[1].startsWith(LINK_PREFIX)) return null;
  const code = match[1].slice(LINK_PREFIX.length);
  return /^[A-Za-z0-9_-]{16,60}$/.test(code) ? code : null;
}
