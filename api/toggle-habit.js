const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');
const V = require('./_validate');

// Flips one habit checkbox for one day. The current value is read from the
// sheet, never trusted from the client, so two devices toggling the same
// cell cannot desynchronise it. Only day rows in the C..P band of one of
// the twelve month tabs can be written.

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

    const colLetter = String.fromCharCode(64 + col);
    const range = `'${sheetName}'!${colLetter}${row}`;

    const cur = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const currentValue = V.isChecked(cur.data.values && cur.data.values[0] && cur.data.values[0][0]);
    const newValue = !currentValue;

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newValue]] }
    });
    res.status(200).json({ success: true, newValue });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};
