'use strict';
// ---------------------------------------------------------------------------
// landing/generate-og.js — per-page OG image generator (1200×630 PNG).
//
// Uses `sharp` to render an SVG template into PNG. If `sharp` is not
// installed (or fails to load), the function logs a warning and returns
// gracefully — the site still builds, OG PNGs just won't be present and
// social previews will fall back to whatever Twitter/OG default applies.
//
// Fallback path:
//   npm install --save-dev sharp   →  PNGs generated
//   sharp absent / broken          →  warn + continue, no crash
// ---------------------------------------------------------------------------

const fs   = require('fs');
const path = require('path');

/**
 * Wrap a Hebrew (or any) title string at a word boundary near `maxLen` chars.
 * Returns a two-element array [line1, line2]; line2 is '' when the title fits
 * on one line.
 *
 * @param {string} s
 * @param {number} maxLen
 * @returns {[string, string]}
 */
function wrapHebrew(s, maxLen) {
  if (s.length <= maxLen) return [s, ''];
  const words = s.split(/\s+/);
  let l1 = '';
  let l2 = '';
  for (const w of words) {
    if (!l2 && (l1 + (l1 ? ' ' : '') + w).length <= maxLen) {
      l1 = l1 ? l1 + ' ' + w : w;
    } else {
      l2 = l2 ? l2 + ' ' + w : w;
    }
  }
  return [l1, l2];
}

/**
 * Escape characters that are special in XML/SVG attribute values.
 *
 * @param {string} s
 * @returns {string}
 */
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate per-page OG images for every page entry that has an `ogImage`
 * field.  Outputs PNG files to `<DIST_DIR>/og/<name>.png`.
 *
 * @param {Array<{ogImage?: string, title?: string}>} pages
 * @param {string} TEMPLATE_DIR  absolute path to landing/template/
 * @param {string} DIST_DIR      absolute path to landing/dist/
 */
async function generateAllOgImages(pages, TEMPLATE_DIR, DIST_DIR) {
  // Graceful degradation: if sharp is unavailable, warn and skip.
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.warn(
      '[og] sharp not installed — skipping OG image generation. ' +
      'PNGs will be 404. Run `npm install --save-dev sharp` to enable.'
    );
    return;
  }

  const svgTplPath = path.join(TEMPLATE_DIR, 'og-template.svg');
  if (!fs.existsSync(svgTplPath)) {
    console.warn('[og] og-template.svg not found at', svgTplPath, '— skipping OG generation.');
    return;
  }

  const svgTpl = fs.readFileSync(svgTplPath, 'utf8');

  // Inline the logo as base64 so the SVG is fully self-contained at render time.
  const logoPath = path.join(TEMPLATE_DIR, 'logo.jpg');
  const logoB64 = fs.existsSync(logoPath)
    ? 'data:image/jpeg;base64,' + fs.readFileSync(logoPath).toString('base64')
    : '';

  const ogDir = path.join(DIST_DIR, 'og');
  fs.mkdirSync(ogDir, { recursive: true });

  let generated = 0;
  let skipped   = 0;

  for (const page of pages) {
    if (!page.ogImage) continue;

    const name    = path.basename(page.ogImage, '.png'); // e.g. 'home', 'guides-telegram'
    const outPath = path.join(ogDir, name + '.png');

    // Skip if already generated for a shared OG path (e.g. multiple pages use '/og/home.png').
    if (fs.existsSync(outPath)) {
      skipped++;
      continue;
    }

    const title = page.title || 'התראות פיקוד העורף';
    const [line1, line2] = wrapHebrew(title, 38);

    const svg = svgTpl
      .replaceAll('{{LOGO_BASE64}}', logoB64)
      .replaceAll('{{TITLE_LINE1}}', escapeXml(line1))
      .replaceAll('{{TITLE_LINE2}}', escapeXml(line2));

    try {
      await sharp(Buffer.from(svg), { density: 144 })
        .resize(1200, 630)
        .png({ compressionLevel: 8 })
        .toFile(outPath);
      generated++;
    } catch (e) {
      console.warn(`[og] render failed for "${name}": ${e.message}`);
    }
  }

  console.log(
    `[og] OG images: ${generated} generated, ${skipped} reused (shared path) → landing/dist/og/`
  );
}

module.exports = { generateAllOgImages };
