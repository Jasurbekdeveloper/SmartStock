/**
 * Single source of truth for every POS money calculation: line totals, cart-level
 * discount proration, VAT (QQS) in both inclusive and exclusive modes, per-line
 * profit, and how a payment splits into cash / card / debt / change.
 *
 * Pure and synchronous — the POS screen, the payment dialog and the persisted
 * `Sale` document all read from the same `calculateCheckout()` result, so the
 * number the cashier sees is always the number that gets saved.
 */

/** Rounds to 2 decimals without the classic binary-float drift (1.005 → 1.01). */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface CheckoutLineInput {
  /** In the product's primary unit. */
  quantity: number;
  /** Per-unit shelf price (VAT-inclusive when `pricesIncludeVat`). */
  price: number;
  /** Absolute discount given on this line only. */
  lineDiscount?: number;
  /** Per-unit cost price, used only for profit. */
  costPrice?: number;
}

export interface CheckoutLineResult {
  /** quantity * price, before any discount. */
  gross: number;
  /** Clamped per-line discount. */
  lineDiscount: number;
  /** This line's share of the cart-level discount. */
  cartDiscountShare: number;
  /** What the customer pays for this line, VAT included. */
  total: number;
  /** VAT contained in `total`. */
  vat: number;
  /** `total - vat` — the store's actual revenue for this line. */
  net: number;
  cost: number;
  /** `net - cost`. Intentionally not clamped — a below-cost sale must show as a loss. */
  profit: number;
}

export interface CheckoutSummary {
  lines: CheckoutLineResult[];
  /** Sum of quantity * price. */
  gross: number;
  /** Sum of per-line discounts. */
  lineDiscounts: number;
  /** gross - lineDiscounts: what the cart costs before the cart-level discount. */
  subtotal: number;
  /** Clamped cart-level discount actually applied. */
  cartDiscount: number;
  /** lineDiscounts + cartDiscount. */
  totalDiscount: number;
  vat: number;
  net: number;
  /** Amount due from the customer. */
  total: number;
  cost: number;
  profit: number;
}

export interface VatOptions {
  /** Fraction, e.g. 0.12 for 12%. 0 disables VAT entirely. */
  vatRate: number;
  /** true: shelf prices already contain VAT (standard for Uzbek retail) and VAT is
   *  only extracted for the receipt. false: VAT is added on top at checkout. */
  pricesIncludeVat: boolean;
}

export function calculateCheckout(
  inputs: CheckoutLineInput[],
  cartDiscount: number,
  { vatRate, pricesIncludeVat }: VatOptions
): CheckoutSummary {
  const rate = Math.max(0, vatRate || 0);

  const base = inputs.map((line) => {
    const gross = roundMoney(line.quantity * line.price);
    const lineDiscount = roundMoney(Math.max(0, Math.min(line.lineDiscount ?? 0, gross)));
    return { gross, lineDiscount, afterLine: roundMoney(gross - lineDiscount) };
  });

  const gross = roundMoney(base.reduce((s, l) => s + l.gross, 0));
  const lineDiscounts = roundMoney(base.reduce((s, l) => s + l.lineDiscount, 0));
  const subtotal = roundMoney(gross - lineDiscounts);
  const appliedCartDiscount = roundMoney(Math.max(0, Math.min(cartDiscount || 0, subtotal)));

  // Prorate the cart discount by each line's share of the subtotal; the last
  // non-empty line absorbs the rounding remainder so shares sum exactly.
  let lastIndex = -1;
  base.forEach((l, i) => {
    if (l.afterLine > 0) lastIndex = i;
  });
  let distributed = 0;

  const lines: CheckoutLineResult[] = base.map((l, i) => {
    let share = 0;
    if (subtotal > 0 && l.afterLine > 0) {
      share =
        i === lastIndex
          ? roundMoney(appliedCartDiscount - distributed)
          : roundMoney((appliedCartDiscount * l.afterLine) / subtotal);
      distributed = roundMoney(distributed + share);
    }
    const discounted = roundMoney(l.afterLine - share);

    let total: number;
    let vat: number;
    if (pricesIncludeVat) {
      total = discounted;
      vat = roundMoney((discounted * rate) / (1 + rate));
    } else {
      vat = roundMoney(discounted * rate);
      total = roundMoney(discounted + vat);
    }
    const net = roundMoney(total - vat);
    const input = inputs[i];
    const cost = roundMoney((input.costPrice ?? 0) * input.quantity);

    return {
      gross: l.gross,
      lineDiscount: l.lineDiscount,
      cartDiscountShare: share,
      total,
      vat,
      net,
      cost,
      profit: roundMoney(net - cost)
    };
  });

  const sum = (pick: (l: CheckoutLineResult) => number) => roundMoney(lines.reduce((s, l) => s + pick(l), 0));

  return {
    lines,
    gross,
    lineDiscounts,
    subtotal,
    cartDiscount: appliedCartDiscount,
    totalDiscount: roundMoney(lineDiscounts + appliedCartDiscount),
    vat: sum((l) => l.vat),
    net: sum((l) => l.net),
    total: sum((l) => l.total),
    cost: sum((l) => l.cost),
    profit: sum((l) => l.profit)
  };
}

export type DiscountMode = 'amount' | 'percent';

/** Turns what the cashier typed (a sum or a percentage) into an absolute,
 *  clamped discount on `subtotal`. */
export function resolveDiscount(subtotal: number, value: number, mode: DiscountMode): number {
  const v = Math.max(0, value || 0);
  const amount = mode === 'percent' ? (subtotal * Math.min(v, 100)) / 100 : v;
  return roundMoney(Math.min(amount, Math.max(0, subtotal)));
}

export interface PaymentSplit {
  /** Cash that actually stays in the drawer (tendered minus change). */
  cash: number;
  card: number;
  /** Unpaid remainder that becomes a customer debt. */
  debt: number;
  /** Cash handed back. Only cash can produce change — never card. */
  change: number;
  /** Everything the customer handed over (cash tendered + card). */
  paid: number;
}

/**
 * Card is applied first (and capped at the total, a card terminal never
 * over-charges); cash covers the rest and any surplus cash is change.
 */
export function splitPayment(total: number, cashTendered: number, cardAmount: number): PaymentSplit {
  const due = roundMoney(Math.max(0, total));
  const card = roundMoney(Math.min(Math.max(0, cardAmount || 0), due));
  const remaining = roundMoney(due - card);
  const tendered = roundMoney(Math.max(0, cashTendered || 0));
  const cash = roundMoney(Math.min(tendered, remaining));
  return {
    cash,
    card,
    debt: roundMoney(remaining - cash),
    change: roundMoney(Math.max(0, tendered - remaining)),
    paid: roundMoney(tendered + card)
  };
}

/** Human-readable, offline-safe receipt number: YYMMDD-HHMMSS-xx. Firestore has
 *  no offline-safe counter, so the timestamp plus a short random suffix keeps it
 *  unique across tills without a server round trip. */
export function generateReceiptNo(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${String(now.getFullYear()).slice(2)}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const suffix = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, '0');
  return `${date}-${time}-${suffix}`;
}
