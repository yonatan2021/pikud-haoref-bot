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
    // No page-specific placeholders — home uses the global set.
    placeholders: null,
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
];
