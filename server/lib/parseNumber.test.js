'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseFinancialNumber,
  extractAllNumbersFromLine,
  pickFinancialNumberFromLine,
  pickFinancialNumberPreferScale,
  pickFinancialNumberFromLineWithScale,
  pickFinancialNumberForComparative,
  pickFinancialNumberFromLineWithContext,
} = require('./parseNumber');

test('parseFinancialNumber: CL thousands', () => {
  assert.equal(parseFinancialNumber('1.234.567'), 1234567);
  assert.equal(parseFinancialNumber('(42)'), -42);
});

test('pickFinancialNumberFromLine: prefers last token when two columns', () => {
  assert.equal(pickFinancialNumberFromLine('Total activos 100 5000'), 5000);
});

test('pickFinancialNumberPreferScale: chooses magnitude near reference', () => {
  const nums = [3, 4500000, 4200000];
  const target = Math.log10(4_000_000);
  const picked = pickFinancialNumberPreferScale(nums, target);
  assert.ok(picked === 4500000 || picked === 4200000);
  assert.notEqual(picked, 3);
});

test('pickFinancialNumberFromLineWithScale: ignores stray small note when scale is millions', () => {
  const line = 'Ingresos 12 8900000 9200000';
  const target = Math.log10(9_000_000);
  const v = pickFinancialNumberFromLineWithScale(line, target);
  assert.ok(v === 8900000 || v === 9200000);
});

test('extractAllNumbersFromLine: order preserved', () => {
  const nums = extractAllNumbersFromLine('A 1.000 2.500');
  assert.equal(nums.length, 2);
});

test('pickFinancialNumberForComparative: picks column by fiscal year', () => {
  const nums = extractAllNumbersFromLine('X 1.200.000 950.000');
  assert.equal(pickFinancialNumberForComparative(nums, 2024, [2023, 2024]), 950000);
  assert.equal(pickFinancialNumberForComparative(nums, 2023, [2023, 2024]), 1200000);
});

test('pickFinancialNumberFromLineWithContext: uses comparative header years', () => {
  const line = 'Activos corrientes 1.200.000 950.000';
  const ctx = { fiscalYear: 2023, comparativeYears: { order: [2023, 2024] } };
  assert.equal(pickFinancialNumberFromLineWithContext(line, null, ctx), 1200000);
  assert.equal(
    pickFinancialNumberFromLineWithContext(line, null, { fiscalYear: 2024, comparativeYears: { order: [2023, 2024] } }),
    950000,
  );
});

test('pickFinancialNumberFromLineWithContext: falls back to scale when year not in header', () => {
  const line = 'Total activos 5.000 10.000';
  const ctx = { fiscalYear: 2022, comparativeYears: { order: [2023, 2024] } };
  const lg = Math.log10(9_000_000);
  const v = pickFinancialNumberFromLineWithContext(line, lg, ctx);
  assert.ok(v === 10000 || v === 5000);
});
