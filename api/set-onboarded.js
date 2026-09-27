const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');
const { requirePost } = require('./_validate');
const CP = require('./_controlPanel');


// Writes the hidden onboarding marker to Control Panel Z1.
// Once set, the app never shows onboarding again for this sheet.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!requirePost(req, res)) return;
  try {
    const sheetId = await resolveSheetId(req);
    if (!sheetId) return res.status(404).json({ error: 'unknown user' });
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: CP.ONBOARDED_CELL,
      valueInputOption: 'RAW',
      requestBody: { values: [[CP.ONBOARDED_MARK]] }
    });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
