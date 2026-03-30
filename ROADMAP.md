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

---

## 🔮 מה הלאה?

> מפת הדרכים לגרסאות הבאות תעודכן בהמשך.
>
> יש רעיונות או בקשות? פתחו [issue](https://github.com/yonatan2021/pikud-haoref-bot/issues) בגיטהאב.

</div>
