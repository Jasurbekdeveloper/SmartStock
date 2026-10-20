import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { verifyTelegramAuth } from './telegram-auth.js';

const BOT_TOKEN = '123456:TEST-token';
const now = 1_790_000_000;

function sign(data) {
  const check = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join('\n');
  const secret = createHash('sha256').update(BOT_TOKEN).digest();
  return { ...data, hash: createHmac('sha256', secret).update(check).digest('hex') };
}

test('accepts a correctly signed, fresh payload', () => {
  const data = sign({ id: 42, first_name: 'Ali', username: 'ali', auth_date: now - 60 });
  assert.equal(verifyTelegramAuth(data, BOT_TOKEN, now), true);
});

test('rejects a tampered field', () => {
  const data = sign({ id: 42, first_name: 'Ali', auth_date: now - 60 });
  assert.equal(verifyTelegramAuth({ ...data, id: 43 }, BOT_TOKEN, now), false);
});

test('rejects a payload signed with another bot', () => {
  const data = sign({ id: 42, auth_date: now - 60 });
  assert.equal(verifyTelegramAuth(data, '999:other', now), false);
});

test('rejects a stale payload', () => {
  const data = sign({ id: 42, auth_date: now - 2 * 24 * 60 * 60 });
  assert.equal(verifyTelegramAuth(data, BOT_TOKEN, now), false);
});

test('rejects garbage', () => {
  assert.equal(verifyTelegramAuth({ id: 1, auth_date: now, hash: 'zz' }, BOT_TOKEN, now), false);
  assert.equal(verifyTelegramAuth(null, BOT_TOKEN, now), false);
});
