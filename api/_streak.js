// The streak rule, in one place (checklist item 1.4).
//
// A streak is the number of consecutive past days, counting backwards from
// yesterday, where at least 66% of the active good habits are checked.
// Today never counts: the day is not over yet, so a half-finished day must
// not break the streak.
//
// get-habits derives this number for its response only. Dashboard C7 belongs
// to the sheet's own Apps Script, so nothing here writes to the sheet.
//
// computeStreak() looks at a single month tab and is kept for callers that
// only hold one grid. computeStreakAcrossYear() is what the app shows: it
// walks every tab of the current year, so a streak no longer resets on the
// 1st of a month.
//
// It cannot see last year's sheet, but it does not drop to zero on 1 January
// either: a tab's first week starts on the Monday on or before the 1st, so
// the January tab carries the last few days of December and the streak keeps
// that much of its tail.

const WEEK_START_ROWS = [1, 10, 19, 28, 37]; // 0-based array rows (sheet rows 2, 11, 20, 29, 38)
const DATE_COL = 1;                          // column B
const GOOD_FIRST_COL = 9;                    // column J
const THRESHOLD = 0.66;
const FOCUS_WINDOW_DAYS = 30;                // the "X / 30" counter on the focus cards

const pad2 = n => (n < 10 ? '0' : '') + n;
const isoOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Google Sheets serial number (or a date string) -> local midnight Date
function serialToDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const ud = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return new Date(ud.getUTCFullYear(), ud.getUTCMonth(), ud.getUTCDate());
  }
  const d = new Date(v);
  if (isNaN(d)) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function isChecked(v) { return v === true || v === 'TRUE'; }

// Control Panel E6:H20 (header + 14 slots) -> active good habits with the
// month-tab column each one occupies. Position-based, like get-habits:
// slots 7-13 are bad habits, slots 14-20 are good ones.
function activeGoodHabits(configRows) {
  const out = [];
  (configRows || []).slice(1).forEach((row, idx) => {
    if (idx < 7) return;
    const type   = (row[0] || '').toString().trim().toLowerCase();
    const name   = (row[1] || '').toString().trim();
    const status = (row[2] || '').toString().trim().toLowerCase();
    if (type !== 'good' || !name || status !== 'active') return;
    out.push({ name, colIndex: GOOD_FIRST_COL + (idx - 7) });
  });
  return out;
}

// monthData: rows of the current month tab (unformatted values, 0-based).
// activeGood: [{ colIndex }] for the active good habits.
// today: local-midnight Date for the user's own today.
function computeStreak(monthData, activeGood, today) {
  if (!activeGood || activeGood.length === 0) return 0;

  // every logged day in the tab, most recent first, today and future excluded
  const pastDays = [];
  for (let i = WEEK_START_ROWS.length - 1; i >= 0; i--) {
    for (let d = 6; d >= 0; d--) {
      const r = WEEK_START_ROWS[i] + d;
      const rowDate = monthData[r] ? serialToDate(monthData[r][1]) : null;
      if (!rowDate || rowDate > today) continue;
      pastDays.push({ r, rowDate });
    }
  }

  let streak = 0;
  for (let i = 0; i < pastDays.length; i++) {
    const { r, rowDate } = pastDays[i];
    if (rowDate.getTime() === today.getTime()) continue;

    let done = 0;
    activeGood.forEach(h => {
      if (monthData[r] && isChecked(monthData[r][h.colIndex])) done++;
    });

    if (done / activeGood.length >= THRESHOLD) streak++;
    else break;
  }
  return streak;
}

// ── year-wide ──────────────────────────────────────────────
//
// One entry per calendar date across all twelve tabs.
//
// The same day legitimately appears in two tabs: week 1 of a month tab
// starts on the Monday on or before the 1st, so 31 August sits in both the
// August and the September grid. Which copy holds the tick depends on when
// it was ticked, because get-habits shows whichever tab contains today.
// Losing a tick would be worse than counting a generous one, so a date is
// scored by the best copy of it: visit(iso, value) keeps the highest.
function eachDay(monthGrids, today, visit) {
  (monthGrids || []).forEach(grid => {
    if (!grid) return;
    WEEK_START_ROWS.forEach(ws => {
      for (let d = 0; d < 7; d++) {
        const row = grid[ws + d];
        if (!row) continue;
        const date = serialToDate(row[DATE_COL]);
        if (!date || date > today) continue;
        visit(date, row);
      }
    });
  });
}

// Consecutive days, counting back from yesterday, where at least THRESHOLD of
// the active good habits are ticked. Today never counts: the day is not over.
// Every step must be exactly one calendar day earlier, so a missing or
// undated day ends the streak instead of being silently stepped over.
function computeStreakAcrossYear(monthGrids, activeGood, today) {
  if (!activeGood || activeGood.length === 0) return 0;

  const best = new Map(); // iso -> ticked count for that date
  eachDay(monthGrids, today, (date, row) => {
    let done = 0;
    activeGood.forEach(h => { if (isChecked(row[h.colIndex])) done++; });
    const iso = isoOf(date);
    const prev = best.get(iso);
    if (prev === undefined || done > prev) best.set(iso, done);
  });

  let streak = 0;
  let expected = addDays(today, -1); // yesterday
  for (;;) {
    const done = best.get(isoOf(expected));
    if (done === undefined) break;                       // no row for that day
    if (done / activeGood.length < THRESHOLD) break;     // day missed
    streak++;
    expected = addDays(expected, -1);
  }
  return streak;
}

// Ticks for one habit in the FOCUS_WINDOW_DAYS calendar days ending today,
// today included. Deduplicated the same way: a date counts once, and counts
// as ticked if either copy of it is ticked.
function countFocusTicks(monthGrids, colIndex, today, windowDays) {
  if (colIndex === null || colIndex === undefined) return 0;
  const span = windowDays || FOCUS_WINDOW_DAYS;
  const first = addDays(today, -(span - 1));

  const ticked = new Map(); // iso -> boolean
  eachDay(monthGrids, today, (date, row) => {
    if (date < first) return;
    const iso = isoOf(date);
    if (isChecked(row[colIndex])) ticked.set(iso, true);
    else if (!ticked.has(iso)) ticked.set(iso, false);
  });

  let n = 0;
  ticked.forEach(v => { if (v) n++; });
  return n;
}

module.exports = {
  serialToDate, isChecked, activeGoodHabits, computeStreak,
  computeStreakAcrossYear, countFocusTicks,
  THRESHOLD, FOCUS_WINDOW_DAYS, isoOf
};
