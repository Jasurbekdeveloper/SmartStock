import { endOfDay, startOfDay } from './date-range';

/** Report periods offered by the finance pages (labels: i18n `period.<key>`). */
export const PERIOD_KEYS = ['today', '7d', '30d', 'month', 'prevMonth', 'year'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export interface DateRange {
  from: Date;
  to: Date;
}

export function periodRange(key: PeriodKey, now = new Date()): DateRange {
  const to = endOfDay(now);
  const back = (days: number) => {
    const d = startOfDay(now);
    d.setDate(d.getDate() - (days - 1));
    return d;
  };
  switch (key) {
    case 'today':
      return { from: startOfDay(now), to };
    case '7d':
      return { from: back(7), to };
    case '30d':
      return { from: back(30), to };
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to };
    case 'prevMonth':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))
      };
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to };
  }
}

/** The equally long window right before `range`, for "vs previous period". */
export function previousRange(range: DateRange): DateRange {
  const length = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  return { from: startOfDay(new Date(to.getTime() - length)), to };
}

export function daysInRange(range: DateRange): number {
  return Math.max(1, Math.round((startOfDay(range.to).getTime() - startOfDay(range.from).getTime()) / 86_400_000) + 1);
}
