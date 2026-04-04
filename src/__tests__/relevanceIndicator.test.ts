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

  it('returns 🔴 באזורך when homeCity is directly in alert cities', () => {
    // אור יהודה is a real city in cities.json
    const result = getRelevanceIndicator('אור יהודה', ['אור יהודה', 'בני ברק']);
    assert.equal(result, '🔴 באזורך');
  });

  it('returns 🟡 באזור קרוב when homeCity shares a zone with an alert city', () => {
    // אור יהודה and בני ברק are both in the "דן" zone
    const result = getRelevanceIndicator('אור יהודה', ['בני ברק']);
    assert.equal(result, '🟡 באזור קרוב');
  });

  it('returns 🟢 לא באזורך when no geographic match', () => {
    // אילת has a different zone from דן cities
    const result = getRelevanceIndicator('אילת', ['אור יהודה', 'בני ברק']);
    assert.equal(result, '🟢 לא באזורך');
  });

  it('returns 🟢 לא באזורך when homeCity has no zone data', () => {
    const result = getRelevanceIndicator('עיר לא קיימת בכלל', ['אור יהודה']);
    assert.equal(result, '🟢 לא באזורך');
  });
});

describe('buildAlertDmMessage — relevance indicator', () => {
  it('prepends 🔴 באזורך when homeCity is in alert cities', () => {
    const alert = { type: 'missiles', cities: ['אור יהודה'], instructions: undefined };
    const result = buildAlertDmMessage(alert, 'אור יהודה');
    assert.ok(result.startsWith('🔴 באזורך'), `Expected 🔴 first line: ${result}`);
  });

  it('prepends 🟢 לא באזורך when homeCity is not in zone', () => {
    const alert = { type: 'missiles', cities: ['אור יהודה'], instructions: undefined };
    const result = buildAlertDmMessage(alert, 'אילת');
    assert.ok(result.startsWith('🟢 לא באזורך'), `Expected 🟢 first line: ${result}`);
  });

  it('omits indicator when homeCity is null', () => {
    const alert = { type: 'missiles', cities: ['אור יהודה'], instructions: undefined };
    const result = buildAlertDmMessage(alert, null);
    const firstLine = result.split('\n')[0];
    assert.ok(firstLine !== '🔴 באזורך' && firstLine !== '🟡 באזור קרוב' && firstLine !== '🟢 לא באזורך',
      `First line should not be a standalone relevance indicator: ${firstLine}`);
  });

  it('omits indicator when homeCity is undefined (default)', () => {
    const alert = { type: 'missiles', cities: ['אור יהודה'], instructions: undefined };
    const result = buildAlertDmMessage(alert);
    const firstLine = result.split('\n')[0];
    assert.ok(firstLine !== '🔴 באזורך' && firstLine !== '🟡 באזור קרוב' && firstLine !== '🟢 לא באזורך',
      `First line should not be a standalone relevance indicator: ${firstLine}`);
  });
});

describe('buildNewsFlashDmMessage — relevance indicator', () => {
  it('prepends indicator when homeCity is set and alert has cities', () => {
    const alert = { type: 'newsFlash', cities: ['אור יהודה'], instructions: 'הודעה' };
    const result = buildNewsFlashDmMessage(alert, 'אור יהודה');
    assert.ok(result.startsWith('🔴 באזורך'), `Expected 🔴 first line: ${result}`);
  });

  it('omits indicator when homeCity is null', () => {
    const alert = { type: 'newsFlash', cities: ['אור יהודה'], instructions: 'הודעה' };
    const result = buildNewsFlashDmMessage(alert, null);
    assert.ok(!result.startsWith('🔴') && !result.startsWith('🟡') && !result.startsWith('🟢'),
      `Should not start with relevance emoji: ${result}`);
  });
});
