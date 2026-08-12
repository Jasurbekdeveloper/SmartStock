import { Observable } from 'rxjs';
import { DocumentReference, Query, Timestamp, onSnapshot } from 'firebase/firestore';

function convertTimestamps(data: unknown): unknown {
  if (data instanceof Timestamp) {
    return data.toDate();
  }
  if (Array.isArray(data)) {
    return data.map(convertTimestamps);
  }
  if (data && typeof data === 'object') {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, convertTimestamps(value)]));
  }
  return data;
}

export function fromDocRef<T>(ref: DocumentReference): Observable<T | undefined> {
  return new Observable<T | undefined>((subscriber) => {
    const unsubscribe = onSnapshot(
      ref,
      (snap) => subscriber.next(snap.exists() ? (convertTimestamps({ id: snap.id, ...snap.data() }) as T) : undefined),
      (err) => subscriber.error(err)
    );
    return unsubscribe;
  });
}

export function fromCollectionQuery<T>(query: Query): Observable<T[]> {
  return new Observable<T[]>((subscriber) => {
    const unsubscribe = onSnapshot(
      query,
      (snap) => subscriber.next(snap.docs.map((d) => convertTimestamps({ id: d.id, ...d.data() }) as T)),
      (err) => subscriber.error(err)
    );
    return unsubscribe;
  });
}
