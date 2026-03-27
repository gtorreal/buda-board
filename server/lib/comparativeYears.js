'use strict';

/**
 * Detect two fiscal years in column headers (comparative statements), left-to-right order.
 * @param {string} text - raw PDF text (typically start of document)
 * @param {number} [maxLines=120]
 * @returns {{ order: [number, number], linePreview: string } | null}
 */
function detectComparativeYearColumns(text, maxLines = 120) {
  if (text == null || typeof text !== 'string') return null;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, maxLines);
  const re = /\b(20[0-9]{2})\b/g;
  for (const line of lines) {
    if (line.length > 500) continue;
    const yearsInOrder = [];
    const found = line.matchAll(re);
    for (const m of found) {
      const y = parseInt(m[1], 10);
      if (y < 1990 || y > 2099) continue;
      if (!yearsInOrder.includes(y)) yearsInOrder.push(y);
      if (yearsInOrder.length > 2) break;
    }
    if (yearsInOrder.length === 2) {
      return { order: [yearsInOrder[0], yearsInOrder[1]], linePreview: line.slice(0, 160) };
    }
  }
  return null;
}

module.exports = { detectComparativeYearColumns };
