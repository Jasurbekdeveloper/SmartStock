import { ean13CheckDigit } from './product-identifiers';

/** Label stock: thermal label printers use small rolls; 'a4' prints a sheet of stickers. */
export type LabelSize = '58x40' | '40x30' | '30x20' | 'a4';

export interface LabelSettings {
  size: LabelSize;
  showPrice: boolean;
  showName: boolean;
  showStore: boolean;
}

export const DEFAULT_LABEL_SETTINGS: LabelSettings = { size: '58x40', showPrice: true, showName: true, showStore: false };

/** Physical size of one label in mm (for 'a4': one cell of a 3×8 sticker sheet). */
export const LABEL_MM: Record<LabelSize, { w: number; h: number }> = {
  '58x40': { w: 58, h: 40 },
  '40x30': { w: 40, h: 30 },
  '30x20': { w: 30, h: 20 },
  a4: { w: 70, h: 37 }
};

export function withLabelDefaults(s: Partial<LabelSettings> | null | undefined): LabelSettings {
  return { ...DEFAULT_LABEL_SETTINGS, ...(s ?? {}) };
}

export interface LabelItem {
  name: string;
  barcode: string;
  price?: number | null;
  unit?: string | null;
  /** How many identical labels to print. */
  copies: number;
}

/** EAN-13 / EAN-8 when the digits and check digit are valid (scanners read them best), else Code 128. */
export function barcodeFormatFor(value: string): 'EAN13' | 'EAN8' | 'CODE128' {
  if (/^\d{13}$/.test(value) && ean13CheckDigit(value.slice(0, 12)) === Number(value[12])) return 'EAN13';
  if (/^\d{8}$/.test(value)) {
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += Number(value[i]) * (i % 2 === 0 ? 3 : 1);
    if ((10 - (sum % 10)) % 10 === Number(value[7])) return 'EAN8';
  }
  return 'CODE128';
}

/** Copies are whole numbers from 0 to 500 (a guard against a typo like 10000). */
export function clampCopies(n: unknown): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(500, Math.max(0, v)) : 0;
}

export function totalLabels(items: LabelItem[]): number {
  return items.reduce((s, i) => s + clampCopies(i.copies), 0);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * The printable document: one label per page on a label printer, or a 3-column sheet
 * on A4. `barcodeSvg` renders a barcode to SVG markup (JsBarcode in the browser).
 */
export function buildLabelsHtml(
  items: LabelItem[],
  settings: LabelSettings,
  opts: { storeName?: string; formatPrice: (n: number) => string; barcodeSvg: (value: string) => string }
): string {
  const { w, h } = LABEL_MM[settings.size];
  const small = settings.size === '30x20';
  const labels: string[] = [];
  for (const item of items) {
    const copies = clampCopies(item.copies);
    if (copies === 0 || !item.barcode) continue;
    const svg = opts.barcodeSvg(item.barcode);
    const name = settings.showName ? `<div class="n">${escapeHtml(item.name)}</div>` : '';
    const store = settings.showStore && opts.storeName ? `<div class="s">${escapeHtml(opts.storeName)}</div>` : '';
    const price =
      settings.showPrice && item.price != null && item.price > 0
        ? `<div class="p">${escapeHtml(opts.formatPrice(item.price))}${item.unit ? `<small> / ${escapeHtml(item.unit)}</small>` : ''}</div>`
        : '';
    const one = `<div class="l">${store}${name}<div class="b">${svg}</div>${price}</div>`;
    for (let i = 0; i < copies; i++) labels.push(one);
  }
  const sheet = settings.size === 'a4';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
@page { size: ${sheet ? 'A4' : `${w}mm ${h}mm`}; margin: ${sheet ? '10mm 0 0 0' : '0'}; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; color: #000; }
${sheet ? '.wrap { display: grid; grid-template-columns: repeat(3, 70mm); grid-auto-rows: 37mm; }' : ''}
.l { width: ${w}mm; height: ${h}mm; padding: ${small ? '0.8mm 1mm' : '1.5mm 2mm'}; display: flex; flex-direction: column;
     align-items: center; justify-content: center; overflow: hidden; text-align: center; ${sheet ? '' : 'page-break-after: always; break-after: page;'} }
.s { font-size: ${small ? 5 : 7}pt; color: #333; }
.n { font-size: ${small ? 6 : 8.5}pt; font-weight: 700; line-height: 1.1; max-height: 2.3em; overflow: hidden; }
.b { flex: 1 1 auto; min-height: 0; width: 100%; display: flex; align-items: center; justify-content: center; }
.b svg { max-width: 100%; max-height: 100%; height: auto; }
.p { font-size: ${small ? 8 : 12}pt; font-weight: 800; }
.p small { font-size: 0.6em; font-weight: 600; }
</style></head><body><div class="wrap">${labels.join('')}</div></body></html>`;
}
