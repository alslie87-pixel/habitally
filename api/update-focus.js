const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');


// v28 sheet: Focus habits live in Control Panel C20 (good/Building)
// and C21 (bad/Eliminating).

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { type, habitName } = req.body;
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = await resolveSheetId(req);
    if (!sheetId) return res.status(404).json({ error: 'unknown user' });
    const cell = type === 'good'
      ? "'⚙️ Control Panel'!C20"
      : "'⚙️ Control Panel'!C21";
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: cell,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[habitName]] }
    });
    res.status(200).json({ success: true, newHabit: habitName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};
