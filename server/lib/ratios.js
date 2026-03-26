'use strict';

/**
 * @typedef {object} NormalizedBundle
 * @property {object} balanceSheet
 * @property {object} incomeStatement
 */

/**
 * @typedef {object} RatioPack
 * @property {number|null} currentRatio
 * @property {number|null} debtToEquity
 * @property {number|null} debtToAssets
 * @property {number|null} equityRatio
 * @property {number|null} netMargin
 * @property {number|null} roa
 * @property {number|null} roe
 */

/**
 * @param {object} n - normalized single year
 * @returns {RatioPack}
 */
function computeRatios(n) {
  const bs = n.balanceSheet || {};
  const is = n.incomeStatement || {};
  const ta = bs.totalAssets;
  const tl = bs.totalLiabilities;
  const eq = bs.equity;
  const ca = bs.currentAssets;
  const cl = bs.currentLiabilities;
  const ni = is.netIncome;
  const rev = is.revenue;

  let currentRatio = null;
  if (ca != null && cl != null && cl !== 0) currentRatio = ca / cl;

  let debtToEquity = null;
  if (tl != null && eq != null && eq !== 0) debtToEquity = tl / eq;

  let debtToAssets = null;
  if (tl != null && ta != null && ta !== 0) debtToAssets = tl / ta;

  let equityRatio = null;
  if (eq != null && ta != null && ta !== 0) equityRatio = eq / ta;

  let netMargin = null;
  if (ni != null && rev != null && rev !== 0) netMargin = ni / rev;

  let roa = null;
  if (ni != null && ta != null && ta !== 0) roa = ni / ta;

  let roe = null;
  if (ni != null && eq != null && eq !== 0) roe = ni / eq;

  return {
    currentRatio,
    debtToEquity,
    debtToAssets,
    equityRatio,
    netMargin,
    roa,
    roe,
  };
}

/**
 * Year-over-year deltas for scalar fields in normalized objects.
 * @param {object} prev
 * @param {object} curr
 * @returns {object}
 */
function yoyDeltas(prev, curr) {
  const out = { balanceSheet: {}, incomeStatement: {}, cashFlow: {} };
  for (const section of ['balanceSheet', 'incomeStatement', 'cashFlow']) {
    const a = prev[section] || {};
    const b = curr[section] || {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const x = a[k];
      const y = b[k];
      if (typeof x === 'number' && typeof y === 'number') {
        const delta = y - x;
        const pct = x !== 0 ? delta / Math.abs(x) : null;
        out[section][k] = { previous: x, current: y, delta, pctChange: pct };
      }
    }
  }
  return out;
}

/**
 * @param {Array<{ fiscalYear: number, normalized: object, ratios: object }>} series - sorted by year ascending
 * @returns {object}
 */
function trendSummary(series) {
  if (!series.length) return { years: [], metrics: {} };
  const years = series.map((s) => s.fiscalYear);
  const metrics = {
    totalAssets: series.map((s) => s.normalized.balanceSheet && s.normalized.balanceSheet.totalAssets),
    equity: series.map((s) => s.normalized.balanceSheet && s.normalized.balanceSheet.equity),
    netIncome: series.map((s) => s.normalized.incomeStatement && s.normalized.incomeStatement.netIncome),
    netMargin: series.map((s) => s.ratios && s.ratios.netMargin),
    roe: series.map((s) => s.ratios && s.ratios.roe),
  };
  return { years, metrics };
}

module.exports = {
  computeRatios,
  yoyDeltas,
  trendSummary,
};
