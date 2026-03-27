'use strict';

const fs = require('fs');
const path = require('path');

// Step 1: Read version from package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;

// Step 2: Parse README.md features table
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

const featureCards = featuresSection
  .split('\n')
  .filter((line) => line.startsWith('|'))
  .filter((line) => !line.includes('תכונה') && !line.includes('----'))
  .map((line) => {
    const inner = line.slice(1, -1);
    const cells = inner.split('|').map((cell) => cell.trim());
    const fullName = cells[0].replace(/\*\*/g, '');
    const detail = cells[1];
    // Split emoji icon from title text (emoji is always first "word")
    const spaceIdx = fullName.indexOf(' ');
    const icon = spaceIdx !== -1 ? fullName.slice(0, spaceIdx) : '';
    const title = spaceIdx !== -1 ? fullName.slice(spaceIdx + 1) : fullName;
    return [
      `<div class="feature-card">`,
      `  <span class="feature-icon">${icon}</span>`,
      `  <span class="feature-title">${title}</span>`,
      `  <span class="feature-desc">${detail}</span>`,
      `</div>`,
    ].join('\n');
  })
  .join('\n');

// Step 3: Get current date in Hebrew
const buildDate = new Date().toLocaleDateString('he-IL', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

// Step 4: Read template and replace placeholders
const template = fs.readFileSync('landing/template/index.html', 'utf8');
const output = template
  .replaceAll('{{VERSION}}', version)
  .replaceAll('{{FEATURES_HTML}}', featureCards)
  .replaceAll('{{BUILD_DATE}}', buildDate);

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
