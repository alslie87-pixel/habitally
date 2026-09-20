// Trophies for bad habits — Delivery 1, current year only.
//
// A bad habit is ticked on the days it was AVOIDED, so a high count is a good
// month. Three levels, all derived from the grid on every request; nothing is
// stored and nothing is written to the sheet.
//
//   MONTH   one per (habit, month), collectable: the same habit in April and
//           in June is two trophies. Won when the ticks inside that CALENDAR
//           month reach the month's threshold.
//   SEASON  won when all three of the season's month trophies are won.
//   YEAR    won on the year's own threshold, independent of the month
//           trophies, so a year carried by strong months survives a weak one.
//
// Thresholds are 90% of the real number of days, rounded down, derived rather
// than hardcoded: 31d->27, 30d->27, 29d->26, 28d->25, 365d->328, 366d->329.
//
// "That month" means the CALENDAR month. A month tab's week 1 starts on the
// Monday on or before the 1st, so the September tab also carries 31 August,
// and whichever tab the app happened to be showing is where that tick landed.
// Every tab is therefore scanned, each date is counted once (a date ticked in
// either copy counts), and dates are then bucketed by their own month.

const WEEK_START_ROWS = [1, 10, 19, 28, 37]; // 0-based rows (sheet rows 2, 11, 20, 29, 38)
const DATE_COL = 1;                          // column B
const RATE = 0.9;

// Winter spans the turn of the year, but the sheet only ever holds one year:
// December belongs to the previous sheet. Delivery 1 therefore reads winter as
// the three winter months that fall inside THIS calendar year, and says so in
// the label. Delivery 2 swaps `months` and `scope` here; nothing else changes.
const SEASONS = [
  { key: 'winter', label: 'Winter (Jan, Feb, Dec)', months: [0, 1, 11], scope: 'same-year' },
  { key: 'spring', label: 'Spring', months: [2, 3, 4],  scope: 'same-year' },
  { key: 'summer', label: 'Summer', months: [5, 6, 7],  scope: 'same-year' },
  { key: 'fall',   label: 'Fall',   months: [8, 9, 10], scope: 'same-year' }
];

// Habit statuses that keep their trophies. A habit you beat and archived has
// earned what it earned; a removed one (ghost/retired) drops out of the case.
const KEEPS_TROPHIES = ['active', 'conquered'];

const pad2 = n => (n < 10 ? '0' : '') + n;
const isoOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const isChecked = v => v === true || v === 'TRUE';

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

const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();
const daysInYear = year => (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;

// 90% of the real days, rounded down.
const monthThreshold = (year, monthIndex) => Math.floor(daysInMonth(year, monthIndex) * RATE);
const yearThreshold = year => Math.floor(daysInYear(year) * RATE);

// One entry per calendar date across every tab, past days only.
// visit(date, row) is called once per date, for the copy of the row that is
// most ticked, so a tick never gets lost to the tab it was not made in.
function eachDayOnce(monthGrids, today, habits, visit) {
  const best = new Map(); // iso -> { date, ticks: Set of colIndex }
  (monthGrids || []).forEach(grid => {
    if (!grid) return;
    WEEK_START_ROWS.forEach(ws => {
      for (let d = 0; d < 7; d++) {
        const row = grid[ws + d];
        if (!row) continue;
        const date = serialToDate(row[DATE_COL]);
        if (!date || date > today) continue;
        const iso = isoOf(date);
        let entry = best.get(iso);
        if (!entry) { entry = { date, ticks: new Set() }; best.set(iso, entry); }
        habits.forEach(h => { if (isChecked(row[h.colIndex])) entry.ticks.add(h.colIndex); });
      }
    });
  });
  best.forEach(entry => visit(entry.date, entry.ticks));
}

/**
 * monthGrids  twelve month tabs, unformatted values
 * badHabits   [{ name, status, colIndex }] — every bad habit, any status
 * today       the user's own local-midnight date
 *
 * Returns { trophies, conqueredThisMonth, ticksByHabit } where
 * ticksByHabit maps colIndex -> ticks in the CURRENT calendar month, so
 * get-habits can build its percentages from the same scan.
 */
function computeTrophies(monthGrids, badHabits, today) {
  const year = today.getFullYear();
  const curMonth = today.getMonth();
  const habits = (badHabits || []).filter(h => KEEPS_TROPHIES.indexOf(h.status) !== -1);

  // colIndex -> 12 monthly tick counts
  const counts = new Map();
  habits.forEach(h => counts.set(h.colIndex, new Array(12).fill(0)));

  eachDayOnce(monthGrids, today, habits, (date, ticks) => {
    if (date.getFullYear() !== year) return;      // the January tab's December tail
    const m = date.getMonth();
    ticks.forEach(col => {
      const row = counts.get(col);
      if (row) row[m]++;
    });
  });

  const monthThresholds = [];
  for (let m = 0; m < 12; m++) monthThresholds.push(monthThreshold(year, m));
  const yearBar = yearThreshold(year);

  const conqueredThisMonth = [];
  const ticksByHabit = {};

  const habitTrophies = habits.map(h => {
    const perMonth = counts.get(h.colIndex);

    const months = [];
    for (let m = 0; m < 12; m++) {
      months.push({
        m: m,
        ticks: perMonth[m],
        threshold: monthThresholds[m],
        won: perMonth[m] >= monthThresholds[m]
      });
    }

    const seasons = SEASONS.map(s => ({
      key: s.key,
      label: s.label,
      months: s.months.slice(),
      won: s.months.every(m => months[m].won)
    }));

    const yearTicks = perMonth.reduce((sum, n) => sum + n, 0);
    const yearTrophy = { ticks: yearTicks, threshold: yearBar, won: yearTicks >= yearBar };

    const count = months.filter(x => x.won).length +
                  seasons.filter(x => x.won).length +
                  (yearTrophy.won ? 1 : 0);

    if (months[curMonth].won) conqueredThisMonth.push(h.name);
    ticksByHabit[h.colIndex] = perMonth[curMonth];

    return { name: h.name, status: h.status, months, seasons, year: yearTrophy, count };
  });

  return {
    trophies: {
      year: year,
      thresholds: { months: monthThresholds, year: yearBar },
      habits: habitTrophies
    },
    conqueredThisMonth: conqueredThisMonth,
    ticksByHabit: ticksByHabit
  };
}

/**
 * Ticks in the current calendar month for any habit list (used for the good
 * habits too, so every percentage on the page comes from this one scan).
 * Returns colIndex -> ticks.
 */
function monthTicks(monthGrids, habits, today) {
  const year = today.getFullYear();
  const curMonth = today.getMonth();
  const out = {};
  (habits || []).forEach(h => { out[h.colIndex] = 0; });
  eachDayOnce(monthGrids, today, habits || [], (date, ticks) => {
    if (date.getFullYear() !== year || date.getMonth() !== curMonth) return;
    ticks.forEach(col => { if (out[col] !== undefined) out[col]++; });
  });
  return out;
}

// Calendar days of the current month up to and including today.
function elapsedThisMonth(today) {
  return today.getDate();
}

module.exports = {
  computeTrophies, monthTicks, elapsedThisMonth,
  monthThreshold, yearThreshold, daysInMonth, daysInYear,
  SEASONS, KEEPS_TROPHIES, RATE
};
