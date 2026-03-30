<div dir="rtl">

# סוגי התראות

## קטגוריות

המערכת מחלקת את ההתראות ל-5 קטגוריות. כל קטגוריה ניתנת לניתוב לנושא (thread) נפרד בפורום Telegram.

| קטגוריה | emoji | משתנה סביבה לנושא | עובר שעות שקט? |
|---------|-------|------------------|----------------|
| ביטחוני | 🔴 | `TELEGRAM_TOPIC_ID_SECURITY` | **תמיד** |
| אסונות טבע | 🌍 | `TELEGRAM_TOPIC_ID_NATURE` | **תמיד** |
| סביבתי | ☢️ | `TELEGRAM_TOPIC_ID_ENVIRONMENTAL` | **תמיד** |
| תרגילים | 🔵 | `TELEGRAM_TOPIC_ID_DRILLS` | נחסם בשעות שקט |
| הודעות כלליות | 📢 | `TELEGRAM_TOPIC_ID_GENERAL` | נחסם בשעות שקט |

---

## סוגי התראות — רשימה מלאה

| alert_type (string) | שם עברי | emoji | קטגוריה |
|---------------------|---------|-------|---------|
| `missiles` | התרעת טילים | 🔴 | ביטחוני |
| `hostileAircraftIntrusion` | חדירת כלי טיס עוין | 🔴 | ביטחוני |
| `terroristInfiltration` | חדירת מחבלים | 🔴 | ביטחוני |
| `earthQuake` | רעידת אדמה | 🌍 | אסונות טבע |
| `tsunami` | צונאמי | 🌍 | אסונות טבע |
| `hazardousMaterials` | חומרים מסוכנים | ☢️ | סביבתי |
| `radiologicalEvent` | אירוע רדיולוגי | ☢️ | סביבתי |
| `missilesDrill` | תרגיל — התרעת טילים | 🔵 | תרגילים |
| `earthQuakeDrill` | תרגיל — רעידת אדמה | 🔵 | תרגילים |
| `tsunamiDrill` | תרגיל — צונאמי | 🔵 | תרגילים |
| `hostileAircraftIntrusionDrill` | תרגיל — חדירת כלי טיס | 🔵 | תרגילים |
| `hazardousMaterialsDrill` | תרגיל — חומרים מסוכנים | 🔵 | תרגילים |
| `terroristInfiltrationDrill` | תרגיל — חדירת מחבלים | 🔵 | תרגילים |
| `radiologicalEventDrill` | תרגיל — אירוע רדיולוגי | 🔵 | תרגילים |
| `generalDrill` | תרגיל כללי | 🔵 | תרגילים |
| `newsFlash` | הודעה מיוחדת | 📢 | הודעות כלליות |
| `general` | התרעה כללית | 📢 | הודעות כלליות |
| `unknown` | התרעה | 📢 | הודעות כלליות |

---

## התנהגות מיוחדת לפי סוג

### תרגילים (`*Drill`, `generalDrill`)
- **שעות שקט:** תרגילים **נחסמים** בשעות 23:00–06:00 (שעון ישראל) אם המנוי הפעיל שעות שקט.
- **Mute:** תרגילים **נחסמים** כשמנוי בוחר snooze (השתקה זמנית).
- **`MAPBOX_SKIP_DRILLS=true`:** שולח תרגילים ללא תמונת מפה (חוסך quota Mapbox).

### הודעה מיוחדת (`newsFlash`)
- **ללא ערים (cityless):** `newsFlash` ארצי שה-API שולח ללא רשימת ערים — המערכת מטפלת בו דרך `pollCitylessNewsFlash()` במקביל לסריקה הרגילה.
- **ללא prefix:** הודעת ה-`newsFlash` מציגה את תוכן ההודעה ישירות (ללא label) — `instructionsPrefix` הוא `''`. התוכן מוצג **לפני** רשימת הערים כדי שיהיה גלוי בהתראת ה-push.
- **ב-DM:** נשלחת כהודעת newsFlash מיוחדת עם שם האזורים הנוגעים.

### ביטחוני + אסונות טבע + סביבתי
- **תמיד עוברים** — ממשיכים לשידור ולמנויים גם אם:
  - שעות שקט פעילות
  - Mute (snooze) מופעל
  - כל הגדרה אחרת של המשתמש

---

## התאמת תבניות (Templates)

ניתן לדרוס את ה-emoji, הכותרת העברית, וה-prefix של כל סוג התראה דרך לוח הבקרה — ללא צורך בשינוי קוד.

**מסלול ה-API:**

```http
PATCH /api/messages/:alertType
Content-Type: application/json

{
  "emoji": "🚀",
  "titleHe": "טיל בליסטי",
  "instructionsPrefix": "🏃 פנו מיידית למרחב מוגן"
}
```

השינויים נשמרים בטבלת `message_templates` ב-SQLite ונכנסים לתוקף מיידי (ללא restart).

**איפוס לברירת מחדל:**

```http
DELETE /api/messages/:alertType
```

---

## הוספת סוג התראה חדש

כשפיקוד העורף מוסיף סוג חדש, יש לעדכן 3 קבצים:

**1. `src/config/alertTypeDefaults.ts`** — הוספה ל-`ALL_ALERT_TYPES` ולמילון ברירות המחדל:

```typescript
// הוסף לרשימה
export const ALL_ALERT_TYPES = [
  // ... קיים ...
  'newAlertType',
] as const;

// הוסף ברירת מחדל
export const DEFAULT_ALERT_TYPE_HE: Record<AlertType, string> = {
  // ... קיים ...
  newAlertType: 'שם בעברית',
};
```

**2. `src/topicRouter.ts`** — ניתוב הסוג החדש לנושא המתאים:

```typescript
function getCategoryForType(alertType: string): Category {
  // הוסף למפה המתאימה
  if (['missiles', 'hostileAircraftIntrusion', 'newAlertType'].includes(alertType)) {
    return 'security';
  }
  // ...
}
```

**3. `src/services/dmDispatcher.ts`** — אם צריך להתנהג אחרת בשעות שקט:

```typescript
function isSecurityAlert(alertType: string): boolean {
  return ['missiles', 'hostileAircraftIntrusion', 'newAlertType'].includes(alertType);
}
```

</div>
