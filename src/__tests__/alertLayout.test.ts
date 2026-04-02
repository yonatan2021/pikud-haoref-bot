import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { buildAlertLayout } from '../config/alertLayout.js';
import type { Alert } from '../types.js';

describe('buildAlertLayout', () => {
  it('returns all expected fields for a missiles alert', () => {
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש', 'נהריה'] };
    const layout = buildAlertLayout(alert);

    assert.ok(layout.actionCard !== null, 'missiles should have action card');
    assert.equal(layout.emoji, '🔴');
    assert.ok(layout.titleHe.length > 0);
    assert.ok(/\d{2}:\d{2}/.test(layout.time), 'should have HH:MM time');
    assert.equal(layout.cityCount, 2);
    assert.ok(layout.summaryLine.includes('2 ערים'));
    assert.ok(layout.summaryLine.includes('אזורים'));
    assert.ok(layout.zoneSections.length > 0);
  });

  it('returns null actionCard for newsFlash', () => {
    const alert: Alert = { type: 'newsFlash', cities: ['אבו גוש'] };
    const layout = buildAlertLayout(alert);
    assert.equal(layout.actionCard, null);
  });

  it('returns "ברחבי הארץ" summary for empty cities', () => {
    const alert: Alert = { type: 'missiles', cities: [] };
    const layout = buildAlertLayout(alert);
    assert.equal(layout.summaryLine, 'ברחבי הארץ');
    assert.equal(layout.cityCount, 0);
    assert.equal(layout.zoneSections.length, 0);
  });

  it('sorts zone sections by minCountdown ascending', () => {
    // החותרים → "חיפה" (60s), אור יהודה → "דן" (90s)
    const alert: Alert = { type: 'missiles', cities: ['אור יהודה', 'החותרים'] };
    const layout = buildAlertLayout(alert);

    assert.ok(layout.zoneSections.length >= 2);
    assert.ok(
      layout.zoneSections[0].minCountdown <= layout.zoneSections[1].minCountdown,
      'first zone should have lower or equal countdown'
    );
  });

  it('includes urgency emoji and label in zone sections', () => {
    // החותרים → "חיפה" (60s) → מהיר/🟡
    const alert: Alert = { type: 'missiles', cities: ['החותרים'] };
    const layout = buildAlertLayout(alert);

    const haifaSection = layout.zoneSections.find(s => s.zone === 'חיפה');
    assert.ok(haifaSection, 'should have חיפה zone section');
    assert.equal(haifaSection!.urgencyEmoji, '🟡');
    assert.equal(haifaSection!.urgencyLabel, 'מהיר');
  });

  it('places unzoned cities in unzonedCities array', () => {
    const alert: Alert = { type: 'missiles', cities: ['עיר_לא_קיימת'] };
    const layout = buildAlertLayout(alert);
    assert.ok(layout.unzonedCities.includes('עיר_לא_קיימת'));
    assert.equal(layout.zoneSections.length, 0);
  });

  it('includes instructions and prefix when present', () => {
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש'], instructions: 'היכנסו למרחב מוגן' };
    const layout = buildAlertLayout(alert);
    assert.equal(layout.instructions, 'היכנסו למרחב מוגן');
    assert.ok(layout.instructionsPrefix.length > 0);
  });

  it('returns null instructions when not present', () => {
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const layout = buildAlertLayout(alert);
    assert.equal(layout.instructions, null);
  });
});
