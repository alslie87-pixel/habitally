// homescreen.js as shipped: the reminder banner, what turns it off, the
// home screen step's buttons, Android's install prompt and the theme.
//
// The file runs in a vm sandbox with a small DOM stand-in: elements keep
// what the script writes (innerHTML as a string, classes, data-*, onclick)
// and querySelector hands back one stand-in per selector, so a test can
// press a button the script wired. Reduced motion is on, so the guide draws
// its resting frame and starts no animation timers. No network, no sheet.
//
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const script = new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'homescreen.js'), 'utf8'), { filename: 'homescreen.js' });

const UA = {
  ios26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
};
const DAY = 24 * 60 * 60 * 1000;

function element(tag) {
  const classes = new Set();
  const e = {
    tagName: tag, id: '', className: '', innerHTML: '', textContent: '', style: {}, dataset: {},
    children: [], parentNode: null, isConnected: true, offsetWidth: 0, onclick: null, q: new Map(),
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle(c, on) { const want = on === undefined ? !classes.has(c) : !!on; if (want) classes.add(c); else classes.delete(c); return want; }
    },
    get firstChild() { return e.children[0] || null; },
    appendChild(c) { e.children.push(c); c.parentNode = e; return c; },
    insertBefore(c) { e.children.unshift(c); c.parentNode = e; return c; },
    remove() { if (e.parentNode) e.parentNode.children = e.parentNode.children.filter(x => x !== e); e.parentNode = null; e.isConnected = false; },
    setAttribute() {}, addEventListener() {}, removeEventListener() {}, focus() {},
    querySelector(sel) { if (!e.q.has(sel)) e.q.set(sel, element('match:' + sel)); return e.q.get(sel); },
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    attachShadow() { e.shadow = element('#shadow-root'); return e.shadow; }
  };
  return e;
}

// Loads homescreen.js on a page. ua, standalone, light: the device and theme;
// storage: localStorage to start from; now: the clock (ms).
function load({ ua = UA.ios26, standalone = false, light = false, storage = {}, now = Date.UTC(2026, 9, 27, 12) } = {}) {
  const store = new Map(Object.entries(storage));
  const listeners = {}, observers = [];
  const html = element('html'), app = element('div'), body = element('body'), head = element('head');
  app.id = 'app';
  if (light) html.classList.add('light');
  class FixedDate extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } }
  const g = {
    Date: FixedDate, URLSearchParams, console, setTimeout, clearTimeout,
    HTPlatform: require('../platform'),
    navigator: { userAgent: ua, maxTouchPoints: 0, standalone: false },
    matchMedia: q => ({ matches: /reduce/.test(q) || (/standalone/.test(q) && standalone) }),
    location: { origin: 'https://habitally.example', host: 'habitally.example', search: '?user=kari&t=abcdefghijklmnop' },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    addEventListener(type, fn) { listeners[type] = fn; },
    requestAnimationFrame: fn => fn(),
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.off = true; } },
    prompt() {},
    document: {
      documentElement: html, head, body, hidden: false,
      createElement: tag => element(tag),
      getElementById: id => (id === 'app' ? app : [app, ...app.children, ...body.children].find(x => x.id === id && x.isConnected) || null),
      addEventListener() {}, removeEventListener() {}
    }
  };
  g.window = g;
  vm.createContext(g);
  script.runInContext(g);
  return { g, store, listeners, observers, html, app, body, HT: g.HTHome };
}

// the step's guide: its shadow root, the HTML it drew, and its main button
function stepGuide(page, onFinish) {
  const calls = [];
  page.HT.mountStep({ step: 'STEP 5 OF 5', onFinish: r => { calls.push(r); if (onFinish) onFinish(r); } });
  const host = page.body.children.find(c => c.className === 'hsg-step');
  const sr = host.shadow;
  return { host, calls, phone: sr.innerHTML, screen: () => sr.querySelector('#app').innerHTML, primary: sr.querySelector('#primary'), skip: sr.querySelector('.skip') };
}

const settle = () => new Promise(r => setImmediate(r));

// ── the reminder: only the banner's own buttons turn it off ──

test("\"I've added it\" finishes the step but leaves the reminder on", () => {
  const page = load({ ua: UA.ios26 });
  const step = stepGuide(page);
  assert.match(step.screen(), /I've added it/);
  step.primary.onclick();
  assert.deepEqual(step.calls, ['added']);
  assert.equal(page.store.get('hbt-a2hs-done'), undefined);
});

test('an accepted Android install, and appinstalled, finish the step but leave the reminder on', async () => {
  const page = load({ ua: UA.chromeAndroid });
  let prompts = 0;
  page.listeners.beforeinstallprompt({ preventDefault() {}, prompt: async () => { prompts++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  const step = stepGuide(page);
  assert.match(step.screen(), /Add to home screen/);
  step.primary.onclick();
  await settle(); await settle();
  assert.equal(prompts, 1);
  assert.deepEqual(step.calls, ['accepted']);
  assert.equal(page.store.get('hbt-a2hs-done'), undefined);

  const again = load({ ua: UA.chromeAndroid });
  const step2 = stepGuide(again);
  again.listeners.appinstalled();
  assert.deepEqual(step2.calls, ['accepted']);
  assert.equal(again.store.get('hbt-a2hs-done'), undefined);
});

test('a dismissed Android prompt stays on the step', async () => {
  const page = load({ ua: UA.chromeAndroid });
  page.listeners.beforeinstallprompt({ preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  const step = stepGuide(page);
  step.primary.onclick();
  await settle(); await settle();
  assert.deepEqual(step.calls, []);
  assert.match(step.screen(), /Nothing happens\?/);
});

test('"Show me" and × on the banner are what turn the reminder off', () => {
  const page = load({ ua: UA.ios26 });               // no timestamp: onboarded before this release
  assert.equal(page.HT.maybeRemind(), true);
  const banner = page.app.children[0];
  assert.equal(banner.id, 'a2hs-banner');
  assert.match(banner.innerHTML, /Add HabiTally to your home screen/);
  banner.querySelector('.a2hs-show').onclick();
  assert.equal(page.store.get('hbt-a2hs-done'), '1');
  assert.equal(banner.isConnected, false);
  assert.ok(page.body.children.some(c => c.className === 'hsg-sheet'), '"Show me" opens the guide as a sheet');
  assert.equal(page.HT.maybeRemind(), false, 'never again');

  const other = load({ ua: UA.ios26 });
  other.HT.maybeRemind();
  other.app.children[0].querySelector('.a2hs-x').onclick();
  assert.equal(other.store.get('hbt-a2hs-done'), '1');
  assert.equal(other.app.children.length, 0);
});

test('the sheet\'s own buttons close it without touching the reminder again', () => {
  const page = load({ ua: UA.ios26, storage: { 'hbt-a2hs-done': '1' } });
  page.store.delete('hbt-a2hs-done');
  page.HT.maybeRemind();
  page.app.children[0].querySelector('.a2hs-show').onclick();
  const sheet = page.body.children.find(c => c.className === 'hsg-sheet');
  const sr = sheet.querySelector('.hsg-sheet-host').shadow;
  assert.doesNotMatch(sr.querySelector('#app').innerHTML, /STEP \d OF \d/, 'no step label in the sheet');
  sr.querySelector('#primary').onclick();             // "I've added it"
  assert.equal(page.store.get('hbt-a2hs-done'), '1');  // set by "Show me", unchanged
});

test('the reminder: phone browser tab only, 3 days after onboarding, until a banner button', () => {
  const now = Date.UTC(2026, 9, 27, 12);
  const due = opts => load(Object.assign({ now }, opts)).HT.maybeRemind();
  assert.equal(due({ ua: UA.ios26 }), true, 'onboarded before this release');
  assert.equal(due({ ua: UA.ios26, storage: { 'hbt-onboarded-at': String(now - 3 * DAY) } }), true);
  assert.equal(due({ ua: UA.ios26, storage: { 'hbt-onboarded-at': String(now - 2 * DAY) } }), false);
  assert.equal(due({ ua: UA.chromeAndroid }), true);
  assert.equal(due({ ua: UA.ios26, standalone: true }), false, 'never from the home screen');
  assert.equal(due({ ua: UA.macChrome }), false, 'never on a computer');
  assert.equal(due({ ua: UA.ios26, storage: { 'hbt-a2hs-done': '1' } }), false);
});

test('onboarding saved starts the 3 days', () => {
  const page = load({ ua: UA.ios26 });
  page.HT.markOnboarded();
  assert.equal(page.store.get('hbt-onboarded-at'), String(Date.UTC(2026, 9, 27, 12)));
  assert.equal(page.HT.maybeRemind(), false);
});

// ── the Android dialog lives inside the illustration ──

test('the fake install dialog and scrim are drawn inside the illustration, not over the screen', () => {
  const page = load({ ua: UA.chromeAndroid });
  page.listeners.beforeinstallprompt({ preventDefault() {}, prompt: async () => {}, userChoice: new Promise(() => {}) });
  const step = stepGuide(page);
  assert.doesNotMatch(step.phone.replace(/<style>[\s\S]*?<\/style>/, ''), /ndlg|scrim/, 'nothing at screen level');
  const html = step.screen();
  const stage = /<div class="stage[^"]*" id="stage"[^>]*>([\s\S]*?)<div class="caprow">/.exec(html)[1];
  assert.match(stage, /<div class="nmini" id="nmini">[\s\S]*<div class="scrim" id="scrim"><\/div>[\s\S]*<div class="ndlg" id="ndlg">[\s\S]*id="ndInstall"/);
  assert.ok(html.indexOf('id="primary"') > html.indexOf('id="ndInstall"'), 'the real buttons come after the illustration');
});

// ── the theme ──

test('the guide follows the app theme, also when it changes', () => {
  const dark = stepGuide(load({ ua: UA.ios26 }));
  assert.equal(dark.host.dataset.theme, 'dark');
  const page = load({ ua: UA.ios26, light: true });
  const step = stepGuide(page);
  assert.equal(step.host.dataset.theme, 'light');
  page.html.classList.remove('light');
  page.observers.forEach(o => o.fn());
  assert.equal(step.host.dataset.theme, 'dark');
  assert.match(step.phone, /:host\(\[data-theme="light"\]\)/);
  assert.match(step.phone, /\.stage\{--text:#EEF0FF;--muted:#8A8FB6;--line:rgba\(160,168,255,\.14\);--card:#13162A;color:var\(--text\)\}/);
});
