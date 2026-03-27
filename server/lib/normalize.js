'use strict';

const {
  parseFinancialNumber,
  pickFinancialNumberFromLineWithContext,
} = require('./parseNumber');
const { computeRatios } = require('./ratios');
const { detectComparativeYearColumns } = require('./comparativeYears');

/**
 * @typedef {import('./ratios').NormalizedFinancials} NormalizedFinancials
 */

const LABEL_RULES = [
  { field: 'balanceSheet.totalAssets', patterns: [
    /total\s+de\s+los\s+activos/i,
    /total\s+activos?\b/i,
    /activos?\s+totales?\b/i,
    /suma\s+de\s+los\s+activos/i,
    /activos?\s+totales?\s+netos?/i,
    /total\s+general\s+(del\s+)?activos?/i,
    /suma\s+(del\s+)?activos?/i,
    /^total\s+activos?\s*$/im,
  ]},
  { field: 'balanceSheet.currentAssets', patterns: [
    /activos?\s+corrientes?\b/i,
    /activo\s+circulante/i,
    /activos?\s+liquidos?\s+y\s+corrientes?/i,
  ]},
  { field: 'balanceSheet.nonCurrentAssets', patterns: [
    /activos?\s+no\s+corrientes?\b/i,
    /activo\s+fijo/i,
    /activos?\s+no\s+circulantes?/i,
  ]},
  { field: 'balanceSheet.totalLiabilities', patterns: [
    /total\s+de\s+los\s+pasivos/i,
    /total\s+pasivos?\b/i,
    /pasivos?\s+totales?\b/i,
    /suma\s+de\s+los\s+pasivos/i,
  ]},
  { field: 'balanceSheet.currentLiabilities', patterns: [
    /pasivos?\s+corrientes?\b/i,
    /pasivo\s+circulante/i,
    /pasivos?\s+liquidos?\s+y\s+corrientes?/i,
  ]},
  { field: 'balanceSheet.nonCurrentLiabilities', patterns: [
    /pasivos?\s+no\s+corrientes?\b/i,
    /pasivos?\s+no\s+circulantes?/i,
  ]},
  { field: 'balanceSheet.equity', patterns: [
    /patrimonio\s+atribuible/i,
    /patrimonio\s+neto/i,
    /patrimonio\s+neto\s+atribuible/i,
    /patrimonio\s+de\s+los\s+propietarios/i,
    /total\s+patrimonio/i,
    /total\s+patrimonios?\s+netos?/i,
    /patrimonio\s+total/i,
    /capital\s+y\s+reservas/i,
    /fondos?\s+propios/i,
  ]},
  { field: 'incomeStatement.revenue', patterns: [
    /ingresos?\s+ordinarios?\s+de\s+actividades?/i,
    /ingresos?\s+ordinarios?/i,
    /ingresos?\s+de\s+actividades?\s+ordinarias?/i,
    /ingresos?\s+por\s+servicios?/i,
    /total\s+ingresos?\s+operacionales?/i,
    /ingresos?\s+totales?\s+de\s+actividades?\s+ordinarias?/i,
    /ingresos?\s+totales?\b/i,
  ]},
  { field: 'incomeStatement.costOfSales', patterns: [
    /costo\s+de\s+ventas?/i,
    /costos?\s+operacionales?/i,
    /costo\s+de\s+los\s+ingresos?/i,
  ]},
  { field: 'incomeStatement.grossProfit', patterns: [
    /margen\s+bruto/i,
    /resultado\s+bruto/i,
  ]},
  { field: 'incomeStatement.operatingExpenses', patterns: [
    /gastos?\s+de\s+administraci[oó]n/i,
    /gastos?\s+operacionales?/i,
    /total\s+gastos?\s+operacionales?/i,
  ]},
  { field: 'incomeStatement.operatingIncome', patterns: [
    /resultado\s+operacional/i,
    /utilidad\s+operacional/i,
    /ebit\b/i,
    /resultado\s+por\s+operaci[oó]n/i,
  ]},
  { field: 'incomeStatement.financialResult', patterns: [
    /resultado\s+financiero/i,
    /gastos?\s+financieros?/i,
    /ingresos?\s+y\s+gastos?\s+financieros?/i,
  ]},
  { field: 'incomeStatement.incomeTax', patterns: [
    /impuesto\s+a\s+las?\s+rentas?/i,
    /impuesto\s+de\s+primera\s+categor[ií]a/i,
    /gasto\s+por\s+impuesto\s+a\s+las?\s+rentas?/i,
  ]},
  { field: 'incomeStatement.netIncome', patterns: [
    /utilidad\s*\(?\s*p[eé]rdida\s*\)?\s+del\s+ejercicio/i,
    /utilidad\s*\(?\s*p[eé]rdida\s*\)?\s+neta/i,
    /utilidad\s*\(?\s*p[eé]rdida\s*\)?\s+atribuible/i,
    /utilidad\s+atribuible/i,
    /utilidad\s+del\s+ejercicio/i,
    /resultado\s+del\s+ejercicio/i,
    /utilidad\s+neta/i,
    /ganancia\s+del\s+periodo/i,
    /resultado\s+neto\s+del\s+ejercicio/i,
    /resultado\s+neto\s+despu[eé]s\s+de\s+impuestos?/i,
    /\(p[eé]rdida\)\s*utilidad/i,
    /p[eé]rdida\s+del\s+ejercicio/i,
  ]},
  { field: 'cashFlow.operating', patterns: [
    /flujos?\s+de\s+efectivo\s+procedentes?\s+de\s+actividades?\s+operacionales?/i,
    /flujo\s+neto\s+de\s+efectivo\s+.*operacionales?/i,
    /actividades?\s+operacionales?.*flujo/i,
  ]},
  { field: 'cashFlow.investing', patterns: [
    /flujos?\s+de\s+efectivo\s+.*\s+inversi[oó]n/i,
    /actividades?\s+de\s+inversi[oó]n/i,
    /flujo\s+neto\s+.*\s+inversi[oó]n/i,
  ]},
  { field: 'cashFlow.financing', patterns: [
    /flujos?\s+de\s+efectivo\s+.*\s+financiamiento/i,
    /actividades?\s+de\s+financiamiento/i,
    /flujo\s+neto\s+.*\s+financiamiento/i,
  ]},
  { field: 'cashFlow.netChangeInCash', patterns: [
    /aumento\s*\(?disminuci[oó]n\)?\s+neto\s+del\s+efectivo/i,
    /variaci[oó]n\s+neta\s+del\s+efectivo/i,
    /incremento\s+neto\s+.*\s+efectivo/i,
  ]},
];

function emptyNormalized() {
  return {
    balanceSheet: {
      totalAssets: null,
      currentAssets: null,
      nonCurrentAssets: null,
      totalLiabilities: null,
      currentLiabilities: null,
      nonCurrentLiabilities: null,
      equity: null,
    },
    incomeStatement: {
      revenue: null,
      costOfSales: null,
      grossProfit: null,
      operatingExpenses: null,
      operatingIncome: null,
      financialResult: null,
      incomeTax: null,
      netIncome: null,
    },
    cashFlow: {
      operating: null,
      investing: null,
      financing: null,
      netChangeInCash: null,
    },
  };
}

function setField(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]]) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value != null && (cur[last] == null || cur[last] === null)) {
    cur[last] = value;
  }
}

/**
 * Heuristic extraction from plain PDF text (Spanish IFRS-style labels).
 * @param {string} text
 * @param {object} metaOverrides
 * @returns {object}
 */
/** ~min characters per page expected for a text-based (not scanned) PDF */
const MIN_CHARS_PER_PAGE_HINT = 100;

/** Lines that are only amounts must not act as label rows (avoids "123" + next line "Total activos" false matches). */
function isMostlyNumericLine(line) {
  const t = line.replace(/\s/g, '');
  return t.length > 0 && /^[\d.,()\-]+$/.test(t);
}

function lineMatchesRule(line, window2, rule) {
  const lo = line.toLowerCase();
  if (rule.patterns.some((re) => re.test(lo) || re.test(line))) return true;
  if (isMostlyNumericLine(line)) return false;
  // If this line already has amounts, do not match using the next line only — avoids
  // "Activos corrientes …" + next line "Total activos …" falsely matching totalAssets.
  if (/\d/.test(line)) return false;
  const w2 = window2.toLowerCase();
  return rule.patterns.some((re) => re.test(w2) || re.test(window2));
}

/**
 * Same-line amount first; if the label line has no number, use the next 1–2 lines
 * (common in audited PDFs: label wrapped or amount on the following line).
 * @param {string[]} lines
 * @param {number} i
 * @param {number|null} [scaleLog] median log10(|amount|) for multicolumn disambiguation
 */
function extractNumberNearLine(lines, i, scaleLog = null, pickCtx = null) {
  const pick = (s) => pickFinancialNumberFromLineWithContext(s, scaleLog, pickCtx);

  const line = lines[i] || '';
  let n = pick(line);
  if (n != null) return n;
  const next = lines[i + 1];
  const next2 = lines[i + 2];
  if (next) {
    const stripped = next.replace(/\s/g, '');
    const onlyAmount = stripped.length > 0 && /^[\d.,()\-]+$/.test(stripped);
    if (onlyAmount) {
      n = parseFinancialNumber(stripped);
      if (n != null) return n;
    } else {
      n = pick(next);
      if (n != null) return n;
    }
  }
  if (next2) {
    n = pick(next2);
    if (n != null) return n;
  }
  const combined = `${line} ${next || ''}`.trim();
  if (combined !== line) {
    n = pick(combined);
    if (n != null) return n;
  }
  return null;
}

/** @param {object} base - emptyNormalized() shape */
function collectBalanceScaleValues(base) {
  const bs = base.balanceSheet || {};
  const keys = [
    'totalAssets',
    'totalLiabilities',
    'equity',
    'currentAssets',
    'nonCurrentAssets',
    'currentLiabilities',
    'nonCurrentLiabilities',
  ];
  const out = [];
  for (const k of keys) {
    const v = bs[k];
    if (typeof v === 'number' && !Number.isNaN(v) && v !== 0 && Math.abs(v) >= 10) {
      out.push(Math.abs(v));
    }
  }
  return out;
}

/** @param {number[]} values */
function medianLog10Abs(values) {
  if (!values.length) return null;
  const logs = values.map((v) => Math.log10(v)).sort((a, b) => a - b);
  const mid = Math.floor(logs.length / 2);
  return logs.length % 2 ? logs[mid] : (logs[mid - 1] + logs[mid]) / 2;
}

/**
 * @param {string[]} lines
 * @param {number|null} scaleLog
 */
function runLabelExtractionPass(lines, scaleLog, pickCtx = null) {
  const base = emptyNormalized();
  const matched = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isMostlyNumericLine(line)) continue;
    const window2 = `${line} ${lines[i + 1] || ''}`.trim();
    for (const rule of LABEL_RULES) {
      if (matched.has(rule.field)) continue;
      if (!lineMatchesRule(line, window2, rule)) continue;
      const num = extractNumberNearLine(lines, i, scaleLog, pickCtx);
      if (num == null) continue;
      setField(base, rule.field, num);
      matched.add(rule.field);
      break;
    }
  }
  return base;
}

/**
 * Plausibility checks after extraction (does not block save).
 * @param {object} normalized - bundle with balanceSheet, incomeStatement
 * @param {import('./ratios').RatioPack|null} [ratiosPre]
 * @returns {{ warnings: string[], downgradeOk: boolean }}
 */
function computeSanityWarnings(normalized, ratiosPre = null) {
  const warnings = [];
  let downgradeOk = false;
  const bs = normalized.balanceSheet || {};
  const is = normalized.incomeStatement || {};
  const rat = ratiosPre || computeRatios(normalized);

  const mark = (msg) => {
    warnings.push(msg);
    downgradeOk = true;
  };

  if (
    bs.currentAssets != null &&
    bs.totalAssets != null &&
    bs.totalAssets !== 0 &&
    Math.abs(bs.currentAssets) > Math.abs(bs.totalAssets) * 1.02
  ) {
    mark('Activos corrientes superan activos totales; revisa columnas del PDF o corrige manualmente.');
  }
  if (
    bs.currentLiabilities != null &&
    bs.totalLiabilities != null &&
    bs.totalLiabilities !== 0 &&
    Math.abs(bs.currentLiabilities) > Math.abs(bs.totalLiabilities) * 1.02
  ) {
    mark('Pasivos corrientes superan pasivos totales; revisa extracción.');
  }

  if (bs.totalAssets != null && bs.totalLiabilities != null && bs.equity != null) {
    const rhs = bs.totalLiabilities + bs.equity;
    const lhs = bs.totalAssets;
    const denom = Math.max(Math.abs(lhs), Math.abs(rhs), 1);
    if (denom > 0 && Math.abs(lhs - rhs) / denom > 0.12) {
      mark(
        'Identidad contable débil: activos totales no cuadran con pasivos + patrimonio (diferencia material).',
      );
    }
  }

  if (
    bs.equity != null &&
    bs.totalAssets != null &&
    bs.equity !== 0 &&
    bs.totalAssets !== 0
  ) {
    const le = Math.log10(Math.abs(bs.equity));
    const la = Math.log10(Math.abs(bs.totalAssets));
    if (Number.isFinite(le) && Number.isFinite(la) && Math.abs(le - la) > 2.5) {
      mark('Patrimonio y activos totales muy distintos en magnitud; posible error de escala o columna.');
    }
  }

  if (bs.currentAssets != null && bs.nonCurrentAssets != null && bs.totalAssets != null) {
    const sum = Math.abs(bs.currentAssets) + Math.abs(bs.nonCurrentAssets);
    const ta = Math.abs(bs.totalAssets);
    if (ta > 0 && Math.abs(sum - ta) / ta > 0.2) {
      mark('Suma de activos corrientes + no corrientes no se aproxima a activos totales.');
    }
  }

  if (rat.currentRatio != null && rat.currentRatio > 25) {
    mark('Ratio corriente muy alto; posible mezcla de columnas o partidas mal leídas.');
  }
  if (rat.currentRatio != null && rat.currentRatio > 0 && rat.currentRatio < 0.08) {
    mark('Ratio corriente muy bajo; verifica activos y pasivos corrientes.');
  }
  if (rat.netMargin != null && Math.abs(rat.netMargin) > 1.2) {
    mark('Margen neto extremo; revisa ingresos y utilidad del ejercicio.');
  }
  if (rat.debtToEquity != null && Math.abs(rat.debtToEquity) > 20) {
    mark('Deuda/patrimonio fuera de rango habitual; verifica signos y magnitudes.');
  }
  if (
    is.revenue != null &&
    is.netIncome != null &&
    is.revenue !== 0 &&
    Math.abs(is.revenue) < Math.abs(is.netIncome) * 5 &&
    Math.abs(is.netIncome) > 1000
  ) {
    mark('Ingresos y utilidad parecen inconsistentes (orden de magnitud); revisa el estado de resultados.');
  }

  return { warnings, downgradeOk };
}

/**
 * Refresh sanity warnings and optionally downgrade ok → partial (never upgrades).
 * @param {object} normalized
 */
function refreshSanityOnNormalized(normalized) {
  if (!normalized.extraction) normalized.extraction = {};
  const rat = computeRatios(normalized);
  const sanity = computeSanityWarnings(normalized, rat);
  normalized.extraction.sanityWarnings = sanity.warnings;
  const st = normalized.extraction.status;
  if (sanity.downgradeOk && st === 'ok') normalized.extraction.status = 'partial';
  return normalized;
}

/** Recompute extraction.status from filled fields (e.g. after manual edit or LLM fill). */
function reconcileExtractionStatusFromBundle(normalized) {
  if (!normalized.extraction) normalized.extraction = {};
  const matchedCount = LABEL_RULES.filter((rule) => {
    const parts = rule.field.split('.');
    let v = normalized;
    for (const p of parts) v = v && v[p];
    return v != null;
  }).length;
  const critical = ['balanceSheet.totalAssets', 'balanceSheet.equity', 'incomeStatement.netIncome'];
  const missing = critical.filter((f) => {
    const parts = f.split('.');
    let v = normalized;
    for (const p of parts) v = v && v[p];
    return v == null;
  });
  let next = 'ok';
  if (missing.length > 0) next = matchedCount > 0 ? 'partial' : 'failed';
  if (matchedCount < 3) next = 'failed';
  normalized.extraction.status = next;
  return normalized;
}

function normalizeFromPdfText(text, metaOverrides = {}) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const joined = lines.join('\n');
  const warnings = [];

  const numpages = metaOverrides.numpages != null ? Number(metaOverrides.numpages) : 0;
  const trimmedLen = text.trim().length;
  const textSource = metaOverrides.textSource || '';
  const ocrAttempted = Boolean(metaOverrides.ocrAttempted);
  if (numpages > 0 && trimmedLen < numpages * MIN_CHARS_PER_PAGE_HINT) {
    if (textSource === 'ocr' || textSource === 'mixed') {
      warnings.push(
        'Texto principalmente vía OCR; revisar cifras (posibles errores de lectura).',
      );
    } else if (ocrAttempted) {
      warnings.push(
        'Poco texto extraído respecto al número de páginas; el intento OCR no produjo texto suficiente o no está disponible (poppler/tesseract).',
      );
    } else {
      warnings.push(
        'Poco texto extraído respecto al número de páginas; el PDF podría ser escaneado. Define EEFF_OCR=1 y usa pdftoppm + tesseract, o corrige a mano.',
      );
    }
  }
  if (trimmedLen === 0) {
    warnings.push('No se extrajo texto del PDF; si el archivo es legible al ojo, suele ser PDF escaneado o protegido.');
  }

  const headSnippet = joined.slice(0, 20000);
  const comparativeYears = detectComparativeYearColumns(headSnippet);
  const fiscalYearNum =
    metaOverrides.fiscalYear != null ? Number(metaOverrides.fiscalYear) : new Date().getFullYear();
  const pickCtx =
    comparativeYears && Number.isFinite(fiscalYearNum)
      ? { fiscalYear: fiscalYearNum, comparativeYears }
      : null;
  if (comparativeYears && Number.isFinite(fiscalYearNum)) {
    warnings.push(
      `Cabecera comparativa detectada (${comparativeYears.order[0]} | ${comparativeYears.order[1]}); usando columna del año fiscal ${fiscalYearNum}.`,
    );
  }

  let base = runLabelExtractionPass(lines, null, pickCtx);
  const scaleLog = medianLog10Abs(collectBalanceScaleValues(base));
  if (scaleLog != null) {
    base = runLabelExtractionPass(lines, scaleLog, pickCtx);
  }

  const matchedCount =
    LABEL_RULES.filter((rule) => {
      const parts = rule.field.split('.');
      let v = base;
      for (const p of parts) v = v && v[p];
      return v != null;
    }).length;

  let status = 'ok';
  const critical = ['balanceSheet.totalAssets', 'balanceSheet.equity', 'incomeStatement.netIncome'];
  const missing = critical.filter((f) => {
    const parts = f.split('.');
    let v = base;
    for (const p of parts) v = v && v[p];
    return v == null;
  });
  if (missing.length > 0) {
    status = matchedCount > 0 ? 'partial' : 'failed';
    warnings.push(`Faltan partidas clave o no se detectaron en el texto: ${missing.join(', ')}`);
  }

  if (matchedCount < 3) {
    status = 'failed';
    warnings.push('Pocos datos extraídos; revisar PDF (tabla como imagen o formato no estándar).');
  }

  const sample = joined.slice(0, 16000);

  const amountUnit = metaOverrides.amountUnit || metaOverrides.amount_unit || '';
  const normalized = {
    metadata: {
      entityId: metaOverrides.entityId || 'unknown',
      entityLabel: metaOverrides.entityLabel || '',
      fiscalYear: metaOverrides.fiscalYear || new Date().getFullYear(),
      currency: metaOverrides.currency || 'USD',
      reportType: metaOverrides.reportType || 'other',
      auditVersion: metaOverrides.auditVersion || '',
      amountUnit: typeof amountUnit === 'string' ? amountUnit : '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    balanceSheet: base.balanceSheet,
    incomeStatement: base.incomeStatement,
    cashFlow: base.cashFlow,
    extraction: {
      status,
      rawTextSample: sample,
      warnings,
      sanityWarnings: [],
      yoyPlausibilityWarnings: [],
    },
  };

  const rat = computeRatios(normalized);
  const sanity = computeSanityWarnings(normalized, rat);
  normalized.extraction.sanityWarnings = sanity.warnings;
  if (sanity.downgradeOk && status === 'ok') normalized.extraction.status = 'partial';

  return normalized;
}

module.exports = {
  normalizeFromPdfText,
  emptyNormalized,
  setField,
  LABEL_RULES,
  parseFinancialNumber,
  computeSanityWarnings,
  refreshSanityOnNormalized,
  reconcileExtractionStatusFromBundle,
};
