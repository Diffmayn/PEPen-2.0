/**
 * Føtex Principles v11 (Nov 2025) — minimal, code-friendly model.
 * Note: the PDF describes silhouettes, not rigid templates.
 * 
 * @module utils/principles
 */

/** Textile purchasing group codes */
const TEXTILE_PURCHASING_GROUPS = new Set(['800', '820', '860']);

/**
 * Valid variant letters for each principle group
 * @type {Readonly<Record<string, string[]>>}
 */
export const PRINCIPLE_VARIANTS = Object.freeze({
  '1': ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  '2': ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's'],
  // PDF shows 3a-3h plus special "3h. 9 products"; keep a-h.
  '3': ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  '4': ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
  '5': ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'],
});

/**
 * Get all principle options for dropdown selection
 * @returns {Array<{id: string, label: string}>} Array of principle options
 */
export function listPrincipleOptions() {
  const out = [{ id: '', label: 'Auto (anbefalet)' }];
  for (const [group, variants] of Object.entries(PRINCIPLE_VARIANTS)) {
    for (const v of variants) {
      const id = `${group}${v}`;
      out.push({ id, label: formatPrincipleLabel(id) });
    }
  }
  return out;
}

/**
 * Format a principle ID into a human-readable Danish label
 * @param {string} id - Principle ID (e.g., "1a", "2b")
 * @returns {string} Formatted label
 */
export function formatPrincipleLabel(id) {
  const v = String(id || '').trim();
  if (!v) return 'Auto (anbefalet)';
  const m = v.match(/^([1-5])([a-z])$/i);
  if (!m) return `Princip ${v}`;
  const group = m[1];
  const variant = m[2].toLowerCase();

  const groupLabel =
    group === '1'
      ? 'Front/bagside'
      : group === '2'
        ? 'Opslag m/baggrund'
        : group === '3'
          ? 'Opslag m/klip'
          : group === '4'
            ? 'Tekstil'
            : 'Single side';

  return `Princip #${group}${variant} · ${groupLabel}`;
}

/**
 * Check if an offer belongs to a textile purchasing group
 * @param {Object} offer - Offer object with purchasingGroup property
 * @returns {boolean} True if textile offer
 */
export function isTextileOffer(offer) {
  const pg = String(offer?.purchasingGroup || '').trim();
  if (!pg) return false;
  return TEXTILE_PURCHASING_GROUPS.has(pg);
}

export function isTextilePage(area) {
  const blocks = Array.isArray(area?.blocks) ? area.blocks : [];
  const offers = blocks.map((b) => b?.offer).filter(Boolean);
  if (!offers.length) return false;
  return offers.every(isTextileOffer);
}

/**
 * Automatically determine the best principle for an area based on its characteristics
 * @param {Object} params - Parameters object
 * @param {Object} params.area - Area object with blocks
 * @param {number} params.areaIndex - Zero-based area/page index
 * @param {number} params.totalPages - Total number of pages
 * @returns {string} Recommended principle ID or empty string
 */
export function getAutoPrincipleForArea({ area, areaIndex, totalPages }) {
  if (!area) return '';

  const idx = typeof areaIndex === 'number' ? areaIndex : null;
  const last = typeof totalPages === 'number' && totalPages > 0 ? totalPages - 1 : null;

  if (idx != null && (idx === 0 || (last != null && idx === last))) {
    return '1a';
  }

  if (isTextilePage(area)) {
    return '4a';
  }

  return '';
}

/**
 * Parse a priority value from various formats to a number
 * @param {*} v - Priority value (string, number, etc.)
 * @returns {number} Parsed priority (lower = higher priority, 999 = default)
 */
function parsePriorityValue(v) {
  const s = String(v ?? '').trim();
  if (!s) return 999;
  const m = s.match(/\d+/);
  const n = m ? Number.parseInt(m[0], 10) : Number.NaN;
  if (!Number.isFinite(n)) return 999;
  return n;
}

/**
 * Generate a stable key for a block based on its ID or index
 * @param {Object} block - Block object
 * @param {number} blockIndex - Block index in the array
 * @returns {string} Stable key for the block
 */
function stableBlockKey(block, blockIndex) {
  const id = String(block?.blockId || '').trim();
  return id ? id : `idx-${blockIndex}`;
}

/**
 * Validate if a principle selection is appropriate for the given context
 * @param {Object} params - Parameters object
 * @param {string} params.principleId - Selected principle ID
 * @param {Object} params.area - Area object
 * @param {number} params.areaIndex - Page index
 * @param {number} params.totalPages - Total pages
 * @param {string} params.viewMode - Current view mode
 * @returns {string|null} Warning message or null if valid
 */
export function validatePrincipleSelection({ principleId, area, areaIndex, totalPages, viewMode }) {
  const id = String(principleId || '').trim();
  if (!id) return null;

  const m = id.match(/^([1-5])[a-z]$/i);
  const group = m ? m[1] : null;
  if (!group) return null;

  if (group === '4' && !isTextilePage(area)) {
    return 'Princip #4 er kun til tekstilsider.';
  }

  if (group === '1') {
    const idx = typeof areaIndex === 'number' ? areaIndex : null;
    const last = typeof totalPages === 'number' && totalPages > 0 ? totalPages - 1 : null;
    if (idx == null) return null;
    if (!(idx === 0 || (last != null && idx === last))) {
      return 'Princip #1 er beregnet til for- og bagside.';
    }
  }

  if ((group === '2' || group === '3') && viewMode !== 'spread') {
    return 'Princip #2/#3 er beregnet til opslag (dobbelt-side).' ;
  }

  if (group === '5') {
    const blocks = Array.isArray(area?.blocks) ? area.blocks : [];
    const offers = blocks.map((b) => b?.offer).filter(Boolean);
    const hasPrices = offers.some((o) => String(o?.price || '').trim() || String(o?.normalPrice || '').trim());
    if (hasPrices) {
      return 'Princip #5 anbefales til materiale uden produkter/priser.';
    }
  }

  return null;
}

function computeSizesForPrinciple({ group, offerKeysOrdered, prioritiesByKey }) {
  const sizes = {};
  const keys = offerKeysOrdered.slice();

  // Default: keep standard; apply a small emphasis curve.
  // Priority: lower number => more emphasis.
  const byPriority = keys
    .map((k) => ({ k, p: prioritiesByKey.get(k) ?? 999 }))
    .sort((a, b) => a.p - b.p);

  const top1 = byPriority[0]?.k;
  const top2 = byPriority[1]?.k;
  const top3 = byPriority[2]?.k;

  // Keep it conservative so it doesn't fight the manual editor.
  if (group === '1') {
    if (top1) sizes[top1] = 'full';
    if (top2) sizes[top2] = 'half';
    if (top3) sizes[top3] = 'half';
    return sizes;
  }

  if (group === '2' || group === '3') {
    if (top1) sizes[top1] = 'full';
    if (top2) sizes[top2] = 'half';
    return sizes;
  }

  if (group === '4') {
    if (top1) sizes[top1] = 'half';
    return sizes;
  }

  // #5: no strong guidance here in the tool yet.
  return sizes;
}

export function applyPrincipleToArea({ area, principleId }) {
  const id = String(principleId || '').trim();
  const m = id.match(/^([1-5])[a-z]$/i);
  const group = m ? m[1] : null;

  const blocks = Array.isArray(area?.blocks) ? area.blocks : [];
  const keyed = blocks.map((block, blockIndex) => ({
    key: stableBlockKey(block, blockIndex),
    block,
  }));

  // Order offers by priority (1 highest). Keep placeholders at the end.
  const offerItems = keyed.filter((x) => !!x.block?.offer);
  const emptyItems = keyed.filter((x) => !x.block?.offer);

  const prioritiesByKey = new Map(
    offerItems.map((x) => [x.key, parsePriorityValue(x.block?.priority)])
  );

  offerItems.sort((a, b) => {
    const pa = parsePriorityValue(a.block?.priority);
    const pb = parsePriorityValue(b.block?.priority);
    if (pa !== pb) return pa - pb;
    return String(a.key).localeCompare(String(b.key));
  });

  const nextOrder = [...offerItems.map((x) => x.key), ...emptyItems.map((x) => x.key)];
  const sizes = computeSizesForPrinciple({
    group,
    offerKeysOrdered: offerItems.map((x) => x.key),
    prioritiesByKey,
  });

  return {
    order: nextOrder,
    sizes,
    principle: id ? { id } : null,
  };
}
