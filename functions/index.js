import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { verifyTelegramAuth } from './telegram-auth.js';

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
