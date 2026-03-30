<div dir="rtl">

# מדריך פריסה לסביבת ייצור

---

## דרישות מקדימות

| רכיב | גרסה מינימלית | הערות |
|------|--------------|--------|
| Node.js | 22+ | `.nvmrc` מכיל את הגרסה המדויקת |
| Docker | 24+ | אופציונלי, אך מומלץ לייצור |
| חשבון Telegram | — | צור בוט דרך [@BotFather](https://t.me/BotFather) |
| חשבון Mapbox | — | [mapbox.com](https://mapbox.com) — tier חינמי: 50,000 בקשות/חודש |

**שרת:** הבוט חייב לגשת לאינטרנט. ה-API של פיקוד העורף מגיע מישראל — ראה סעיף [פריסה מחוץ לישראל](#פריסה-מחוץ-לישראל).

---

## הגדרת סביבה

### שיטה מהירה — אשף הגדרה

```bash
npx @haoref-boti/pikud-haoref-bot
```

האשף ינחה אותך דרך כל שאלות ההגדרה ויכתוב קובץ `.env` אוטומטית.

**Flag-ים שימושיים:**

```bash
npx @haoref-boti/pikud-haoref-bot --full      # הצג את כל השדות האופציונליים
npx @haoref-boti/pikud-haoref-bot --verify    # בדוק תקינות טוקן Telegram + Mapbox
npx @haoref-boti/pikud-haoref-bot --update    # עדכן קובץ .env קיים
```

### שיטה ידנית

העתק `.env.example` ל-`.env` ומלא את הערכים:

```bash
cp .env.example .env
```

#### משתני סביבה חובה

| משתנה | תיאור |
|-------|--------|
| `TELEGRAM_BOT_TOKEN` | טוקן הבוט מ-@BotFather |
| `TELEGRAM_CHAT_ID` | מזהה הערוץ (מספר שלילי לערוצים) |
| `MAPBOX_ACCESS_TOKEN` | טוקן גישה ל-Mapbox Static API |

#### משתני סביבה אופציונליים

| משתנה | ברירת מחדל | תיאור |
|-------|-----------|--------|
| `PROXY_URL` | — | פרוקסי לגישה לפיקוד העורף מחוץ לישראל |
| `TELEGRAM_INVITE_LINK` | — | קישור הצטרפות לערוץ (מוצג בתפריט /start) |
| `TELEGRAM_TOPIC_ID_SECURITY` | — | Thread ID לנושא ביטחוני בפורום |
| `TELEGRAM_TOPIC_ID_NATURE` | — | Thread ID לנושא אסונות טבע |
| `TELEGRAM_TOPIC_ID_ENVIRONMENTAL` | — | Thread ID לנושא סביבתי |
| `TELEGRAM_TOPIC_ID_DRILLS` | — | Thread ID לנושא תרגילים |
| `TELEGRAM_TOPIC_ID_GENERAL` | — | Thread ID לנושא הודעות כלליות |
| `MAPBOX_MONTHLY_LIMIT` | ללא מגבלה | מגבלת בקשות חודשית מומלצת: 40,000 |
| `MAPBOX_IMAGE_CACHE_SIZE` | `20` | גודל cache זיכרון לתמונות מפה |
| `MAPBOX_SKIP_DRILLS` | `false` | שלח תרגילים ללא מפה |
| `ALERT_UPDATE_WINDOW_SECONDS` | `120` | חלון עריכת הודעות (שניות) |
| `HEALTH_PORT` | `3000` | פורט לנקודת הבריאות `GET /health` |
| `DASHBOARD_SECRET` | — | סיסמת לוח הבקרה (לא מוגדר = לוח בקרה מושבת) |
| `DASHBOARD_PORT` | `4000` | פורט לוח הבקרה |
| `GA4_MEASUREMENT_ID` | — | מזהה Google Analytics (פורמט: G-XXXXXXXXXX) |
| `GITHUB_PAT` | — | Personal Access Token לפריסת דף נחיתה |
| `GITHUB_REPO` | — | מאגר GitHub (owner/repo) |

---

## הפעלה עם Docker (מומלץ)

### הפעלה בסיסית

```bash
docker run -d \
  --name pikud-haoref-bot \
  --restart unless-stopped \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  -p 3000:3000 \
  -p 4000:4000 \
  ghcr.io/yonatan2021/pikud-haoref-bot:latest
```

- `-v $(pwd)/data:/app/data` — כרך לשמירת ה-SQLite (חובה לשמירה בין restarts)
- `-p 3000:3000` — נקודת הבריאות
- `-p 4000:4000` — לוח הבקרה (חשוף רק אם `DASHBOARD_SECRET` מוגדר)

### Docker Compose

```yaml
services:
  bot:
    image: ghcr.io/yonatan2021/pikud-haoref-bot:latest
    container_name: pikud-haoref-bot
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/app/data
    ports:
      - "3000:3000"
      - "4000:4000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

```bash
docker compose up -d
docker compose logs -f    # מעקב לוגים
```

---

## הפעלה עם Node.js ישיר

```bash
# שכפל את המאגר
git clone https://github.com/yonatan2021/pikud-haoref-bot.git
cd pikud-haoref-bot

# התקן תלויות
npm ci

# בנה TypeScript + dashboard UI
npm run build

# הפעל
npm start
```

לסביבת פיתוח עם hot-reload:

```bash
npm run dev
```

---

## Nginx — Reverse Proxy

דוגמת קונפיגורציה לחשיפת לוח הבקרה ונקודת הבריאות מאחורי Nginx:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    # לוח הבקרה
    location /dashboard {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API לוח הבקרה
    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # אימות
    location /auth/ {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
    }

    # נקודת בריאות (פנימי בלבד — הגבל גישה לפי IP)
    location /health {
        proxy_pass http://localhost:3000;
        allow 10.0.0.0/8;
        deny all;
    }
}
```

> **אבטחה:** הגבל גישה ל-`/dashboard` לפי IP או הוסף שכבת אימות נוספת (Basic Auth) אם הבוט ציבורי.

---

## ניטור ובריאות

נקודת הבריאות זמינה ב-`GET http://localhost:3000/health`:

```json
{
  "uptime": 86400,
  "lastAlertAt": "2026-03-29T14:32:11Z",
  "lastPollAt": "2026-03-29T14:32:15Z",
  "alertsToday": 12
}
```

| שדה | תיאור |
|-----|--------|
| `uptime` | שניות מאז הפעלה |
| `lastAlertAt` | זמן ההתראה האחרונה (ISO 8601 UTC) |
| `lastPollAt` | זמן הסריקה האחרונה (ISO 8601 UTC) |
| `alertsToday` | מספר התראות מחצות UTC |

**ניטור מומלץ:** אם `lastPollAt` לא התעדכן יותר מ-30 שניות — הבוט כנראה תקוע.

---

## Mapbox Quota

tier החינמי של Mapbox כולל **50,000 בקשות לחודש**.

**המלצות:**

1. הגדר `MAPBOX_MONTHLY_LIMIT=40000` — buffer של 20% לפני הגבלה
2. הפעל `MAPBOX_SKIP_DRILLS=true` — תרגילים שכיחים יחסית, זה חוסך משמעותי
3. הגבר `MAPBOX_IMAGE_CACHE_SIZE` לערים עם התראות חוזרות

כשהמגבלה מתמלאת — ההתראות ממשיכות לשלוח **טקסט בלבד** (ללא תמונת מפה), ולא נפסקות.

---

## גיבוי SQLite

מסד הנתונים נמצא ב-`data/subscriptions.db` (או ב-`DB_PATH` אם הוגדר).

### גיבוי ידני דרך לוח הבקרה

```
GET /api/settings/backup
```

### גיבוי אוטומטי (cron)

```bash
# גיבוי יומי בשעה 02:00
0 2 * * * cp /path/to/data/subscriptions.db /path/to/backups/subscriptions-$(date +\%Y\%m\%d).db
```

**חשוב:** השתמש תמיד ב-**volume mount** (`-v`) בדוקר. מסד נתונים בתוך ה-container יימחק עם מחיקתו.

---

## עדכון גרסה

```bash
# משוך image חדש
docker pull ghcr.io/yonatan2021/pikud-haoref-bot:latest

# הפעל מחדש
docker compose down && docker compose up -d
```

הנתונים נשמרים בכרך — אין צורך בגיבוי מיוחד לעדכון.

---

## פריסה מחוץ לישראל

ה-API של פיקוד העורף (`alerts.gov.il`) מוגבל גיאוגרפית — נגיש רק מישראל.

אם השרת שלך מחוץ לישראל, הגדר פרוקסי ישראלי:

```env
PROXY_URL=http://user:password@proxy-israel:8080
```

הבוט ינתב את כל בקשות פיקוד העורף דרך הפרוקסי.

**חלופות:**

- שכור VPS ישראלי (למשל Cloudways Israel, Hetzner עם IP ישראלי)
- השתמש בשירות פרוקסי מסחרי עם נוכחות בישראל

---

## ניהול Forum Topics

אם הערוץ שלך הוא פורום Telegram עם נושאים, תוכל לנתב כל קטגוריה לנושא נפרד:

1. צור נושאים בפורום (Topics)
2. לחץ על נושא → העתק קישור → המספר בסוף הקישור הוא ה-Thread ID
3. הגדר את משתני הסביבה:

```env
TELEGRAM_TOPIC_ID_SECURITY=5
TELEGRAM_TOPIC_ID_DRILLS=8
TELEGRAM_TOPIC_ID_GENERAL=11
```

> **אזהרה:** Thread ID `1` אינו תקין — גורם לשגיאה `400: message thread not found`.

</div>
