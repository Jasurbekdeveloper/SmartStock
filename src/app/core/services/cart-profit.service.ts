import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

/**
 * One cart line's raw inputs BEFORE any discount proration — i.e. the plain,
 * undiscounted per-unit price and per-unit cost, plus enough identity/quantity
 * info to build a `SaleItem`-shaped result from it.
 */
export interface CartProfitLineInput {
  /** Firestore product id — carried through untouched to the result line. */
  productId: string;
  /** Product display name, snapshotted at sale time (mirrors `SaleItem.productName`). */
  name: string;
  /** Quantity sold on this line, in the product's primary unit. */
  quantity: number;
  /** Per-unit sale price with ZERO discounts applied — the plain catalog/cart price
   *  (e.g. `CartItem.price`, never the already-discounted `CartItem.total`). This is
   *  the base every proportional discount share is computed from. */
  originalPrice: number;
  /** Per-unit cost price (what the store paid to acquire one unit), used only to
   *  compute `netProfit` — never shown to the customer. */
  costPrice: number;
}

/**
 * One cart line's fully resolved pricing + profit, after its proportional share
 * of the receipt's combined discount has been applied. Shaped so every field can
 * be copied directly onto a `SaleItem` when a sale is persisted.
 */
export interface CartProfitLineResult {
  /** Firestore product id, echoed from the input. */
  productId: string;
  /** Product display name, echoed from the input. */
  name: string;
  /** Quantity sold on this line, echoed from the input. */
  quantity: number;
  /** Per-unit price with zero discounts applied, echoed from the input. */
  originalPrice: number;
  /** This line's proportional share of the receipt's total discount, in absolute
   *  currency. Every line's `discountAmount` sums to EXACTLY the `totalDiscount`
   *  passed into `calculateCartProfit` (see that method's doc comment for how the
   *  rounding remainder is absorbed so this always holds exactly, not just approximately). */
  discountAmount: number;
  /** Per-unit price AFTER this line's share of the discount — i.e. the true price
   *  each unit actually sold for. `(quantity * originalPrice - discountAmount) / quantity`. */
  finalPrice: number;
  /** This line's total AFTER its share of the discount — `quantity * originalPrice - discountAmount`.
   *  This is the true amount the customer actually paid for this line (pre-tax). */
  totalFinal: number;
  /** Per-unit cost price, echoed from the input — kept on the result so the persisted
   *  sale line carries its own profit math without needing to re-join against the
   *  product catalog later (the catalog cost may have changed since). */
  itemCostPrice: number;
  /** True net profit for this line after the discount actually given: `totalFinal - (itemCostPrice * quantity)`.
   *  Can be negative if the discount cut deep enough to sell below cost — intentionally
   *  NOT clamped to zero, since hiding a loss would defeat the entire point of this service. */
  netProfit: number;
}

/**
 * Whole-receipt summary, ready to persist alongside/inside a `Sale` document —
 * the true, per-item-accurate pricing and profit breakdown for a receipt that
 * had a single cashier-entered discount applied to its total rather than to
 * each item individually.
 */
export interface CartProfitSummary {
  /** Every cart line's resolved pricing + profit, same order as the input. */
  items: CartProfitLineResult[];
  /** Sum of `quantity * originalPrice` across all lines — the receipt total
   *  BEFORE any discount, pre-tax. */
  originalTotal: number;
  /** The total discount actually distributed across `items` — echoes the
   *  (clamped) `totalDiscount` argument, so callers can see what was actually
   *  applied after clamping, not just what was requested. */
  discountGiven: number;
  /** Tax computed on the post-discount, pre-tax total: `(originalTotal - discountGiven) * taxRate`.
   *  Named `vatAmount12` per the original spec's field naming even though the actual
   *  rate used is whatever `taxRate` was passed in (defaulting to 12% only when omitted) —
   *  the store's real, admin-configured VAT rate is what determines the VALUE here. */
  vatAmount12: number;
  /** What the customer actually paid for the whole receipt, tax included:
   *  `(originalTotal - discountGiven) + vatAmount12`. Should match the POS
   *  checkout screen's own `finalTotal` computed signal within rounding. */
  finalTotalWithTax: number;
  /** Sum of every line's `netProfit` — the receipt's true net profit after
   *  the discount actually given, regardless of how it was distributed between
   *  a per-line manual discount and a cart-level checkout discount. */
  totalNetProfit: number;
}

/**
 * Computes true per-item sold price and net profit for a POS receipt that had
 * ONE combined discount applied to its total (rather than a separate discount
 * per item), by distributing that discount across items proportionally to each
 * item's share of the receipt's raw (undiscounted) subtotal.
 *
 * This is a pure, synchronous, side-effect-free calculation — it reads nothing
 * from Firestore and writes nothing anywhere. It is meant to be called once, at
 * the moment a sale is finalized, to enrich the `Sale`/`SaleItem` documents
 * about to be persisted with true per-item profit data. It never changes what
 * the customer is charged — that math (`subtotal`/`tax`/`finalTotal` on the POS
 * screen) is computed entirely separately and stays authoritative for checkout.
 */
@Injectable({
  providedIn: 'root'
})
export class CartProfitService {
  /**
   * Distributes `totalDiscount` across `lines` in proportion to each line's raw
   * (undiscounted) subtotal share of the receipt, then computes each line's true
   * sold price and net profit.
   *
   * ## Proportional discount distribution
   * For every line except the last, `discountAmount = round(totalDiscount * (lineSubtotal / originalTotal))`.
   * Rounding each line independently would make the per-line discounts sum to
   * something slightly off from `totalDiscount` (off by a few so'm either way,
   * depending on how each fraction happened to round). Instead, the LAST line's
   * `discountAmount` is computed as `totalDiscount - (sum of every other line's
   * discountAmount)` — i.e. it is never independently rounded, it simply absorbs
   * whatever remainder is left over. This guarantees the sum of all `discountAmount`s
   * across every line equals `totalDiscount` EXACTLY, every time, regardless of
   * how the rounding fell on the other lines.
   *
   * ## Defensive clamping
   * `totalDiscount` is clamped to `[0, originalTotal]` before distribution — a
   * discount can never be negative, and can never exceed the receipt's own raw
   * total. This runs at checkout time against whatever the cashier typed, so it
   * clamps rather than throws.
   *
   * @param lines Every cart line's raw (undiscounted) inputs.
   * @param totalDiscount The full combined discount actually given on the receipt
   *   (e.g. sum of every per-line manual discount PLUS the cart-level checkout
   *   discount, if this app has both — see `pos.component.ts`'s `completeSale()`
   *   for how the two are combined before being passed in here).
   * @param taxRate The store's real, admin-configured VAT/tax rate (e.g. 0.12 for
   *   12%). Defaults to 0.12 only when the caller has no configured rate to pass —
   *   callers with access to `SettingsService`/the POS screen's `taxRate()` signal
   *   should always pass the real value explicitly.
   */
  calculateCartProfit(
    lines: CartProfitLineInput[],
    totalDiscount: number,
    taxRate = 0.12
  ): CartProfitSummary {
    // Each line's raw (undiscounted) subtotal, and the receipt's raw total —
    // this is the basis every discount share is proportioned against.
    const lineSubtotals = lines.map((line) => line.quantity * line.originalPrice);
    const originalTotal = lineSubtotals.reduce((sum, subtotal) => sum + subtotal, 0);

    // Defensive clamp: a discount can never be negative or exceed the receipt's
    // own raw total, no matter what was typed at checkout.
    const clampedDiscount = Math.max(0, Math.min(totalDiscount, originalTotal));

    const items: CartProfitLineResult[] = [];

    if (originalTotal === 0) {
      // Empty cart or every item is free — nothing to distribute, avoid dividing by zero.
      for (const line of lines) {
        items.push({
          productId: line.productId,
          name: line.name,
          quantity: line.quantity,
          originalPrice: line.originalPrice,
          discountAmount: 0,
          finalPrice: 0,
          totalFinal: 0,
          itemCostPrice: line.costPrice,
          netProfit: 0 - line.costPrice * line.quantity
        });
      }
    } else {
      let distributedSoFar = 0;

      lines.forEach((line, index) => {
        const lineSubtotal = lineSubtotals[index];
        const isLastLine = index === lines.length - 1;

        // The last line absorbs whatever remainder is left over instead of being
        // independently rounded, so the sum of every discountAmount always equals
        // clampedDiscount exactly (see method doc comment above for why).
        const discountAmount = isLastLine
          ? clampedDiscount - distributedSoFar
          : Math.round(clampedDiscount * (lineSubtotal / originalTotal));

        distributedSoFar += discountAmount;

        const totalFinal = lineSubtotal - discountAmount;
        const finalPrice = line.quantity > 0 ? totalFinal / line.quantity : 0;
        const netProfit = totalFinal - line.costPrice * line.quantity;

        items.push({
          productId: line.productId,
          name: line.name,
          quantity: line.quantity,
          originalPrice: line.originalPrice,
          discountAmount,
          finalPrice,
          totalFinal,
          itemCostPrice: line.costPrice,
          netProfit
        });
      });
    }

    const postDiscountTotal = originalTotal - clampedDiscount;
    const vatAmount12 = postDiscountTotal * taxRate;
    const finalTotalWithTax = postDiscountTotal + vatAmount12;
    const totalNetProfit = items.reduce((sum, item) => sum + item.netProfit, 0);

    return {
      items,
      originalTotal,
      discountGiven: clampedDiscount,
      vatAmount12,
      finalTotalWithTax,
      totalNetProfit
    };
  }

  /**
   * Thin Observable wrapper around `calculateCartProfit` for callers already working
   * in an RxJS pipeline (e.g. chained with `switchMap` off a Firestore write). The
   * underlying calculation is synchronous and side-effect-free — prefer calling
   * `calculateCartProfit` directly when a plain synchronous result is all you need.
   */
  calculateCartProfit$(
    lines: CartProfitLineInput[],
    totalDiscount: number,
    taxRate = 0.12
  ): Observable<CartProfitSummary> {
    return of(this.calculateCartProfit(lines, totalDiscount, taxRate));
  }
}
