import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isDrillAlert, shouldSkipMap } from '../alertHelpers';

describe('isDrillAlert', () => {
  it('returns true for types ending in "Drill"', () => {
    assert.equal(isDrillAlert('missilesDrill'), true);
    assert.equal(isDrillAlert('generalDrill'), true);
  });

  it('returns false for non-drill types', () => {
    assert.equal(isDrillAlert('missiles'), false);
    assert.equal(isDrillAlert('newsFlash'), false);
    assert.equal(isDrillAlert('earthquakeDrillExtra'), false);
  });
});

describe('shouldSkipMap', () => {
  let savedSkipDrills: string | undefined;

  beforeEach(() => {
    savedSkipDrills = process.env.MAPBOX_SKIP_DRILLS;
    delete process.env.MAPBOX_SKIP_DRILLS;
  });

  afterEach(() => {
    if (savedSkipDrills !== undefined) {
      process.env.MAPBOX_SKIP_DRILLS = savedSkipDrills;
    } else {
      delete process.env.MAPBOX_SKIP_DRILLS;
    }
  });

  it('always skips map for newsFlash', () => {
    assert.equal(shouldSkipMap('newsFlash'), true);
  });

  it('does not skip map for non-drill types when MAPBOX_SKIP_DRILLS is not set', () => {
    assert.equal(shouldSkipMap('missiles'), false);
  });

  it('does not skip map for drills when MAPBOX_SKIP_DRILLS is not "true"', () => {
    process.env.MAPBOX_SKIP_DRILLS = 'false';
    assert.equal(shouldSkipMap('missilesDrill'), false);
  });

  it('skips map for drill types when MAPBOX_SKIP_DRILLS=true', () => {
    process.env.MAPBOX_SKIP_DRILLS = 'true';
    assert.equal(shouldSkipMap('missilesDrill'), true);
    assert.equal(shouldSkipMap('generalDrill'), true);
  });

  it('does not skip map for non-drill types even when MAPBOX_SKIP_DRILLS=true', () => {
    process.env.MAPBOX_SKIP_DRILLS = 'true';
    assert.equal(shouldSkipMap('missiles'), false);
  });
});
