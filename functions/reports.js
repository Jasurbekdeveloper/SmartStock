// Telegram reports: daily / weekly / monthly statistics and low stock.
// Pure functions only (ranges, totals, text) — unit tested in reports.test.js.

/** Uzbekistan has no daylight saving: always UTC+5. */
export const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

export const REPORT_DEFAULTS = { daily: true, weekly: true, monthly: true, lowStock: true, toAdmins: true, groupChatId: null, groupTitle: null };

/** Local (Tashkent) calendar parts of an instant. */
function local(date) {
  const d = new Date(date.getTime() + TZ_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay() };
}

/** UTC instant of local midnight y-m-d (month/day may overflow, Date handles it). */
function midnight(y, m, d) {
  return new Date(Date.UTC(y, m, d) - TZ_OFFSET_MS);
}

const pad = (n) => String(n).padStart(2, '0');
const dmy = (date) => {
  const l = local(date);
  return `${pad(l.d)}.${pad(l.m + 1)}.${l.y}`;
};

/**
 * The period a report covers, and the one before it for comparison.
 * daily — today so far (sent in the evening); weekly — last Monday..Sunday;
 * monthly — the previous calendar month.
 */
export function reportRange(kind, now = new Date()) {
  const l = local(now);
  if (kind === 'daily') {
    const from = midnight(l.y, l.m, l.d);
    const to = midnight(l.y, l.m, l.d + 1);
    return { from, to, prevFrom: new Date(from.getTime() - DAY_MS), prevTo: from, label: `${dmy(from)} (${WEEKDAYS[l.wd]})` };
  }
  if (kind === 'weekly') {
    const sinceMonday = (l.wd + 6) % 7;
    const to = midnight(l.y, l.m, l.d - sinceMonday);
    const from = new Date(to.getTime() - 7 * DAY_MS);
    return { from, to, prevFrom: new Date(from.getTime() - 7 * DAY_MS), prevTo: from, label: `${dmy(from)} – ${dmy(new Date(to.getTime() - DAY_MS))}` };
  }
  if (kind === 'monthly') {
    const to = midnight(l.y, l.m, 1);
    const from = midnight(l.y, l.m - 1, 1);
    const prevFrom = midnight(l.y, l.m - 2, 1);
    const fl = local(from);
    return { from, to, prevFrom, prevTo: from, label: `${MONTHS[fl.m]} ${fl.y}` };
  }
  throw new Error(`Unknown report kind: ${kind}`);
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Totals of a period from sale and return documents (plain objects). */
export function summarize(sales, returns = []) {
  const s = { count: 0, revenue: 0, profit: 0, cash: 0, card: 0, debt: 0, refunds: 0, refundCount: 0, top: [] };
  const byProduct = new Map();
  for (const sale of sales) {
    const total = num(sale.total);
    s.count += 1;
    s.revenue += total;
    s.profit += num(sale.totalNetProfit);
    const debt = num(sale.debtAmount);
    s.debt += debt;
    if (sale.cashAmount !== undefined || sale.cardAmount !== undefined) {
      s.cash += num(sale.cashAmount);
      s.card += num(sale.cardAmount);
    } else if (sale.paymentMethod === 'card') {
      s.card += total - debt;
    } else {
      s.cash += total - debt;
    }
    for (const item of sale.items ?? []) {
      const key = item.productId || item.productName;
      const row = byProduct.get(key) ?? { name: item.productName ?? '?', unit: item.unit ?? '', quantity: 0, amount: 0 };
      row.quantity += num(item.quantity);
      row.amount += num(item.finalTotal ?? item.total);
      byProduct.set(key, row);
    }
  }
  for (const r of returns) {
    s.refunds += num(r.refundAmount);
    s.refundCount += 1;
  }
  s.top = [...byProduct.values()].sort((a, b) => b.amount - a.amount).slice(0, 5);
  return s;
}

/** 1234567.8 → "1 234 568" */
export function money(v) {
  return Math.round(num(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function qty(v) {
  const n = Math.round(num(v) * 1000) / 1000;
  return Number.isInteger(n) ? money(n) : String(n).replace('.', ',');
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function change(now, before) {
  if (!(before > 0)) return '';
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return ' (o‘zgarishsiz)';
  return pct > 0 ? ` (▲ ${pct}%)` : ` (▼ ${Math.abs(pct)}%)`;
}

const TITLES = { daily: 'Kunlik hisobot', weekly: 'Haftalik hisobot', monthly: 'Oylik hisobot' };
const VERSUS = { daily: 'kechagiga', weekly: 'o‘tgan haftaga', monthly: 'o‘tgan oyga' };

/** Telegram HTML message for a period summary. */
export function formatReport({ kind, storeName, currency = "so'm", label, current, previous }) {
  const c = current;
  const lines = [`📊 <b>${TITLES[kind]}</b> — ${escapeHtml(storeName)}`, `📅 ${label}`, ''];
  if (c.count === 0) {
    lines.push('Bu davrda savdo bo‘lmadi.');
    return lines.join('\n');
  }
  const cur = escapeHtml(currency);
  const net = c.revenue - c.refunds;
  lines.push(`💰 Savdo: <b>${money(c.revenue)}</b> ${cur}${change(c.revenue, previous?.revenue ?? 0)}`);
  if (previous && previous.revenue > 0) lines[lines.length - 1] += ` — ${VERSUS[kind]} nisbatan`;
  lines.push(`🧾 Cheklar: ${c.count} ta · o‘rtacha ${money(c.revenue / c.count)} ${cur}`);
  lines.push(`📈 Foyda: ${money(c.profit)} ${cur}`);
  const pay = [`💵 Naqd: ${money(c.cash)}`, `💳 Karta: ${money(c.card)}`];
  if (c.debt > 0) pay.push(`📒 Qarzga: ${money(c.debt)}`);
  lines.push(pay.join(' · '));
  if (c.refundCount > 0) {
    lines.push(`↩️ Qaytarishlar: ${money(c.refunds)} ${cur} (${c.refundCount} ta)`);
    lines.push(`✅ Sof tushum: <b>${money(net)}</b> ${cur}`);
  }
  if (c.top.length > 0) {
    lines.push('', '🏆 <b>Eng ko‘p sotilganlar</b>');
    c.top.forEach((p, i) => lines.push(`${i + 1}. ${escapeHtml(p.name)} — ${qty(p.quantity)} ${escapeHtml(p.unit)} · ${money(p.amount)}`));
  }
  return lines.join('\n');
}

/** Products at or below their minimum, fewest first. */
export function lowStockItems(products) {
  return products
    .filter((p) => num(p.minQuantity) > 0 && num(p.quantity) <= num(p.minQuantity))
    .sort((a, b) => num(a.quantity) / num(a.minQuantity) - num(b.quantity) / num(b.minQuantity));
}

export function formatLowStock({ storeName, items, limit = 30 }) {
  const lines = [`⚠️ <b>Kam qolgan mahsulotlar</b> — ${escapeHtml(storeName)}`, `${items.length} ta mahsulot minimal miqdordan kam:`, ''];
  for (const p of items.slice(0, limit)) {
    const icon = num(p.quantity) <= 0 ? '🔴' : '🟠';
    lines.push(`${icon} ${escapeHtml(p.name)} — ${qty(p.quantity)} ${escapeHtml(p.unit ?? '')} (min ${qty(p.minQuantity)})`);
  }
  if (items.length > limit) lines.push('', `…va yana ${items.length - limit} ta`);
  return lines.join('\n');
}
