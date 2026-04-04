import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { buildActionCard, formatAlertMessage } from '../telegramBot.js';

describe('buildActionCard', () => {
  it('returns non-null for missiles', () => {
    const result = buildActionCard('missiles');
    assert.notEqual(result, null);
    assert.ok(result!.includes('היכנסו למרחב מוגן'));
  });

  it('returns null for newsFlash', () => {
    assert.equal(buildActionCard('newsFlash'), null);
  });

  it('returns null for generalDrill', () => {
    assert.equal(buildActionCard('generalDrill'), null);
  });

  it('returns null for general', () => {
    assert.equal(buildActionCard('general'), null);
  });

  it('returns null for unknown', () => {
    assert.equal(buildActionCard('unknown'), null);
  });

  it('returns non-null for missilesDrill', () => {
    const result = buildActionCard('missilesDrill');
    assert.notEqual(result, null);
    assert.ok(result!.includes('היכנסו למרחב מוגן'));
  });

  it('returns non-null for earthQuake', () => {
    const result = buildActionCard('earthQuake');
    assert.notEqual(result, null);
  });

  it('returns non-null for terroristInfiltration', () => {
    const result = buildActionCard('terroristInfiltration');
    assert.notEqual(result, null);
  });

  it('returns non-null for hazardousMaterials', () => {
    const result = buildActionCard('hazardousMaterials');
    assert.notEqual(result, null);
  });

  it('uses getInstructionsPrefix from templateCache', () => {
    // The default prefix for missiles is '🛡' — it should appear in the output
    const result = buildActionCard('missiles');
    assert.ok(result!.includes('🛡'), 'should include instructions prefix from templateCache');
  });
});

describe('formatAlertMessage — action card integration', () => {
  it('includes action card as first line for shelter alerts (missiles)', () => {
    const alert = { type: 'missiles', cities: ['תל אביב'] };
    const result = formatAlertMessage(alert);
    const firstLine = result.split('\n')[0];
    assert.ok(firstLine.includes('היכנסו למרחב מוגן'), `Expected action card as first line: ${firstLine}`);
  });

  it('omits action card for newsFlash', () => {
    const alert = { type: 'newsFlash', cities: ['תל אביב'] };
    const result = formatAlertMessage(alert);
    assert.ok(!result.includes('היכנסו למרחב מוגן'), 'newsFlash should not have action card');
  });

  it('omits action card for generalDrill', () => {
    const alert = { type: 'generalDrill', cities: ['תל אביב'] };
    const result = formatAlertMessage(alert);
    assert.ok(!result.includes('היכנסו למרחב מוגן'), 'generalDrill should not have action card');
  });

  it('includes action card for missilesDrill', () => {
    const alert = { type: 'missilesDrill', cities: ['תל אביב'] };
    const result = formatAlertMessage(alert);
    assert.ok(result.includes('היכנסו למרחב מוגן'), 'missilesDrill should have action card');
  });
});
