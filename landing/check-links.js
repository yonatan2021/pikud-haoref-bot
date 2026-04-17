'use strict';

// landing/check-links.js — post-build link + placeholder validator.
// Runs after build. Exits non-zero on any violation.

const fs   = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');

const errors = [];

// ---------------------------------------------------------------------------
// 1. Walk dist/**/*.html and invoke callbacks
// ---------------------------------------------------------------------------

function walkHtml(dir, cb) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkHtml(p, cb);
    else if (e.name.endsWith('.html')) cb(p);
  }
}

// ---------------------------------------------------------------------------
// 2. Broken-link check — every local href/src must resolve in dist/
// ---------------------------------------------------------------------------

function checkLinks(file) {
  const html = fs.readFileSync(file, 'utf8');
  const urls = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const u of urls) {
    // Skip external, fragment, mailto, tel, and data URIs
    if (/^(https?:|mailto:|tel:|#|data:)/.test(u)) continue;
    // Strip query string / hash from local paths
    const clean = u.split('?')[0].split('#')[0];
    if (!clean) continue;

    const root = clean.startsWith('/')
      ? clean.slice(1)
      : path.relative(DIST, path.resolve(path.dirname(file), clean));

    const asFile  = path.join(DIST, root);
    const asIndex = path.join(DIST, root.replace(/\/$/, ''), 'index.html');

    if (!fs.existsSync(asFile) && !fs.existsSync(asIndex)) {
      errors.push(`broken link in ${path.relative(DIST, file)}: ${u}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Placeholder sentinel scan — no {{…}} tokens allowed in output
// ---------------------------------------------------------------------------

function checkPlaceholders(file) {
  const html = fs.readFileSync(file, 'utf8');
  const hits  = html.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (hits) {
    errors.push(`unresolved placeholders in ${path.relative(DIST, file)}: ${hits.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Accessibility-contact guard — reject sentinel / placeholder values
// ---------------------------------------------------------------------------

function checkAccessibilityContact(file) {
  if (!file.endsWith(path.join('accessibility', 'index.html'))) return;
  const html = fs.readFileSync(file, 'utf8');
  const forbidden = ['a11y@example.com', 'example.com', 'TODO', '{{'];
  for (const f of forbidden) {
    if (html.includes(f)) {
      errors.push(
        `accessibility page contains placeholder sentinel "${f}" — ` +
        'set ACCESSIBILITY_CONTACT_EMAIL (and ACCESSIBILITY_CONTACT_NAME) before deploy'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Sitemap completeness — every HTML file must appear in sitemap.xml
// ---------------------------------------------------------------------------

function checkSitemap() {
  const sitemapPath = path.join(DIST, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    errors.push('sitemap.xml not found in dist/');
    return;
  }
  const sitemap   = fs.readFileSync(sitemapPath, 'utf8');
  const slugs = [];
  walkHtml(DIST, (f) => {
    // Normalise to slug form: strip dist prefix, strip "index.html" suffix
    const rel = path.relative(DIST, f).replace(/\\/g, '/');
    const slug = '/' + rel.replace(/index\.html$/, '');
    slugs.push(slug);
  });

  for (const slug of slugs) {
    if (!sitemap.includes(slug)) {
      errors.push(`sitemap.xml missing slug: ${slug}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

walkHtml(DIST, (file) => {
  checkLinks(file);
  checkPlaceholders(file);
  checkAccessibilityContact(file);
});

checkSitemap();

if (errors.length) {
  console.error('\n❌ landing validation failed:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

// Count HTML pages for the success message
let pageCount = 0;
walkHtml(DIST, () => { pageCount++; });
console.log(`✅ landing validation passed (${pageCount} pages).`);
