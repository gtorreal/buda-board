'use strict';

const { parseFinancialNumber, extractNumberFromLine } = require('./parseNumber');

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
    /patrimonio\s+de\s+los\s+propietarios/i,
    /total\s+patrimonio/i,
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
    /utilidad\s+atribuible/i,
    /utilidad\s+del\s+ejercicio/i,
    /resultado\s+del\s+ejercicio/i,
    /utilidad\s+neta/i,
    /ganancia\s+del\s+periodo/i,
    /resultado\s+neto\s+del\s+ejercicio/i,
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

function normalizeFromPdfText(text, metaOverrides = {}) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const joined = lines.join('\n');
  const base = emptyNormalized();
  const warnings = [];
  const matched = new Set();

  const numpages = metaOverrides.numpages != null ? Number(metaOverrides.numpages) : 0;
  const trimmedLen = text.trim().length;
  if (numpages > 0 && trimmedLen < numpages * MIN_CHARS_PER_PAGE_HINT) {
    warnings.push(
      'Poco texto extraído respecto al número de páginas; el PDF podría ser escaneado (imagen). OCR no disponible.',
    );
  }
  if (trimmedLen === 0) {
    warnings.push('No se extrajo texto del PDF; si el archivo es legible al ojo, suele ser PDF escaneado o protegido.');
  }

  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const rule of LABEL_RULES) {
      if (matched.has(rule.field)) continue;
      const hit = rule.patterns.some((re) => re.test(lower) || re.test(line));
      if (!hit) continue;
      const num = extractNumberFromLine(line);
      if (num == null) continue;
      setField(base, rule.field, num);
      matched.add(rule.field);
      break;
    }
  }

  let status = 'ok';
  const critical = ['balanceSheet.totalAssets', 'balanceSheet.equity', 'incomeStatement.netIncome'];
  const missing = critical.filter((f) => {
    const parts = f.split('.');
    let v = base;
    for (const p of parts) v = v && v[p];
    return v == null;
  });
  if (missing.length > 0) {
    status = matched.size > 0 ? 'partial' : 'failed';
    warnings.push(`Faltan partidas clave o no se detectaron en el texto: ${missing.join(', ')}`);
  }

  if (matched.size < 3) {
    status = 'failed';
    warnings.push('Pocos datos extraídos; revisar PDF (tabla como imagen o formato no estándar).');
  }

  const sample = joined.slice(0, 4000);

  return {
    metadata: {
      entityId: metaOverrides.entityId || 'unknown',
      entityLabel: metaOverrides.entityLabel || '',
      fiscalYear: metaOverrides.fiscalYear || new Date().getFullYear(),
      currency: metaOverrides.currency || 'USD',
      reportType: metaOverrides.reportType || 'other',
      auditVersion: metaOverrides.auditVersion || '',
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
    },
  };
}

module.exports = { normalizeFromPdfText, emptyNormalized, setField, LABEL_RULES, parseFinancialNumber };
