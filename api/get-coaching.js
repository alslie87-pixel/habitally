const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');


// v28: the coaching instruction is user-editable in
// Control Panel B26 ("AI COACHING PROMPT — Used by the web app").
// Falls back to a generic default if the cell is empty.

const PROMPT_CELL = "'⚙️ Control Panel'!B26";

const DEFAULT_PROMPT =
  'Give me a coaching note: ' +
  '1. One honest sentence about my week. ' +
  '2. One specific thing to fix based on my weakest habit. ' +
  '3. One thing to protect that is already working. ' +
  '4. One sentence connecting my habits to my bigger goal. ' +
  'Keep it under 100 words. Be direct, not cheesy.';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { weeklyPercent, streak, weakestHabit } = req.body;
    const sheetId = await resolveSheetId(req);
    if (!sheetId) return res.status(404).json({ error: 'unknown user' });

    // Read the user's own coaching prompt from the sheet
    let instruction = DEFAULT_PROMPT;
    try {
      const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
      const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });
      const sheets = google.sheets({ version: 'v4', auth });
      const cellRes = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: PROMPT_CELL
      });
      const cellVal = cellRes.data.values && cellRes.data.values[0] && cellRes.data.values[0][0];
      if (cellVal && String(cellVal).trim().length > 20) {
        instruction = String(cellVal).trim();
      }
    } catch (e) {
      console.error('Prompt read failed, using default:', e.message);
    }

    const prompt =
      'I have these habit tracker stats this week: ' +
      'Weekly completion: ' + weeklyPercent + '%. ' +
      'Current streak: ' + streak + ' days. ' +
      'Weakest habit: ' + weakestHabit + '. ' +
      instruction + ' ' +
      'Use only plain ASCII characters, no special unicode.';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200
      })
    });

    const data = await response.json();

    if (!data.choices || !data.choices[0]) {
      return res.status(500).json({ error: 'No response from AI' });
    }

    const raw = data.choices[0].message.content;
    const clean = raw.replace(/[^\x00-\x7F]/g, ' ').trim();

    return res.status(200).json({ coaching: clean });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
