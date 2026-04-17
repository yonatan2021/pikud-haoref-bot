'use strict';

// ---------------------------------------------------------------------------
// landing/build.js — page-registry-driven static site generator.
//
// Composition per page:
//   partials/head.html  +  pages/<slug>.html  +  partials/scripts.html
// The page body may contain `<!--[partial:footer]-->` which is replaced with
// partials/footer.html before placeholder substitution.
//
// Placeholder set is computed once in loadSources() and merged with any
// page-specific placeholders from pages.config.js.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const TEMPLATE_DIR = path.join(__dirname, 'template');
const DIST_DIR     = path.join(__dirname, 'dist');
const PAGES        = require('./pages.config');

// ---- Utilities ------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripHtmlToText(input) {
  const value = String(input || '');
  try {
    const dom = new JSDOM(`<!doctype html><body>${value}</body>`);
    return dom.window.document.body.textContent || '';
  } catch (_) {
    return value.replace(/<|>/g, '');
  }
}

function replacePlaceholders(html, ctx) {
  return html.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (ctx[key] === undefined || ctx[key] === null) return '';
    return String(ctx[key]);
  });
}

// ---- Source parsers (preserved verbatim from previous build.js) ------------

function parseFeatureTable(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .filter((line) => !line.includes('תכונה') && !line.includes('----'))
    .map((line) => {
      const inner = line.slice(1, -1);
      const cells = inner.split('|').map((cell) => cell.trim());
      const fullName = cells[0].replace(/\*\*/g, '');
      const detail = cells[1];
      if (detail === undefined) {
        console.warn(`[landing/build.js] parseFeatureTable: row has fewer than 2 cells, skipping: ${line}`);
        return null;
      }
      const spaceIdx = fullName.indexOf(' ');
      const icon = spaceIdx !== -1 ? fullName.slice(0, spaceIdx) : '';
      const title = spaceIdx !== -1 ? fullName.slice(spaceIdx + 1) : fullName;
      return [
        `<div class="feature-card">`,
        `  <span class="feature-icon">${icon}</span>`,
        `  <span class="feature-text">`,
        `    <span class="feature-title">${title}</span>`,
        `    <span class="feature-desc">${detail}</span>`,
        `  </span>`,
        `</div>`,
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n');
}

function parseFullChangelog(changelogContent) {
  // Walk every ## [x.y.z] heading and render all subsections.
  // Returns HTML with one <section class="cl-version"> per version.
  const versionPattern = /^## \[(\d+\.\d+\.\d+)\]\s*(?:—|-|–)\s*(\d{4}-\d{2}-\d{2})/gm;
  const versions = [];
  let m;
  while ((m = versionPattern.exec(changelogContent)) !== null) {
    versions.push({ version: m[1], date: m[2], index: m.index, fullMatch: m[0] });
  }

  if (versions.length === 0) return '<!-- no versioned entries found in CHANGELOG.md -->';

  const htmlParts = [];

  for (let i = 0; i < versions.length; i++) {
    const v = versions[i];
    const blockStart = v.index + v.fullMatch.length;
    const blockEnd = i + 1 < versions.length ? versions[i + 1].index : changelogContent.length;
    const block = changelogContent.slice(blockStart, blockEnd);

    // Parse subsections: ### emoji title
    const subsectionPattern = /^### (.+)$/gm;
    const subsections = [];
    let sm;
    while ((sm = subsectionPattern.exec(block)) !== null) {
      subsections.push({ title: sm[1].trim(), index: sm.index, fullMatch: sm[0] });
    }

    let categoriesHtml = '';
    for (let j = 0; j < subsections.length; j++) {
      const sec = subsections[j];
      const secStart = sec.index + sec.fullMatch.length;
      const secEnd = j + 1 < subsections.length ? subsections[j + 1].index : block.length;
      const secContent = block.slice(secStart, secEnd);

      const items = [];
      for (const line of secContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('- ') && !trimmed.startsWith('* ')) continue;
        let text = trimmed.slice(2).trim();
        // Preserve inline code: `foo` -> <code>foo</code>
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        // Preserve bold: **foo** -> <strong>foo</strong>
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        // Escape stray ampersands not already part of HTML entities
        text = text.replace(/&(?!amp;|lt;|gt;|quot;|#)/g, '&amp;');
        if (text.length > 2) items.push(`<li>${text}</li>`);
      }
      if (items.length === 0) continue;

      categoriesHtml += `<section class="cl-category">
  <h3>${escapeHtml(sec.title)}</h3>
  <ul>
${items.map((li) => '    ' + li).join('\n')}
  </ul>
</section>\n`;
    }

    if (!categoriesHtml.trim()) continue;

    htmlParts.push(
      `<section class="cl-version">\n` +
      `  <h2>v${escapeHtml(v.version)} <span class="cl-date">— ${escapeHtml(v.date)}</span></h2>\n` +
      categoriesHtml +
      `</section>`
    );
  }

  return htmlParts.join('\n');
}

function parseLatestChangelog(changelogContent) {
  const versionPattern = /^## \[(\d+\.\d+\.\d+)\]/m;
  const match = changelogContent.match(versionPattern);
  if (!match) {
    throw new Error(
      'parseLatestChangelog: no versioned entry found in CHANGELOG.md — ' +
      'expected a line matching "## [X.Y.Z]". Cannot populate {{WHATS_NEW_HTML}}.'
    );
  }

  const latestVersion = match[1];
  const versionStart = changelogContent.indexOf(match[0]);

  const rest = changelogContent.slice(versionStart + match[0].length);
  const nextMatch = rest.match(/^## \[/m);
  const versionBlock = nextMatch
    ? changelogContent.slice(versionStart, versionStart + match[0].length + rest.indexOf(nextMatch[0]))
    : changelogContent.slice(versionStart);

  const featuresIdx = versionBlock.indexOf('### ✨ תכונות חדשות');
  if (featuresIdx === -1) {
    throw new Error(
      `parseLatestChangelog: version ${latestVersion} has no "### ✨ תכונות חדשות" subsection — ` +
      'cannot populate {{WHATS_NEW_HTML}}. Add the subsection or remove the placeholder.'
    );
  }

  const featuresEnd = versionBlock.indexOf('\n### ', featuresIdx + 5);
  const featuresSection = featuresEnd !== -1
    ? versionBlock.slice(featuresIdx, featuresEnd)
    : versionBlock.slice(featuresIdx);

  const items = [];
  for (const line of featuresSection.split('\n')) {
    if (items.length >= 5) break;
    const trimmed = line.trim();
    if (trimmed.startsWith('#### ')) {
      items.push({ title: trimmed.slice(5).trim(), desc: '' });
      continue;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      let text = trimmed.slice(2).trim();
      let title = '';
      let desc = '';
      const withDesc = text.match(/^\*\*([^*]+)\*\*\s*[—\-]\s*(.+)/);
      if (withDesc) {
        title = withDesc[1].replace(/`/g, '').trim();
        desc  = withDesc[2].replace(/`/g, '').replace(/\*\*/g, '').trim();
      } else {
        const boldOnly = text.match(/^\*\*([^*]+)\*\*/);
        if (boldOnly) {
          title = boldOnly[1].replace(/`/g, '').trim();
        } else {
          const sepIdx = text.indexOf(' — ');
          title = (sepIdx > 0 ? text.slice(0, sepIdx) : text)
            .replace(/\*\*/g, '').replace(/`/g, '').trim();
        }
      }
      if (title.length > 2) items.push({ title, desc });
    }
  }

  const html = items.map(({ title, desc }) => {
    const descPart = desc
      ? `\n  <span class="wn-desc">${escapeHtml(desc)}</span>`
      : '';
    return (
      `<div class="wn-card">` +
      `\n  <span class="wn-title">${escapeHtml(title)}</span>` +
      descPart +
      `\n</div>`
    );
  }).join('\n');
  return { version: latestVersion, html };
}

function parsePaths(readmeContent) {
  const markerPattern = /^## 🛣️ דרכים להשתמש$/m;
  const headerMatch = readmeContent.match(markerPattern);
  if (!headerMatch) {
    console.warn('[landing/build.js] parsePaths: "## 🛣️ דרכים להשתמש" section not found — using empty paths');
    return { paths: [], sectionTitle: 'שלוש דרכים להשתמש' };
  }

  const start = headerMatch.index;
  const sectionEnd = readmeContent.indexOf('\n---', start);
  const section = sectionEnd !== -1
    ? readmeContent.slice(start, sectionEnd)
    : readmeContent.slice(start, start + 3000);

  const paths = [];
  const pathHeaders = [...section.matchAll(/^### path:(\w+)$/gm)];

  for (let i = 0; i < pathHeaders.length; i++) {
    const blockStart = pathHeaders[i].index;
    const blockEnd = i + 1 < pathHeaders.length ? pathHeaders[i + 1].index : section.length;
    const block = section.slice(blockStart, blockEnd);

    const get = (key) => {
      const m = block.match(new RegExp(`^- ${key}:\\s*(.+)$`, 'm'));
      return m ? m[1].trim() : '';
    };

    const pathId = pathHeaders[i][1];
    const title = get('title');
    const link = get('link');
    const icon = get('icon');
    const style = get('style') || pathId;
    const desc = get('desc');
    const featuresRaw = get('features');
    const command = get('command');
    const btn = get('btn');
    const features = featuresRaw ? featuresRaw.split(',').map(f => f.trim()).filter(Boolean) : [];

    if (!title || !link) {
      console.warn(`[landing/build.js] parsePaths: path "${pathId}" missing title or link — skipping`);
      continue;
    }

    paths.push({ pathId, title, link, icon, style, desc, features, command, btn });
  }

  const count = paths.length;
  const countWord = count === 2 ? 'שתי' : count === 3 ? 'שלוש' : String(count);
  const sectionTitle = `🛣️ ${countWord} דרכים להשתמש`;
  return { paths, sectionTitle };
}

function buildPathsHtml(paths) {
  return paths.map((p, i) => {
    const delay = i > 0 ? ` style="--reveal-delay: ${(i * 0.15).toFixed(2)}s"` : '';
    const featuresHtml = p.features.map(f => `            <li>✅ ${escapeHtml(f)}</li>`).join('\n');

    const commandHtml = p.command ? `
          <div class="path-code">
            <code>${escapeHtml(p.command)}</code>
            <button
              class="copy-btn"
              data-copy="${escapeHtml(p.command)}"
              aria-label="העתק פקודה"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <rect x="5.5" y="1.5" width="9" height="11" rx="1.5"/>
                <rect x="1.5" y="4.5" width="7" height="9" rx="1.5"/>
              </svg>
              <span class="copy-feedback" aria-live="polite">הועתק!</span>
            </button>
          </div>` : '';

    const badgeHtml = p.style === 'join'
      ? `<div class="path-badge">&#11088; מומלץ</div>`
      : '';

    return `
        <div class="path-card path-card--${escapeHtml(p.style)} glass-card reveal"${delay}>
          ${badgeHtml}<div class="path-icon" aria-hidden="true">${p.icon}</div>
          <h3 class="path-title">${escapeHtml(p.title)}</h3>
          <p class="path-desc">${escapeHtml(p.desc)}</p>
          <ul class="path-features">
${featuresHtml}
          </ul>${commandHtml}
          <a
            href="${escapeHtml(p.link)}"
            class="btn ${p.style === 'join' ? 'btn-primary' : p.style === 'whatsapp' ? 'btn-whatsapp' : 'btn-secondary'} btn--path"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${escapeHtml(p.btn || p.title)}
          </a>
        </div>`;
  }).join('\n');
}

function parseStats(readmeContent) {
  const markerPattern = /^## 📊 עובדות$/m;
  const headerMatch = readmeContent.match(markerPattern);
  if (!headerMatch) {
    console.warn('[landing/build.js] parseStats: "## 📊 עובדות" section not found in README.md — using hardcoded fallback values');
    return {};
  }
  const start = headerMatch.index;
  const end = readmeContent.indexOf('\n---', start);
  const section = end !== -1 ? readmeContent.slice(start, end) : readmeContent.slice(start, start + 600);

  const stats = {};
  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (line.includes('מדד') || line.includes('---')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 2) stats[cells[0]] = cells[1];
  }
  return stats;
}

async function fetchGitHubStars() {
  try {
    const https = require('https');
    const ghData = await new Promise((resolve, reject) => {
      const req = https.get(
        {
          hostname: 'api.github.com',
          path: '/repos/yonatan2021/pikud-haoref-bot',
          headers: { 'User-Agent': 'pikud-haoref-landing-build' },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
          });
        }
      );
      req.on('error', reject);
    });
    if (typeof ghData.stargazers_count === 'number') {
      return ghData.stargazers_count.toLocaleString('he-IL');
    }
  } catch (e) {
    console.warn('[build.js] GitHub stars fetch failed — using fallback:', e.message);
  }
  return '—';
}

// ---- Source loader --------------------------------------------------------

async function loadSources() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const readme = fs.readFileSync('README.md', 'utf8');
  const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

  // Features
  const sectionMarker = '## ✨ תכונות';
  const sectionStart = readme.indexOf(sectionMarker);
  if (sectionStart === -1) throw new Error('Could not find features section in README.md');
  const sectionEnd = readme.indexOf('\n---', sectionStart);
  if (sectionEnd === -1) throw new Error('Could not find end of features section in README.md');
  const featuresSection = readme.slice(sectionStart, sectionEnd);

  const userMarker = '### 🔔 למשתמש הקצה';
  const devMarker  = '### ⚙️ למתכנתים ו-DevOps';
  const userStart = featuresSection.indexOf(userMarker);
  const devStart  = featuresSection.indexOf(devMarker);
  if (userStart === -1 || devStart === -1) throw new Error('Could not find user/dev sub-sections in features table');

  const userFeaturesHtml = parseFeatureTable(featuresSection.slice(userStart, devStart));
  if (!userFeaturesHtml.trim()) throw new Error('parseFeatureTable returned empty HTML for user section');
  const devFeaturesHtml = parseFeatureTable(featuresSection.slice(devStart));
  if (!devFeaturesHtml.trim()) throw new Error('parseFeatureTable returned empty HTML for dev section');

  // Changelog
  const { version: changelogVersion, html: whatsNewHtml } = parseLatestChangelog(changelog);
  if (!whatsNewHtml.trim()) throw new Error('{{WHATS_NEW_HTML}} would be empty — check CHANGELOG.md format');

  // Paths
  const { paths: parsedPaths, sectionTitle: pathsSectionTitle } = parsePaths(readme);
  const whatsappPath = parsedPaths.find(p => p.style === 'whatsapp');
  if (whatsappPath && process.env.WHATSAPP_INVITE_LINK) {
    whatsappPath.link = process.env.WHATSAPP_INVITE_LINK;
  }
  const whatsappLink = process.env.WHATSAPP_INVITE_LINK || (whatsappPath ? whatsappPath.link : '');
  const pathsHtml = parsedPaths.length > 0
    ? buildPathsHtml(parsedPaths)
    : '<!-- paths section not found in README -->';

  // Stats
  const DEFAULT = { cities: '1400', zones: '28', cats: '6', tests: '672' };
  const stats = parseStats(readme);
  const EXPECTED = ['עיירות מכוסות', 'אזורים', 'קטגוריות', 'בדיקות אוטומטיות'];
  const missing = EXPECTED.filter(k => !stats[k]);
  if (missing.length) {
    console.warn(`[landing/build.js] parseStats: missing keys — falling back to hardcoded values for: ${missing.join(', ')}`);
  }
  const statCities = stats['עיירות מכוסות']   || DEFAULT.cities;
  const statZones  = stats['אזורים']          || DEFAULT.zones;
  const statCats   = stats['קטגוריות']        || DEFAULT.cats;
  const statTests  = stats['בדיקות אוטומטיות']  || DEFAULT.tests;

  const statStars = await fetchGitHubStars();

  // Full changelog
  const fullChangelogHtml = parseFullChangelog(changelog);

  // FAQ data — shared between /faq/ and home FAQ section
  const faqData = require('./faq.data');

  function renderFaqItem(item, idx) {
    const delay = idx > 0 ? ` style="--reveal-delay: ${(idx * 0.05).toFixed(2)}s"` : '';
    return (
      `<details class="faq-item reveal"${delay}>\n` +
      `  <summary class="faq-q">${escapeHtml(item.q)}</summary>\n` +
      `  <div class="faq-answer">${item.a}</div>\n` +
      `</details>`
    );
  }

  const faqItemsHtml = faqData.map(renderFaqItem).join('\n');
  const homeFaqHtml = faqData.slice(0, 8).map(renderFaqItem).join('\n');

  const buildDate = new Date().toLocaleDateString('he-IL', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return {
    version: pkg.version,
    buildDate,
    userFeaturesHtml,
    devFeaturesHtml,
    changelogVersion,
    whatsNewHtml,
    fullChangelogHtml,
    pathsHtml,
    pathsSectionTitle,
    whatsappLink,
    faqData,
    faqItemsHtml,
    homeFaqHtml,
    stats: { cities: statCities, zones: statZones, cats: statCats, tests: statTests, stars: statStars },
  };
}

// ---- Partials loader ------------------------------------------------------

function loadPartials() {
  const read = (p) => fs.readFileSync(path.join(TEMPLATE_DIR, 'partials', p), 'utf8');
  return {
    head:    read('head.html'),
    nav:     read('nav.html'),
    footer:  read('footer.html'),
    scripts: read('scripts.html'),
  };
}

// ---- SEO helpers ----------------------------------------------------------

const BASE_URL = process.env.LANDING_BASE_URL || 'https://yonatan2021.github.io/pikud-haoref-bot-landing';

function buildJsonLd(page, sources) {
  if (!page.jsonLd || page.jsonLd.length === 0) return '';

  const scripts = [];

  for (const type of page.jsonLd) {
    let obj = null;

    if (type === 'organization') {
      obj = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'התראות פיקוד העורף',
        url: BASE_URL,
        logo: BASE_URL + '/logo.jpg',
      };
    } else if (type === 'website') {
      obj = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'התראות פיקוד העורף',
        url: BASE_URL,
        inLanguage: 'he',
      };
    } else if (type === 'softwareapplication') {
      obj = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'בוט התראות פיקוד העורף',
        applicationCategory: 'CommunicationApplication',
        operatingSystem: 'Telegram, WhatsApp, Web',
        inLanguage: 'he',
        offers: {
          '@type': 'Offer',
          price: 0,
          priceCurrency: 'ILS',
        },
      };
    } else if (type === 'breadcrumblist') {
      if (page.breadcrumbs && page.breadcrumbs.length > 0) {
        obj = {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: page.breadcrumbs.map((crumb, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: crumb.name,
            item: BASE_URL + crumb.url,
          })),
        };
      }
    } else if (type === 'faqpage') {
      // Use shared faq.data.js loaded into sources.faqData
      // Home page uses first 8 items; /faq/ page uses all 20.
      const faqItems = sources && sources.faqData
        ? (page.slug === '/' ? sources.faqData.slice(0, 8) : sources.faqData)
        : (page.faqItems || []);
      if (faqItems.length > 0) {
        obj = {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqItems.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: {
              '@type': 'Answer',
              // Strip HTML tags for JSON-LD plain text
              text: stripHtmlToText(item.a),
            },
          })),
        };
      }
    } else if (type === 'article') {
      obj = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: page.title,
        inLanguage: 'he',
        datePublished: new Date().toISOString().slice(0, 10),
      };
    }

    if (obj) {
      scripts.push(`<script type="application/ld+json">${JSON.stringify(obj)}</script>`);
    }
  }

  return scripts.join('\n');
}

function generateSitemap(pages) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = pages.map((p) => `  <url>\n    <loc>${BASE_URL}${p.slug}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${p.priority != null ? p.priority : 0.5}</priority>\n  </url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), xml);
}

// ---- GA4 injection --------------------------------------------------------

function buildGa4Snippet() {
  const GA4_PATTERN = /^G-[A-Z0-9]{4,12}$/;
  let ga4Id = process.env.GA4_MEASUREMENT_ID || '';
  if (ga4Id && !GA4_PATTERN.test(ga4Id)) {
    console.warn(`[landing] Invalid GA4_MEASUREMENT_ID format: ${ga4Id} — skipping GA4 injection`);
    ga4Id = '';
  }
  return ga4Id
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${ga4Id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4Id}');</script>`
    : '';
}

// ---- Page render ----------------------------------------------------------

function buildRoutesJson() {
  const routes = PAGES.map((p) => ({
    slug: p.slug,
    title: p.title
      ? p.title.split('—')[0].split('–')[0].trim()
      : p.slug.replace(/^\/|\/$/g, '') || 'בית',
  }));
  return JSON.stringify(routes);
}

function globalContext(sources) {
  return {
    VERSION: sources.version,
    BUILD_DATE: sources.buildDate,
    USER_FEATURES_HTML: sources.userFeaturesHtml,
    DEV_FEATURES_HTML: sources.devFeaturesHtml,
    WHATS_NEW_HTML: sources.whatsNewHtml,
    CHANGELOG_VERSION: sources.changelogVersion || sources.version,
    STAT_CITIES: escapeHtml(sources.stats.cities),
    STAT_ZONES:  escapeHtml(sources.stats.zones),
    STAT_CATS:   escapeHtml(sources.stats.cats),
    STAT_TESTS:  escapeHtml(sources.stats.tests),
    STAT_STARS:  escapeHtml(sources.stats.stars),
    PATHS_HTML: sources.pathsHtml,
    PATHS_SECTION_TITLE: escapeHtml(sources.pathsSectionTitle),
    WHATSAPP_LINK: escapeHtml(sources.whatsappLink),
    ACCESSIBILITY_CONTACT_NAME: process.env.ACCESSIBILITY_CONTACT_NAME || 'יונתן גלפמן',
    ACCESSIBILITY_CONTACT_EMAIL: process.env.ACCESSIBILITY_CONTACT_EMAIL || 'a11y@example.com',
    ROUTES_JSON: buildRoutesJson(),
  };
}

function renderPage(page, partials, sources, globals) {
  const bodyTpl = fs.readFileSync(path.join(TEMPLATE_DIR, page.template), 'utf8');
  const bodyWithFooter = bodyTpl.replace('<!--[partial:footer]-->', partials.footer);

  // Inject nav with ACTIVE_SLUG resolved for this page
  const activeSlug = page.slug || '/';
  const navHtml = replacePlaceholders(partials.nav, { ACTIVE_SLUG: activeSlug });

  // Subpage stylesheet — for kind:'subpage' and kind:'guide' pages
  let subpageStyles = '';
  if (page.kind === 'subpage' || page.kind === 'guide') {
    subpageStyles = '<link rel="stylesheet" href="/styles/subpage.css">';
  }
  if (page.kind === 'guide') {
    subpageStyles += '\n<link rel="stylesheet" href="/styles/guides.css">';
  }

  // Hero image preload — only for home page
  const heroPreload = (page.kind === 'home' || page.slug === '/')
    ? '<link rel="preload" as="image" href="/screenshots/start.jpg" fetchpriority="high">'
    : '';

  // SEO placeholders
  const pageCanonical = BASE_URL + page.slug;
  const jsonLdHtml = buildJsonLd(page, sources);

  let composed = partials.head + navHtml + bodyWithFooter + partials.scripts;

  const pageCtx = page.placeholders ? page.placeholders(sources) : {};
  const ctx = {
    ...globals,
    ...pageCtx,
    SUBPAGE_STYLES: subpageStyles,
    HERO_PRELOAD: heroPreload,
    PAGE_TITLE: page.title || globals.VERSION,
    PAGE_DESCRIPTION: page.description || '',
    PAGE_CANONICAL: pageCanonical,
    PAGE_CANONICAL_BASE: BASE_URL,
    PAGE_OG_IMAGE: page.ogImage || '/og/home.png',
    JSON_LD: jsonLdHtml,
    ROBOTS_META: page.noindex ? '<meta name="robots" content="noindex, nofollow">' : '',
  };
  composed = replacePlaceholders(composed, ctx);

  // GA4 injection — the head partial carries <!-- GA4_PLACEHOLDER -->
  if (!composed.includes('<!-- GA4_PLACEHOLDER -->')) {
    throw new Error('head partial missing <!-- GA4_PLACEHOLDER --> — cannot inject GA4 script');
  }
  composed = composed.replace('<!-- GA4_PLACEHOLDER -->', buildGa4Snippet());

  return composed;
}

function writePage(page, html) {
  const outRel = page.out || (page.slug === '/' ? 'index.html' : path.join(page.slug.replace(/^\/|\/$/g, ''), 'index.html'));
  const full = path.join(DIST_DIR, outRel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html, 'utf8');
}

// ---- Asset copy -----------------------------------------------------------

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function copyAssets() {
  // Stylesheet
  fs.copyFileSync(path.join(TEMPLATE_DIR, 'style.css'), path.join(DIST_DIR, 'style.css'));

  // Sub-page stylesheets (styles/ directory)
  copyDir(path.join(TEMPLATE_DIR, 'styles'), path.join(DIST_DIR, 'styles'));

  // Logo (pre-compressed copy preferred)
  const logoSrc = fs.existsSync(path.join(TEMPLATE_DIR, 'logo.jpg'))
    ? path.join(TEMPLATE_DIR, 'logo.jpg')
    : 'logo.jpg';
  fs.copyFileSync(logoSrc, path.join(DIST_DIR, 'logo.jpg'));

  // Screenshots
  const optimizedShots = path.join(TEMPLATE_DIR, 'screenshots');
  const originalShots  = 'docs/screenshots';
  const shotsSrc = fs.existsSync(optimizedShots) ? optimizedShots : originalShots;
  if (!fs.existsSync(shotsSrc)) {
    throw new Error(`Screenshots source directory not found. Checked: ${optimizedShots}, ${originalShots}`);
  }
  const shotsDst = path.join(DIST_DIR, 'screenshots');
  fs.mkdirSync(shotsDst, { recursive: true });
  for (const f of fs.readdirSync(shotsSrc)) {
    if (path.extname(f).toLowerCase() === '.jpg') {
      fs.copyFileSync(path.join(shotsSrc, f), path.join(shotsDst, f));
    }
  }

  // Fonts (self-hosted woff2)
  copyDir(path.join(TEMPLATE_DIR, 'fonts'), path.join(DIST_DIR, 'fonts'));

  // robots.txt
  const robotsSrc = path.join(TEMPLATE_DIR, 'robots.txt');
  if (fs.existsSync(robotsSrc)) {
    fs.copyFileSync(robotsSrc, path.join(DIST_DIR, 'robots.txt'));
  }

  // .nojekyll — empty file, prevents GitHub Pages Jekyll transforms
  const nojekyllSrc = path.join(TEMPLATE_DIR, '.nojekyll');
  if (fs.existsSync(nojekyllSrc)) {
    fs.copyFileSync(nojekyllSrc, path.join(DIST_DIR, '.nojekyll'));
  }

  // .well-known/ — security.txt and other well-known files
  copyDir(path.join(TEMPLATE_DIR, '.well-known'), path.join(DIST_DIR, '.well-known'));
}

// ---- Main -----------------------------------------------------------------

async function main() {
  const sources = await loadSources();
  const partials = loadPartials();
  const globals = globalContext(sources);

  fs.mkdirSync(DIST_DIR, { recursive: true });

  for (const page of PAGES) {
    const html = renderPage(page, partials, sources, globals);
    writePage(page, html);
  }

  // OG image generation — degrades gracefully if sharp is absent.
  const { generateAllOgImages } = require('./generate-og');
  await generateAllOgImages(PAGES, TEMPLATE_DIR, DIST_DIR);

  generateSitemap(PAGES);
  copyAssets();
  console.log(`✅  Built ${PAGES.length} landing page(s) v${sources.version} → landing/dist/`);
}

main().catch((err) => { console.error(err); process.exit(1); });
