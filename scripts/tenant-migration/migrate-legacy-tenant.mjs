import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const ownerUid = process.env.LEGACY_OWNER_UID;
const tenantId = process.env.LEGACY_TENANT_ID ?? `legacy-${projectId ?? ''}`;

if (!projectId || !ownerUid || !tenantId || tenantId === 'legacy-' ||
  tenantId === 'general' || tenantId === 'integrations' || tenantId.includes('/')) {
  throw new Error('Set FIREBASE_PROJECT_ID and LEGACY_OWNER_UID before running this migration.');
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const ownerRef = db.collection('users').doc(ownerUid);
const ownerSnapshot = await ownerRef.get();

if (!ownerSnapshot.exists || ownerSnapshot.data().role !== 'admin' || ownerSnapshot.data().active !== true) {
  throw new Error('LEGACY_OWNER_UID must identify an active admin in the existing users collection.');
}
if (ownerSnapshot.data().tenantId && ownerSnapshot.data().tenantId !== tenantId) {
  throw new Error('LEGACY_OWNER_UID is already assigned to a different tenant.');
}

const tenantRef = db.collection('tenants').doc(tenantId);
const existingTenant = await tenantRef.get();
if (existingTenant.exists && existingTenant.data().ownerId !== ownerUid) {
  throw new Error(`Tenant ${tenantId} already belongs to a different owner.`);
}

const legacySettings = await db.doc('settings/general').get();
await tenantRef.set({
  name: existingTenant.data()?.name ?? legacySettings.data()?.storeName ?? 'SmartStock',
  ownerId: ownerUid,
  ownerName: ownerSnapshot.data().displayName ?? '',
  ownerEmail: ownerSnapshot.data().email ?? '',
  plan: existingTenant.data()?.plan ?? 'free',
  status: existingTenant.data()?.status ?? 'active',
  ...(existingTenant.exists ? {} : { createdAt: new Date() })
}, { merge: true });

let updated = 0;
for (const collectionName of [
  'users',
  'products',
  'categories',
  'stockEntries',
  'sales',
  'returns',
  'customers',
  'debts',
  'shifts',
  'suppliers',
  'auditLog'
]) {
  const collectionRef = db.collection(collectionName);
  let cursor;
  while (true) {
    let pageQuery = collectionRef.orderBy(FieldPath.documentId()).limit(400);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const page = await pageQuery.get();
    if (page.empty) break;

    const batch = db.batch();
    let writes = 0;
    for (const snapshot of page.docs) {
      if (snapshot.data().tenantId === undefined) {
        batch.update(snapshot.ref, { tenantId });
        writes++;
      }
    }
    if (writes) {
      await batch.commit();
      updated += writes;
    }
    cursor = page.docs[page.docs.length - 1];
    if (page.size < 400) break;
  }
}

const generalSettings = await db.doc('settings/general').get();
if (generalSettings.exists) {
  await db.doc(`settings/${tenantId}`).set(generalSettings.data(), { merge: true });
}
const integrationSettings = await db.doc('settings/integrations').get();
if (integrationSettings.exists) {
  await db.doc(`settingsIntegrations/${tenantId}`).set(integrationSettings.data(), { merge: true });
}

console.log(`Tenant ${tenantId} is ready. Added tenantId to ${updated} legacy documents.`);
console.log('Deploy tenant-aware rules only after reviewing this result.');
