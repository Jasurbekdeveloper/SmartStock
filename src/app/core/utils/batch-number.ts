import { StockBatch } from './batches';

const DAY_MS = 86_400_000;

/** Product name as a short batch tag: "Qurt" → "QURT", "Mix 100 mm" → "MIX-100-MM". */
export function batchNameTag(name: string, maxLength = 16): string {
  const tag = name
    .toLocaleUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return tag.slice(0, maxLength).replace(/-+$/, '') || 'P';
}

/** Arrival day as ddmmyy: 15 Nov 2026 → "151126". */
export function batchDateTag(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}${pad(date.getMonth() + 1)}${String(date.getFullYear()).slice(-2)}`;
}

/**
 * Batch number for a delivery: arrival day + product name, e.g. "151126-QURT".
 * A second delivery of the same product on the same day gets "-2", then "-3"…
 */
export function nextBatchNo(name: string, date: Date, existing: Iterable<string | null | undefined>): string {
  const base = `${batchDateTag(date)}-${batchNameTag(name)}`;
  const taken = new Set([...existing].map((b) => (b ?? '').trim().toLocaleUpperCase()).filter(Boolean));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Whole days from one date to another (calendar days, DST-safe). */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

/** Shelf life the latest delivery had (manufacture → expiry), for pre-filling the next one. */
export function shelfLifeFromBatches(batches: Pick<StockBatch, 'manufactureDate' | 'expiryDate' | 'createdAt'>[]): number | null {
  const dated = batches
    .filter((b) => b.manufactureDate && b.expiryDate)
    .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
  for (const b of dated) {
    const days = daysBetween(new Date(b.manufactureDate!), new Date(b.expiryDate));
    if (days > 0) return days;
  }
  return null;
}
