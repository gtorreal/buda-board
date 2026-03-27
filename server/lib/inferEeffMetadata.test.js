'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inferEeffMetadata, inferEeffMetadataPreview } = require('./inferEeffMetadata');

test('inferEeffMetadata: december closing and CLP', () => {
  const text =
    'Razón social: ACME SpA\nEstados financieros consolidados al 31 de diciembre de 2024\nCifras en miles de pesos\nMoneda funcional CLP';
  const r = inferEeffMetadata(text);
  assert.equal(r.suggestions.fiscalYear, 2024);
  assert.equal(r.suggestions.currency, 'CLP');
  assert.equal(r.suggestions.amountUnit, 'thousands');
  assert.equal(r.suggestions.reportType, 'consolidated');
  assert.ok(r.suggestions.entityLabel && /ACME/i.test(r.suggestions.entityLabel));
});

test('inferEeffMetadataPreview: passes numpages', () => {
  const p = inferEeffMetadataPreview('2024 solo', 3);
  assert.equal(p.numpages, 3);
  assert.ok(p.charCount >= 1);
});
