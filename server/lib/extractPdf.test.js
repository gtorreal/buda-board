'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractTextFromPdf, MIN_CHARS_PER_PAGE_HINT } = require('./extractPdf');

test('extractPdf exports MIN_CHARS hint', () => {
  assert.ok(MIN_CHARS_PER_PAGE_HINT > 0);
});

test('extractTextFromPdf: rejects invalid buffer', async () => {
  await assert.rejects(async () => extractTextFromPdf(Buffer.from('not a pdf')), /Invalid PDF/);
});
