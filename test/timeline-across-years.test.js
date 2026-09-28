// New year and the one timeline across years (feature/timeline-across-years).
//
// The fake sheets follow the real date rule (helpers.js): the 2026 sheet
// covers 29 Dec 2025 - 3 Jan 2027, the 2027 sheet starts 4 Jan 2027, and
// the 2029 sheet ends 30 Dec 2029. "Archive 2026" carries every day the
// 2026 sheet covered, spillover days included.
//
// No Google API is touched: googleapis is replaced with a fake, writes are
// captured instead of sent, and an unexpected range fails the test.
//
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');

const { sheetEndFromGrids, sheetEndOfYear, week1Monday, outOfYearMessage } = require('../api/_year');
const TL = require('../api/_timeline');
const V = require('../api/_validate');
const CP = require('../api/_controlPanel');
const { at, serialOf, buildYear, setTick, buildArchive,
        makeCpRows, buildFocusGrid, fakeRes, withFakeGoogleapis } = require('./helpers');

const MONTHS = V.MONTHS;

// ── the year gate follows the sheet's dates ────────────────

test('sheetEndFromGrids: the 2026 sheet runs to Jan 3 2027, the 2029 sheet to Dec 30 2029', () => {
  assert.equal(sheetEndFromGrids(buildYear(2026)).getTime(), at(2027, 0, 3).getTime());
  assert.equal(sheetEndFromGrids(buildYear(2029)).getTime(), at(2029, 11, 30).getTime());
});

test('sheetEndOfYear matches the formula-derived coverage', () => {
  assert.equal(sheetEndOfYear(2026).getTime(), at(2027, 0, 3).getTime());
  assert.equal(sheetEndOfYear(2029).getTime(), at(2029, 11, 30).getTime());
  assert.equal(week1Monday(2027, 0).getTime(), at(2027, 0, 4).getTime()); // the 2027 sheet starts Jan 4
});

// ── the endpoints, with googleapis faked ───────────────────

const state = { monthGrids: null, cpRows: null, focusGrid: null, archives: {}, tabs: [], updates: [] };

function reset(opts) {
  state.monthGrids = opts.grids;
  state.cpRows = opts.cpRows || makeCpRows();
  state.focusGrid = opts.focusGrid || buildFocusGrid();
  state.archives = opts.archives || {}; // { '2026': rows }
  state.tabs = MONTHS.concat(['⚙️ Control Panel'], Object.keys(state.archives).map(y => 'Archive ' + y));
  state.updates = [];
}

function serveRange(range) {
  const m = /^'([^']+)'!/.exec(range);
  const tab = m ? m[1] : '';
  const mi = MONTHS.indexOf(tab);
  if (mi !== -1) return { values: state.monthGrids[mi] };
  const am = /^Archive (\d{4})$/.exec(tab);
  if (am && state.archives[am[1]]) return { values: state.archives[am[1]] };
  if (range === CP.HABITS_RANGE) return { values: state.cpRows };
  if (range === CP.FOCUS_SEARCH_RANGE) return { values: state.focusGrid };
  if (range === CP.ONBOARDED_CELL) return { values: [['app-onboarded']] };
  throw new Error('unexpected range in test: ' + range);
}

const fakeGoogle = {
  auth: { GoogleAuth: class { constructor() {} } },
  sheets: () => ({
    spreadsheets: {
      get: async () => ({ data: { sheets: state.tabs.map(t => ({ properties: { title: t } })) } }),
      values: {
        batchGet: async ({ ranges }) => ({ data: { valueRanges: ranges.map(serveRange) } }),
        get: async ({ range }) => ({ data: serveRange(range) }),
        update: async args => { state.updates.push(args); return {}; }
      }
    }
  })
};

const { getHabits, getStats, toggleHabit } = withFakeGoogleapis(fakeGoogle, () => ({
  getHabits: require('../api/get-habits'),
  getStats: require('../api/get-stats'),
  toggleHabit: require('../api/toggle-habit')
}));

process.env.GOOGLE_SERVICE_ACCOUNT = '{"type":"service_account"}';
process.env.GOOGLE_SHEET_ID = 'fake-sheet-for-tests';
delete process.env.CUSTOMERS_SHEET_ID;

async function call(handler, dateStr, body) {
  const res = fakeRes();
  const req = body
    ? { method: 'POST', query: { date: dateStr }, body }
    : { method: 'GET', query: { date: dateStr } };
  await handler(req, res);
  return res;
}

// slots for the archive fixtures, matching makeCpRows(): No sugar (bad,
// slot 0), Exercise + Read (good, slots 7-8)
const ARCHIVE_HABITS = [
  { slot: 0, name: 'No sugar' },
  { slot: 7, name: 'Exercise' },
  { slot: 8, name: 'Read' }
];
const between = (d, from, to) => d >= from && d <= to;

test('2027-01-02 on the 2026 sheet: no lock, the week comes from the December tab', async () => {
  const grids = buildYear(2026);
  // both good habits every day 29 Dec - 1 Jan (the December tab's week 5)
  [[2026, 11, 29], [2026, 11, 30], [2026, 11, 31], [2027, 0, 1]].forEach(([y, m, d]) => {
    setTick(grids, y, m, d, 9);
    setTick(grids, y, m, d, 10);
  });
  reset({ grids });

  const res = await call(getHabits, '2027-01-02');
  assert.equal(res.statusCode, 200);
  const body = res.body;
  assert.ok(!body.outOfYear, '1-3 January must not be locked');
  assert.equal(body.month, 'January');
  assert.equal(body.sheetName, 'December');
  assert.equal(body.weekStart, 'Dec 28, 2026');
  assert.deepEqual(body.week.map(w => w.row), [38, 39, 40, 41, 42, 43, 44]);
  assert.deepEqual(body.week.map(w => w.isToday), [false, false, false, false, false, true, false]);

  // the streak crosses new year even before the rollover
  assert.equal(body.streak, 4);          // Dec 29, 30, 31, Jan 1
  assert.equal(body.goodCount, 4);       // focus X/30, December days included
  assert.equal(body.percent, 67);        // live week: 8 ticks / (2 habits x 6 days)
  assert.deepEqual(body.weeklyTrend, [0, 0, 0, 67]);
});

test('2027-01-04 after rollover: streak, focus and trend read Archive 2026', async () => {
  const from = at(2026, 11, 22), to = at(2027, 0, 3);
  const archive = buildArchive(2026, ARCHIVE_HABITS,
    (d, slot) => (slot === 7 || slot === 8) && between(d, from, to));
  reset({ grids: buildYear(2027), archives: { 2026: archive } });

  const res = await call(getHabits, '2027-01-04');
  assert.equal(res.statusCode, 200);
  const body = res.body;
  assert.ok(!body.outOfYear);
  assert.equal(body.sheetName, 'January');
  assert.equal(body.weekStart, 'Jan 4, 2027');
  assert.equal(body.week[0].isToday, true);

  assert.equal(body.streak, 13);         // Dec 22 - Jan 3, all out of the archive
  assert.equal(body.goodCount, 13);      // focus X/30 counts December
  // the 4-week trend shows the December weeks: quiet, 86%, 100%, then the
  // live week (today only, nothing ticked yet)
  assert.deepEqual(body.weeklyTrend, [0, 86, 100, 0]);
});

test('the January trophy counts 1-3 January out of the archive', async () => {
  const grids = buildYear(2027);
  for (let d = 4; d <= 28; d++) setTick(grids, 2027, 0, d, 2); // No sugar avoided Jan 4-28
  const archive = buildArchive(2026, ARCHIVE_HABITS, (d, slot) =>
    slot === 0 && (between(d, at(2026, 11, 1), at(2026, 11, 31)) || between(d, at(2027, 0, 1), at(2027, 0, 3))));
  reset({ grids, archives: { 2026: archive } });

  // 3 archive days + 25 sheet days = 28 >= the January bar of 27; without
  // the archive days it would be 25 and no trophy
  const habitsRes = await call(getHabits, '2027-01-31');
  assert.equal(habitsRes.statusCode, 200);
  const noSugar = habitsRes.body.trophies.habits.find(h => h.name === 'No sugar');
  assert.equal(noSugar.months[0].ticks, 28);
  assert.equal(noSugar.months[0].won, true);
  assert.deepEqual(habitsRes.body.conqueredThisMonth, ['No sugar']);

  const statsRes = await call(getStats, '2027-01-31');
  assert.equal(statsRes.statusCode, 200);
  const S = statsRes.body;
  assert.equal(S.trophyCase.current.year, 2027);
  assert.deepEqual(S.trophyCase.current.months, [{ name: 'No sugar', m: 0, when: 'Jan' }]);

  // past years are one card per archive, counted per calendar year: the
  // December 2026 month trophy stays in 2026, and the 2025 spillover days
  // in the archive do not become a 2025 card
  assert.equal(S.trophyCase.past.length, 1);
  assert.equal(S.trophyCase.past[0].year, 2026);
  assert.deepEqual(S.trophyCase.past[0].months, [{ name: 'No sugar', m: 11, when: 'Dec' }]);

  // "vs last month" in January is December out of the archive
  const momentum = S.momentum.find(h => h.name === 'No sugar');
  assert.equal(momentum.delta, Math.round((28 / 31 - 1) * 100)); // -10
  assert.equal(momentum.bestStreak, 59); // Dec 1 - Jan 28, across the rollover

  // the heatmap year includes the archived 1-3 January
  assert.equal(S.daily[0].t, '2027-01-01');
});

test('2029-12-31: the 2029 sheet ended Dec 30, so the app locks', async () => {
  reset({ grids: buildYear(2029) });

  for (const handler of [getHabits, getStats]) {
    const res = await call(handler, '2029-12-31');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.outOfYear, true);
    assert.equal(res.body.message, outOfYearMessage());
    assert.match(res.body.message, /Start new year/);
  }

  const res = await call(toggleHabit, '2029-12-31', { sheetName: 'December', row: 30, col: 3 });
  assert.equal(res.statusCode, 409);
  assert.equal(state.updates.length, 0, 'no write on a finished sheet');
});

test('a tick on 1-2 January still lands in the December tab', async () => {
  reset({ grids: buildYear(2026) });
  const res = await call(toggleHabit, '2027-01-02', { sheetName: 'December', row: 42, col: 10 });
  assert.equal(res.statusCode, 200);
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].range, "'December'!J42"); // Fri Jan 1 2027, in week 5
});

test('a renamed habit is a new habit: no streak or count carried over', async () => {
  const cpRows = [];
  for (let i = 0; i < 14; i++) cpRows.push([]);
  cpRows[0] = ['No sugar', 'Active', ''];
  cpRows[7] = ['Run', 'Active', '']; // used to be called Jog

  const grids = buildYear(2027);
  setTick(grids, 2027, 0, 4, 9);
  setTick(grids, 2027, 0, 5, 9);
  const archive = buildArchive(2026, [{ slot: 0, name: 'No sugar' }, { slot: 7, name: 'Jog' }],
    (d, slot) => slot === 7 && between(d, at(2026, 11, 1), at(2027, 0, 3)));
  reset({ grids, cpRows, focusGrid: buildFocusGrid({ good: 'Run', bad: 'No sugar' }), archives: { 2026: archive } });

  const res = await call(getHabits, '2027-01-06');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.streak, 2);     // Jan 4-5; Jog's archived days do not count for Run
  assert.equal(res.body.goodCount, 2);

  const statsRes = await call(getStats, '2027-01-06');
  const run = statsRes.body.momentum.find(h => h.name === 'Run');
  assert.equal(run.bestStreak, 2);      // not Jog's 34-day run
});

// ── PR #27 follow-up fixes ─────────────────────────────────

test('a date in two tabs keeps the most-ticked copy, never a blend', () => {
  const mk = () => { const g = []; for (let r = 0; r < 46; r++) g.push([]); return g; };
  const grids = Array.from({ length: 12 }, mk);
  const date = at(2026, 2, 30);
  grids[2][1][1] = serialOf(date); // the March copy: Exercise only
  grids[2][1][9] = true;
  grids[3][1][1] = serialOf(date); // the April copy: Read + No sugar
  grids[3][1][10] = true;
  grids[3][1][2] = true;

  const slots = CP.readSlots(makeCpRows());
  const tl = TL.buildTimeline(grids, slots, [], at(2026, 3, 10));
  // April's two ticks beat March's one; a blend would show all three
  assert.deepEqual(Array.from(tl.byIso.get('2026-03-30').ticks).sort(),
    ['bad|no sugar', 'good|read']);

  grids[3][1][2] = undefined; // now one tick each: the first copy wins
  const tie = TL.buildTimeline(grids, slots, [], at(2026, 3, 10));
  assert.deepEqual(Array.from(tie.byIso.get('2026-03-30').ticks), ['good|exercise']);
});

test('habits on track leaves today out: 5 of 7 last week counts on Monday', async () => {
  const grids = buildYear(2026);
  [8, 9, 10, 11, 12].forEach(d => setTick(grids, 2026, 5, d, 9)); // Exercise Mon-Fri
  reset({ grids });

  const res = await call(getHabits, '2026-06-15'); // the Monday after
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.habitsOnTrack, 1); // 5/7 = 71%, not 5/8 = 63%
});

test('perfect days and comebacks count the current year; the ever-numbers stay all-time', async () => {
  const grids = buildYear(2027);
  setTick(grids, 2027, 0, 5, 9);  // Jan 5 perfect; Jan 4 missed
  setTick(grids, 2027, 0, 5, 10);
  const missed = at(2026, 11, 15).getTime();
  const archive = buildArchive(2026, ARCHIVE_HABITS, (d, slot) =>
    (slot === 7 || slot === 8) &&
    between(d, at(2026, 11, 1), at(2027, 0, 3)) &&
    d.getTime() !== missed);
  reset({ grids, archives: { 2026: archive } });

  const res = await call(getStats, '2027-01-06');
  assert.equal(res.statusCode, 200);
  const S = res.body;
  // this year: Jan 1-3 (archive) + Jan 5; December's 30 perfect days are 2026's
  assert.equal(S.perfectDays, 4);
  // Jan 5 after the missed Jan 4; Dec 16 after Dec 15 belongs to 2026
  assert.equal(S.comebacks, 1);
  assert.equal(S.checksYTD, 8); // Jan 1-3 and Jan 5, two habits each
  // the ever-numbers still span the years
  assert.equal(S.momentum.find(h => h.name === 'Exercise').bestStreak, 19); // Dec 16 - Jan 3
  assert.equal(S.bestDayEver, 100);
});
