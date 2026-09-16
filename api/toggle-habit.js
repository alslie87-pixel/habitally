const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');
const { todayFrom } = require('./_date');
const { isChecked, activeGoodHabits, computeStreak } = require('./_streak');
const { sheetYearFrom, yearState, outOfYearMessage } = require('./_year');
const V = require('./_validate');

// Flips one habit checkbox for one day, then mirrors the new streak into
// Dashboard C7. The streak write used to live in get-habits, which forced
// write scope onto a read-only endpoint; a tick is the only thing that can
// change the value, so this is where it belongs.
//
// The current value is read from the sheet, never trusted from the client,
// so two devices toggling the same cell cannot desynchronise it. Only day
// rows in the C..P band of one of the twelve month tabs can be written.

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const GRID = '!A1:P46';
const CP_RANGE = "'⚙️ Control Panel'!E6:H20";
const STREAK_CELL = "'⚡ Dashboard'!C7";

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!V.requirePost(req, res)) return;
  try {
    const body = req.body || {};
    const sheetName = body.sheetName;
    const row = V.toInt(body.row);
    const col = V.toInt(body.col);
    if (!V.isMonthName(sheetName)) return res.status(400).json({ success: false, error: 'Invalid sheetName' });
    if (!V.isDayRow(row))          return res.status(400).json({ success: false, error: 'Invalid row' });
    if (!V.isHabitCol(col))        return res.status(400).json({ success: false, error: 'Invalid col' });

    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = await resolveSheetId(req);
    if (!sheetId) return res.status(404).json({ error: 'unknown user' });

    // The streak is always about the month that contains today, which is
    // normally the tab being ticked. Ask for both only when they differ.
    const today = todayFrom(req);
    const currentMonth = MONTHS[today.getMonth()];
    const ranges = ["'" + sheetName + "'" + GRID];
    if (currentMonth !== sheetName) ranges.push("'" + currentMonth + "'" + GRID);
    ranges.push(CP_RANGE);

    const batch = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const vr = batch.data.valueRanges || [];
    const targetGrid = (vr[0] && vr[0].values) || [];
    const monthGrid = currentMonth === sheetName
      ? targetGrid
      : ((vr[1] && vr[1].values) || []);
    const cpRows = (vr[vr.length - 1] && vr[vr.length - 1].values) || [];

    // A tick on last year's grid builds up data that disappears when the
    // sheet is rolled over, so refuse it and say why.
    const year = yearState(sheetYearFrom(targetGrid), today);
    if (year.outOfYear) {
      return res.status(409).json({ success: false, error: outOfYearMessage(year.currentYear) });
    }

    // ── 1. flip the cell ──
    const currentValue = isChecked((targetGrid[row - 1] || [])[col - 1]);
    const newValue = !currentValue;
    const colLetter = String.fromCharCode(64 + col);
    const range = "'" + sheetName + "'!" + colLetter + row;

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newValue]] }
    });

    // ── 2. mirror the streak into the Dashboard ──
    // Best effort: the tick is already saved, and a customer who deleted the
    // Dashboard tab should still be able to tick habits.
    let streak = null;
    try {
      if (monthGrid.length) {
        if (monthGrid === targetGrid) {
          // the tick lands in the month we are about to measure
          if (!monthGrid[row - 1]) monthGrid[row - 1] = [];
          monthGrid[row - 1][col - 1] = newValue;
        }
        streak = computeStreak(monthGrid, activeGoodHabits(cpRows), today);
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: STREAK_CELL,
          valueInputOption: 'RAW',
          requestBody: { values: [[streak]] }
        });
      }
    } catch (e) {
      console.error('Streak write failed:', e.message);
    }

    res.status(200).json({ success: true, newValue, streak });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};
