// One timeline across the years.
//
// The live sheet holds the current year-sheet's days; every earlier year
// lives in a hidden "Archive <startyear>" tab that the sheet's own Start
// new year menu writes before it clears the grid (see _archive.js). This
// module merges them into one day list, so streaks, trends, focus counters,
// the rolling 30-day windows and trophies do not notice new year.
//
//   - days are keyed by calendar date, each date once; the LIVE SHEET WINS
//     when a date appears both in the sheet and in an archive
//   - habits are matched on slot type + trimmed, lower-cased name, so a
//     renamed habit is a new habit
//   - the slot POSITION decides the type, exactly like the Control Panel:
//     slots 1-7 are bad habits, 8-14 good ones
//
// Nothing here reads the API: callers pass the month grids, Control Panel
// slots and archives they already fetched. Future days are left out, so
// every consumer below sees elapsed days only.

const CP = require('./_controlPanel');
const { serialToDate, isChecked, isoOf, THRESHOLD } = require('./_streak');
const { parseISODate } = require('./_date');

const WEEK_START_ROWS = [1, 10, 19, 28, 37]; // 0-based array rows (sheet rows 2, 11, 20, 29, 38)
const DATE_COL = 1;                          // column B

const habitKey = (type, name) => type + '|' + String(name || '').trim().toLowerCase();
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));

// Archive day rows store the date as text YYYY-MM-DD so no time zone can
// move it; the live grids use serial numbers.
function anyToDate(v) {
  if (typeof v === 'number') return serialToDate(v);
  return parseISODate(v);
}

// One archive tab's habit roster: row 1 = names, row 3 = status, the slot
// position decides type and column (slot i sits in column i + 1).
function archiveRoster(rows) {
  const names = (rows && rows[0]) || [];
  const statuses = (rows && rows[2]) || [];
  const out = [];
  for (let i = 0; i < CP.SLOTS; i++) {
    const name = String(names[i + 1] || '').trim();
    if (!name) continue;
    const type = i < CP.PER_TYPE ? 'bad' : 'good';
    out.push({
      key: habitKey(type, name),
      type,
      name,
      status: String(statuses[i + 1] || '').trim().toLowerCase(),
      col: i + 1
    });
  }
  return out;
}

/**
 * monthGrids  the twelve live month tabs (unformatted values)
 * slots       CP.readSlots(...) of the live Control Panel
 * archives    [{ year, rows }] from _archive.readArchives, any order
 * today       the user's local-midnight date; later days are left out
 *
 * Returns {
 *   days    [{ iso, date, ticks:Set<key>, goodActive:[keys] }] ascending —
 *           goodActive is the source's own active good habits, for
 *           day-percent numbers that stay fair to old rosters
 *   byIso   Map iso -> that day
 *   habits  Map key -> { key, type, name, status, colIndex|undefined,
 *           inSheet } — the live sheet wins over newer archives over older
 * }
 */
function buildTimeline(monthGrids, slots, archives, today) {
  const sorted = (archives || []).slice().sort((a, b) => a.year - b.year);

  const habits = new Map();
  const rosters = sorted.map(a => archiveRoster(a.rows));
  rosters.forEach(r => r.forEach(h => habits.set(h.key, {
    key: h.key, type: h.type, name: h.name, status: h.status, inSheet: false
  })));
  const sheetHabits = (slots || []).filter(CP.isHabit).map(s => ({
    key: habitKey(s.type, s.name),
    type: s.type, name: s.name, status: s.status, colIndex: s.colIndex, inSheet: true
  }));
  sheetHabits.forEach(h => habits.set(h.key, h));

  const byIso = new Map();

  // The live sheet first: it wins over the archives. An older sheet can
  // hold the same date in TWO month tabs (the week 30 Mar - 5 Apr in both
  // March and April); merging those copies would invent days that never
  // happened, so the copy with the most ticks wins and a tie keeps the
  // first one seen.
  const sheetGood = sheetHabits.filter(h => h.type === 'good' && h.status === 'active').map(h => h.key);
  (monthGrids || []).forEach(grid => {
    if (!grid) return;
    WEEK_START_ROWS.forEach(ws => {
      for (let d = 0; d < 7; d++) {
        const row = grid[ws + d];
        if (!row) continue;
        const date = serialToDate(row[DATE_COL]);
        if (!date || date > today) continue;
        const iso = isoOf(date);
        const ticks = new Set();
        sheetHabits.forEach(h => { if (isChecked(row[h.colIndex])) ticks.add(h.key); });
        const seen = byIso.get(iso);
        if (!seen || ticks.size > seen.ticks.size) byIso.set(iso, { iso, date, ticks, goodActive: sheetGood });
      }
    });
  });

  // then the archives, newest first; dates the sheet already has are skipped
  for (let i = sorted.length - 1; i >= 0; i--) {
    const roster = rosters[i];
    const good = roster.filter(h => h.type === 'good' && h.status === 'active').map(h => h.key);
    (sorted[i].rows || []).slice(3).forEach(row => {
      const date = row ? anyToDate(row[0]) : null;
      if (!date || date > today) return;
      const iso = isoOf(date);
      if (byIso.has(iso)) return;
      const ticks = new Set();
      roster.forEach(h => { if (isChecked(row[h.col])) ticks.add(h.key); });
      byIso.set(iso, { iso, date, ticks, goodActive: good });
    });
  }

  const days = Array.from(byIso.values()).sort((a, b) => a.date - b.date);
  return { days, byIso, habits };
}

const daysOfYear = (tl, year) => tl.days.filter(d => d.date.getFullYear() === year);
const daysOfMonth = (tl, year, month) =>
  tl.days.filter(d => d.date.getFullYear() === year && d.date.getMonth() === month);

// ── streak ─────────────────────────────────────────────────
// Consecutive days counting back from yesterday where at least THRESHOLD of
// the given good habits are ticked. Today never counts: the day is not
// over. A day the timeline does not have breaks the streak.
function streakOf(tl, goodKeys, today) {
  if (!goodKeys || goodKeys.length === 0) return 0;
  let streak = 0;
  let d = addDays(today, -1);
  for (;;) {
    const day = tl.byIso.get(isoOf(d));
    if (!day) break;
    let done = 0;
    goodKeys.forEach(k => { if (day.ticks.has(k)) done++; });
    if (done / goodKeys.length < THRESHOLD) break;
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

// ── focus X/30 ─────────────────────────────────────────────
// Days in the `windowDays` calendar days ending today where the habit is
// ticked, wherever those days live.
function focusTicks(tl, key, today, windowDays) {
  let n = 0;
  for (let i = 0; i < windowDays; i++) {
    const day = tl.byIso.get(isoOf(addDays(today, -i)));
    if (day && day.ticks.has(key)) n++;
  }
  return n;
}

// ── the last 30 days ───────────────────────────────────────
// "Now" is the ROLLING_DAYS days up to and including yesterday, "before" the
// ROLLING_DAYS days ahead of those (day -60 to -31). Today never counts, like
// the streak: a morning with nothing ticked yet must not drag the numbers
// down, and the 1st of a month does not start from zero. The windows are
// calendar days wherever they live, so they roll over month and year ends.
//
// A day is data from the first tick in the timeline on: a new customer's
// sheet holds every date of the year, and the empty days before they started
// are not days they missed. A window with fewer than MIN_WINDOW_DAYS such
// days is too thin to say anything and comes back null.
const ROLLING_DAYS = 30;
const MIN_WINDOW_DAYS = 7;

function rollingWindows(tl, today) {
  const first = tl.days.find(d => d.ticks.size > 0);
  const span = (back, upTo) => {
    if (!first) return null;
    const from = addDays(today, -back), to = addDays(today, -upTo);
    const days = tl.days.filter(d => d.date >= from && d.date <= to && d.date >= first.date);
    return days.length >= MIN_WINDOW_DAYS ? days : null;
  };
  return {
    now:  span(ROLLING_DAYS, 1),
    prev: span(2 * ROLLING_DAYS, ROLLING_DAYS + 1)
  };
}

// ── weeks (Mon-Sun) from raw ticks ─────────────────────────
// Percent of possible good-habit ticks in the week starting `monday`:
// ticked / (habits x days the timeline has of that week). null for a week
// with no days at all. The caller chooses the roster: the trend uses
// today's active good habits, so a renamed habit starts a new line.
function weekPercent(tl, goodKeys, monday) {
  if (!goodKeys || goodKeys.length === 0) return null;
  let ticks = 0, days = 0;
  for (let i = 0; i < 7; i++) {
    const day = tl.byIso.get(isoOf(addDays(monday, i)));
    if (!day) continue;
    days++;
    goodKeys.forEach(k => { if (day.ticks.has(k)) ticks++; });
  }
  return days ? Math.round((ticks / (goodKeys.length * days)) * 100) : null;
}

// Share of a day's own active good habits that are ticked (the day's source
// roster, so an archived day is measured against the habits of its time).
// null when that day tracked no good habits.
function dayPercent(day) {
  if (!day.goodActive || day.goodActive.length === 0) return null;
  let done = 0;
  day.goodActive.forEach(k => { if (day.ticks.has(k)) done++; });
  return done / day.goodActive.length;
}

// The best week ever, measured per day against that day's own roster.
function bestWeekEver(tl) {
  if (!tl.days.length) return 0;
  let best = 0;
  let monday = mondayOf(tl.days[0].date);
  const last = tl.days[tl.days.length - 1].date;
  for (; monday <= last; monday = addDays(monday, 7)) {
    let sum = 0, n = 0;
    for (let i = 0; i < 7; i++) {
      const day = tl.byIso.get(isoOf(addDays(monday, i)));
      if (!day) continue;
      const p = dayPercent(day);
      if (p !== null) { sum += p; n++; }
    }
    if (n) best = Math.max(best, Math.round((sum / n) * 100));
  }
  return best;
}

// ── per-habit counting ─────────────────────────────────────
const tickedIn = (days, key) => days.reduce((n, d) => n + (d.ticks.has(key) ? 1 : 0), 0);

// Longest run of consecutive calendar dates on which the habit is ticked.
function longestRun(tl, key) {
  let best = 0, run = 0, prev = null;
  tl.days.forEach(day => {
    if (day.ticks.has(key)) {
      const gap = prev ? (day.date - prev) / 86400000 : null;
      run = gap === 1 ? run + 1 : 1;
      if (run > best) best = run;
      prev = day.date;
    } else {
      run = 0;
      prev = null;
    }
  });
  return best;
}

module.exports = {
  habitKey, addDays, mondayOf, buildTimeline, archiveRoster,
  daysOfYear, daysOfMonth, streakOf, focusTicks, rollingWindows,
  weekPercent, dayPercent, bestWeekEver, tickedIn, longestRun,
  ROLLING_DAYS, MIN_WINDOW_DAYS
};
