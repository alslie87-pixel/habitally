// Onboarding with the home screen step at the end (stats.js).
//
// stats.js is loaded as shipped into a vm sandbox, like the Insights test,
// with a DOM stand-in that keeps what the page writes and the listeners it
// binds, so a test can press the onboarding's main button. get-stats runs
// for real over a fake sheet in onboarding state (the six default habits,
// Z1 empty, not a tick); the writes onboarding makes are recorded, never
// sent. homescreen.js is replaced by a stand-in with the same window.HTHome
// surface, so these tests are about where the step sits and what it does to
// the save, not about the guide's drawing.
//
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const V = require('../api/_validate');
const CP = require('../api/_controlPanel');
const { buildYear, fakeRes, withFakeGoogleapis } = require('./helpers');

const MONTHS = V.MONTHS;

// ── get-stats over a fake sheet in onboarding state ────────

const state = { marker: '' };

function defaultCpRows() {
  const rows = [];
  for (let i = 0; i < 14; i++) rows.push([]);
  ['No alcohol', 'No social media', 'No sugar'].forEach((n, i) => { rows[i] = [n, 'Active', '']; });
  ['Exercise', 'Read', 'Early to bed'].forEach((n, i) => { rows[7 + i] = [n, 'Active', '']; });
  return rows;
}

const GRIDS = buildYear(2026);
function serveRange(range) {
  const m = /^'([^']+)'!/.exec(range);
  const mi = m ? MONTHS.indexOf(m[1]) : -1;
  if (mi !== -1) return { values: GRIDS[mi] };
  if (range === CP.HABITS_RANGE) return { values: defaultCpRows() };
  if (range === CP.ONBOARDED_CELL) return { values: state.marker ? [[state.marker]] : [] };
  throw new Error('unexpected range in test: ' + range);
}

const fakeGoogle = {
  auth: { GoogleAuth: class { constructor() {} } },
  sheets: () => ({
    spreadsheets: {
      get: async () => ({ data: { sheets: MONTHS.map(t => ({ properties: { title: t } })) } }),
      values: {
        batchGet: async ({ ranges }) => ({ data: { valueRanges: ranges.map(serveRange) } }),
        update: async () => { throw new Error('get-stats must not write'); }
      }
    }
  })
};
const getStats = withFakeGoogleapis(fakeGoogle, () => require('../api/get-stats'));

process.env.GOOGLE_SERVICE_ACCOUNT = '{"type":"service_account"}';
process.env.GOOGLE_SHEET_ID = 'fake-sheet-for-tests';
delete process.env.CUSTOMERS_SHEET_ID;

// ── stats.js in a sandbox ──────────────────────────────────

const script = new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'stats.js'), 'utf8'), { filename: 'stats.js' });

function element() {
  const el = {
    id: '', className: '', innerHTML: '', textContent: '', scrollTop: 0, style: {}, dataset: {}, listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild: child => child,
    addEventListener(type, fn) { el.listeners[type] = fn; },
    querySelector: () => null,
    querySelectorAll: () => []
  };
  return el;
}

// Boots the page on 2026-10-27. home: what HTHome.offerStep() answers
// (false = the app runs from the home screen), or null for no homescreen.js.
// failOn: a POST path that answers with an error.
async function boot({ home = true, failOn = null } = {}) {
  const noon = new Date(2026, 9, 27, 12).getTime();
  class FixedDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(noon); }
    static now() { return noon; }
  }
  const made = [], docListeners = {}, log = [];
  const g = {
    Date: FixedDate, URL, URLSearchParams, console, setTimeout, clearTimeout,
    requestAnimationFrame: fn => fn(),
    matchMedia: () => ({ matches: true }),
    scrollY: 0, scrollTo() {}, addEventListener() {},
    location: { search: '?user=kari&t=abcdefghijklmnop', href: 'http://localhost/?user=kari&t=abcdefghijklmnop', reload() { log.push('reload'); } },
    history: { pushState() {}, back() {} },
    document: {
      head: element(), body: element(),
      documentElement: { classList: { contains: () => false } },
      createElement: () => { const e = element(); made.push(e); return e; },
      getElementById: () => null,
      addEventListener(type, fn) { docListeners[type] = fn; }
    },
    fetch: async (url, init) => {
      const u = new URL(url, 'http://localhost');
      if (!init || init.method !== 'POST') {
        const res = fakeRes();
        await getStats({ method: 'GET', query: Object.fromEntries(u.searchParams) }, res);
        return { ok: res.statusCode === 200, status: res.statusCode, json: async () => res.body };
      }
      const p = u.pathname.replace('/api', '');
      log.push('POST ' + p + ' ' + init.body);
      if (p === failOn) return { ok: false, status: 500, json: async () => ({ success: false, error: 'sheet unavailable' }) };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
  };
  g.window = g;
  if (home !== null) {
    g.HTHome = {
      offerStep: () => home,
      mountStep(opts) { log.push('mountStep ' + opts.step); g.HTHome.finish = opts.onFinish; return { destroy() {} }; },
      markOnboarded() { log.push('markOnboarded'); },
      maybeRemind() { log.push('maybeRemind'); }
    };
  }
  vm.createContext(g);
  script.runInContext(g);

  await docListeners.DOMContentLoaded();
  const ob = made.find(e => e.id === 'obx');
  const foot = made.find(e => e.className === 'obx-foot-wrap');
  const settle = () => new Promise(r => setImmediate(r));
  return {
    log, ob, foot,
    // the steps' names, and which one is current
    steps: () => [...ob.innerHTML.matchAll(/<div class="obx-step([^"]*)"[^>]*><i[^>]*>(\d)<\/i><span>([^<]+)<\/span>/g)]
      .map(m => m[2] + ' ' + m[3] + (m[1].includes('cur') ? '*' : '')),
    button: () => (/<button type="button" class="obx-btn" id="obx-next"[^>]*>([^<]+)/.exec(foot.innerHTML) || [])[1] || null,
    // a button in the guide: it calls the onFinish the step was mounted with
    guideButton: async reason => { await g.HTHome.finish(reason); },
    async next() {
      await foot.listeners.click({ target: { closest: s => (s === '#obx-next' ? {} : null) } });
      for (let i = 0; i < 5; i++) await settle();
    }
  };
}

const posts = log => log.filter(l => l.startsWith('POST'));

test('five steps: the setup is saved on leaving the summary, then the home screen step', async () => {
  const s = await boot({ home: true });
  assert.deepEqual(s.steps(), ['1 Welcome*', '2 Habits', '3 Focus', '4 Done', '5 Home screen']);
  assert.equal(s.button(), 'Let’s set up');

  await s.next(); await s.next(); await s.next();     // Welcome, Habits, Focus
  assert.deepEqual(s.steps(), ['1 Welcome', '2 Habits', '3 Focus', '4 Done*', '5 Home screen']);
  assert.equal(s.button(), 'Continue');               // not "Tick your first habit": one step is left
  assert.match(s.foot.innerHTML, /Writes your habits to the sheet/);
  assert.deepEqual(posts(s.log), [], 'nothing is written before the summary');

  await s.next();                                     // the summary's Continue
  assert.deepEqual(posts(s.log), [
    'POST /update-focus {"type":"good","habitName":"Exercise"}',
    'POST /update-focus {"type":"bad","habitName":"No alcohol"}',
    'POST /set-onboarded {}'
  ]);
  assert.deepEqual(s.log.slice(-2), ['markOnboarded', 'mountStep STEP 5 OF 5']);
  assert.equal(s.foot.innerHTML, '', 'the guide brings its own buttons');
  assert.ok(!s.log.includes('reload'), 'the home screen step is still on screen');

  // any of the guide's buttons ends onboarding the same way, writing nothing more
  await s.guideButton('later');
  assert.equal(s.log[s.log.length - 1], 'reload');
  assert.equal(posts(s.log).length, 3);
});

test('opened from the home screen: four steps, and the summary finishes as before', async () => {
  const s = await boot({ home: false });
  assert.deepEqual(s.steps(), ['1 Welcome*', '2 Habits', '3 Focus', '4 Done']);
  await s.next(); await s.next(); await s.next();
  assert.equal(s.button(), 'Tick your first habit');
  await s.next();
  assert.equal(posts(s.log).length, 3);
  assert.ok(!s.log.some(l => l.startsWith('mountStep')), 'no home screen step');
  assert.equal(s.log[s.log.length - 1], 'reload');
});

test('without homescreen.js the onboarding is the old four steps', async () => {
  const s = await boot({ home: null });
  assert.deepEqual(s.steps(), ['1 Welcome*', '2 Habits', '3 Focus', '4 Done']);
  await s.next(); await s.next(); await s.next(); await s.next();
  assert.equal(s.log[s.log.length - 1], 'reload');
});

test('a failed save keeps the summary on screen with the error, and no guide', async () => {
  const s = await boot({ home: true, failOn: '/set-onboarded' });
  await s.next(); await s.next(); await s.next(); await s.next();
  assert.deepEqual(s.steps(), ['1 Welcome', '2 Habits', '3 Focus', '4 Done*', '5 Home screen']);
  assert.match(s.foot.innerHTML, /Couldn’t save your setup \(sheet unavailable\)/);
  assert.ok(!s.log.some(l => l.startsWith('mountStep') || l === 'markOnboarded' || l === 'reload'));
});

test('a customer past onboarding gets the reminder check, not the onboarding', async () => {
  state.marker = CP.ONBOARDED_MARK;
  try {
    const s = await boot({ home: true });
    assert.equal(s.ob.innerHTML, '');
    assert.deepEqual(s.log, ['maybeRemind']);
  } finally {
    state.marker = '';
  }
});
