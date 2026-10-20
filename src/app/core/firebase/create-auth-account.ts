import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { environment } from '../../../environments/environment';

/**
 * Creates an Auth account on a throwaway secondary Firebase App so the signed-in
 * admin's own session (on the default app) is never replaced. Returns the new uid.
 */
export async function createAuthAccount(email: string, password: string): Promise<string> {
  const secondaryApp = initializeApp(environment.firebase, `secondary-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await signOut(secondaryAuth);
    return credential.user.uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

/** Maps Firebase Auth errors from account creation to translation keys. */
export function authCreateErrorKey(err: unknown): string {
  const code = (err as { code?: string })?.code ?? (err as Error)?.message;
  switch (code) {
    case 'auth/email-already-in-use':
      return 'users.emailInUse';
    case 'auth/invalid-email':
      return 'users.invalidEmail';
    case 'auth/weak-password':
      return 'users.weakPassword';
    case 'USER_LIMIT_REACHED':
      return 'subscription.userLimitReached';
    case 'TENANT_READ_ONLY':
      return 'subscription.readOnlyAction';
    default:
      return 'messages.error';
  }
}
