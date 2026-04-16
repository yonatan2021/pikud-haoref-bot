'use strict';

// ---------------------------------------------------------------------------
// landing/pages.config.js — single source of truth for every route.
//
// Each entry drives one HTML output. build.js walks the list, composing
// partials/head.html + pages/<template> + partials/scripts.html.
//
// Fields:
//   slug         — URL path (always trailing slash except root)
//   out          — optional explicit output path (defaults to slug/index.html)
//   template     — path under template/ (e.g. "pages/index.html")
//   title        — <title> + og:title (used in later SEO task)
//   description  — <meta description> + og:description
//   priority     — sitemap.xml priority (0.0–1.0)
//   ogImage      — absolute path to OG image served at that URL
//   jsonLd       — JSON-LD schema types to emit (future task)
//   kind         — 'home' | 'subpage' — affects which stylesheets load
//   placeholders — optional (sources) => { KEY: value } overrides/extras
// ---------------------------------------------------------------------------

module.exports = [
  {
    slug: '/',
    out: 'index.html',
    template: 'pages/index.html',
    title: 'התראות פיקוד העורף — ישירות לטלגרם ו-WhatsApp',
    description:
      'בוט קוד-פתוח להתראות פיקוד העורף בזמן אמת. טלגרם, WhatsApp, DM אישי לפי ערים, מפות, 28 אזורים.',
    ogImage: '/og/home.png',
    priority: 1.0,
    kind: 'home',
    jsonLd: ['organization', 'website', 'softwareapplication', 'faqpage'],
    // Home-specific placeholders beyond the global set.
    placeholders: (src) => ({
      HOME_FAQ_HTML: src.homeFaqHtml,
    }),
  },
  {
    slug: '/changelog/',
    out: 'changelog/index.html',
    template: 'pages/changelog.html',
    title: 'יומן שינויים — התראות פיקוד העורף',
    description: 'היסטוריית כל הגרסאות והשינויים. Keep a Changelog + SemVer.',
    ogImage: '/og/changelog.png',
    priority: 0.6,
    kind: 'subpage',
    jsonLd: ['organization', 'breadcrumblist'],
    breadcrumbs: [{ name: 'בית', url: '/' }, { name: 'יומן שינויים', url: '/changelog/' }],
    placeholders: (src) => ({
      FULL_CHANGELOG_HTML: src.fullChangelogHtml,
    }),
  },
  {
    slug: '/faq/',
    out: 'faq/index.html',
    template: 'pages/faq.html',
    title: 'שאלות נפוצות — התראות פיקוד העורף',
    description: '20 השאלות הנפוצות ביותר על בוט התראות פיקוד העורף. חינמי, קוד פתוח, Telegram + WhatsApp.',
    ogImage: '/og/faq.png',
    priority: 0.7,
    kind: 'subpage',
    jsonLd: ['organization', 'breadcrumblist', 'faqpage'],
    breadcrumbs: [{ name: 'בית', url: '/' }, { name: 'שאלות ותשובות', url: '/faq/' }],
    placeholders: (src) => ({
      FAQ_ITEMS_HTML: src.faqItemsHtml,
    }),
  },
  {
    slug: '/privacy/',
    out: 'privacy/index.html',
    template: 'pages/privacy.html',
    title: 'מדיניות פרטיות — התראות פיקוד העורף',
    description: 'מה אנחנו אוספים, מה לא, כמה זמן, ואיך למחוק. בלי שטויות.',
    ogImage: '/og/privacy.png',
    priority: 0.5,
    kind: 'subpage',
    jsonLd: ['organization', 'breadcrumblist'],
    breadcrumbs: [{ name: 'בית', url: '/' }, { name: 'מדיניות פרטיות', url: '/privacy/' }],
    placeholders: null,
  },
  {
    slug: '/terms/',
    out: 'terms/index.html',
    template: 'pages/terms.html',
    title: 'תנאי שימוש — התראות פיקוד העורף',
    description: 'תנאי שימוש לשירות התראות פיקוד העורף. כולל הגבלת אחריות והתראת חיים חשובה.',
    ogImage: '/og/terms.png',
    priority: 0.5,
    kind: 'subpage',
    jsonLd: ['organization', 'breadcrumblist'],
    breadcrumbs: [{ name: 'בית', url: '/' }, { name: 'תנאי שימוש', url: '/terms/' }],
    placeholders: null,
  },
  {
    slug: '/accessibility/',
    out: 'accessibility/index.html',
    template: 'pages/accessibility.html',
    title: 'הצהרת נגישות — התראות פיקוד העורף',
    description: 'הצהרת נגישות לפי תקנות שוויון זכויות לאנשים עם מוגבלות. WCAG 2.1 AA.',
    ogImage: '/og/accessibility.png',
    priority: 0.5,
    kind: 'subpage',
    jsonLd: ['organization', 'breadcrumblist'],
    breadcrumbs: [{ name: 'בית', url: '/' }, { name: 'הצהרת נגישות', url: '/accessibility/' }],
    placeholders: null,
  },
  {
    slug: '/security/',
    out: 'security/index.html',
    template: 'pages/security.html',
    title: 'אבטחה וחשיפה אחראית — התראות פיקוד העורף',
    description: 'דיווח על פגיעויות, מודל איום, הצפנה AES-256-GCM, ו-SLO תגובה.',
    ogImage: '/og/security.png',
    priority: 0.5,
    kind: 'subpage',
    jsonLd: ['organization', 'breadcrumblist'],
    breadcrumbs: [{ name: 'בית', url: '/' }, { name: 'אבטחה וחשיפה', url: '/security/' }],
    placeholders: null,
  },
  // ---- Guides hub + sub-guides -------------------------------------------
  {
    slug: '/guides/',
    out: 'guides/index.html',
    template: 'pages/guides/index.html',
    title: 'מדריכים — התראות פיקוד העורף',
    description: 'כל המדריכים: רישום בטלגרם, הצטרפות ל-WhatsApp, פקודות הבוט, onboarding, והפעלה עצמית.',
    ogImage: '/og/guides.png',
    priority: 0.7,
    kind: 'guide',
    jsonLd: ['organization', 'breadcrumblist', 'article'],
    breadcrumbs: [{ name: 'בית', url: '/' }, { name: 'מדריכים', url: '/guides/' }],
    placeholders: null,
  },
  {
    slug: '/guides/telegram/',
    out: 'guides/telegram/index.html',
    template: 'pages/guides/telegram.html',
    title: 'רישום בטלגרם — מדריך צעד אחר צעד',
    description: 'כיצד להירשם לבוט פיקוד העורף בטלגרם: פתח, חפש עיר, אשר — 7 צעדים עם צילומי מסך.',
    ogImage: '/og/guides-telegram.png',
    priority: 0.6,
    kind: 'guide',
    jsonLd: ['organization', 'breadcrumblist', 'article'],
    breadcrumbs: [
      { name: 'בית', url: '/' },
      { name: 'מדריכים', url: '/guides/' },
      { name: 'רישום בטלגרם', url: '/guides/telegram/' },
    ],
    placeholders: null,
  },
  {
    slug: '/guides/whatsapp/',
    out: 'guides/whatsapp/index.html',
    template: 'pages/guides/whatsapp.html',
    title: 'הצטרפות ל-WhatsApp — מדריך',
    description: 'כיצד להצטרף לקבוצת WhatsApp של פיקוד העורף ולקבל התראות. הבדלים מטלגרם הסבר.',
    ogImage: '/og/guides-whatsapp.png',
    priority: 0.6,
    kind: 'guide',
    jsonLd: ['organization', 'breadcrumblist', 'article'],
    breadcrumbs: [
      { name: 'בית', url: '/' },
      { name: 'מדריכים', url: '/guides/' },
      { name: 'הצטרפות ל-WhatsApp', url: '/guides/whatsapp/' },
    ],
    placeholders: null,
  },
  {
    slug: '/guides/commands/',
    out: 'guides/commands/index.html',
    template: 'pages/guides/commands.html',
    title: '19 פקודות הבוט — הפניה המלאה',
    description: 'כל 19 פקודות בוט פיקוד העורף מקובצות לפי קטגוריה — מה עושה כל אחת ומה הפלט הצפוי.',
    ogImage: '/og/guides-commands.png',
    priority: 0.6,
    kind: 'guide',
    jsonLd: ['organization', 'breadcrumblist', 'article'],
    breadcrumbs: [
      { name: 'בית', url: '/' },
      { name: 'מדריכים', url: '/guides/' },
      { name: 'מדריך פקודות', url: '/guides/commands/' },
    ],
    placeholders: null,
  },
  {
    slug: '/guides/onboarding/',
    out: 'guides/onboarding/index.html',
    template: 'pages/guides/onboarding.html',
    title: 'onboarding מפורט — 4 שלבי הרישום',
    description: 'מה קורה בכל שלב של הרישום הראשוני בבוט: שם, חיפוש עיר, בחירה, ואישור. טיפים שימושיים.',
    ogImage: '/og/guides-onboarding.png',
    priority: 0.5,
    kind: 'guide',
    jsonLd: ['organization', 'breadcrumblist', 'article'],
    breadcrumbs: [
      { name: 'בית', url: '/' },
      { name: 'מדריכים', url: '/guides/' },
      { name: 'onboarding מפורט', url: '/guides/onboarding/' },
    ],
    placeholders: null,
  },
  {
    slug: '/guides/self-host/',
    out: 'guides/self-host/index.html',
    template: 'pages/guides/self-host.html',
    title: 'הפעלה עצמית — Docker & Node',
    description: 'הפעלת מופע פרטי של בוט פיקוד העורף: Node 22+, Docker, Wizard CLI, Dashboard, Health check.',
    ogImage: '/og/guides-self-host.png',
    priority: 0.5,
    kind: 'guide',
    jsonLd: ['organization', 'breadcrumblist', 'article'],
    breadcrumbs: [
      { name: 'בית', url: '/' },
      { name: 'מדריכים', url: '/guides/' },
      { name: 'הפעלה עצמית', url: '/guides/self-host/' },
    ],
    placeholders: null,
  },
];
