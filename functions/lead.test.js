import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLeadMessage, normalizePhone, parseLead } from './lead.js';

const valid = { name: 'Ali', phone: '90 123 45 67', storeName: 'Qurilish', elapsedMs: 10_000 };

test('normalizes a local Uzbek number', () => {
  assert.equal(normalizePhone('90 123-45-67'), '+998901234567');
  assert.equal(normalizePhone('+998 (90) 123 45 67'), '+998901234567');
});

test('accepts a valid lead and trims fields', () => {
  const { lead, error } = parseLead({ ...valid, city: '  Toshkent  ', lang: 'ru' });
  assert.equal(error, undefined);
  assert.equal(lead.phone, '+998901234567');
  assert.equal(lead.city, 'Toshkent');
  assert.equal(lead.lang, 'ru');
});

test('rejects missing name or bad phone', () => {
  assert.equal(parseLead({ ...valid, name: ' ' }).error, 'INVALID_NAME');
  assert.equal(parseLead({ ...valid, phone: '123' }).error, 'INVALID_PHONE');
});

test('flags honeypot and too-fast submits as spam', () => {
  assert.equal(parseLead({ ...valid, website: 'http://x' }).error, 'SPAM');
  assert.equal(parseLead({ ...valid, elapsedMs: 300 }).error, 'SPAM');
});

test('escapes HTML in the Telegram message', () => {
  const { lead } = parseLead({ ...valid, message: '<b>hi</b> & bye' });
  const text = formatLeadMessage(lead, 'https://app/platform/leads');
  assert.match(text, /&lt;b&gt;hi&lt;\/b&gt; &amp; bye/);
  assert.match(text, /Yangi mijoz qiziqish bildirdi/);
});
