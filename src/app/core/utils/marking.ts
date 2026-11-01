/**
 * Digital marking codes (Asl belgisi, GS1 Data Matrix) read by a 2D scanner.
 *
 * A code looks like  01 <GTIN-14> 21 <serial> <GS> 93 <check> [<GS> ...]
 * where <GS> is the ASCII 29 group separator. Scanners differ in how they type it:
 * as the real character, as nothing at all, or the whole code arrives in a Russian
 * (ЙЦУКЕН) keyboard layout so letters come out as Cyrillic. All of that is normalised
 * here so the same pack always gives the same code.
 */

export const GS = '\u001d';

/** ЙЦУКЕН → QWERTY for codes typed by a scanner while the OS layout is Russian/Uzbek Cyrillic. */
const RU_LAYOUT: Record<string, string> = {
  й: 'q', ц: 'w', у: 'e', к: 'r', е: 't', н: 'y', г: 'u', ш: 'i', щ: 'o', з: 'p', х: '[', ъ: ']',
  ф: 'a', ы: 's', в: 'd', а: 'f', п: 'g', р: 'h', о: 'j', л: 'k', д: 'l', ж: ';', э: "'",
  я: 'z', ч: 'x', с: 'c', м: 'v', и: 'b', т: 'n', ь: 'm', б: ',', ю: '.', ё: '`',
  // Uzbek Cyrillic keyboard letters on the same keys
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h'
};

function fromCyrillicLayout(text: string): string {
  let out = '';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const mapped = RU_LAYOUT[lower];
    out += mapped === undefined ? ch : ch === lower ? mapped : mapped.toUpperCase();
  }
  return out;
}

/** Cleans a raw scan: symbology prefix, separator variants, keyboard layout. */
export function normalizeMarkingCode(raw: string): string {
  let code = raw.trim();
  if (code.startsWith(']d2') || code.startsWith(']C1') || code.startsWith(']Q3')) code = code.slice(3);
  // Some scanners are configured to send the separator as a visible stand-in.
  code = code.replace(/\\u001d|<GS>|\{GS\}|~1/g, GS);
  if (/[Ѐ-ӿ]/.test(code)) code = fromCyrillicLayout(code);
  return code;
}

export interface MarkingCode {
  /** The normalised code as scanned — this is what goes on the fiscal receipt. */
  code: string;
  /** 14-digit GTIN, used to find the product. */
  gtin: string;
  /** Serial number when the separator made it clear where it ends. */
  serial: string | null;
}

/** Parses a scan; returns null when it isn't a marking code (e.g. a plain EAN-13). */
export function parseMarkingCode(raw: string): MarkingCode | null {
  const code = normalizeMarkingCode(raw);
  const match = /^01(\d{14})21([^\u001d]+)/.exec(code);
  if (!match || code.length < 25) return null;
  const hasSeparator = code.includes(GS);
  return { code, gtin: match[1], serial: hasSeparator ? match[2] : null };
}

/** True when a product's barcode (EAN-13, EAN-8, UPC-A or GTIN-14) is the code's GTIN. */
export function barcodeMatchesGtin(barcode: string | null | undefined, gtin: string): boolean {
  const b = (barcode ?? '').trim();
  if (!/^\d{8,14}$/.test(b)) return false;
  return b.padStart(14, '0') === gtin;
}
