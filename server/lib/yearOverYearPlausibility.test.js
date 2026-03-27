'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeYearOverYearPlausibilityWarnings } = require('./yearOverYearPlausibility');

test('computeYearOverYearPlausibilityWarnings: empty when no prev', () => {
  assert.deepEqual(computeYearOverYearPlausibilityWarnings({}, null, 2023), []);
});

test('computeYearOverYearPlausibilityWarnings: flags huge revenue swing', () => {
  const curr = { incomeStatement: { revenue: 1e9, netIncome: 1e6 }, balanceSheet: { totalAssets: 1e8 } };
  const prev = { incomeStatement: { revenue: 5000, netIncome: 400 }, balanceSheet: { totalAssets: 2e7 } };
  const w = computeYearOverYearPlausibilityWarnings(curr, prev, 2023);
  assert.ok(w.some((x) => /ingresos/i.test(x)));
});

test('computeYearOverYearPlausibilityWarnings: quiet when similar magnitude', () => {
  const curr = { incomeStatement: { revenue: 1.1e6, netIncome: 5e4 }, balanceSheet: { totalAssets: 2e6 } };
  const prev = { incomeStatement: { revenue: 1e6, netIncome: 4.8e4 }, balanceSheet: { totalAssets: 1.95e6 } };
  const w = computeYearOverYearPlausibilityWarnings(curr, prev, 2023);
  assert.equal(w.length, 0);
});
