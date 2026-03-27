# בוט התראות פיקוד העורף 🚨

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org)
[![Telegram](https://img.shields.io/badge/Telegram-Bot-blue?logo=telegram)](https://core.telegram.org/bots)

בוט טלגרם בזמן אמת שסוקר את ממשק ה-API של פיקוד העורף כל **2 שניות** ושולח התראות לערוץ טלגרם עם **תמונת מפה אינטראקטיבית** של האזורים המוכרזים.

---

## תכונות עיקריות

- **התראות בזמן אמת** — סקירה רציפה של ה-API של פיקוד העורף
- **מפות Mapbox** — תמונת מפה סטטית עם פוליגוני הערים המדויקים לכל התראה
- **ניתוב לנושאים** — ניתוב אוטומטי של כל סוג התראה לתת-נושא נפרד בערוץ טלגרם
- **DM אישי** — משתמשים יכולים להירשם לערים ספציפיות ולקבל התראות ישירות לפרטי
- **כפילויות** — מניעת שליחת אותה התראה פעמיים
- **Fallback חכם** — אם ה-URL ארוך מדי, עובר לתיבת מיכל או הודעת טקסט
- **תמיכה ב-Proxy** — לשימוש מחוץ לישראל (ה-API חסום גיאוגרפית)

---

## תצוגה מקדימה

```
🔴 התרעת טילים
🕐 14:32 · 📍 שפלה
אשדוד, אשקלון, קריית גת
🛡 היכנסו למרחב המוגן ושהו בו 10 דקות
```

---

## דרישות מוקדמות

- **Node.js** 18 ומעלה
- **חשבון Telegram** + בוט שנוצר דרך [@BotFather](https://t.me/BotFather)
- **חשבון Mapbox** לתמונות מפה ([mapbox.com](https://mapbox.com))
- (אופציונלי) **שרת Proxy** בישראל אם הבוט רץ מחוץ לישראל

---

## התקנה והפעלה

```bash
# שכפל את הריפו
git clone https://github.com/yonatan2021/pikud-haoref-bot.git
cd pikud-haoref-bot

# התקן תלויות
npm install

# הגדר משתני סביבה
cp env.example .env
# ערוך את .env עם הנתונים שלך

# הפעל
npm start
```

לפיתוח עם auto-restart בשינוי קבצים:

```bash
npm run dev
```

---

## משתני סביבה

העתק את `env.example` לקובץ `.env` ומלא את הפרטים:

| משתנה | חובה | תיאור |
|-------|:----:|--------|
| `TELEGRAM_BOT_TOKEN` | ✅ | טוקן הבוט מ-[@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | ✅ | מזהה הערוץ (מספר שלילי לערוצים, חיובי ל-DM) |
| `MAPBOX_ACCESS_TOKEN` | ✅ | טוקן Mapbox ליצירת תמונות מפה |
| `PROXY_URL` | ❌ | כתובת Proxy — נדרש בהרצה מחוץ לישראל |
| `TELEGRAM_INVITE_LINK` | ❌ | קישור הזמנה לערוץ (מוצג בתפריט DM) |
| `TELEGRAM_TOPIC_ID_SECURITY` | ❌ | מזהה נושא 🔴 ביטחוני (טילים, כלי טיס, מחבלים) |
| `TELEGRAM_TOPIC_ID_NATURE` | ❌ | מזהה נושא 🌍 אסונות טבע (רעידת אדמה, צונאמי) |
| `TELEGRAM_TOPIC_ID_ENVIRONMENTAL` | ❌ | מזהה נושא ☢️ סביבתי (חומרים מסוכנים, רדיולוגי) |
| `TELEGRAM_TOPIC_ID_DRILLS` | ❌ | מזהה נושא 🔵 תרגילים |
| `TELEGRAM_TOPIC_ID_GENERAL` | ❌ | מזהה נושא 📢 הודעות כלליות |

> **איך מוצאים Topic ID?** פתח את הנושא בטלגרם → העתק את ה-URL → המספר אחרי `?thread=` הוא ה-`message_thread_id`.

---

## סוגי התראות

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
| `newsFlash` | הודעה מיוחדת (כניסה למרחב מוגן **או** כל-ברור — נקבע לפי תוכן `instructions`) |
| `general` | התרעה כללית |

### תרגילים 🔵
כל סוג קיים גם בגרסת תרגיל עם סיומת `Drill` — למשל `missilesDrill`, `earthQuakeDrill` וכו'.
תרגילים מסומנים בכותרת **"תרגיל —"** כדי שלא יתבלבלו עם אירועים אמיתיים.

---

## ארכיטקטורה

```
AlertPoller (סקירה כל 2 שניות)
    → מאחד התראות מאותו סוג לרשומה אחת
    → deduplication לפי fingerprint (type:עיר1|עיר2|...)
        → mapService.generateMapImage()   # מפת Mapbox סטטית
        → topicRouter.getTopicId()        # ניתוב לנושא הנכון
        → telegramBot.sendAlert()         # שליחה לערוץ
        → dmDispatcher.notifySubscribers() # התראות DM אישיות
```

### Fallback של תמונת מפה
Mapbox מגביל URLs ל-8000 תווים. הבוט מנסה 3 אסטרטגיות:
1. פוליגוני ערים מפושטים (turf simplify)
2. Bounding box אם ה-URL עדיין ארוך מדי
3. הודעת טקסט בלי תמונה כ-fallback אחרון

### מניעת כפילויות
כל התרעה מזוהה לפי `type:עיר1|עיר2|...` (מיון). ה-Set מתאפס כשאין התרעות פעילות — כך אותה התרעה יכולה לחזור לאחר כל-ברור.

---

## מבנה הפרויקט

```
src/
├── index.ts                    # נקודת כניסה
├── alertPoller.ts              # סקירת API + deduplication
├── telegramBot.ts              # עיצוב הודעות + שליחה לערוץ
├── mapService.ts               # יצירת מפת Mapbox
├── cityLookup.ts               # נתוני ערים + פוליגונים
├── topicRouter.ts              # ניתוב סוג התראה → נושא טלגרם
├── types.ts                    # TypeScript interfaces
├── bot/                        # מטפלי DM (grammy)
│   ├── botSetup.ts
│   ├── menuHandler.ts
│   ├── zoneHandler.ts
│   ├── searchHandler.ts
│   └── settingsHandler.ts
├── db/                         # SQLite (better-sqlite3)
│   ├── schema.ts
│   ├── userRepository.ts
│   └── subscriptionRepository.ts
├── services/
│   ├── dmDispatcher.ts         # שליחת התראות DM
│   └── subscriptionService.ts
└── config/
    └── zones.ts                # מיפוי 28 אזורים ל-6 אזורי-על
```

---

## בדיקות

```bash
# כל הבדיקות
npx tsx --test "src/__tests__/*.test.ts"

# בדיקת ניתוב נושאים
npx tsx --test src/__tests__/topicRouter.test.ts

# בדיקת עיצוב הודעות
npx tsx --test src/__tests__/telegramBot.test.ts

# שליחת 5 התראות דמה לטלגרם (בדיקה ידנית)
npx tsx test-alert.ts
```

---

## רישיון ותודות

הפרויקט מופץ תחת רישיון [Apache 2.0](LICENSE).

הפרויקט בנוי על גבי [pikud-haoref-api](https://github.com/eladnava/pikud-haoref-api) מאת [Elad Nava](https://github.com/eladnava), המופץ אף הוא תחת Apache 2.0.
ראה קובץ [NOTICE](NOTICE) לפרטי ייחוס מלאים.
