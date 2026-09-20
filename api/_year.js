// Which year does this sheet cover? (checklist item 2.1)
//
// The month tabs are named "January".."December" with no year in the name, so
// on 1 January the app happily reads last year's grid and presents it as this
// year: the wrong week is shown as the current one, ticks land on last year's
// rows, and every aggregate is derived from a year that is over.
//
// The sheet describes itself: the date column of each month tab holds real
// dates, so the year is read from the grid rather than from a separate
// setting that a customer could forget to update. An empty tab has no year to
// read, and an unknown year is never treated as out of year.
//
// The year is the one MOST of the dated rows fall in, not the first one seen.
// A tab's first week starts on the Monday on or before the 1st, so January's
// grid opens in late December of the previous year and December's runs into
// January of the next. Reading the first row would call a correctly rolled
// sheet out of year and lock the customer out of their own app.
//
// When the sheet's year is not the current year, endpoints stop short: the
// read endpoints gate their aggregates and return this state instead, and
// toggle-habit refuses the write. The customer sees an explanation rather
// than last January.

const { serialToDate } = require('./_streak');

const WEEK_START_ROWS = [1, 10, 19, 28, 37]; // 0-based array rows (sheet rows 2, 11, 20, 29, 38)
const DATE_COL = 1;                          // column B

// Counts how many dated day rows of one grid fall in each year.
function tallyYears(grid, tally) {
  if (!grid || !grid.length) return tally;
  for (let i = 0; i < WEEK_START_ROWS.length; i++) {
    for (let d = 0; d < 7; d++) {
      const row = grid[WEEK_START_ROWS[i] + d];
      if (!row) continue;
      const date = serialToDate(row[DATE_COL]);
      if (!date) continue;
      const y = date.getFullYear();
      tally.set(y, (tally.get(y) || 0) + 1);
    }
  }
  return tally;
}

// The year with the most dated rows; ties go to the later year, since a sheet
// that has just been rolled over leans towards the new one. null when nothing
// is dated.
function topYear(tally) {
  let best = null, bestCount = 0;
  tally.forEach((count, year) => {
    if (count > bestCount || (count === bestCount && best !== null && year > best)) {
      best = year; bestCount = count;
    }
  });
  return best;
}

// The year one month grid is for.
function sheetYearFrom(grid) {
  return topYear(tallyYears(grid, new Map()));
}

// The year a whole set of month grids is for.
function sheetYearFromGrids(grids) {
  const tally = new Map();
  (grids || []).forEach(g => tallyYears(g, tally));
  return topYear(tally);
}

// sheetYear comes from sheetYearFrom / sheetYearFromGrids; today is the
// user's own local-midnight date (see _date.js). Callers pass the year
// explicitly because a grid and a list of grids are both arrays of arrays
// and cannot be told apart reliably.
function yearState(sheetYear, today) {
  const currentYear = today.getFullYear();
  return {
    sheetYear: sheetYear === undefined ? null : sheetYear,
    currentYear,
    outOfYear: sheetYear !== null && sheetYear !== undefined && sheetYear !== currentYear
  };
}

// Shown to the customer by index.html, stats.js and toggle-habit, so the
// wording lives in one place.
function outOfYearMessage(currentYear) {
  return 'A new year has begun. Your sheet is being prepared for ' + currentYear +
         ' — get in touch if it doesn\u2019t update automatically.';
}

// The payload the read endpoints return instead of their aggregates.
function outOfYearPayload(state) {
  return {
    outOfYear: true,
    sheetYear: state.sheetYear,
    currentYear: state.currentYear,
    message: outOfYearMessage(state.currentYear)
  };
}

module.exports = {
  sheetYearFrom, sheetYearFromGrids, yearState, outOfYearMessage, outOfYearPayload
};
