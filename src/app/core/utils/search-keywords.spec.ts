import { describe, expect, it } from 'vitest';
import { findSynonyms, mergeKeywordsInput, suggestSearchKeywords } from './search-keywords';

describe('suggestSearchKeywords', () => {
  it('adds the Cyrillic spelling and synonyms of a Latin name', () => {
    const keywords = suggestSearchKeywords('Quvur PPR 20mm');
    expect(keywords[0]).toBe('қувур ппр 20мм');
    expect(keywords).toContain('truba');
    expect(keywords).toContain('труба');
    expect(keywords).toContain('polipropilen');
    expect(keywords).not.toContain('quvur');
  });

  it('finds synonyms for a Russian Cyrillic name and stems', () => {
    expect(findSynonyms('Цемент М400')).toContain('sement');
    expect(findSynonyms('Trubalar 50')).toContain('quvur');
  });

  it('returns the Latin spelling for a Cyrillic name', () => {
    expect(suggestSearchKeywords('Ғишт')[0]).toBe("g'isht");
  });

  it('returns nothing for an empty name', () => {
    expect(suggestSearchKeywords('  ')).toEqual([]);
  });
});

describe('mergeKeywordsInput', () => {
  it('appends only new keywords', () => {
    expect(mergeKeywordsInput('truba, quvur', ['Truba', 'shlang'])).toBe('truba, quvur, shlang');
  });
});
