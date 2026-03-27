# בוט התראות פיקוד העורף

בוט טלגרם שסוקר את ממשק ה-API של פיקוד העורף כל 2 שניות ושולח התרעות אמת לערוץ טלגרם עם תמונת מפה.

## הפעלה

```bash
cp env.example .env          # הגדר משתני סביבה
npm start                    # הפעל את הבוט
npm run dev                  # הפעל עם צפייה בשינויים
npx tsx test-alert.ts        # שלח התרעת דמה לבדיקה
```

## משתני סביבה

| משתנה | חובה | תיאור |
|-------|------|--------|
| `TELEGRAM_BOT_TOKEN` | כן | מ-BotFather |
| `TELEGRAM_CHAT_ID` | כן | מספר שלילי לערוצים, חיובי ל-DM |
| `MAPBOX_ACCESS_TOKEN` | כן | ליצירת תמונות מפה |
| `PROXY_URL` | לא | נדרש בהרצה מחוץ לישראל (ה-API חסום גיאוגרפית) |

## סוגי התראות

### התרעות אמת

| סוג | תיאור | מפה |
|-----|--------|-----|
| `missiles` | התרעת טילים | ✅ |
| `hostileAircraftIntrusion` | חדירת כלי טיס עוין | ✅ |
| `terroristInfiltration` | חדירת מחבלים | ✅ |
| `hazardousMaterials` | חומרים מסוכנים | ✅ |
| `radiologicalEvent` | אירוע רדיולוגי | ✅ |
| `earthQuake` | רעידת אדמה | ❌ (ארצי) |
| `tsunami` | צונאמי | ❌ (ארצי) |
| `newsFlash` | הודעה מיוחדת | לפי הקשר |
| `general` | התרעה כללית | לפי הקשר |

### תרגילים

כל סוג התרעה קיים גם בגרסת תרגיל (סיומת `Drill`):

`missilesDrill`, `hostileAircraftIntrusionDrill`, `terroristInfiltrationDrill`, `hazardousMaterialsDrill`, `radiologicalEventDrill`, `earthQuakeDrill`, `tsunamiDrill`, `generalDrill`

התרגילים מסומנים ב-🔵 ובכותרת "תרגיל —" כדי שלא יתבלבלו עם אירועים אמיתיים.

### הערה על `newsFlash`

סוג זה יכול לציין **כניסה למרחב מוגן** או **ביטול התרעה (כל ברור)**. ההבחנה נמצאת בשדה `instructions` שמגיע מממשק פיקוד העורף — הבוט מציג אותו כפי שהוא.

## מבנה הפרויקט

```
src/
  index.ts        # נקודת כניסה + ולידציית env
  alertPoller.ts  # סקירת API + deduplication
  telegramBot.ts  # עיצוב הודעות + שליחה
  mapService.ts   # יצירת תמונת מפה (Mapbox)
  cityLookup.ts   # נתוני ערים + GeoJSON
  types.ts        # TypeScript interfaces
```

## ארכיטקטורה

```
API פיקוד העורף (סקירה כל 2 שניות)
    → AlertPoller (deduplication לפי fingerprint)
        → mapService (תמונת מפה)
        → telegramBot (שליחה לטלגרם)
```

### deduplication

כל התרעה מזוהה לפי fingerprint: `type:עיר1|עיר2|...` (מיון אלפביתי). ה-Set מתאפס כשאין התרעות פעילות — כך אותה התרעה יכולה לשוב לאחר כל-ברור.

### fallback של תמונת מפה

1. פוליגונים מפושטים (turf simplify)
2. bounding box אם ה-URL > 8000 תווים
3. הודעת טקסט בלי תמונה אם ה-URL עדיין ארוך מדי
# red-bot
