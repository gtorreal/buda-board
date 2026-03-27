'use strict';

const DEFAULT_DELTA_LOG10 = 2.25;

function getDeltaThreshold() {
  const n = Number(process.env.EEFF_YOY_LOG10_THRESHOLD);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DELTA_LOG10;
}

function metricAtPath(obj, path) {
  let v = obj;
  for (const p of path) {
    v = v && v[p];
  }
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Warn when key magnitudes jump >10^threshold vs prior-year normalized bundle (same entity).
 * @param {object} currentNorm
 * @param {object} prevNorm
 * @param {string|number} prevYearLabel
 * @returns {string[]}
 */
function computeYearOverYearPlausibilityWarnings(currentNorm, prevNorm, prevYearLabel) {
  if (!currentNorm || !prevNorm) return [];
  const threshold = getDeltaThreshold();
  const label = String(prevYearLabel);
  const keys = [
    { path: ['incomeStatement', 'revenue'], name: 'ingresos' },
    { path: ['balanceSheet', 'totalAssets'], name: 'activos totales' },
    { path: ['incomeStatement', 'netIncome'], name: 'utilidad del ejercicio' },
  ];
  const warnings = [];
  for (const k of keys) {
    const a = metricAtPath(currentNorm, k.path);
    const b = metricAtPath(prevNorm, k.path);
    if (a == null || b == null || a === 0 || b === 0) continue;
    const la = Math.log10(Math.abs(a));
    const lb = Math.log10(Math.abs(b));
    if (!Number.isFinite(la) || !Number.isFinite(lb)) continue;
    if (Math.abs(la - lb) > threshold) {
      warnings.push(
        `Variación extrema en ${k.name} vs ejercicio ${label} (orden de magnitud); revisa columnas o unidad de cifras.`,
      );
    }
  }
  return warnings;
}

module.exports = { computeYearOverYearPlausibilityWarnings, getDeltaThreshold };
