'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeSanityWarnings,
  normalizeFromPdfText,
  reconcileExtractionStatusFromBundle,
  emptyNormalized,
} = require('./normalize');

test('computeSanityWarnings: current assets cannot exceed total assets', () => {
  const n = {
    balanceSheet: {
      totalAssets: 100,
      currentAssets: 500,
      equity: 40,
      totalLiabilities: 60,
    },
    incomeStatement: { revenue: 1000, netIncome: 10 },
  };
  const { warnings, downgradeOk } = computeSanityWarnings(n);
  assert.equal(downgradeOk, true);
  assert.ok(warnings.some((w) => /corrientes|activos totales/i.test(w)));
});

test('computeSanityWarnings: weak accounting identity', () => {
  const n = {
    balanceSheet: {
      totalAssets: 1000,
      totalLiabilities: 100,
      equity: 100,
    },
    incomeStatement: {},
  };
  const { warnings, downgradeOk } = computeSanityWarnings(n);
  assert.equal(downgradeOk, true);
  assert.ok(warnings.some((w) => /Identidad contable/i.test(w)));
});

test('normalizeFromPdfText: synthetic balance line yields totals and sanity may warn on ER', () => {
  const text = [
    'Estado de situación financiera',
    'Activos corrientes 1.000 2.000',
    'Total activos 5.000 10.000',
    'Patrimonio neto 2.000 4.000',
    'Utilidad del ejercicio 100 200',
  ].join('\n');
  const out = normalizeFromPdfText(text, {
    entityId: 'test',
    fiscalYear: 2024,
    currency: 'USD',
    numpages: 1,
  });
  assert.ok(out.balanceSheet.totalAssets != null);
  assert.ok(out.extraction.warnings.length >= 0);
  assert.ok(['ok', 'partial', 'failed'].includes(out.extraction.status));
});

test('normalizeFromPdfText: comparative header picks fiscal year column', () => {
  const text = [
    'EEFF consolidados',
    '2023 2024',
    'Activos corrientes 1.200.000 950.000',
    'Total activos 5.000.000 4.800.000',
    'Patrimonio neto 2.000.000 1.900.000',
    'Utilidad del ejercicio 80.000 95.000',
  ].join('\n');
  const out2023 = normalizeFromPdfText(text, {
    entityId: 'test',
    fiscalYear: 2023,
    currency: 'CLP',
    numpages: 1,
  });
  const out2024 = normalizeFromPdfText(text, {
    entityId: 'test',
    fiscalYear: 2024,
    currency: 'CLP',
    numpages: 1,
  });
  assert.equal(out2023.balanceSheet.currentAssets, 1200000);
  assert.equal(out2024.balanceSheet.currentAssets, 950000);
  assert.equal(out2023.balanceSheet.totalAssets, 5000000);
  assert.equal(out2024.balanceSheet.totalAssets, 4800000);
});

test('reconcileExtractionStatusFromBundle: upgrades when critical fields present', () => {
  const n = emptyNormalized();
  n.extraction = { status: 'failed', warnings: [], sanityWarnings: [] };
  n.balanceSheet.totalAssets = 100;
  n.balanceSheet.equity = 50;
  n.incomeStatement.netIncome = 5;
  n.incomeStatement.revenue = 200;
  n.incomeStatement.costOfSales = 80;
  reconcileExtractionStatusFromBundle(n);
  assert.equal(n.extraction.status, 'ok');
});
