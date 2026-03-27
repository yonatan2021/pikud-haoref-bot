import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SUPER_REGIONS, getSuperRegionByZone } from '../config/zones';

describe('zones config', () => {
  it('has 6 super-regions', () => {
    assert.equal(SUPER_REGIONS.length, 6);
  });

  it('every super-region has a name and at least one zone', () => {
    for (const sr of SUPER_REGIONS) {
      assert.ok(sr.name.length > 0, `super-region name is empty`);
      assert.ok(sr.zones.length > 0, `${sr.name} has no zones`);
    }
  });

  it('no zone appears in more than one super-region', () => {
    const seen = new Set<string>();
    for (const sr of SUPER_REGIONS) {
      for (const zone of sr.zones) {
        assert.ok(!seen.has(zone), `Zone "${zone}" appears in multiple super-regions`);
        seen.add(zone);
      }
    }
  });

  it('getSuperRegionByZone finds the correct region', () => {
    const sr = getSuperRegionByZone('גליל עליון');
    assert.ok(sr);
    assert.ok(sr.name.includes('צפון'));
  });

  it('getSuperRegionByZone returns undefined for unknown zone', () => {
    assert.equal(getSuperRegionByZone('אזור לא קיים'), undefined);
  });

  it('all known zones from cities data are covered', () => {
    const allZones = new Set(SUPER_REGIONS.flatMap((sr) => sr.zones));
    const expected = [
      'גליל עליון', 'גליל תחתון', 'גולן', 'קו העימות', 'קצרין',
      'חיפה', 'קריות', 'חוף הכרמל',
      'שרון', 'ירקון', 'דן', 'חפר', 'מנשה', 'ואדי ערה',
      'ירושלים', 'בית שמש', 'השפלה', 'דרום השפלה', 'לכיש', 'מערב לכיש',
      'עוטף עזה', 'מערב הנגב', 'מרכז הנגב', 'דרום הנגב', 'ערבה', 'ים המלח', 'אילת',
      'יהודה', 'שומרון', 'בקעה', 'בקעת בית שאן', 'תבור',
    ];
    for (const zone of expected) {
      assert.ok(allZones.has(zone), `Zone "${zone}" not found in any super-region`);
    }
  });
});
