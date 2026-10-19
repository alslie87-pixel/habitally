// Which week is "this week", and in which month tab?
//
// The sheet gives each Monday-Sunday week to the month that holds its
// THURSDAY (see the formulas in _year.js): a month's trailing partial week
// lives in the NEXT month's tab — on 28 September the week that contains
// today is week 1 of the October tab, and the September tab marks its
// week 5 slot "Extra week – Not used", with no dates. Around new year the
// live week can even sit in December's week 5 while today is 1-3 January.
//
// Picking the week from today's tab alone therefore shows the wrong week
// at the end of most months, and sends ticks to the wrong rows. The search
// order here is today's tab, then the next month's tab, then every other
// tab.
//
// Every date the sheet covers is in exactly one tab, and days beyond its
// coverage are stopped by the year gate first, so the fallback below is a
// pure safety net: when today is found in no tab, nothing is guessed — the
// result is the last week of today's tab that started on or before today,
// and says so with exact: false.

const { serialToDate } = require('./_streak');

const WEEK_START_ROWS = [1, 10, 19, 28, 37]; // 0-based array rows (sheet rows 2, 11, 20, 29, 38)
const DATE_COL = 1;                          // column B
const DAY_MS = 86400000;
const STRIP_SIDE = 3;                        // days either side of today in the week strip

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Index (0..4) of the week of `grid` that contains `today`, or -1.
function weekIndexIn(grid, today) {
  for (let i = 0; i < WEEK_START_ROWS.length; i++) {
    const row = grid && grid[WEEK_START_ROWS[i]];
    const start = row ? serialToDate(row[DATE_COL]) : null;
    if (!start) continue;
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    if (today >= start && today <= end) return i;
  }
  return -1;
}

// monthGrids: all twelve tabs, January first. Returns
//   { monthIdx, weekIdx, weekRow, exact }
// where weekRow is the 0-based array row of the week's Monday and exact
// says whether that week really contains today (false only in the
// late-December fallback above).
function findCurrentWeek(monthGrids, today) {
  const thisMonth = today.getMonth();
  const order = [thisMonth, (thisMonth + 1) % 12];
  for (let m = 0; m < 12; m++) if (!order.includes(m)) order.push(m);

  for (const monthIdx of order) {
    const weekIdx = weekIndexIn(monthGrids[monthIdx], today);
    if (weekIdx !== -1) {
      return { monthIdx, weekIdx, weekRow: WEEK_START_ROWS[weekIdx], exact: true };
    }
  }

  const grid = monthGrids[thisMonth] || [];
  let weekIdx = 0;
  for (let i = 0; i < WEEK_START_ROWS.length; i++) {
    const row = grid[WEEK_START_ROWS[i]];
    const start = row ? serialToDate(row[DATE_COL]) : null;
    if (start && start <= today) weekIdx = i;
  }
  return { monthIdx: thisMonth, weekIdx, weekRow: WEEK_START_ROWS[weekIdx], exact: false };
}

// ── single days: the week strip and toggle-habit ───────────
// The Thursday of a date's Monday-Sunday week decides two things: the
// ISO week number, and (by the sheet's formulas above) the month tab the
// date lives in. Sat 26 Sep 2026 has its Thursday on the 24th, so it is in
// the September tab; Wed 30 Sep 2026 has it on 1 Oct, so it is in October.

function thursdayOf(date) {
  return addDays(date, 3 - (date.getDay() + 6) % 7);
}

// ISO 8601 week number: week 1 is the week that holds the year's first
// Thursday, so Mon 29 Dec 2025 is week 1 of 2026 and Fri 1 Jan 2027 is
// week 53 of 2026.
function isoWeek(date) {
  const thu = thursdayOf(date);
  const jan1 = new Date(thu.getFullYear(), 0, 1);
  return 1 + Math.floor(Math.round((thu - jan1) / DAY_MS) / 7);
}

// The month tab (0..11) that holds `date`.
const tabOf = date => thursdayOf(date).getMonth();

// 0-based array row of `date` in `grid`, or -1 when the tab does not hold
// that date — a date from another year (an archive day), or a tab that was
// cleared by the rollover since the page was drawn.
function dayRowIn(grid, date) {
  const wi = weekIndexIn(grid, date);
  if (wi === -1) return -1;
  const start = serialToDate(grid[WEEK_START_ROWS[wi]][DATE_COL]);
  const row = WEEK_START_ROWS[wi] + Math.round((date - start) / DAY_MS);
  const there = grid[row] ? serialToDate(grid[row][DATE_COL]) : null;
  return there && there.getTime() === date.getTime() ? row : -1;
}

// The week strip: today and the STRIP_SIDE days either side, each with the
// tab and row it lives in, so a window that reaches over a Sunday-Monday
// boundary can take its cards from two tabs. Days the live sheet does not
// hold are left out: before its first date, after its last, and the days
// that now live only in an archive. The window is therefore shorter at the
// very start and end of a sheet year. Each day is looked up in the tab
// tabOf() names, the same one toggle-habit writes to, so every card shown
// can be ticked.
function dayWindow(monthGrids, today) {
  const days = [];
  for (let n = -STRIP_SIDE; n <= STRIP_SIDE; n++) {
    const date = addDays(today, n);
    const monthIdx = tabOf(date);
    const row = dayRowIn(monthGrids[monthIdx], date);
    if (row !== -1) days.push({ date, monthIdx, row });
  }
  return days;
}

module.exports = {
  WEEK_START_ROWS, STRIP_SIDE, weekIndexIn, findCurrentWeek,
  isoWeek, tabOf, dayRowIn, dayWindow
};
