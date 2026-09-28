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
const mondayOnOrBefore = d => addDays(d, -((d.getDay() + 6) % 7));

// Every dated week gets a GH% (column R of its summary row) that names its
// source: (monthIdx * 5 + weekIdx + 1) / 100, so a response shows which tab
// and week a percentage was read from.
const pctOf = (monthIdx, weekIdx) => monthIdx * 5 + weekIdx + 1;

// One month tab built to the sheet's own rule (confirmed 28.09.2026): a week
// belongs to a month tab only when the whole Mon-Sun week is inside the
// month, except week 1, which starts on the Monday on or before the 1st. A
// trailing partial week is the next tab's week 1, and the slot it would have
// used says "Extra week – Not used" with no dates in column B.
function buildMonthGrid(year, monthIdx) {
  const grid = [];
  for (let r = 0; r < 46; r++) grid.push([]);
  let start = mondayOnOrBefore(at(year, monthIdx, 1));
  WEEK_START_ROWS.forEach((ws, wi) => {
    const end = addDays(start, 6);
    const inside = end.getMonth() === monthIdx && end.getFullYear() === year;
    if (wi === 0 || inside) {
      for (let d = 0; d < 7; d++) grid[ws + d][1] = serialOf(addDays(start, d));
      grid[ws][19] = 'weakest-' + monthIdx + '-' + wi;      // T
      grid[ws][20] = 'signal-' + monthIdx + '-' + wi;       // U
      grid[ws + 8][17] = pctOf(monthIdx, wi) / 100;         // R
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
  DAY_MS, serialOf, at, addDays, mondayOnOrBefore, pctOf,
  buildMonthGrid, buildYear, setTick,
  makeCpRows, buildFocusGrid, fakeRes, withFakeGoogleapis
};
