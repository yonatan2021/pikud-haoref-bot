import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { getRelevanceIndicator, buildAlertDmMessage, buildNewsFlashDmMessage } from '../services/dmDispatcher.js';

describe('getRelevanceIndicator', () => {
  it('returns null when homeCity is null', () => {
    assert.equal(getRelevanceIndicator(null, ['תל אביב']), null);
  });

  it('returns null when alertCities is empty', () => {
    assert.equal(getRelevanceIndicator('תל אביב', []), null);
  });

  it('returns red indicator when homeCity is in alert cities', () => {
    const result = getRelevanceIndicator('אבו גוש', ['אבו גוש', 'נהריה']);
    assert.equal(result, '🔴 באזורך');
  });

  it('returns yellow indicator when homeCity shares zone with alert city', () => {
    // אבו גוש and אביעזר are both in zone "בית שמש"
    const result = getRelevanceIndicator('אבו גוש', ['אביעזר']);
    assert.equal(result, '🟡 באזור קרוב');
  });

  it('returns green indicator when no geographic match', () => {
    // אבו גוש is in "בית שמש", נהריה is in "קו העימות" — different zones
    const result = getRelevanceIndicator('אבו גוש', ['נהריה']);
    assert.equal(result, '🟢 לא באזורך');
  });

  it('returns green for homeCity with no zone data', () => {
    const result = getRelevanceIndicator('עיר_לא_קיימת', ['אבו גוש']);
    assert.equal(result, '🟢 לא באזורך');
  });
});

describe('buildAlertDmMessage — relevance indicator', () => {
  it('prepends red indicator when homeCity is in alert cities', () => {
    const alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildAlertDmMessage(alert, 'אבו גוש');
    assert.ok(msg.startsWith('🔴 באזורך'), `Expected to start with red indicator: ${msg}`);
  });

  it('prepends green indicator when homeCity is not in zone', () => {
    const alert = { type: 'missiles', cities: ['נהריה'] };
    const msg = buildAlertDmMessage(alert, 'אבו גוש');
    assert.ok(msg.startsWith('🟢 לא באזורך'), `Expected to start with green indicator: ${msg}`);
  });

  it('does not include indicator when homeCity is null', () => {
    const alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildAlertDmMessage(alert, null);
    assert.ok(!msg.includes('באזורך\n🔴'), 'should not have relevance indicator');
    assert.ok(!msg.includes('🟢'), 'should not have green indicator');
  });

  it('does not include indicator when homeCity is undefined (default)', () => {
    const alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildAlertDmMessage(alert);
    assert.ok(!msg.includes('🟢'), 'should not have indicator without homeCity');
  });
});

describe('buildNewsFlashDmMessage — relevance indicator', () => {
  it('prepends indicator when homeCity is set and alert has cities', () => {
    const alert = { type: 'newsFlash', cities: ['אבו גוש'] };
    const msg = buildNewsFlashDmMessage(alert, 'אבו גוש');
    const lines = msg.split('\n');
    assert.equal(lines[0], '🔴 באזורך', 'first line should be relevance indicator');
  });

  it('omits indicator when homeCity is null', () => {
    const alert = { type: 'newsFlash', cities: ['אבו גוש'] };
    const msg = buildNewsFlashDmMessage(alert, null);
    assert.ok(msg.startsWith('📢'), 'should start with newsFlash emoji when no homeCity');
  });
});
