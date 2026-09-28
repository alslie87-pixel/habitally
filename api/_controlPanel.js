// The Control Panel layout, in one place.
//
// Habit slots are rows 7-20, and the ROW decides everything: rows 7-13 are
// the bad habits (month-tab columns C..I), rows 14-20 the good ones (J..P).
//   F = habit name · G = status · H = note
// Column E is a label for people ("bad habit calendar slot 1 --->") and is
// never read or written: the type comes from the row alone.
//
// Focus habits: found by their labels, because not every copy of the sheet
// has them on the same row. "Building:" (good) and "Eliminating:" (bad) sit
// somewhere in columns A-D of rows 1-60 — B19/B20 in the master, one row
// further down in some copies — and the focus itself is the cell to the
// RIGHT of the label. When a label is missing, the master cells C19/C20
// are assumed.
//
// Z1 = the hidden app-onboarded marker.
//
// The app writes only F/G/H in rows 7-20, the two focus cells and Z1. The
// rest of the Control Panel is protected in the sheet.

const TAB = "'⚙️ Control Panel'";
const FIRST_ROW = 7;
const PER_TYPE = 7;
const SLOTS = PER_TYPE * 2;
const FIRST_MONTH_COL = 2; // C, 0-based: slot i sits in month-tab column C + i

const HABITS_RANGE = TAB + '!F7:H20';
const FOCUS_SEARCH_RANGE = TAB + '!A1:E60'; // labels in A..D, the value one column right
const FOCUS_LABELS = { good: 'building:', bad: 'eliminating:' };
const FOCUS_DEFAULT = { good: { row: 19, col: 3 }, bad: { row: 20, col: 3 } }; // C19 / C20
const FOCUS_LABEL_COLS = 4;                 // labels are searched in A..D only
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

// Values of FOCUS_SEARCH_RANGE -> where each focus lives and what it holds:
//   { good: { cell, value, found }, bad: { ... } }
// cell is the A1 range update-focus writes to, value the habit name ('' when
// empty), found false when the label was not seen and C19/C20 is assumed.
function findFocus(values) {
  const rows = values || [];
  const out = {};
  Object.keys(FOCUS_LABELS).forEach(type => {
    const label = FOCUS_LABELS[type];
    let pos = null;
    for (let r = 0; r < rows.length && !pos; r++) {
      const row = rows[r] || [];
      for (let c = 0; c < FOCUS_LABEL_COLS; c++) {
        if (text(row[c]).toLowerCase() === label) { pos = { row: r + 1, col: c + 2 }; break; }
      }
    }
    const found = !!pos;
    if (!pos) pos = FOCUS_DEFAULT[type];
    const valueRow = rows[pos.row - 1] || [];
    out[type] = {
      found,
      cell: TAB + '!' + String.fromCharCode(64 + pos.col) + pos.row,
      value: text(valueRow[pos.col - 1])
    };
  });
  return out;
}

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
  HABITS_RANGE, FOCUS_SEARCH_RANGE, ONBOARDED_CELL, ONBOARDED_MARK,
  rowRange, readSlots, isHabit, isFree, findFocus, hasAnyTick, isOnboarded, inOnboarding
};
