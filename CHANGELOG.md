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

### ✨ תכונות חדשות

### 🐛 תיקוני באגים

### 🧪 בדיקות

</div>

---

## [0.4.2] — 2026-04-03

<div dir="rtl">

### ✨ תכונות חדשות

- **אנשי קשר** — חברו חברים ומשפחה עם קוד בן 6 ספרות, אשרו בקשות, ונהלו רשימת קשרים
- **הגנה מפני שימוש לרעה** — המערכת מגבילה בקשות חריגות ומנקה בקשות ישנות באופן אוטומטי
- **קוד חיבור בפרופיל** — הקוד האישי שלכם מופיע גם בעמוד הפרופיל
- **אנשי קשר בלוח הבקרה** — מנהלים רואים קודי חיבור, מספר קשרים, ורשימת אנשי קשר לכל מנוי

### 🧪 בדיקות

- **+11 בדיקות** — כיסוי מלא למערכת אנשי הקשר, לוח הבקרה, וניקוי אוטומטי

</div>

---

## [0.4.1a] — 2026-04-03

<div dir="rtl">

### ✨ תכונות חדשות

- **פרופיל מנויים בדשבורד** — עמוד מנויים מציג כעת שם תצוגה, עיר מגורים, וסטטוס onboarding; חיפוש לפי שם ועיר; עריכת שם ועיר מהדשבורד; ייצוא CSV כולל שדות פרופיל

### 🧪 בדיקות

- **+8 בדיקות dashboard/subscribers** — חיפוש לפי שם ועיר, עדכון display_name/home_city, CSV עם שדות פרופיל

</div>

---

## [0.4.1] — 2026-04-02

<div dir="rtl">

### ✨ תכונות חדשות

#### Onboarding
- **Onboarding wizard ב-`/start`** — משתמש חדש נכנס לתהליך הגדרה מונחה: שם תצוגה → עיר מגורים → אישור. מצב נשמר ב-SQLite (`onboarding_step`) ושורד ריסטארט; אפשרות דילוג בכל שלב
- **הרשמה אוטומטית לעיר מגורים** — בסיום ה-onboarding, המשתמש נרשם אוטומטית להתראות על עיר המגורים שבחר

#### פרופיל
- **פקודת `/profile`** — צפייה ועריכה של שם תצוגה, עיר מגורים ושפה במקום אחד; כפתורי עריכה inline עם ולידציית קלט
- **בחירת שפה** — תמיכה ב-locale (כרגע עברית בלבד); מוכן ל-i18n עתידי

#### תשתית
- **הרחבת טבלת `users`** — 6 עמודות חדשות: `display_name`, `home_city`, `locale`, `onboarding_completed`, `connection_code`, `onboarding_step`; מיגרציה בטוחה עם `addColumnIfMissing`
- **WhatsApp — טקסט מיידי + מפה מושהית** — בתוך חלון העדכון, הודעת טקסט נשלחת מיידית ונערכת בזמן אמת (`msg.edit`); תמונת המפה נשלחת פעם אחת אחרי debounce (ברירת מחדל: 15 שניות)
- **הגדרת עיכוב מפה בדשבורד** — `whatsapp_map_debounce_seconds` — ניתן לשנות מהדשבורד ללא הפעלה מחדש

### 🐛 תיקוני באגים

- **תמונת מפה בהתרעות מרובות ערים (#101)** — בטלגרם: תמונת המפה נשלחת תמיד כשהיא זמינה; ב-WhatsApp: נשלחת הודעה חדשה עם מפה מעודכנת כשיש שינוי בערים

### 🧪 בדיקות

- **+48 בדיקות Onboarding + Profile** — 21 בדיקות userRepository (מיגרציה, פרופיל, onboarding, connection code), 16 בדיקות onboardingHandler (מעברי שלבים, דילוג, ולידציה), 11 בדיקות profileHandler (סיכום, עריכה, ברירות מחדל)
- **+15 בדיקות WhatsApp** — 8 debounce, 7 buildSendPayload + edit-with-image

### 🔧 תחזוקה

- **`src/bot/onboardingHandler.ts`** — handler חדש ל-wizard onboarding
- **`src/bot/profileHandler.ts`** — handler חדש לפקודת `/profile`
- **הרחבת `userRepository.ts`** — `getProfile`, `updateProfile`, `completeOnboarding`, `isOnboardingCompleted`, `setOnboardingStep`, `setConnectionCode`, `findUserByConnectionCode`

</div>

---

## [0.4.0] — 2026-03-31

<div dir="rtl">

### ✨ תכונות חדשות

- **WhatsApp Broadcast לקבוצות** — קבוצות WhatsApp יכולות לקבל התראות פיקוד העורף עם מפות, edit-window dedup, ו-channel store fallback
- **קטגוריה 6 — WhatsApp Forward** — קבוצות WhatsApp יכולות להירשם לקבלת הודעות מועברות מ-WhatsApp Listener (נושא שישי בדשבורד)
- **שידור Listener לקבוצות WA** — הודעות מתאימות מ-WhatsApp Listener מועברות גם לקבוצות WhatsApp מנויות (בנוסף לטלגרם)
- **דשבורד WhatsApp — שדרוג משמעותי** — עמודי WhatsApp ו-WhatsApp Listeners עם סלקטורים חיפושיים, תיקון קטגוריות, fallback ל-topics, ותמיכה בערוצים לצד קבוצות
- **WhatsApp Channels** — `getChannels()` חדש לסריקת ערוצי WhatsApp; tab filter ב-SourceSelector; disconnect + reconnect משופרים
- **עמוד נחיתה — שלוש דרכים** — עמוד הנחיתה מציג כעת שלוש אפשרויות: Telegram, WhatsApp, ו-Self-host — עם כרטיסי מידע שנוצרים אוטומטית מה-README
- **עמוד נחיתה — WHATSAPP_INVITE_LINK** — תמיכה במשתנה סביבה חדש להצגת קישור הזמנה ל-WhatsApp בדף הנחיתה
- **Wizard: פרופיל הגדרות** — שלושה פרופילים (מינימלי / מומלץ ⭐ / מלא) שמכסים את כל 27 משתני הסביבה עם ברירות מחדל חכמות; מחליף את ה-flow הישן של required + optional
- **Wizard: שכפול משופר** — `git clone --depth 1` מהיר יותר, שינוי remote ל-`upstream` לעדכונים, הצעת Fork אוטומטית דרך `gh` CLI
- **Wizard: --profile flag** — `--profile=minimal|recommended|full` ו-`--full` כקיצור ל-`--profile=full`

### 🐛 תיקוני באגים

- **שעון uptime בדשבורד** — תוקן תצוגת "0d 0h" קבועה; כעת מציג דקות עבור uptime קצר (`3m`, `1h 22m`)
- **WhatsApp disconnect/reconnect** — שיפור יציבות חיבור WhatsApp עם disconnect handler ו-reconnect endpoint

### 🧪 בדיקות

- **+19 בדיקות wizard** — 13 בדיקות profile חדשות, 6 בדיקות deployment חדשות (remote setup, spawnQuiet, fork flow)
- **+12 בדיקות WhatsApp** — כיסוי חדש ל-whatsappBroadcaster, whatsappService, dashboard routes
- **167 בדיקות wizard** | **סה"כ ~700 בדיקות**

### 🔧 תחזוקה

- **wizard: מחיקת optional.ts ו-required.ts** — הוחלפו במערכת profiles מאוחדת (`profile.ts`)
- **WHATSAPP_INVITE_LINK** — נוסף ל-ENV_TEMPLATE של ה-wizard
- **landing/build.js** — תמיכה בסקשן "דרכים להשתמש" שנוצר אוטומטית מה-README
- **עדכון .gitignore** — הוספת Claude configuration ו-package-lock.json

</div>

---

## [0.3.3] — 2026-03-31

<div dir="rtl">

### ✨ תכונות חדשות

- **מערכת ניהול תבניות (Messages)** — עורך מקובץ לפי קטגוריה (5 סקשנים) עם Emoji picker ויזואלי, טולטיפים בעברית, סטטוס בר, ואיפוס לפי קטגוריה
- **Simulation Engine + Telegram Preview** — בחירת ערים (autocomplete, עד 50), תצוגה מקדימה חיה בתוך phone-frame mockup, character count bar, ו-test-fire לשליחת הודעת בדיקה אמיתית לטלגרם
- **Versioning + Rollback** — כל עריכת תבנית יוצרת snapshot (עד 10 לסוג), פאנל היסטוריה עם diff ו-rollback בלחיצה
- **Historical Replay** — בחירת התראה היסטורית ורינדור מחדש עם התבנית הנוכחית/override
- **Import/Export תבניות** — ייצוא כ-JSON וייבוא עם אימות all-or-nothing
- **ניהול Topic IDs מהדשבורד** — ניתוב נושאי פורום (כולל WhatsApp) ישירות מלוח הבקרה עם hot-reload מיידי ללא restart
- **Code Splitting** — `React.lazy` + `Suspense` לכל 10 דפים + Vite `manualChunks` לvendor chunks; הchunk הגדול ביותר ירד מ-945KB ל-364KB
- **ErrorBoundary** — עמוד שגיאה בעברית עם כפתור "טען מחדש" כשchunk נכשל בטעינה
- **QR Code בטרמינל** — קוד QR של WhatsApp מוצג ישירות בטרמינל בהפעלה הראשונה
- **Wizard: קובץ .env מלא** — `writeFullEnvFile` יוצר .env עם כל 22 משתני הסביבה ב-9 סקשנים עם הערות בעברית
- **שדות חדשים בהגדרות** — `telegram_invite_link`, `mapbox_image_cache_size`, `whatsapp_enabled` + מידע מערכת (גרסה, גודל DB)
- **דשבורד: Operations** — כפתור "בדוק את כל הקטגוריות" (5 הודעות לnoshim המתאימים) + טקסט הסבר לכל סקשן
- **דשבורד: Landing** — הסבר מהו דף הנחיתה, סטטוס אתר עם LiveDot, קישור GitHub Actions
- **דשבורד: WhatsApp Listeners** — 4 תת-קומפוננטות (ListenersBanner, KeywordHelp, RuleCard, SourceSelector)

### 🐛 תיקוני באגים

- **wizard: קריסת npm install בנתיב עברי** — `resolveTargetPath()` ברירת מחדל ל-`~/pikud-haoref-bot` (ASCII-safe) במקום CWD שעלול לכלול עברית/רווחים
- **wizard: .env זבל ב-CWD** — קובץ .env זמני נמחק אחרי node-mode setup; כרטיס סיום מציג את הנתיב הסופי
- **wizard: escaping ל-.env** — `quoteIfNeeded` תומך ב-`#`, `$`, `"`, `\` עם round-trip נכון
- **Sidebar RTL** — מחוון פעיל ל-border-right, כיוון hover תוקן
- **Overview RTL** — anchor ציר Y, שמות ערים בעברית, tooltip מסודר
- **Alerts** — תרשים עוגה שנחתך הוחלף בפאנל מספרי (AlertCategoryStats)
- **test-alert-all** — מכסה כעת את כל 5 הקטגוריות עם topic routing
- **test-fire truncation** — הודעות ארוכות נחתכות ל-4096 תווים לפני שליחה

### ⚡ שיפורי ביצועים

- **Code splitting** — כל דף נטען רק בגישה ראשונה; vendor chunks מופרדים לcaching עצמאי

### 🔧 תחזוקה

- **alertCategories.ts** — חילוץ `ALERT_TYPE_CATEGORY` ו-`CATEGORY_ENV_VAR` לקובץ משותף; מבטל כפילות בין `topicRouter.ts` ל-`routingCache.ts`
- **`--test-concurrency=1`** — מונע race condition ב-Node.js v25 בtest runner של wizard

### 🧪 בדיקות

- **28** tests חדשים לendpoints של Messages (cities, export, import, replay, test-fire, history, rollback)
- **9** tests ל-messageTemplateHistoryRepository
- **11** tests ל-routingCache
- **4** tests לquoting חדש ב-wizard env
- **672 tests** — 0 regressions

</div>

---

## [0.3.2] — 2026-03-30

<div dir="rtl">

### ✨ תכונות חדשות

- **פורמט הודעות חדש** — תוכן/הוראות ההתראה מופיע **לפני** רשימת הערים בכל סוגי ההודעות (ערוץ, DM, WhatsApp), כך שהוא גלוי בהתראת ה-push ולא קבור אחרי מאות ערים; כותרת ערוץ עברה לשתי שורות (`🔴 סוג\n⏰ שעה · N ערים`); כותרות אזור שינו מ-`📍` ל-`▸`; label מיותר `תוכן ההודעה:` הוסר מ-`newsFlash`
- **שדרוג סגנון מפה** — יום: `light-v11` → `mapbox/streets-v12` (כבישים, נקודות ציון, תוויות בעברית/ערבית); לילה: `dark-v11` → `mapbox/navigation-night-v1` (ניגודיות גבוהה, קריאות משופרת בלילה)
- **Padding אדפטיבי** — מחליף את `padding=40` הקשיח: 80px ל-1–3 ערים, 50px ל-4–15, 30px ל-16+ — התראות קטנות מקבלות יותר הקשר גיאוגרפי; גדולות לא מבזבזות viewport
- **ערובת min-span לסמני pin (Strategy 0)** — ערים ללא נתוני polygon שלחו עד כה pin markers עם zoom-in קרוב מדי; כעת `buildMarkersWithPaddingUrl` מוסיף bbox בלתי-נראה ל-URL שמבטיח ~50 ק"מ הקשר (כמו `expandGeoJSONBounds` בנתיב הפוליגונים)
- **Strategy 2.5 — איחוד פוליגונים חופפים** — בהתראות עם 50+ ערים (כמו כל מרכז הארץ), גם aggressive simplification לא הספיקה כדי לשמור על URL מתחת ל-8,000 תווים, והמפה נפלה ל-pin markers; שלב חדש `_buildUnionedPolygonsUrl` משתמש ב-`@turf/union` כדי למזג את כל הפוליגונים לכמה "כתמים" מאוחדים (100 פוליגוני גוש דן → 2–4 צורות), מקצר את ה-URL פי 10–20× ומאפשר הצגת אזורים ממולאים גם בהתראות גדולות; ערים לא-סמוכות (צפון + דרום ביחד) הופכות ל-MultiPolygon ומוצגות כבלובים נפרדים
- **GitHub Sponsors** — `.github/FUNDING.yml` חדש; מאפשר כפתור "Sponsor" בעמוד הריפו; badge ❤️ Sponsor נוסף לשורת הbadges ב-README וסקשן תמיכה ייעודי
- **דף נחיתה — סקשן "מה חדש?"** — `landing/build.js` מחלץ אוטומטית את 5 השינויים האחרונים מ-`CHANGELOG.md` ומזריק אותם לדף הנחיתה; מתעדכן בכל build ללא עדכון ידני
- **דף נחיתה — כפתור Sponsor** — כפתור "❤️ תמוך בפרויקט" בפוטר דף הנחיתה מקשר ל-GitHub Sponsors
- **דף נחיתה — סטטיסטיקות מ-README** — `landing/build.js` מחלץ נתוני מפתח (ערים, אזורים, קטגוריות) מטבלת `## 📊 עובדות` ב-README; עדכון README מספיק לעדכן גם את דף הנחיתה
- **ROADMAP.md** — מסמך מפת דרכים חדש: כללי ניהול גרסאות (SemVer, שני מסלולי תיוג, checklist), מיילסטונים שהושלמו v0.1–v0.3, placeholder לגרסאות עתידיות

### 🐛 תיקוני באגים

- **WhatsApp→Telegram: חיתוך caption מדיה ל-1,024 תווים** — הודעות וואטסאפ עם תמונה/קובץ שגוף ההודעה שלהן ארוך מ-~960 תווים גרמו לשגיאת API (`message caption is too long`). `whatsappListenerService.ts` מיישם כעת `truncateToCaptionLimit()` על ה-caption לפני `sendPhoto`/`sendDocument`
- **Race condition בגבול 06:00/18:00** — `getCurrentMapStyle()` נקרא פעמים נפרדות ב-`buildCacheKey()` וב-`buildMapboxUrl()`; התרעה שהגיעה בדיוק בגבול יכלה להישמר בקאש עם key של יום אבל עם תמונת לילה (או להיפך); כעת הסגנון מחושב פעם אחת בתחילת `generateMapImage()` ומועבר לכל ה-builders

### 🧪 בדיקות

- +4 בדיקות `_buildUnionedPolygonsUrl` — null ל-FeatureCollection ריקה, URL עם `geojson(` (לא pin markers) לעיר בודדת, URL בתוך 8,000 תווים ל-15 ערי גוש דן חופפות, URL קצר מ-naive full-polygon encoding

### 🔧 תחזוקה

- **קבוע `MAP_DIMENSIONS`** — מחליף את המחרוזת הכפולה `'800x500@2x'` ב-`buildMapboxUrl` ו-`_buildMarkersUrl`
- **שיפור ויזואלי של פוליגונים** — `fill-opacity` 0.4 → 0.5, `stroke-width` 3 → 4 לגבולות ערים בולטים יותר
- **תלות `@turf/union`** — נוספה לצד `@turf/bbox`, `@turf/simplify`, `@turf/helpers`; guard ל-single-feature (union דורשת ≥ 2 גאומטריות)
- **README** — badge גרסה, Sponsors badge, סקשן `## 📊 עובדות`, עדכון טבלת sync של דף הנחיתה
- **`landing/template/index.html`** — סקשן "מה חדש?", כפתור Sponsor בפוטר, `data-target` לאזורים/קטגוריות/ערים עובר מ-hardcode לplaceholders
- **`landing/template/style.css`** — styles ל-`.whats-new`, `.changelog-list`, `.sponsor-btn`

</div>

---

## [0.3.1] — 2026-03-30

<div dir="rtl">

### ✨ תכונות חדשות

- **`TELEGRAM_TOPIC_ID_WHATSAPP`** — env var חדש; topic טלגרם ברירת-מחדל להעברות WhatsApp-to-Telegram; כאשר ל-listener אין `telegramTopicId` ספציפי, ההודעות מנותבות לתפריט זה במקום ל-chat הראשי; per-listener `telegramTopicId` ממשיך לגבור (opt-in override); ערכים לא-מספריים ו-ID=1 נדחים כמו ב-`topicRouter`
- **Wizard — RTL rendering תקין** — שילוב `bidi-js` להמרת עברית לסדר visual לפני הדפסה; עובד בכל הטרמינלים כולל VS Code (שמתעלם מ-`\u202B`); `toVisualRtl()` חדש ב-`wizard/src/ui/rtl.ts`
- **Wizard — overhaul ויזואלי ו-UX** — banner gradient (כחול טלגרם → ענבר) ב-boxen round; progress bar עם `█`/`░` blocks לפני כל שלב; section cards ב-boxen לפני כל קבוצת prompts; skip warnings: boxen warning card עם רשימת consequences מדויקת; `PROXY_URL` מקבל אזהרה קריטית אדומה כברירת-מחדל; completion card עם סיכום ✓/`→ --update` + פקודת deploy

### 🧪 בדיקות

- +5 בדיקות `whatsappListenerService` — fallback topic נוצל, fallback מדולג כשלא מוגדר, listener-specific topic גובר על env var, דחיית ID=1, דחיית ערך לא-מספרי
- +5 בדיקות RTL (`wizard/__tests__/rtl.test.ts`) — `toVisualRtl`, `containsHebrew`, hebrew-before-chalk ordering

</div>

---

## [0.3.0] — 2026-03-30

<div dir="rtl">

### ✨ תכונות חדשות

#### WhatsApp Listener Bridge (חדש)
- **האזנה לקבוצות/ערוצים WhatsApp** — כלל האזנה לכל קבוצה/ערוץ: keywords, topic טלגרם, is_active
- **סינון לפי מילות מפתח** — ריק = כל הודעה; עם keywords = רק התאמות; media-only נדחות בשקט
- **העברה אוטומטית לטלגרם** — כולל thread/topic; fallback ל-`TELEGRAM_CHAT_ID`; גוף > 3900 תווים נקצץ
- **ניהול כללים בדשבורד** — דף "WA Listeners": רשימה, הוספה, עריכה, מחיקה, keyword chip input
- **guard `msgFromMe`** — מניעת לופ; הבוט לא מעביר את ההודעות שלעצמו חזרה לטלגרם
- **`TELEGRAM_FORWARD_GROUP_ID`** — env var חדש לניתוב העברות; fallback ל-`TELEGRAM_CHAT_ID`

#### שיפורי הודעות ערוץ
- **חותמת זמן יציבה** — `alert.receivedAt` מוחתם בזמן הסקר; הודעות ערוכות לא מציגות שעה משתנה; timezone: `Asia/Jerusalem`
- **קריאות ערים משופרת** — כותרת הודעה מציגה `· N ערים` כולל; כותרת אזור מציגה `(N)` לכל אזור
- **מיון ערים אלפבתי** — ערים ממוינות לפי `localeCompare('he')` בתוך כל אזור
- **`📍 ערים נוספות`** — ערים ללא נתוני polygon מקבלות כותרת מפורשת במקום להידבק לאזור הקודם
- **pin markers fallback** — כאשר `buildGeoJSON` מחזיר תוצאות ריקות (עיר ב-`cities.json` אך ללא polygon), `generateMapImage` מנסה pin markers לפני החזרת `null`
- **שרשרת עריכה מדורגת** — `editAlert` מנסה `editMessageMedia → editMessageCaption → editMessageText` במקום לכשול על השגיאה הראשונה; רק `isMessageGoneError` מייצר הודעה חדשה

### 🔒 אבטחה

- **Rate limiting מקיף** — `createRateLimitMiddleware` factory חדש (`src/dashboard/rateLimiter.ts`), zero new dependencies; מגבלות per-IP: `broadcast` 2/min, `test-alert` 10/min, `delete-window` 5/min, `deploy` 3/hr, `backup` 5/hr, `CSV export` 10/hr, subscriber mutations 10/min
- **Brute-force protection פרסיסטנטי** — מונה ניסיונות כניסה עבר מ-`Map` בזיכרון לטבלת `login_attempts` ב-SQLite; שורד restart; header `Retry-After` נכלל בתשובת 429
- **Bot callback cooldown** — 1.5s per-user למנוי/הסרת ערים (`ct`/`ca`/`cr`), search toggle (`st`), settings (`rm`/`quiet:toggle`/`snooze`) — מונע ספאם callback

### ⚡ שיפורי ביצועים

- **`cityLookup` O(1)** — `Array.find()` הוחלף ב-`Map` objects: `byNormalizedName`, `byId`, `byZone` — בנויות פעם אחת בטעינה; pre-sort לרשימות אזורים; FIFO cache (200 ערכים) ל-`searchCities()`
- **N+1 fix — `dmDispatcher`** — `isMuted(chat_id)` per-subscriber הוחלף ב-JOIN אחד עם `u.muted_until` ב-`getUsersForCities`; 1 query במקום 1+N
- **TTL Stats Cache** — `/health` 15s, `/overview` 60s, `/alerts/by-category` 5min, `/alerts/top-cities` 5min (ה-`json_each + GROUP BY` query הוא היקר ביותר)
- **In-memory Subscription Cache** — `cityToSubscribers` + `subscriberData` Maps נטענות ב-startup; write functions שומרות sync עם cache; guard `cacheInitialized` מונע דליפת state בין test suites
- **In-memory Mapbox Usage Cache** — מונה module-level; DB write לעמידות בלבד; `initUsageCache()` נקרא ב-startup

### 🐛 תיקוני באגים

- **Queue log spam** — אזהרת queue-depth הועברה מ-`drain()` (N+1 per task) ל-`enqueueAll()` — מופיעה פעם אחת לבאץ׳ בלבד
- **`paused` field מיותר** — `getStats()` החזיר `paused` ו-`rateLimited` לאותו ערך; הוסר `paused`; `rateLimited` הוא השם הקנוני
- **Dead `_format` param** — `buildDmText(alert, _format)` לא השתמש בפרמטר השני; הוסר מהסיגנטורה ומה-call site; `NotificationFormat` import נוקה
- **`retry_after=0` guard** — `setTimeout` delay מוגן עם `Math.max(1, retryAfter * 1000)` למניעת delay אפסי על ערכים תיאורטיים של `0`
- **`validateChatId()` extracted** — לוגיקת ולידציה chatId הוצאה מה-closure לפונקציה מיוצאת; גם תוקן comment מטעה (ה-float path תופס `".5"`, לא `"123.0"`)

### 🧪 בדיקות

- **391 בדיקות** (+62 מ-0.2.3):
  - +12 `dmQueue` / `dmDispatcher` — validateChatId (5), quiet hours via injectable `now` (1), mixed mute/active subscribers (2), getStats (2), empty enqueueAll (1), error paths (1)
  - +11 `rateLimiter` (6) + `userCooldown` (5)
  - +2 `auth.test.ts` — persistence after restart (login_attempts SQLite)
  - WhatsApp: `whatsappService` (30+), `whatsappListenerService` (20+), `whatsappBroadcaster` (15+), `whatsappFormatter` (15+), `whatsappGroupRepository` (10+), `whatsappListenerRepository` (10+)
  - `subscriptionRepository` — cache init, add/remove sync, evict (20+)
  - `mapboxUsageRepository` — cache seed, limit check, month rollover (10+)
  - `cityLookup` — O(1) lookup, search cache (5+)
  - `statsCache` — hit/miss/expiry (5+)
  - `mapService` — pin markers fallback, receivedAt timestamp, edit chain (10+)
  - `telegramBot` — city counts, alphabetical sort, noZone header (15+)

### 🔧 תחזוקה

- **`src/dashboard/rateLimiter.ts`** — factory חדש לrate limiting (reusable, per-IP)
- **`src/bot/userCooldown.ts`** — per-user callback cooldown Map
- **`src/dashboard/statsCache.ts`** — TTL cache גנרי לendpoints יקרים
- **`src/db/whatsappGroupRepository.ts`** + **`src/db/whatsappListenerRepository.ts`** — CRUD לטבלאות חדשות
- **`src/dashboard/routes/whatsapp.ts`** + **`src/dashboard/routes/whatsappListeners.ts`** — 7 endpoints חדשים
- **`src/whatsapp/`** — 4 קבצים חדשים: `whatsappService`, `whatsappListenerService`, `whatsappBroadcaster`, `whatsappFormatter`
- **`dashboard-ui/src/pages/`** — שני דפים חדשים: `WhatsApp.tsx`, `WhatsAppListeners.tsx`
- **`src/db/schema.ts`** — טבלאות חדשות: `login_attempts`, `whatsapp_groups`, `whatsapp_listeners`
- **Startup order** — `initSubscriptionCache()` + `initUsageCache()` נוספו לרצף האתחול ב-`index.ts` לפני `initializeCache()`

### ⚠️ שינויים שוברים

- **`WHATSAPP_ENABLED=true`** נדרש להפעלת הלקוח; ללא הגדרה — כל קוד ה-WhatsApp מושבת (callback נשמר אך event לא מופעל)
- **`login_attempts`** — טבלת SQLite חדשה; migration אוטומטי ב-`initSchema()`

</div>

---

## [0.2.3] — 2026-03-29

<div dir="rtl">

### 🔒 אבטחה

#### דשבורד — אימות
- **`timingSafeEqual` להשוואת סיסמה** — מניעת timing-attack על endpoint הכניסה דרך `node:crypto`
- **Session token** — הכניסה מייצרת `randomUUID()` ושומרת אותו ב-cookie; הסיסמה עצמה לעולם לא יוצאת מהשרת
- **Session persistence** — טוקני סשן שמורים ב-SQLite עם TTL של 7 ימים ומתמידים לאחר restart
- **Logout מיידי** — `DELETE FROM sessions` מבטל את הטוקן באופן מיידי; אין המתנה לפקיעה
- **`trust proxy: 1`** — Express קורא את ה-IP הנכון מ-`X-Forwarded-For` (hop אחד — nginx) במקום IP פנימי של ה-proxy
- **Rate limiting — 10 ניסיונות / 15 דקות לכל IP** — לאחר 10 כשלונות, IP נחסם עם `429 Too Many Requests` + header `Retry-After`
- **Reset מונה לאחר כניסה מוצלחת** — מונה הניסיונות הכושלים מתאפס כשמזינים סיסמה נכונה
- **ולידציה של סיסמה ריקה** — `400 Bad Request` על סיסמה ריקה / חסרה במקום השוואה מיותרת

### 🐛 תיקוני באגים

#### דשבורד — הגדרות Landing
- **תמיכה ב-HTTPS אותיות גדולות** — regex `/^https?:\/\//i` (עם `i` flag); קודם `HTTPS://example.com` נדחה בטעות
- **Trim לכתובת URL** — `siteUrl.trim()` מנקה רווחים מוביל/נגרר לפני הולידציה

#### DM Dispatcher
- **כפילות DMs בעריכת הודעה** — במסלול העריכה, המנויים מקבלים רק את הערים **החדשות** (`dmCities`) ולא את כל הרשימה המאוחדת

#### Bot — Search Handler
- **Phantom test** — בדיקת `message:text handler` תוקנה עם assertion מפורש שמוודא שאין reply כשלא במצב חיפוש

### 🧪 בדיקות
- **`auth.test.ts`** — בדיקות חדשות: cookie flags (`httpOnly`, `sameSite: strict`), סיסמה ריקה (400), שדה סיסמה חסר (400), שני סשנים במקביל (logout של אחד לא מבטל את השני), header `Retry-After` על 429, rate limit per-IP עצמאי
- **`landing.test.ts`** — בדיקות חדשות: `siteUrl` עם רווחים (trim), פרוטוקול `HTTPS://` (i flag)

### 🔧 תחזוקה
- `src/services/dmDispatcher.ts` — הוסר import מיותר של `formatAlertMessage` שלא היה בשימוש
- `src/alertHandler.ts` — הוסף הסבר ל-`notifySubscribers({ ...alert, cities: dmCities })` המבהיר את ההבדל בין `alert` ל-`finalAlert`

</div>

---

## [0.2.2] — 2026-03-29

### ✨ תכונות חדשות

#### דשבורד — Overview
- **KPI trend indicators** — "התראות היום" ו-"התראות 7 ימים" מציגים ▲/▼ עם delta מול אתמול / שבוע קודם
- **Skeleton loading** — גרפים מציגים `<Skeleton>` בזמן טעינה ראשונית במקום לקפוץ ל-`EmptyState`
- **אגדת גרף** — `<Legend>` עם תוויות עבריות לפי קטגוריה בגרף הפילוח השבועי

#### דשבורד — התראות
- **Empty state** — הבחנה בין "אין תוצאות עבור הסינון הנוכחי" (כשסינון פעיל) לבין "אין התראות לתקופה זו" (כשהתקופה ריקה)

#### דשבורד — תבניות הודעות (חדש)
- **עמוד תבניות** — `תבניות` בתפריט הצד מאפשר לערוך לכל סוג התראה: אמוג׳י, כותרת עברית, וקידומת הוראות
- **שינויים מיידיים** — אין צורך ב-restart; הבוט טוען את הקאש מחדש אחרי כל שמירה
- **איפוס לברירת מחדל** — כפתור Reset מחזיר כל שורה לברירת המחדל שבקוד

#### מפה
- **סגנון יום/לילה** — `light-v11` בשעות 06:00–18:00 ו-`dark-v11` ב-18:00–06:00 (שעון ישראל, כולל DST)
- **הקשר גיאוגרפי לעיר בודדת** — `expandGeoJSONBounds()` מוסיף padding שקוף כשהאזור הפגוע < ~50 ק"מ
- **Padding על כל URL** — `?padding=40` מונע גזירת polygons בקצות התמונה
- **מרקרים צבעוניים לפי סוג** — צבע הסיכה נגזר מסוג ההתראה (`getAlertColor()`) במקום אדום קבוע
- **Polygon מודגש** — `fill-opacity` 0.3 → 0.4, `stroke-width` 2 → 3

### 🐛 תיקוני באגים

#### דשבורד — Overview
- **Recharts Hebrew RTL** — `HebrewYAxisTick` עם `direction="rtl"` על SVG `<text>`; ללא זאת שמות ערים עבריים הוצגו הפוך
- **`alertsYesterday` query** — תוקן מחלון rolling של 24 שעות ל-גבולות חצות קלנדריות (`date('now','-1 day')` עד `date('now')`); הבחנה עקבית עם `alertsToday`

#### דשבורד — התראות
- **פילטר קטגוריה שבור** — `?type=drills` לא התאים לעולם (DB שומר `missilesDrill`, `earthQuakeDrill` וכו׳); הוחלף ב-`?category=drills` שנגזר מ-`ALERT_TYPE_CATEGORY`

#### Mapbox Cache
- **קאש תמונות עמיד לאתחול** — הוספת טבלת `mapbox_image_cache` ב-SQLite; `initializeCache()` טוען תמונות שמורות ב-startup; מונה הדשבורד עקבי עם חיוב Mapbox

#### טרמינל — RTL עברי
- **`toVisualRtl()` במקום `wrapRtl()`** — `\u202B` (RLE embedding) לא נתמך ב-VS Code terminal; `toVisualRtl()` ממיר לסדר ויזואלי דרך `bidi-js` (Unicode TR#9) ומציג נכון בכל הטרמינלים

### 🧪 בדיקות
- 142 בדיקות חדשות: `mapboxCacheRepository` (13), `templateCache` (16), dashboard routes `/messages` (17), `mapService` — `getCurrentMapStyle` (5) + `expandGeoJSONBounds` (3) + colored markers (2), ועדכון assertions ל-`toVisualRtl()` ב-`logger.test.ts`

### 🔧 תחזוקה
- `src/config/alertTypeDefaults.ts` — חילוץ `ALERT_TYPE_HE` / `ALERT_TYPE_EMOJI` / `DEFAULT_INSTRUCTIONS_PREFIX` מ-`telegramBot.ts` לקובץ ייעודי
- `src/config/templateCache.ts` — קאש in-memory עם `Object.freeze()` + reload אטומי
- `src/db/mapboxCacheRepository.ts` — repository pattern לטבלת `mapbox_image_cache`
- `src/db/messageTemplateRepository.ts` — repository pattern לטבלת `message_templates`

---

## [0.2.1] — 2026-03-29

### ✨ תכונות חדשות
- **תיקון BiDi בטרמינל** — מחרוזות עבריות המשולבות עם מספרים (כגון "פורט 3000", "כל 2 שניות") נעטפות ב-Unicode RLE embedding (`\u202B...\u202C`) ומוצגות כעת בסדר הנכון בכל הטרמינלים
- **startup box מעוגל** — פינות `╭╮╰╯`, רוחב דינמי לפי רוחב הטרמינל
- **לינקים לחיצים** — Health Server ו-Dashboard מציגים OSC 8 hyperlinks (VS Code terminal, iTerm2)
- **tag badges** — תגי לוג צבעוניים עם רקע לכל מקור (`Poller`, `AlertHandler`, `DM` וכו')
- **section divider** — קו הפרדה עם תאריך בין ה-startup box לשורות הלוג
- **מונה התראות היום** — startup box מציג כמה התראות נשלחו היום (מה-DB)

### 🐛 תיקוני באגים

#### DM ו-Bot
- **יצירת `data/` אוטומטית** — `schema.ts` יוצר את תיקיית `data/` אם אינה קיימת לפני פתיחת ה-DB; מונע `SQLITE_CANTOPEN` בהתקנות רעננות שבהן התיקייה מוסרת ע"י gitignore
- **ניווט אזורים stateless** — `zoneHandler.ts` מקודד כעת את ה-context המלא (`superRegionIdx:zoneIdx:page`) ישירות ב-callback_data של כל כפתור (`zp:`, `ct:`, `ca:`, `cr:`); הכפתורים עובדים לאחר restart הבוט ללא state בצד שרת; `ZoneState Map` הוסר לחלוטין
- **`settingsHandler.ts`** — 13 קריאות `console.error` הוחלפו ב-`log()` מ-`logger.ts`
- **`dmDispatcher.ts`** — פרמטר `enqueueAll` להזרקה בבדיקות (ברירת מחדל: `dmQueue`) — מאפשר בדיקות יחידה ללא module mocking

#### Dashboard UI — RTL Audit
- **Recharts** — נוסף `orientation="right"` ל-`<YAxis>` ב-Overview ו-Alerts; הציר מופיע כעת בצד הנכון בממשק RTL
- **Sidebar** — תוקן ל-`border-l-2` (הקצה הפנימי מול אזור התוכן) במקום `border-r-2`
- **Pagination** — חצי ניווט הוחלפו (RTL-correct)
- **Framer Motion** — כיוון `x` entry animation תוקן לערכים חיוביים לכניסה מימין (RTL-correct)

### 🧪 בדיקות
- 13 בדיקות חדשות ל-`notifySubscribers()` — אינטגרציה עם DB אמיתי + enqueueAll מוזרק
- 5 בדיקות לפילטר `snooze` / `muted_until` ב-`dmDispatcher`
- 2 בדיקות לפילטר `quiet hours` בשליחה לתור

### 🔧 תחזוקה
- `src/loggerUtils.ts` — קובץ helpers חדש (`wrapRtl`, `osc8Link`, `boxWidth`, `hr`, `containsHebrew`)
- `src/db/alertHistoryRepository.ts` — הוספת `countAlertsToday()`
- **CI: `--test-concurrency=1`** — בדיקות core רצות סדרתית כדי למנוע race conditions בין `mapboxUsageRepository.test.ts` ו-`mapService.test.ts` שחולקים DB על הדיסק
- **CI: `wizard-check`** — בדיקת קיום `wizard/package-lock.json` הועברה מ-job-level `if` לשלב ייעודי (hashFiles() זמין רק ב-step context, לא ב-job context)
- `.worktrees/` נוסף ל-`.gitignore`

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

[Unreleased]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.4.2...HEAD
[0.4.2]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.3.3...v0.4.0
[0.3.3]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.6...v0.2.0
[0.1.6]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/yonatan2021/pikud-haoref-bot/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/yonatan2021/pikud-haoref-bot/releases/tag/v0.1.0

</div>
