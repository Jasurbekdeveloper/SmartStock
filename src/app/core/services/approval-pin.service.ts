import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery } from '../firebase/firestore.utils';
import { AuthService } from './auth.service';
import { requireTenantId, tenantQuery, withTenant } from './tenant-data';
import { PIN_ITERATIONS, hashPin, newSalt } from '../utils/pin-hash';

/** `approvalPins/{uid}`: a manager's PIN (hash only) for approving things at the till. */
export interface ApprovalPin {
  id: string;
  uid: string;
  name: string;
  salt: string;
  hash: string;
  iterations: number;
}

export interface Approver {
  uid: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class ApprovalPinService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);

  /** Sets (or replaces) the current user's PIN. */
  async setPin(pin: string): Promise<void> {
    const user = this.authService.getCurrentUser();
    if (!user) throw new Error('Not signed in');
    const salt = newSalt();
    const hash = await hashPin(pin, salt);
    await setDoc(
      doc(this.firestore, 'approvalPins', user.uid),
      withTenant({ uid: user.uid, name: user.displayName ?? '', salt, hash, iterations: PIN_ITERATIONS, updatedAt: serverTimestamp() }, requireTenantId(this.authService))
    );
  }

  async removePin(): Promise<void> {
    const user = this.authService.getCurrentUser();
    if (user) await deleteDoc(doc(this.firestore, 'approvalPins', user.uid));
  }

  /** The manager whose PIN this is, or null. */
  async verify(pin: string): Promise<Approver | null> {
    const pins = await firstValueFrom(
      fromCollectionQuery<ApprovalPin>(tenantQuery(this.firestore, 'approvalPins', requireTenantId(this.authService)))
    );
    for (const p of pins) {
      if ((await hashPin(pin, p.salt, p.iterations || PIN_ITERATIONS)) === p.hash) return { uid: p.uid, name: p.name };
    }
    return null;
  }
}
