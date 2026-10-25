import { Sale, saleNetProfit, saleNetTotal } from '../services/sales.service';
import { roundMoney } from './pos-math';
import { startOfDay } from './date-range';

/** Fixed expense categories (labels: i18n `finance.cat.<id>`). "purchase" is for goods
 *  bought outside the stock-in flow; regular restocking cost is already in COGS. */
export const EXPENSE_CATEGORIES = [
  'rent',
  'salary',
  'utilities',
  'transport',
  'marketing',
  'tax',
  'repair',
  'supplies',
  'purchase',
  'other'
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  rent: 'storefront',
  salary: 'badge',
  utilities: 'bolt',
  transport: 'local_shipping',
  marketing: 'campaign',
  tax: 'account_balance',
  repair: 'build',
  supplies: 'inventory',
  purchase: 'shopping_bag',
  other: 'more_horiz'
};

export interface ExpenseLike {
  amount: number;
  category: ExpenseCategory;
  date: Date;
}

export interface CategoryAmount {
  category: ExpenseCategory;
  amount: number;
  /** Share of all expenses, 0..1. */
  share: number;
}

export interface PnlReport {
  receipts: number;
  /** Sum of receipt totals before returns (VAT included). */
  grossRevenue: number;
  refunds: number;
  /** grossRevenue − refunds. Accrual basis: debt sales count when sold, not when paid. */
  netRevenue: number;
  /** VAT contained in netRevenue. */
  vat: number;
  revenueExVat: number;
  /** Cost of goods sold, from the cost price snapshotted on each sale line. */
  cogs: number;
  grossProfit: number;
  /** grossProfit / revenueExVat, 0..1. */
  grossMargin: number;
  expensesTotal: number;
  expensesByCategory: CategoryAmount[];
  netProfit: number;
  /** netProfit / revenueExVat, 0..1. */
  netMargin: number;
  avgReceipt: number;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/** VAT of a sale scaled down by its refunded share, like saleNetProfit does for profit. */
function saleNetVat(sale: Sale): number {
  const tax = sale.tax ?? 0;
  if (!sale.refundedAmount || sale.total <= 0) return tax;
  return tax * (saleNetTotal(sale) / sale.total);
}

export function groupExpenses(expenses: ExpenseLike[]): CategoryAmount[] {
  const byCategory = new Map<ExpenseCategory, number>();
  for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  return [...byCategory.entries()]
    .map(([category, amount]) => ({ category, amount: roundMoney(amount), share: ratio(amount, total) }))
    .sort((a, b) => b.amount - a.amount);
}

/** Profit & loss for whatever sales and expenses the caller already filtered to a period. */
export function computePnl(sales: Sale[], expenses: ExpenseLike[]): PnlReport {
  const grossRevenue = roundMoney(sales.reduce((s, x) => s + x.total, 0));
  const netRevenue = roundMoney(sales.reduce((s, x) => s + saleNetTotal(x), 0));
  const vat = roundMoney(sales.reduce((s, x) => s + saleNetVat(x), 0));
  const revenueExVat = roundMoney(netRevenue - vat);
  const grossProfit = roundMoney(sales.reduce((s, x) => s + saleNetProfit(x), 0));
  const expensesTotal = roundMoney(expenses.reduce((s, e) => s + e.amount, 0));
  const netProfit = roundMoney(grossProfit - expensesTotal);
  return {
    receipts: sales.length,
    grossRevenue,
    refunds: roundMoney(grossRevenue - netRevenue),
    netRevenue,
    vat,
    revenueExVat,
    cogs: roundMoney(revenueExVat - grossProfit),
    grossProfit,
    grossMargin: ratio(grossProfit, revenueExVat),
    expensesTotal,
    expensesByCategory: groupExpenses(expenses),
    netProfit,
    netMargin: ratio(netProfit, revenueExVat),
    avgReceipt: roundMoney(ratio(netRevenue, sales.length))
  };
}

export interface PnlDay {
  date: Date;
  revenue: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
}

const dayKey = (d: Date) => startOfDay(d).getTime();

/** One row per calendar day in [from, to], empty days included, for the trend chart. */
export function pnlByDay(sales: Sale[], expenses: ExpenseLike[], from: Date, to: Date): PnlDay[] {
  const rows = new Map<number, PnlDay>();
  for (let d = startOfDay(from); d.getTime() <= to.getTime(); d.setDate(d.getDate() + 1)) {
    rows.set(d.getTime(), { date: new Date(d), revenue: 0, grossProfit: 0, expenses: 0, netProfit: 0 });
  }
  for (const s of sales) {
    const row = rows.get(dayKey(new Date(s.createdAt)));
    if (!row) continue;
    row.revenue += saleNetTotal(s);
    row.grossProfit += saleNetProfit(s);
  }
  for (const e of expenses) {
    const row = rows.get(dayKey(new Date(e.date)));
    if (row) row.expenses += e.amount;
  }
  return [...rows.values()].map((r) => ({
    ...r,
    revenue: roundMoney(r.revenue),
    grossProfit: roundMoney(r.grossProfit),
    expenses: roundMoney(r.expenses),
    netProfit: roundMoney(r.grossProfit - r.expenses)
  }));
}

/** Relative change for "vs previous period" badges; null when there is no base. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}
