import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { buildSummaryLine } from '../utils/summaryLine.js';

describe('buildSummaryLine', () => {
  it('returns null for empty city list', () => {
    assert.equal(buildSummaryLine([]), null);
  });

  it('returns "N ערים" when all cities have no zone data', () => {
    // Unknown cities → zones.size = 0 → falls through to single-zone branch
    const result = buildSummaryLine(['עיר_לא_קיימת_1', 'עיר_לא_קיימת_2']);
    assert.equal(result, '2 ערים');
  });

  it('returns "N ערים" for single city with no zone data', () => {
    const result = buildSummaryLine(['עיר_לא_קיימת_xyz']);
    assert.equal(result, '1 ערים');
  });

  it('returns "N ערים" when all cities share one zone', () => {
    // אור יהודה + בני ברק → both in "דן"
    const result = buildSummaryLine(['אור יהודה', 'בני ברק']);
    assert.equal(result, '2 ערים');
  });

  it('returns "N אזורים · M ערים" for multi-zone alert', () => {
    // אור יהודה → דן, החותרים → חיפה → 2 distinct zones
    const result = buildSummaryLine(['אור יהודה', 'החותרים']);
    assert.equal(result, '2 אזורים · 2 ערים');
  });

  it('counts only unique zones, not total cities', () => {
    // Three cities: two in דן, one in חיפה → 2 zones, 3 cities
    const result = buildSummaryLine(['אור יהודה', 'בני ברק', 'החותרים']);
    assert.equal(result, '2 אזורים · 3 ערים');
  });

  it('mixes of zoned and unzoned cities — unzoned do not count toward zones', () => {
    // אור יהודה → דן (1 zone), עיר_לא_קיימת → no zone
    // zones.size = 1 → returns "N ערים", not zone count
    const result = buildSummaryLine(['אור יהודה', 'עיר_לא_קיימת']);
    assert.equal(result, '2 ערים');
  });
});
