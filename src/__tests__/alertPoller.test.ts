import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCityName } from '../alertPoller.js';

describe('normalizeCityName', () => {
  it('trims leading and trailing whitespace', () => {
    assert.equal(normalizeCityName('  תל אביב  '), 'תל אביב');
  });

  it('collapses multiple spaces into one', () => {
    assert.equal(normalizeCityName('תל  אביב   מזרח'), 'תל אביב מזרח');
  });

  it('normalizes dash with no surrounding spaces', () => {
    assert.equal(normalizeCityName('תל אביב-מזרח'), 'תל אביב - מזרח');
  });

  it('normalizes dash with leading space only', () => {
    assert.equal(normalizeCityName('תל אביב -מזרח'), 'תל אביב - מזרח');
  });

  it('normalizes dash with trailing space only', () => {
    assert.equal(normalizeCityName('תל אביב- מזרח'), 'תל אביב - מזרח');
  });

  it('leaves already-normalized dash unchanged', () => {
    assert.equal(normalizeCityName('תל אביב - מזרח'), 'תל אביב - מזרח');
  });

  it('normalizes en-dash and em-dash to hyphen with spaces', () => {
    assert.equal(normalizeCityName('רמת גן–מזרח'), 'רמת גן - מזרח');
    assert.equal(normalizeCityName('רמת גן—מזרח'), 'רמת גן - מזרח');
  });

  it('handles city with no dashes unchanged', () => {
    assert.equal(normalizeCityName('ירושלים'), 'ירושלים');
  });

  it('handles empty string', () => {
    assert.equal(normalizeCityName(''), '');
  });
});
