import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createHash } from 'node:crypto';
import { verifyTelegramAuth } from './telegram-auth.js';
import {
  GROUP_PREFIX,
  LINK_CODE_TTL_MS,
  LINK_PREFIX,
  LOGIN_CODE_TTL_MS,
  LOGIN_PREFIX,
  newLinkCode,
  parseLoginCallback,
  parseStartPayload,
  webhookSecret
} from './telegram-bot.js';
import { REPORT_DEFAULTS, escapeHtml, formatLowStock, formatReport, lowStockItems, reportRange, summarize } from './reports.js';
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

/**
 * Points a Telegram account at a user, in one transaction: one Telegram account per
 * user and one user per Telegram account. A previous Telegram of this user is released.
 */
async function linkTelegramToUser(uid, telegramId, telegramUsername) {
  const linkRef = db.doc(`telegramLinks/${telegramId}`);
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
    if (previousId && String(previousId) !== String(telegramId)) {
      // Only release the old link if it really points at this user.
      const previous = await tx.get(db.doc(`telegramLinks/${previousId}`));
      if (previous.exists && previous.get('uid') === uid) tx.delete(previous.ref);
    }
    tx.set(linkRef, { uid, linkedAt: FieldValue.serverTimestamp() });
    tx.update(userRef, {
      telegramId,
      telegramUsername: telegramUsername ?? FieldValue.delete()
    });
  });
}

/** Links the caller's account to the Telegram account the Login Widget returned. */
export const linkTelegram = onCall({ secrets: [TELEGRAM_BOT_TOKEN] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'SIGN_IN_REQUIRED');
  }
  const payload = requireValidTelegram(request.data);
  await linkTelegramToUser(request.auth.uid, payload.id, payload.username);
  return { ok: true };
});

// ---------- Linking through the bot (lets the user pick any Telegram account) ----------
//
// The Login Widget always answers with the Telegram account this browser last used,
// so after "Unlink" it silently re-links the same account. Linking through the bot
// instead: the app opens t.me/<bot>?start=link_<code>, the user presses Start in
// whichever Telegram account they want, and the bot's webhook links that account.

function webhookUrl() {
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  return `https://europe-west1-${project}.cloudfunctions.net/telegramWebhook`;
}

async function telegramApi(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.value()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    console.warn(`Telegram ${method} failed`, res.status, json.description);
  }
  return json;
}

/** Bumped whenever the webhook settings below change, so they are sent again. */
const WEBHOOK_VERSION = 2;

/** Registers the webhook once (and again if the URL or settings change). */
async function ensureWebhook() {
  const ref = db.doc('platformConfig/telegramWebhook');
  const url = webhookUrl();
  const snap = await ref.get();
  if (snap.exists && snap.get('url') === url && snap.get('version') === WEBHOOK_VERSION) return;
  const result = await telegramApi('setWebhook', {
    url,
    secret_token: webhookSecret(TELEGRAM_BOT_TOKEN.value()),
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true
  });
  if (result.ok) {
    await ref.set({ url, version: WEBHOOK_VERSION, setAt: FieldValue.serverTimestamp() });
  }
}

/** Gives the signed-in user a one-time code for t.me/<bot>?start=link_<code>. */
export const createTelegramLinkCode = onCall({ secrets: [TELEGRAM_BOT_TOKEN] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'SIGN_IN_REQUIRED');
  }
  await ensureWebhook();
  const code = newLinkCode();
  await db.doc(`telegramLinkCodes/${code}`).set({
    uid: request.auth.uid,
    expiresAt: Date.now() + LINK_CODE_TTL_MS
  });
  return { code, start: `${LINK_PREFIX}${code}` };
});

const BOT_TEXT = {
  linked: '✅ Telegram MarketHisob hisobingizga ulandi. Endi kirish sahifasida Telegram tugmasi bilan kira olasiz.',
  expired: '⌛ Havola eskirgan yoki ishlatilgan. MarketHisob\'da "Telegram\'ni ulash" oynasidan yangisini oling.',
  taken: '⚠️ Bu Telegram akkaunt boshqa xodimga ulangan. Avval u yerdan uzing.',
  hello: 'Salom! Bu MarketHisob\'ga kirish boti. Telegram\'ni ulash uchun dasturda profil menyusidan "Telegram\'ni ulash" ni bosing.',
  loginExpired: '⌛ Kirish so\'rovi eskirgan. Saytda "Telegram bot orqali kirish" ni qayta bosing.',
  notLinked: '⚠️ Bu Telegram akkaunt hech bir MarketHisob kabinetiga ulanmagan. Avval parol bilan kirib, profil menyusidan "Telegram\'ni ulash" ni bosing.',
  inactive: '⛔ Bu kabinet faol emas. Do\'kon administratoriga murojaat qiling.',
  loginAsk: (name) =>
    `🔐 <b>MarketHisob'ga kirish</b>\n\n${name} kabinetiga kirish so'raldi.\n\nAgar hozir saytda kirishni o'zingiz boshlagan bo'lsangiz — tasdiqlang. Boshlamagan bo'lsangiz, <b>tasdiqlamang</b>.`,
  loginOk: '✅ Kirish tasdiqlandi. Saytga qayting.',
  loginNo: '❌ Kirish rad etildi.',
  groupLinked: (store) => `✅ Bu guruh endi <b>${store}</b> hisobotlarini oladi: kunlik, haftalik, oylik va kam qolgan mahsulotlar.`,
  groupExpired: '⌛ Guruhni ulash havolasi eskirgan. MarketHisob → Sozlamalar → Integratsiyalar\'dan yangisini oling.'
};

/** Claims a one-time link/group code (deleting it); returns its data or null. */
async function claimCode(code, type) {
  const codeRef = db.doc(`telegramLinkCodes/${code}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(codeRef);
    if (!snap.exists || snap.get('expiresAt') < Date.now() || (snap.get('type') ?? 'link') !== type) return null;
    tx.delete(codeRef);
    return snap.data();
  });
}

async function handleLinkStart(chatId, from, code) {
  const data = await claimCode(code, 'link');
  let text = BOT_TEXT.expired;
  if (data?.uid) {
    try {
      await linkTelegramToUser(data.uid, from.id, from.username);
      text = BOT_TEXT.linked;
    } catch (err) {
      text = err?.message === 'TELEGRAM_TAKEN' ? BOT_TEXT.taken : BOT_TEXT.expired;
    }
  }
  await telegramApi('sendMessage', { chat_id: chatId, text });
}

/** "/start login_<code>": asks the linked account to confirm the sign-in. */
async function handleLoginStart(chatId, from, code) {
  const ref = db.doc(`telegramLoginCodes/${code}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get('status') !== 'pending' || snap.get('expiresAt') < Date.now()) {
    await telegramApi('sendMessage', { chat_id: chatId, text: BOT_TEXT.loginExpired });
    return;
  }
  const link = await db.doc(`telegramLinks/${from.id}`).get();
  if (!link.exists) {
    await telegramApi('sendMessage', { chat_id: chatId, text: BOT_TEXT.notLinked });
    return;
  }
  const profile = await db.doc(`users/${link.get('uid')}`).get();
  if (!profile.exists || profile.get('active') !== true) {
    await telegramApi('sendMessage', { chat_id: chatId, text: BOT_TEXT.inactive });
    return;
  }
  await ref.update({ telegramId: from.id });
  const name = escapeHtml(profile.get('displayName') || profile.get('email') || '');
  await telegramApi('sendMessage', {
    chat_id: chatId,
    text: BOT_TEXT.loginAsk(name),
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Kirishni tasdiqlash', callback_data: `lok:${code}` },
        { text: '❌ Bu men emasman', callback_data: `lno:${code}` }
      ]]
    }
  });
}

/** Pressing a button under the login request. */
async function handleLoginCallback(query) {
  const parsed = parseLoginCallback(query.data);
  if (!parsed) return;
  const ref = db.doc(`telegramLoginCodes/${parsed.code}`);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('status') !== 'pending' || snap.get('expiresAt') < Date.now()) return 'expired';
    if (String(snap.get('telegramId')) !== String(query.from.id)) return 'expired';
    if (!parsed.confirm) {
      tx.update(ref, { status: 'rejected' });
      return 'rejected';
    }
    const link = await tx.get(db.doc(`telegramLinks/${query.from.id}`));
    if (!link.exists) return 'expired';
    tx.update(ref, { status: 'confirmed', uid: link.get('uid'), confirmedAt: Date.now() });
    return 'confirmed';
  });
  const text = result === 'confirmed' ? BOT_TEXT.loginOk : result === 'rejected' ? BOT_TEXT.loginNo : BOT_TEXT.loginExpired;
  await telegramApi('answerCallbackQuery', { callback_query_id: query.id, text });
  if (query.message) {
    await telegramApi('editMessageText', { chat_id: query.message.chat.id, message_id: query.message.message_id, text });
  }
}

/** "/start@bot grp_<code>" inside a group: that group gets the store's reports. */
async function handleGroupStart(chat, code) {
  const data = await claimCode(code, 'group');
  if (!data?.tenantId) {
    await telegramApi('sendMessage', { chat_id: chat.id, text: BOT_TEXT.groupExpired });
    return;
  }
  await db.doc(`settings/${data.tenantId}`).set(
    { telegramReports: { groupChatId: chat.id, groupTitle: chat.title ?? null } },
    { merge: true }
  );
  const store = (await db.doc(`settings/${data.tenantId}`).get()).get('storeName') || 'MarketHisob';
  await telegramApi('sendMessage', { chat_id: chat.id, text: BOT_TEXT.groupLinked(escapeHtml(store)), parse_mode: 'HTML' });
}

/** Telegram → this endpoint: account linking, sign-in confirmation, group linking. */
export const telegramWebhook = onRequest({ secrets: [TELEGRAM_BOT_TOKEN] }, async (req, res) => {
  if (req.get('x-telegram-bot-api-secret-token') !== webhookSecret(TELEGRAM_BOT_TOKEN.value())) {
    res.status(403).send('forbidden');
    return;
  }
  // Always 200 quickly so Telegram doesn't retry; errors are only logged.
  try {
    const query = req.body?.callback_query;
    if (query?.from && !query.from.is_bot) {
      await handleLoginCallback(query);
    }
    const message = req.body?.message;
    const from = message?.from;
    const chat = message?.chat;
    if (from && !from.is_bot && chat && typeof message.text === 'string') {
      const start = parseStartPayload(message.text);
      if (chat.type === 'private') {
        if (start?.kind === 'link') await handleLinkStart(chat.id, from, start.code);
        else if (start?.kind === 'login') await handleLoginStart(chat.id, from, start.code);
        else if (message.text.startsWith('/start')) await telegramApi('sendMessage', { chat_id: chat.id, text: BOT_TEXT.hello });
      } else if ((chat.type === 'group' || chat.type === 'supergroup') && start?.kind === 'group') {
        await handleGroupStart(chat, start.code);
      }
    }
  } catch (err) {
    console.error('telegramWebhook failed', err);
  }
  res.json({ ok: true });
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
    const link = await db.doc(`telegramLinks/${telegramId}`).get();
    if (link.exists && link.get('uid') === request.auth.uid) batch.delete(link.ref);
  }
  batch.update(userRef, { telegramId: FieldValue.delete(), telegramUsername: FieldValue.delete() });
  await batch.commit();
  return { ok: true };
});

// ---------- Signing in through the bot (login page) ----------
//
// The Login Widget shows whichever Telegram account this browser used last and can't
// be switched from the site. Instead the login page opens t.me/<bot>?start=login_<code>;
// the bot asks the linked account to confirm, and the page polls for the result.

/** At most `max` calls per `windowMs` for one key (stored hashed). */
async function rateLimit(kind, key, max, windowMs) {
  const hash = createHash('sha256').update(`${kind}:${key || 'unknown'}`).digest('hex').slice(0, 32);
  const ref = db.doc(`rateLimits/${hash}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const windowStart = snap.exists ? snap.get('windowStart') : 0;
    const count = snap.exists && now - windowStart < windowMs ? snap.get('count') : 0;
    if (count >= max) return false;
    tx.set(ref, { windowStart: count === 0 ? now : windowStart, count: count + 1 });
    return true;
  });
}

export const createTelegramLoginCode = onCall({ secrets: [TELEGRAM_BOT_TOKEN] }, async (request) => {
  const ip = request.rawRequest?.ip;
  if (!(await rateLimit('login', ip, 30, 60 * 60 * 1000))) {
    throw new HttpsError('resource-exhausted', 'TOO_MANY_REQUESTS');
  }
  await ensureWebhook();
  const code = newLinkCode();
  await db.doc(`telegramLoginCodes/${code}`).set({ status: 'pending', expiresAt: Date.now() + LOGIN_CODE_TTL_MS });
  return { code, start: `${LOGIN_PREFIX}${code}` };
});

/** The login page asks every few seconds; once confirmed it gets a one-time token. */
export const checkTelegramLogin = onCall(async (request) => {
  const code = String(request.data?.code ?? '');
  if (!/^[A-Za-z0-9_-]{16,60}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'BAD_CODE');
  }
  const ref = db.doc(`telegramLoginCodes/${code}`);
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { status: 'expired' };
    const status = snap.get('status');
    if (status === 'rejected') return { status };
    if (status === 'pending') return { status: snap.get('expiresAt') < Date.now() ? 'expired' : 'pending' };
    if (status !== 'confirmed') return { status: 'expired' };
    // Confirmed: hand the token out once, within a minute of the confirmation.
    tx.update(ref, { status: 'used' });
    if (Date.now() - snap.get('confirmedAt') > 60 * 1000) return { status: 'expired' };
    return { status: 'confirmed', uid: snap.get('uid') };
  });
  if (outcome.status !== 'confirmed') return { status: outcome.status };
  const profile = await db.doc(`users/${outcome.uid}`).get();
  if (!profile.exists || profile.get('active') !== true) {
    throw new HttpsError('permission-denied', 'INACTIVE');
  }
  return { status: 'confirmed', token: await getAuth().createCustomToken(outcome.uid) };
});

// ---------- Reports in Telegram ----------

/** The caller's profile when they are an active admin of a store. */
async function requireStoreAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'SIGN_IN_REQUIRED');
  }
  const profile = await db.doc(`users/${request.auth.uid}`).get();
  if (!profile.exists || profile.get('active') !== true || profile.get('role') !== 'admin' || !profile.get('tenantId')) {
    throw new HttpsError('permission-denied', 'ADMIN_ONLY');
  }
  return profile;
}

/** One-time code for t.me/<bot>?startgroup=grp_<code>: the group it is used in gets the reports. */
export const createTelegramGroupCode = onCall({ secrets: [TELEGRAM_BOT_TOKEN] }, async (request) => {
  const profile = await requireStoreAdmin(request);
  await ensureWebhook();
  const code = newLinkCode();
  await db.doc(`telegramLinkCodes/${code}`).set({
    type: 'group',
    uid: request.auth.uid,
    tenantId: profile.get('tenantId'),
    expiresAt: Date.now() + LINK_CODE_TTL_MS
  });
  return { code, start: `${GROUP_PREFIX}${code}` };
});

/** Sends one message; follows a group → supergroup move; reports a kicked bot. */
async function sendReportMessage(chatId, text) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  let res = await telegramApi('sendMessage', body);
  const movedTo = res?.parameters?.migrate_to_chat_id;
  if (!res.ok && movedTo) {
    res = await telegramApi('sendMessage', { ...body, chat_id: movedTo });
    return { ok: !!res.ok, movedTo };
  }
  return { ok: !!res.ok, gone: res?.error_code === 403 || res?.error_code === 400 };
}

/** Where a store's reports go: its admins who linked Telegram, and the linked group. */
async function reportRecipients(tenantId, config) {
  const chats = [];
  if (config.toAdmins) {
    const admins = await db.collection('users').where('tenantId', '==', tenantId).where('role', '==', 'admin').get();
    for (const u of admins.docs) {
      if (u.get('active') === true && u.get('telegramId')) chats.push({ id: u.get('telegramId'), group: false });
    }
  }
  if (config.groupChatId) chats.push({ id: config.groupChatId, group: true });
  return chats;
}

async function deliver(tenantId, config, text) {
  const chats = await reportRecipients(tenantId, config);
  let sent = 0;
  for (const chat of chats) {
    const r = await sendReportMessage(chat.id, text).catch(() => ({ ok: false }));
    if (r.ok) sent += 1;
    if (chat.group && r.movedTo) {
      await db.doc(`settings/${tenantId}`).set({ telegramReports: { groupChatId: r.movedTo } }, { merge: true });
    } else if (chat.group && !r.ok && r.gone) {
      // The bot was removed from the group: stop sending there.
      await db.doc(`settings/${tenantId}`).set({ telegramReports: { groupChatId: null, groupTitle: null } }, { merge: true });
    }
  }
  return { sent, recipients: chats.length };
}

const docs = (snap) => snap.docs.map((d) => d.data());

async function periodDocs(collectionName, tenantId, from, to) {
  return docs(
    // Newest first, so the existing (tenantId, createdAt DESC) index serves the query.
    await db
      .collection(collectionName)
      .where('tenantId', '==', tenantId)
      .where('createdAt', '>=', from)
      .where('createdAt', '<', to)
      .orderBy('createdAt', 'desc')
      .get()
  );
}

async function buildReportText(tenantId, settings, kind, now) {
  const storeName = settings.storeName || 'MarketHisob';
  if (kind === 'lowStock') {
    const products = docs(await db.collection('products').where('tenantId', '==', tenantId).select('name', 'quantity', 'minQuantity', 'unit').get());
    const items = lowStockItems(products);
    return items.length ? formatLowStock({ storeName, items }) : null;
  }
  const range = reportRange(kind, now);
  const [sales, returns, prevSales] = await Promise.all([
    periodDocs('sales', tenantId, range.from, range.to),
    periodDocs('returns', tenantId, range.from, range.to),
    periodDocs('sales', tenantId, range.prevFrom, range.prevTo)
  ]);
  return formatReport({
    kind,
    storeName,
    currency: settings.currencySymbol || "so'm",
    label: range.label,
    current: summarize(sales, returns),
    previous: summarize(prevSales)
  });
}

/** Sends the given reports to every active store that has them switched on. */
async function runReports(kinds, now = new Date()) {
  const tenants = await db.collection('tenants').get();
  for (const tenant of tenants.docs) {
    const status = tenant.get('status');
    if (status === 'suspended' || status === 'cancelled') continue;
    try {
      const settingsSnap = await db.doc(`settings/${tenant.id}`).get();
      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      const config = { ...REPORT_DEFAULTS, ...(settings.telegramReports ?? {}) };
      for (const kind of kinds) {
        if (!config[kind]) continue;
        const text = await buildReportText(tenant.id, settings, kind, now);
        if (text) await deliver(tenant.id, config, text);
      }
    } catch (err) {
      console.error('Telegram report failed for', tenant.id, err);
    }
  }
}

/** Every evening: today's statistics. */
export const telegramReportsEvening = onSchedule(
  { schedule: '0 21 * * *', timeZone: 'Asia/Tashkent', secrets: [TELEGRAM_BOT_TOKEN], timeoutSeconds: 540 },
  async () => runReports(['daily'])
);

/** Every morning: low stock; on Mondays last week; on the 1st last month. */
export const telegramReportsMorning = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'Asia/Tashkent', secrets: [TELEGRAM_BOT_TOKEN], timeoutSeconds: 540 },
  async () => {
    const now = new Date();
    const local = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    const kinds = ['lowStock'];
    if (local.getUTCDay() === 1) kinds.push('weekly');
    if (local.getUTCDate() === 1) kinds.push('monthly');
    await runReports(kinds, now);
  }
);

/** "Send now" button in Settings: one report to this store's recipients. */
export const sendTelegramReportNow = onCall({ secrets: [TELEGRAM_BOT_TOKEN] }, async (request) => {
  const profile = await requireStoreAdmin(request);
  const kind = String(request.data?.kind ?? 'daily');
  if (!['daily', 'weekly', 'monthly', 'lowStock'].includes(kind)) {
    throw new HttpsError('invalid-argument', 'BAD_KIND');
  }
  const tenantId = profile.get('tenantId');
  if (!(await rateLimit('report', tenantId, 20, 60 * 60 * 1000))) {
    throw new HttpsError('resource-exhausted', 'TOO_MANY_REQUESTS');
  }
  const settingsSnap = await db.doc(`settings/${tenantId}`).get();
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  const config = { ...REPORT_DEFAULTS, ...(settings.telegramReports ?? {}) };
  const text = (await buildReportText(tenantId, settings, kind, new Date())) ?? '✅ Kam qolgan mahsulot yo‘q.';
  return deliver(tenantId, config, text);
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
