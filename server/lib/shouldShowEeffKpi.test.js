'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldShowEeffKpi } = require('./shouldShowEeffKpi');

test('shouldShowEeffKpi: true only for ok and zero sanity warnings', () => {
  assert.equal(shouldShowEeffKpi('ok', 0), true);
  assert.equal(shouldShowEeffKpi('ok', 1), false);
  assert.equal(shouldShowEeffKpi('partial', 0), false);
  assert.equal(shouldShowEeffKpi('failed', 0), false);
  assert.equal(shouldShowEeffKpi('ok', '0'), true);
});
