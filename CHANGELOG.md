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

## [0.2.1] — 2026-03-29

### ✨ תכונות חדשות
- **תיקון BiDi בטרמינל** — מחרוזות עבריות המשולבות עם מספרים (כגון "פורט 3000", "כל 2 שניות") נעטפות ב-Unicode RLE embedding (`\u202B...\u202C`) ומוצגות כעת בסדר הנכון בכל הטרמינלים
- **startup box מעוגל** — פינות `╭╮╰╯`, רוחב דינמי לפי רוחב הטרמינל
- **לינקים לחיצים** — Health Server ו-Dashboard מציגים OSC 8 hyperlinks (VS Code terminal, iTerm2)
- **tag badges** — תגי לוג צבעוניים עם רקע לכל מקור (`Poller`, `AlertHandler`, `DM` וכו')
- **section divider** — קו הפרדה עם תאריך בין ה-startup box לשורות הלוג
- **מונה התראות היום** — startup box מציג כמה התראות נשלחו היום (מה-DB)

### 🔧 תחזוקה
- `src/loggerUtils.ts` — קובץ helpers חדש (`wrapRtl`, `osc8Link`, `boxWidth`, `hr`, `containsHebrew`)
- `src/db/alertHistoryRepository.ts` — הוספת `countAlertsToday()`

---

## [0.2.0] — 2026-03-29

<div dir="rtl">

### ✨ תכונות חדשות

#### wizard NPX — שדרוג מלא (Issue #10)
- **חבילה קלה**: `wizard/` נפרד עם 2 תלויות בלבד (`@clack/prompts` + `chalk`) — במקום ~180 חבילות עם native addons
- **חוויה עשירה**: ממשק @clack עם צבעים, select menus, progress badges, spinners
- **ולידציה חיה**: בדיקת פורמט token / chat-id / mapbox / URL בכל שדה בזמן ההקלדה
- **Update mode** (`--update`): זיהוי .env קיים, multiselect של שדות לעדכון, merge אימות
- **Verify mode** (`--verify`): בדיקת תקינות TELEGRAM_BOT_TOKEN + MAPBOX_ACCESS_TOKEN מול API
- **RTL בטרמינל**: עברית ו-LTR על שורות נפרדות, `visibleWidth` Unicode-aware לחישוב padding

#### Dashboard UI — עיצוב מחדש מלא
- **Glassmorphism design system**: CSS tokens ב-`:root {}` — `--color-glass`, `--color-border-glass`, `--color-glow-*`
- **כל 7 הדפים עוצבו מחדש** עם `framer-motion` animations + RTL תקין (Overview, Alerts, Subscribers, Operations, Settings, LandingPage, Login)
- **Component library** (`dashboard-ui/src/components/ui/`): `GlassCard`, `AnimatedCounter`, `LiveDot`, `PageTransition`
- **RTL fixes**: chevron sidebar (right/left מתהפכים נכון), slide direction (`x` הוא כיוון פיזי, לא לוגי), text alignment
- **`StatusStrip`**: isLoading state — מונע false-positive ״מחובר״ לפני שהבדיקה הראשונה חזרה
- **`GlowVariant` type**: exported ומשותף — exhaustiveness נאכף ב-compile time ב-`KpiCard`
- **Mutation patterns**: `onMutate` + `onSettled` תוקנו בכל פעולה destructive (delete, patch, deploy)

#### Terminal UI — ממשק לוגים מעוצב
- **`src/logger.ts`** חדש: `log(level, tag, msg)` עם chalk v4 — levels: `info/success/warn/error`
- **`logStartupHeader(version, services[])`**: טבלת סטטוס בעת הפעלה — Health Server, Alert Poller, Dashboard, DB
- **`logAlert(type, cities, action)`**: תיבת ⚡ מעוצבת לכל שליחה/עריכה עם סוג + רשימת ערים
- כל `console.log/warn/error` בקוד הפרודקשן הוחלפו ב-`log()` מובנה

#### Landing Page — עיצוב מחדש
- עיצוב SaaS מודרני עם hero section, feature grid, CTA
- RTL מלא, Heebo font, Telegram blue theme, dark mode
- Error handling, accessibility, ו-CSS structure תוקנו

### ⚠️ שינויים שוברים

- `root/package.json` קיבל `"private": true` — הבוט עצמו לא מפורסם יותר ל-npm
- `bin/setup.js` הוסר — הוחלף ב-`wizard/src/`
- שם חבילת wizard נשמר: `@haoref-boti/pikud-haoref-bot`

### 🧪 בדיקות

- 76 בדיקות ל-`wizard/` (TDD)
- `test(logger)`: suite מלאה ל-`log`, `logStartupHeader`, `logAlert`
- `test(alertHandler)`: stdout מדוכא בבדיקות — פלט CI נקי יותר

### 🔧 תחזוקה

- `publish-npm` job הוחלף ב-`publish-wizard` — trigger: `wizard-v*` tags (עצמאי מ-`v*`)
- CI עודכן ל-4 jobs מקבילים: `test`, `dashboard-build`, `docker-build`, `wizard-check`
- `wizard-check` מותנה: `hashFiles('wizard/package-lock.json') != ''` — מדלג כשאין `wizard/`
- תיקון: `DB_PATH=:memory:` הועבר לבלוק `env:` — YAML compact mapping תקין
- תיקון: `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` נוסף לכל ה-jobs

</div>

---

## [0.1.6] — 2026-03-29

<div dir="rtl">

### ✨ תכונות חדשות

#### התקנה בפקודה אחת
- `npx @haoref-boti/pikud-haoref-bot` — wizard אינטראקטיבי להגדרת הבוט
- שואל על `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `MAPBOX_ACCESS_TOKEN` (חובה)
- תמיכה בדגלים: `--token`, `--chat-id`, `--mapbox`, `--dashboard`, `--proxy`, `--invite-link`, `--full`, `--output`
- בחירת אופן הרצה: Docker (מומלץ) או Node.js
- החבילה מפורסמת ב-npm: `@haoref-boti/pikud-haoref-bot`

### 🔧 תחזוקה

- `publish-npm` job נוסף ל-`release.yml` — פרסום אוטומטי ל-npm בכל tag גרסה
- `bin/setup.js` נוסף לפרויקט (plain JS, ללא תלויות)
- `package.json`: נוספו שדות `bin`, `files`, `publishConfig`
- דף הנחיתה עודכן: כפתור "הרץ instance משלך" מציג `npx @haoref-boti/pikud-haoref-bot`
- גריד "שתי דרכים" אוזן לגובה שווה בין שני הכרטיסים

</div>

---

## [0.1.5] — 2026-03-28

<div dir="rtl">

### ✨ תכונות חדשות

#### לוח בקרה (Dashboard)
- שרת Express חדש על פורט `DASHBOARD_PORT` (ברירת מחדל: 4000) — מופעל רק כאשר `DASHBOARD_SECRET` מוגדר
- אימות מאובטח עם עוגיית `httpOnly`, `timingSafeEqual` למניעת timing attacks
- API routes: `/api/stats`, `/api/subscribers`, `/api/operations`, `/api/settings`, `/api/landing`
- React SPA (Vite + Tailwind v4 RTL) עם 7 דפים: Overview, Alerts, Subscribers, Operations, Settings, LandingPage, Login
- Command Palette (⌘K), sidebar RTL, status strip עם polling חי
- ייצוא מנויים כ-CSV, ניהול תור שליחה DM, ניהול alert window
- שידור ידני של התראה, endpoint ל-deploy של landing page דרך GitHub Actions
- ניהול הגדרות key-value בטבלת `settings` ב-SQLite

#### הודעות DM משופרות
- זמן מקלט (`⏱ X שנ׳`) מוצג בהודעות DM קצרות — כמינימום הזמן בין ערי המנוי
- דחיית התראות (`snooze`) — המשתמש יכול להשתיק DMs לפרק זמן מוגדר
- עמוד `/mycities` מציג כעת תוויות אזור לכל עיר

#### שיפורי UX
- `/start` בצ'אטי קבוצה מחזיר תשובה (במקום להתעלם)
- `/start` בתפריט הראשי מציג את ההתראה האחרונה
- `/history` מציג שעה מוחלטת לצד הזמן היחסי (לפני X שעות)

#### מפות
- פוליגונים חדים יותר לערים
- צבע פוליגון לפי סוג ההתראה (אדום לביטחוני, כתום לטבעי, צהוב לסביבתי וכו׳)

#### GA4 ב-Landing Page
- הזרקת סקריפט Google Analytics 4 דרך `GA4_MEASUREMENT_ID` env var
- `<!-- GA4_PLACEHOLDER -->` ב-template — מוחלף בזמן בניה

### ⚠️ שינויים שוברים

- משתנה סביבה חדש `DASHBOARD_SECRET` נדרש להפעלת הדשבורד (ללא הגדרה — לא נטען)
- משתנה סביבה חדש `DASHBOARD_PORT` (ברירת מחדל: 4000)
- עמודת `muted_until TEXT` נוספה לטבלת `users` — migration אוטומטי בהפעלה

### 🔧 תחזוקה

- `initSchema(database)` מופרד מ-`initDb()` לבדיקות עם DB בזיכרון
- `addColumnIfMissing()` helper מאחד את הלוגיקה של ALTER TABLE migrations
- `DB_PATH=:memory:` ב-`npm test` לבדיקות בזיכרון ללא קובץ
- `build:dashboard` ו-`dev:dashboard` נוספו ל-`package.json`
- Docker ו-CI מבנים את ה-dashboard-ui כחלק מהבנייה הכוללת

</div>

---

## [0.1.4] — 2026-03-28

<div dir="rtl">

### ✨ תכונות חדשות

#### היסטוריית התראות
- טבלת `alert_history` ב-SQLite — כל התראה שנשלחת נשמרת עם type, ערים, instructions ו-fired_at
- ניקוי אוטומטי של רשומות ישנות מ-7 ימים בכל הפעלה
- `alertHistoryRepository` — `insertAlert`, `getRecentAlerts(hours)`, `getAlertsForCity`, `getAlertsForCities`

#### פקודת `/stats`
- סיכום 24 שעות אחרונות לפי קטגוריה (🔴 ביטחוני, 🌍 טבע, ☢️ סביבתי, 🔵 תרגילים, 📢 כללי)
- ספירה אישית: כמה מהתראות נגעו לאזורים שהמשתמש רשום אליהם

#### פקודת `/history`
- `/history` — 10 התראות אחרונות לערים שהמשתמש רשום אליהן
- `/history [עיר]` — 10 התראות אחרונות לעיר ספציפית
- fallback לכלל-ארצי כשאין מנויים, עם טיפ להצטרפות
- זמן יחסי בעברית: "עכשיו" / "לפני X דקות" / "לפני X שעות" / "לפני X ימים"

#### DM מותאם אישית
- כל מנוי מקבל רק ערים שרשום אליהן (`matchedCities`) — לא את כל ערי ההתראה
- `buildDmText` — helper לבניית הודעה לפי פורמט + type

#### שעות שקט (23:00–06:00 שעון ישראל)
- `shouldSkipForQuietHours` — מסנן DMs מסוג drills ו-general בשעות הלילה
- התראות קריטיות (missiles, earthquake, hazmat) תמיד עוברות
- לחצן toggle בתפריט `/settings`: 🔕 שעות שקט: כבוי / פעיל ✓

#### Health endpoint
- `GET /health` — מחזיר JSON: `uptime`, `lastAlertAt`, `lastPollAt`, `alertsToday`
- פורט מוגדר דרך `HEALTH_PORT` (ברירת מחדל: 3000)
- `updateLastAlertAt()` נקרא אוטומטית בכל התראה חדשה

#### עמידות לאיתחול — Persistent Alert Window Tracker
- טבלת `alert_window` ב-SQLite — מצב חלון ההתראות הפעיל נשמר על הדיסק
- `loadActiveMessages()` בהפעלה — משחזר מצב מ-DB, מונע הודעות כפולות בערוץ לאחר restart
- `upsertWindow`, `deleteWindow`, `loadAllWindows`, `clearAllWindows` ב-`alertWindowRepository`

#### DM Rate Limiting — DmQueue
- `DmQueue` — תור שליחה עם מגבלת מקביליות מוגדרת (ברירת מחדל: 10)
- backoff אוטומטי לשגיאות 429: מחזיר לראש התור ומשהה לפי `retry_after`
- ניהול משתמשים חסומים: מסיר אוטומטית ממסד הנתונים
- `notifySubscribers` הפכה ל-sync — השליחה אסינכרונית בתור

### 🔧 תחזוקה

- `ALERT_TYPE_CATEGORY` ו-`AlertCategory` מיוצאים מ-`topicRouter.ts` לשימוש ב-statsHandler ו-dmDispatcher
- `User` interface מכיל `quiet_hours_enabled: number`
- `getUsersForCities` מחזיר `matchedCities[]` + `quiet_hours_enabled` לכל מנוי

</div>

---

## [0.1.3] — 2026-03-27

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

### 🔧 תחזוקה

- `landing/dist/` מכוסה ע"י כלל `dist/` הקיים ב-`.gitignore`

</div>

---

## [0.1.2] — 2026-03-27

<div dir="rtl">

### ✨ תכונות חדשות

#### פורמט DM מבוסס-אזורים עבור newsFlash
- `buildNewsFlashDmMessage()` — הודעות DM ל-newsFlash מציגות שמות אזורים במקום ערים (`📢 הודעה מיוחדת | גליל עליון, קריות`)
- `alert.instructions` מוצג בשורה נפרדת כשקיים
- שימוש ב-`Set` לדדופ אזורים ב-`buildNewsFlashDmMessage`

#### קיבוץ ערים לפי אזור בהודעות הערוץ
- `buildZonedCityList()` — מקבץ ערי התראה לפי אזור עם כותרת `📍 <b>Zone</b>` לכל אזור
- ערים ללא match ב-`cities.json` נצמדות כרשימה שטוחה בסוף
- סדר אזורים לפי סדר הופעה ראשון במערך הערים של ההתראה

#### שיפורי fallback ליצירת מפות Mapbox
- שלב חדש: פישוט פוליגונים אגרסיבי (tolerance 0.01) לפני מעבר ל-bounding box
- שלב חדש: pin markers קומפקטיים (~30 תווים לעיר) כ-fallback לפני bounding box
- `truncateToCaptionLimit()` — חיתוך caption ב-1,024 תווים בגבול section אחרון שלם למניעת שבירת HTML

#### נורמליזציה של שמות ערים
- `normalizeCityName()` — trim, כיווץ רווחים כפולים, ואיחוד כל גרסאות המקף (`-`, `–`, `—`) ל-`" - "` עם רווח עקבי

### ⚡ שיפורי ביצועים

- **Docker layer cache**: הסרת `.version` מ-`package.json` לפני `npm ci` — מייצב את שכבת ה-cache ומונע invalidation על bump גרסה בלבד

### 🐛 תיקוני באגים

- **TypeScript strict**: תיקון cast של `mock.fn` דרך `unknown` כדי לעמוד בבדיקת overlap קפדנית של TypeScript

### 🔧 תחזוקה

- הוספת לוגו הפרויקט ל-README

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

[Unreleased]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.6...v0.2.0
[0.1.6]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/yonatan2021/pikud-haoref-bot/releases/tag/v0.1.0

</div>
