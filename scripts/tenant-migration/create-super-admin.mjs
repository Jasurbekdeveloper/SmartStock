// Creates (or promotes) the platform super admin. This is the ONLY way to get the
// superadmin role: firestore.rules forbid any browser write to platformAdmins.
//
//   FIREBASE_PROJECT_ID=smartstock-d737f \
//   SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_PASSWORD='...' SUPER_ADMIN_NAME='Ism Familiya' \
//   npm run create-super-admin
//
// Uses Application Default Credentials (`gcloud auth application-default login`)
// or GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const email = process.env.SUPER_ADMIN_EMAIL;
const password = process.env.SUPER_ADMIN_PASSWORD;
const displayName = process.env.SUPER_ADMIN_NAME ?? 'Super admin';

if (!projectId || !email) {
  throw new Error('Set FIREBASE_PROJECT_ID and SUPER_ADMIN_EMAIL (and SUPER_ADMIN_PASSWORD for a new account).');
}

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const db = getFirestore();

let user;
try {
  user = await auth.getUserByEmail(email);
  console.log(`Found existing account ${user.uid}`);
} catch (err) {
  if (err.code !== 'auth/user-not-found') throw err;
  if (!password || password.length < 8) {
    throw new Error('No account with that email yet: set SUPER_ADMIN_PASSWORD (8+ characters) to create it.');
  }
  user = await auth.createUser({ email, password, displayName });
  console.log(`Created account ${user.uid}`);
}

const profileRef = db.doc(`users/${user.uid}`);
const profile = await profileRef.get();
if (profile.exists && profile.get('tenantId')) {
  throw new Error(`${email} already belongs to store ${profile.get('tenantId')}. Use a separate email for the super admin.`);
}

const batch = db.batch();
batch.set(db.doc(`platformAdmins/${user.uid}`), { email, displayName, createdAt: FieldValue.serverTimestamp() });
batch.set(profileRef, {
  email,
  displayName,
  role: 'superadmin',
  active: true,
  tenantId: '',
  createdAt: profile.exists ? profile.get('createdAt') : FieldValue.serverTimestamp()
});
await batch.commit();

console.log(`${email} is now the platform super admin. Sign in at /auth/login → /platform.`);
