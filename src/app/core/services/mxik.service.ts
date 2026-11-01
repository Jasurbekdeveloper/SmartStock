import { Injectable } from '@angular/core';
import { toCyrillic } from '../utils/uzbek-transliteration';
import { isValidMxikCode } from '../utils/product-identifiers';

/** Public classifier API behind tasnif.soliq.uz (no key, CORS open). Undocumented, so
 *  every call is defensive: a failure returns an empty list, never breaks the form. */
const TASNIF_API = 'https://tasnif.soliq.uz/api/cls-api';

export interface MxikResult {
  mxikCode: string;
  name: string;
  /** Group › class › position, to tell similar names apart. */
  path: string;
  /** Matched by the product's barcode (GTIN) — almost certainly the right code. */
  byBarcode?: boolean;
}

export interface MxikPackage {
  code: string;
  name: string;
  isUnit: boolean;
}

export interface MxikSelection {
  mxikCode: string;
  mxikName: string;
  packageCode: string | null;
  packageName: string | null;
}

interface RawItem {
  mxikCode?: string;
  name?: string;
  mxikName?: string;
  groupName?: string;
  className?: string;
  positionName?: string;
}

function toResult(item: RawItem, byBarcode = false): MxikResult | null {
  const code = String(item.mxikCode ?? '');
  if (!isValidMxikCode(code)) return null;
  const path = [item.groupName, item.className, item.positionName]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .map((p) => p.trim())
    .join(' › ');
  return { mxikCode: code, name: String(item.name ?? item.mxikName ?? '').trim(), path, byBarcode };
}

/** Looks like a scanned retail barcode (EAN-8/13, UPC-A, GTIN-14). */
export function looksLikeGtin(barcode: string | null | undefined): boolean {
  return /^\d{8}$|^\d{12,14}$/.test((barcode ?? '').trim());
}

@Injectable({ providedIn: 'root' })
export class MxikService {
  private cache = new Map<string, Promise<unknown>>();

  private get<T>(path: string, params: Record<string, string | number>): Promise<T | null> {
    const url = `${TASNIF_API}${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
    let hit = this.cache.get(url) as Promise<T | null> | undefined;
    if (!hit) {
      hit = fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
        .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
        .catch(() => null);
      this.cache.set(url, hit);
      // Don't keep failures: the next try should go to the network again.
      hit.then((v) => v === null && this.cache.delete(url));
    }
    return hit;
  }

  private async byParams(params: Record<string, string>, lang: string, size = 20): Promise<RawItem[]> {
    const res = await this.get<{ data?: { content?: RawItem[] } }>('/mxik/search/by-params', { ...params, lang, page: 0, size });
    return res?.data?.content ?? [];
  }

  /**
   * Finds MXIK codes for a product. The barcode is tried first (exact match from the
   * catalog), then the name in Uzbek (catalog is Cyrillic, so Latin input is converted)
   * and in Russian. Results are merged without duplicates, barcode hits first.
   */
  async search(text: string, barcode?: string | null): Promise<MxikResult[]> {
    const query = text.trim();
    const [gtinHits, uzHits, ruHits] = await Promise.all([
      looksLikeGtin(barcode) ? this.byParams({ gtin: barcode!.trim() }, 'uz', 5) : Promise.resolve([]),
      query ? this.byParams({ text: toCyrillic(query) }, 'uz') : Promise.resolve([]),
      query ? this.byParams({ text: query }, 'ru', 10) : Promise.resolve([])
    ]);
    const seen = new Set<string>();
    const out: MxikResult[] = [];
    const add = (items: RawItem[], byBarcode: boolean) => {
      for (const item of items) {
        const r = toResult(item, byBarcode);
        if (r && !seen.has(r.mxikCode)) {
          seen.add(r.mxikCode);
          out.push(r);
        }
      }
    };
    add(gtinHits, true);
    add(uzHits, false);
    add(ruHits, false);
    return out;
  }

  /** Name and package (o'lchov/qadoq) codes of one MXIK code; unit packages first. */
  async card(mxikCode: string): Promise<{ name: string; packages: MxikPackage[] } | null> {
    if (!isValidMxikCode(mxikCode)) return null;
    const card = await this.get<{ mxikName?: string; packages?: { code?: number | string; name?: string; isUnitPackage?: string }[] }>(
      '/mxik/get/by-mxik',
      { mxikCode, lang: 'uz' }
    );
    if (!card) return null;
    const packages = (card.packages ?? [])
      .filter((p) => p.code !== undefined && p.code !== null)
      .map((p) => ({ code: String(p.code), name: String(p.name ?? '').trim(), isUnit: p.isUnitPackage === '1' }))
      .sort((a, b) => Number(b.isUnit) - Number(a.isUnit));
    return { name: String(card.mxikName ?? '').trim(), packages };
  }
}
