// Shared input validation for the write endpoints (checklist item 1.2).
//
// Month grid (per month tab): day rows are sheet rows 2-8, 11-17, 20-26,
// 29-35 and 38-44; habit checkbox columns are C..P (1-based 3..16, bad in
// C..I, good in J..P). Everything outside that is Control Panel, headers or
// formulas and must never be written by toggle-habit.
//
// Control Panel habit slots: E6:H20 (row 6 header, rows 7-20 slots).
// E=Type, F=Habit name, G=Status, H=Note. Row position decides the column
// in the month tabs, exactly like get-habits.

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

const CP_HABITS_RANGE = "'⚙️ Control Panel'!E6:H20";

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

// Active habit names by type, from the Control Panel. Position-based like
// get-habits: bad habits live in slots 7-13, good in 14-20.
async function readActiveHabits(sheets, spreadsheetId) {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: CP_HABITS_RANGE });
  const rows = (r.data.values || []).slice(1); // drop header row 6
  const out = { bad: [], good: [] };
  rows.forEach((row, idx) => {
    const type   = (row[0] || '').toString().trim().toLowerCase();
    const name   = (row[1] || '').toString().trim();
    const status = (row[2] || '').toString().trim().toLowerCase();
    if (!name || status !== 'active') return;
    if (type === 'bad'  && idx <= 6) out.bad.push(name);
    if (type === 'good' && idx >= 7) out.good.push(name);
  });
  return out;
}

module.exports = {
  MONTHS, DAY_ROWS, COL_MIN, COL_MAX, TYPES, NAME_MAX, NOTE_MAX,
  toInt, isMonthName, isDayRow, isHabitCol, isType, isChecked,
  textField, requirePost, readActiveHabits
};
