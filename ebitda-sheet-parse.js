/**
 * EBITDA_LIVE: anclas por columna B. Egresos operativos netos = fila «Egresos netos» del modelo
 * (suele estar encima de «Costos de operación», p.ej. fila 20), no la suma de todas las filas
 * hasta Buda Loans (eso duplica remuneraciones y el detalle ya incluido en costos).
 *
 * «Otros egresos operativos» = total − costos operación − gastos admin (remuneraciones es
 * desglose bajo costos en la planilla, no se resta otra vez).
 *
 * Fallback sin fila total: egresosNetos ≈ costosOp + gastosAdmin.
 */
'use strict';

function excelDateToLabel(serial) {
  if (typeof serial !== 'number' || serial < 40000) return null;
  const d = new Date((serial - 25569) * 86400000);
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return mo[d.getUTCMonth()] + '-' + String(d.getUTCFullYear()).slice(2);
}

function ebitdaCellNum(v) {
  if (typeof v === 'number' && !isNaN(v)) return v;
  if (typeof v === 'string' && String(v).trim() !== '') {
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function normalizeEbitdaLabel(raw) {
  if (raw == null) return '';
  let s = String(raw).trim().toLowerCase();
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/\s+/g, ' ');
  return s;
}

function rowLabel(rows, idx) {
  const row = rows[idx] || [];
  const b = row[1];
  const a = row[0];
  if (b != null && String(b).trim() !== '') return String(b);
  if (a != null && String(a).trim() !== '') return String(a);
  return '';
}

/** Fila de detalle que no debe sumarse (totales / título que duplica hijos). */
function shouldExcludeExpenseRowFromSum(norm) {
  if (!norm) return false;
  if (/^total\b/.test(norm)) return true;
  if (/^subtotal\b/.test(norm)) return true;
  if (/^egresos\s+netos/.test(norm)) return true;
  if (/total\s+egresos/.test(norm)) return true;
  if (/^total\s+operativ/.test(norm)) return true;
  return false;
}

function findBudaLoansRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    const n = normalizeEbitdaLabel(rowLabel(rows, i));
    if (!/buda/.test(n)) continue;
    if (/bridge/.test(n)) continue;
    if (/loan|prestamo|préstamo/.test(n)) return i;
  }
  return -1;
}

function findBudaBridgeRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    const n = normalizeEbitdaLabel(rowLabel(rows, i));
    if (/buda/.test(n) && /bridge/.test(n)) return i;
  }
  return -1;
}

function findCostosOperRow(rows, from, to) {
  const end = Math.min(to, rows.length);
  for (let i = Math.max(0, from); i < end; i++) {
    const n = normalizeEbitdaLabel(rowLabel(rows, i));
    if (/costos?\s+de\s+operacion/.test(n)) return i;
    if (/costos?\s+operativ/.test(n)) return i;
    if (/costo\s+operacion/.test(n)) return i;
    if (n.includes('costos') && n.includes('oper')) return i;
  }
  return -1;
}

function findRemuneracionesRow(rows, from, to) {
  const end = Math.min(to, rows.length);
  for (let i = Math.max(0, from); i < end; i++) {
    const n = normalizeEbitdaLabel(rowLabel(rows, i));
    if (/remuneraci/.test(n)) return i;
  }
  return -1;
}

function findGastosAdminRow(rows, from, to) {
  const end = Math.min(to, rows.length);
  for (let i = Math.max(0, from); i < end; i++) {
    const n = normalizeEbitdaLabel(rowLabel(rows, i));
    if (/gastos?\s+de\s+admin/.test(n)) return i;
    if (/gastos?\s+admin/.test(n)) return i;
    if (/admin\s+y\s+ventas/.test(n)) return i;
    if (/gasto\s+administrativ/.test(n)) return i;
    if (/gasto\s+de\s+ventas/.test(n)) return i;
  }
  return -1;
}

/**
 * Fila con el total oficial de egresos operativos (misma cifra que la planilla EBITDA_LIVE).
 * Orden típico: «Egresos netos» justo encima de «Costos de operación»; a veces el total va después del detalle.
 */
function findEgresosNetosTotalRow(rows, costosIdx, budaIdx, R) {
  const buda = Math.min(budaIdx, rows.length);
  const costos = Math.max(0, costosIdx);

  for (let i = costos - 1; i >= 0; i--) {
    const n = normalizeEbitdaLabel(rowLabel(rows, i));
    if (/^egresos\s+netos/.test(n)) return i;
  }
  for (let i = costos + 1; i < buda; i++) {
    const n = normalizeEbitdaLabel(rowLabel(rows, i));
    if (/^egresos\s+netos/.test(n)) return i;
  }
  if (R && R.egresosNetosTotal != null && rows[R.egresosNetosTotal]) return R.egresosNetosTotal;
  return -1;
}

function findEbitdaOperRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    const n = normalizeEbitdaLabel(rowLabel(rows, i));
    if (/ebitda\s+operaci/.test(n)) return i;
    if (/ebitda\s+op\.?/.test(n) && !/margen/.test(n)) return i;
  }
  return -1;
}

function findMargenEbitdaRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    const n = normalizeEbitdaLabel(rowLabel(rows, i));
    if (/margen.*ebitda/.test(n)) return i;
    if (/^ebitda\s*%/.test(n)) return i;
  }
  return -1;
}

/**
 * Índices resueltos para egresos y filas satélites (para inspección / tests).
 */
function resolveEgresosAnchors(rows, R) {
  const budaIdx = findBudaLoansRow(rows);
  const budaFinal = budaIdx >= 0 ? budaIdx : R.budaLoans;
  const searchEnd = budaIdx >= 0 ? budaIdx : rows.length;

  let costosIdx = findCostosOperRow(rows, 0, searchEnd);
  const costosFinal = costosIdx >= 0 ? costosIdx : R.costosOp;

  let remIdx = findRemuneracionesRow(rows, costosFinal, budaFinal);
  const remFinal = remIdx >= 0 ? remIdx : R.remuneraciones;

  let gastosIdx = findGastosAdminRow(rows, costosFinal, budaFinal);
  const gastosFinal = gastosIdx >= 0 ? gastosIdx : R.gastosAdmin;

  const bridgeIdx = findBudaBridgeRow(rows);
  const bridgeFinal = bridgeIdx >= 0 ? bridgeIdx : R.budaBridge;

  let ebitdaOpIdx = findEbitdaOperRow(rows);
  const ebitdaOpFinal = ebitdaOpIdx >= 0 ? ebitdaOpIdx : R.ebitdaOp;

  let ebitdaPctIdx = findMargenEbitdaRow(rows);
  const ebitdaPctFinal = ebitdaPctIdx >= 0 ? ebitdaPctIdx : R.ebitdaPct;

  const egresosNetosTotalIdx = findEgresosNetosTotalRow(rows, costosFinal, budaFinal, R);

  return {
    costosIdx: costosFinal,
    remIdx: remFinal,
    gastosIdx: gastosFinal,
    budaIdx: budaFinal,
    bridgeIdx: bridgeFinal,
    ebitdaOpIdx: ebitdaOpFinal,
    ebitdaPctIdx: ebitdaPctFinal,
    egresosNetosTotalIdx,
    _resolved: {
      budaFromLabel: budaIdx >= 0,
      costosFromLabel: costosIdx >= 0,
      remFromLabel: remIdx >= 0,
      gastosFromLabel: gastosIdx >= 0,
      bridgeFromLabel: bridgeIdx >= 0,
      ebitdaOpFromLabel: ebitdaOpIdx >= 0,
      ebitdaPctFromLabel: ebitdaPctIdx >= 0,
      egresosTotalFromLabel: egresosNetosTotalIdx >= 0,
    },
  };
}

function buildColumnsFromHeader(hdr) {
  const monthCols = [];
  const yearCols = [];
  const monthLabels = [];
  const yearLabels = [];

  for (let c = 2; c < (hdr || []).length; c++) {
    const v = hdr[c];
    if (typeof v === 'number' && v >= 40000) {
      monthCols.push(c);
      monthLabels.push(excelDateToLabel(v));
    } else if (typeof v === 'number' && v >= 2020 && v <= 2030) {
      yearCols.push(c);
      yearLabels.push(String(v));
    } else if (typeof v === 'string' && v.trim() !== '') {
      const yOnly = parseInt(String(v).replace(/\D/g, ''), 10);
      if (yOnly >= 2020 && yOnly <= 2030) {
        yearCols.push(c);
        yearLabels.push(String(yOnly));
      }
    }
  }

  return { monthCols, yearCols, monthLabels, yearLabels };
}

function parseEbitdaSheetRows(rows, R) {
  const hdr = rows[R.headers] || [];
  const { monthCols, yearCols, monthLabels, yearLabels } = buildColumnsFromHeader(hdr);

  function getRowVals(idx) {
    const row = rows[idx];
    if (!row) {
      return {
        m: monthCols.map(() => 0),
        y: yearCols.map(() => 0),
      };
    }
    return {
      m: monthCols.map((c) => ebitdaCellNum(row[c])),
      y: yearCols.map((c) => ebitdaCellNum(row[c])),
    };
  }

  const anchors = resolveEgresosAnchors(rows, R);

  const incomeAndStatic = [
    'ingresosNetos',
    'comisiones',
    'simple',
    'trader',
    'objetivos',
    'loans',
    'otc',
    'otrosIngresos',
  ];

  const M = {};
  const YT = {};

  for (let k = 0; k < incomeAndStatic.length; k++) {
    const f = incomeAndStatic[k];
    const d = getRowVals(R[f]);
    M[f] = d.m;
    YT[f] = d.y;
  }

  const co = getRowVals(anchors.costosIdx);
  M.costosOp = co.m;
  YT.costosOp = co.y;

  const re = getRowVals(anchors.remIdx);
  M.remuneraciones = re.m;
  YT.remuneraciones = re.y;

  const ga = getRowVals(anchors.gastosIdx);
  M.gastosAdmin = ga.m;
  YT.gastosAdmin = ga.y;

  const bl = getRowVals(anchors.budaIdx);
  M.budaLoans = bl.m;
  YT.budaLoans = bl.y;

  const bb = getRowVals(anchors.bridgeIdx);
  M.budaBridge = bb.m;
  YT.budaBridge = bb.y;

  const eb = getRowVals(anchors.ebitdaOpIdx);
  M.ebitdaOp = eb.m;
  YT.ebitdaOp = eb.y;

  const ep = getRowVals(anchors.ebitdaPctIdx);
  M.ebitdaPct = ep.m;
  YT.ebitdaPct = ep.y;

  const tIdx = anchors.egresosNetosTotalIdx;
  if (tIdx >= 0) {
    const eg = getRowVals(tIdx);
    M.egresosNetos = eg.m;
    YT.egresosNetos = eg.y;
  } else {
    M.egresosNetos = monthCols.map((_, i) => M.costosOp[i] + M.gastosAdmin[i]);
    YT.egresosNetos = yearCols.map((_, i) => YT.costosOp[i] + YT.gastosAdmin[i]);
  }

  M.egresosOtros = monthCols.map((_, i) => M.egresosNetos[i] - M.costosOp[i] - M.gastosAdmin[i]);
  YT.egresosOtros = yearCols.map((_, i) => YT.egresosNetos[i] - YT.costosOp[i] - YT.gastosAdmin[i]);

  return {
    months: monthLabels,
    years: yearLabels,
    M,
    YT,
    anchors,
  };
}

var api = {
  parseEbitdaSheetRows,
  normalizeEbitdaLabel,
  rowLabel,
  shouldExcludeExpenseRowFromSum,
  resolveEgresosAnchors,
  findEgresosNetosTotalRow,
  ebitdaCellNum,
  excelDateToLabel,
  buildColumnsFromHeader,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.BudaEbitdaParse = api;
}
