// Shared input validation for the write endpoints (checklist item 1.2).
//
// Month grid (per month tab): day rows are sheet rows 2-8, 11-17, 20-26,
// 29-35 and 38-44; habit checkbox columns are C..P (1-based 3..16, bad in
// C..I, good in J..P). Everything outside that is Control Panel, headers or
// formulas and must never be written by toggle-habit.
//
// Control Panel habit slots: see _controlPanel.js. Row position decides the
// type and the column in the month tabs, exactly like get-habits.

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const WEEK_START_ROWS = [2, 11, 20, 29, 38];
const DAY_ROWS = new Set();
WEEK_START_ROWS.forEach(ws => { for (let d = 0; d < 7; d++) DAY_ROWS.add(ws + d); });

const COL_MIN = 3;   // C
const COL_MAX = 16;  // P
const TYPES = ['bad', 'good'];
const NAME_MAX = 60;
const NOTE_MAX = 500;

// Accepts numbers and numeric strings; returns an integer or null.
function toInt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

const isMonthName = s => typeof s === 'string' && MONTHS.includes(s);
const isDayRow    = n => Number.isInteger(n) && DAY_ROWS.has(n);
const isHabitCol  = n => Number.isInteger(n) && n >= COL_MIN && n <= COL_MAX;
const isType      = t => typeof t === 'string' && TYPES.includes(t);
const isChecked   = v => v === true || v === 'TRUE';

// Trims, replaces control characters (Unicode category Cc) with spaces, and returns:
//   ''     when missing/empty
//   null   when longer than max
//   string otherwise
function textField(v, max) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\p{Cc}/gu, ' ').trim();
  return s.length > max ? null : s;
}

// CORS preflight + POST-only. Returns false when the response is already sent.
function requirePost(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return false; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return false; }
  return true;
}

module.exports = {
  MONTHS, DAY_ROWS, COL_MIN, COL_MAX, TYPES, NAME_MAX, NOTE_MAX,
  toInt, isMonthName, isDayRow, isHabitCol, isType, isChecked,
  textField, requirePost
};
