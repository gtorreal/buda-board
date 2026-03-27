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

/**
 * All financial-looking numbers on a line (left-to-right order).
 * Uses whitespace-separated tokens so multicolumn rows like "Total 100 5000" yield two values
 * (a single regex across the line was merging those into one invalid token).
 * @param {string} line
 * @returns {number[]}
 */
function extractAllNumbersFromLine(line) {
  if (line == null || typeof line !== 'string') return [];
  const out = [];
  const tokens = line.trim().split(/\s+/);
  for (let raw of tokens) {
    raw = raw.replace(/^[\[\]'"«»]+|[\[\]'"«»]+$/g, '').trim();
    if (!raw) continue;
    const n = parseFinancialNumber(raw);
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
/**
 * log10(|x|) for picking comparable magnitudes; null if not finite.
 * @param {number} x
 * @returns {number|null}
 */
function log10Abs(x) {
  if (x == null || typeof x !== 'number' || Number.isNaN(x) || x === 0) return null;
  return Math.log10(Math.abs(x));
}

/**
 * When a line has several numbers (multicolumn PDFs), pick the one closest in magnitude to the document scale.
 * @param {number[]} nums
 * @param {number|null} targetLog - median log10(|.|) of reference amounts
 * @returns {number|null}
 */
function pickFinancialNumberPreferScale(nums, targetLog) {
  if (!nums || nums.length === 0) return null;
  if (targetLog == null || Number.isNaN(targetLog) || nums.length === 1) {
    return nums.length >= 2 ? nums[nums.length - 1] : nums[0];
  }
  let best = nums[0];
  let bestDist = Infinity;
  for (const n of nums) {
    const lg = log10Abs(n);
    if (lg == null) continue;
    const d = Math.abs(lg - targetLog);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return best;
}

function pickFinancialNumberFromLine(line) {
  const nums = extractAllNumbersFromLine(line);
  if (nums.length === 0) return null;
  if (nums.length >= 2) return nums[nums.length - 1];
  return nums[0];
}

/**
 * Same as pickFinancialNumberFromLine when targetLog is null; otherwise disambiguates multicolumn lines.
 * @param {string} line
 * @param {number|null} targetLog
 * @returns {number|null}
 */
function pickFinancialNumberFromLineWithScale(line, targetLog) {
  const nums = extractAllNumbersFromLine(line);
  if (nums.length === 0) return null;
  return pickFinancialNumberPreferScale(nums, targetLog);
}

/**
 * Map two numeric columns to fiscal years (left → order[0], right → order[1]).
 * When more than two numbers exist, uses the last two (typical note + two fiscal columns).
 * @param {number[]} nums
 * @param {number} fiscalYear
 * @param {[number, number]} orderTwoYears
 * @returns {number|null}
 */
function pickFinancialNumberForComparative(nums, fiscalYear, orderTwoYears) {
  if (!nums || nums.length < 2 || !orderTwoYears || orderTwoYears.length !== 2) return null;
  const fy = Number(fiscalYear);
  if (!Number.isFinite(fy)) return null;
  const idxYear = orderTwoYears.indexOf(fy);
  if (idxYear < 0 || idxYear > 1) return null;

  let col0;
  let col1;
  if (nums.length === 2) {
    col0 = nums[0];
    col1 = nums[1];
  } else {
    col0 = nums[nums.length - 2];
    col1 = nums[nums.length - 1];
  }
  return idxYear === 0 ? col0 : col1;
}

/**
 * @param {string} line
 * @param {number|null} scaleLog
 * @param {{ fiscalYear?: number, comparativeYears?: { order: [number, number] } } | null} ctx
 */
function pickFinancialNumberFromLineWithContext(line, scaleLog, ctx) {
  const nums = extractAllNumbersFromLine(line);
  if (nums.length === 0) return null;
  const fy = ctx && ctx.fiscalYear != null ? Number(ctx.fiscalYear) : null;
  const comp = ctx && ctx.comparativeYears && ctx.comparativeYears.order;
  if (comp && comp.length === 2 && fy != null && Number.isFinite(fy)) {
    const byYear = pickFinancialNumberForComparative(nums, fy, comp);
    if (byYear != null) return byYear;
  }
  return pickFinancialNumberPreferScale(nums, scaleLog);
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
  pickFinancialNumberPreferScale,
  pickFinancialNumberFromLineWithScale,
  pickFinancialNumberForComparative,
  pickFinancialNumberFromLineWithContext,
  log10Abs,
};
