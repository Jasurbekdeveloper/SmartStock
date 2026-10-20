import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Login data older than this is rejected so a captured payload can't be replayed later. */
export const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/**
 * Verifies a Telegram Login Widget payload.
 * https://core.telegram.org/widgets/login#checking-authorization
 * secret = SHA256(bot_token); hash = HMAC_SHA256(secret, "key=value\n..." sorted, without hash).
 */
export function verifyTelegramAuth(data, botToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!data || typeof data !== 'object' || typeof data.hash !== 'string' || !data.id || !data.auth_date) {
    return false;
  }
  const checkString = Object.keys(data)
    .filter((key) => key !== 'hash' && data[key] !== undefined && data[key] !== null)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(data.hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return false;
  }
  return nowSeconds - Number(data.auth_date) <= MAX_AUTH_AGE_SECONDS;
}
