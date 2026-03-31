## תיאור

<!-- מה השינוי הזה עושה ולמה? קשר ל-issue אם רלוונטי: closes #123 -->

## סוג שינוי

<!-- סמן את הרלוונטי -->

- [ ] `feat` — תכונה חדשה
- [ ] `fix` — תיקון באג
- [ ] `refactor` — שינוי קוד ללא שינוי התנהגות
- [ ] `docs` — תיעוד בלבד
- [ ] `test` — בדיקות
- [ ] `chore` — תחזוקה (dependencies, CI)
- [ ] `perf` — שיפור ביצועים

## רכיבים מושפעים

<!-- סמן את הרלוונטי -->

- [ ] Bot (src/)
- [ ] Dashboard (dashboard-ui/)
- [ ] WhatsApp (src/whatsapp/)
- [ ] Wizard (wizard/)
- [ ] Landing Page (landing/)
- [ ] CI/CD (.github/workflows/)
- [ ] Docker (Dockerfile)

## Checklist

<!-- ודא שכל הפריטים מסומנים לפני פתיחת ה-PR -->

- [ ] הקוד עובר `npm test` מקומית
- [ ] הוספתי/עדכנתי בדיקות לשינויים שלי
- [ ] בדיקות דשבורד עוברות: `DB_PATH=:memory: npx tsx --test 'src/__tests__/dashboard/**/*.test.ts'`
- [ ] אין טוקנים, סיסמאות, או מידע רגיש בקוד
- [ ] עדכנתי תיעוד רלוונטי (README, CHANGELOG, CLAUDE.md) אם נדרש
- [ ] הקוד תואם את [CONTRIBUTING.md](../CONTRIBUTING.md) — TypeScript strict, immutability, functions <50 שורות

## בדיקה ידנית

<!-- תאר איך בדקת ידנית, אם רלוונטי -->

## צילומי מסך

<!-- אם יש שינויי UI — הוסף screenshots של לפני/אחרי -->
