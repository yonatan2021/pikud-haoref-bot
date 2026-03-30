<div dir="rtl">

# מדריך תרומה לפרויקט

תודה על הרצון לתרום! מסמך זה מסביר כיצד להגדיר סביבת פיתוח, לבצע שינויים, ולשלוח Pull Request.

---

## תהליך התרומה

1. **Fork** את המאגר ב-GitHub
2. צור branch חדש מ-`main`:
   ```bash
   git checkout -b feat/תיאור-השינוי
   ```
3. בצע שינויים, כתוב בדיקות, ווודא שה-CI עובר
4. פתח **Pull Request** ל-`main` עם תיאור מפורט

---

## הגדרת סביבת פיתוח

### דרישות

- Node.js 22+ (ראה `.nvmrc`)
- Git

### התקנה

```bash
git clone https://github.com/yonatan2021/pikud-haoref-bot.git
cd pikud-haoref-bot
npm install
cp .env.example .env
# ערוך את .env עם הטוקנים שלך
```

### הפעלה בסביבת פיתוח

```bash
npm run dev              # הפעל בוט עם hot-reload
npm run dev:dashboard    # Vite dev server לדשבורד (פורט 5173)
```

---

## בדיקות

### הרצת כל הבדיקות

```bash
npm test
```

### הרצת קובץ בדיקה בודד

```bash
npx tsx --test src/__tests__/alertHandler.test.ts
```

### בדיקות לוח הבקרה (דורשות DB נפרד)

```bash
DB_PATH=:memory: npx tsx --test 'src/__tests__/dashboard/**/*.test.ts'
```

### דרישות כיסוי

**מינימום 80% כיסוי** לכל קוד חדש. בדיקות חדשות ל:
- כל פונקציה עסקית חדשה
- edge cases ותנאי שגיאה
- כל handler שינוי התנהגות קיים

**סדר נכון לפיתוח (TDD):**
1. כתוב בדיקה שנכשלת (RED)
2. כתוב קוד מינימלי שעובר (GREEN)
3. שפר (REFACTOR)

---

## סגנון קוד

### TypeScript

- **Strict mode** — אין `any` ללא הצדקה
- **Immutability** — לעולם לא לשנות אובייקטים קיימים; תמיד צור עותק חדש
- **Functions קטנות** — מקסימום 50 שורות לפונקציה
- **Files ממוקדים** — מקסימום 800 שורות לקובץ, מינימום 200 שורות

### טיפול שגיאות

- טפל בשגיאות בכל רמה — לא להשתיק שגיאות
- `try/catch` עם logging ברור
- הודעות שגיאה ידידותיות בצד הלקוח, הקשר מלא בצד השרת

### נקודות שים לב

| נושא | הנחיה |
|------|--------|
| `chalk` | השתמש בגרסה **v4 בלבד** — v5 הוא ESM ונשבר עם `module: "commonjs"` |
| `__dirname` | השתמש ב-`__dirname`, **לא** ב-`import.meta.url` — הקצה end אינו ESM |
| `console.log` | **אסור** — השתמש תמיד ב-`log()` מ-`src/logger.ts` |
| Hebrew בטרמינל | השתמש ב-`toVisualRtl()` מ-`src/loggerUtils.ts` לטקסט עברי |
| Callback data | מקסימום **64 bytes** — השתמש ב-IDs מספריים, לא בשמות עבריים |
| SQLite | ה-DB הוא **סינכרוני** — אין `async/await` בפעולות DB |

---

## פיתוח לוח הבקרה (React SPA)

לוח הבקרה נמצא ב-`dashboard-ui/`. הוא React 19 + Vite + Tailwind v4.

```bash
# dev server (מאזין על פורט 5173, מפנה /api ו-/auth ל-:4000)
npm run dev:dashboard

# בנייה לייצור
npm run build:dashboard
```

**עקרון חשוב:** Express משרת את `dashboard-ui/dist/`. שינויים ב-`dashboard-ui/src/` **אינם גלויים** עד שמריצים `npm run build:dashboard`.

### Tailwind v4 — Token Idiom

```css
/* נכון — tokens מוגדרים ב-:root, לא ב-@theme */
:root {
  --color-glass: rgba(255, 255, 255, 0.08);
}

/* נכון — arbitrary value syntax */
.card { @apply bg-[var(--color-glass)]; }

/* שגוי — rgba() ב-@theme נשבר */
@theme { --color-glass: rgba(255, 255, 255, 0.08); }
```

---

## פיתוח ה-Wizard (npm package)

ה-Wizard נמצא ב-`wizard/` עם `package.json` נפרד.

```bash
cd wizard
npm install
npm run build    # מקמפל ל-dist/
```

**חשוב:** בדוק תמיד מ-`/tmp`, **לא** מתוך תיקיית ה-repo — npm מזהה את ה-`package.json` המקומי ולא מוריד את הגרסה המפורסמת:

```bash
cd /tmp
npx @haoref-boti/pikud-haoref-bot
```

---

## מבנה commit messages

```
<סוג>: <תיאור קצר>

[גוף אופציונלי — הסבר מדוע]
```

| סוג | מתי להשתמש |
|-----|------------|
| `feat` | תכונה חדשה |
| `fix` | תיקון באג |
| `refactor` | שינוי קוד ללא תכונה/תיקון |
| `docs` | תיעוד בלבד |
| `test` | הוספת/תיקון בדיקות |
| `chore` | תחזוקה (dependencies, CI) |
| `perf` | שיפור ביצועים |

**דוגמאות:**

```
feat(dm): הוסף snooze של 8 שעות

fix(map): תקן URL חריג מעל 8000 תווים בפוליגונים

docs: הוסף מדריך פריסה בעברית
```

---

## הנחיות PR

- ה-CI **חייב לעבור** לפני מיזוג — בדיקות, בנייה, ו-wizard check
- כתוב תיאור PR שכולל: מה השתנה, למה, ואיך לבדוק
- שינויים קטנים ומדויקים עדיפים על PR ענקיים
- **קוד שינויים** (src/, dashboard-ui/, wizard/) → PR + CI
- **תיעוד/changelog** → push ישיר ל-`main`

---

## דיווח על באגים

פתח [GitHub Issue](https://github.com/yonatan2021/pikud-haoref-bot/issues) עם:

- תיאור ברור של הבעיה
- שלבים לשחזור
- הפלט המצופה לעומת הממשי
- גרסת Node.js ומערכת הפעלה

</div>
