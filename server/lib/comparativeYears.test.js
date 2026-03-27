'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectComparativeYearColumns } = require('./comparativeYears');

test('detectComparativeYearColumns: two years left-to-right', () => {
  const t = 'Estados financieros al 31 de diciembre\n2023 2024\nActivos corrientes 1 2';
  const d = detectComparativeYearColumns(t);
  assert.ok(d);
  assert.deepEqual(d.order, [2023, 2024]);
});

test('detectComparativeYearColumns: null when single year', () => {
  assert.equal(detectComparativeYearColumns('Solo 2024 acá'), null);
});
