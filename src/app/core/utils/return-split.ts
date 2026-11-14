import { roundMoney } from './pos-math';

export interface ReturnSplit {
  /** What the returned goods cost the customer. */
  goods: number;
  /** Part that comes off the customer's unpaid debt for this sale. */
  debtReduction: number;
  /** Part given back as money. */
  refund: number;
}

/**
 * Returned goods of a (partly) debt sale settle the debt first: the customer stops
 * owing for goods they gave back. Only what is left after that goes back as money,
 * and never more than the customer actually paid for this sale.
 */
export function splitReturn(goods: number, debtLeft: number, paidLeft: number): ReturnSplit {
  const value = roundMoney(Math.max(0, goods));
  const debtReduction = roundMoney(Math.min(value, Math.max(0, debtLeft)));
  const refund = roundMoney(Math.min(value - debtReduction, Math.max(0, paidLeft)));
  return { goods: value, debtReduction, refund };
}
