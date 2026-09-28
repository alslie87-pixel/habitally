// The streak rule, in one place (checklist item 1.4) — plus the small
// sheet-value helpers everything else shares.
//
// A streak is the number of consecutive past days, counting backwards from
// yesterday, where at least THRESHOLD (66%) of the active good habits are
// checked. Today never counts: the day is not over yet, so a half-finished
// day must not break the streak. A missing day breaks it.
//
// The computation itself lives in _timeline.js (streakOf), because the
// days come from the one timeline across the years: the live sheet plus
// the "Archive <year>" tabs. A streak therefore survives new year — the
// sheet's rollover archives every day row before it clears the grid.
//
// get-habits derives the number for its response only. Dashboard C7
// belongs to the sheet's own Apps Script, so nothing here writes.

const THRESHOLD = 0.66;
const FOCUS_WINDOW_DAYS = 30; // the "X / 30" counter on the focus cards

const pad2 = n => (n < 10 ? '0' : '') + n;
const isoOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

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

module.exports = { serialToDate, isChecked, isoOf, THRESHOLD, FOCUS_WINDOW_DAYS };
