import { getServerUrl } from './collab';
import { isCompanyEmail, MOCK_EMAILS, COMPANY_EMAIL_DOMAINS } from '../config/mockEmailDirectory';

// Re-export for convenience
export { isCompanyEmail, COMPANY_EMAIL_DOMAINS };

/**
 * Normalize text for fuzzy search - strips diacritics and folds Danish chars
 * @param {string} raw - Raw input text
 * @returns {string} Normalized lowercase text
 */
export function normalizeForSearch(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  // Strip accents/diacritics, plus Danish-friendly folding.
  const folded = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'aa');
  return folded;
}

export function fuzzyIncludes(haystack, needle) {
  const h = normalizeForSearch(haystack);
  const n = normalizeForSearch(needle);
  if (!n) return true;
  return h.includes(n);
}

export function extractMentionEmailsFromMarkup(text) {
  const t = String(text || '');
  // Matches react-mentions default markup: @[display](id)
  const emails = [];
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(t))) {
    const id = String(m[2] || '').trim();
    if (id) emails.push(id);
  }
  return emails;
}

export function extractRawAtEmailTokens(text) {
  const t = String(text || '');
  // Allow unicode letters in local-part (POC), plus dots, plus, dash, underscore.
  const re = /@([\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,})/gu;
  const emails = [];
  let m;
  while ((m = re.exec(t))) {
    const e = String(m[1] || '').trim();
    if (e) emails.push(e);
  }
  return emails;
}

export function dedupeStrings(items) {
  const seen = new Set();
  const out = [];
  (items || []).forEach((x) => {
    const v = String(x || '').trim();
    const key = v.toLowerCase();
    if (!v) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  });
  return out;
}

export async function fetchEmailSuggestionsPOC(query, { limit = 10 } = {}) {
  const q = String(query || '').trim();
  const url = `${getServerUrl()}/api/suggest-emails?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}`;

  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items = Array.isArray(json?.items) ? json.items : [];
    return items;
  } catch (_) {
    // Fallback to local list (useful when server isn't running).
    return (MOCK_EMAILS || [])
      .filter((e) => isCompanyEmail(e) && fuzzyIncludes(e, q))
      .slice(0, limit)
      .map((email) => ({ id: email, display: email }));
  }
}
