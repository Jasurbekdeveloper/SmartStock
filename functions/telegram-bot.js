import { createHash, randomBytes } from 'node:crypto';

/** How long a "link via bot" code stays valid. */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;

/** Prefix of the /start payload that links an account (t.me/<bot>?start=link_<code>). */
export const LINK_PREFIX = 'link_';
/** Signing in on the login page through the bot (t.me/<bot>?start=login_<code>). */
export const LOGIN_PREFIX = 'login_';
/** Adding the bot to a group for reports (t.me/<bot>?startgroup=grp_<code>). */
export const GROUP_PREFIX = 'grp_';
/** A login code waits this long for the confirmation in Telegram. */
export const LOGIN_CODE_TTL_MS = 5 * 60 * 1000;

const PREFIXES = { link: LINK_PREFIX, login: LOGIN_PREFIX, group: GROUP_PREFIX };

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

/**
 * Reads "/start <prefix><code>" (also "/start@bot …", as sent in groups).
 * Returns { kind: 'link' | 'login' | 'group', code } or null.
 */
export function parseStartPayload(text) {
  if (typeof text !== 'string') return null;
  const match = /^\/start(?:@\w+)?\s+(\S+)\s*$/.exec(text.trim());
  if (!match) return null;
  for (const [kind, prefix] of Object.entries(PREFIXES)) {
    if (match[1].startsWith(prefix)) {
      const code = match[1].slice(prefix.length);
      return /^[A-Za-z0-9_-]{16,60}$/.test(code) ? { kind, code } : null;
    }
  }
  return null;
}

/** Inline-button data "lok:<code>" (confirm) / "lno:<code>" (reject) of a login request. */
export function parseLoginCallback(data) {
  const match = /^(lok|lno):([A-Za-z0-9_-]{16,60})$/.exec(String(data ?? ''));
  return match ? { confirm: match[1] === 'lok', code: match[2] } : null;
}
