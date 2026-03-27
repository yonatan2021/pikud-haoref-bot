export interface SuperRegion {
  name: string;
  zones: string[];
}

export const SUPER_REGIONS: SuperRegion[] = [
  {
    name: '🌲 צפון',
    zones: ['גליל עליון', 'גליל תחתון', 'גולן', 'קו העימות', 'קצרין', 'יערות הכרמל', 'תבור', 'בקעת בית שאן'],
  },
  {
    name: '🏙️ חיפה וכרמל',
    zones: ['חיפה', 'קריות', 'חוף הכרמל'],
  },
  {
    name: '🌆 מרכז',
    zones: ['שרון', 'ירקון', 'דן', 'חפר', 'מנשה', 'ואדי ערה'],
  },
  {
    name: '🕍 ירושלים והסביבה',
    zones: ['ירושלים', 'בית שמש', 'השפלה', 'דרום השפלה', 'לכיש', 'מערב לכיש'],
  },
  {
    name: '🏜️ דרום',
    zones: ['עוטף עזה', 'מערב הנגב', 'מרכז הנגב', 'דרום הנגב', 'ערבה', 'ים המלח', 'אילת'],
  },
  {
    name: '⛰️ יהודה ושומרון',
    zones: ['יהודה', 'שומרון', 'בקעה'],
  },
];

export function getSuperRegionByZone(zoneName: string): SuperRegion | undefined {
  return SUPER_REGIONS.find((sr) => sr.zones.includes(zoneName));
}
