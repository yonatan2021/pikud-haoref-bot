<div dir="rtl" align="center">

# 🚨 בוט התראות פיקוד העורף

**התראות IDF Home Front Command בזמן אמת — ישירות לטלגרם**

</div>

<div align="center">

[![גרסה](https://img.shields.io/badge/גרסה-0.1.1-brightgreen?style=for-the-badge)](CHANGELOG.md)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://hub.docker.com)
[![CI](https://img.shields.io/badge/CI/CD-GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/yonatan2021/pikud-haoref-bot/actions)
[![Telegram](https://img.shields.io/badge/ערוץ_טלגרם-הצטרף-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/phalaret)

<br/>

[![הצטרף לערוץ ההתראות](https://img.shields.io/badge/🔔_הצטרף_לערוץ_ההתראות-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/phalaret)&nbsp;&nbsp;[![הרץ instance משלך](https://img.shields.io/badge/🚀_הרץ_instance_משלך-2ea44f?style=for-the-badge)](https://github.com/yonatan2021/pikud-haoref-bot#התקנה-מהירה)

<br/>

<div dir="rtl">

סוקר את ה-API של פיקוד העורף כל **2 שניות** ושולח התראות לערוץ טלגרם עם **מפת Mapbox** של האזורים המוכרזים — ותומך בהתראות DM אישיות לפי ערים.

</div>

</div>

---

<div dir="rtl">

## 📸 תצוגה מקדימה

</div>

<div align="center">
<table>
  <tr>
    <td align="center"><img src="docs/screenshots/start.jpg" width="180"/><br/><sub><b>תפריט ראשי</b></sub></td>
    <td align="center"><img src="docs/screenshots/zones.jpg" width="180"/><br/><sub><b>בחירת אזור</b></sub></td>
    <td align="center"><img src="docs/screenshots/add.jpg" width="180"/><br/><sub><b>חיפוש עיר</b></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/mycities.jpg" width="180"/><br/><sub><b>הערים שלי</b></sub></td>
    <td align="center"><img src="docs/screenshots/settings.jpg" width="180"/><br/><sub><b>הגדרות פורמט</b></sub></td>
    <td align="center">
      <br/>
      <code>🔴  התרעת טילים</code><br/>
      <code>🕐 14:32  ·  📍 שפלה</code><br/><br/>
      <code>אשדוד, אשקלון, קריית גת</code><br/><br/>
      <code>🛡 היכנסו למרחב המוגן</code><br/>
      <br/><sub><b>הודעת ערוץ</b></sub>
    </td>
  </tr>
</table>
</div>

---

<div dir="rtl">

## ✨ תכונות

| תכונה | פרטים |
|--------|-------|
| ⚡ **התראות בזמן אמת** | סקירה רציפה של ה-API כל 2 שניות |
| 🗺️ **מפות Mapbox** | פוליגוני ערים מדויקים — fallback לbounding box ולטקסט |
| ✏️ **עריכת הודעות** | התראות מאותו סוג עורכות את ההודעה הקיימת בחלון זמן מוגדר |
| 📊 **מגבלת Mapbox חודשית** | מונה SQLite + מטמון תמונות — חוסך קוטה ומונע חריגה |
| 📢 **ניתוב נושאים** | 5 קטגוריות: ביטחוני, טבע, סביבתי, תרגילים, כללי |
| 🔔 **DM אישי** | מנוי לערים ספציפיות — פורמט קצר או מפורט |
| 📍 **מנוי לפי אזור** | 6 אזורי-על ← 28 אזורים ← ערים, כולל "בחר/הסר כל האזור" |
| 🔍 **חיפוש עיר** | חיפוש חופשי בשם, תוצאות מיידיות |
| 🛡️ **מניעת כפילויות** | fingerprint חכם — פוקע כשהתרעה נעלמת, לא רק ב-all-clear |
| 📡 **newsFlash ארצי** | תפיסת הודעות ללא ערים שהספרייה מדלגת עליהן |
| 🐳 **Docker** | תמיכה מלאה — multi-stage build, non-root user, volume לנתונים |
| 🚀 **CI/CD** | GitHub Actions: בדיקות + בנייה אוטומטית + דחיפה ל-Docker Hub |
| 🌐 **תמיכה ב-Proxy** | לשימוש מחוץ לישראל (ה-API חסום גיאוגרפית) |

</div>

---

<div dir="rtl">

## 🤖 פקודות הבוט

| פקודה | תיאור |
|--------|-------|
| `/start` | תפריט ראשי — רישום ערים, הגדרות, קישור לערוץ |
| `/add` | חיפוש עיר לפי שם והרשמה |
| `/zones` | עיון ורישום לפי אזור גיאוגרפי |
| `/mycities` | הצגת הערים הרשומות עם אפשרות הסרה |
| `/settings` | פורמט DM (קצר / מפורט) + ביטול מנויים |

</div>

---

<a id="התקנה-מהירה"></a>

<div dir="rtl">

## 🚀 התקנה מהירה

### הרצה עם Node.js

```bash
git clone https://github.com/yonatan2021/pikud-haoref-bot.git
cd pikud-haoref-bot
npm install
cp env.example .env   # ערוך עם הנתונים שלך
npm start
```

לפיתוח עם auto-restart:

```bash
npm run dev
```

### הרצה עם Docker (מומלץ)

```bash
# תמונה פומבית — מוכנה לשימוש מיידי
docker run --env-file .env \
  -v /host/data:/app/data \
  ghcr.io/yonatan2021/pikud-haoref-bot:latest
```

```bash
# בנייה מקומית
docker build -t pikud-haoref-bot .
docker run --env-file .env \
  -v $(pwd)/data:/app/data \
  pikud-haoref-bot
```

> **הערה:** ה-SQLite נשמר ב-`data/subscriptions.db`. הרכב volume לשמירת נתוני המנויים בין הפעלות.

</div>

---

<div dir="rtl">

## ⚙️ משתני סביבה

### חובה

| משתנה | תיאור |
|--------|-------|
| `TELEGRAM_BOT_TOKEN` | טוקן הבוט מ-[@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | מזהה הערוץ (מספר שלילי לערוצים, חיובי ל-DM) |
| `MAPBOX_ACCESS_TOKEN` | טוקן Mapbox ליצירת תמונות מפה |

### ניתוב נושאים בטלגרם (אופציונלי)

| משתנה | תיאור |
|--------|-------|
| `TELEGRAM_TOPIC_ID_SECURITY` | Thread ID לנושא 🔴 ביטחוני (טילים, כלי טיס, מחבלים) |
| `TELEGRAM_TOPIC_ID_NATURE` | Thread ID לנושא 🌍 אסונות טבע |
| `TELEGRAM_TOPIC_ID_ENVIRONMENTAL` | Thread ID לנושא ☢️ סביבתי |
| `TELEGRAM_TOPIC_ID_DRILLS` | Thread ID לנושא 🔵 תרגילים |
| `TELEGRAM_TOPIC_ID_GENERAL` | Thread ID לנושא 📢 הודעות כלליות |

> כיצד לקבל Thread ID: פתח נושא בטלגרם → לחץ על ההודעה הראשונה → העתק קישור → המספר אחרי `?thread=`
> ⚠️ אין להשתמש ב-`1` — שמור ויחזיר שגיאה בקבוצות פורום.

### Mapbox וניהול מכסה (אופציונלי)

| משתנה | ברירת מחדל | תיאור |
|--------|:----------:|-------|
| `MAPBOX_MONTHLY_LIMIT` | ללא מגבלה | מגבלת בקשות חודשית — fallback לטקסט כשמגיעים למגבלה. מומלץ: `40000` |
| `MAPBOX_IMAGE_CACHE_SIZE` | `20` | גודל מטמון FIFO בזיכרון לתמונות מפה (לפי fingerprint) |
| `MAPBOX_SKIP_DRILLS` | `false` | הגדר `true` כדי לשלוח תרגילים כטקסט בלבד (ללא מפה) |

### עריכת הודעות (אופציונלי)

| משתנה | ברירת מחדל | תיאור |
|--------|:----------:|-------|
| `ALERT_UPDATE_WINDOW_SECONDS` | `120` | שניות שבהן הודעה נשארת עריכה. התראות מאותו סוג בתוך החלון עורכות את ההודעה הקיימת במקום לשלוח חדשה |

### כללי (אופציונלי)

| משתנה | תיאור |
|--------|-------|
| `PROXY_URL` | `http://user:pass@host:port` — נדרש מחוץ לישראל |
| `TELEGRAM_INVITE_LINK` | קישור הזמנה לערוץ (מוצג בתפריט DM) |

</div>

---

<div dir="rtl">

## 🏗️ ארכיטקטורה

### זרימת נתונים

</div>

```mermaid
flowchart TD
    A[⏱️ AlertPoller\nכל 2 שניות] --> B[📚 pikud-haoref-api\nספרייה]
    A --> C[🌐 Direct fetch\nnewsFlash ארצי]
    B --> D[🔀 Group & Fingerprint\nמיזוג + dedup]
    C --> D
    D --> E{🔑 כבר נשלח?}
    E -- כן --> F[⏭️ דלג]
    E -- לא --> G[🎯 alertHandler\ncoordinator מרכזי]
    G --> H[📍 topicRouter\nניתוב נושא]
    G --> I{✏️ הודעה פעילה\nבחלון הזמן?}
    I -- כן --> J[🗺️ mapService\nמפה מעודכנת]
    I -- לא --> K[🗺️ mapService\nמפה חדשה]
    J --> L[✏️ editAlert\nעריכת הודעה]
    K --> M[📢 sendAlert\nשליחה לערוץ]
    L --> N[🕑 alertWindowTracker\nעדכון מעקב]
    M --> N
    N --> O[👤 dmDispatcher\nהתראות DM אישיות]
```

<div dir="rtl">

### Fallback תמונת מפה

```
URL ארוך מ-8000 תווים?
  ✅ שלב 1: פוליגוני ערים מפושטים (turf simplify)
  ✅ שלב 2: Bounding box rectangle
  ✅ שלב 3: הודעת טקסט בלבד
```

### עריכת הודעות בחלון זמן

כאשר מגיעה התראה מאותו סוג (למשל טילים נוספים) בתוך חלון `ALERT_UPDATE_WINDOW_SECONDS`:
1. מזוג ערים (union) עם הרשימה הקיימת
2. יצירת מפה מעודכנת
3. עריכת ההודעה הקיימת בטלגרם (`editMessageMedia` / `editMessageText`)
4. אם העריכה נכשלת — שליחת הודעה חדשה כ-fallback

### ניהול מכסת Mapbox

```
בקשת מפה נכנסת
  → בדוק מטמון זיכרון (fingerprint) → Cache hit? ← החזר תמונה שמורה
  → בדוק מונה חודשי ב-SQLite → עבר מגבלה? ← Fallback לטקסט
  → שלח בקשה ל-Mapbox API → הצלחה? ← עדכן מונה + שמור למטמון
```

</div>

---

<div dir="rtl">

## 🗺️ אזורים גיאוגרפיים

<details>
<summary>28 אזורים ב-6 אזורי-על — לחץ להצגה</summary>

| אזור-על | אזורים |
|---------|--------|
| 🌲 צפון | גליל עליון, גליל תחתון, גולן, קו העימות, קצרין, יערות הכרמל, תבור, בקעת בית שאן |
| 🏙️ חיפה וכרמל | חיפה, קריות, חוף הכרמל |
| 🌆 מרכז | שרון, ירקון, דן, חפר, מנשה, ואדי ערה |
| 🕍 ירושלים והסביבה | ירושלים, בית שמש, השפלה, דרום השפלה, לכיש, מערב לכיש |
| 🏜️ דרום | עוטף עזה, מערב הנגב, מרכז הנגב, דרום הנגב, ערבה, ים המלח, אילת |
| ⛰️ יהודה ושומרון | יהודה, שומרון, בקעה |

</details>

</div>

---

<div dir="rtl">

## 🚨 סוגי התראות

<details>
<summary>כל סוגי ההתראות הנתמכים — לחץ להצגה</summary>

### ביטחוני 🔴
| סוג | תיאור |
|-----|--------|
| `missiles` | התרעת טילים |
| `hostileAircraftIntrusion` | חדירת כלי טיס עוין |
| `terroristInfiltration` | חדירת מחבלים |

### אסונות טבע 🌍
| סוג | תיאור |
|-----|--------|
| `earthQuake` | רעידת אדמה |
| `tsunami` | צונאמי |

### סביבתי ☢️
| סוג | תיאור |
|-----|--------|
| `hazardousMaterials` | חומרים מסוכנים |
| `radiologicalEvent` | אירוע רדיולוגי |

### כללי 📢
| סוג | תיאור |
|-----|--------|
| `newsFlash` | הודעה מיוחדת — כניסה למרחב מוגן **או** כל-ברור (טקסט בלבד, ללא מפה) |
| `general` | התרעה כללית |

### תרגילים 🔵
כל סוג קיים גם בגרסת `Drill` — מסומן בכותרת **"תרגיל —"**. ניתן לשלוח כטקסט בלבד עם `MAPBOX_SKIP_DRILLS=true`.

</details>

</div>

---

<div dir="rtl">

## 🧪 בדיקות

```bash
# כל הבדיקות
npm test

# בדיקות לפי קובץ
npx tsx --test src/__tests__/alertHandler.test.ts        # handler מרכזי
npx tsx --test src/__tests__/alertHelpers.test.ts        # עזרי התראה (isDrill, shouldSkipMap)
npx tsx --test src/__tests__/alertWindowTracker.test.ts  # מעקב חלון עריכה
npx tsx --test src/__tests__/dmDispatcher.test.ts        # שליחת DM
npx tsx --test src/__tests__/index.test.ts               # נקודת כניסה
npx tsx --test src/__tests__/mapService.test.ts          # שירות מפות
npx tsx --test src/__tests__/mapboxUsageRepository.test.ts # מונה Mapbox
npx tsx --test src/__tests__/subscriptionService.test.ts # שירות מנויים
npx tsx --test src/__tests__/telegramBot.test.ts         # עיצוב הודעות
npx tsx --test src/__tests__/topicRouter.test.ts         # ניתוב נושאים
npx tsx --test src/__tests__/zoneConfig.test.ts          # תצורת אזורים

# שליחת 5 התראות דמה לטלגרם (בדיקה ידנית)
npx tsx test-alert.ts
```

</div>

---

<div dir="rtl">

## 📁 מבנה הפרויקט

<details>
<summary>הצג מבנה קבצים מלא</summary>

```
src/
├── index.ts                    # נקודת כניסה — מאחד alertPoller + bot
├── alertHandler.ts             # coordinator מרכזי — מעבד התראה חדשה (dependency injection)
├── alertHelpers.ts             # עזרים: isDrillAlert, shouldSkipMap
├── alertPoller.ts              # סקירת API + deduplication + newsFlash ארצי
├── alertWindowTracker.ts       # מעקב הודעות פעילות לפי סוג עם TTL
├── telegramBot.ts              # עיצוב הודעות + sendAlert + editAlert
├── mapService.ts               # Mapbox: יצירת מפה + cache + fallback
├── cityLookup.ts               # נתוני ערים + פוליגונים + חיפוש
├── topicRouter.ts              # ניתוב סוג התראה → נושא טלגרם
├── types.ts                    # TypeScript interfaces
├── bot/
│   ├── botSetup.ts             # רישום handlers + setMyCommands
│   ├── menuHandler.ts          # /start, תפריט ראשי
│   ├── zoneHandler.ts          # /zones, מנוי לפי אזור
│   ├── searchHandler.ts        # /add, חיפוש חופשי
│   └── settingsHandler.ts      # /settings, /mycities
├── db/                         # SQLite — better-sqlite3 (סינכרוני)
│   ├── schema.ts               # initDb(), getDb() singleton
│   ├── userRepository.ts
│   ├── subscriptionRepository.ts
│   └── mapboxUsageRepository.ts # מונה בקשות Mapbox חודשי
├── services/
│   ├── dmDispatcher.ts         # שליחת DM למנויים
│   └── subscriptionService.ts
└── config/
    └── zones.ts                # 28 אזורים → 6 אזורי-על
```

</details>

</div>

---

<div dir="rtl">

## 🚀 CI/CD ו-Docker Hub

הפרויקט מפורסם אוטומטית ב-push ל-`main`:

| Registry | Image |
|----------|-------|
| GitHub Container Registry | `ghcr.io/yonatan2021/pikud-haoref-bot:latest` |
| Docker Hub | `yonatan2021/pikud-haoref-bot:latest` |

</div>

---

<div dir="rtl">

## 📄 רישיון ותודות

מופץ תחת רישיון [Apache 2.0](LICENSE).

בנוי על גבי [pikud-haoref-api](https://github.com/eladnava/pikud-haoref-api) מאת [Elad Nava](https://github.com/eladnava) — Apache 2.0.
ראה [NOTICE](NOTICE) לפרטי ייחוס מלאים.

</div>

---

<div align="center">

עשוי עם ❤️ בישראל 🇮🇱

</div>
