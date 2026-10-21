import { describe, expect, it } from 'vitest';
import { SITE_DEFAULTS, mergeSiteContent, serializeSiteContent } from './site-content';

describe('mergeSiteContent', () => {
  it('returns a copy of the defaults when nothing is published', () => {
    const merged = mergeSiteContent(null);
    expect(merged).toEqual(SITE_DEFAULTS);
    merged.texts['hero.title'].uz = 'changed';
    expect(SITE_DEFAULTS.texts['hero.title'].uz).not.toBe('changed');
  });

  it('keeps the default where a published text is empty', () => {
    const merged = mergeSiteContent({ texts: { 'hero.title': { uz: '  ', ru: 'Новый' } } });
    expect(merged.texts['hero.title'].uz).toBe(SITE_DEFAULTS.texts['hero.title'].uz);
    expect(merged.texts['hero.title'].ru).toBe('Новый');
  });

  it('replaces whole lists and overrides contacts and sections', () => {
    const merged = mergeSiteContent({
      lists: { who: [{ title: { uz: 'Dorixona' } }] } as never,
      contact: { phone: '+998 90 000 00 00' } as never,
      sections: { faq: false } as never
    });
    expect(merged.lists.who).toEqual([{ title: { uz: 'Dorixona' } }]);
    expect(merged.lists.faq).toEqual(SITE_DEFAULTS.lists.faq);
    expect(merged.contact.phone).toBe('+998 90 000 00 00');
    expect(merged.contact.telegram).toBe(SITE_DEFAULTS.contact.telegram);
    expect(merged.sections.faq).toBe(false);
    expect(merged.sections.how).toBe(true);
  });

  it('serializes without metadata', () => {
    const data = serializeSiteContent({ ...mergeSiteContent(null), updatedAt: new Date(), updatedBy: 'x' });
    expect(Object.keys(data).sort()).toEqual(['contact', 'lists', 'sections', 'texts']);
  });
});
