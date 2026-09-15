const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');
const V = require('./_validate');

// v28 sheet: Focus habits live in Control Panel C20 (good/Building)
// and C21 (bad/Eliminating). habitName must be an active habit of that
// type in the Control Panel; anything else is rejected.

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

    const habits = await V.readActiveHabits(sheets, sheetId);
    if (!habits[type].includes(habitName)) {
      return res.status(400).json({ success: false, error: 'Unknown habit' });
    }

    const cell = type === 'good'
      ? "'⚙️ Control Panel'!C20"
      : "'⚙️ Control Panel'!C21";
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: cell,
      valueInputOption: 'RAW',
      requestBody: { values: [[habitName]] }
    });
    res.status(200).json({ success: true, newHabit: habitName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};
