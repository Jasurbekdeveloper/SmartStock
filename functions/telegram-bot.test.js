import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLinkCode, parseLinkCode, webhookSecret } from './telegram-bot.js';

test('link codes are URL-safe and fit the /start payload', () => {
  const code = newLinkCode();
  assert.match(code, /^[A-Za-z0-9_-]{20,30}$/);
  assert.notEqual(code, newLinkCode());
  assert.equal(parseLinkCode(`/start link_${code}`), code);
});

test('parses the link code from /start only', () => {
  assert.equal(parseLinkCode('/start link_AbCdEfGhIjKlMnOpQrSt'), 'AbCdEfGhIjKlMnOpQrSt');
  assert.equal(parseLinkCode('/start@hisobla_auth_bot link_AbCdEfGhIjKlMnOpQrSt'), 'AbCdEfGhIjKlMnOpQrSt');
  assert.equal(parseLinkCode('/start'), null);
  assert.equal(parseLinkCode('/start other_AbCdEfGhIjKlMnOpQrSt'), null);
  assert.equal(parseLinkCode('/start link_short'), null);
  assert.equal(parseLinkCode('/start link_bad!code$$$$$$$$$$$$$'), null);
  assert.equal(parseLinkCode('hello'), null);
  assert.equal(parseLinkCode(undefined), null);
});

test('webhook secret is stable per bot and header-safe', () => {
  assert.equal(webhookSecret('1:a'), webhookSecret('1:a'));
  assert.notEqual(webhookSecret('1:a'), webhookSecret('1:b'));
  assert.match(webhookSecret('1:a'), /^[0-9a-f]{48}$/);
});
