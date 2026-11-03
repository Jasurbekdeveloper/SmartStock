/**
 * Receipt data as the fiscal agent (fiscal-agent/) takes it. Nothing here is specific to a
 * provider: the agent turns these lines into its provider's format.
 *
 * Agent units: money in tiyin, VAT included. Quantity in the product's unit. VAT as a
 * fraction (12% = 0.12).
 */
import { isValidMxikCode } from './product-identifiers';

/** One sale line as the till knows it. Money in so'm, VAT-inclusive. */
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

/** No `undefined` values: these lines are also stored on a debt, and Firestore rejects them. */
export interface FiscalLine {
  productId: string;
  name: string;
  quantity: number;
  paidTiyin: number;
  discountTiyin: number;
  vatRate: number;
  barcode: string | null;
  mxikCode: string | null;
  packageCode: string | null;
  unit: string | null;
  markingCodes?: string[];
}

/**
 * How a sale is paid. Without `cashTiyin` the rest is cash (fully paid sale); with it, only
 * that much was taken now (debt sale). `paymentId` is a payment made through the register
 * that covers the whole receipt.
 */
export interface FiscalPayment {
  cardTiyin: number;
  cashTiyin?: number;
  paymentId?: string;
}

export type MoneyMethod = 'cash' | 'card';

export const toTiyin = (sum: number) => Math.round(sum * 100);

/** A real QR link of a fiscal receipt. REGOS hides it in its answers (`***`), so only the paper receipt has it. */
export function isFiscalQrUrl(value: string | null | undefined): boolean {
  return /^https?:\/\/\S+$/i.test((value ?? '').trim());
}

export function toFiscalLines(lines: FiscalLineInput[], vatRate: number): FiscalLine[] {
  return lines.map((l) => ({
    productId: l.productId,
    name: l.name,
    quantity: l.quantity,
    paidTiyin: toTiyin(l.paid),
    discountTiyin: Math.max(0, toTiyin(l.discount)),
    vatRate,
    barcode: l.barcode ?? null,
    mxikCode: l.mxikCode ?? null,
    packageCode: l.packageCode ?? null,
    unit: l.unit ?? null,
    ...(l.markingCodes?.length ? { markingCodes: l.markingCodes } : {})
  }));
}

/** Goods saved on a debt before the agent existed, in REGOS: VCR's own units. */
export interface LegacyVcrPosition {
  name: string;
  barcode: string;
  icps: string;
  package_code: string;
  quantity: number;
  amount: number;
  discount: number;
  vat_value: number;
  code?: string;
}

/** Quantity comes back in thousandths with no unit, which the agent turns into the same number. */
export function legacyPositionToLine(p: LegacyVcrPosition): FiscalLine {
  return {
    productId: p.code ?? '',
    name: p.name,
    quantity: p.quantity / 1000,
    paidTiyin: Math.max(0, p.amount - p.discount),
    discountTiyin: p.discount,
    vatRate: p.vat_value > 0 ? p.vat_value / 10000 : 0,
    barcode: p.barcode,
    mxikCode: p.icps,
    packageCode: p.package_code,
    unit: null
  };
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
