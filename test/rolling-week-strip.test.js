// The week strip as a rolling window (feature/rolling-week-strip).
//
// The strip shows today and three days either side, wherever those days
// live in the sheet, with a divider and ISO week label before the Monday.
// A window that reaches over a Sunday-Monday boundary can take its cards
// from two month tabs (the sheet gives every Monday-Sunday week to the
// month of its Thursday), and a tick sends the card's date so toggle-habit
// finds the right tab and row itself.
//
// Server side: get-habits and toggle-habit over fake in-memory sheets
// (helpers.js), with googleapis faked and writes captured, never sent.
// Client side: the strip functions are taken out of index.html as shipped
// and run in a vm sandbox, so the tests read the markup the app draws and
// tap its chips. Nothing touches the network or the real sheet.
//
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { isoWeek, tabOf } = require('../api/_week');
const V = require('../api/_validate');
const CP = require('../api/_controlPanel');
const { at, buildYear, setTick, buildArchive,
        makeCpRows, buildFocusGrid, fakeRes, withFakeGoogleapis } = require('./helpers');

const MONTHS = V.MONTHS;
const EXERCISE = 9; // month-tab column index of makeCpRows()'s first good habit (sheet column J)

// ── ISO week numbers ───────────────────────────────────────

test('isoWeek around new year: Dec 29 2025 is W01 of 2026, Jan 1 2027 is W53 of 2026', () => {
  const cases = [
    [at(2025, 11, 28), 52], // Sun: last day of 2025's week 52
    [at(2025, 11, 29), 1],  // Mon: 2026's week 1 holds Thu Jan 1 2026
    [at(2026, 0, 1), 1],
    [at(2026, 0, 4), 1],    // Sun: still week 1
    [at(2026, 0, 5), 2],
    [at(2026, 9, 19), 43],
    [at(2026, 11, 28), 53], // 2026 starts on a Thursday, so it has 53 weeks
    [at(2027, 0, 1), 53],
    [at(2027, 0, 3), 53],
    [at(2027, 0, 4), 1],
    [at(2029, 11, 31), 1]   // Mon Dec 31 2029 is in 2030's week 1
  ];
  cases.forEach(([date, week]) => assert.equal(isoWeek(date), week, date.toDateString()));
});

test('tabOf follows the Thursday: Sep 26-27 2026 in September, Sep 28-30 in October', () => {
  assert.equal(MONTHS[tabOf(at(2026, 8, 26))], 'September');
  assert.equal(MONTHS[tabOf(at(2026, 8, 27))], 'September');
  assert.equal(MONTHS[tabOf(at(2026, 8, 28))], 'October');
  assert.equal(MONTHS[tabOf(at(2026, 8, 30))], 'October');
  assert.equal(MONTHS[tabOf(at(2029, 8, 30))], 'September'); // a Sunday: its Thursday is Sep 27
  assert.equal(MONTHS[tabOf(at(2027, 0, 2))], 'December');   // 1-3 Jan 2027 are the 2026 December tab
  assert.equal(MONTHS[tabOf(at(2025, 11, 29))], 'January');  // 29-31 Dec 2025 are the 2026 January tab
});

// ── the endpoints, with googleapis faked ───────────────────

const state = { grids: null, archives: {}, updates: [] };

function reset(grids, archives) {
  state.grids = grids;
  state.archives = archives || {};
  state.updates = [];
}

function serveRange(range) {
  const m = /^'([^']+)'!/.exec(range);
  const tab = m ? m[1] : '';
  const mi = MONTHS.indexOf(tab);
  if (mi !== -1) return { values: state.grids[mi] };
  const am = /^Archive (\d{4})$/.exec(tab);
  if (am && state.archives[am[1]]) return { values: state.archives[am[1]] };
  if (range === CP.HABITS_RANGE) return { values: makeCpRows() };
  if (range === CP.FOCUS_SEARCH_RANGE) return { values: buildFocusGrid() };
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
        get: async ({ range }) => ({ data: serveRange(range) }),
        // captured, never sent; applied to the in-memory grid so the next
        // get-habits sees it
        update: async args => {
          state.updates.push(args);
          const [, tab, col, row] = /^'([^']+)'!([A-P])(\d+)$/.exec(args.range);
          const grid = state.grids[MONTHS.indexOf(tab)];
          grid[row - 1][col.charCodeAt(0) - 65] = args.requestBody.values[0][0];
          return {};
        }
      }
    }
  })
};

const { getHabits, toggleHabit } = withFakeGoogleapis(fakeGoogle, () => ({
  getHabits: require('../api/get-habits'),
  toggleHabit: require('../api/toggle-habit')
}));

process.env.GOOGLE_SERVICE_ACCOUNT = '{"type":"service_account"}';
process.env.GOOGLE_SHEET_ID = 'fake-sheet-for-tests';
delete process.env.CUSTOMERS_SHEET_ID; // single-user mode: no Customers lookup

async function strip(today) {
  const res = fakeRes();
  await getHabits({ method: 'GET', query: { date: today } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.error && !res.body.outOfYear, 'get-habits: ' + JSON.stringify(res.body).slice(0, 200));
  return res.body;
}

async function toggle(today, body) {
  const res = fakeRes();
  await toggleHabit({ method: 'POST', query: { date: today }, body }, res);
  return res;
}

const isos = body => body.week.map(w => w.iso);
const dayNames = body => body.week.map(w => w.day.slice(0, 3));

// ── the strip as index.html draws it ───────────────────────

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// A top-level function of the page's script, as shipped. The script keeps
// a fixed layout: functions open at four spaces and close at "    }".
function pageFunction(name) {
  const m = new RegExp('\\n    (?:async )?function ' + name + '\\([\\s\\S]*?\\n    \\}').exec(HTML);
  assert.ok(m, name + ' not found in index.html');
  return m[0];
}

// One CSS rule's declarations from the page's <style>.
function cssRule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('\\n\\s*' + esc + '\\s*\\{([^}]*)\\}').exec(HTML);
  assert.ok(m, selector + ' rule not found in index.html');
  return m[1].replace(/\s+/g, ' ');
}

// Draws the strip for one get-habits payload and returns the markup split
// into the strip's own children (cards and the divider), plus tap(), which
// taps a chip the way a finger would: the page's handleHabitTap posts to
// the real toggle-habit over the fake sheet.
function drawStrip(body, today) {
  const grid = {
    innerHTML: '', parentElement: {},
    querySelector: () => null, querySelectorAll: () => []
  };
  const posts = [];
  const g = {
    HT: { pendingWrites: 0 },
    document: { getElementById: id => (id === 'calendar-grid' ? grid : null) },
    setTimeout() {},
    alert: msg => { throw new Error('alert: ' + msg); },
    loadApp() {},
    friendlyError: () => 'error',
    escapeHtml: v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    postJson: async (p, payload) => {
      assert.equal(p, '/api/toggle-habit');
      posts.push(payload);
      const res = await toggle(today, payload);
      return { res: { ok: res.statusCode === 200, status: res.statusCode }, data: res.body };
    }
  };
  vm.createContext(g);
  vm.runInContext('var calendarCenteredOn = "";\n' +
    ['setHTML', 'dayNumber', 'chipHTML', 'weekDividerHTML', 'renderCalendar', 'paintChip', 'handleHabitTap']
      .map(pageFunction).join('\n'), g, { filename: 'index.html' });

  g.renderCalendar(body);
  const html = grid.innerHTML;
  const items = html.split(/(?=<div class="(?:day-card|week-divider)[" ])/);

  return {
    html,
    items,
    // "Fri", "Mon*" (today), "|W43" (the divider)
    layout: items.map(it => {
      if (it.startsWith('<div class="week-divider"')) return '|' + (/>(W\d+)</.exec(it) || [])[1];
      const day = (/>(Mon|Tue|Wed|Thu|Fri|Sat|Sun)</.exec(it) || [])[1];
      return day + (it.startsWith('<div class="day-card today"') ? '*' : '');
    }),
    posts,
    async tap(iso, col) {
      const m = new RegExp('<button[^>]*data-date="' + iso + '" data-col="' + col +
        '" data-checked="(true|false)" data-type="(bad|good)"').exec(html);
      assert.ok(m, 'no chip for ' + iso + ' col ' + col);
      const chip = {
        dataset: { date: iso, col: String(col), checked: m[1], type: m[2] },
        classList: { toggle() {} }, setAttribute() {}, querySelector: () => ({})
      };
      await g.handleHabitTap({ currentTarget: chip });
    }
  };
}

const DIVIDER_RE = n => new RegExp('^<div class="week-divider"[^>]*><span[^>]*>' + n + '</span></div>$');

// ── today is a Monday ──────────────────────────────────────

test('Monday 2026-10-19: Fri-Thu, today in the middle, Sunday is in the strip', async () => {
  reset(buildYear(2026));
  const body = await strip('2026-10-19');

  // three days either side of Monday is Friday .. Thursday
  assert.deepEqual(isos(body), ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19',
                                '2026-10-20', '2026-10-21', '2026-10-22']);
  assert.deepEqual(dayNames(body), ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']);
  assert.deepEqual(body.week.map(w => w.isToday), [false, false, false, true, false, false, false]);
  // Sunday is week 3 of the October tab, Monday starts week 4
  assert.deepEqual(body.week.map(w => w.row), [24, 25, 26, 29, 30, 31, 32]);
  assert.ok(body.week.every(w => w.sheetName === 'October'));
  assert.deepEqual(body.week.map(w => w.isoWeek), [null, null, null, 43, null, null, null]);

  // the week numbers still count Monday-Sunday
  assert.equal(body.weekStart, 'Oct 19, 2026');
});

test('Monday 2026-10-19: the divider sits between Sun and Mon, directly left of today, W43 centred on the line', async () => {
  reset(buildYear(2026));
  const s = drawStrip(await strip('2026-10-19'), '2026-10-19');

  assert.deepEqual(s.layout, ['Fri', 'Sat', 'Sun', '|W43', 'Mon*', 'Tue', 'Wed', 'Thu']);
  assert.equal(s.items.filter(it => it.startsWith('<div class="week-divider"')).length, 1);

  // nothing between Sunday and the divider, or between the divider and the
  // today card: the divider is exactly the line and its label, and the next
  // sibling is the today card
  const at3 = s.items[3];
  assert.match(at3, DIVIDER_RE('W43'));
  assert.ok(s.items[4].startsWith('<div class="day-card today"'));
  assert.ok(s.html.includes(at3 + '<div class="day-card today">'));
  assert.match(s.items[2], />Sun</);

  // the label is a child of the line, and the CSS centres it on the line's
  // top end; the line itself is a flex item like the cards
  const line = cssRule('.week-divider');
  const label = cssRule('.week-divider span');
  assert.match(line, /position: relative/);
  assert.match(line, /flex: none/);
  assert.match(line, /align-self: stretch/);
  assert.match(line, /width: 3px/);
  assert.match(line, /border-radius: 3px/);
  assert.match(line, /background: var\(--accent\)/);
  assert.match(label, /position: absolute/);
  assert.match(label, /top: 0/);
  assert.match(label, /left: 50%/);
  assert.match(label, /transform: translate\(-50%, -50%\)/);
  assert.match(label, /font-size: 9px/);
  assert.match(label, /font-weight: 800/);
  assert.match(label, /letter-spacing: \.12em/);
  assert.match(label, /text-transform: uppercase/);
  assert.match(label, /color: var\(--accent\)/);
  assert.match(label, /background: var\(--bg-page\)/);
  assert.match(label, /padding: 0 4px/);

  // one flex row on every screen size, so the divider gets the card gap on
  // both sides (the old 7-column desktop grid would have no room for it)
  const gridTag = /<div id="calendar-grid" class="([^"]*)"/.exec(HTML)[1].split(' ');
  assert.ok(gridTag.includes('flex') && gridTag.includes('gap-2.5'));
  assert.ok(!gridTag.some(c => c.startsWith('md:grid')), 'calendar-grid must stay a flex row');
});

test('Monday 2026-10-19: ticking Sunday writes October row 26; a future day stays tickable', async () => {
  reset(buildYear(2026));
  const s = drawStrip(await strip('2026-10-19'), '2026-10-19');

  await s.tap('2026-10-18', EXERCISE + 1);
  assert.equal(JSON.stringify(s.posts[0]), '{"date":"2026-10-18","col":10}'); // made in the sandbox's realm
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].range, "'October'!J26");
  assert.deepEqual(state.updates[0].requestBody.values, [[true]]);

  // future days keep today's rule: they can be ticked
  await s.tap('2026-10-22', EXERCISE + 1);
  assert.equal(state.updates[1].range, "'October'!J32");

  // and the Sunday tick is what the strip shows on the next load
  const sunday = (await strip('2026-10-19')).week[2];
  assert.equal(sunday.good.find(h => h.name === 'Exercise').checked, true);
});

// ── today is a Thursday ────────────────────────────────────

test('Thursday 2026-10-22: Mon-Sun, divider at the left edge before Monday', async () => {
  reset(buildYear(2026));
  const body = await strip('2026-10-22');
  assert.deepEqual(dayNames(body), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.equal(body.week[0].iso, '2026-10-19');
  assert.equal(body.week[3].isToday, true);
  assert.deepEqual(body.week.map(w => w.isoWeek), [43, null, null, null, null, null, null]);

  const s = drawStrip(body, '2026-10-22');
  assert.deepEqual(s.layout, ['|W43', 'Mon', 'Tue', 'Wed', 'Thu*', 'Fri', 'Sat', 'Sun']);
  assert.match(s.items[0], DIVIDER_RE('W43'));
});

// ── a window over two month tabs ───────────────────────────

test('Tuesday 2029-10-02: Sep 29-30 come from the September tab, Oct 1-5 from October', async () => {
  // Sep 30 2029 is a Sunday, so its week (Thursday Sep 27) is September's
  // week 4 and Monday Oct 1 starts the October tab
  const grids = buildYear(2029);
  setTick(grids, 2029, 8, 30, EXERCISE);
  reset(grids);

  const body = await strip('2029-10-02');
  assert.deepEqual(isos(body), ['2029-09-29', '2029-09-30', '2029-10-01', '2029-10-02',
                                '2029-10-03', '2029-10-04', '2029-10-05']);
  assert.deepEqual(body.week.map(w => w.sheetName),
    ['September', 'September', 'October', 'October', 'October', 'October', 'October']);
  assert.deepEqual(body.week.map(w => w.row), [34, 35, 2, 3, 4, 5, 6]);
  assert.deepEqual(body.week.map(w => w.isoWeek), [null, null, 40, null, null, null, null]);
  // the Sep 30 card reads the September tab
  assert.equal(body.week[1].good.find(h => h.name === 'Exercise').checked, true);
  assert.equal(body.week[2].good.find(h => h.name === 'Exercise').checked, false);

  const s = drawStrip(body, '2029-10-02');
  assert.deepEqual(s.layout, ['Sat', 'Sun', '|W40', 'Mon', 'Tue*', 'Wed', 'Thu', 'Fri']);

  // ticking Sep 30 writes to the September tab (and unticks it there)
  await s.tap('2029-09-30', EXERCISE + 1);
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].range, "'September'!J35");
  assert.deepEqual(state.updates[0].requestBody.values, [[false]]);
});

test('Tuesday 2026-09-29 (the live year): Sep 26-27 from September, Sep 28 on from October', async () => {
  reset(buildYear(2026));
  const body = await strip('2026-09-29');
  assert.deepEqual(body.week.map(w => w.sheetName + ' ' + w.row),
    ['September 34', 'September 35', 'October 2', 'October 3', 'October 4', 'October 5', 'October 6']);
  assert.equal(body.week[2].isoWeek, 40);

  const s = drawStrip(body, '2026-09-29');
  await s.tap('2026-09-27', EXERCISE + 1);
  await s.tap('2026-09-30', EXERCISE + 1);
  assert.deepEqual(state.updates.map(u => u.range), ["'September'!J35", "'October'!J4"]);
});

// ── the ends of the sheet year ─────────────────────────────

test('2025-12-30 on the 2026 sheet: no cards before Dec 29, archive days stay out', async () => {
  const archive = buildArchive(2025, [{ slot: 7, name: 'Exercise' }], () => true);
  reset(buildYear(2026), { 2025: archive });

  const body = await strip('2025-12-30');
  // Dec 27-28 are in Archive 2025, read-only: the window starts on the
  // sheet's first day
  assert.deepEqual(isos(body), ['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  assert.ok(body.week.every(w => w.sheetName === 'January'));
  assert.equal(body.week[1].isToday, true);
  assert.equal(body.week[0].isoWeek, 1);

  const s = drawStrip(body, '2025-12-30');
  assert.deepEqual(s.layout, ['|W01', 'Mon', 'Tue*', 'Wed', 'Thu', 'Fri']);

  // and a tick for an archive day is refused, nothing written
  const res = await toggle('2025-12-30', { date: '2025-12-28', col: 10 });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
  assert.equal(state.updates.length, 0);
});

test('2025-12-29, the sheet\'s first day: today is the first card', async () => {
  reset(buildYear(2026));
  const body = await strip('2025-12-29');
  assert.deepEqual(isos(body), ['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01']);
  assert.equal(body.week[0].isToday, true);
});

test('2027-01-03, the sheet\'s last day: the window stops at the sheet, no divider', async () => {
  reset(buildYear(2026));
  const body = await strip('2027-01-03');
  assert.deepEqual(isos(body), ['2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  assert.ok(body.week.every(w => w.sheetName === 'December'));
  assert.equal(body.week[3].isToday, true);
  assert.deepEqual(drawStrip(body, '2027-01-03').layout, ['Thu', 'Fri', 'Sat', 'Sun*']);
});

// ── toggle-habit input ─────────────────────────────────────

test('toggle-habit refuses a malformed date without reading the sheet', async () => {
  reset(buildYear(2026));
  for (const date of ['2026-02-31', '19.10.2026', '']) {
    const res = await toggle('2026-10-19', { date, col: 10 });
    assert.equal(res.statusCode, 400, date);
    assert.equal(res.body.error, 'Invalid date');
  }
  assert.equal(state.updates.length, 0);
});
