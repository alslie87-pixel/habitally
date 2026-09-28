const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');
const V = require('./_validate');
const CP = require('./_controlPanel');

// The focus cells are found by their Building:/Eliminating: labels in the
// Control Panel (see _controlPanel.js), since not every copy of the sheet
// has them on the same row. habitName must be an active habit of that type
// in the Control Panel; anything else is rejected.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!V.requirePost(req, res)) return;
  try {
    const body = req.body || {};
    const type = body.type;
    const habitName = V.textField(body.habitName, V.NAME_MAX);
    if (!V.isType(type))    return res.status(400).json({ success: false, error: 'Invalid type' });
    if (habitName === null) return res.status(400).json({ success: false, error: 'habitName too long' });
    if (!habitName)         return res.status(400).json({ success: false, error: 'Missing habitName' });

    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = await resolveSheetId(req);
    if (!sheetId) return res.status(404).json({ error: 'unknown user' });

    // One batchGet: the habit list to validate against, and the label area
    // that says which cell the focus of this type lives in.
    const batch = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges: [CP.HABITS_RANGE, CP.FOCUS_SEARCH_RANGE]
    });
    const vr = batch.data.valueRanges || [];

    const active = CP.readSlots((vr[0] && vr[0].values))
      .filter(s => s.type === type && s.name && s.status === 'active')
      .map(s => s.name);
    if (!active.includes(habitName)) {
      return res.status(400).json({ success: false, error: 'Unknown habit' });
    }

    const focus = CP.findFocus((vr[1] && vr[1].values) || []);

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: focus[type].cell,
      valueInputOption: 'RAW',
      requestBody: { values: [[habitName]] }
    });
    res.status(200).json({ success: true, newHabit: habitName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};
