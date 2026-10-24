import { normalizeForSearch, toCyrillic, toLatin } from './uzbek-transliteration';

/**
 * Builds the "search keywords" for a product automatically from its name, so staff don't
 * have to type synonyms by hand:
 *  - the name in the other script (Latin -> Cyrillic, Cyrillic -> Latin);
 *  - synonyms from SYNONYM_GROUPS for every word of the name (Uzbek, Russian loanwords
 *    and the colloquial words shop staff actually use), each in Latin and Cyrillic.
 *
 * Every group is written in normalized Uzbek Latin (what `normalizeForSearch` produces),
 * so "труба", "Truba" and "trubalar" all hit the same group.
 */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['quvur', 'truba', 'trubka'],
  ['shlang', 'rukav', 'shlank'],
  ['sement', 'tsement', 'portlandsement'],
  ["g'isht", 'kirpich', 'blok'],
  ['gazoblok', 'gazobeton', 'penoblok'],
  ["bo'yoq", 'kraska', 'emal'],
  ['lak', 'lok'],
  ['mix', 'gvozd'],
  ['shurup', 'samorez', 'vint'],
  ['bolt', 'vint'],
  ['gayka', 'gaika'],
  ['shayba', 'podkladka'],
  ['dyubel', 'dubel'],
  ['kabel', 'sim', 'provod', 'elektr sim'],
  ['rozetka', 'razetka'],
  ["o'chirgich", 'vyklyuchatel', 'viklyuchatel', 'knopka'],
  ['lampochka', 'lampa', 'chiroq', 'svetilnik'],
  ['avtomat', 'avtomatik o\'chirgich', 'predohranitel'],
  ['izolenta', 'izolyatsiya lentasi'],
  ['skotch', 'lenta'],
  ["jo'mrak", 'kran', 'smesitel'],
  ['sharovoy kran', 'sharli kran'],
  ['burchak', 'ugolnik', 'ugol', 'koleno'],
  ['troynik', 'uchlik'],
  ['mufta', 'ulagich'],
  ['fiting', 'fitting', 'ulagich'],
  ['polipropilen', 'ppr', 'propilen'],
  ['metalloplast', 'metaloplast'],
  ['kanalizatsiya', 'kanalizatsion quvur', 'kanal truba'],
  ['rakovina', 'chanoq', "qo'l yuvgich", 'umivalnik'],
  ['unitaz', 'hojatxona'],
  ['vanna', 'chomilish vannasi'],
  ['dush', 'dushevoy'],
  ['radiator', 'batareya', 'isitgich'],
  ['kotel', 'qozon', 'isitish qozoni'],
  ['suv isitgich', 'vodonagrevatel', 'boyler', 'kolonka'],
  ['nasos', 'pompa'],
  ['plitka', 'kafel', 'keramika'],
  ['kafel yelimi', 'plitka kleyi', 'kley dlya plitki'],
  ['yelim', 'kley', 'klei'],
  ['germetik', 'silikon', 'sealant'],
  ["montaj ko'pigi", 'pena', 'montajnaya pena', "ko'pik"],
  ['penoplast', 'polistirol', "ko'pik plast"],
  ['shpaklyovka', 'shpatlyovka', 'shpaklevka', 'shpatlevka'],
  ['gips', 'alebastr', 'ganch'],
  ['shtukaturka', 'suvoq', 'suvash'],
  ['gipsokarton', 'gkl', 'drywall'],
  ['profil', 'profl'],
  ['armatura', 'armatur', 'temir'],
  ['setka', "to'r", 'setka rabitsa'],
  ['sim', 'provoloka'],
  ['tunuka', 'profnastil', 'list temir'],
  ['shifer', 'shifr'],
  ['cherepitsa', 'chirepitsa', 'tom yopma'],
  ['qum', 'pesok'],
  ["shag'al", 'sheben', 'graviy'],
  ['ohak', 'izvest'],
  ['beton', 'qorishma', 'rastvor'],
  ["yog'och", 'taxta', 'doska', 'brus'],
  ['fanera', 'faner'],
  ['dsp', 'ldsp', 'dvp', 'mdf'],
  ['osb', 'osb plita'],
  ['laminat', 'laminant', 'pol'],
  ['linoleum', 'linolium'],
  ['oboy', 'gulqog\'oz', 'obboy'],
  ['eshik', 'dver'],
  ['deraza', 'oyna', 'okno'],
  ['shisha', 'steklo', 'oyna'],
  ['qulf', 'zamok'],
  ['dastak', 'ruchka'],
  ['petlya', 'oshiq-moshiq', 'sharnir'],
  ['drel', 'parma'],
  ['perforator', 'perfarator'],
  ['bolgarka', 'jilvir', 'ushm'],
  ['arra', 'pila', 'nojovka'],
  ["bolg'a", 'molotok'],
  ['otvertka', 'burama', 'atvyortka'],
  ['ruletka', 'rulet', "o'lchagich"],
  ['sath', 'uroven', 'shovun'],
  ['mastyorok', 'kelma', 'shpatel'],
  ['kist', "mo'yqalam", "cho'tka"],
  ['valik', 'rolik'],
  ['qo\'lqop', 'perchatka'],
  ['zubilo', 'iskana'],
  ['disk', 'krug', 'diska'],
  ['elektrod', 'svarka elektrodi'],
  ['svarka', 'payvand', 'payvandlash'],
  ['zanjir', 'sep', 'tsep'],
  ['arqon', 'kanat', 'verevka'],
  ['chelak', 'vedro'],
  ['zina', 'narvon', 'lestnitsa', 'stremyanka']
];

/** Words of the name that the dictionary lookup ignores: too short to mean anything. */
const MIN_WORD = 2;

/** Splits a normalized name into words, keeping the Uzbek apostrophe (o', g'). */
function words(normalized: string): string[] {
  return normalized.split(/[^a-z0-9']+/).map((w) => w.replace(/^'+|'+$/g, '')).filter((w) => w.length >= MIN_WORD);
}

/** A group term matches when it is a whole word of the name, a stem of one
 *  ("quvur" in "quvurlar"), or a multi-word phrase inside the name. */
function termMatches(term: string, nameWords: string[], normalizedName: string): boolean {
  if (term.includes(' ')) return normalizedName.includes(term);
  return nameWords.some((w) => w === term || (term.length >= 4 && w.startsWith(term)));
}

function isCyrillic(text: string): boolean {
  return /[Ѐ-ӿ]/.test(text);
}

/** Synonyms of the words in `name` (normalized Latin), not including the words already in it. */
export function findSynonyms(name: string): string[] {
  const normalizedName = normalizeForSearch(name);
  const nameWords = words(normalizedName);
  const found = new Set<string>();
  for (const group of SYNONYM_GROUPS) {
    if (!group.some((term) => termMatches(term, nameWords, normalizedName))) continue;
    for (const term of group) {
      if (!termMatches(term, nameWords, normalizedName)) found.add(term);
    }
  }
  return [...found];
}

/** Keywords suggested for a product name: the other-script spelling and the synonyms,
 *  each synonym in Latin and Cyrillic. Lowercase, de-duplicated, in a stable order. */
export function suggestSearchKeywords(name: string, limit = 16): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const result: string[] = [];
  const seen = new Set<string>([trimmed.toLowerCase()]);
  const add = (keyword: string) => {
    const k = keyword.trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      result.push(k);
    }
  };
  add(isCyrillic(trimmed) ? toLatin(trimmed) : toCyrillic(trimmed));
  for (const synonym of findSynonyms(trimmed)) {
    add(synonym);
    add(toCyrillic(synonym));
  }
  return result.slice(0, limit);
}

/** "a, b, c" text input -> keyword list (trimmed, empty entries dropped). */
export function parseKeywordsInput(input: string): string[] {
  return input.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
}

/** Adds `extra` keywords to a comma-separated input, skipping ones already in it. */
export function mergeKeywordsInput(input: string, extra: readonly string[]): string {
  const current = parseKeywordsInput(input);
  const seen = new Set(current.map((k) => k.toLowerCase()));
  for (const keyword of extra) {
    if (seen.has(keyword.toLowerCase())) continue;
    seen.add(keyword.toLowerCase());
    current.push(keyword);
  }
  return current.join(', ');
}
