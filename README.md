<div dir="rtl" align="center">

<img src="./landing/template/logo.jpg" alt="לוגו בוט התראות פיקוד העורף" width="180" />

# 🚨 בוט התראות פיקוד העורף

**התראות IDF Home Front Command בזמן אמת — ישירות לטלגרם**

</div>

<div align="center">

[![גרסה](https://img.shields.io/badge/גרסה-0.3.0-brightgreen?style=for-the-badge)](CHANGELOG.md)
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

### 🔔 למשתמש הקצה

| תכונה | פרטים |
|--------|-------|
| ⚡ **התראות בזמן אמת** | מתעדכן כל 2 שניות — ללא עיכוב |
| 🗺️ **מפה לכל התראה** | הדגשת האזורים המוזהרים בצבע לפי סוג האירוע; fallback לסמני מיקום כשאין נתוני polygon |
| 📢 **5 קטגוריות נושא** | ביטחוני, טבע, סביבתי, תרגילים, כללי — ניתוב לערוץ המתאים |
| 📋 **הודעה מפורטת** | ספירת ערים כוללת בכותרת, ערים ממוינות אלפבתית לפי אזור, שעת ההתראה המדויקת |
| 🔔 **DM אישי** | הודעה ישירה רק כשמוזהרת עיר שבחרת |
| 📍 **מנוי לפי אזור** | בחירה לפי אזור גיאוגרפי, עם אפשרות "בחר את כל האזור" |
| 🔍 **חיפוש עיר** | חיפוש חופשי לפי שם — תוצאות מיידיות |
| 😴 **השתקה זמנית** | להשתיק DMs לפרק זמן — התראות ביטחוניות תמיד עוברות |
| 🔕 **שעות שקט** | ביטול DMs בשעות הלילה (23:00–06:00), בלי לפספס התראות קריטיות |
| 📜 **היסטוריית התראות** | צפייה ב-10 התראות אחרונות — לאזורך, לעיר ספציפית, או כלל-ארצי |
| 👤 **DM מותאם אישית** | כל מנוי מקבל רק את הערים שלו — לא הצפה מהכל |

### ⚙️ למתכנתים ו-DevOps

| תכונה | פרטים |
|--------|-------|
| 🛡️ **מניעת כפילויות** | fingerprint חכם — פוקע כשהתרעה נעלמת, לא רק ב-all-clear |
| ✏️ **עריכת הודעות** | התראות מאותו סוג עורכות את ההודעה הקיימת בחלון זמן מוגדר; שרשרת מדורגת: editMessageMedia → editMessageCaption → editMessageText |
| 📊 **מגבלת Mapbox חודשית** | מונה SQLite + מטמון תמונות — חוסך קוטה ומונע חריגה |
| 📡 **newsFlash ארצי** | תפיסת הודעות ללא ערים שהספרייה מדלגת עליהן |
| 🔄 **עמידות לאיתחול** | חלון ההתראות נשמר ב-SQLite — אין הודעות כפולות לאחר הפעלה מחדש |
| ⚡ **DM Queue** | תור שליחה עם מגבלת מקביליות (10) ו-backoff אוטומטי לשגיאות 429 |
| 🏥 **Health endpoint** | `GET /health` עם uptime, lastAlertAt ו-alertsToday לניטור חיצוני |
| 🎛️ **לוח בקרה** | Admin Dashboard — React + glassmorphism UI, framer-motion, ניהול מנויים, broadcast, הגדרות, ניהול WhatsApp listeners |
| 🖥️ **Terminal UI** | `logger.ts` מובנה — chalk v4, logStartupHeader, logAlert, תמיכה בעברית RTL |
| 🧙 **NPX Wizard** | `--update` לעדכון .env קיים, `--verify` לבדיקת טוקנים, ולידציה חיה בכל שדה, בחירת פלטפורמה (Telegram / WhatsApp / שניהם) |
| 🐳 **Docker** | multi-stage build, non-root user, volume לנתונים |
| 🚀 **CI/CD** | GitHub Actions: 4 jobs מקבילים — test, dashboard-build, docker-build, wizard-check |
| 🌐 **Proxy** | תמיכה בהרצה מחוץ לישראל |
| 📱 **WhatsApp Listener** | האזנה לקבוצות/ערוצים WhatsApp, סינון לפי מילות מפתח, העברה לטלגרם (WHATSAPP_ENABLED=true) |
| 🔒 **Rate Limiting** | הגנה על endpoints בדשבורד (broadcast, deploy, export), bot callbacks, ו-brute-force פרסיסטנטי ב-SQLite |
| ⚡ **Caching O(1)** | cityLookup Maps, subscription cache in-memory, TTL stats cache, Mapbox usage cache — אפס DB hits בנתיב ההתראות |
| 📨 **שיפורי הודעות** | חותמת זמן יציבה (Asia/Jerusalem), ספירת ערים בכותרת, מיון אלפבתי, `📍 ערים נוספות` לערים ללא polygon |

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
| `/settings` | פורמט DM (קצר / מפורט) + שעות שקט + ביטול מנויים |
| `/stats` | סטטיסטיקת 24 שעות אחרונות לפי קטגוריה + ספירה אישית לאזורך |
| `/history` | 10 התראות אחרונות — לאזורך, לעיר ספציפית, או כלל-ארצי |

</div>

---

<a id="התקנה-מהירה"></a>

<div dir="rtl">

## 🚀 התקנה מהירה

### פקודה אחת (מומלץ)

```bash
npx @haoref-boti/pikud-haoref-bot
```

הוויזארד ישאל אותך על הטוקנים הנדרשים, יכתוב קובץ `.env`, ויציג את פקודת ההרצה.

**אפשרויות:**
```bash
# הגדרת כל הערכים מראש (ללא שאלות)
npx @haoref-boti/pikud-haoref-bot --token=xxx --chat-id=-123456 --mapbox=yyy

# כולל הגדרות אופציונליות (dashboard, proxy, topic IDs)
npx @haoref-boti/pikud-haoref-bot --full

# עדכון .env קיים
npx @haoref-boti/pikud-haoref-bot --update

# בדיקת תקינות הטוקנים
npx @haoref-boti/pikud-haoref-bot --verify

# עזרה
npx @haoref-boti/pikud-haoref-bot --help
```

### הרצה ידנית עם Node.js

```bash
git clone https://github.com/yonatan2021/pikud-haoref-bot.git
cd pikud-haoref-bot
npm install
cp .env.example .env   # ערוך עם הנתונים שלך
npm start
```

לפיתוח עם auto-restart:

```bash
npm run dev
```

### הרצה עם Docker

```bash
# תמונה פומבית — מוכנה לשימוש מיידי
docker run -d --restart unless-stopped \
  --env-file .env \
  -v ./data:/app/data \
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

### ניטור (אופציונלי)

| משתנה | ברירת מחדל | תיאור |
|--------|:----------:|-------|
| `HEALTH_PORT` | `3000` | פורט ל-`GET /health` — מחזיר uptime, lastAlertAt, lastPollAt, alertsToday |

### לוח בקרה (אופציונלי)

| משתנה | ברירת מחדל | תיאור |
|--------|:----------:|-------|
| `DASHBOARD_SECRET` | — | סיסמת לוח הבקרה — מפעיל את לוח הבקרה כשמוגדר |
| `DASHBOARD_PORT` | `4000` | פורט שרת לוח הבקרה |
| `GA4_MEASUREMENT_ID` | — | Google Analytics 4 Measurement ID לדף הנחיתה |
| `GITHUB_PAT` | — | GitHub Personal Access Token להפעלת deploy לדף הנחיתה |
| `GITHUB_REPO` | — | ריפו GitHub (owner/repo) להפעלת deploy לדף הנחיתה |

### WhatsApp (אופציונלי)

| משתנה | ברירת מחדל | תיאור |
|--------|:----------:|-------|
| `WHATSAPP_ENABLED` | `false` | הגדר `true` להפעלת לקוח `whatsapp-web.js`; סריקת QR נדרשת בהפעלה הראשונה; session נשמר ב-`.wwebjs_auth/` |
| `TELEGRAM_FORWARD_GROUP_ID` | — | מזהה קבוצה/ערוץ טלגרם לקבלת הודעות מ-WhatsApp Listener; fallback ל-`TELEGRAM_CHAT_ID` |

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
    A --> P[📊 metrics\nupdateLastPollAt]
    B --> D[🔀 Group & Fingerprint\nמיזוג + dedup]
    C --> D
    D --> E{🔑 כבר נשלח?}
    E -- כן --> F[⏭️ דלג]
    E -- לא --> G[🎯 alertHandler\ncoordinator מרכזי]
    G --> P2[📊 metrics\nupdateLastAlertAt]
    G --> H[📍 topicRouter\nניתוב נושא]
    G --> I{✏️ הודעה פעילה\nבחלון הזמן?}
    I -- כן --> J[🗺️ mapService\nמפה מעודכנת]
    I -- לא --> K[🗺️ mapService\nמפה חדשה]
    J --> L[✏️ editAlert\nעריכת הודעה]
    K --> M[📢 sendAlert\nשליחה לערוץ]
    L --> N[🕑 alertWindowTracker\nעדכון + SQLite]
    M --> N
    M --> Q[📜 alertHistory\ninsertAlert]
    N --> O[👤 dmDispatcher\nשעות שקט + matchedCities]
    O --> R[⚡ DmQueue\nמקביליות 10 + backoff 429]
    P --> S[🏥 GET /health\nuptime · lastAlertAt · alertsToday]
    P2 --> S
    Q --> S
```

<div dir="rtl">

### Fallback תמונת מפה

```
URL ארוך מ-8000 תווים?
  ✅ שלב 1: פוליגוני ערים מפושטים (tolerance 0.001)
  ✅ שלב 2: פישוט אגרסיבי (tolerance 0.01)
  ✅ שלב 3: סמני מרכז עיר (pin markers — ~30 תווים לעיר)
  ✅ שלב 4: Bounding box rectangle
  ✅ שלב 5: הודעת טקסט בלבד
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
# כל הבדיקות (bot core)
npm test

# בדיקות dashboard (DB בזיכרון)
DB_PATH=:memory: npx tsx --test 'src/__tests__/dashboard/**/*.test.ts'

# בדיקות לפי קובץ — bot core
npx tsx --test src/__tests__/alertHandler.test.ts           # handler מרכזי
npx tsx --test src/__tests__/alertHelpers.test.ts           # עזרי התראה (isDrill, shouldSkipMap)
npx tsx --test src/__tests__/alertHistoryRepository.test.ts # שמירה וקריאה של היסטוריית התראות
npx tsx --test src/__tests__/alertPoller.test.ts            # סקירת API + deduplication
npx tsx --test src/__tests__/alertWindowTracker.test.ts     # מעקב חלון עריכה
npx tsx --test src/__tests__/cityLookup.test.ts             # O(1) Maps + FIFO search cache
npx tsx --test src/__tests__/dmDispatcher.test.ts           # שליחת DM + שעות שקט + snooze
npx tsx --test src/__tests__/dmQueue.test.ts                # תור שליחה + backoff 429
npx tsx --test src/__tests__/healthServer.test.ts           # GET /health endpoint
npx tsx --test src/__tests__/historyHandler.test.ts         # פקודת /history
npx tsx --test src/__tests__/index.test.ts                  # נקודת כניסה
npx tsx --test src/__tests__/mapService.test.ts             # שירות מפות
npx tsx --test src/__tests__/mapboxUsageRepository.test.ts  # מונה Mapbox (cache + SQLite)
npx tsx --test src/__tests__/menuHandler.test.ts            # תפריט ראשי + הצגת התראה אחרונה
npx tsx --test src/__tests__/rateLimiter.test.ts            # rate limiting middleware
npx tsx --test src/__tests__/settingsHandler.test.ts        # /settings + snooze
npx tsx --test src/__tests__/statsHandler.test.ts           # פקודת /stats
npx tsx --test src/__tests__/subscriptionRepository.test.ts # in-memory subscription cache
npx tsx --test src/__tests__/subscriptionService.test.ts    # שירות מנויים
npx tsx --test src/__tests__/telegramBot.test.ts            # עיצוב הודעות
npx tsx --test src/__tests__/topicRouter.test.ts            # ניתוב נושאים
npx tsx --test src/__tests__/userCooldown.test.ts           # per-user callback cooldown
npx tsx --test src/__tests__/whatsappBroadcaster.test.ts    # broadcast להתראות WhatsApp
npx tsx --test src/__tests__/whatsappFormatter.test.ts      # פורמט הודעות WhatsApp
npx tsx --test src/__tests__/whatsappGroupRepository.test.ts # CRUD whatsapp_groups
npx tsx --test src/__tests__/whatsappListenerRepository.test.ts # CRUD whatsapp_listeners
npx tsx --test src/__tests__/whatsappListenerService.test.ts # keyword match → Telegram forward
npx tsx --test src/__tests__/whatsappService.test.ts        # whatsapp-web.js client
npx tsx --test src/__tests__/zoneConfig.test.ts             # תצורת אזורים

# בדיקות לפי קובץ — dashboard
DB_PATH=:memory: npx tsx --test src/__tests__/dashboard/auth.test.ts
DB_PATH=:memory: npx tsx --test src/__tests__/dashboard/settingsRepository.test.ts
DB_PATH=:memory: npx tsx --test src/__tests__/dashboard/statsCache.test.ts
DB_PATH=:memory: npx tsx --test src/__tests__/dashboard/routes/stats.test.ts
DB_PATH=:memory: npx tsx --test src/__tests__/dashboard/routes/subscribers.test.ts
DB_PATH=:memory: npx tsx --test src/__tests__/dashboard/routes/operations.test.ts
DB_PATH=:memory: npx tsx --test src/__tests__/dashboard/routes/whatsapp.test.ts
DB_PATH=:memory: npx tsx --test src/__tests__/dashboard/routes/whatsappListeners.test.ts

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
├── index.ts                    # נקודת כניסה — מאחד alertPoller + bot + healthServer + dashboard
├── alertHandler.ts             # coordinator מרכזי — מעבד התראה חדשה (dependency injection)
├── alertHelpers.ts             # עזרים: isDrillAlert, shouldSkipMap
├── alertPoller.ts              # סקירת API + deduplication + newsFlash ארצי
├── alertWindowTracker.ts       # מעקב הודעות פעילות לפי סוג עם TTL + SQLite persistence
├── healthServer.ts             # GET /health — uptime, lastAlertAt, lastPollAt, alertsToday
├── metrics.ts                  # מצב גלובלי: lastAlertAt, lastPollAt
├── telegramBot.ts              # עיצוב הודעות + sendAlert + editAlert
├── mapService.ts               # Mapbox: יצירת מפה (צבע לפי סוג) + cache + fallback
├── cityLookup.ts               # נתוני ערים + פוליגונים + חיפוש
├── topicRouter.ts              # ניתוב סוג התראה → נושא טלגרם + ALERT_TYPE_CATEGORY
├── types.ts                    # TypeScript interfaces
├── bot/
│   ├── botSetup.ts             # רישום handlers + setMyCommands
│   ├── menuHandler.ts          # /start, תפריט ראשי + הצגת ההתראה האחרונה
│   ├── zoneHandler.ts          # /zones, מנוי לפי אזור
│   ├── searchHandler.ts        # /add, חיפוש חופשי
│   ├── settingsHandler.ts      # /settings, /mycities (עם תוויות אזור), שעות שקט, snooze
│   ├── statsHandler.ts         # /stats — סיכום 24 שעות + ספירה אישית
│   ├── historyHandler.ts       # /history [עיר] — 10 התראות אחרונות עם שעה מוחלטת
│   └── userCooldown.ts         # per-user callback cooldown 1.5s (ct/ca/cr, settings)
├── dashboard/                  # Admin Dashboard — Express API (פורט DASHBOARD_PORT)
│   ├── server.ts               # אתחול Express, cookie auth, הגשת dashboard-ui SPA
│   ├── auth.ts                 # timingSafeEqual cookie auth, sessions ב-SQLite, brute-force persistent
│   ├── router.ts               # מסדר את כל ה-API routes תחת /api
│   ├── rateLimiter.ts          # factory createRateLimitMiddleware — per-IP, zero deps
│   ├── settingsRepository.ts   # key-value store בטבלת settings ב-SQLite
│   ├── statsCache.ts           # TTL cache גנרי: /health 15s, /overview 60s, top-cities 5min
│   └── routes/
│       ├── stats.ts            # GET /api/stats/health|overview|alerts|by-category|top-cities
│       ├── subscribers.ts      # GET/PATCH/DELETE /api/subscribers + /export/csv
│       ├── operations.ts       # GET /api/operations/queue|alert-window; POST broadcast|test-alert
│       ├── settings.ts         # GET/PATCH /api/settings; GET /api/settings/backup
│       ├── landing.ts          # GET/PATCH /api/landing/config; POST /api/landing/deploy
│       ├── whatsapp.ts         # GET /api/whatsapp/status|groups|chats; POST /api/whatsapp/reconnect
│       └── whatsappListeners.ts # GET/POST/PATCH/DELETE /api/whatsapp/listeners + telegram-topics
├── db/                         # SQLite — better-sqlite3 (סינכרוני)
│   ├── schema.ts               # initSchema() + initDb(); טבלאות: users, subscriptions, alert_history, alert_window, mapbox_usage, settings, mapbox_image_cache, message_templates, sessions, login_attempts, whatsapp_groups, whatsapp_listeners
│   ├── userRepository.ts       # quiet_hours_enabled + muted_until כ-boolean/string
│   ├── subscriptionRepository.ts # in-memory cache: cityToSubscribers + subscriberData Maps
│   ├── alertHistoryRepository.ts # שמירת ושאילתת היסטוריית התראות (7 ימים)
│   ├── alertWindowRepository.ts  # persistence לחלון ההתראה הפעיל
│   ├── mapboxUsageRepository.ts  # מונה בקשות Mapbox חודשי (in-memory + SQLite)
│   ├── whatsappGroupRepository.ts # CRUD לטבלת whatsapp_groups
│   └── whatsappListenerRepository.ts # CRUD לטבלת whatsapp_listeners; getActiveListenersForChannel()
├── whatsapp/                   # WhatsApp bridge (פעיל רק כאשר WHATSAPP_ENABLED=true)
│   ├── whatsappService.ts      # whatsapp-web.js client; initialize(), setMessageCallback()
│   ├── whatsappListenerService.ts # keyword match → Telegram forward; truncation 3900 chars
│   ├── whatsappBroadcaster.ts  # broadcast התראות פיקוד העורף לקבוצות WhatsApp
│   └── whatsappFormatter.ts    # פורמט הודעה לשליחה ב-WhatsApp
├── services/
│   ├── dmDispatcher.ts         # שליחת DM למנויים + פילטר שעות שקט + snooze (N+1 fix)
│   ├── dmQueue.ts              # תור שליחה: מקביליות 10 + backoff 429
│   └── subscriptionService.ts
└── config/
    └── zones.ts                # 28 אזורים → 6 אזורי-על

dashboard-ui/                   # React SPA (Vite + Tailwind v4 RTL) — נבנה ל-dashboard-ui/dist/
├── src/
│   ├── api/client.ts           # fetch wrapper עם 401 → redirect /login
│   ├── layout/                 # Root, Sidebar (RTL), StatusStrip, CommandPalette (⌘K)
│   └── pages/                  # Login, Overview, Alerts, Subscribers, Operations, Settings, LandingPage, WhatsApp, WhatsAppListeners
└── vite.config.ts              # Proxy /api + /auth → http://localhost:4000
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

## 🌐 דף נחיתה

דף נחיתה סטטי בעברית נמצא בתיקיית `landing/` ומתפרסם אוטומטית ל-GitHub Pages בכל push ל-`main`.

### מה מסונכרן אוטומטית

| מקור | תוכן |
|------|------|
| `package.json` | גרסה (`{{VERSION}}`) |
| `README.md` | טבלת פיצ'רים (`## ✨ תכונות`) |
| `docs/screenshots/*.jpg` | צילומי מסך |
| `landing/template/logo.jpg` | לוגו (גרסה דחוסה — 18KB) |

### הגדרה חד-פעמית

**1. צור ריפו GitHub Pages:**
צור ריפו חדש בשם `pikud-haoref-bot-landing` ואפשר GitHub Pages מ-branch `main`.

**2. צור SSH deploy key:**

```bash
ssh-keygen -t ed25519 -C "landing-deploy" -f ~/.ssh/landing_deploy -N ""
```

**3. הוסף את המפתח הציבורי לריפו הנחיתה:**
- כנס ל-`pikud-haoref-bot-landing` → Settings → Deploy keys → Add deploy key
- הדבק את תוכן `~/.ssh/landing_deploy.pub`
- סמן **Allow write access** ✓

**4. הוסף את המפתח הפרטי לריפו הראשי:**
- כנס ל-`pikud-haoref-bot` → Settings → Secrets and variables → Actions → New repository secret
- שם: `LANDING_DEPLOY_KEY`
- ערך: תוכן הקובץ `~/.ssh/landing_deploy` (כולל שורות ה-header וה-footer)

### בנייה מקומית

```bash
node landing/build.js   # מייצר landing/dist/ — פתח index.html בדפדפן לבדיקה
```

</div>

---

<div dir="rtl">

## 🖥️ לוח בקרה (Admin Dashboard)

לוח בקרה בעברית RTL זמין כאשר `DASHBOARD_SECRET` מוגדר. ניתן לגשת אליו בכתובת `http://localhost:4000`.

### תכונות

- ניטור והיסטוריית התראות בזמן אמת
- ניהול מנויים (יצירה, עריכה, מחיקה, ייצוא CSV)
- שליחת הודעות broadcast לכל המנויים
- ניהול הגדרות הבוט
- שליטה ב-GA4 ו-deploy לדף הנחיתה
- **WhatsApp Listeners** — ניהול כללי האזנה לקבוצות WhatsApp והעברתן לטלגרם
- **Rate limiting** — הגנה על endpoints (broadcast, export, deploy) ו-bot callbacks

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
