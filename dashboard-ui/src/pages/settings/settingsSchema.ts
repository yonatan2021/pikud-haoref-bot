/**
 * Single source of truth for all dashboard-managed settings.
 *
 * Every field in the Settings UI is rendered from an entry in SETTINGS_SCHEMA.
 * Adding a new setting = adding one object here + adding the key to backend
 * ALLOWED_KEYS in src/dashboard/routes/settings.ts.
 */

export type SettingType = 'number' | 'boolean' | 'string' | 'url' | 'select' | 'json' | 'template';

export type SettingTab =
  | 'bot'
  | 'channels'
  | 'maps'
  | 'whatsapp'
  | 'dm'
  | 'social'
  | 'groups'
  | 'system';

export interface SettingDef {
  key: string;
  tab: SettingTab;
  label: string;
  description: string;
  type: SettingType;
  defaultValue: string;
  hotReload: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: RegExp;
    patternError?: string;
    options?: { value: string; label: string }[];
    required?: boolean;
  };
  /** Display order within tab (lower = higher on page). */
  order: number;
}

export const SETTINGS_SCHEMA: readonly SettingDef[] = [
  // ── Bot ─────────────────────────────────────────
  {
    key: 'alert_window_seconds',
    tab: 'bot',
    label: 'חלון כפילויות (שניות)',
    description: 'כמה שניות ההתראה "פתוחה" לעדכונים מפיקוד העורף לפני שנחשבת כהתראה חדשה (30–600)',
    type: 'number',
    defaultValue: '120',
    hotReload: true,
    validation: { min: 30, max: 600 },
    order: 1,
  },
  {
    key: 'dm_queue_concurrency',
    tab: 'bot',
    label: 'מקביליות תור DM',
    description: 'כמה הודעות פרטיות נשלחות במקביל. גבוה יותר = שליחה מהירה אבל סיכון rate-limit. ברירת מחדל: 10, טווח: 1–50',
    type: 'number',
    defaultValue: '10',
    hotReload: true,
    validation: { min: 1, max: 50 },
    order: 3,
  },
  {
    key: 'quiet_hours_global',
    tab: 'bot',
    label: 'שעות שקט גלובליות',
    description: 'כבה התראות לכל המנויים בלילה',
    type: 'boolean',
    defaultValue: 'false',
    hotReload: true,
    order: 2,
  },

  // ── Channels & Routing ──────────────────────────
  {
    key: 'topic_id_security',
    tab: 'channels',
    label: 'נושא ביטחוני (🔴)',
    description: 'מזהה נושא (Topic ID) עבור התרעות ביטחוניות — טילים, כלי טיס, חדירה',
    type: 'number',
    defaultValue: '0',
    hotReload: true,
    validation: { min: 0 },
    order: 1,
  },
  {
    key: 'topic_id_nature',
    tab: 'channels',
    label: 'נושא אסונות טבע (🌍)',
    description: 'מזהה נושא עבור רעידת אדמה, צונאמי',
    type: 'number',
    defaultValue: '0',
    hotReload: true,
    validation: { min: 0 },
    order: 2,
  },
  {
    key: 'topic_id_environmental',
    tab: 'channels',
    label: 'נושא סביבתי (☢️)',
    description: 'מזהה נושא עבור חומרים מסוכנים, אירוע רדיולוגי',
    type: 'number',
    defaultValue: '0',
    hotReload: true,
    validation: { min: 0 },
    order: 3,
  },
  {
    key: 'topic_id_drills',
    tab: 'channels',
    label: 'נושא תרגילים (🔵)',
    description: 'מזהה נושא עבור כל סוגי התרגילים',
    type: 'number',
    defaultValue: '0',
    hotReload: true,
    validation: { min: 0 },
    order: 4,
  },
  {
    key: 'topic_id_general',
    tab: 'channels',
    label: 'נושא כללי (📢)',
    description: 'מזהה נושא עבור הודעות מיוחדות וכלליות',
    type: 'number',
    defaultValue: '0',
    hotReload: true,
    validation: { min: 0 },
    order: 5,
  },
  {
    key: 'topic_id_whatsapp',
    tab: 'channels',
    label: 'נושא WhatsApp (📲)',
    description: 'מזהה נושא ברירת מחדל להודעות שמועברות מ-WhatsApp',
    type: 'number',
    defaultValue: '0',
    hotReload: true,
    validation: { min: 0 },
    order: 6,
  },
  {
    key: 'topic_id_stories',
    tab: 'channels',
    label: 'נושא סיפורים מהמקלט (🏠)',
    description: 'מזהה נושא בערוץ לפרסום סיפורים שאושרו. 0 = כבוי. מזהה 1 אינו חוקי (שמור ב-Telegram)',
    type: 'number',
    defaultValue: '0',
    hotReload: true,
    validation: { min: 0 },
    order: 7,
  },
  {
    key: 'telegram_invite_link',
    tab: 'channels',
    label: 'קישור הזמנה לערוץ Telegram',
    description: 'הקישור שמוצג בכפתור "הצטרף לערוץ" בבוט. ריק = ללא כפתור',
    type: 'url',
    defaultValue: '',
    hotReload: true,
    order: 8,
  },
  {
    key: 'whatsapp_invite_link',
    tab: 'channels',
    label: 'קישור הזמנה לקבוצת WhatsApp',
    description: 'קישור הזמנה לקבוצת WhatsApp — מוצג בדף הנחיתה',
    type: 'url',
    defaultValue: '',
    hotReload: true,
    order: 9,
  },
  {
    key: 'telegram_forward_group_id',
    tab: 'channels',
    label: 'מזהה קבוצת העברת הודעות',
    description: 'מזהה קבוצה/ערוץ להעברת הודעות מ-WhatsApp. ריק = שימוש בערוץ הראשי',
    type: 'string',
    defaultValue: '',
    hotReload: true,
    order: 10,
  },
  {
    key: 'telegram_chat_id',
    tab: 'channels',
    label: 'מזהה ערוץ/קבוצה ראשי',
    description: 'מזהה הערוץ או הקבוצה הראשי בטלגרם (מספר שלילי לערוצים)',
    type: 'string',
    defaultValue: '',
    hotReload: false,
    order: 11,
  },

  // ── Maps ────────────────────────────────────────
  {
    key: 'mapbox_monthly_limit',
    tab: 'maps',
    label: 'מכסת Mapbox חודשית',
    description: 'מגבלת בקשות Mapbox חודשית. 0 או ריק = ללא מגבלה. מומלץ: 40,000',
    type: 'number',
    defaultValue: '',
    hotReload: true,
    validation: { min: 0 },
    order: 1,
  },
  {
    key: 'mapbox_image_cache_size',
    tab: 'maps',
    label: 'גודל מטמון מפות',
    description: 'כמה מפות שמורות בזיכרון לשימוש חוזר. שינוי ייכנס לתוקף לאחר הפעלה מחדש',
    type: 'number',
    defaultValue: '20',
    hotReload: false,
    validation: { min: 1, max: 200 },
    order: 2,
  },
  {
    key: 'mapbox_skip_drills',
    tab: 'maps',
    label: 'דלג על מפות לתרגילים',
    description: 'לא להציג מפת Mapbox בהתראות תרגיל — חוסך ממכסה חודשית',
    type: 'boolean',
    defaultValue: 'false',
    hotReload: true,
    order: 3,
  },

  // ── WhatsApp ────────────────────────────────────
  {
    key: 'whatsapp_enabled',
    tab: 'whatsapp',
    label: 'WhatsApp פעיל',
    description: 'הפעל/כבה את שירות הגישור מ-WhatsApp לטלגרם. שינוי ייכנס לתוקף לאחר הפעלה מחדש',
    type: 'boolean',
    defaultValue: 'false',
    hotReload: false,
    order: 1,
  },
  {
    key: 'whatsapp_map_debounce_seconds',
    tab: 'whatsapp',
    label: 'עיכוב שליחת מפה (שניות)',
    description: 'זמן המתנה לאחר העדכון האחרון לפני שליחת תמונת המפה. טקסט נשלח מיידית',
    type: 'number',
    defaultValue: '15',
    hotReload: true,
    validation: { min: 5, max: 60 },
    order: 2,
  },

  // ── DM Messages ─────────────────────────────────
  {
    key: 'all_clear_quiet_window_seconds',
    tab: 'dm',
    label: 'חלון שקט חזר (שניות)',
    description: 'כמה שניות ללא התראות חדשות באזור לפני שליחת "שקט חזר". ברירת מחדל: 600 (10 דקות). טווח: 60–3600',
    type: 'number',
    defaultValue: '600',
    hotReload: true,
    validation: { min: 60, max: 3600 },
    order: 0,
  },
  {
    key: 'all_clear_mode',
    tab: 'dm',
    label: 'אופן שליחת שקט חזר',
    description: 'לאחר 10 דקות ללא התראות חדשות באזור, ישלח "שקט חזר" לפי ההגדרה',
    type: 'select',
    defaultValue: 'dm',
    hotReload: true,
    validation: {
      options: [
        { value: 'dm', label: 'הודעה פרטית (DM) — למנויי האזור' },
        { value: 'channel', label: 'ערוץ/נושא — שידור ציבורי' },
        { value: 'both', label: 'שניהם — DM + ערוץ' },
      ],
    },
    order: 1,
  },
  {
    key: 'all_clear_topic_id',
    tab: 'dm',
    label: 'נושא לשקט חזר',
    description: 'מזהה נושא בערוץ להודעות שקט חזר. ריק = ערוץ ראשי. רלוונטי רק כשמצב "ערוץ" או "שניהם" פעיל',
    type: 'number',
    defaultValue: '',
    hotReload: true,
    validation: { min: 2 },
    order: 2,
  },
  {
    key: 'dm_all_clear_text',
    tab: 'dm',
    label: 'טקסט שקט חזר',
    description: 'ההודעה שנשלחת כשהתרעה מסתיימת. ברירת מחדל: "נשמו. אתם בטוחים. 🕊"',
    type: 'template',
    defaultValue: '',
    hotReload: true,
    order: 3,
  },
  {
    key: 'dm_relevance_in_area',
    tab: 'dm',
    label: 'תגית רלוונטיות — באזורך',
    description: 'הטקסט שמופיע כשההתראה באזור המגורים של המנוי. ברירת מחדל: "🔴 באזורך"',
    type: 'string',
    defaultValue: '',
    hotReload: true,
    order: 4,
  },
  {
    key: 'dm_relevance_nearby',
    tab: 'dm',
    label: 'תגית רלוונטיות — אזור קרוב',
    description: 'הטקסט כשההתראה באזור סמוך. ברירת מחדל: "🟡 באזור קרוב"',
    type: 'string',
    defaultValue: '',
    hotReload: true,
    order: 5,
  },
  {
    key: 'dm_relevance_not_area',
    tab: 'dm',
    label: 'תגית רלוונטיות — לא באזורך',
    description: 'הטקסט כשההתראה לא באזור המגורים. ברירת מחדל: "🟢 לא באזורך"',
    type: 'string',
    defaultValue: '',
    hotReload: true,
    order: 6,
  },
  {
    key: 'privacy_defaults',
    tab: 'dm',
    label: 'ברירות מחדל לפרטיות',
    description: 'אובייקט JSON עם ברירות המחדל לפרטיות מנויים חדשים (safety_status, banner, contact_count, group_alerts, quick_ok)',
    type: 'json',
    defaultValue: '{}',
    hotReload: true,
    order: 7,
  },

  // ── Social ──────────────────────────────────────
  {
    key: 'social_default_prompt_enabled',
    tab: 'social',
    label: 'בדיקת ביטחון (ברירת מחדל)',
    description: 'האם שיתוף סטטוס ביטחון מופעל כברירת מחדל למנויים חדשים',
    type: 'boolean',
    defaultValue: 'false',
    hotReload: true,
    order: 1,
  },
  {
    key: 'social_default_banner_enabled',
    tab: 'social',
    label: 'באנר חי (ברירת מחדל)',
    description: 'האם באנר "אני בטוח" מופעל כברירת מחדל',
    type: 'boolean',
    defaultValue: 'false',
    hotReload: true,
    order: 2,
  },
  {
    key: 'social_default_contact_count_enabled',
    tab: 'social',
    label: 'ספירת אנשי קשר (ברירת מחדל)',
    description: 'האם מוצג מספר אנשי הקשר שדיווחו כברירת מחדל',
    type: 'boolean',
    defaultValue: 'false',
    hotReload: true,
    order: 3,
  },
  {
    key: 'social_default_group_alerts_enabled',
    tab: 'social',
    label: 'התראות קבוצה (ברירת מחדל)',
    description: 'האם התראות קבוצה מופעלות כברירת מחדל',
    type: 'boolean',
    defaultValue: 'false',
    hotReload: true,
    order: 4,
  },
  {
    key: 'social_default_quick_ok_enabled',
    tab: 'social',
    label: 'כפתור מהיר "בסדר" (ברירת מחדל)',
    description: 'האם כפתור "אני בסדר" המהיר מופעל כברירת מחדל',
    type: 'boolean',
    defaultValue: 'false',
    hotReload: true,
    order: 5,
  },
  {
    key: 'social_banner_reminder_text',
    tab: 'social',
    label: 'טקסט תזכורת באנר',
    description: 'ההודעה שנשלחת כתזכורת לעדכון סטטוס הביטחון',
    type: 'template',
    defaultValue: '',
    hotReload: true,
    order: 6,
  },
  {
    key: 'social_quick_ok_button_label',
    tab: 'social',
    label: 'תווית כפתור "בסדר"',
    description: 'הטקסט שמוצג על כפתור אישור מהיר',
    type: 'string',
    defaultValue: '',
    hotReload: true,
    order: 7,
  },
  {
    key: 'social_quick_ok_confirm_text',
    tab: 'social',
    label: 'טקסט אישור "בסדר"',
    description: 'ההודעה שמוצגת למשתמש אחרי לחיצה על כפתור "אני בסדר"',
    type: 'string',
    defaultValue: '',
    hotReload: true,
    order: 8,
  },
  {
    key: 'social_quick_ok_broadcast_text',
    tab: 'social',
    label: 'טקסט שידור "בסדר" לאנשי קשר',
    description: 'ההודעה שנשלחת לאנשי הקשר כשמישהו מדווח שהוא בסדר',
    type: 'string',
    defaultValue: '',
    hotReload: true,
    order: 9,
  },
  {
    key: 'social_contact_count_line_template',
    tab: 'social',
    label: 'תבנית שורת ספירת אנשי קשר',
    description: 'תבנית הטקסט שמציגה כמה אנשי קשר דיווחו. {{count}} = מספר',
    type: 'template',
    defaultValue: '',
    hotReload: true,
    order: 10,
  },
  {
    key: 'social_banner_stale_prompt_minutes',
    tab: 'social',
    label: 'דקות עד תזכורת באנר',
    description: 'כמה דקות לחכות לפני שליחת תזכורת לעדכון סטטוס ביטחון',
    type: 'number',
    defaultValue: '30',
    hotReload: true,
    validation: { min: 5, max: 1440 },
    order: 11,
  },

  // ── Groups ──────────────────────────────────────
  {
    key: 'groups_max_per_user',
    tab: 'groups',
    label: 'מקסימום קבוצות למשתמש',
    description: 'כמה קבוצות חוסן משתמש יכול ליצור. מינימום 1',
    type: 'number',
    defaultValue: '3',
    hotReload: true,
    validation: { min: 1, max: 50 },
    order: 1,
  },
  {
    key: 'groups_max_members',
    tab: 'groups',
    label: 'מקסימום חברים בקבוצה',
    description: 'גבול עליון לחברים בקבוצת חוסן יחידה. מינימום 1',
    type: 'number',
    defaultValue: '20',
    hotReload: true,
    validation: { min: 1, max: 500 },
    order: 2,
  },
  {
    key: 'groups_invite_code_ttl_hours',
    tab: 'groups',
    label: 'תוקף קוד הזמנה (שעות)',
    description: 'כמה שעות קוד הזמנה לקבוצה תקף. 0 = ללא תפוגה',
    type: 'number',
    defaultValue: '48',
    hotReload: true,
    validation: { min: 0, max: 8760 },
    order: 3,
  },

  // ── System ──────────────────────────────────────
  {
    key: 'telegram_listener_enabled',
    tab: 'system',
    label: 'Telegram Listener פעיל',
    description: 'הפעלת האזנה ל-Telegram (GramJS MTProto). שינוי דורש הפעלה מחדש',
    type: 'boolean',
    defaultValue: 'false',
    hotReload: false,
    order: 1,
  },
  {
    key: 'landing_url',
    tab: 'system',
    label: 'כתובת דף נחיתה',
    description: 'URL של דף הנחיתה הציבורי',
    type: 'url',
    defaultValue: '',
    hotReload: true,
    order: 2,
  },
];

/** Settings for a tab, sorted by order. */
export function getTabSettings(tab: SettingTab): readonly SettingDef[] {
  return SETTINGS_SCHEMA
    .filter(s => s.tab === tab)
    .sort((a, b) => a.order - b.order);
}

/** Schema definition for a key, or undefined if not in registry. */
export function getSettingDef(key: string): SettingDef | undefined {
  return SETTINGS_SCHEMA.find(s => s.key === key);
}

/** All keys in the schema — useful for useSettingsForm. */
export const ALL_SETTING_KEYS: readonly string[] = SETTINGS_SCHEMA.map(s => s.key);

/** Map of key → default value — useful for useSettingsForm. */
export const ALL_SETTING_DEFAULTS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(SETTINGS_SCHEMA.map(s => [s.key, s.defaultValue]))
);

/** Tab display order + icon identifier (looked up in SettingsTabBar ICON_MAP). */
export const SETTINGS_TABS: readonly { id: SettingTab; label: string; icon: string }[] = [
  { id: 'bot',      label: 'בוט',              icon: 'Bot' },
  { id: 'channels', label: 'ערוצים וניתוב',    icon: 'Radio' },
  { id: 'maps',     label: 'מפות',             icon: 'Map' },
  { id: 'whatsapp', label: 'WhatsApp',         icon: 'MessageCircle' },
  { id: 'dm',       label: 'הודעות',           icon: 'Mail' },
  { id: 'social',   label: 'חברתי',            icon: 'Heart' },
  { id: 'groups',   label: 'קבוצות',           icon: 'Users' },
  { id: 'system',   label: 'מערכת',            icon: 'Settings' },
];
