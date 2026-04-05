import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDensityLabel } from '../config/alertDensity';

describe('getDensityLabel', () => {
  it('returns null when fewer than 5 data points', () => {
    assert.equal(getDensityLabel(10, []), null);
    assert.equal(getDensityLabel(10, [5]), null);
    assert.equal(getDensityLabel(10, [5, 3, 8, 2]), null);
  });

  it('returns "רגיל" when today is below the 90th percentile', () => {
    // 10 values: [1,1,1,1,1,1,1,1,1,10] → p90 = sorted[9] = 10
    // today=5 is not > 10 → רגיל
    const counts = [1, 1, 1, 1, 1, 1, 1, 1, 1, 10];
    assert.equal(getDensityLabel(5, counts), 'רגיל');
  });

  it('returns "חריג" when today is above the 90th percentile', () => {
    // 10 values: [1,1,1,1,1,1,1,1,1,10] → sorted p90 index = floor(10*0.9) = 9 → p90=10
    // today=15 > 10 → חריג
    const counts = [1, 1, 1, 1, 1, 1, 1, 1, 1, 10];
    assert.equal(getDensityLabel(15, counts), 'חריג');
  });

  it('returns "רגיל" when today equals the 90th percentile (not strictly greater)', () => {
    const counts = [1, 1, 1, 1, 1, 1, 1, 1, 1, 10];
    assert.equal(getDensityLabel(10, counts), 'רגיל');
  });

  it('returns "רגיל" when all daily counts are the same and today matches', () => {
    const counts = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    assert.equal(getDensityLabel(5, counts), 'רגיל');
  });

  it('returns "חריג" when all daily counts are zero and today is positive', () => {
    const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    assert.equal(getDensityLabel(1, counts), 'חריג');
  });

  it('returns "רגיל" when today is 0 and counts are all positive', () => {
    const counts = [5, 5, 5, 5, 5];
    assert.equal(getDensityLabel(0, counts), 'רגיל');
  });

  it('handles exactly 5 data points (minimum threshold)', () => {
    const counts = [2, 4, 6, 8, 10];
    // sorted: [2,4,6,8,10] → p90 index = floor(5*0.9)=4 → p90=10
    assert.equal(getDensityLabel(11, counts), 'חריג');
    assert.equal(getDensityLabel(9, counts), 'רגיל');
  });
});
