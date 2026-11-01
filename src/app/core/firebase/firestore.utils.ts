import { Observable, ReplaySubject, share, timer } from 'rxjs';
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

const sharedStreams = new Map<string, Observable<unknown>>();

/**
 * One live Firestore listener per key (e.g. "products:<tenantId>") shared by every page
 * that needs it. The latest result is replayed instantly to a new subscriber, so moving
 * between pages shows data at once instead of waiting for a fresh query, and the
 * listener stays open for a minute after the last page leaves (quick back-and-forth
 * costs no extra reads).
 */
export function sharedStream<T>(key: string, factory: () => Observable<T>): Observable<T> {
  let stream = sharedStreams.get(key) as Observable<T> | undefined;
  if (!stream) {
    stream = factory().pipe(
      share({
        connector: () => new ReplaySubject<T>(1),
        resetOnError: true,
        resetOnComplete: true,
        resetOnRefCountZero: () => timer(60_000)
      })
    );
    sharedStreams.set(key, stream);
  }
  return stream;
}
