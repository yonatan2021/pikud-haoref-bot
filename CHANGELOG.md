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

---

## [0.1.3] — 2026-03-28

<div dir="rtl">

### ✨ תכונות חדשות

#### דף נחיתה — GitHub Pages
- דף נחיתה עברי RTL ב-`landing/` עם עיצוב dark tactical theme (Heebo + Telegram blue)
- Hero עם לוגו, אינדיקטור live ירוק, ושני CTAs: "הצטרף לערוץ" + "הרץ instance משלך"
- גריד פיצ'רים — מסונכרן אוטומטית מטבלת `## ✨ תכונות` ב-README.md
- תצוגה מקדימה של 5 צילומי מסך עם scroll-snap אופקי
- Footer עם גרסה ותאריך בנייה שמוזרקים אוטומטית מ-`package.json`
- דף חי: https://yonatan2021.github.io/pikud-haoref-bot-landing/

#### GitHub Action לסנכרון אוטומטי
- `deploy-landing.yml` — בכל push ל-`main`: מריץ `node landing/build.js`, דוחף `landing/dist/` לריפו `pikud-haoref-bot-landing`
- SSH deploy key (`LANDING_DEPLOY_KEY`) מאפשר דחיפה מ-CI ללא אישור ידני

### ⚡ שיפורי ביצועים

- **לוגו**: קימפוס 674KB → 18KB (37×) דרך `sips`; גרסה מקוצרת שמורה ב-`landing/template/logo.jpg`
- **צילומי מסך**: קימפוס 340KB → 29-31KB (11×) לכל תמונה; גרסאות מקוצרות ב-`landing/template/screenshots/`

### 🐛 תיקוני באגים

- **Docker layer cache**: הסרת `.version` מ-`package.json` לפני `npm ci` — מייצב את שכבת ה-cache ומונע invalidation על bump גרסה בלבד
- **TypeScript strict**: תיקון cast של `mock.fn` דרך `unknown` כדי לעמוד בבדיקת overlap קפדנית של TypeScript

### 🔧 תחזוקה

- `landing/dist/` מכוסה ע"י כלל `dist/` הקיים ב-`.gitignore`

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
