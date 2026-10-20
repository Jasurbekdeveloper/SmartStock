/** Default look-back for list/report pages: reading a store's whole history on every
 *  visit gets slower and costlier with each sale, so pages load a bounded window. */
export const DEFAULT_RANGE_DAYS = 30;

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Start of the day `days - 1` days ago, so the window covers `days` calendar days incl. today. */
export function daysAgo(days: number, now = new Date()): Date {
  const d = startOfDay(now);
  d.setDate(d.getDate() - (days - 1));
  return d;
}
