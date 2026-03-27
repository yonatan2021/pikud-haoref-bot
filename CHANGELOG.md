<div dir="rtl">

# יומן שינויים

כל השינויים המשמעותיים בפרויקט מתועדים כאן.
הפורמט מבוסס על [Keep a Changelog](https://keepachangelog.com/he/1.0.0/), וגרסאות מיישמות [Semantic Versioning](https://semver.org/).

## כיצד להוסיף ערך חדש

1. בכל גרסה חדשה — העתק את מקטע `[Unreleased]` למטה, תן לו שם גרסה ותאריך, ורוקן את `[Unreleased]`
2. השתמש בקטגוריות הנכונות (רק מה שרלוונטי לגרסה):
   - `✨ תכונות חדשות` — פונקציונליות חדשה
   - `🐛 תיקוני באגים` — תיקון בעיות קיימות
   - `⚠️ שינויים שוברים` — שינויים שדורשים התאמה מצד המשתמש (API, משתני סביבה, פורמט DB)
   - `🗑️ הוסר` — פיצ'רים שהוסרו
   - `⚡ שיפורי ביצועים` — אופטימיזציות ללא שינוי התנהגות
   - `🧪 בדיקות` — הוספת / שיפור בדיקות
   - `🔧 תחזוקה` — תשתית, CI/CD, gitignore, תלויות

</div>

---

<!-- העתק את המקטע הזה כשפותחים ענף גרסה חדשה -->
## [Unreleased]

<div dir="rtl">

### ⚡ שיפורי ביצועים

- **Docker layer cache**: הסרת `.version` מ-`package.json` לפני `npm ci` — מייצב את שכבת ה-cache ומונע invalidation על bump גרסה בלבד

### 🐛 תיקוני באגים

- **TypeScript strict**: תיקון cast של `mock.fn` דרך `unknown` כדי לעמוד בבדיקת overlap קפדנית של TypeScript

</div>

---

## [0.1.1] — 2026-03-27

<div dir="rtl">

### ✨ תכונות חדשות

#### `alertHandler` — coordinator מרכזי לעיבוד התראות
- חילוץ לוגיקת עיבוד ההתראה מ-`index.ts` לקובץ ייעודי `alertHandler.ts` עם dependency injection מלא
- כל התלויות (מפה, שליחה, עריכה, מעקב, DM) מוזרקות כפרמטרים — מאפשר בדיקות יחידה מלאות ללא side effects
- `alertHelpers.ts`: עזרים `isDrillAlert` / `shouldSkipMap` מחולצים לקובץ נפרד לשימוש חוזר ובדיקות

#### עריכת הודעות בתוך חלון זמן (`alertWindowTracker`)
- התראות מאותו סוג שמגיעות בתוך חלון הזמן (ברירת מחדל: 120 שניות) **עורכות** את ההודעה הקיימת בטלגרם במקום לשלוח הודעה חדשה
- ערים מתמזגות (union) להודעה המעודכנת עם מפה מעודכנת
- fallback לשליחת הודעה חדשה אם העריכה נכשלת (למשל הודעה ישנה מדי)
- שינוי גודל החלון דרך `ALERT_UPDATE_WINDOW_SECONDS`

#### הגבלת קצב Mapbox ומטמון תמונות
- מונה בקשות חודשי נשמר ב-SQLite (טבלת `mapbox_usage`, מפתח: `YYYY-MM`)
- מגבלה חודשית קשיחה דרך `MAPBOX_MONTHLY_LIMIT` — fallback לטקסט בלבד כשמגיעים למגבלה
- מטמון FIFO בזיכרון (ברירת מחדל: 20 ערכים) לפי fingerprint — cache hit לא צורך מכסה
- המונה מתעדכן רק בעת תגובת API מוצלחת

#### דילוג מפה לסוגי התראות ספציפיים
- `newsFlash` תמיד נשלח כטקסט בלבד (ללא מפה)
- תרגילים נשלחים כטקסט בלבד כאשר `MAPBOX_SKIP_DRILLS=true`

#### Docker ו-CI/CD
- `Dockerfile` רב-שלבי: builder עם Native addon ו-runner קל עם non-root user
- **CI** (`.github/workflows/ci.yml`): type-check + בדיקות + אימות בנייה — פועל על כל push/PR
- **Release** (`.github/workflows/release.yml`): בנייה ודחיפה ל-`ghcr.io` וגם ל-Docker Hub — פועל על push ל-`main`

### 🐛 תיקוני באגים

- **newsFlash ארצי**: מניעת re-emission בעת התראות מקבילות — `citylessFingerprints` מנוהל בנפרד ולא נמחק על ידי לולאת הפקיעה הרגילה
- **`noop` callback**: הוספת handler מפורש — ללא זה, כפתורי תצוגה (ספירת עמודים) הציגו ספינר טעינה בלתי-נגמר בטלגרם
- **DM notifications**: התראות DM לא נשלחו כאשר עריכת ההודעה החזירה "message is not modified" — מטופל כ-no-op תקין, DM נשלח בכל מקרה
- **Mapbox counter isolation**: הפרדת עדכון המונה מיצירת התמונה — מונע desync בין מונה SQLite לתמונה שנוצרה בעת כשל
- **Error handling**: guard בהפעלה (missing env vars), לוג מלא של שגיאות, אזהרת מכסה Mapbox, shallow copy ב-tracker למניעת mutation

### 🧪 בדיקות

- בדיקות guard לפרמטר `windowMs` (ערך אפס וערך סביבה לא חוקי)
- בדיקות מלאות ל-`alertWindowTracker`
- בדיקות ל-`alertHandler` ו-`alertHelpers` (כולל `isDrillAlert`, `shouldSkipMap`)
- בדיקות ל-`mapService`: `selectEditMethod`, גודל מטמון מקסימלי, cache hit, מגבלה חודשית
- `closeDb()` מיוצא לאיפוס ה-singleton בין קבצי בדיקות — מונע stale handle בעת ריצת כל הבדיקות יחד

### 🔧 תחזוקה

- הרחבת `.gitignore`: קבצי WAL של SQLite, וריאנטים של `.env`, לוגים, כיסוי קוד, `tsbuildinfo`
- **Node.js 24**: עדכון GitHub Actions runners ל-Node 24
- **לוגים באנגלית**: תרגום כל הודעות ה-console log מעברית לאנגלית לאחידות

</div>

---

## [0.1.0] — 2026-03-20

<div dir="rtl">

### 🎉 גרסה ראשונה פומבית

- סקירת API של פיקוד העורף כל 2 שניות
- מפות Mapbox עם פוליגוני ערים מדויקים + fallback לבounding box ולטקסט
- ניתוב 5 קטגוריות נושאים בטלגרם: ביטחוני, טבע, סביבתי, תרגילים, כללי
- DM אישי למנויים לפי ערים ואזורים (6 אזורי-על, 28 אזורים)
- Deduplication חכם לפי fingerprint — פוקע כשהתרעה נעלמת, לא רק ב-all-clear
- תפיסת newsFlash ארצי (ללא ערים) שהספרייה מדלגת עליו
- תמיכה ב-Proxy לשימוש מחוץ לישראל
- בוט גראמי לניהול מנויים: `/start`, `/add`, `/zones`, `/mycities`, `/settings`

</div>

---

<div dir="rtl">

[Unreleased]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/yonatan2021/pikud-haoref-bot/releases/tag/v0.1.0

</div>
