import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// jsdom ships without type declarations; it is already a devDependency.
const { JSDOM } = require('jsdom') as { JSDOM: new (html: string, opts: Record<string, unknown>) => { window: any } };

const NAV_HTML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'landing', 'template', 'partials', 'nav.html'),
  'utf8',
).replace('{{ACTIVE_SLUG}}', '/');

function render(mobile: boolean) {
  const listeners: Array<() => void> = [];
  const mql = {
    matches: mobile,
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
  };
  const dom = new JSDOM(`<!doctype html><html><body>${NAV_HTML}<main id="main"></main></body></html>`, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window: any) {
      window.matchMedia = () => mql;
    },
  });
  const { document } = dom.window;
  const btn = document.querySelector('.nav-hamburger') as any;
  const menu = document.getElementById('nav-menu') as any;
  const setViewport = (isMobile: boolean) => {
    mql.matches = isMobile;
    listeners.forEach((cb) => cb());
  };
  const pressEscape = () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return { window: dom.window, document, btn, menu, setViewport, pressEscape };
}

describe('landing nav — mobile menu keyboard accessibility', () => {
  it('hamburger is a real button wired to the menu', () => {
    const { btn, menu, document } = render(true);
    assert.equal(btn.tagName, 'BUTTON');
    assert.equal(btn.getAttribute('type'), 'button');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.equal(btn.getAttribute('aria-controls'), 'nav-menu');
    assert.equal(menu.tagName, 'NAV');
    assert.equal(document.getElementById(btn.getAttribute('aria-controls')), menu);
    assert.equal(document.getElementById('nav-toggle'), null, 'no hidden checkbox/label toggle remains');
  });

  it('button label is a constant «תפריט»; state is conveyed only by aria-expanded', () => {
    const { btn } = render(true);
    assert.equal(btn.getAttribute('aria-label'), 'תפריט');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    btn.click();
    assert.equal(btn.getAttribute('aria-expanded'), 'true');
    assert.equal(btn.getAttribute('aria-label'), 'תפריט');
    btn.click();
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.equal(btn.getAttribute('aria-label'), 'תפריט');
  });

  it('closed menu on mobile is inert, opening removes inert and syncs aria-expanded', () => {
    const { btn, menu } = render(true);
    assert.ok(menu.hasAttribute('inert'), 'closed mobile menu must be inert');
    btn.click();
    assert.equal(btn.getAttribute('aria-expanded'), 'true');
    assert.ok(!menu.hasAttribute('inert'));
    btn.click();
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.ok(menu.hasAttribute('inert'));
  });

  it('Escape closes the open menu and returns focus to the button', () => {
    const { btn, menu, document, pressEscape } = render(true);
    btn.click();
    const firstLink = menu.querySelector('a');
    firstLink.focus();
    assert.equal(document.activeElement, firstLink);
    pressEscape();
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.ok(menu.hasAttribute('inert'));
    assert.equal(document.activeElement, btn);
  });

  it('Escape does nothing when the menu is already closed', () => {
    const { btn, document, pressEscape } = render(true);
    const main = document.getElementById('main');
    main.tabIndex = -1;
    main.focus();
    pressEscape();
    assert.equal(document.activeElement, main);
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
  });

  it('desktop keeps the links focusable (never inert), including after resizing from mobile', () => {
    const desktop = render(false);
    assert.ok(!desktop.menu.hasAttribute('inert'));

    const resized = render(true);
    resized.btn.click();
    resized.setViewport(false);
    assert.ok(!resized.menu.hasAttribute('inert'));
    assert.equal(resized.btn.getAttribute('aria-expanded'), 'false');
    resized.setViewport(true);
    assert.ok(resized.menu.hasAttribute('inert'));
  });

  it('hamburger CSS gives a 44×44 hit area without moving the 24×18 icon', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'landing', 'template', 'style.css'), 'utf8');
    const rule = css.match(/\n\.nav-hamburger \{([^}]*)\}/);
    assert.ok(rule, '.nav-hamburger rule exists');
    const decl = (name: string) => rule![1].match(new RegExp(`\\b${name}:\\s*([^;]+);`))?.[1].trim();
    const px = (v: string | undefined) => (v ?? '').split(/\s+/).map((x) => parseFloat(x));
    assert.equal(decl('box-sizing'), 'content-box');
    const [w, h] = [parseFloat(decl('width') ?? ''), parseFloat(decl('height') ?? '')];
    const [padY, padX] = px(decl('padding'));
    const [marY, marX] = px(decl('margin'));
    assert.ok(w + 2 * padX >= 44, `hit width ${w + 2 * padX}px`);
    assert.ok(h + 2 * padY >= 44, `hit height ${h + 2 * padY}px`);
    assert.equal(marX, -padX, 'horizontal margin offsets padding');
    assert.equal(marY, -padY, 'vertical margin offsets padding');
  });
});
