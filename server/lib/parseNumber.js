'use strict';

/**
 * Parse a numeric string from financial statements (CL/US/EU conventions).
 * @param {string} raw
 * @returns {number|null}
 */
function parseFinancialNumber(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  let s = raw.replace(/\u00a0/g, ' ').trim();
  if (!s) return null;

  const negative = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/^\(|\)$/g, '').replace(/^-/, '');

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized = s.replace(/\s/g, '');

  if (lastComma > lastDot && lastComma !== -1) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastDot !== -1) {
    const afterDot = normalized.slice(lastDot + 1);
    if (afterDot.length === 3 && !/[,]/.test(normalized)) {
      normalized = normalized.replace(/\./g, '');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else {
    normalized = normalized.replace(/,/g, '');
  }

  const n = parseFloat(normalized);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

const NUMBER_TOKEN_RE = /(-?\(?[\d\s.,]+(?:\([\d\s.,]+\))?)/g;

/**
 * All financial-looking numbers on a line (left-to-right order).
 * @param {string} line
 * @returns {number[]}
 */
function extractAllNumbersFromLine(line) {
  if (line == null || typeof line !== 'string') return [];
  const out = [];
  let m;
  NUMBER_TOKEN_RE.lastIndex = 0;
  while ((m = NUMBER_TOKEN_RE.exec(line)) !== null) {
    let token = m[1].replace(/\s/g, '');
    if (token.includes('(') && token.includes(')')) {
      token = '(' + token.replace(/[()]/g, '') + ')';
    }
    const n = parseFinancialNumber(token);
    if (n != null && !Number.isNaN(n)) out.push(n);
  }
  return out;
}

/**
 * Pick one number from a line. In multicolumn statements (e.g. prior year | current year),
 * the last number is often the current period — prefer it when several values exist.
 * @param {string} line
 * @returns {number|null}
 */
function pickFinancialNumberFromLine(line) {
  const nums = extractAllNumbersFromLine(line);
  if (nums.length === 0) return null;
  if (nums.length >= 2) return nums[nums.length - 1];
  return nums[0];
}

/**
 * Find first number in a line after optional label (uses multicolumn heuristic).
 * @param {string} line
 * @returns {number|null}
 */
function extractNumberFromLine(line) {
  return pickFinancialNumberFromLine(line);
}

module.exports = {
  parseFinancialNumber,
  extractNumberFromLine,
  extractAllNumbersFromLine,
  pickFinancialNumberFromLine,
};
