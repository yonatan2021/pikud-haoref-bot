import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZONE_COLORS, getZoneColor } from '../config/zoneColors.js';
import { SUPER_REGIONS } from '../config/zones.js';

const allZoneNames = SUPER_REGIONS.flatMap((sr) => sr.zones);

describe('ZONE_COLORS', () => {
  it('has a color assigned for every zone', () => {
    for (const zone of allZoneNames) {
      assert.ok(ZONE_COLORS[zone], `Zone "${zone}" should have a color assigned`);
    }
  });

  it('covers all 33 zones', () => {
    assert.equal(allZoneNames.length, 33, 'SUPER_REGIONS should contain exactly 33 zones');
    assert.equal(Object.keys(ZONE_COLORS).length, 33, 'ZONE_COLORS should have 33 entries');
  });

  it('all colors are valid hex strings', () => {
    for (const [zone, color] of Object.entries(ZONE_COLORS)) {
      assert.match(color, /^#[0-9A-Fa-f]{6}$/, `Color for "${zone}" should be a valid hex color`);
    }
  });

  it('no duplicate colors among adjacent zones within the same super-region', () => {
    for (const sr of SUPER_REGIONS) {
      const colors = sr.zones.map((z) => ZONE_COLORS[z]);
      for (let i = 0; i < colors.length - 1; i++) {
        assert.notEqual(
          colors[i],
          colors[i + 1],
          `Adjacent zones "${sr.zones[i]}" and "${sr.zones[i + 1]}" in "${sr.name}" should not share a color`,
        );
      }
    }
  });
});

describe('getZoneColor', () => {
  it('returns a valid hex color for a known zone', () => {
    const color = getZoneColor(allZoneNames[0]);
    assert.match(color, /^#[0-9A-Fa-f]{6}$/);
  });

  it('returns fallback #FF0000 for unknown zone', () => {
    assert.equal(getZoneColor('nonExistentZone'), '#FF0000');
  });

  it('is deterministic — same zone always returns same color', () => {
    const zone = allZoneNames[5];
    const color1 = getZoneColor(zone);
    const color2 = getZoneColor(zone);
    assert.equal(color1, color2);
  });

  it('returns different colors for different zones', () => {
    const color1 = getZoneColor(allZoneNames[0]);
    const color2 = getZoneColor(allZoneNames[1]);
    assert.notEqual(color1, color2);
  });
});
