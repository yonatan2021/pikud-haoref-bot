import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getTopicId } from '../topicRouter';

describe('getTopicId', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TELEGRAM_TOPIC_ID_SECURITY: '3',
      TELEGRAM_TOPIC_ID_NATURE: '2',
      TELEGRAM_TOPIC_ID_ENVIRONMENTAL: '10',
      TELEGRAM_TOPIC_ID_DRILLS: '11',
      TELEGRAM_TOPIC_ID_GENERAL: '1',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('routes missiles to security topic', () => {
    assert.equal(getTopicId('missiles'), 3);
  });

  it('routes earthQuake to nature topic', () => {
    assert.equal(getTopicId('earthQuake'), 2);
  });

  it('routes hazardousMaterials to environmental topic', () => {
    assert.equal(getTopicId('hazardousMaterials'), 10);
  });

  it('routes missilesDrill to drills topic', () => {
    assert.equal(getTopicId('missilesDrill'), 11);
  });

  it('routes newsFlash to general topic', () => {
    assert.equal(getTopicId('newsFlash'), 1);
  });

  it('routes unknown type to general topic', () => {
    assert.equal(getTopicId('unknown'), 1);
  });

  it('returns undefined when env var is not set', () => {
    delete process.env.TELEGRAM_TOPIC_ID_SECURITY;
    assert.equal(getTopicId('missiles'), undefined);
  });
});
