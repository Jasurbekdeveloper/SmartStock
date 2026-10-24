import { describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase/app';
import { doc, increment, initializeFirestore, serverTimestamp, writeBatch } from 'firebase/firestore';
import { stripUndefined } from './sales.service';

describe('stripUndefined', () => {
  it('removes undefined at any depth and keeps Firestore sentinels', () => {
    const ts = serverTimestamp();
    const result = stripUndefined({ a: undefined, items: [{ categoryId: undefined, q: 1 }], at: ts, n: null });
    expect(result).toEqual({ items: [{ q: 1 }], at: ts, n: null });
    expect(result.at).toBe(ts);
  });

  it('turns a sale Firestore would reject into one it accepts (no network needed)', () => {
    const db = initializeFirestore(initializeApp({ projectId: 'demo-pos-test', apiKey: 'test' }, 'sales-spec'), {});
    const sale = {
      items: [{ productId: 'p1', categoryId: undefined, quantity: 1 }],
      createdAt: serverTimestamp(),
      stock: increment(-1)
    };
    // This synchronous throw is what used to freeze the POS on "submitting".
    expect(() => writeBatch(db).set(doc(db, 'sales', 's1'), sale)).toThrow(/undefined/);
    expect(() => writeBatch(db).set(doc(db, 'sales', 's1'), stripUndefined(sale))).not.toThrow();
  });
});
