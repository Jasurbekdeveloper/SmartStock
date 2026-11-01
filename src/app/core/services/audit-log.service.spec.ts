import { describe, expect, it } from 'vitest';
import { firestoreSafe } from './audit-log.service';

describe('firestoreSafe', () => {
  it('turns nested undefined into null and keeps dates and other objects', () => {
    const when = new Date(2026, 10, 1);
    class Sentinel {}
    const sentinel = new Sentinel();
    expect(
      firestoreSafe({ before: { imageUrl: undefined, list: [1, undefined] }, after: { imageUrl: 'x', at: when }, s: sentinel })
    ).toEqual({ before: { imageUrl: null, list: [1, null] }, after: { imageUrl: 'x', at: when }, s: sentinel });
    expect((firestoreSafe({ s: sentinel }) as { s: unknown }).s).toBe(sentinel);
  });
});
