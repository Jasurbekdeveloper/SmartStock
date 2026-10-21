// Demo requests from the marketing site (website/main.js -> CONFIG.leadUrl).
// Runs on Cloudflare Workers' free plan, so it works while the Firebase project
// stays on Spark (Cloud Functions need Blaze). Validation and the Telegram text
// are shared with functions/lead.js.
//
// Env (wrangler.toml [vars] + `wrangler secret put`):
//   TELEGRAM_BOT_TOKEN   secret — bot that messages the super admins
//   TELEGRAM_CHAT_IDS    secret — comma-separated chat IDs to notify
//   FIREBASE_PROJECT_ID, FIREBASE_API_KEY, APP_URL, ALLOWED_ORIGINS
import { formatLeadMessage, parseLead } from '../../functions/lead.js';

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 5;
/** Best effort per-isolate limit; Firestore rules still bound the document shape. */
const hits = new Map();

function allowIp(ip, now = Date.now()) {
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) return false;
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function sendTelegram(env, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
  if (!res.ok) console.warn('Telegram sendMessage failed', chatId, res.status, await res.text());
  return res.ok;
}

async function notify(env, text) {
  const chatIds = String(env.TELEGRAM_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!env.TELEGRAM_BOT_TOKEN || chatIds.length === 0) return 0;
  const results = await Promise.all(chatIds.map((id) => sendTelegram(env, id, text).catch(() => false)));
  return results.filter(Boolean).length;
}

function toValue(value) {
  return typeof value === 'number' ? { integerValue: String(value) } : { stringValue: String(value) };
}

/** Creates leads/{auto-id} through the Firestore REST API without sign-in;
 *  firestore.rules (match /leads) decides whether the document is acceptable. */
async function saveLead(env, data) {
  const db = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== '' && value !== undefined && value !== null) fields[key] = toValue(value);
  }
  const res = await fetch(`https://firestore.googleapis.com/v1/${db}:commit?key=${env.FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [
        {
          update: { name: `${db}/leads/${id}`, fields },
          currentDocument: { exists: false },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }]
        }
      ]
    })
  });
  if (!res.ok) throw new Error(`Firestore ${res.status}: ${await res.text()}`);
  return id;
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, headers);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'BAD_REQUEST' }, 400, headers);
    }
    const { lead, error } = parseLead(body);
    // Look successful to bots so they don't adapt.
    if (error === 'SPAM') return json({ ok: true }, 200, headers);
    if (error) return json({ error }, 400, headers);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!allowIp(ip)) return json({ error: 'TOO_MANY_REQUESTS' }, 429, headers);

    // Telegram first: if Firestore then fails, the admin still has the contact.
    let notified = 0;
    try {
      notified = await notify(env, formatLeadMessage(lead, `${env.APP_URL}/platform/leads`));
    } catch (err) {
      console.error('Lead notification failed', err);
    }

    try {
      await saveLead(env, {
        ...lead,
        status: 'new',
        source: 'website',
        notified,
        ipHash: await sha256(ip),
        userAgent: String(request.headers.get('User-Agent') || '').slice(0, 300)
      });
    } catch (err) {
      console.error('Saving lead failed', err);
      // Telegram got it, so the person is not lost; report success only in that case.
      if (notified === 0) return json({ error: 'SAVE_FAILED' }, 502, headers);
    }
    return json({ ok: true }, 200, headers);
  }
};
