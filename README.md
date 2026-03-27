<div align="center">

# 🚨 בוט התראות פיקוד העורף

**התראות IDF Home Front Command בזמן אמת — ישירות לטלגרם**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots)

סוקר את ה-API של פיקוד העורף כל **2 שניות** ושולח התראות לערוץ טלגרם עם **מפת Mapbox** של האזורים המוכרזים — ותומך בהתראות DM אישיות לפי ערים.

</div>

---

## 📸 תצוגה מקדימה

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

## ✨ תכונות

| תכונה | פרטים |
|-------|--------|
| ⚡ **התראות בזמן אמת** | סקירה רציפה של ה-API כל 2 שניות |
| 🗺️ **מפות Mapbox** | פוליגוני ערים מדויקים — fallback לבounding box או טקסט |
| 📢 **ניתוב נושאים** | 5 קטגוריות: ביטחוני, טבע, סביבתי, תרגילים, כללי |
| 🔔 **DM אישי** | מנוי לערים ספציפיות — פורמט קצר או מפורט |
| 📍 **מנוי לפי אזור** | 6 אזורי-על ← 28 אזורים ← ערים, כולל "בחר/הסר כל האזור" |
| 🔍 **חיפוש עיר** | חיפוש חופשי בשם, תוצאות מיידיות |
| 🛡️ **מניעת כפילויות** | fingerprint חכם — פוקע כשהתרעה נעלמת, לא רק ב-all-clear |
| 📡 **newsFlash ארצי** | תפיסת הודעות ללא ערים שהספרייה מדלגת עליהן |
| 🌐 **תמיכה ב-Proxy** | לשימוש מחוץ לישראל (ה-API חסום גיאוגרפית) |

---

## 🚀 התקנה מהירה

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

---

## ⚙️ משתני סביבה

| משתנה | חובה | תיאור |
|-------|:----:|--------|
| `TELEGRAM_BOT_TOKEN` | ✅ | טוקן הבוט מ-[@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | ✅ | מזהה הערוץ (מספר שלילי לערוצים) |
| `MAPBOX_ACCESS_TOKEN` | ✅ | טוקן Mapbox ליצירת תמונות מפה |
| `PROXY_URL` | ❌ | `http://user:pass@host:port` — נדרש מחוץ לישראל |
| `TELEGRAM_INVITE_LINK` | ❌ | קישור הזמנה לערוץ (מוצג בתפריט DM) |
| `TELEGRAM_TOPIC_ID_SECURITY` | ❌ | נושא 🔴 ביטחוני |
| `TELEGRAM_TOPIC_ID_NATURE` | ❌ | נושא 🌍 אסונות טבע |
| `TELEGRAM_TOPIC_ID_ENVIRONMENTAL` | ❌ | נושא ☢️ סביבתי |
| `TELEGRAM_TOPIC_ID_DRILLS` | ❌ | נושא 🔵 תרגילים |
| `TELEGRAM_TOPIC_ID_GENERAL` | ❌ | נושא 📢 הודעות כלליות |

> **Topic ID:** פתח נושא בטלגרם → העתק URL → המספר אחרי `?thread=`
> ⚠️ אל תשתמש ב-`1` — שמור ויחזיר שגיאה בקבוצות פורום.

---

## 🤖 פקודות הבוט

| פקודה | תיאור |
|--------|--------|
| `/start` | תפריט ראשי — רישום ערים, הגדרות, קישור לערוץ |
| `/add` | חיפוש עיר לפי שם והרשמה |
| `/zones` | עיון ורישום לפי אזור גיאוגרפי |
| `/mycities` | הצגת הערים הרשומות עם אפשרות הסרה |
| `/settings` | פורמט DM (קצר / מפורט) + ביטול מנויים |

---

## 🏗️ ארכיטקטורה

```mermaid
flowchart TD
    A[⏱️ AlertPoller\n כל 2 שניות] --> B[📚 pikud-haoref-api\n ספרייה]
    A --> C[🌐 Direct fetch\n newsFlash ארצי]
    B --> D[🔀 Group by type\n מיזוג לפי סוג]
    C --> D
    D --> E{🔑 Fingerprint\n כבר נשלח?}
    E -- לא --> F[🗺️ mapService\n מפת Mapbox]
    E -- כן --> G[⏭️ דלג]
    F --> H[📍 topicRouter\n ניתוב נושא]
    H --> I[📢 telegramBot\n שליחה לערוץ]
    I --> J[👤 dmDispatcher\n התראות DM אישיות]
```

### Fallback תמונת מפה

```
URL > 8000 תווים?
    ✅ פוליגוני ערים מפושטים (turf simplify)
    ✅ Bounding box rectangle
    ✅ הודעת טקסט בלבד
```

---

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

---

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
| `newsFlash` | הודעה מיוחדת — כניסה למרחב מוגן **או** כל-ברור |
| `general` | התרעה כללית |

### תרגילים 🔵
כל סוג קיים גם בגרסת `Drill` — מסומן בכותרת **"תרגיל —"**.

</details>

---

## 🧪 בדיקות

```bash
# כל הבדיקות
npx tsx --test "src/__tests__/*.test.ts"

# בדיקות ספציפיות
npx tsx --test src/__tests__/topicRouter.test.ts       # ניתוב נושאים
npx tsx --test src/__tests__/telegramBot.test.ts       # עיצוב הודעות
npx tsx --test src/__tests__/dmDispatcher.test.ts      # שליחת DM
npx tsx --test src/__tests__/subscriptionService.test.ts
npx tsx --test src/__tests__/zoneConfig.test.ts

# שליחת 5 התראות דמה לטלגרם
npx tsx test-alert.ts
```

---

## 📁 מבנה הפרויקט

<details>
<summary>הצג מבנה קבצים מלא</summary>

```
src/
├── index.ts                    # נקודת כניסה
├── alertPoller.ts              # סקירת API + deduplication + newsFlash ארצי
├── telegramBot.ts              # עיצוב הודעות + שליחה לערוץ
├── mapService.ts               # יצירת מפת Mapbox + fallback
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
│   ├── schema.ts
│   ├── userRepository.ts
│   └── subscriptionRepository.ts
├── services/
│   ├── dmDispatcher.ts         # שליחת DM למנויים
│   └── subscriptionService.ts
└── config/
    └── zones.ts                # 28 אזורים → 6 אזורי-על
```

</details>

---

## 📄 רישיון ותודות

מופץ תחת רישיון [Apache 2.0](LICENSE).

בנוי על גבי [pikud-haoref-api](https://github.com/eladnava/pikud-haoref-api) מאת [Elad Nava](https://github.com/eladnava) — Apache 2.0.
ראה [NOTICE](NOTICE) לפרטי ייחוס מלאים.
