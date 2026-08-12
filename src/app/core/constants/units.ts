export const PRODUCT_UNITS = ['dona', 'kg', 'g', 'm', 'm2', 'm3', 'litr', 'qop', 'quti', 'rulon', 't'] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];
