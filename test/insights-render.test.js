// The Insights screen as drawn (stats.js), on top of the 30-day numbers.
//
// stats.js is loaded as shipped into a vm sandbox with a small stand-in for
// the DOM: elements only keep what render() writes (innerHTML as a string),
// the clock is fixed to the day under test, and fetch() goes straight to the
// real get-stats handler over fake in-memory sheets. The assertions read the
// HTML render() produced. Nothing touches the network or the real sheet.
//
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const V = require('../api/_validate');
const CP = require('../api/_controlPanel');
const { at, addDays, buildYear, setTick, buildArchive,
        makeCpRows, fakeRes, withFakeGoogleapis } = require('./helpers');

const MONTHS = V.MONTHS;
const NO_SUGAR = 2, EXERCISE = 9, READ = 10; // month-tab columns of makeCpRows()

// ── get-stats over fake sheets ─────────────────────────────

const state = { monthGrids: null, archives: {} };

function serveRange(range) {
  const m = /^'([^']+)'!/.exec(range);
  const tab = m ? m[1] : '';
  const mi = MONTHS.indexOf(tab);
  if (mi !== -1) return { values: state.monthGrids[mi] };
  const am = /^Archive (\d{4})$/.exec(tab);
  if (am && state.archives[am[1]]) return { values: state.archives[am[1]] };
  if (range === CP.HABITS_RANGE) return { values: makeCpRows() };
  if (range === CP.ONBOARDED_CELL) return { values: [['app-onboarded']] };
  throw new Error('unexpected range in test: ' + range);
}

const fakeGoogle = {
  auth: { GoogleAuth: class { constructor() {} } },
  sheets: () => ({
    spreadsheets: {
      get: async () => ({ data: { sheets: MONTHS.concat(Object.keys(state.archives).map(y => 'Archive ' + y))
        .map(t => ({ properties: { title: t } })) } }),
      values: {
        batchGet: async ({ ranges }) => ({ data: { valueRanges: ranges.map(serveRange) } }),
        update: async () => { throw new Error('nothing in these tests may write'); }
      }
    }
  })
};

const getStats = withFakeGoogleapis(fakeGoogle, () => require('../api/get-stats'));

process.env.GOOGLE_SERVICE_ACCOUNT = '{"type":"service_account"}';
process.env.GOOGLE_SHEET_ID = 'fake-sheet-for-tests';
delete process.env.CUSTOMERS_SHEET_ID;

async function stats(dateStr) {
  const res = fakeRes();
  await getStats({ method: 'GET', query: { date: dateStr } }, res);
  assert.equal(res.statusCode, 200);
  return res.body;
}

// ── stats.js in a sandbox ──────────────────────────────────

const script = new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'stats.js'), 'utf8'),
  { filename: 'stats.js' });

// querySelectorAll('[data-x]') hands back one stub per data-x="..." in the
// element's own HTML and keeps the click handler render() binds to it, so
// a test can tap what was drawn.
function element() {
  const el = {
    id: '', className: '', innerHTML: '', textContent: '', scrollTop: 0, style: {}, dataset: {}, taps: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild: child => child, addEventListener() {},
    querySelector: () => null,
    querySelectorAll(sel) {
      const attr = (/^\[data-([a-z]+)\]$/.exec(sel) || [])[1];
      if (!attr) return [];
      return Array.from(el.innerHTML.matchAll(new RegExp('data-' + attr + '="([^"]*)"', 'g')), m => ({
        dataset: { [attr]: m[1] },
        addEventListener: (type, fn) => { el.taps[attr + '=' + m[1]] = fn; }
      }));
    }
  };
  return el;
}

// Opens Insights on the given local date. patch(S), if given, edits the
// get-stats payload before the page sees it. Returns { html(), tap(attr,
// value) }; a tap re-renders and returns the new HTML.
async function openInsights(dateStr, patch) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const noon = new Date(y, m - 1, d, 12).getTime();
  class FixedDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(noon); }
    static now() { return noon; }
  }
  const made = [];
  const g = {
    Date: FixedDate, URL, URLSearchParams, console, setTimeout, clearTimeout,
    requestAnimationFrame: fn => fn(),
    matchMedia: () => ({ matches: true }), // reduced motion: no fades to wait for
    scrollY: 0, scrollTo() {}, addEventListener() {},
    location: { search: '', href: 'http://localhost/' },
    history: { pushState() {}, back() {} },
    document: {
      head: element(), body: element(),
      documentElement: { classList: { contains: () => false } },
      createElement: () => { const e = element(); made.push(e); return e; },
      getElementById: () => null,
      addEventListener() {}
    },
    fetch: async url => {
      const res = fakeRes();
      const query = Object.fromEntries(new URL(url, 'http://localhost').searchParams);
      await getStats({ method: 'GET', query }, res);
      if (patch) patch(res.body);
      return { ok: res.statusCode === 200, status: res.statusCode, json: async () => res.body };
    }
  };
  g.window = g;
  vm.createContext(g);
  script.runInContext(g);

  g.HT.openInsights();
  const panel = made.find(e => e.id === 'stx-panel');
  // the first render shows "Loading…", then the fetch lands and it renders again
  for (let i = 0; i < 100 && !panel.innerHTML.includes('hsx-tiles'); i++) await new Promise(r => setImmediate(r));
  assert.ok(panel.innerHTML.includes('hsx-tiles'), 'Insights did not render');
  return {
    html: () => panel.innerHTML,
    tap: (attr, value) => { panel.taps[attr + '=' + value](); return panel.innerHTML; }
  };
}
const renderInsights = async (dateStr, patch) => (await openInsights(dateStr, patch)).html();

// One card of the page, by its label.
function card(html, title) {
  const hit = html.split('<div class="hsx-card"').find(c => c.includes('<div class="ink-k">' + title + '</div>'));
  assert.ok(hit, 'no card ' + title);
  return hit;
}
const one = (html, re) => { const m = re.exec(html); return m ? m[1] : null; };

const gauge     = html => one(card(html, 'Consistency'), />([^<>]*)<\/div>\s*<div[^>]*>ON PLAN</);
const weekdays  = html => one(card(html, 'Consistency'), />Weekdays<\/div><div[^>]*>([^<]*)</);
const weekends  = html => one(card(html, 'Consistency'), />Weekends<\/div><div[^>]*>([^<]*)</);
const dipLift   = html => one(card(html, 'Consistency'), /white-space:nowrap">([^<]*)</);
const powerAvg  = html => one(card(html, 'Power days'), />AVG ([^<]*)</);
const headline  = html => one(card(html, 'Momentum'), /48px\/0\.95 Manrope[^"]*">([^<]*)/);
const curveMonths = html => (card(html, 'Momentum').match(/>(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)<\/div>/g) || [])
  .map(s => s.slice(1, 4));

// Power days lanes in drawn order: [{ day, value, bar }], bar = whether the
// lane has a track and a bar at all.
function powerLanes(html) {
  const c = card(html, 'Power days');
  const WDS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days = Array.from(c.matchAll(/letter-spacing:0\.04em;color:[^;]*;pointer-events:none">(\w{3})</g), m => m[1]);
  const values = Array.from(c.matchAll(/font:800 12\.5px\/1 Manrope;color:[^;]*;pointer-events:none">([^<]*)</g), m => m[1]);
  const bar = {};
  for (const m of c.matchAll(/<g data-pd="(\d)"[\s\S]*?<\/g>/g)) bar[WDS[+m[1]]] = m[0].includes('var(--track)');
  return days.map((day, i) => ({ day, value: values[i], bar: bar[day] }));
}
const bestPill = html => one(card(html, 'Power days'), /(Best · [^<]*)</);

// Points in the open habit row's sparkline: its path is "M x y" plus one
// " C ..." per further point.
const sparkPoints = html => {
  const d = one(card(html, 'Habit momentum'), /<path d="(M [^"]*)" fill="none" stroke="[^"]*" stroke-width="2"/);
  return d ? (d.match(/ C /g) || []).length + 1 : 0;
};

// ── the fixture ────────────────────────────────────────────

function tickDays(grids, from, to, cols) {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    cols(d).forEach(c => setTick(grids, d.getFullYear(), d.getMonth(), d.getDate(), c));
  }
}

// Jun 1 - Sep 30 2026: Exercise every day, Read on weekdays; Oct 1-7 every
// habit. Row 47 is left empty: nothing on the page reads it any more.
function year2026() {
  const grids = buildYear(2026);
  const weekday = d => d.getDay() !== 0 && d.getDay() !== 6;
  tickDays(grids, at(2026, 5, 1), at(2026, 8, 30), d => weekday(d) ? [EXERCISE, READ] : [EXERCISE]);
  tickDays(grids, at(2026, 9, 1), at(2026, 9, 7), () => [NO_SUGAR, EXERCISE, READ]);
  return grids;
}

// ── the tests ──────────────────────────────────────────────

test('the 1st and the 7th draw no point for the running month; the 8th does', async () => {
  state.monthGrids = year2026(); state.archives = {};

  for (const date of ['2026-10-01', '2026-10-07']) {
    const html = await renderInsights(date);
    assert.deepEqual(curveMonths(html), ['Jun', 'Jul', 'Aug', 'Sep'], date);
  }

  const html = await renderInsights('2026-10-08');
  assert.deepEqual(curveMonths(html), ['Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
  const S = await stats('2026-10-08');
  assert.deepEqual(S.monthGood[11], { y: 2026, m: 9, good: 100 }); // Oct 1-7 from the timeline
  // the headline is the last 30 days, not the October point
  assert.equal(headline(html), String(S.rolling.good));
});

test('in January the curve shows last year out of the archive: Jan-Dec on the 5th, Feb-Jan on the 8th', async () => {
  // the 2027 sheet starts on Jan 4; 2026 and Jan 1-3 2027 live in "Archive 2026"
  const grids = buildYear(2027);
  tickDays(grids, at(2027, 0, 4), at(2027, 0, 7), () => [EXERCISE]);
  state.monthGrids = grids;
  state.archives = { 2026: buildArchive(2026,
    [{ slot: 0, name: 'No sugar' }, { slot: 7, name: 'Exercise' }, { slot: 8, name: 'Read' }],
    (d, slot) => d >= at(2026, 0, 1) && slot === 7) };

  assert.deepEqual(curveMonths(await renderInsights('2027-01-05')),
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  assert.deepEqual(curveMonths(await renderInsights('2027-01-08')),
    ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan']);
});

test('a habit sparkline has no point for the running month on the 1st, and one on the 8th', async () => {
  state.monthGrids = year2026(); state.archives = {};
  for (const [date, points] of [['2026-10-01', 4], ['2026-10-08', 5]]) { // Jun..Sep, then Jun..Oct
    const page = await openInsights(date);
    assert.equal(sparkPoints(page.html()), 0, 'no row open yet');
    assert.equal(sparkPoints(page.tap('open', '2')), points, date); // open Read
  }
});

test('Power days: a weekday without data shows "–", has no bar and is never the best', async () => {
  state.monthGrids = year2026(); state.archives = {};

  // Monday and Thursday without data (patched into the real payload)
  let html = await renderInsights('2026-10-11', S => { S.weekday = [null, 45, 80, null, 60, 30, 20]; });
  assert.deepEqual(powerLanes(html), [
    { day: 'Wed', value: '80%', bar: true },
    { day: 'Fri', value: '60%', bar: true },
    { day: 'Tue', value: '45%', bar: true },
    { day: 'Sat', value: '30%', bar: true },
    { day: 'Sun', value: '20%', bar: true },
    { day: 'Mon', value: '–', bar: false },
    { day: 'Thu', value: '–', bar: false }
  ]);
  assert.equal(bestPill(html), 'Best · Wed 80%');

  // even when every weekday with data is at 0%, the empty Monday is not the best
  html = await renderInsights('2026-10-11', S => { S.weekday = [null, 0, 0, 0, 0, 0, 0]; });
  assert.equal(bestPill(html), 'Best · Tue 0%');

  // a new user's first week: no weekday has data, so there is no best at all
  const grids = buildYear(2026);
  tickDays(grids, at(2026, 9, 5), at(2026, 9, 10), () => [EXERCISE, NO_SUGAR]); // Oct 5-10
  state.monthGrids = grids;
  html = await renderInsights('2026-10-11');
  powerLanes(html).forEach(l => assert.deepEqual([l.value, l.bar], ['–', false], l.day));
  assert.equal(bestPill(html), null);
});

test('equal weekdays and weekends read "Weekdays and weekends even"', async () => {
  const grids = buildYear(2026);
  tickDays(grids, at(2026, 8, 1), at(2026, 9, 10), () => [EXERCISE, READ]); // 100% every day
  state.monthGrids = grids; state.archives = {};

  const html = await renderInsights('2026-10-11');
  assert.equal(weekdays(html), '100%');
  assert.equal(weekends(html), '100%');
  assert.equal(dipLift(html), 'Weekdays and weekends even');
});

test('1 January with December in the archive: the Consistency card shows the last 30 days, not 0', async () => {
  // the 2029 sheet starts on Monday 1 January; Dec 2-31 live in "Archive 2028"
  state.monthGrids = buildYear(2029);
  state.archives = { 2028: buildArchive(2028,
    [{ slot: 0, name: 'No sugar' }, { slot: 7, name: 'Exercise' }, { slot: 8, name: 'Read' }],
    (d, slot) => d >= at(2028, 10, 1) &&
      (slot === 7 || (slot === 8 && d.getDay() !== 0 && d.getDay() !== 6))) };

  const html = await renderInsights('2029-01-01');
  assert.equal(gauge(html), '83');     // (20 weekdays x 100% + 10 weekend days x 50%) / 30
  assert.equal(weekdays(html), '100%');
  assert.equal(weekends(html), '50%');
  assert.equal(dipLift(html), 'Weekend dip · 50 pts');
  // no January point yet, so the curve is the year before: from November,
  // the first tick
  assert.deepEqual(curveMonths(html), ['Nov', 'Dec']);
  assert.equal(headline(html), '83');
});

test('the AVG line on Power days is rolling.good', async () => {
  state.monthGrids = year2026(); state.archives = {};
  for (const date of ['2026-09-15', '2026-10-11']) {
    const S = await stats(date);
    const html = await renderInsights(date);
    assert.equal(powerAvg(html), String(S.rolling.good), date);
    assert.equal(gauge(html), String(S.rolling.good), date);
    assert.equal(weekdays(html), S.weekdayAvg + '%', date);
    assert.equal(weekends(html), S.weekendAvg + '%', date);
  }
});

test('under a week of data the card, the AVG lines and the headline show "–"', async () => {
  const grids = buildYear(2026);
  tickDays(grids, at(2026, 9, 5), at(2026, 9, 10), () => [EXERCISE, NO_SUGAR]); // Oct 5-10
  state.monthGrids = grids; state.archives = {};

  const html = await renderInsights('2026-10-11');
  assert.equal(gauge(html), '–');
  assert.equal(weekdays(html), '–');
  assert.equal(weekends(html), '–');
  assert.equal(dipLift(html), '–');
  assert.equal(powerAvg(html), null, 'no AVG marker on Power days');
  assert.ok(!card(html, 'Where habits break').includes('>AVG<'), 'no AVG line on Where habits break');
  assert.ok(!card(html, 'Consistency').includes('<circle'), 'no arc tip');
  assert.equal(headline(html), '–');
  assert.deepEqual(curveMonths(html), []);
});
