import nspell from 'nspell';
import daAffUrl from '../assets/dictionaries/da/da.aff';
import daDicUrl from '../assets/dictionaries/da/da.dic';

/** @type {Promise<nspell>|null} */
let danishSpellcheckerPromise = null;

/**
 * Lazy-load the Danish spellchecker singleton
 * @returns {Promise<nspell>} The spellchecker instance
 */
export function getDanishSpellchecker() {
  if (danishSpellcheckerPromise) return danishSpellcheckerPromise;

  danishSpellcheckerPromise = Promise.all([
    fetch(daAffUrl).then((r) => {
      if (!r.ok) throw new Error('Kunne ikke hente dansk .aff');
      return r.text();
    }),
    fetch(daDicUrl).then((r) => {
      if (!r.ok) throw new Error('Kunne ikke hente dansk .dic');
      return r.text();
    }),
  ]).then(([aff, dic]) => nspell(aff, dic));

  return danishSpellcheckerPromise;
}

/** Unicode-aware word matching regex */
const WORD_RE = /[\p{L}][\p{L}\p{M}''-]*/gu;

/**
 * Find misspelled words in text synchronously
 * @param {nspell} spellchecker - The spellchecker instance
 * @param {string} text - Text to check
 * @returns {Array<{word: string, index: number, length: number}>} Array of misspellings
 */
export function findMisspellingsSync(spellchecker, text) {
  const value = String(text || '');
  const spell = spellchecker;
  if (!spell) return [];

  const results = [];
  let match;

  WORD_RE.lastIndex = 0;
  while ((match = WORD_RE.exec(value)) !== null) {
    const word = match[0];

    if (!word) continue;
    if (word.length <= 1) continue;
    if (/\d/.test(word)) continue;

    const normalized = word.replace(/’/g, "'");
    if (!spell.correct(normalized)) {
      results.push({ word, index: match.index, length: word.length });
    }
  }

  return results;
}

export function buildContextPreview(text, misspelling, context = 22) {
  const value = String(text || '');
  const start = Math.max(0, (misspelling?.index ?? 0) - context);
  const end = Math.min(value.length, (misspelling?.index ?? 0) + (misspelling?.length ?? 0) + context);

  const raw = value.slice(start, end).replace(/\s+/g, ' ').trim();
  const prefix = start > 0 ? '…' : '';
  const suffix = end < value.length ? '…' : '';
  return `${prefix}${raw}${suffix}`;
}
