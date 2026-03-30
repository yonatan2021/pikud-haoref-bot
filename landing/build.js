'use strict';

const fs = require('fs');
const path = require('path');

// Step 1: Read version from package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;

// Step 2: Parse README.md features — two sub-sections
const readme = fs.readFileSync('README.md', 'utf8');

const sectionMarker = '## ✨ תכונות';
const sectionStart = readme.indexOf(sectionMarker);
if (sectionStart === -1) {
  throw new Error('Could not find features section in README.md');
}

const sectionEnd = readme.indexOf('\n---', sectionStart);
if (sectionEnd === -1) {
  throw new Error('Could not find end of features section in README.md');
}

const featuresSection = readme.slice(sectionStart, sectionEnd);

// Parse a markdown table block into feature-card HTML
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

// Split on the two sub-section markers
const userMarker = '### 🔔 למשתמש הקצה';
const devMarker  = '### ⚙️ למתכנתים ו-DevOps';

const userStart = featuresSection.indexOf(userMarker);
const devStart  = featuresSection.indexOf(devMarker);

if (userStart === -1 || devStart === -1) {
  throw new Error('Could not find user/dev sub-sections in features table');
}

const userSection = featuresSection.slice(userStart, devStart);
const devSection  = featuresSection.slice(devStart);

const userFeaturesHtml = parseFeatureTable(userSection);
if (!userFeaturesHtml.trim()) {
  throw new Error('parseFeatureTable returned empty HTML for user section — check README.md "### 🔔 למשתמש הקצה" table');
}

const devFeaturesHtml = parseFeatureTable(devSection);
if (!devFeaturesHtml.trim()) {
  throw new Error('parseFeatureTable returned empty HTML for dev section — check README.md "### ⚙️ למתכנתים ו-DevOps" table');
}

// Step 3: Parse CHANGELOG.md — extract latest version highlights
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseLatestChangelog(changelogContent) {
  // Find the first real version entry (skip [Unreleased])
  const versionPattern = /^## \[(\d+\.\d+\.\d+)\]/m;
  const match = changelogContent.match(versionPattern);
  if (!match) {
    console.warn('[landing/build.js] parseLatestChangelog: no version entry found in CHANGELOG.md — {{WHATS_NEW_HTML}} and {{CHANGELOG_VERSION}} will be empty');
    return { version: '', html: '' };
  }

  const version = match[1];
  const versionStart = changelogContent.indexOf(match[0]);

  // Find where the next version section starts
  const rest = changelogContent.slice(versionStart + match[0].length);
  const nextMatch = rest.match(/^## \[/m);
  const versionBlock = nextMatch
    ? changelogContent.slice(versionStart, versionStart + match[0].length + rest.indexOf(nextMatch[0]))
    : changelogContent.slice(versionStart);

  // Extract ✨ תכונות חדשות subsection
  const featuresIdx = versionBlock.indexOf('### ✨ תכונות חדשות');
  if (featuresIdx === -1) return { version, html: '' };

  const featuresEnd = versionBlock.indexOf('\n### ', featuresIdx + 5);
  const featuresSection = featuresEnd !== -1
    ? versionBlock.slice(featuresIdx, featuresEnd)
    : versionBlock.slice(featuresIdx);

  const items = [];
  for (const line of featuresSection.split('\n')) {
    if (items.length >= 5) break;
    const trimmed = line.trim();

    // Sub-section header like "#### WhatsApp Listener Bridge (חדש)"
    if (trimmed.startsWith('#### ')) {
      items.push(trimmed.slice(5).trim());
      continue;
    }
    // Bullet like "- **Feature Name** — description"
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      let text = trimmed.slice(2).trim();
      const boldMatch = text.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        text = boldMatch[1].replace(/`/g, '');
      } else {
        const sepIdx = text.indexOf(' — ');
        if (sepIdx > 0) text = text.slice(0, sepIdx);
        text = text.replace(/\*\*/g, '').replace(/`/g, '');
      }
      if (text.length > 2) items.push(text);
    }
  }

  const html = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n');
  return { version, html };
}

const { version: changelogVersion, html: whatsNewHtml } = parseLatestChangelog(changelog);
if (!whatsNewHtml.trim()) {
  console.warn('[landing/build.js] parseLatestChangelog: no features found — {{WHATS_NEW_HTML}} will be empty');
}

// Step 3b: Parse README.md stats table (## 📊 עובדות)
function parseStats(readmeContent) {
  const marker = '## 📊 עובדות';
  const start = readmeContent.indexOf(marker);
  if (start === -1) return {};

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

const DEFAULT_STAT_CITIES = '1400';
const DEFAULT_STAT_ZONES  = '28';
const DEFAULT_STAT_CATS   = '5';
const DEFAULT_STAT_TESTS  = '391';

const stats = parseStats(readme);
const EXPECTED_STAT_KEYS = ['עיירות מכוסות', 'אזורים', 'קטגוריות', 'בדיקות אוטומטיות'];
const missingStatKeys = EXPECTED_STAT_KEYS.filter(k => !stats[k]);
if (missingStatKeys.length > 0) {
  console.warn(`[landing/build.js] parseStats: missing keys — falling back to hardcoded values for: ${missingStatKeys.join(', ')}`);
}

const statCities = stats['עיירות מכוסות'] || DEFAULT_STAT_CITIES;
const statZones  = stats['אזורים']        || DEFAULT_STAT_ZONES;
const statCats   = stats['קטגוריות']      || DEFAULT_STAT_CATS;
const statTests  = stats['בדיקות אוטומטיות'] || DEFAULT_STAT_TESTS;

// Step 4: Get current date in Hebrew
const buildDate = new Date().toLocaleDateString('he-IL', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

// Step 5: Read template and replace placeholders
const template = fs.readFileSync('landing/template/index.html', 'utf8');
let output = template
  .replaceAll('{{VERSION}}', version)
  .replaceAll('{{USER_FEATURES_HTML}}', userFeaturesHtml)
  .replaceAll('{{DEV_FEATURES_HTML}}', devFeaturesHtml)
  .replaceAll('{{BUILD_DATE}}', buildDate)
  .replaceAll('{{WHATS_NEW_HTML}}', whatsNewHtml)
  .replaceAll('{{CHANGELOG_VERSION}}', changelogVersion || version)
  .replaceAll('{{STAT_CITIES}}', statCities)
  .replaceAll('{{STAT_ZONES}}', statZones)
  .replaceAll('{{STAT_CATS}}', statCats)
  .replaceAll('{{STAT_TESTS}}', statTests);

// Inject GA4 tracking script if measurement ID is configured
const GA4_PATTERN = /^G-[A-Z0-9]{4,12}$/;
let ga4Id = process.env.GA4_MEASUREMENT_ID || '';
if (ga4Id && !GA4_PATTERN.test(ga4Id)) {
  console.warn(`[landing] Invalid GA4_MEASUREMENT_ID format: ${ga4Id} — skipping GA4 injection`);
  ga4Id = ''; // treat as unset, no injection
}
const ga4Script = ga4Id
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${ga4Id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4Id}');</script>`
  : '';
if (!output.includes('<!-- GA4_PLACEHOLDER -->')) {
  throw new Error('landing/template/index.html is missing <!-- GA4_PLACEHOLDER --> — cannot inject GA4 script');
}
output = output.replace('<!-- GA4_PLACEHOLDER -->', ga4Script);

// Create output directories
fs.mkdirSync('landing/dist/screenshots', { recursive: true });

// Write index.html
fs.writeFileSync('landing/dist/index.html', output, 'utf8');

// Step 5: Copy style.css
fs.copyFileSync('landing/template/style.css', 'landing/dist/style.css');

// Step 6: Copy logo — use pre-optimized version from template/ (18KB vs 674KB original)
const logoSrc = fs.existsSync('landing/template/logo.jpg')
  ? 'landing/template/logo.jpg'
  : 'logo.jpg';
fs.copyFileSync(logoSrc, 'landing/dist/logo.jpg');

// Step 7: Copy screenshots — prefer pre-optimized from landing/template/screenshots/
const optimizedScreenshots = 'landing/template/screenshots';
const originalScreenshots = 'docs/screenshots';
const screenshotsDir = fs.existsSync(optimizedScreenshots)
  ? optimizedScreenshots
  : originalScreenshots;
if (!fs.existsSync(screenshotsDir)) {
  throw new Error(`Screenshots source directory not found. Checked: ${optimizedScreenshots}, ${originalScreenshots}`);
}
if (fs.existsSync(screenshotsDir)) {
  const screenshotFiles = fs.readdirSync(screenshotsDir);
  for (const file of screenshotFiles) {
    if (path.extname(file).toLowerCase() === '.jpg') {
      fs.copyFileSync(
        path.join(screenshotsDir, file),
        path.join('landing/dist/screenshots', file)
      );
    }
  }
}

console.log('✅  Built landing page v' + version + ' → landing/dist/');
