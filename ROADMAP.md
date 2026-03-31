<div dir="rtl">

# מפת דרכים — בוט התראות פיקוד העורף

---

## 📐 כללי ניהול גרסאות

### Semantic Versioning — `MAJOR.MINOR.PATCH`

| רמה | מתי להשתמש |
|-----|------------|
| `PATCH` | תיקוני באגים, שיפורי UX בוויזארד, אופטימיזציות ביצועים |
| `MINOR` | פיצ'רים חדשים (תואמים לאחור) |
| `MAJOR` | שינויים שוברים: migration של DB, הסרת API, שינוי מבנה קונפיגורציה |

### שני מסלולי תיוג עצמאיים

| מסלול | תג | מה מתפרסם |
|-------|-----|-----------|
| **Bot** | `vX.Y.Z` | Docker image → GHCR + Docker Hub |
| **Wizard (npm)** | `wizard-vX.Y.Z` | npm package `@haoref-boti/pikud-haoref-bot` |

שני המסלולים משתפים את אותו מספר גרסה (מסונכרן ידנית), אך מתויגים באופן עצמאי.

### Checklist — העלאת גרסה (Bot)

```
[ ] package.json → .version
[ ] src/index.ts → מחרוזת לוג startup
[ ] README.md → badge גרסה
[ ] CHANGELOG.md → section חדש + קישורי השוואה בתחתית
```

### Checklist — העלאת גרסה (Wizard)

```
[ ] wizard/package.json → .version
[ ] wizard/src/index.ts → קבוע VERSION
```

### פקודות release

```bash
# Bot — Docker release
git tag vX.Y.Z && git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."

# Wizard — npm release
git tag wizard-vX.Y.Z && git push origin wizard-vX.Y.Z
```

---

## ✅ מה הושלם

### v0.1.0 — מרץ 2026 — גרסה ראשונה
- סקירת API של פיקוד העורף כל 2 שניות
- שליחת התראות לערוץ טלגרם עם מפת Mapbox
- 5 קטגוריות נושא (ביטחוני, טבע, סביבתי, תרגילים, כללי)
- התראות DM אישיות לפי עיר/אזור
- deduplication חכם עם fingerprint
- תמיכה ב-Proxy (הרצה מחוץ לישראל)

### v0.1.1–v0.1.3 — מרץ 2026
- `alertHandler` coordinator עם dependency injection
- Alert window tracker — עריכת הודעות בחלון זמן (120 שניות)
- מכסת Mapbox חודשית (SQLite) + מטמון תמונות FIFO
- Docker multi-stage build, CI/CD ב-GitHub Actions
- דף נחיתה סטטי RTL עברית (GitHub Pages)
- deduplication של newsFlash, fallback לטקסט

### v0.1.4–v0.1.6 — מרץ 2026
- היסטוריית התראות (`alert_history`, 7 ימים)
- `/stats` — סיכום 24 שעות לפי קטגוריה + ספירה אישית
- `/history [עיר]` — 10 התראות אחרונות
- שעות שקט (23:00–06:00), snooze זמני
- `DmQueue` עם מקביליות 10 + backoff אוטומטי ל-429
- **`npx @haoref-boti/pikud-haoref-bot`** — ויזארד הגדרה אינטראקטיבי בפקודה אחת

### v0.2.0–v0.2.3 — מרץ 2026
- ויזארד NPX: `--update`, `--verify`, ולידציה חיה, בחירת פלטפורמה
- **Admin Dashboard** — React SPA + glassmorphism, 7 עמודים, RTL מלא
- עיצוב מחדש של דף הנחיתה (SaaS מודרני, Heebo, Telegram blue, dark mode)
- `logger.ts` — `log()`, `logStartupHeader()`, `logAlert()` עם boxes ו-OSC 8 links
- Dashboard auth: `timingSafeEqual`, sessions ב-SQLite, 7-day TTL
- Rate limiting: 10 ניסיונות / 15 דקות per-IP, header `Retry-After`
- Overview KPI עם trends ▲/▼, skeleton loading, chart legend
- עמוד תבניות הודעה — עריכת emoji/title/prefix לכל סוג התראה ללא restart
- מפה בהירה ביום (06:00–18:00) וכהה בלילה, pins צבועים לפי סוג

### v0.3.0–v0.3.1 — מרץ 2026
- **WhatsApp Listener Bridge** — האזנה לקבוצות/ערוצים, סינון keywords, העברה לטלגרם
- שיפורי הודעות: חותמת זמן יציבה (Asia/Jerusalem), ספירת ערים, מיון אלפבתי
- Rate limiting מקיף על כל dashboard endpoints + bot callback cooldown
- Brute-force protection פרסיסטנטי (SQLite)
- **Caching O(1)**: cityLookup Maps, subscription cache, TTL stats cache, Mapbox usage cache
- ויזארד — RTL תקין בכל הטרמינלים (`bidi-js`), overhaul ויזואלי (gradient, progress bar, boxen)
- `TELEGRAM_TOPIC_ID_WHATSAPP` — topic ברירת-מחדל להעברות WhatsApp
- 391+ בדיקות אוטומטיות

### v0.3.2 — מרץ 2026
- **פורמט הודעות חדש**: תוכן/הנחיות מופיעים **לפני** רשימת הערים (נראות ב-push notification)
- כותרת ערוץ 2 שורות: `🔴 סוג\n⏰ שעה · N ערים`
- **שדרוג מפה**: `streets-v12` ביום, `navigation-night-v1` בלילה; adaptive padding; min-span לפינים
- **Strategy 2.5 — Polygon Union**: `@turf/union` ממזגת 100→2-4 צורות, דחיסת URL פי 10-20
- GitHub Sponsors, סנכרון "מה חדש?" מ-CHANGELOG, הצגת ROADMAP.md

### v0.3.3 — מרץ 2026
- **מערכת תבניות הודעה**: עורך 5 קטגוריות, בוחר אימוג'י, tooltips, איפוס per-category
- **מנוע סימולציה**: autocomplete ערים, תצוגה מקדימה בסגנון טלפון, ספירת תווים, test-fire
- **גרסאות + rollback**: 10 snapshots לכל סוג, היסטוריה עם diff
- **Import/Export**: תבניות כ-JSON, ולידציה all-or-nothing
- **ניהול Topic ID**: routing ממרכז הבקרה, hot-reload
- **Code splitting**: React.lazy + Suspense ל-10 עמודים; 945KB→364KB
- **WhatsApp Listeners UI**: 4 תת-רכיבים (ListenersBanner, KeywordHelp, RuleCard, SourceSelector)
- 672 בדיקות אוטומטיות

### v0.4.0 — מרץ 2026 (נוכחי)
- **WhatsApp Broadcast לקבוצות**: קבלת התראות פיקוד העורף ישירות ב-WhatsApp, כולל מפה, dedup, fallback
- **קטגוריה 6 — WhatsApp Forward**: קבוצות מנויות להעברות WhatsApp Listener (topic 6 בדשבורד)
- **Listener→WA broadcast**: הודעות מועברות גם לטלגרם וגם לקבוצות WhatsApp מנויות
- **שדרוג דשבורד WhatsApp**: selector חיפוש, תיקוני קטגוריות, fallback, תמיכה בערוצים+קבוצות
- **דף נחיתה: שלוש דרכים**: כרטיסי Telegram / WhatsApp / Self-host עם מידע אוטומטי מ-README
- **ויזארד: פרופילי הגדרות**: 3 פרופילים (minimal/recommended⭐/full) ל-27 משתני סביבה
- **ויזארד: שכפול מהיר**: `git clone --depth 1`, remote → upstream, הצעת fork
- ~700 בדיקות אוטומטיות

---

## 🔮 מפת דרכים — v0.4.1 עד v1.0.0

> **חזון**: הפיכת הבוט ממערכת שידור חד-כיוונית ל**רשת בטיחות חברתית** — משתמשים מתחברים למשפחה, חברים ועמיתים, משתפים סטטוס בטיחות בזמן אזעקה, ומוצאים מקלטים קרובים. **פרטיות קודמת לכל**: כל משתמש שולט בדיוק מה כל איש קשר רואה.
>
> **גישה**: Social-First — v0.4.x–v0.5.x בונים תשתית חברתית מלאה עם Safety Check MVP. כל השאר (מקלטים, אנליטיקס, שפות) נבנה מעליה.

### v0.4.1 — Onboarding & Profile Foundation
- **Onboarding אינטראקטיבי**: wizard פנים-בוט ב-`/start` ראשון — "איפה אתה גר?" → בחירת עיר → הרשמה אוטומטית → שם תצוגה
- **פרופיל משתמש**: שם תצוגה, עיר מגורים, שפה (הכנה ל-i18n)
- **`/profile`**: צפייה ועריכה של פרטי הפרופיל
- הרחבת טבלת `users`: `display_name`, `home_city`, `locale`, `onboarding_completed`

### v0.4.2 — Contact System
- **קוד חיבור**: קוד ייחודי 6 ספרות לכל משתמש
- **`/connect [code]`**: שליחת בקשת קשר הדדית (אישור/דחייה דרך inline keyboard)
- **`/contacts`**: רשימת אנשי קשר עם סטטוס, הסרה, pagination
- **אנטי-ספאם**: מקסימום 10 בקשות ממתינות, פקיעה אחרי 7 ימים
- טבלאות חדשות: `contacts`, `contact_permissions`

### v0.4.3 — Privacy Settings per Contact
- **הרשאות per-contact**: סטטוס בטיחות (✅ ברירת מחדל) / עיר מגורים / זמן עדכון
- **תבנית ברירת מחדל**: `/privacy` — הגדרת ברירות מחדל לאנשי קשר חדשים
- **תצוגת איש קשר**: מה הוא משתף איתך (קריאה) + מה אתה משתף איתו (עריכה)

### v0.5.0 — Safety Check MVP ⭐
- **"אני בסדר"**: אחרי אזעקה בעיר המגורים → הבוט שולח "האם אתה בסדר?" עם 3 כפתורים (✅/⚠️/🔇)
- **`/status`**: עדכון ידני + צפייה בסטטוס אנשי קשר (לפי הרשאות)
- **התראות סטטוס**: כשאיש קשר מעדכן → הודעה לכל מי שמורשה
- **dedup**: prompt אחד לכל אירוע (לפי fingerprint)
- **auto-reset**: סטטוס מתאפס אחרי 24 שעות
- טבלאות חדשות: `safety_status`, `safety_prompts`

### v0.5.1 — Groups (Family / Friends / Work)
- **`/group create [name]`**: קבוצה עם קוד הזמנה (עד 20 חברים, עד 5 קבוצות)
- **`/group join [code]`**: הצטרפות = אישור אוטומטי לשיתוף סטטוס עם חברי הקבוצה
- **מסך סטטוס קבוצתי**: שם + סטטוס + עיר (אם משותפת) לכל חבר, "📊 X/Y בסדר"
- **התראות קבוצתיות**: אזעקה באזור של חבר → כל הקבוצה מקבלת עדכון
- טבלאות חדשות: `groups`, `group_members`

### v0.5.2 — Safety Check Dashboard & Polish
- **דשבורד — לשונית Safety Check**: KPIs, response rate, breakdown (pie chart), מגמה 7 ימים
- **"הכל בסדר" מהיר**: שליחת הודעה מותאמת לכל אנשי הקשר
- **תזכורת עדינה**: באנר ב-menu אם יש אזעקה באזור ולא עדכנת
- **העדפות חברתיות**: toggles להתראות סטטוס, אזעקות באזור אנשי קשר
- **ספירת אנשי קשר ב-DM**: "👥 X אנשי קשר באזור" בהודעת אזעקה

### v0.6.0 — Shelter Finder (GovMap Integration)
- **אינטגרציה עם GovMap API**: שכבה 417 (מקלטים ציבוריים), cache ב-SQLite, רענון שבועי
- **`/shelter`**: 3 מקלטים קרובים לעיר המגורים, עם כתובת, מרחק, זמן הליכה
- **ניווט**: כפתורי `🗺️ Waze` / `📍 Google Maps` עם קישור ישיר
- **GPS**: שליחת מיקום לתוצאות מדויקות יותר
- טבלה חדשה: `shelters`

### v0.6.1 — Shelter in Alert Context
- **כפתור מקלט ב-DM**: "🏃 מקלט קרוב" בהודעת אזעקה (אם יש data)
- **`/sheltermap`**: מפת Mapbox עם סימון 3 מקלטים קרובים
- **דשבורד**: סטטיסטיקות מקלטים, כפתור "רענן עכשיו"

### v0.6.2 — Navigation & Advanced Shelter UX
- **תצוגת פרטים**: כתובת מלאה, סוג, קיבולת, שעות פעילות
- **מקלט מועדף**: שמירת מקלט מועדף → מופיע ראשון
- **מקלט בקבוצה**: בסטטוס קבוצתי — "✅ [שם] בסדר — מקלט: [שם] (200מ')"

### v0.7.0 — Heatmap & Visual Analytics
- **`/heatmap`**: מפת חום של אזעקות (7/30 יום) על בסיס `alert_history`
- **דשבורד — אנליטיקס מורחב**: heatmap אינטראקטיבי, Top 10 ערים, alerts לפי שעה/יום, breakdown לפי קטגוריה
- **ייצוא CSV**: הורדת נתוני אזעקות מהדשבורד

### v0.7.1 — Weekly Report & Trend Alerts
- **דוח שבועי** (opt-in): ראשון 10:00 — סיכום אזעקות באזור, השוואה לשבוע קודם, מגמה
- **התראת מגמה** (opt-in): עלייה של 50%+ → הודעה פרואקטיבית (פעם ביום, 08:00–20:00)
- **Scheduler**: מנגנון תזמון חדש לדוחות ובדיקת מגמות

### v0.7.2 — Personal Map & My Stats
- **`/mymap`**: מפה עם כל הערים המנויות (🔵), עיר מגורים (🟡), אזעקות פעילות (🔴)
- **`/mystats`**: סטטיסטיקות אישיות — סה"כ אזעקות, עיר הכי מותקפת, רצף שקט, response rate

### v0.8.0 — i18n Infrastructure + Arabic
- **מסגרת i18n**: קבצי תרגום key-based (`he.ts`, `ar.ts`), פונקציית `t(key, locale, params?)`
- **`/language`**: בחירת שפה (עברית / العربية)
- **תרגום ערבי מלא**: כל UI הבוט — תפריטים, כפתורים, הודעות מערכת, Safety Check
- ההתראות עצמן נשארות בעברית (מ-API של פיקוד העורף)

### v0.8.1 — Russian Translation
- **`src/i18n/ru.ts`**: תרגום רוסי מלא
- **LTR**: וידוא שכל ה-inline keyboards תקינות ברוסית

### v0.8.2 — Accessibility Mode
- **`/accessibility`**: מצב נגישות — ללא אימוג'ים, טקסט ברור, הנחיות מורחבות
- **ניווט מקלדת**: `/1`, `/2`, `/3` ל-Safety Check; `/help` עם רשימת פקודות

### v0.9.0 — Travel Mode & Advanced Location
- **`/travel [city]`**: התראות זמניות לעיר ביקור (72 שעות, ללא שינוי מנויים קבועים)
- **Safety Check + מסע**: prompt גם לערי מסע, סטטוס "✅ בסדר (נמצא ב[עיר])"
- **מיקום GPS**: שליחת live location → אזעקות לפי העיר הקרובה

### v0.9.1 — Dashboard i18n & Shelter Management
- **דשבורד — עמוד שפות**: עורך תרגומים, אחוז השלמה, ייצוא/ייבוא JSON
- **דשבורד — עמוד מקלטים**: מפה, ספירה לפי עיר, רענון, הוספה ידנית
- **שיפורי Safety Check בדשבורד**: סטטיסטיקות קבוצות, timeline אירועים

### v0.9.2 — Pre-v1.0 Polish
- **ביצועים**: audit על שאילתות DB, ניהול זיכרון, load test ל-Safety Check
- **אבטחה**: rate limiting על כל הנתיבים, ולידציה, enforcement פרטיות, SQL injection review
- **כיסוי בדיקות**: 90%+ על כל המודולים החדשים
- **תיעוד**: עדכון CLAUDE.md, README, CHANGELOG, .env.example

### v1.0.0 — Stable Release ⭐
- כל הפיצ'רים מ-v0.4.1 עד v0.9.2 — יציבים ומאוחדים
- 90%+ כיסוי בדיקות
- עברית + ערבית + רוסית מלא
- תיעוד: README מעודכן, user guide, API docs (OpenAPI/Swagger), contributing guide
- דף נחיתה v2: סקשן "רשת בטיחות", מאתר מקלטים, תמיכה רב-שפתית
- Security audit + performance benchmarks

---

## 🚀 חזון v2.0 (עתידי)

- **WhatsApp Safety Check** — הרחבת שיתוף סטטוס ל-WhatsApp
- **Webhook / Public API** — REST API לצד שלישי (בית חכם, מערכות ארגוניות)
- **PWA / Web App** — דשבורד למשתמש קצה (לא רק admin) עם push notifications
- **Bot-as-a-Service** — multi-tenant לארגונים
- **AI-powered insights** — זיהוי אנומליות, תחזיות
- **דירוגי מקלטים** — crowdsourcing איכות + תמונות
- **שילוב שירותי חירום** — סטטוס "צריך עזרה" → התראה אופציונלית לגורמי חירום

> יש רעיונות או בקשות? פתחו [issue](https://github.com/yonatan2021/pikud-haoref-bot/issues) בגיטהאב.

</div>
