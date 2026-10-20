import { Firestore, QueryConstraint, collection, query, where } from 'firebase/firestore';
import { AuthService } from './auth.service';

export function requireTenantId(authService: AuthService): string {
  const tenantId = authService.getCurrentUser()?.tenantId;
  if (!tenantId) {
    throw new Error('TENANT_NOT_CONFIGURED');
  }
  return tenantId;
}

export function tenantQuery(
  firestore: Firestore,
  collectionName: string,
  tenantId: string,
  ...constraints: QueryConstraint[]
) {
  return query(collection(firestore, collectionName), where('tenantId', '==', tenantId), ...constraints);
}

export function withTenant<T extends object>(data: T, tenantId: string): T & { tenantId: string } {
  return { ...data, tenantId };
}
