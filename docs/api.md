<div dir="rtl">

# ממשק ה-API של לוח הבקרה

לוח הבקרה חשוף על הפורט `DASHBOARD_PORT` (ברירת מחדל: `4000`). כל מסלולי ה-API מוגנים באימות cookie — יש להתחבר תחילה דרך `/auth/login`.

---

## אימות

### `POST /auth/login`

התחברות ללוח הבקרה. מגדיר cookie מאובטח בתגובה מוצלחת.

**גוף הבקשה:**

```json
{
  "password": "הסיסמה שהוגדרה ב-DASHBOARD_SECRET"
}
```

**תגובה מוצלחת (200):**

```json
{ "ok": true }
```

**תגובה שגויה (401):**

```json
{ "error": "סיסמה שגויה" }
```

ה-cookie נקרא `dashboard_token`, מסוג `httpOnly`, בתוקף ל-7 ימים.

---

### `POST /auth/logout`

מתנתק ומבטל את ה-token הנוכחי מיד.

**תגובה (200):**

```json
{ "ok": true }
```

---

## סטטיסטיקות — `/api/stats`

### `GET /api/stats/health`

מידע עדכני על מצב הבוט.

**תגובה:**

```json
{
  "uptime": 3600,
  "lastAlertAt": "2026-03-29T14:32:11Z",
  "lastPollAt": "2026-03-29T14:32:15Z",
  "alertsToday": 7
}
```

> **הערה:** `alertsToday` מחושב לפי חצות UTC — מתאפס 2–3 שעות לפני חצות שעון ישראל.

---

### `GET /api/stats/overview`

סיכום כולל לדף הראשי של לוח הבקרה.

**תגובה:**

```json
{
  "totalSubscribers": 142,
  "totalSubscriptions": 891,
  "alertsToday": 3,
  "alertsYesterday": 11,
  "alertsLast7Days": 47,
  "alertsPrev7Days": 39,
  "mapboxMonth": 1204
}
```

---

### `GET /api/stats/alerts`

היסטוריית התראות עם אפשרויות סינון ומיון.

**פרמטרי שאילתה:**

| פרמטר | סוג | ברירת מחדל | תיאור |
|-------|-----|-----------|--------|
| `type` | string | — | סינון לפי סוג מדויק (למשל `missiles`) |
| `category` | string | — | סינון לפי קטגוריה (מקבץ מספר סוגים) |
| `city` | string | — | חיפוש חלקי בשם עיר |
| `days` | number | `7` | טווח ימים (1–365) |
| `limit` | number | `100` | כמות תוצאות מקסימלית |
| `offset` | number | `0` | דילוג לעימוד |

**תגובה:**

```json
[
  {
    "id": 4821,
    "type": "missiles",
    "cities": ["תל אביב", "רמת גן", "גבעתיים"],
    "instructions": "היכנסו למרחב המוגן",
    "fired_at": "2026-03-29T14:31:55Z"
  }
]
```

---

### `GET /api/stats/alerts/by-category`

כמות התראות לפי קטגוריה ויום — לגרף בלוח הבקרה.

**תגובה:**

```json
[
  { "type": "missiles", "count": 5, "day": "2026-03-28" },
  { "type": "generalDrill", "count": 2, "day": "2026-03-29" }
]
```

---

### `GET /api/stats/alerts/top-cities`

10 הערים עם הכי הרבה התראות (7 ימים אחרונים).

**תגובה:**

```json
[
  { "city": "אשקלון", "count": 18 },
  { "city": "שדרות", "count": 14 }
]
```

---

## מנויים — `/api/subscribers`

### `GET /api/subscribers`

רשימת מנויים עם חיפוש ועימוד.

**פרמטרי שאילתה:**

| פרמטר | סוג | ברירת מחדל | תיאור |
|-------|-----|-----------|--------|
| `search` | string | — | חיפוש לפי chat_id או שם עיר |
| `limit` | number | `50` | מקסימום 200 |
| `offset` | number | `0` | דילוג לעימוד |

**תגובה:**

```json
{
  "data": [
    {
      "chat_id": 123456789,
      "format": "short",
      "quiet_hours_enabled": 0,
      "created_at": "2026-01-15T10:20:00Z",
      "city_count": 4
    }
  ],
  "total": 142
}
```

---

### `GET /api/subscribers/export/csv`

ייצוא כל המנויים לקובץ CSV.

**תגובה:** קובץ `text/csv` להורדה.

כותרת: `chat_id,format,quiet_hours,created_at,cities`
ערים מופרדות בנקודה-פסיק בתוך עמודת `cities`.

---

### `GET /api/subscribers/:id`

פרטי מנוי אחד כולל רשימת ערים.

**תגובה:**

```json
{
  "chat_id": 123456789,
  "format": "detailed",
  "quiet_hours_enabled": 1,
  "created_at": "2026-01-15T10:20:00Z",
  "cities": ["ירושלים", "בית שמש"]
}
```

---

### `PATCH /api/subscribers/:id`

עדכון הגדרות מנוי.

**גוף הבקשה (כולם אופציונליים):**

```json
{
  "format": "short",
  "quiet_hours_enabled": true
}
```

**תגובה:**

```json
{ "ok": true }
```

---

### `DELETE /api/subscribers/:id`

מחיקת מנוי וכל המנויים שלו.

**תגובה:**

```json
{ "ok": true }
```

---

### `DELETE /api/subscribers/:id/cities/:city`

הסרת עיר בודדת ממנוי (שם העיר ב-URL encoding).

**תגובה:**

```json
{ "ok": true }
```

---

## פעולות — `/api/operations`

### `GET /api/operations/queue`

סטטוס תור ה-DM הנוכחי.

**תגובה:**

```json
{
  "pending": 14,
  "rateLimited": false,
  "paused": false
}
```

---

### `GET /api/operations/alert-window`

כל ההודעות הפעילות הניתנות לעריכה (שבתוך חלון הזמן).

**תגובה:**

```json
[
  {
    "alert_type": "missiles",
    "message_id": 5512,
    "chat_id": "-100123456789",
    "sent_at": "2026-03-29T14:31:55Z",
    "has_photo": true
  }
]
```

---

### `DELETE /api/operations/alert-window`

ניקוי **כל** ערכי חלון העריכה.

**תגובה:**

```json
{ "ok": true }
```

---

### `DELETE /api/operations/alert-window/:type`

ניקוי חלון העריכה לסוג התראה ספציפי.

**תגובה:**

```json
{ "ok": true }
```

---

### `POST /api/operations/broadcast`

שליחת הודעה מותאמת אישית לכל המנויים (או לרשימה ספציפית).

**גוף הבקשה:**

```json
{
  "text": "שימו לב: תחזוקה מתוכננת מחר בין 02:00–04:00",
  "chatIds": [123456789, 987654321]
}
```

> `chatIds` אופציונלי — אם לא מסופק, ההודעה נשלחת לכל המנויים.

**תגובה:**

```json
{ "queued": 142 }
```

---

### `POST /api/operations/test-alert`

שליחת הודעת בדיקה לחשבון ספציפי.

**גוף הבקשה:**

```json
{
  "chatId": 123456789,
  "text": "בדיקת קישוריות"
}
```

ההודעה נשלחת עם הכותרת `🧪 <b>בדיקה</b>`.

**תגובה:**

```json
{ "ok": true }
```

---

## הגדרות — `/api/settings`

### `GET /api/settings`

כל ההגדרות הנוכחיות — שילוב של ברירות מחדל מסביבה עם דריסות מ-DB.

**תגובה:**

```json
{
  "alert_window_seconds": "120",
  "mapbox_monthly_limit": "40000",
  "mapbox_skip_drills": "false",
  "health_port": "3000",
  "dashboard_port": "4000",
  "quiet_hours_global": null,
  "ga4_measurement_id": "G-XXXXXXXXXX",
  "github_repo": "yonatan2021/pikud-haoref-bot",
  "landing_url": "https://yonatan2021.github.io/pikud-haoref-bot-landing/"
}
```

---

### `PATCH /api/settings`

עדכון הגדרה אחת או יותר.

**מפתחות מורשים לכתיבה:**

| מפתח | תיאור |
|------|--------|
| `alert_window_seconds` | חלון עריכת הודעות (שניות) |
| `mapbox_monthly_limit` | מגבלה חודשית לבקשות Mapbox |
| `mapbox_skip_drills` | `true`/`false` — דלג על מפות לתרגילים |
| `quiet_hours_global` | שעות שקט גלובליות לכל המנויים |
| `ga4_measurement_id` | מזהה Google Analytics לדף הנחיתה |
| `github_repo` | מאגר GitHub (owner/repo) לפריסה |
| `landing_url` | כתובת דף הנחיתה |

**גוף הבקשה:**

```json
{
  "mapbox_monthly_limit": "45000",
  "mapbox_skip_drills": "true"
}
```

**תגובה:**

```json
{
  "ok": true,
  "note": "חלק מההגדרות ייכנסו לתוקף לאחר הפעלה מחדש"
}
```

---

### `GET /api/settings/backup`

הורדת גיבוי מלא של מסד הנתונים.

**תגובה:** קובץ `backup.db` להורדה.

---

## תבניות הודעות — `/api/messages`

### `GET /api/messages`

כל סוגי ההתראות עם ברירות המחדל והדריסות הנוכחיות.

**תגובה:**

```json
[
  {
    "alertType": "missiles",
    "emoji": "🚀",
    "titleHe": "טיל בליסטי",
    "instructionsPrefix": "🏃 פנו מיידית",
    "isCustomized": true,
    "defaults": {
      "emoji": "🔴",
      "titleHe": "התרעת טילים",
      "instructionsPrefix": "🛡"
    }
  }
]
```

---

### `PATCH /api/messages/:alertType`

עדכון חלקי של תבנית סוג התראה.

**פרמטר נתיב:** `alertType` — אחד מ-`ALL_ALERT_TYPES` (ראה [סוגי התראות](./alert-types.md)).

**גוף הבקשה (כולם אופציונליים):**

```json
{
  "emoji": "🚀",
  "titleHe": "טיל בליסטי",
  "instructionsPrefix": "🏃 פנו מיידית למרחב מוגן"
}
```

**תגובה:**

```json
{ "ok": true }
```

---

### `DELETE /api/messages/:alertType`

איפוס תבנית לברירת המחדל (מוחק את הדריסה מה-DB).

**תגובה:**

```json
{ "ok": true, "reset": true }
```

---

## דף הנחיתה — `/api/landing`

### `GET /api/landing/config`

הגדרות דף הנחיתה הנוכחיות.

**תגובה:**

```json
{
  "ga4MeasurementId": "G-XXXXXXXXXX",
  "lastDeploy": "2026-03-28T22:15:00Z",
  "siteUrl": "https://yonatan2021.github.io/pikud-haoref-bot-landing/"
}
```

---

### `PATCH /api/landing/config`

עדכון הגדרות דף הנחיתה.

**גוף הבקשה (כולם אופציונליים):**

```json
{
  "ga4MeasurementId": "G-XXXXXXXXXX",
  "siteUrl": "https://example.com"
}
```

**תגובה:**

```json
{ "ok": true }
```

---

### `POST /api/landing/deploy`

הפעלת GitHub Actions workflow לפריסה של דף הנחיתה.

דורש הגדרת `GITHUB_PAT` ו-`GITHUB_REPO` במשתני הסביבה.

**תגובה מוצלחת:**

```json
{ "ok": true }
```

**תגובת שגיאה:**

```json
{
  "error": "GitHub API error",
  "status": 401,
  "detail": "Bad credentials"
}
```

</div>
