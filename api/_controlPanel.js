// The Control Panel layout, in one place.
//
// Habit slots are rows 7-20, and the ROW decides everything: rows 7-13 are
// the bad habits (month-tab columns C..I), rows 14-20 the good ones (J..P).
//   F = habit name · G = status · H = note
// Column E is a label for people ("bad habit calendar slot 1 --->") and is
// never read or written: the type comes from the row alone.
//
// Focus habits: C19 = Building (good), C20 = Eliminating (bad).
// Z1 = the hidden app-onboarded marker.
//
// The app writes only F/G/H in rows 7-20, C19:C20 and Z1. The rest of the
// Control Panel is protected in the sheet.

const TAB = "'⚙️ Control Panel'";
const FIRST_ROW = 7;
const PER_TYPE = 7;
const SLOTS = PER_TYPE * 2;
const FIRST_MONTH_COL = 2; // C, 0-based: slot i sits in month-tab column C + i

const HABITS_RANGE = TAB + '!F7:H20';
const FOCUS_RANGE = TAB + '!C19:C20';                  // [0] = good, [1] = bad
const FOCUS_CELL = { good: TAB + '!C19', bad: TAB + '!C20' };
const ONBOARDED_CELL = TAB + '!Z1';
const ONBOARDED_MARK = 'app-onboarded';

const WEEK_START_ROWS = [1, 10, 19, 28, 37]; // month tabs, 0-based (sheet rows 2, 11, 20, 29, 38)

const text = v => (v === null || v === undefined ? '' : String(v)).trim();
const isChecked = v => v === true || v === 'TRUE';

// A1 range for columns `from`..`to` of one Control Panel row.
const rowRange = (row, from, to) => TAB + '!' + from + row + (to && to !== from ? ':' + to + row : '');

// Values of HABITS_RANGE -> all 14 slots, in row order. The API leaves out
// empty rows at the end of a range, so the list is padded back to 14 here
// rather than trusting its length.
function readSlots(values) {
  const rows = values || [];
  const out = [];
  for (let i = 0; i < SLOTS; i++) {
    const r = rows[i] || [];
    out.push({
      slot: i,
      row: FIRST_ROW + i,
      type: i < PER_TYPE ? 'bad' : 'good',
      name: text(r[0]),
      status: text(r[1]).toLowerCase(),
      note: text(r[2]),
      colIndex: FIRST_MONTH_COL + i
    });
  }
  return out;
}

// A slot holds a habit (of any status) when it has a name and is not empty.
const isHabit = s => !!s.name && s.status !== 'empty';
const isFree = s => !isHabit(s);

// Any checkmark in the day rows (C..P) of any month tab.
function hasAnyTick(monthGrids) {
  for (const grid of monthGrids || []) {
    if (!grid) continue;
    for (const ws of WEEK_START_ROWS) {
      for (let d = 0; d < 7; d++) {
        const row = grid[ws + d];
        if (!row) continue;
        for (let c = FIRST_MONTH_COL; c < FIRST_MONTH_COL + SLOTS; c++) if (isChecked(row[c])) return true;
      }
    }
  }
  return false;
}

const isOnboarded = marker => text(marker) === ONBOARDED_MARK;

// Still in onboarding: Z1 not marked and not a single checkmark in the year.
// Nothing has history yet, so a habit can be renamed where it stands.
const inOnboarding = (marker, monthGrids) => !isOnboarded(marker) && !hasAnyTick(monthGrids);

module.exports = {
  TAB, PER_TYPE, SLOTS,
  HABITS_RANGE, FOCUS_RANGE, FOCUS_CELL, ONBOARDED_CELL, ONBOARDED_MARK,
  rowRange, readSlots, isHabit, isFree, hasAnyTick, isOnboarded, inOnboarding
};
