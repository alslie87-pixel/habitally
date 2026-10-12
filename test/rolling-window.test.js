// The trend numbers read the last 30 days up to yesterday (fix/rolling-30-day-trends).
//
// "Now" is day -30..-1, "before" day -60..-31, both taken from the one
// timeline (_timeline.js rollingWindows), so they roll over month and year
// ends. Today never counts. A window with fewer than 7 days of data — days
// from the first tick on — is null, and so is any delta built on it.
//
// No Google API is touched: googleapis is replaced with a fake that serves
// in-memory sheets, and a write fails the test.
//
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');

const TL = require('../api/_timeline');
const V = require('../api/_validate');
const CP = require('../api/_controlPanel');
const { at, addDays, buildYear, setTick, buildArchive,
        makeCpRows, buildFocusGrid, fakeRes, withFakeGoogleapis } = require('./helpers');

const MONTHS = V.MONTHS;

// month-tab columns of makeCpRows(): No sugar (bad), Exercise + Read (good)
const NO_SUGAR = 2, EXERCISE = 9, READ = 10;

// ── the endpoints, with googleapis faked ───────────────────

const state = { monthGrids: null, cpRows: null, focusGrid: null, archives: {}, tabs: [] };

function reset(opts) {
  state.monthGrids = opts.grids;
  state.cpRows = makeCpRows();
  state.focusGrid = buildFocusGrid();
  state.archives = opts.archives || {}; // { '2026': rows }
  state.tabs = MONTHS.concat(['⚙️ Control Panel'], Object.keys(state.archives).map(y => 'Archive ' + y));
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
        update: async () => { throw new Error('nothing in these tests may write'); }
      }
    }
  })
};

const { getHabits, getStats } = withFakeGoogleapis(fakeGoogle, () => ({
  getHabits: require('../api/get-habits'),
  getStats: require('../api/get-stats')
}));

process.env.GOOGLE_SERVICE_ACCOUNT = '{"type":"service_account"}';
process.env.GOOGLE_SHEET_ID = 'fake-sheet-for-tests';
delete process.env.CUSTOMERS_SHEET_ID;

async function call(handler, dateStr) {
  const res = fakeRes();
  await handler({ method: 'GET', query: { date: dateStr } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.error, 'error: ' + res.body.error);
  assert.ok(!res.body.outOfYear, 'unexpected year lock');
  return res.body;
}

// Everything the 30-day rule decides, per endpoint.
const trendOf = S => ({
  momentum: S.momentum.map(m => ({ name: m.name, now: m.now, delta: m.delta })),
  rolling: S.rolling,
  consistency: S.consistency,
  weekdayAvg: S.weekdayAvg,
  weekendAvg: S.weekendAvg,
  weekendGap: S.weekendGap,
  weekday: S.weekday,
  matrix: S.matrix,
  vsBest: S.vsBest
});
const habitPctOf = H => ({
  goodHabitStats: H.goodHabitStats,
  badHabitStats: H.badHabitStats,
  worst: H.worst,
  best: H.best
});
const byName = (list, name) => list.find(x => x.name === name);

// Ticks every date from..to with the columns cols(date) returns.
function tickDays(grids, from, to, cols) {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    cols(d).forEach(c => setTick(grids, d.getFullYear(), d.getMonth(), d.getDate(), c));
  }
}

// The sheet's own month bar (row 47, good % in column M) for one tab.
function setBar(grids, monthIdx, good) {
  grids[monthIdx][46] = [];
  grids[monthIdx][46][12] = good;
}

const wd = d => (d.getDay() + 6) % 7; // 0 = Monday .. 6 = Sunday
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SAT = 5, SUN = 6;

// Weekly patterns. Monday, Wednesday and Saturday tick the same way in both
// (per habit), so the windows of Sep 30 and Oct 1 — which swap a Monday for
// a Wednesday, and a Saturday for a Monday — hold exactly the same numbers.
//   August:    Exercise Mon/Wed/Sat · Read never · No sugar Mon/Wed/Sat/Sun
//   September: Exercise Mon/Wed/Fri/Sat · Read Tue/Thu/Fri/Sun ·
//              No sugar every day but Tue/Fri
const augustCols = d => {
  const w = wd(d), out = [];
  if ([MON, WED, SAT].includes(w)) out.push(EXERCISE);
  if ([MON, WED, SAT, SUN].includes(w)) out.push(NO_SUGAR);
  return out;
};
const septemberCols = d => {
  const w = wd(d), out = [];
  if ([MON, WED, FRI, SAT].includes(w)) out.push(EXERCISE);
  if ([TUE, THU, FRI, SUN].includes(w)) out.push(READ);
  if (![TUE, FRI].includes(w)) out.push(NO_SUGAR);
  return out;
};

// June with both good habits every day, Jul 1 - Aug 31 in the August
// pattern, Sep 1 - `to` in the September pattern. The month curve from the
// timeline: June 100, July 21, August 23, September 57 (mean daily good-%).
function steadyYear(to) {
  const grids = buildYear(2026);
  tickDays(grids, at(2026, 5, 1), at(2026, 5, 30), () => [EXERCISE, READ]);
  tickDays(grids, at(2026, 6, 1), at(2026, 7, 31), augustCols);
  tickDays(grids, at(2026, 8, 1), to, septemberCols);
  return grids;
}
// monthGood is the curve's 12-month window, [{ y, m, good }] oldest first.
// drawn: the values that make a point; span: the window as 'YYYY-MM'.
const drawn = monthGood => monthGood.filter(p => p.good !== null).map(p => p.good);
const ym = p => p.y + '-' + String(p.m + 1).padStart(2, '0');
const span = monthGood => ym(monthGood[0]) + '..' + ym(monthGood[monthGood.length - 1]);

// ── the windows themselves ─────────────────────────────────

test('the windows are day -30..-1 and day -60..-31', () => {
  const grids = buildYear(2026);
  tickDays(grids, at(2026, 0, 1), at(2026, 9, 11), () => [EXERCISE]);
  const tl = TL.buildTimeline(grids, CP.readSlots(makeCpRows()), [], at(2026, 9, 11));
  const win = TL.rollingWindows(tl, at(2026, 9, 11));
  assert.equal(win.now.length, 30);
  assert.equal(win.now[0].iso, '2026-09-11');
  assert.equal(win.now[29].iso, '2026-10-10'); // yesterday; today is left out
  assert.equal(win.prev.length, 30);
  assert.equal(win.prev[0].iso, '2026-08-12');
  assert.equal(win.prev[29].iso, '2026-09-10');
});

// ── 1. the 1st of the month ────────────────────────────────

test('on the 1st with today unticked the numbers equal the last day of the month before', async () => {
  reset({ grids: steadyYear(at(2026, 8, 30)) }); // Oct 1 itself: nothing ticked
  const sep30 = await call(getStats, '2026-09-30');
  const oct1 = await call(getStats, '2026-10-01');
  assert.deepEqual(trendOf(oct1), trendOf(sep30));

  // and they are the real numbers, not a fresh month starting from zero:
  // Sep 1-30 against Aug 2-31
  assert.deepEqual(trendOf(oct1).momentum, [
    { name: 'No sugar', now: 70, delta: 10 },  // 21/30 against 18/30
    { name: 'Exercise', now: 57, delta: 13 },  // 17/30 against 13/30
    { name: 'Read',     now: 57, delta: 57 }   // 17/30 against 0/30
  ]);
  assert.deepEqual(oct1.rolling, { good: 57, prevGood: 22, days: 30 });
  assert.equal(oct1.consistency, 13);          // the four Fridays are the only >=66% days
  assert.equal(oct1.weekdayAvg, 59);           // (18 x 50% + 4 Fridays x 100%) / 22
  assert.equal(oct1.weekendAvg, 50);
  assert.equal(oct1.vsBest, 57 - 100);         // against June, the best completed month

  // the curve has no October point yet, so it ends on September on both days
  assert.equal(span(oct1.monthGood), '2025-10..2026-09');
  assert.deepEqual(drawn(oct1.monthGood), [100, 21, 23, 57]);
  assert.deepEqual(drawn(sep30.monthGood), [100, 21, 23, 57]);

  const habitsSep30 = await call(getHabits, '2026-09-30');
  const habitsOct1 = await call(getHabits, '2026-10-01');
  assert.deepEqual(habitPctOf(habitsOct1), habitPctOf(habitsSep30));
  assert.deepEqual(habitsOct1.goodHabitStats, [{ name: 'Exercise', percent: 57 }, { name: 'Read', percent: 57 }]);
  assert.deepEqual(habitsOct1.worst, { name: 'No sugar', percent: 70 });
});

// ── 2. today never counts ──────────────────────────────────

test('ticking today changes none of the 30-day numbers', async () => {
  const grids = steadyYear(at(2026, 9, 10));
  reset({ grids });
  const before = await call(getStats, '2026-10-11');
  const habitsBefore = await call(getHabits, '2026-10-11');

  [NO_SUGAR, EXERCISE, READ].forEach(c => setTick(grids, 2026, 9, 11, c));
  const after = await call(getStats, '2026-10-11');
  const habitsAfter = await call(getHabits, '2026-10-11');

  // the ticks did land: the numbers that include today moved
  assert.equal(after.checksYTD, before.checksYTD + 3);
  assert.ok(habitsAfter.percent > habitsBefore.percent, 'the live week counts today');

  assert.deepEqual(trendOf(after), trendOf(before));
  assert.deepEqual(after.monthGood, before.monthGood); // the curve stops at yesterday too
  assert.deepEqual(habitPctOf(habitsAfter), habitPctOf(habitsBefore));
});

test('vs best month: the best completed month of the curve, never the running one', async () => {
  // Aug-Sep in the September pattern (56%, 57%), Oct 1-10 every habit
  // (100%). The sheet's own row-47 bar says 99% for September; the curve
  // and vs best month no longer read it.
  const grids = buildYear(2026);
  tickDays(grids, at(2026, 7, 1), at(2026, 8, 30), septemberCols);
  tickDays(grids, at(2026, 9, 1), at(2026, 9, 10), () => [NO_SUGAR, EXERCISE, READ]);
  setBar(grids, 8, 0.99);
  reset({ grids });

  const S = await call(getStats, '2026-10-11');
  assert.deepEqual(drawn(S.monthGood), [56, 57, 100]); // Aug, Sep, Oct so far
  assert.equal(S.rolling.good, 72);                    // Sep 11 - Oct 10
  assert.equal(S.vsBest, 72 - 57);                     // September: not October, not row 47
});

// ── the month curve and the Consistency card ───────────────

test('the month curve leaves the running month out until it has 7 days of data', async () => {
  // steadyYear through September, then every habit Oct 1-7 (100%). The
  // row-47 bars say 11% and 99%; the curve comes from the timeline.
  const grids = steadyYear(at(2026, 8, 30));
  tickDays(grids, at(2026, 9, 1), at(2026, 9, 7), () => [NO_SUGAR, EXERCISE, READ]);
  setBar(grids, 8, 0.11);
  setBar(grids, 9, 0.99);
  reset({ grids });

  for (const date of ['2026-10-01', '2026-10-07']) { // 0 and 6 days of October
    const S = await call(getStats, date);
    assert.equal(S.monthGood.length, 12, date);
    assert.equal(span(S.monthGood), '2025-10..2026-09', date); // ends on September
    assert.deepEqual(drawn(S.monthGood), [100, 21, 23, 57], date); // nothing before the first tick
  }

  const oct8 = await call(getStats, '2026-10-08'); // Oct 1-7: a week of data
  assert.equal(span(oct8.monthGood), '2025-11..2026-10');
  assert.deepEqual(oct8.monthGood[11], { y: 2026, m: 9, good: 100 });
  assert.deepEqual(drawn(oct8.monthGood), [100, 21, 23, 57, 100]);
});

test('in January the curve is last year out of the archive: Jan-Dec on the 5th, Feb-Jan from the 8th', async () => {
  // "Archive 2026": Exercise every day from 1 January 2026, Read on every
  // day of February, April ... December, so the months alternate 50% and
  // 100%. The live 2027 sheet starts on Jan 4: Exercise Jan 4-7.
  const archive = buildArchive(2026,
    [{ slot: 0, name: 'No sugar' }, { slot: 7, name: 'Exercise' }, { slot: 8, name: 'Read' }],
    (d, slot) => d >= at(2026, 0, 1) &&
      (slot === 7 || (slot === 8 && d.getFullYear() === 2026 && d.getMonth() % 2 === 1)));
  const grids = buildYear(2027);
  tickDays(grids, at(2027, 0, 4), at(2027, 0, 7), () => [EXERCISE]);
  reset({ grids, archives: { 2026: archive } });

  const jan5 = await call(getStats, '2027-01-05'); // January has Jan 1-4: four days
  assert.equal(span(jan5.monthGood), '2026-01..2026-12');
  assert.deepEqual(drawn(jan5.monthGood), [50, 100, 50, 100, 50, 100, 50, 100, 50, 100, 50, 100]);
  // the sparklines take the same months
  assert.deepEqual(byName(jan5.momentum, 'Read').series, [0, 100, 0, 100, 0, 100, 0, 100, 0, 100, 0, 100]);
  // and January has a best month to beat: December, 100
  assert.equal(jan5.vsBest, jan5.rolling.good - 100);

  const jan8 = await call(getStats, '2027-01-08'); // Jan 1-7: a week, 1-3 out of the archive
  assert.equal(span(jan8.monthGood), '2026-02..2027-01');
  assert.deepEqual(drawn(jan8.monthGood), [100, 50, 100, 50, 100, 50, 100, 50, 100, 50, 100, 50]);
  assert.deepEqual(byName(jan8.momentum, 'Read').series, [100, 0, 100, 0, 100, 0, 100, 0, 100, 0, 100, 0]);
});

test('the habit sparklines follow the curve: no point for the running month on the 1st, one on the 8th', async () => {
  // steadyYear through September (Read: June every day, July-August never,
  // September 17 of 30 days), every habit Oct 1-7, and Exercise only on
  // Oct 8: that day is today, so it must not pull Read's October down.
  const grids = steadyYear(at(2026, 8, 30));
  tickDays(grids, at(2026, 9, 1), at(2026, 9, 7), () => [NO_SUGAR, EXERCISE, READ]);
  setTick(grids, 2026, 9, 8, EXERCISE);
  reset({ grids });

  const oct1 = await call(getStats, '2026-10-01');
  const oct8 = await call(getStats, '2026-10-08');
  for (const S of [oct1, oct8]) {
    S.momentum.forEach(h => {
      // the curve's window, null exactly where the curve has no point
      assert.deepEqual(h.series.map(v => v === null), S.monthGood.map(p => p.good === null), h.name);
    });
  }
  const readOf = S => byName(S.momentum, 'Read').series.filter(v => v !== null);
  assert.deepEqual(readOf(oct1), [100, 0, 0, 57]);        // Jun..Sep, no October yet
  assert.deepEqual(readOf(oct8), [100, 0, 0, 57, 100]);   // October = Oct 1-7, today left out
});

test('rolling.good is the mean of dayPercent over the window; the bars split the same days', async () => {
  const grids = steadyYear(at(2026, 9, 10));
  reset({ grids });
  const S = await call(getStats, '2026-10-11');

  // the same numbers straight from the timeline: Sep 11 - Oct 10
  const tl = TL.buildTimeline(grids, CP.readSlots(makeCpRows()), [], at(2026, 9, 11));
  const days = TL.rollingWindows(tl, at(2026, 9, 11)).now;
  const mean = ds => Math.round(ds.reduce((s, d) => s + TL.dayPercent(d), 0) / ds.length * 100);
  const weekend = d => d.date.getDay() === 0 || d.date.getDay() === 6;
  assert.equal(S.rolling.good, mean(days));
  assert.equal(S.weekdayAvg, mean(days.filter(d => !weekend(d))));
  assert.equal(S.weekendAvg, mean(days.filter(weekend)));

  // (25 x 50% + 5 Fridays x 100%) / 30; weekdays (16 x 50% + 5 x 100%) / 21
  assert.equal(S.rolling.good, 58);
  assert.equal(S.weekdayAvg, 62);
  assert.equal(S.weekendAvg, 50);
  assert.equal(S.weekendGap, -12);
});

test('1 January with December in the archive: the Consistency numbers are the last 30 days', async () => {
  // The 2029 sheet starts on Monday 1 January, so that morning the whole
  // window (Dec 2-31) lives in "Archive 2028": Exercise every day from
  // November, Read on weekdays.
  const archive = buildArchive(2028,
    [{ slot: 0, name: 'No sugar' }, { slot: 7, name: 'Exercise' }, { slot: 8, name: 'Read' }],
    (d, slot) => d >= at(2028, 10, 1) &&
      (slot === 7 || (slot === 8 && d.getDay() !== 0 && d.getDay() !== 6)));
  reset({ grids: buildYear(2029), archives: { 2028: archive } });

  const S = await call(getStats, '2029-01-01');
  assert.deepEqual(S.rolling, { good: 83, prevGood: 87, days: 30 }); // (20 x 100% + 10 x 50%) / 30
  assert.equal(S.weekdayAvg, 100);
  assert.equal(S.weekendAvg, 50);
  // the year so far is today alone, unticked: a whole-year card said 0
  assert.deepEqual(S.daily, [{ t: '2029-01-01', p: 0 }]);
  // the curve is 2028 out of the archive, drawn from November (the first
  // tick): Nov (22 x 100% + 8 x 50%) / 30, Dec (21 x 100% + 10 x 50%) / 31
  assert.equal(span(S.monthGood), '2028-01..2028-12');
  assert.deepEqual(drawn(S.monthGood), [87, 84]);
  assert.equal(S.vsBest, 83 - 87);
});

// ── 3. across new year ─────────────────────────────────────

test('in January the windows take their December days from the archive', async () => {
  // Archive 2026: Exercise Nov 1 - Jan 3, Read Dec 1 - Jan 3, No sugar
  // Dec 15 - Jan 3. The live 2027 sheet: Exercise Jan 4-6, No sugar Jan 4-9.
  const archive = buildArchive(2026,
    [{ slot: 0, name: 'No sugar' }, { slot: 7, name: 'Exercise' }, { slot: 8, name: 'Read' }],
    (d, slot) => (slot === 7 && d >= at(2026, 10, 1)) ||
                 (slot === 8 && d >= at(2026, 11, 1)) ||
                 (slot === 0 && d >= at(2026, 11, 15)));
  const grids = buildYear(2027);
  tickDays(grids, at(2027, 0, 4), at(2027, 0, 6), () => [EXERCISE]);
  tickDays(grids, at(2027, 0, 4), at(2027, 0, 9), () => [NO_SUGAR]);

  // Jan 10: now = Dec 11 - Jan 9, before = Nov 11 - Dec 10
  reset({ grids, archives: { 2026: archive } });
  const S = await call(getStats, '2027-01-10');
  assert.deepEqual(trendOf(S).momentum, [
    { name: 'No sugar', now: 87, delta: 87 },  // Dec 15 - Jan 3 (archive) + Jan 4-9 = 26; none before
    { name: 'Exercise', now: 90, delta: -10 }, // Dec 11 - Jan 3 (archive) + Jan 4-6 = 27; all 30 before
    { name: 'Read',     now: 80, delta: 47 }   // Dec 11 - Jan 3 (archive) = 24; Dec 1-10 before
  ]);
  assert.deepEqual(S.rolling, { good: 85, prevGood: 67, days: 30 });

  const H = await call(getHabits, '2027-01-10');
  assert.deepEqual(H.goodHabitStats, [{ name: 'Exercise', percent: 90 }, { name: 'Read', percent: 80 }]);
  assert.deepEqual(H.badHabitStats, [{ name: 'No sugar', percent: 87 }]);

  // without the archive the window holds Jan 4-9 only: too thin
  reset({ grids });
  const bare = await call(getStats, '2027-01-10');
  assert.equal(byName(bare.momentum, 'Exercise').now, null);
  assert.equal(bare.rolling.good, null);
  const bareHabits = await call(getHabits, '2027-01-10');
  assert.equal(byName(bareHabits.goodHabitStats, 'Exercise').percent, null);
});

// ── 4. fewer than 7 days of data ───────────────────────────

test('a new user: the earlier window has no data, so every delta is null', async () => {
  // A fresh copy of the 2026 sheet holds every date of the year, but the
  // customer started on Sep 20. Exercise every day, Read Sep 20-29, No sugar
  // Oct 1-10. The empty days before Sep 20 are not data: the earlier window
  // (Aug 12 - Sep 10) is empty, and "now" is Sep 20 - Oct 10, 21 days.
  const grids = buildYear(2026);
  tickDays(grids, at(2026, 8, 20), at(2026, 9, 10), () => [EXERCISE]);
  tickDays(grids, at(2026, 8, 20), at(2026, 8, 29), () => [READ]);
  tickDays(grids, at(2026, 9, 1), at(2026, 9, 10), () => [NO_SUGAR]);
  reset({ grids });

  const S = await call(getStats, '2026-10-11');
  assert.deepEqual(trendOf(S).momentum, [
    { name: 'No sugar', now: 48, delta: null }, // 10/21
    { name: 'Exercise', now: 100, delta: null }, // 21/21
    { name: 'Read',     now: 48, delta: null }  // 10/21
  ]);
  assert.deepEqual(S.rolling, { good: 74, prevGood: null, days: 30 }); // (10 x 100% + 11 x 50%) / 21
  // the curve starts at September, counted from Sep 20 (10 x 100% + 50%) / 11
  assert.equal(span(S.monthGood), '2025-11..2026-10');
  assert.deepEqual(drawn(S.monthGood), [95, 50]);
  assert.equal(S.vsBest, 74 - 95);

  const H = await call(getHabits, '2026-10-11');
  assert.deepEqual(H.goodHabitStats, [{ name: 'Exercise', percent: 100 }, { name: 'Read', percent: 48 }]);
});

test('six days of data is too thin for any number; seven is enough', async () => {
  const startOn = day => {
    const grids = buildYear(2026);
    tickDays(grids, at(2026, 9, day), at(2026, 9, 10), () => [EXERCISE, NO_SUGAR]);
    reset({ grids });
  };

  startOn(5); // Oct 5-10
  const S = await call(getStats, '2026-10-11');
  S.momentum.forEach(m => {
    assert.equal(m.now, null, m.name);
    assert.equal(m.delta, null, m.name);
  });
  assert.deepEqual(S.rolling, { good: null, prevGood: null, days: 30 });
  assert.equal(S.consistency, null);
  assert.equal(S.weekdayAvg, null);
  assert.equal(S.weekendAvg, null);
  assert.equal(S.weekendGap, null);
  assert.deepEqual(S.weekday, [null, null, null, null, null, null, null]);
  S.matrix.forEach(m => assert.deepEqual(m.days, [null, null, null, null, null, null, null]));
  assert.equal(S.vsBest, null);
  assert.deepEqual(drawn(S.monthGood), []);

  const H = await call(getHabits, '2026-10-11');
  H.goodHabitStats.concat(H.badHabitStats).forEach(h => assert.equal(h.percent, null, h.name));
  assert.equal(H.worst, null);
  assert.equal(H.best, null);

  startOn(4); // Oct 4-10
  const S7 = await call(getStats, '2026-10-11');
  assert.deepEqual(trendOf(S7).momentum, [
    { name: 'No sugar', now: 100, delta: null },
    { name: 'Exercise', now: 100, delta: null },
    { name: 'Read',     now: 0,   delta: null }
  ]);
  assert.equal(S7.rolling.good, 50);
  assert.equal(S7.weekdayAvg, 50);
  assert.equal(S7.weekendAvg, 50);
  assert.deepEqual(drawn(S7.monthGood), [50]);
  const H7 = await call(getHabits, '2026-10-11');
  assert.deepEqual(H7.worst, { name: 'No sugar', percent: 100 });
});
