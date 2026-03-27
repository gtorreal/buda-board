'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  parseEbitdaSheetRows,
  resolveEgresosAnchors,
  shouldExcludeExpenseRowFromSum,
  normalizeEbitdaLabel,
  findEgresosNetosTotalRow,
} = require(path.join(__dirname, '..', '..', 'ebitda-sheet-parse.js'));

/** Misma geometría que index.html R (fallbacks). */
const R_FALLBACK = {
  headers: 0,
  ingresosNetos: 1,
  comisiones: 1,
  simple: 1,
  trader: 1,
  objetivos: 1,
  loans: 1,
  otc: 1,
  otrosIngresos: 1,
  egresosNetosTotal: 2,
  costosOp: 3,
  remuneraciones: 4,
  gastosAdmin: 6,
  budaLoans: 8,
  budaBridge: 9,
  ebitdaOp: 10,
  ebitdaPct: 11,
};

function hdrRow() {
  return ['', '', 45000, 2023];
}

test('shouldExcludeExpenseRowFromSum: totales y egresos netos', () => {
  assert.equal(shouldExcludeExpenseRowFromSum(normalizeEbitdaLabel('Total')), true);
  assert.equal(shouldExcludeExpenseRowFromSum(normalizeEbitdaLabel('Subtotal operativo')), true);
  assert.equal(shouldExcludeExpenseRowFromSum(normalizeEbitdaLabel('Egresos netos')), true);
  assert.equal(shouldExcludeExpenseRowFromSum(normalizeEbitdaLabel('Total egresos operativos')), true);
  assert.equal(shouldExcludeExpenseRowFromSum(normalizeEbitdaLabel('Costos de operacion')), false);
});

test('parseEbitdaSheetRows: egresos = fila planilla «Egresos netos»; no sumar detalle intermedio', () => {
  const rows = [
    hdrRow(),
    ['', 'Ingresos netos', 0, 0],
    ['', 'Egresos netos', 4892962, 150],
    ['', 'Costos de operacion', 2052887, 100],
    ['', 'Remuneraciones', 1992403, 25],
    ['', 'Otro rubro dentro de costos', 500000, 10],
    ['', 'Gastos admin y ventas', 2840075, 50],
    ['', 'Buda Loans (gasto)', 10, 10],
    ['', 'Buda Bridge (gasto)', 1, 1],
    ['', 'EBITDA Operacional', 5, 5],
    ['', 'Margen EBITDA', 0.02, 0.02],
  ];

  const out = parseEbitdaSheetRows(rows, R_FALLBACK);
  const y2023 = out.years.indexOf('2023');
  assert.ok(y2023 >= 0);

  assert.equal(out.YT.egresosNetos[y2023], 150, 'total desde fila Egresos netos, no suma de todas las líneas');
  assert.equal(out.YT.costosOp[y2023], 100);
  assert.equal(out.YT.remuneraciones[y2023], 25);
  assert.equal(out.YT.gastosAdmin[y2023], 50);
  assert.equal(out.YT.egresosOtros[y2023], 0, '150 - 100 - 50; rem no se resta (va dentro de costos en el modelo)');

  assert.equal(out.anchors.egresosNetosTotalIdx, 2);
});

test('findEgresosNetosTotalRow: total después del detalle (orden alternativo)', () => {
  const rows = [
    hdrRow(),
    ['', 'Costos de operacion', 100, 100],
    ['', 'Gastos de administracion y ventas', 50, 50],
    ['', 'Egresos netos', 160, 160],
    ['', 'Buda Loans', 1, 1],
  ];
  const R = { egresosNetosTotal: 99, costosOp: 1, budaLoans: 4 };
  const idx = findEgresosNetosTotalRow(rows, 1, 4, R);
  assert.equal(idx, 3);
});

test('resolveEgresosAnchors: filas desplazadas se encuentran por etiqueta', () => {
  const rows = [
    hdrRow(),
    ['', 'Nota', 0, 0],
    ['', 'Nota2', 0, 0],
    ['', 'Costos operativos', 1, 1],
    ['', 'Remuneraciones', 2, 2],
    ['', 'Gastos administrativos', 3, 3],
    ['', 'Buda Loans', 9, 9],
  ];
  const R = {
    ...R_FALLBACK,
    costosOp: 99,
    remuneraciones: 99,
    gastosAdmin: 99,
    budaLoans: 99,
    egresosNetosTotal: 99,
  };
  const a = resolveEgresosAnchors(rows, R);
  assert.equal(a.costosIdx, 3, 'costos por label, no fallback 99');
  assert.equal(a.remIdx, 4);
  assert.equal(a.gastosIdx, 5);
  assert.equal(a.budaIdx, 6);
  assert.equal(a.egresosNetosTotalIdx, -1, 'sin fila Egresos netos en fixture');
});

test('parseEbitdaSheetRows: sin fila total, fallback costos + gastos (no sumar marketing intermedio)', () => {
  const rows = [
    hdrRow(),
    ['', 'x', 0, 0],
    ['', 'Costos de operacion', 0, 0],
    ['', 'Remuneraciones', 0, 0],
    ['', 'Gastos admin y ventas', 0, 244629],
    ['', 'Marketing', 0, 50000],
    ['', 'Buda Loans', 0, 0],
  ];
  const R = {
    ...R_FALLBACK,
    headers: 0,
    ingresosNetos: 1,
    comisiones: 1,
    simple: 1,
    trader: 1,
    objetivos: 1,
    loans: 1,
    otc: 1,
    otrosIngresos: 1,
    egresosNetosTotal: 99,
    costosOp: 2,
    remuneraciones: 3,
    gastosAdmin: 4,
    budaLoans: 6,
    budaBridge: 7,
    ebitdaOp: 7,
    ebitdaPct: 8,
  };
  const out = parseEbitdaSheetRows(rows, R);
  const yi = out.years.indexOf('2023');
  assert.equal(out.YT.egresosNetos[yi], 244629, 'costos 0 + gastos 244629; no incluir Marketing 50000');
  assert.equal(out.YT.egresosOtros[yi], 0);
});
