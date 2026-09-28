// When is this sheet over? (the year gate)
//
// The month tabs are named "January".."December" with no year in the name,
// and the sheet's own formulas decide which dates it covers:
//
//   week 1 of a month starts on the Monday on or before the 1st, or the
//   Monday AFTER when the 1st is a Friday, Saturday or Sunday:
//     B2 = DATE(y,m,1) - WEEKDAY(DATE(y,m,1),3) + IF(WEEKDAY(...)>3, 7, 0)
//   week 5 (row 38) is used only when its Thursday is still in the month:
//     B38 = IF(MONTH(B35+4)=m, B35+1, "")
//
// Every date therefore lies in exactly one tab, and the sheet as a whole
// covers January's week 1 up to the last used week of December: the 2026
// sheet runs 29 Dec 2025 .. 3 Jan 2027, the 2027 sheet starts 4 Jan 2027,
// and the 2029 sheet ends 30 Dec 2029.
//
// The gate follows those dates, not the calendar year: the sheet is over
// only when today is AFTER the last date in its day rows, so 1-3 Jan 2027
// on the 2026 sheet is not locked. When it is over, the read endpoints
// return this state instead of their aggregates and toggle-habit refuses
// the write; the sheet's own Start new year menu (allowed only after the
// last date) archives every day row before it clears the grid, so nothing
// is lost. An empty sheet has no last date and is never locked.

const { serialToDate } = require('./_streak');

const WEEK_START_ROWS = [1, 10, 19, 28, 37]; // 0-based array rows (sheet rows 2, 11, 20, 29, 38)
const DATE_COL = 1;                          // column B

// The largest date in the day rows of these grids, or null when nothing is
// dated. Callers with the whole sheet pass all twelve grids.
function sheetEndFromGrids(grids) {
  let last = null;
  (grids || []).forEach(grid => {
    if (!grid || !grid.length) return;
    for (let i = 0; i < WEEK_START_ROWS.length; i++) {
      for (let d = 0; d < 7; d++) {
        const row = grid[WEEK_START_ROWS[i] + d];
        if (!row) continue;
        const date = serialToDate(row[DATE_COL]);
        if (date && (!last || date > last)) last = date;
      }
    }
  });
  return last;
}

// Week 1 of a month tab, from the B2 formula above.
function week1Monday(year, month) {
  const first = new Date(year, month, 1);
  const wd = (first.getDay() + 6) % 7; // 0 = Monday .. 6 = Sunday
  return new Date(year, month, 1 - wd + (wd > 3 ? 7 : 0));
}

// The same end date, derived from the formulas for callers that only hold
// one tab (toggle-habit): the sheet for `year` ends the day before week 1
// of January `year + 1` starts.
function sheetEndOfYear(year) {
  const next = week1Monday(year + 1, 0);
  return new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
}

// ── which year is a grid for ───────────────────────────────
// The year MOST of a tab's dated rows fall in. A tab's first and last week
// can reach into the neighbouring year, so the first row seen would lie.

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

function sheetYearFrom(grid) {
  let best = null, bestCount = 0;
  tallyYears(grid, new Map()).forEach((count, year) => {
    if (count > bestCount || (count === bestCount && best !== null && year > best)) {
      best = year; bestCount = count;
    }
  });
  return best;
}

// lastDate: the sheet's last date (sheetEndFromGrids, or sheetEndOfYear of
// sheetYearFrom for single-grid callers); today: the user's local midnight.
function yearState(lastDate, today) {
  return {
    lastDate: lastDate || null,
    outOfYear: !!lastDate && today > lastDate
  };
}

// Shown to the customer by index.html, stats.js and toggle-habit, so the
// wording lives in one place.
function outOfYearMessage() {
  return "Your sheet's year has ended. To keep going, open your HabiTally sheet " +
         'and choose HabiTally → Start new year. Your trophies, streak and history are kept.';
}

// The payload the read endpoints return instead of their aggregates. The
// app reads outOfYear and message; nothing else is promised.
function outOfYearPayload() {
  return { outOfYear: true, message: outOfYearMessage() };
}

module.exports = {
  sheetEndFromGrids, sheetEndOfYear, week1Monday, sheetYearFrom,
  yearState, outOfYearMessage, outOfYearPayload
};
