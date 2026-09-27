const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');
const V = require('./_validate');
const CP = require('./_controlPanel');


// Adds, renames and removes habits in the Control Panel.
//
// Slots come from _controlPanel.js: the ROW decides the type (7-13 bad,
// 14-20 good) and the month-tab column. Only F (name), G (status) and
// H (note) are written; column E is never touched.
// Habit hover notes live on month-tab header cells (row 1) and are
// synced here whenever a habit is added / replaced / removed.
//
// Renaming normally retires the old habit and starts the new one in a free
// slot, so the old column keeps its history. During onboarding (Z1 not
// marked, not a single checkmark) there is no history to keep, so a rename
// overwrites the name in the same slot instead.

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

const MIN_ACTIVE = 3; // per type; matches the onboarding rule "min 3 + 3"

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (!V.requirePost(req, res)) return;

  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = await resolveSheetId(req);
    if (!sheetId) return res.status(404).json({ error: 'unknown user' });

    // ── input validation ──
    const body = req.body || {};
    const action  = body.action;
    const type    = body.type;
    const name    = V.textField(body.name, V.NAME_MAX);
    const newName = V.textField(body.newName, V.NAME_MAX);
    const note    = V.textField(body.note, V.NOTE_MAX);
    const hasNote = body.note !== undefined && body.note !== null;
    if (!['add', 'replace', 'remove'].includes(action)) return res.status(400).json({ error: 'Unknown action' });
    if (!V.isType(type))  return res.status(400).json({ error: 'Invalid type' });
    if (name === null)    return res.status(400).json({ error: 'name too long (max ' + V.NAME_MAX + ')' });
    if (newName === null) return res.status(400).json({ error: 'newName too long (max ' + V.NAME_MAX + ')' });
    if (note === null)    return res.status(400).json({ error: 'note too long (max ' + V.NOTE_MAX + ')' });
    if (action !== 'add' && !name) return res.status(400).json({ error: 'Missing name' });

    // Habit slots; a rename also needs the onboarding state (Z1 + every
    // month tab's checkmarks). One batchGet either way.
    const ranges = [CP.HABITS_RANGE];
    if (action === 'replace') ranges.push(CP.ONBOARDED_CELL, ...MONTHS.map(m => `'${m}'!A1:P46`));
    const batch = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const vr = batch.data.valueRanges || [];
    const slots = CP.readSlots(vr[0] && vr[0].values);

    // Everything below happens inside this type's own rows.
    const band = slots.filter(s => s.type === type);
    const named = band.filter(s => CP.isHabit(s) && s.name === name);
    const target = named.find(s => s.status === 'active') || named[0] || null;
    const freeSlot = band.find(CP.isFree) || null;
    const activeCount = band.filter(s => s.name && s.status === 'active').length;

    const write = (range, values) => sheets.spreadsheets.values.update({
      spreadsheetId: sheetId, range, valueInputOption: 'RAW', requestBody: { values }
    });
    // F:H of a slot: the habit starts here, active, with its note
    const startHabit = slot => write(CP.rowRange(slot.row, 'F', 'H'), [[newName, 'active', note || '']]);

    // Bad habits you beat keep their place as a ghost; other bad habits free
    // their slot. Good habits are retired so their column keeps its history.
    const leavingStatus = slot => type === 'bad'
      ? ((slot.status === 'conquered' || slot.note.toLowerCase().includes('conquered')) ? 'ghost' : 'empty')
      : 'retired';

    // ── note sync: write hover note on month-tab header cells ──
    async function syncHeaderNote(slot, noteText) {
      try {
        const meta = await sheets.spreadsheets.get({
          spreadsheetId: sheetId,
          fields: 'sheets.properties(sheetId,title)'
        });
        const byTitle = {};
        (meta.data.sheets || []).forEach(s => { byTitle[s.properties.title] = s.properties.sheetId; });
        const colIdx = slot.colIndex;
        const requests = MONTHS.filter(m => byTitle[m] !== undefined).map(m => ({
          updateCells: {
            range: {
              sheetId: byTitle[m],
              startRowIndex: 0, endRowIndex: 1,
              startColumnIndex: colIdx, endColumnIndex: colIdx + 1
            },
            rows: [{ values: [{ note: noteText || '' }] }],
            fields: 'note'
          }
        }));
        if (requests.length) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            requestBody: { requests }
          });
        }
      } catch (e) {
        console.error('Note sync failed:', e.message);
      }
    }

    const noteTail = '\n\nEdit in ⚙️ Control Panel → Note column.';

    if (action === 'remove') {
      if (!target) return res.status(404).json({ error: 'Habit not found' });
      // Keep at least MIN_ACTIVE active habits of each type. Only removing an
      // *active* habit lowers the count; retiring a conquered one does not.
      if (target.status === 'active' && activeCount - 1 < MIN_ACTIVE) {
        const label = type === 'bad' ? 'habits to avoid' : 'habits to build';
        return res.status(400).json({
          error: 'You need at least ' + MIN_ACTIVE + ' ' + label + '. Add a replacement first, then remove this one.'
        });
      }
      const newStatus = leavingStatus(target);
      await write(CP.rowRange(target.row, 'G'), [[newStatus]]);   // Status column
      if (newStatus === 'empty') await syncHeaderNote(target, '');
      return res.status(200).json({ success: true, action: 'removed', newStatus });
    }

    if (action === 'replace') {
      if (!target) return res.status(404).json({ error: 'Habit not found' });
      if (!newName) return res.status(400).json({ error: 'Missing newName' });

      // During onboarding: same slot, new name. The note only when it changed.
      const marker = vr[1] && vr[1].values && vr[1].values[0] && vr[1].values[0][0];
      const monthGrids = vr.slice(2).map(r => (r && r.values) || []);
      if (CP.inOnboarding(marker, monthGrids)) {
        const noteChanged = hasNote && note !== target.note;
        const data = [{ range: CP.rowRange(target.row, 'F'), values: [[newName]] }];
        if (noteChanged) data.push({ range: CP.rowRange(target.row, 'H'), values: [[note]] });
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: { valueInputOption: 'RAW', data }
        });
        if (noteChanged) await syncHeaderNote(target, note ? note + noteTail : '');
        return res.status(200).json({ success: true, action: 'renamed', row: target.row });
      }

      const oldStatus = leavingStatus(target);
      if (oldStatus === 'empty') {
        // the old habit frees its slot, so the new one takes it over
        await startHabit(target);
        await syncHeaderNote(target, note ? note + noteTail : '');
        return res.status(200).json({ success: true, action: 'replaced' });
      }
      // The old habit keeps its slot, so the new one needs a free slot. Check
      // before writing anything: never retire a habit with nowhere to go.
      if (!freeSlot) return res.status(400).json({ error: 'No free slot for this habit type' });
      await write(CP.rowRange(target.row, 'G'), [[oldStatus]]);
      await startHabit(freeSlot);
      await syncHeaderNote(freeSlot, note ? note + noteTail : '');
      return res.status(200).json({ success: true, action: 'replaced' });
    }

    if (action === 'add') {
      if (!newName) return res.status(400).json({ error: 'Missing newName' });
      if (activeCount >= CP.PER_TYPE) return res.status(400).json({ error: 'Maximum 7 habits reached' });
      if (!freeSlot) return res.status(400).json({ error: 'No free slot for this habit type' });
      await startHabit(freeSlot);
      await syncHeaderNote(freeSlot, note ? note + noteTail : '');
      return res.status(200).json({ success: true, action: 'added', row: freeSlot.row });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
