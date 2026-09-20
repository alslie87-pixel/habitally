const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');
const { todayFrom } = require('./_date');
const { isChecked } = require('./_streak');
const { sheetYearFrom, yearState, outOfYearMessage } = require('./_year');
const V = require('./_validate');

// Flips one habit checkbox for one day. Nothing else.
//
// This endpoint used to mirror the streak into Dashboard C7, which meant
// reading the Control Panel and a second month tab on every tap. The sheet's
// own Apps Script owns that cell now, so a tick costs one read and one write.
// get-habits still derives a streak for the app to display.
//
// The current value is read from the sheet, never trusted from the client,
// so two devices toggling the same cell cannot desynchronise it. Only day
// rows in the C..P band of one of the twelve month tabs can be written.

const GRID = '!A1:P46';

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

    // The whole grid, not just the one cell: the year gate reads the dates
    // out of it, and the current value comes from the same response.
    const today = todayFrom(req);
    const gridRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "'" + sheetName + "'" + GRID,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const targetGrid = gridRes.data.values || [];

    // A tick on last year's grid builds up data that disappears when the
    // sheet is rolled over, so refuse it and say why.
    const year = yearState(sheetYearFrom(targetGrid), today);
    if (year.outOfYear) {
      return res.status(409).json({ success: false, error: outOfYearMessage(year.currentYear) });
    }

    const currentValue = isChecked((targetGrid[row - 1] || [])[col - 1]);
    const newValue = !currentValue;
    const colLetter = String.fromCharCode(64 + col);

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "'" + sheetName + "'!" + colLetter + row,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newValue]] }
    });

    res.status(200).json({ success: true, newValue });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};
