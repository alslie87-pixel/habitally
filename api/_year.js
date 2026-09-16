// Which year does this sheet cover? (checklist item 2.1)
//
// The month tabs are named "January".."December" with no year in the name, so
// on 1 January the app happily reads last year's grid and presents it as this
// year: the wrong week is shown as the current one, ticks land on last year's
// rows, and every aggregate is derived from a year that is over.
//
// The sheet describes itself: the date column of each month tab holds real
// dates, so the year is read from the first dated row rather than from a
// separate setting that a customer could forget to update. An empty tab has
// no year to read, and an unknown year is never treated as out of year.
//
// When the sheet's year is not the current year, endpoints stop short: the
// read endpoints gate their aggregates and return this state instead, and
// toggle-habit refuses the write. The customer sees an explanation rather
// than last January.

const { serialToDate } = require('./_streak');

const WEEK_START_ROWS = [1, 10, 19, 28, 37]; // 0-based array rows (sheet rows 2, 11, 20, 29, 38)
const DATE_COL = 1;                          // column B

// First dated day row of a month grid -> its year, or null when the tab holds
// no dates at all.
function sheetYearFrom(grid) {
  if (!grid || !grid.length) return null;
  for (let i = 0; i < WEEK_START_ROWS.length; i++) {
    for (let d = 0; d < 7; d++) {
      const row = grid[WEEK_START_ROWS[i] + d];
      if (!row) continue;
      const date = serialToDate(row[DATE_COL]);
      if (date) return date.getFullYear();
    }
  }
  return null;
}

// Same, across several grids: the first tab that carries dates wins.
function sheetYearFromGrids(grids) {
  for (let i = 0; i < (grids || []).length; i++) {
    const y = sheetYearFrom(grids[i]);
    if (y !== null) return y;
  }
  return null;
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
