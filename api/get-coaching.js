const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');
const { todayFrom, isoLocal } = require('./_date');
const { checkDailyLimit } = require('./_ratelimit');

// v28: the coaching instruction is user-editable in
// Control Panel B26 ("AI COACHING PROMPT — Used by the web app").
// Falls back to a generic default if the cell is empty.
//
// Input is validated before anything is spent: weeklyPercent and streak
// must be numbers 0-100, weakestHabit at most 60 characters with control
// characters removed. Each user gets MAX_PER_DAY calls per day, counted in
// memory (see _ratelimit.js for what that does and does not guarantee).

const PROMPT_CELL = "'⚙️ Control Panel'!B26";
const MAX_PER_DAY = 5;
const HABIT_MAX = 60;

const DEFAULT_PROMPT =
  'Give me a coaching note: ' +
  '1. One honest sentence about my week. ' +
  '2. One specific thing to fix based on my weakest habit. ' +
  '3. One thing to protect that is already working. ' +
  '4. One sentence connecting my habits to my bigger goal. ' +
  'Keep it under 100 words. Be direct, not cheesy.';

const LIMIT_MESSAGE =
  "You've used today's " + MAX_PER_DAY + ' coaching notes. Come back tomorrow for a fresh one.';

// number or numeric string within [0, 100] -> number, else null
function pct(v) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

// trimmed, control characters (Unicode Cc) replaced, max HABIT_MAX -> string, else null
function habitText(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\p{Cc}/gu, ' ').trim();
  return s.length > HABIT_MAX ? null : s;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── 1. validate input (nothing spent yet) ──
    const body = req.body || {};
    const weeklyPercent = pct(body.weeklyPercent);
    const streak = pct(body.streak);
    const weakestHabit = habitText(body.weakestHabit);
    if (weeklyPercent === null) return res.status(400).json({ error: 'weeklyPercent must be a number 0-100' });
    if (streak === null)        return res.status(400).json({ error: 'streak must be a number 0-100' });
    if (weakestHabit === null)  return res.status(400).json({ error: 'weakestHabit too long (max ' + HABIT_MAX + ')' });

    // ── 2. resolve user (404 for unknown) ──
    const sheetId = await resolveSheetId(req);
    if (!sheetId) return res.status(404).json({ error: 'unknown user' });

    // ── 3. daily limit per user, bucketed by the user's own date ──
    const userKey = (req.query && req.query.user ? String(req.query.user) : 'default').trim().toLowerCase();
    const day = isoLocal(todayFrom(req));
    const limit = checkDailyLimit(userKey, day, MAX_PER_DAY);
    if (!limit.allowed) return res.status(429).json({ error: LIMIT_MESSAGE });

    // ── 4. read the user's own coaching prompt from the sheet ──
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
      'Weakest habit: ' + (weakestHabit || 'none') + '. ' +
      instruction + ' ' +
      'Use only plain ASCII characters, no special unicode.';

    // ── 5. OpenAI ──
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
    const clean = raw.replace(/[^ -~\n]/g, ' ').trim();

    return res.status(200).json({ coaching: clean, remaining: limit.remaining });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
