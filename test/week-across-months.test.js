// Week selection across month tabs (fix/week-across-months).
//
// Everything runs against the fake year-2026 sheet from helpers.js, built to
// the same rule as the real one. No Google API is touched: googleapis is
// replaced with a fake for the endpoint tests, and a write attempt fails
// the test.
//
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');

const { findCurrentWeek, WEEK_START_ROWS } = require('../api/_week');
const { serialToDate } = require('../api/_streak');
const V = require('../api/_validate');
const { at, addDays, pctOf, buildMonthGrid, buildYear, setTick,
        makeCpRows, buildFocusGrid, fakeRes, withFakeGoogleapis } = require('./helpers');

// ── the fake sheet matches what was confirmed in the real one ──

test('September 2026 tab ends at Sep 27; week 5 is the unused extra slot', () => {
  const sep = buildMonthGrid(2026, 8);
  assert.equal(serialToDate(sep[1][1]).getTime(), at(2026, 7, 31).getTime()); // week 1 starts Mon Aug 31
  assert.equal(serialToDate(sep[28][1]).getTime(), at(2026, 8, 21).getTime()); // week 4 starts Sep 21
  assert.equal(sep[37][1], undefined);                    // week 5: no dates
  assert.equal(sep[37][0], 'Extra week – Not used');
});

test('October 2026 tab starts its week 1 on Mon Sep 28 (rows 2-8)', () => {
  const oct = buildMonthGrid(2026, 9);
  for (let d = 0; d < 7; d++) {
    assert.equal(serialToDate(oct[1 + d][1]).getTime(), at(2026, 8, 28 + d).getTime());
  }
});

// ── findCurrentWeek ────────────────────────────────────────

const CASES = [
  // [date,               monthIdx, weekIdx, week start,        exact]
  ['2026-09-28', at(2026, 8, 28), 9, 0, at(2026, 8, 28), true],  // trailing days -> October tab
  ['2026-09-30', at(2026, 8, 30), 9, 0, at(2026, 8, 28), true],
  ['2026-10-01', at(2026, 9, 1),  9, 0, at(2026, 8, 28), true],  // own tab, week 1
  ['2026-08-31', at(2026, 7, 31), 8, 0, at(2026, 7, 31), true],  // Aug 31 lives in September's week 1
  ['2026-03-30', at(2026, 2, 30), 3, 0, at(2026, 2, 30), true],  // March has 5 dated weeks; 30th -> April
  ['2026-06-15', at(2026, 5, 15), 5, 2, at(2026, 5, 15), true],  // plain mid-month week
  ['2026-12-31', at(2026, 11, 31), 11, 3, at(2026, 11, 21), false] // in no tab -> last started week
];

CASES.forEach(([label, today, monthIdx, weekIdx, weekStart, exact]) => {
  test('findCurrentWeek ' + label, () => {
    const grids = buildYear(2026);
    const wk = findCurrentWeek(grids, today);
    assert.equal(wk.monthIdx, monthIdx);
    assert.equal(wk.weekIdx, weekIdx);
    assert.equal(wk.weekRow, WEEK_START_ROWS[weekIdx]);
    assert.equal(wk.exact, exact);

    // the 7 day rows hold consecutive dates from the week start, and each
    // 1-based sheet row is one toggle-habit accepts
    const grid = grids[wk.monthIdx];
    for (let d = 0; d < 7; d++) {
      const date = serialToDate(grid[wk.weekRow + d][1]);
      assert.equal(date.getTime(), addDays(weekStart, d).getTime());
      assert.ok(V.isDayRow(wk.weekRow + d + 1), 'row ' + (wk.weekRow + d + 1) + ' not a day row');
    }
    if (exact) {
      assert.ok(today >= weekStart && today <= addDays(weekStart, 6), 'week does not contain today');
    }
  });
});

// ── the endpoint, with googleapis faked ────────────────────

// The fake serves the batchGet get-habits makes (12 month tabs + the two
// Control Panel ranges, by position) and refuses everything else.
const state = { grids: null };

const CP_ROWS = makeCpRows();
const FOCUS_GRID = buildFocusGrid(); // master layout: labels in B19/B20

const fakeGoogle = {
  auth: { GoogleAuth: class { constructor() {} } },
  sheets: () => ({
    spreadsheets: {
      values: {
        batchGet: async ({ ranges }) => {
          assert.equal(ranges.length, 14, 'expected 12 month tabs + 2 CP ranges');
          const vr = state.grids.map(g => ({ values: g }));
          vr.push({ values: CP_ROWS }, { values: FOCUS_GRID });
          return { data: { valueRanges: vr } };
        },
        get: async () => { throw new Error('unexpected values.get in test'); },
        update: async () => { throw new Error('write attempted in test'); }
      }
    }
  })
};

// get-habits requires googleapis while the interception is active, so the
// endpoint under test can never reach the real API.
const getHabits = withFakeGoogleapis(fakeGoogle, () => require('../api/get-habits'));

process.env.GOOGLE_SERVICE_ACCOUNT = '{"type":"service_account"}';
process.env.GOOGLE_SHEET_ID = 'fake-sheet-for-tests';
delete process.env.CUSTOMERS_SHEET_ID; // single-user mode: no Customers lookup

async function callGetHabits(grids, dateStr) {
  state.grids = grids;
  const res = fakeRes();
  await getHabits({ method: 'GET', query: { date: dateStr } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.error, 'error: ' + res.body.error);
  return res.body;
}

test('get-habits on 2026-09-28 serves and writes to the October tab', async () => {
  const grids = buildYear(2026);
  [25, 26, 27, 28].forEach(d => {
    setTick(grids, 2026, 8, d, 9);   // Exercise
    setTick(grids, 2026, 8, d, 10);  // Read
  });
  const body = await callGetHabits(grids, '2026-09-28');

  assert.equal(body.sheetName, 'October');          // ticks go to the right tab
  assert.equal(body.month, 'September');            // the header month is still today's
  assert.equal(body.weekStart, 'Sep 28, 2026');
  assert.deepEqual(body.week.map(w => w.row), [2, 3, 4, 5, 6, 7, 8]);
  assert.equal(body.week[0].date, 'Sep 28');
  assert.deepEqual(body.week.map(w => w.isToday), [true, false, false, false, false, false, false]);

  // the Sep 28 tick lives in the October tab and shows up in the calendar
  const exercise = body.week[0].good.find(h => h.name === 'Exercise');
  assert.equal(exercise.checked, true);
  assert.equal(exercise.col, 10);

  // weekly % and weakest come from October week 1, not from a September row
  assert.equal(body.percent, pctOf(9, 0));
  assert.equal(body.weakest, 'weakest-9-0');

  // trend: September's completed weeks 2-4, then the live October week
  assert.deepEqual(body.weeklyTrend, [pctOf(8, 1), pctOf(8, 2), pctOf(8, 3), pctOf(9, 0)]);

  // streak still spans the whole year and today still never counts
  assert.equal(body.streak, 3); // Sep 25, 26, 27

  // month stats still bucket by calendar date: the Sep 28 tick in the
  // October tab counts for September (4 ticks / 28 elapsed days)
  const exStats = body.goodHabitStats.find(h => h.name === 'Exercise');
  assert.equal(exStats.percent, Math.round((4 / 28) * 100));
});

test('get-habits on 2026-09-30: same October week, right today-flag', async () => {
  const body = await callGetHabits(buildYear(2026), '2026-09-30');
  assert.equal(body.sheetName, 'October');
  assert.equal(body.weekStart, 'Sep 28, 2026');
  assert.deepEqual(body.week.map(w => w.isToday), [false, false, true, false, false, false, false]);
});

test('get-habits on 2026-10-01 stays in the October tab it is already in', async () => {
  const body = await callGetHabits(buildYear(2026), '2026-10-01');
  assert.equal(body.sheetName, 'October');
  assert.equal(body.month, 'October');
  assert.equal(body.weekStart, 'Sep 28, 2026');
  assert.deepEqual(body.week.map(w => w.row), [2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(body.week.map(w => w.isToday), [false, false, false, true, false, false, false]);
});

test('get-habits on 2026-08-31 serves September week 1', async () => {
  const body = await callGetHabits(buildYear(2026), '2026-08-31');
  assert.equal(body.sheetName, 'September');
  assert.equal(body.weekStart, 'Aug 31, 2026');
  assert.equal(body.week[0].isToday, true);
});

test('get-habits on 2026-06-15 is the plain case: own tab, week 3', async () => {
  const body = await callGetHabits(buildYear(2026), '2026-06-15');
  assert.equal(body.sheetName, 'June');
  assert.equal(body.weekStart, 'Jun 15, 2026');
  assert.deepEqual(body.week.map(w => w.row), [20, 21, 22, 23, 24, 25, 26]);
  assert.equal(body.percent, pctOf(5, 2));
  assert.equal(body.weakest, 'weakest-5-2');
  assert.equal(body.week[0].isToday, true);
});

test('get-habits on 2026-12-31 falls back to the last started December week', async () => {
  const body = await callGetHabits(buildYear(2026), '2026-12-31');
  assert.equal(body.sheetName, 'December');       // never guessed into another tab
  assert.equal(body.weekStart, 'Dec 21, 2026');
  assert.deepEqual(body.week.map(w => w.row), [29, 30, 31, 32, 33, 34, 35]);
  assert.equal(body.week.some(w => w.isToday), false); // today is in no shown row
  assert.equal(body.percent, pctOf(11, 3));
});
