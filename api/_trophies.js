// Trophies for bad habits.
//
// A bad habit is ticked on the days it was AVOIDED, so a high count is a
// good month. Three levels, all derived on every request from the one
// timeline across the years (_timeline.js); nothing is stored and nothing
// is written to the sheet.
//
//   MONTH   one per (habit, month), collectable: the same habit in April
//           and in June is two trophies. Won when the ticks inside that
//           CALENDAR month reach the month's threshold.
//   SEASON  won when all three of the season's month trophies are won.
//   YEAR    won on the year's own threshold, independent of the month
//           trophies, so a year carried by strong months survives a weak
//           one.
//
// Thresholds are 90% of the real number of days, rounded down, derived
// rather than hardcoded: 31d->27, 30d->27, 29d->26, 28d->25, 365d->328,
// 366d->329.
//
// "That month" and "that year" mean the CALENDAR month and year. The
// timeline already holds each date exactly once, wherever it lives — a
// month tab, or last year's archive: the current year's January trophy
// counts 1-3 January even while those days sit in the previous sheet's
// archive. Past years are computed per calendar year from the same
// timeline.

const RATE = 0.9;

// Winter spans the turn of the year, but a year's trophies are computed per
// calendar year: December belongs to its own year. Delivery 1 therefore
// reads winter as the three winter months inside THAT calendar year, and
// says so in the label. Delivery 2 swaps `months` and `scope` here; nothing
// else changes.
const SEASONS = [
  { key: 'winter', label: 'Winter (Jan, Feb, Dec)', months: [0, 1, 11], scope: 'same-year' },
  { key: 'spring', label: 'Spring', months: [2, 3, 4],  scope: 'same-year' },
  { key: 'summer', label: 'Summer', months: [5, 6, 7],  scope: 'same-year' },
  { key: 'fall',   label: 'Fall',   months: [8, 9, 10], scope: 'same-year' }
];

// Habit statuses that keep their trophies. A habit you beat and archived
// has earned what it earned; a removed one (ghost/retired) drops out.
const KEEPS_TROPHIES = ['active', 'conquered'];

const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();
const daysInYear = year => (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;

// 90% of the real days, rounded down.
const monthThreshold = (year, monthIndex) => Math.floor(daysInMonth(year, monthIndex) * RATE);
const yearThreshold = year => Math.floor(daysInYear(year) * RATE);

/**
 * days       timeline day entries whose date falls in `year` (the caller
 *            filters, e.g. with _timeline.daysOfYear)
 * badHabits  [{ key, name, status }] — every bad habit, any status; only
 *            KEEPS_TROPHIES statuses are counted
 * year       the calendar year the days belong to
 * curMonth   today's month when `year` is the running year, else null
 *
 * Returns { trophies, conqueredThisMonth, ticksByHabit } where
 * ticksByHabit maps habit KEY -> ticks in the month `curMonth` (empty when
 * curMonth is null), so get-habits builds its percentages from this scan.
 */
function computeTrophiesForYear(days, badHabits, year, curMonth) {
  const habits = (badHabits || []).filter(h => KEEPS_TROPHIES.indexOf(h.status) !== -1);

  // key -> 12 monthly tick counts
  const counts = new Map();
  habits.forEach(h => counts.set(h.key, new Array(12).fill(0)));

  (days || []).forEach(day => {
    const m = day.date.getMonth();
    habits.forEach(h => {
      if (day.ticks.has(h.key)) counts.get(h.key)[m]++;
    });
  });

  const monthThresholds = [];
  for (let m = 0; m < 12; m++) monthThresholds.push(monthThreshold(year, m));
  const yearBar = yearThreshold(year);

  const conqueredThisMonth = [];
  const ticksByHabit = {};

  const habitTrophies = habits.map(h => {
    const perMonth = counts.get(h.key);

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

    if (curMonth !== null && curMonth !== undefined) {
      if (months[curMonth].won) conqueredThisMonth.push(h.name);
      ticksByHabit[h.key] = perMonth[curMonth];
    }

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

// Calendar days of the current month up to and including today.
function elapsedThisMonth(today) {
  return today.getDate();
}

module.exports = {
  computeTrophiesForYear, elapsedThisMonth,
  monthThreshold, yearThreshold, daysInMonth, daysInYear,
  SEASONS, KEEPS_TROPHIES, RATE
};
