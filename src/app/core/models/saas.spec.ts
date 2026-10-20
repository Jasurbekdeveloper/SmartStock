import { extendPaidUntil, getSubscriptionInfo } from './saas';

const now = new Date('2026-10-20T12:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

describe('getSubscriptionInfo', () => {
  it('treats a store without paidUntil as active with no expiry', () => {
    expect(getSubscriptionInfo({ status: 'active' }, now)).toEqual({ state: 'active', daysLeft: null, canWrite: true });
  });

  it('counts down a trial', () => {
    expect(getSubscriptionInfo({ status: 'trial', paidUntil: days(14) }, now)).toEqual({ state: 'trial', daysLeft: 14, canWrite: true });
  });

  it('keeps writing during the 3-day grace period', () => {
    expect(getSubscriptionInfo({ status: 'active', paidUntil: days(-1) }, now)).toEqual({ state: 'grace', daysLeft: 2, canWrite: true });
  });

  it('becomes read-only after grace', () => {
    expect(getSubscriptionInfo({ status: 'active', paidUntil: days(-3) }, now)).toEqual({ state: 'readonly', daysLeft: null, canWrite: false });
  });

  it('blocks a suspended store regardless of paidUntil', () => {
    expect(getSubscriptionInfo({ status: 'suspended', paidUntil: days(30) }, now).canWrite).toBe(false);
  });
});

describe('extendPaidUntil', () => {
  it('extends from today when already expired', () => {
    expect(extendPaidUntil(days(-10), 1, now).getMonth()).toBe(10);
  });

  it('extends from the current end when paying early', () => {
    const current = new Date(2026, 11, 5);
    const next = extendPaidUntil(current, 2, new Date(2026, 9, 20));
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2027, 1, 5]);
  });

  it('clamps to the end of a shorter month', () => {
    const next = extendPaidUntil(new Date(2027, 0, 31), 1, new Date(2027, 0, 1));
    expect([next.getMonth(), next.getDate()]).toEqual([1, 28]);
  });
});
