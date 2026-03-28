import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMainMenu } from '../bot/menuHandler';

describe('buildMainMenu — last alert indicator', () => {
  it('shows 📡 line when lastAlert is provided', () => {
    const { text } = buildMainMenu(3, { type: 'missiles', fired_at: '2026-03-28 10:00:00' });
    assert.ok(text.includes('📡'), 'should include 📡 indicator');
    assert.ok(text.includes('🔴'), 'should include missile emoji');
    assert.ok(text.includes('התרעת טילים'), 'should include Hebrew alert type');
  });

  it('does not show 📡 line when lastAlert is undefined', () => {
    const { text } = buildMainMenu(0, undefined);
    assert.ok(!text.includes('📡'), 'should not include 📡 when no alert history');
  });

  it('shows city count in text when cityCount > 0', () => {
    const { text } = buildMainMenu(5);
    assert.ok(text.includes('5'), 'should include city count');
  });

  it('shows fallback ⚠️ for unknown alert type', () => {
    const { text } = buildMainMenu(0, { type: 'unknownXyz', fired_at: '2026-03-28 10:00:00' });
    assert.ok(text.includes('⚠️'), 'should fallback to ⚠️ for unknown type');
  });
});
