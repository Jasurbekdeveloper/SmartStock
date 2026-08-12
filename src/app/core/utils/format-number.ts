/** Groups thousands with a space (1000000 -> "1 000 000"), regardless of UI language,
 * since so'm amounts should read the same way no matter which locale is selected. */
export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  }).format(value);
}
