import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLegendMessage } from '../bot/legendHandler.js';
import { SUPER_REGIONS } from '../config/zones.js';

describe('buildLegendMessage', () => {
  it('includes all 6 super-region names', () => {
    const message = buildLegendMessage();
    for (const sr of SUPER_REGIONS) {
      assert.ok(message.includes(sr.name), `Should include super-region "${sr.name}"`);
    }
  });

  it('includes all 33 zone names', () => {
    const message = buildLegendMessage();
    const allZones = SUPER_REGIONS.flatMap((sr) => sr.zones);
    assert.equal(allZones.length, 33, 'SUPER_REGIONS should have 33 zones total');
    for (const zone of allZones) {
      assert.ok(message.includes(zone), `Should include zone "${zone}"`);
    }
  });

  it('is valid HTML — no unescaped angle brackets in zone names', () => {
    const message = buildLegendMessage();
    // Strip known HTML tags, then verify no stray < or > remain (would indicate injection)
    const stripped = message.replace(/<\/?b>/g, '').replace(/<\/?i>/g, '');
    assert.ok(!stripped.includes('<'), `Stripped message should not contain < : ${stripped}`);
    assert.ok(!stripped.includes('>'), `Stripped message should not contain > : ${stripped}`);
  });

  it('starts with the legend header', () => {
    const message = buildLegendMessage();
    assert.ok(message.startsWith('🗺'), 'Message should start with map emoji');
    assert.ok(message.includes('מקרא אזורים'), 'Message should include header text');
  });
});
