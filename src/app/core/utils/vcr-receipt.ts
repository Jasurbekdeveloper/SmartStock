/**
 * Builds REGOS: VCR (virtual cash register) receipt data from a MarketHisob sale.
 * Docs: https://docs.regos.uz/ru/regos-vcr/operations/api-interface
 *
 * VCR units: money in tiyin (so'm × 100), quantity in grams / thousandths
 * (1 piece = 1000), VAT rate × 100 (12% = 1200, no VAT = -1). Each marked unit
 * (Asl belgisi) is its own position with quantity 1000 and its code in `label`.
 */
import { isValidMxikCode } from './product-identifiers';
import { ean13CheckDigit } from './product-identifiers';
import { parseMarkingCode } from './marking';

export interface VcrPosition {
  name: string;
  barcode: string;
  icps: string;
  package_code: string;
  owner_type: 'BuyingAndSelling';
  quantity: number;
  amount: number;
  discount: number;
  vat_value: number;
  label?: string;
  unit_name?: string;
  code?: string;
}

export interface VcrPayment {
  type: 1 | 2;
  value?: number;
  payment_id?: string;
}

/** One sale line as the fiscal receipt needs it. Money in so'm, VAT-inclusive. */
export interface FiscalLineInput {
  productId: string;
  name: string;
  barcode?: string | null;
  mxikCode?: string | null;
  packageCode?: string | null;
  unit?: string;
  /** In the product's primary unit. */
  quantity: number;
  /** What the customer pays for the line after every discount, VAT included. */
  paid: number;
  /** Every discount on the line (line + share of the cart discount), VAT included. */
  discount: number;
  markingCodes?: string[];
}

export const toTiyin = (sum: number) => Math.round(sum * 100);

/** VCR wants grams for weight and thousandths for everything else. */
export function vcrQuantity(quantity: number, unit?: string): number {
  return Math.max(1, Math.round(unit === 'g' ? quantity : quantity * 1000));
}

/** EAN-13 only (VCR rejects other formats); for marked goods the GTIN inside the code works too. */
export function vcrBarcode(barcode: string | null | undefined, markingCode?: string): string {
  const b = (barcode ?? '').trim();
  if (/^\d{13}$/.test(b) && ean13CheckDigit(b.slice(0, 12)) === Number(b[12])) return b;
  const gtin = markingCode && /^01(\d{14})/.exec(markingCode)?.[1];
  if (gtin && gtin.startsWith('0')) return gtin.slice(1);
  return '';
}

/**
 * Marking code as VCR takes it in `label`: GS separators are not allowed there, so the
 * identification part (01 GTIN 21 serial) is sent without the crypto tail. A code
 * scanned without its separators can't be split — then it goes whole, minus any
 * characters VCR doesn't accept.
 */
export function vcrLabel(markingCode: string): string {
  const parsed = parseMarkingCode(markingCode);
  if (parsed?.serial) return `01${parsed.gtin}21${parsed.serial}`;
  return markingCode.replace(/[^A-Za-z0-9!"%&'()*+,\-./_:;=<>?]/g, '');
}

export function vcrVatValue(vatRate: number): number {
  return vatRate > 0 ? Math.round(vatRate * 10000) : -1;
}

/** Splits `total` tiyin into `n` parts that add up exactly (remainder on the last). */
function splitEven(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - base * (n - 1) : base));
}

/** Lines that can't go on a fiscal receipt yet, with the reason (translation key). */
export function fiscalProblems(lines: FiscalLineInput[]): { name: string; key: string }[] {
  const problems: { name: string; key: string }[] = [];
  for (const l of lines) {
    if (!isValidMxikCode(l.mxikCode)) problems.push({ name: l.name, key: 'fiscal.noMxik' });
    else if (!l.packageCode) problems.push({ name: l.name, key: 'fiscal.noPackage' });
  }
  return problems;
}

export function buildVcrPositions(lines: FiscalLineInput[], vatRate: number): VcrPosition[] {
  const vat = vcrVatValue(vatRate);
  const out: VcrPosition[] = [];
  for (const l of lines) {
    const paid = toTiyin(l.paid);
    const discount = Math.max(0, toTiyin(l.discount));
    const common = {
      name: l.name.slice(0, 255),
      icps: String(l.mxikCode ?? ''),
      package_code: String(l.packageCode ?? ''),
      owner_type: 'BuyingAndSelling' as const,
      vat_value: vat,
      code: l.productId
    };
    const codes = l.markingCodes ?? [];
    if (codes.length > 0) {
      const paidParts = splitEven(paid, codes.length);
      const discParts = splitEven(discount, codes.length);
      codes.forEach((label, i) =>
        out.push({ ...common, barcode: vcrBarcode(l.barcode, label), quantity: 1000, amount: paidParts[i] + discParts[i], discount: discParts[i], label: vcrLabel(label) })
      );
    } else {
      out.push({ ...common, barcode: vcrBarcode(l.barcode), quantity: vcrQuantity(l.quantity, l.unit), amount: paid + discount, discount });
    }
  }
  return out;
}

/** Cash and card parts; they always add up to exactly what the positions charge. */
export function buildVcrPayments(positions: VcrPosition[], card: number, integratedPaymentId?: string): VcrPayment[] {
  const total = positions.reduce((s, p) => s + p.amount - p.discount, 0);
  if (integratedPaymentId) return [{ type: 2, payment_id: integratedPaymentId }];
  const cardTiyin = Math.min(total, Math.max(0, toTiyin(card)));
  const payments: VcrPayment[] = [];
  if (total - cardTiyin > 0) payments.push({ type: 1, value: total - cardTiyin });
  if (cardTiyin > 0) payments.push({ type: 2, value: cardTiyin });
  if (payments.length === 0) payments.push({ type: 1, value: 0 });
  return payments;
}

/**
 * Payments of a sale made partly or fully on debt (qarz): only the money actually taken
 * now — the rest is paid later and gets its own credit receipt. Cash and card amounts
 * are in so'm.
 */
export function buildPartPayments(cash: number, card: number): VcrPayment[] {
  const payments: VcrPayment[] = [];
  const cashTiyin = Math.max(0, toTiyin(cash));
  const cardTiyin = Math.max(0, toTiyin(card));
  if (cashTiyin > 0) payments.push({ type: 1, value: cashTiyin });
  if (cardTiyin > 0) payments.push({ type: 2, value: cardTiyin });
  if (payments.length === 0) payments.push({ type: 1, value: 0 });
  return payments;
}

/**
 * Positions for a credit receipt (Receipt.Credit) when part of a debt is repaid: the
 * goods of the original sale with their amounts scaled down so they add up exactly to
 * `amountTiyin`. Marking codes are not repeated — they were closed by the sale receipt.
 */
export function scaleVcrPositions(positions: VcrPosition[], amountTiyin: number): VcrPosition[] {
  const nets = positions.map((p) => Math.max(0, p.amount - p.discount));
  const total = nets.reduce((s, n) => s + n, 0);
  if (total <= 0 || amountTiyin <= 0) return [];
  const target = Math.min(amountTiyin, total);
  const scaled = nets.map((n) => Math.floor((n * target) / total));
  // Rounding leftovers go to the biggest line so the sum is exact.
  const biggest = nets.indexOf(Math.max(...nets));
  scaled[biggest] += target - scaled.reduce((s, n) => s + n, 0);
  return positions
    .map((p, i) => {
      const { label: _label, ...rest } = p;
      return { ...rest, amount: scaled[i], discount: 0 };
    })
    .filter((p) => p.amount > 0);
}

/** Product unit → words the catalogue uses for the matching package. */
const UNIT_WORDS: Record<string, RegExp> = {
  dona: /дона|шт|dona|штук/i,
  kg: /кг|килограмм|kg/i,
  g: /грамм|^г\b|gramm/i,
  litr: /литр|^л\b|litr/i,
  m: /метр(?!.*кв)|^м\b|metr/i,
  m2: /м2|м²|кв\.?\s*м|квадрат/i,
  m3: /м3|м³|куб/i,
  qop: /қоп|коп|мешок|qop/i,
  quti: /қути|кути|коробк|quti|упаковк/i,
  rulon: /рулон|rulon/i,
  t: /тонна|^т\b/i
};

/** The package that matches the product's unit, else the catalogue's unit package, else the first. */
export function pickPackageForUnit<T extends { name: string; isUnit: boolean }>(packages: T[], unit?: string | null): T | null {
  if (packages.length === 0) return null;
  const words = unit ? UNIT_WORDS[unit] : undefined;
  if (words) {
    // "қоп (50 кг)" also mentions kg: a package whose first word is the unit wins.
    const firstWord = (p: T) => p.name.trim().split(/[\s(,]+/)[0] ?? '';
    const exact = packages.find((p) => words.test(firstWord(p))) ?? packages.find((p) => words.test(p.name.trim()));
    if (exact) return exact;
  }
  return packages.find((p) => p.isUnit) || packages[0];
}
