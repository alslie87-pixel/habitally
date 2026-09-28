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

module.exports = { WEEK_START_ROWS, weekIndexIn, findCurrentWeek };
