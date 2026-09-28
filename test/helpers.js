// Shared fixtures for the endpoint tests. Not a test file itself: npm test
// runs "test/*.test.js" only.
//
// Everything here builds FAKE in-memory sheets; nothing touches the Google
// API or the real spreadsheet.

const Module = require('module');
const { weekIndexIn, WEEK_START_ROWS } = require('../api/_week');
const { serialToDate } = require('../api/_streak');

const DAY_MS = 86400000;
const serialOf = d =>
  Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / DAY_MS);
const at = (y, m, d) => new Date(y, m, d);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const pad2 = n => (n < 10 ? '0' : '') + n;
const isoOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

// ── the sheet's own date rule (read from the real master) ──
// Week 1 starts on the Monday on or before the 1st — or the Monday AFTER
// when the 1st is a Friday, Saturday or Sunday:
//   B2 = DATE(y,m,1) - WEEKDAY(DATE(y,m,1),3) + IF(WEEKDAY(...)>3, 7, 0)
// Week 5 is used only when its Thursday is still in the month:
//   B38 = IF(MONTH(B35+4)=m, B35+1, "")
// Every date is therefore in exactly one tab; the year-sheet for Y covers
// week1Monday(Y, Jan) .. week1Monday(Y+1, Jan) - 1.
function week1Monday(year, month) {
  const first = at(year, month, 1);
  const wd = (first.getDay() + 6) % 7; // 0 = Monday .. 6 = Sunday
  return at(year, month, 1 - wd + (wd > 3 ? 7 : 0));
}

// One month tab: rows 0..45. Dates in column B of the day rows,
// weakest/signal markers in T/U of the week rows so a test can see which
// tab and week a value was read from.
function buildMonthGrid(year, monthIdx) {
  const grid = [];
  for (let r = 0; r < 46; r++) grid.push([]);
  let start = week1Monday(year, monthIdx);
  WEEK_START_ROWS.forEach((ws, wi) => {
    const thursday = addDays(start, 3);
    const used = wi < 4 || thursday.getMonth() === monthIdx;
    if (used) {
      for (let d = 0; d < 7; d++) grid[ws + d][1] = serialOf(addDays(start, d));
      grid[ws][19] = 'weakest-' + monthIdx + '-' + wi;  // T
      grid[ws][20] = 'signal-' + monthIdx + '-' + wi;   // U
    } else {
      grid[ws][0] = 'Extra week – Not used';
    }
    start = addDays(start, 7);
  });
  return grid;
}

const buildYear = year => Array.from({ length: 12 }, (_, m) => buildMonthGrid(year, m));

// Ticks the habit column for one date, in the tab that owns that date.
function setTick(grids, y, m0, d0, colIndex) {
  const date = at(y, m0, d0);
  for (let m = 0; m < 12; m++) {
    const wi = weekIndexIn(grids[m], date);
    if (wi === -1) continue;
    const start = serialToDate(grids[m][WEEK_START_ROWS[wi]][1]);
    const off = Math.round((date - start) / DAY_MS);
    grids[m][WEEK_START_ROWS[wi] + off][colIndex] = true;
    return;
  }
  throw new Error('date in no tab: ' + y + '-' + (m0 + 1) + '-' + d0);
}

// An "Archive <startyear>" tab, exactly as the sheet's rollover writes it:
// row 1 names, row 2 types, row 3 statuses, then one row per day the
// year-sheet covered, the date as text YYYY-MM-DD plus 14 TRUE/FALSE.
// habits: [{ slot (0-13), name, status? }] · tick(date, slot) -> boolean
function buildArchive(startYear, habits, tick) {
  const names = ['Date'], types = ['Type'], statuses = ['Status'];
  for (let i = 0; i < 14; i++) {
    names[i + 1] = '';
    types[i + 1] = i < 7 ? 'bad' : 'good';
    statuses[i + 1] = '';
  }
  (habits || []).forEach(h => {
    names[h.slot + 1] = h.name;
    statuses[h.slot + 1] = h.status || 'active';
  });
  const rows = [names, types, statuses];
  const end = addDays(week1Monday(startYear + 1, 0), -1);
  for (let d = week1Monday(startYear, 0); d <= end; d = addDays(d, 1)) {
    const row = [isoOf(d)];
    for (let i = 0; i < 14; i++) row[i + 1] = !!(tick && tick(d, i));
    rows.push(row);
  }
  return rows;
}

// Control Panel habit slots (values of HABITS_RANGE, F7:H20): one active bad
// habit in slot 1 (month-tab colIndex 2) and two active good ones in slots
// 8-9 (colIndex 9 and 10).
function makeCpRows() {
  const rows = [];
  for (let i = 0; i < 14; i++) rows.push([]);
  rows[0] = ['No sugar', 'Active', ''];
  rows[7] = ['Exercise', 'Active', ''];
  rows[8] = ['Read', 'Active', ''];
  return rows;
}

// The Control Panel label area (values of FOCUS_SEARCH_RANGE, A1:E60).
// Defaults to the master layout: "Building:" in B19 with the focus in C19,
// "Eliminating:" in B20 with the focus in C20. goodRow/badRow move the
// rows (Martin's test sheet has 20/21), labelCol the 0-based label column
// (1 = B). labels: false leaves the labels out and puts the values straight
// into C19/C20, the fallback cells.
function buildFocusGrid(opts) {
  const o = Object.assign(
    { goodRow: 19, badRow: 20, labelCol: 1, good: 'Exercise', bad: 'No sugar', labels: true },
    opts
  );
  const rows = [];
  for (let r = 0; r < 60; r++) rows.push([]);
  if (o.labels) {
    rows[o.goodRow - 1][o.labelCol] = 'Building:';
    rows[o.goodRow - 1][o.labelCol + 1] = o.good;
    rows[o.badRow - 1][o.labelCol] = 'Eliminating:';
    rows[o.badRow - 1][o.labelCol + 1] = o.bad;
  } else {
    rows[18][2] = o.good; // C19
    rows[19][2] = o.bad;  // C20
  }
  return rows;
}

function fakeRes() {
  return {
    headers: {}, statusCode: 0, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    end() { return this; }
  };
}

// Runs fn (typically a require of an endpoint) while every require of
// 'googleapis' resolves to the given fake, so nothing under test can reach
// the real API.
function withFakeGoogleapis(fakeGoogle, fn) {
  const orig = Module._load;
  Module._load = function (request) {
    if (request === 'googleapis') return { google: fakeGoogle };
    return orig.apply(this, arguments);
  };
  try { return fn(); }
  finally { Module._load = orig; }
}

module.exports = {
  DAY_MS, serialOf, at, addDays, isoOf, week1Monday,
  buildMonthGrid, buildYear, setTick, buildArchive,
  makeCpRows, buildFocusGrid, fakeRes, withFakeGoogleapis
};
