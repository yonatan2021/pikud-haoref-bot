<div dir="rtl">

# ארכיטקטורת המערכת

## סקירה כללית

בוט טלגרם שסורק את ה-API של פיקוד העורף כל 2 שניות ושולח התראות בזמן אמת לערוץ טלגרם עם תמונת מפה מ-Mapbox. תומך גם בהודעות DM אישיות למנויים לפי ערים, ובלוח בקרה מנהלתי (Express + React SPA).

---

## רכיבי המערכת

| רכיב | קובץ | תיאור |
|------|------|--------|
| **כניסה ראשית** | `src/index.ts` | מאתחל את כל הרכיבים, בודק משתני סביבה, מפעיל שרתים |
| **סורק התראות** | `src/alertPoller.ts` | סורק API פיקוד העורף כל 2 שניות, מונע כפילויות עם fingerprinting |
| **מתזמר התראות** | `src/alertHandler.ts` | לוגיקה מרכזית: שידור לערוץ + DMs + היסטוריה |
| **שירות מפות** | `src/mapService.ts` | מייצר תמונת מפה Mapbox עם ניהול cache ו-quota |
| **שידור ערוץ** | `src/telegramBot.ts` | שליחה/עריכה של הודעות בערוץ הטלגרם |
| **ניתוב נושאים** | `src/topicRouter.ts` | ממפה סוג התראה → מזהה thread בפורום |
| **שיגור DM** | `src/services/dmDispatcher.ts` | מסנן מנויים לפי שעות שקט ו-mute, בונה הודעת DM |
| **תור DM** | `src/services/dmQueue.ts` | שליחה במקביל (עד 10), backoff על שגיאות 429 |
| **שרת בריאות** | `src/healthServer.ts` | `GET /health` — uptime, סטטיסטיקות polling |
| **לוח בקרה** | `src/dashboard/server.ts` | Express API + משרת את ה-React SPA |
| **בוט DM** | `src/bot/botSetup.ts` | מאזין לפקודות מנויים: /start, /add, /zones, /settings |
| **שכבת DB** | `src/db/schema.ts` | SQLite עם better-sqlite3, 8 טבלאות |
| **לוגר** | `src/logger.ts` | פלט טרמינל עם chalk v4, תמיכה בעברית RTL |

---

## זרימת נתונים

```
┌─────────────────────────────────┐
│        API פיקוד העורף          │
│  (alerts.gov.il / Alerts.json)  │
└────────────┬────────────────────┘
             │  polling כל 2 שניות
             ▼
┌─────────────────────────────────┐
│         AlertPoller             │
│  pikud-haoref-api (ספרייה)      │
│  + fetch ישיר (newsFlash ארצי) │
│  fingerprint dedup              │
└────────────┬────────────────────┘
             │  אירוע "newAlert"
             ▼
┌─────────────────────────────────┐
│        handleNewAlert()         │
│        (alertHandler.ts)        │
└──────┬──────────────┬───────────┘
       │              │
       ▼              ▼
┌────────────┐  ┌─────────────────┐
│  ערוץ      │  │  DM מנויים      │
│ טלגרם     │  │                 │
│            │  │  getUsersFor    │
│ generateMap│  │  Cities()       │
│ sendAlert()│  │                 │
│ editAlert()│  │  filter:        │
│            │  │  quiet_hours    │
│ insertAlert│  │  muted_until    │
│ History()  │  │                 │
└────────────┘  │  dmQueue        │
                │  enqueueAll()   │
                └─────────────────┘
```

---

## שכבת הנתונים (SQLite)

מסד הנתונים: `better-sqlite3` בסנכרון מלא (ללא async), WAL mode, foreign keys פעיל.

| טבלה | שדה מפתח | תיאור |
|------|-----------|--------|
| `users` | `chat_id` | מנויים: פורמט הודעה, שעות שקט, mute_until |
| `subscriptions` | `chat_id + city_name` | איזו עיר כל מנוי מחכה לה |
| `alert_history` | `id` (auto) | היסטוריית התראות — נשמרת 7 ימים |
| `alert_window` | `alert_type` | הודעה פעילה הניתנת לעריכה (TTL 120 שניות) |
| `mapbox_usage` | `month (YYYY-MM)` | מונה בקשות Mapbox לחודש |
| `mapbox_image_cache` | `cache_key` | BLOB תמונות מפה שמורות בדיסק |
| `message_templates` | `alert_type` | דריסת emoji/כותרת/prefix לפי סוג |
| `settings` | `key` | הגדרות runtime ניהן של לוח הבקרה |

---

## מנגנון עריכת הודעות

כשמגיעה התראה חדשה מאותו סוג בתוך חלון זמן מוגדר (ברירת מחדל: 120 שניות), המערכת **עורכת** את ההודעה הקיימת במקום לשלוח חדשה — כך נמנעת הצפת הערוץ.

```
התראה חדשה מגיעה
        │
        ▼
יש הודעה פעילה מאותו סוג?
   ├── כן ──▶  מזג ערים (union)
   │           ├── יש תמונה חדשה? ──▶ editMessageMedia()
   │           └── אין תמונה     ──▶ editMessageCaption()
   │               כישלון?       ──▶ שלח הודעה חדשה
   └── לא ──▶  שלח הודעה חדשה
               עדכן alert_window
```

**חשוב:** ה-DM למנויים נשלח **תמיד** — גם אם עריכת ההודעה נכשלה.

---

## מנגנון Cache ו-Quota של Mapbox

הבקשות ל-Mapbox Static API עולות כסף — לכן יש 2 שכבות הגנה:

### שכבה 1 — Cache בזיכרון (FIFO)
- גודל: `MAPBOX_IMAGE_CACHE_SIZE` (ברירת מחדל: 20 ערכים)
- מפתח: fingerprint של ערים + סוג + שעה (יום/לילה)
- נוצר מחדש בכל הפעלה, מתאפס עם restart

### שכבה 2 — Cache ב-SQLite (מתמיד)
- טבלה: `mapbox_image_cache` — BLOB של תמונת ה-PNG
- נטען לזיכרון בעת הפעלה דרך `initializeCache()`
- שורד restart של הבוט

### Quota חודשי
- מונה ב-`mapbox_usage` לפי חודש `YYYY-MM`
- כשמגיעים ל-`MAPBOX_MONTHLY_LIMIT` — fallback לטקסט בלבד
- `MAPBOX_SKIP_DRILLS=true` — תרגילים נשלחים ללא מפה (חיסכון)

### סדר fallback ביצירת URL מפה
1. פוליגונים מפושטים (tolerance 0.0003)
2. פוליגונים אגרסיביים (tolerance 0.003) — אם URL > 8,000 תווים
3. סמנים נקודתיים (pin-l)
4. מלבן כולל (bounding box)
5. ללא מפה — טקסט בלבד

---

## מנגנון תור ה-DM

```
enqueueAll(tasks[])
        │
        ▼
   [ תור DM ]
        │
        ▼  (עד 10 בו-זמנית)
   שלח הודעה
        │
   ┌────┴────┐
   │ הצלחה  │  שגיאה
   │         ├── 429 (rate limit) ──▶ עצור תור, המתן retry_after (מקס. 300 שנ׳), נסה שוב
   │         ├── חסימה/מחוק     ──▶ מחק משתמש מ-DB
   │         └── שגיאה אחרת    ──▶ רשום לוג
   └─────────┘
```

- מקסימום 5 ניסיונות חוזרים לכל משימה
- `paused=true` בעת backoff — לא נשלחות הודעות נוספות עד שהטיימר מסתיים

---

## שעות שקט ו-Mute

| תנאי | תרגילים + כלליים | ביטחוני + טבע + סביבתי |
|------|------------------|-------------------------|
| שעות שקט (23:00–06:00 שעון ישראל) | **חסום** | **עובר תמיד** |
| Mute (`muted_until` בעתיד) | **חסום** | **עובר תמיד** |

**עיקרון:** התרעות על סכנת חיים אף פעם לא נחסמות — לא משנה מה ההגדרות.

---

## ניהול ID נושאים (Forum Topics)

אם הערוץ הוא פורום Telegram, ניתן לנתב קטגוריות לנושאים שונים:

| קטגוריה | משתנה סביבה |
|---------|-------------|
| 🔴 ביטחוני | `TELEGRAM_TOPIC_ID_SECURITY` |
| 🌍 אסונות טבע | `TELEGRAM_TOPIC_ID_NATURE` |
| ☢️ סביבתי | `TELEGRAM_TOPIC_ID_ENVIRONMENTAL` |
| 🔵 תרגילים | `TELEGRAM_TOPIC_ID_DRILLS` |
| 📢 הודעות כלליות | `TELEGRAM_TOPIC_ID_GENERAL` |

אם אף משתנה לא מוגדר — כל ההתראות עוברות לצ'אט הראשי. **חשוב:** Thread ID `1` אינו תקין בפורום Telegram.

---

## תלויות חיצוניות עיקריות

| חבילה | גרסה | שימוש |
|-------|------|--------|
| `grammy` | ^1.36.0 | Telegram Bot framework |
| `pikud-haoref-api` | ^5.0.3 | עטיפת API פיקוד העורף |
| `better-sqlite3` | ^12.8.0 | SQLite סינכרוני |
| `axios` | ^1.9.0 | HTTP (Mapbox + fallback פיקוד העורף) |
| `@turf/bbox` + `@turf/simplify` | ^7.2.0 | עיבוד GeoJSON למפות |
| `express` | ^5.2.1 | שרת לוח הבקרה (אם מופעל) |
| `bidi-js` | ^1.0.3 | המרת עברית לסדר ויזואלי בטרמינל |
| `chalk` | ^4.1.2 | צבעים בטרמינל (חובה v4 — v5 הוא ESM בלבד) |

</div>
