// The streak rule, in one place (checklist item 1.4).
//
// A streak is the number of consecutive past days, counting backwards from
// yesterday, where at least 66% of the active good habits are checked.
// Today never counts: the day is not over yet, so a half-finished day must
// not break the streak.
//
// This used to live inside get-habits, which also wrote the result to
// Dashboard C7 and therefore needed write scope on a read-only endpoint.
// get-habits now only derives the number for its response; toggle-habit
// writes C7 after a successful tick, which is the moment the value can
// actually change.
//
// Note: only the current month tab is consulted, so on the 1st of a month
// the streak can reach back at most as far as that tab goes. That is
// existing behaviour, not something this module changes.

const WEEK_START_ROWS = [1, 10, 19, 28, 37]; // 0-based array rows (sheet rows 2, 11, 20, 29, 38)
const GOOD_FIRST_COL = 9;                    // column J
const THRESHOLD = 0.66;

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

module.exports = { serialToDate, isChecked, activeGoodHabits, computeStreak, THRESHOLD };
