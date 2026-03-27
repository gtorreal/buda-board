'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { llmExtractEnabled, applyFullLlmExtract } = require('./llmExtract');
const { emptyNormalized } = require('./normalize');

test('applyFullLlmExtract: overwrites and clears with null', () => {
  const n = emptyNormalized();
  n.balanceSheet.totalAssets = 999;
  applyFullLlmExtract(n, {
    balanceSheet: { totalAssets: 100, currentAssets: 50, nonCurrentAssets: null },
  });
  assert.equal(n.balanceSheet.totalAssets, 100);
  assert.equal(n.balanceSheet.currentAssets, 50);
  assert.equal(n.balanceSheet.nonCurrentAssets, null);
});

test('llmExtractEnabled: requires flag and API key', () => {
  const prevKey = process.env.OPENAI_API_KEY;
  const prevFl = process.env.EEFF_LLM_EXTRACT;
  try {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.EEFF_LLM_EXTRACT = '1';
    assert.equal(llmExtractEnabled(), true);
    process.env.EEFF_LLM_EXTRACT = '0';
    assert.equal(llmExtractEnabled(), false);
  } finally {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
    if (prevFl === undefined) delete process.env.EEFF_LLM_EXTRACT;
    else process.env.EEFF_LLM_EXTRACT = prevFl;
  }
});
