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

_אין שינויים עדיין._

</div>

---

## [0.1.1] — 2026-03-27

<div dir="rtl">

### ✨ תכונות חדשות

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

### 🧪 בדיקות

- בדיקות guard לפרמטר `windowMs` (ערך אפס וערך סביבה לא חוקי)
- בדיקות מלאות ל-`alertWindowTracker`

### 🔧 תחזוקה

- הרחבת `.gitignore`: קבצי WAL של SQLite, וריאנטים של `.env`, לוגים, כיסוי קוד, `tsbuildinfo`

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
