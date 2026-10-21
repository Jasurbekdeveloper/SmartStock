import siteDefaults from '../../../../website/content.json';

/** Languages of the marketing site (website/), independent of the app's own languages. */
export const SITE_LANGS = ['uz', 'ru', 'en'] as const;
export type SiteLang = (typeof SITE_LANGS)[number];

export type LocalizedText = Partial<Record<SiteLang, string>>;

export interface SiteListItem {
  icon?: string;
  title: LocalizedText;
  text?: LocalizedText;
}

export type SiteListName = 'strip' | 'bad' | 'good' | 'features' | 'steps' | 'why' | 'who' | 'faq';
export type SiteSection = 'features' | 'how' | 'why' | 'who' | 'pricing' | 'faq' | 'contact';

/** `siteContent/main` — everything the website shows besides the plans.
 *  Missing or empty values fall back to website/content.json (see website/main.js `merge`). */
export interface SiteContent {
  contact: { phone: string; telegram: string; email: string };
  sections: Record<SiteSection, boolean>;
  texts: Record<string, LocalizedText>;
  lists: Record<SiteListName, SiteListItem[]>;
  updatedAt?: Date;
  updatedBy?: string;
}

export const SITE_DEFAULTS = siteDefaults as unknown as SiteContent;

export const SITE_SECTIONS: SiteSection[] = ['features', 'how', 'why', 'who', 'pricing', 'faq', 'contact'];

/** Editor layout: lists, and whether their items have a second text and an icon. */
export const SITE_LISTS: { name: SiteListName; hasText: boolean; hasIcon?: boolean }[] = [
  { name: 'strip', hasText: true },
  { name: 'bad', hasText: false },
  { name: 'good', hasText: false },
  { name: 'features', hasText: true, hasIcon: true },
  { name: 'steps', hasText: true },
  { name: 'why', hasText: true },
  { name: 'who', hasText: false },
  { name: 'faq', hasText: true }
];

/** Must match ICONS in website/main.js. */
export const FEATURE_ICONS = [
  'pos', 'stock', 'debt', 'stats', 'shift', 'ret', 'crm', 'users', 'import', 'scan', 'online', 'cloud', 'telegram', 'print', 'star'
];

/** Text keys grouped by their prefix, in page order. */
export const SITE_TEXT_GROUPS: { id: string; prefixes: string[] }[] = [
  { id: 'meta', prefixes: ['meta.'] },
  { id: 'nav', prefixes: ['nav.'] },
  { id: 'hero', prefixes: ['hero.'] },
  { id: 'mock', prefixes: ['mock.'] },
  { id: 'ps', prefixes: ['ps.'] },
  { id: 'features', prefixes: ['f.'] },
  { id: 'how', prefixes: ['how.'] },
  { id: 'why', prefixes: ['why.'] },
  { id: 'who', prefixes: ['who.'] },
  { id: 'pricing', prefixes: ['pricing.'] },
  { id: 'faq', prefixes: ['faq.'] },
  { id: 'cta', prefixes: ['cta.', 'footer.'] },
  { id: 'demo', prefixes: ['demo.'] }
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Defaults overlaid with the published document — the full editable state. */
export function mergeSiteContent(remote?: Partial<SiteContent> | null): SiteContent {
  const result = clone(SITE_DEFAULTS);
  if (!remote) return result;
  result.contact = { ...result.contact, ...(remote.contact ?? {}) };
  result.sections = { ...result.sections, ...(remote.sections ?? {}) };
  for (const [key, value] of Object.entries(remote.texts ?? {})) {
    result.texts[key] = { ...(result.texts[key] ?? {}) };
    for (const lang of SITE_LANGS) {
      if (value?.[lang]?.trim()) result.texts[key][lang] = value[lang];
    }
  }
  for (const [name, items] of Object.entries(remote.lists ?? {})) {
    if (Array.isArray(items)) result.lists[name as SiteListName] = clone(items);
  }
  return result;
}

/** Plain JSON for Firestore (no undefined values). */
export function serializeSiteContent(content: SiteContent): Omit<SiteContent, 'updatedAt' | 'updatedBy'> {
  return clone({ contact: content.contact, sections: content.sections, texts: content.texts, lists: content.lists });
}

// ---------- leads ----------

export type LeadStatus = 'new' | 'contacted' | 'demo' | 'won' | 'lost';
export const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'demo', 'won', 'lost'];

/** `leads/{id}` — a demo request from the website, created by the submitLead function. */
export interface Lead {
  id: string;
  name: string;
  phone: string;
  storeName?: string;
  city?: string;
  storeType?: string;
  registers?: string;
  message?: string;
  plan?: string;
  lang?: SiteLang;
  status: LeadStatus;
  notes?: string;
  /** Telegram messages that went out for this lead. */
  notified?: number;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
