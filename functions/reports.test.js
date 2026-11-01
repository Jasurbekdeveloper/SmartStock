import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLowStock, formatOverdueDebts, formatReport, lowStockItems, money, overdueDebts, reportRange, summarize } from './reports.js';

// Sunday 1 Nov 2026, 21:00 in Tashkent = 16:00 UTC.
const sundayEvening = new Date(Date.UTC(2026, 10, 1, 16, 0));

test('daily range is the local day, compared with yesterday', () => {
  const r = reportRange('daily', sundayEvening);
  assert.equal(r.from.toISOString(), '2026-10-31T19:00:00.000Z');
  assert.equal(r.to.toISOString(), '2026-11-01T19:00:00.000Z');
  assert.equal(r.prevFrom.toISOString(), '2026-10-30T19:00:00.000Z');
  assert.equal(r.label, '01.11.2026 (yakshanba)');
});

test('weekly range is last Monday..Sunday when sent on Monday morning', () => {
  const mondayMorning = new Date(Date.UTC(2026, 10, 2, 4, 0)); // 09:00 local
  const r = reportRange('weekly', mondayMorning);
  assert.equal(r.from.toISOString(), '2026-10-25T19:00:00.000Z'); // Mon 26 Oct 00:00 local
  assert.equal(r.to.toISOString(), '2026-11-01T19:00:00.000Z');
  assert.equal(r.label, '26.10.2026 – 01.11.2026');
});

test('monthly range is the previous calendar month, across a year end', () => {
  const r = reportRange('monthly', new Date(Date.UTC(2027, 0, 1, 4, 0)));
  assert.equal(r.from.toISOString(), '2026-11-30T19:00:00.000Z');
  assert.equal(r.to.toISOString(), '2026-12-31T19:00:00.000Z');
  assert.equal(r.prevFrom.toISOString(), '2026-10-31T19:00:00.000Z');
  assert.equal(r.label, 'dekabr 2026');
});

test('summarizes sales, payments, returns and the best sellers', () => {
  const s = summarize(
    [
      { total: 100000, totalNetProfit: 20000, cashAmount: 60000, cardAmount: 40000, items: [{ productId: 'a', productName: 'Sut', unit: 'dona', quantity: 10, total: 100000 }] },
      { total: 50000, totalNetProfit: 5000, debtAmount: 50000, cashAmount: 0, cardAmount: 0, items: [{ productId: 'b', productName: 'Non', unit: 'dona', quantity: 5, total: 50000 }] },
      { total: 30000, paymentMethod: 'card', items: [{ productId: 'a', productName: 'Sut', unit: 'dona', quantity: 3, finalTotal: 30000, total: 31000 }] }
    ],
    [{ refundAmount: 10000 }]
  );
  assert.equal(s.count, 3);
  assert.equal(s.revenue, 180000);
  assert.equal(s.cash, 60000);
  assert.equal(s.card, 70000);
  assert.equal(s.debt, 50000);
  assert.equal(s.refunds, 10000);
  assert.deepEqual(s.top.map((p) => [p.name, p.quantity, p.amount]), [['Sut', 13, 130000], ['Non', 5, 50000]]);
});

test('report text shows totals and the change, escaping names', () => {
  const current = summarize([{ total: 1234567, cashAmount: 1234567, items: [{ productId: 'x', productName: 'Choy <Ahmad>', unit: 'dona', quantity: 2, total: 1234567 }] }]);
  const text = formatReport({ kind: 'daily', storeName: 'Do‘kon', label: '01.11.2026', current, previous: { revenue: 1000000 } });
  assert.match(text, /Savdo: <b>1 234 567<\/b> so'm \(▲ 23%\) — kechagiga nisbatan/);
  assert.match(text, /Choy &lt;Ahmad&gt;/);
  assert.match(formatReport({ kind: 'weekly', storeName: 'X', label: 'L', current: summarize([]) }), /savdo bo‘lmadi/);
  assert.equal(money(1000), '1 000');
});

test('low stock lists only products at or under their minimum', () => {
  const items = lowStockItems([
    { name: 'A', quantity: 5, minQuantity: 10, unit: 'dona' },
    { name: 'B', quantity: 0, minQuantity: 3, unit: 'kg' },
    { name: 'C', quantity: 50, minQuantity: 10 },
    { name: 'D', quantity: 0 }
  ]);
  assert.deepEqual(items.map((p) => p.name), ['B', 'A']);
  const text = formatLowStock({ storeName: 'S', items, limit: 1 });
  assert.match(text, /🔴 B — 0 kg \(min 3\)/);
  assert.match(text, /va yana 1 ta/);
});

test('overdue debts: only past due with money owed, oldest first', () => {
  const now = new Date(Date.UTC(2026, 10, 1, 4));
  const items = overdueDebts(
    [
      { id: 'a', remainingAmount: 50000, dueDate: new Date(Date.UTC(2026, 9, 30)) },
      { id: 'b', remainingAmount: 0, dueDate: new Date(Date.UTC(2026, 9, 1)) },
      { id: 'c', remainingAmount: 20000, dueDate: { toDate: () => new Date(Date.UTC(2026, 9, 20)) } },
      { id: 'd', remainingAmount: 10000, dueDate: new Date(Date.UTC(2026, 10, 5)) },
      { id: 'e', remainingAmount: 10000 }
    ],
    now
  );
  assert.deepEqual(items.map((d) => d.id), ['c', 'a']);
  const text = formatOverdueDebts({ storeName: 'S', items: items.map((d) => ({ ...d, name: d.id === 'c' ? 'Ali' : 'Vali' })), now });
  assert.match(text, /2 ta qarz, jami <b>70 000<\/b>/);
  assert.match(text, /Ali — 20 000 so'm \(12 kun kechikdi\)/);
});
