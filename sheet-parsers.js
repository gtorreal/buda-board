/**
 * Parsers for Google Sheets ranges used by the EBITDA board (METRICS_LIVE, RRHH_LIVE, LOANS_LIVE).
 * EBITDA views use BudaEbitdaParse from ebitda-sheet-parse.js (load that script first).
 */
'use strict';

// Row indices (0-based from row 3, labels in col B, data starts col C = index 2)
var BUDA_EBITDA_ROW_MAP = {
  headers: 0,
  ingresosNetos: 2,
  comisiones: 3,
  simple: 4,
  trader: 5,
  objetivos: 6,
  loans: 7,
  otc: 8,
  otrosIngresos: 9,
  egresosNetosTotal: 17,
  costosOp: 15,
  remuneraciones: 16,
  gastosAdmin: 34,
  budaLoans: 53,
  budaBridge: 54,
  ebitdaOp: 56,
  ebitdaPct: 57,
};

function excelDateToLabel(serial) {
  if (typeof serial !== 'number' || serial < 40000) return null;
  var d = new Date((serial - 25569) * 86400000);
  var mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return mo[d.getUTCMonth()] + '-' + String(d.getUTCFullYear()).slice(2);
}

var METRICS_MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** METRICS_LIVE headers: YYYYMM (202602), text MMM-YY / MMM-YYYY, or Excel serial (>=40000). */
function metricsHeaderToLabel(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v >= 199001 && v <= 209912) {
    var y = Math.floor(v / 100);
    var m = v % 100;
    if (m >= 1 && m <= 12 && y >= 1990 && y <= 2099) return METRICS_MO[m - 1] + '-' + String(y).slice(2);
  }
  if (typeof v === 'string') {
    var s = String(v).trim();
    var d6 = s.replace(/\D/g, '');
    if (d6.length === 6) {
      var n6 = parseInt(d6, 10);
      if (n6 >= 199001 && n6 <= 209912) {
        var y2 = Math.floor(n6 / 100);
        var m2 = n6 % 100;
        if (m2 >= 1 && m2 <= 12 && y2 >= 1990 && y2 <= 2099) return METRICS_MO[m2 - 1] + '-' + String(y2).slice(2);
      }
    }
    var mm = s.match(/^([A-Za-z]{3})[\s\-\/]+(\d{2}|\d{4})$/i);
    if (mm) {
      var pref = mm[1].toLowerCase().replace(/\./g, '');
      var mi = -1;
      for (var t = 0; t < 12; t++) {
        if (METRICS_MO[t].toLowerCase() === pref || METRICS_MO[t].toLowerCase().indexOf(pref) === 0) {
          mi = t;
          break;
        }
      }
      if (mi >= 0) {
        var yy = parseInt(mm[2], 10);
        var yFull = yy < 100 ? (yy <= 50 ? 2000 + yy : 1900 + yy) : yy;
        return METRICS_MO[mi] + '-' + String(yFull).slice(2);
      }
    }
  }
  if (typeof v === 'number' && v >= 40000) return excelDateToLabel(v);
  return null;
}

/** EBITDA_LIVE: parseo en ebitda-sheet-parse.js — egresos = fila «Egresos netos» de la planilla, no suma de todo el bloque. */
function parseSheet(rows) {
  var P = typeof globalThis !== 'undefined' ? globalThis.BudaEbitdaParse : null;
  if (!P || typeof P.parseEbitdaSheetRows !== 'function') {
    throw new Error('Falta ebitda-sheet-parse.js (script src antes de sheet-parsers.js).');
  }
  var parsed = P.parseEbitdaSheetRows(rows, BUDA_EBITDA_ROW_MAP);
  return { months: parsed.months, years: parsed.years, M: parsed.M, YT: parsed.YT };
}

// Índices = fila Google Sheets − 1. MAU filas 32–36, MTU 41–45, TX 50–54 (AR/CL/CO/PE + Total).
var METRICS_HEADER_ROW_SCAN = 40;

function parseMetrics(rows) {
  var maxCol = 0;
  for (var rr = 0; rr < rows.length; rr++) {
    var rw = rows[rr] || [];
    if (rw.length > maxCol) maxCol = rw.length;
  }
  var months = [];
  var ci = [];
  for (var c = 1; c < maxCol; c++) {
    var label = null;
    for (var ri = 0; ri < Math.min(METRICS_HEADER_ROW_SCAN, rows.length); ri++) {
      label = metricsHeaderToLabel((rows[ri] || [])[c]);
      if (label) break;
    }
    if (label) {
      months.push(label);
      ci.push(c);
    }
  }
  function metricsCellNum(row, col) {
    var v = (row || [])[col];
    if (typeof v === 'number' && !isNaN(v)) return v;
    if (typeof v === 'string' && String(v).trim() !== '') {
      var n = parseFloat(String(v).replace(/,/g, ''));
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }
  function vals(ri) {
    var row = rows[ri] || [];
    return ci.map(function(col) {
      return metricsCellNum(row, col);
    });
  }
  var mauAR = vals(31),
    mauCL = vals(32),
    mauCO = vals(33),
    mauPE = vals(34),
    mauTotal = vals(35);
  var mtuAR = vals(40),
    mtuCL = vals(41),
    mtuCO = vals(42),
    mtuPE = vals(43),
    mtuTotal = vals(44);
  var txAR = vals(49),
    txCL = vals(50),
    txCO = vals(51),
    txPE = vals(52),
    txTotal = vals(53);
  return {
    months: months,
    mau: { ar: mauAR, cl: mauCL, co: mauCO, pe: mauPE, total: mauTotal },
    mtu: { ar: mtuAR, cl: mtuCL, co: mtuCO, pe: mtuPE, total: mtuTotal },
    tx: { ar: txAR, cl: txCL, co: txCO, pe: txPE, total: txTotal },
  };
}

function parseRRHH(rows) {
  var yearRow = rows[1] || [];
  var monthRow = rows[2] || [];
  var mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var months = [];
  var ci = [];
  var curYear = null;
  for (var c = 1; c < monthRow.length; c++) {
    var yv = yearRow[c];
    if ((typeof yv === 'number' || typeof yv === 'string') && parseInt(yv, 10) >= 2020) curYear = parseInt(yv, 10);
    var m = monthRow[c];
    if (curYear && typeof m === 'number' && m >= 1 && m <= 12) {
      months.push(mo[m - 1] + '-' + String(curYear).slice(2));
      ci.push(c);
    }
  }
  function vals(ri) {
    var row = rows[ri] || [];
    return ci.map(function(col) {
      return typeof row[col] === 'number' ? row[col] : 0;
    });
  }
  return { months: months, chile: vals(3), colombia: vals(4), peru: vals(5), total: vals(6) };
}

function parseLoans(rows) {
  var hdr = rows[9] || [];
  var mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var months = [];
  var ci = [];
  for (var c = 1; c < hdr.length; c++) {
    var v = hdr[c];
    var vn = typeof v === 'number' && !isNaN(v) ? v : parseInt(String(v || '').replace(/\D/g, ''), 10);
    if (vn >= 202001 && vn <= 209912) {
      var y = Math.floor(vn / 100);
      var m = (vn % 100) - 1;
      if (m >= 0 && m <= 11) {
        months.push(mo[m] + '-' + String(y).slice(2));
        ci.push(c);
      }
    }
  }
  function vals(ri) {
    var row = rows[ri] || [];
    return ci.map(function(col) {
      return typeof row[col] === 'number' ? row[col] : 0;
    });
  }
  return { months: months, ingresos: vals(10), volumen: vals(11), tasa: vals(12), gastos: vals(13) };
}

var api = {
  R: BUDA_EBITDA_ROW_MAP,
  parseSheet: parseSheet,
  parseMetrics: parseMetrics,
  parseRRHH: parseRRHH,
  parseLoans: parseLoans,
  metricsHeaderToLabel: metricsHeaderToLabel,
  excelDateToLabel: excelDateToLabel,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.BudaSheetParsers = api;
}
