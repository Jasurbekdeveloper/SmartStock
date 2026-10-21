import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createHash } from 'node:crypto';
import { verifyTelegramAuth } from './telegram-auth.js';
import { formatLeadMessage, parseLead } from './lead.js';

initializeApp();
const db = getFirestore();

// Must match FUNCTIONS_REGION in src/app/core/firebase/firebase.providers.ts.
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

// Set with: firebase functions:secrets:set TELEGRAM_BOT_TOKEN
const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');

const TELEGRAM_FIELDS = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash'];

/** Keeps only the widget's own fields: the signature covers exactly those. */
function telegramPayload(data) {
  const payload = {};
  for (const key of TELEGRAM_FIELDS) {
    if (data?.[key] !== undefined && data?.[key] !== null) payload[key] = data[key];
  }
  return payload;
}

function requireValidTelegram(data) {
  const payload = telegramPayload(data);
  if (!verifyTelegramAuth(payload, TELEGRAM_BOT_TOKEN.value())) {
    throw new HttpsError('permission-denied', 'TELEGRAM_INVALID');
  }
  return payload;
}

/** Signs in with Telegram: returns a custom token for the account that linked this
 *  Telegram ID. Active profile and non-suspended store are checked again in the app. */
export const telegramLogin = onCall({ secrets: [TELEGRAM_BOT_TOKEN] }, async (request) => {
  const payload = requireValidTelegram(request.data);
  const link = await db.doc(`telegramLinks/${payload.id}`).get();
  if (!link.exists) {
    throw new HttpsError('not-found', 'TELEGRAM_NOT_LINKED');
  }
  const uid = link.get('uid');
  const profile = await db.doc(`users/${uid}`).get();
  if (!profile.exists || profile.get('active') !== true) {
    throw new HttpsError('permission-denied', 'INACTIVE');
  }
  return { token: await getAuth().createCustomToken(uid) };
});

/** Links the caller's account to their Telegram ID (one Telegram account per user). */
export const linkTelegram = onCall({ secrets: [TELEGRAM_BOT_TOKEN] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'SIGN_IN_REQUIRED');
  }
  const payload = requireValidTelegram(request.data);
  const uid = request.auth.uid;
  const linkRef = db.doc(`telegramLinks/${payload.id}`);
  const userRef = db.doc(`users/${uid}`);

  await db.runTransaction(async (tx) => {
    const [link, user] = await Promise.all([tx.get(linkRef), tx.get(userRef)]);
    if (!user.exists) {
      throw new HttpsError('failed-precondition', 'NO_PROFILE');
    }
    if (link.exists && link.get('uid') !== uid) {
      throw new HttpsError('already-exists', 'TELEGRAM_TAKEN');
    }
    const previousId = user.get('telegramId');
    if (previousId && String(previousId) !== String(payload.id)) {
      tx.delete(db.doc(`telegramLinks/${previousId}`));
    }
    tx.set(linkRef, { uid, linkedAt: FieldValue.serverTimestamp() });
    tx.update(userRef, {
      telegramId: payload.id,
      telegramUsername: payload.username ?? FieldValue.delete()
    });
  });
  return { ok: true };
});

export const unlinkTelegram = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'SIGN_IN_REQUIRED');
  }
  const userRef = db.doc(`users/${request.auth.uid}`);
  const user = await userRef.get();
  const telegramId = user.get('telegramId');
  const batch = db.batch();
  if (telegramId) {
    batch.delete(db.doc(`telegramLinks/${telegramId}`));
  }
  batch.update(userRef, { telegramId: FieldValue.delete(), telegramUsername: FieldValue.delete() });
  await batch.commit();
  return { ok: true };
});

// ---------- Demo requests from the marketing site ----------

// Where the super admin panel lives; used for the link in the Telegram message.
const APP_URL = defineString('APP_URL', { default: 'https://smartstock-d737f.web.app' });

const LEAD_RATE_WINDOW_MS = 60 * 60 * 1000;
const LEAD_RATE_MAX = 5;

/** Telegram IDs of every super admin who linked Telegram in the panel. */
async function superAdminChatIds() {
  const admins = await db.collection('platformAdmins').get();
  const users = await Promise.all(admins.docs.map((a) => db.doc(`users/${a.id}`).get()));
  return users.map((u) => u.get('telegramId')).filter(Boolean).map(String);
}

async function sendTelegram(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.value()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
  if (!res.ok) {
    console.warn('Telegram sendMessage failed', chatId, res.status, await res.text());
  }
  return res.ok;
}

/** Sends to all linked super admins; returns how many messages went through. */
async function notifySuperAdmins(text) {
  const chatIds = await superAdminChatIds();
  const results = await Promise.all(chatIds.map((id) => sendTelegram(id, text).catch(() => false)));
  return results.filter(Boolean).length;
}

/** At most LEAD_RATE_MAX requests per IP per hour (IP stored only as a hash). */
async function allowLeadFrom(ip) {
  const ipHash = createHash('sha256').update(String(ip || 'unknown')).digest('hex').slice(0, 32);
  const ref = db.doc(`leadRateLimits/${ipHash}`);
  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const windowStart = snap.exists ? snap.get('windowStart') : 0;
    const count = snap.exists && now - windowStart < LEAD_RATE_WINDOW_MS ? snap.get('count') : 0;
    if (count >= LEAD_RATE_MAX) return false;
    tx.set(ref, { windowStart: count === 0 ? now : windowStart, count: count + 1 });
    return true;
  });
  return { allowed, ipHash };
}

/** Public endpoint used by website/main.js. Stores the request in `leads` and pings
 *  the super admins on Telegram. A failed Telegram send never loses the lead. */
export const submitLead = onRequest({ cors: true, secrets: [TELEGRAM_BOT_TOKEN] }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  const { lead, error } = parseLead(req.body);
  if (error === 'SPAM') {
    // Look successful so bots don't adapt.
    res.json({ ok: true });
    return;
  }
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const { allowed, ipHash } = await allowLeadFrom(req.ip);
  if (!allowed) {
    res.status(429).json({ error: 'TOO_MANY_REQUESTS' });
    return;
  }

  const ref = db.collection('leads').doc();
  await ref.set({
    ...lead,
    status: 'new',
    source: 'website',
    ipHash,
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
    createdAt: FieldValue.serverTimestamp()
  });

  try {
    const sent = await notifySuperAdmins(formatLeadMessage(lead, `${APP_URL.value()}/platform/leads`));
    await ref.update({ notified: sent });
  } catch (err) {
    console.error('Lead notification failed', err);
  }
  res.json({ ok: true });
});

/** "Send a test message" button on the leads page. */
export const testLeadNotification = onCall({ secrets: [TELEGRAM_BOT_TOKEN] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'SIGN_IN_REQUIRED');
  }
  const admin = await db.doc(`platformAdmins/${request.auth.uid}`).get();
  if (!admin.exists) {
    throw new HttpsError('permission-denied', 'SUPER_ADMIN_ONLY');
  }
  const sent = await notifySuperAdmins(formatLeadMessage({
    name: 'Test', phone: '+998901234567', storeName: 'Namuna do\'kon', city: 'Toshkent',
    storeType: '', registers: '1', message: 'Bu sinov xabari', plan: '', lang: 'uz'
  }, `${APP_URL.value()}/platform/leads`));
  return { sent };
});
