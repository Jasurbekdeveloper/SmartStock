import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from './src/index.js';

const env = {
  TELEGRAM_BOT_TOKEN: '123:abc',
  TELEGRAM_CHAT_IDS: '111, 222',
  FIREBASE_PROJECT_ID: 'demo',
  FIREBASE_API_KEY: 'key',
  APP_URL: 'https://app.example',
  ALLOWED_ORIGINS: 'https://site.example'
};

let calls;
beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    return new Response('{}', { status: 200 });
  };
});

let ipSeq = 0;
function post(body, ip = `10.0.0.${++ipSeq}`) {
  return worker.fetch(new Request('https://w.example/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://site.example', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body)
  }), env);
}

const lead = { name: 'Ali', phone: '90 123 45 67', storeName: 'Qurilish', elapsedMs: 9000, lang: 'ru' };

test('valid lead: Telegram to every chat, then a Firestore commit with server time', async () => {
  const res = await post(lead);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://site.example');
  const tg = calls.filter((c) => c.url.includes('api.telegram.org'));
  assert.deepEqual(tg.map((c) => c.body.chat_id), ['111', '222']);
  const commit = calls.find((c) => c.url.includes(':commit'));
  const write = commit.body.writes[0];
  assert.match(write.update.name, /^projects\/demo\/databases\/\(default\)\/documents\/leads\/\w{20}$/);
  assert.equal(write.update.fields.phone.stringValue, '+998901234567');
  assert.equal(write.update.fields.notified.integerValue, '2');
  assert.equal(write.update.fields.status.stringValue, 'new');
  assert.equal(write.update.fields.city, undefined, 'empty optional fields are omitted');
  assert.deepEqual(write.updateTransforms, [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }]);
});

test('invalid phone is rejected without side effects', async () => {
  const res = await post({ ...lead, phone: '12' });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('honeypot looks successful but does nothing', async () => {
  const res = await post({ ...lead, website: 'spam' });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

test('more than 5 per hour from one IP is limited', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await post(lead, '9.9.9.9')).status, 200);
  assert.equal((await post(lead, '9.9.9.9')).status, 429);
});

test('preflight and wrong method', async () => {
  const pre = await worker.fetch(new Request('https://w.example/', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'https://site.example');
  const get = await worker.fetch(new Request('https://w.example/'), env);
  assert.equal(get.status, 405);
});

test('save failure with no Telegram delivery is reported', async () => {
  globalThis.fetch = async (url) => new Response('nope', { status: String(url).includes(':commit') ? 403 : 500 });
  const res = await post(lead);
  assert.equal(res.status, 502);
});
