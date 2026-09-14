const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');


// ── v28 SHEET STRUCTURE ──────────────────────────────────────
// Control Panel: E=Type, F=Habit name, G=Status, H=Note (rows 7-20)
// Month tabs:    CP row 7→col C … row 13→I (bad), row 14→J … row 20→P (good)
// Habit hover notes live on month-tab header cells (row 1) and are
// synced here whenever a habit is added / replaced / removed.

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

function cpRowToMonthCol(sheetRow) { return sheetRow - 7 + 2; } // 0-based col index

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = await resolveSheetId(req);
    if (!sheetId) return res.status(404).json({ error: 'unknown user' });

    const { action, type, name, newName, note } = req.body;
    if (!action || !type) {
      return res.status(400).json({ error: 'Missing action or type' });
    }

    // Read Control Panel habit list — E6:H20 (row 6 header, rows 7-20 slots)
    const configRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "'⚙️ Control Panel'!E6:H20"
    });
    const rows = configRes.data.values || [];

    // rows[1] = sheet row 7 → sheetRow = arrayIdx + 6
    function toSheetRow(arrayIdx) { return arrayIdx + 6; }

    let targetRowIdx = -1;
    let emptySlotIdx = -1;

    for (let i = 1; i < rows.length; i++) {
      const rowType   = (rows[i][0] || '').toString().trim().toLowerCase();
      const rowName   = (rows[i][1] || '').toString().trim();
      const rowStatus = (rows[i][2] || '').toString().trim().toLowerCase();

      // empty slots must match the type's row band (bad 7-13, good 14-20)
      const sheetRow = toSheetRow(i);
      const inBand = type === 'bad' ? sheetRow <= 13 : sheetRow >= 14;

      if (rowType === type && rowName === name) targetRowIdx = i;
      if (inBand && (rowStatus === 'empty' || (!rowName && !rowType)) && emptySlotIdx === -1) emptySlotIdx = i;
    }

    const activeCount = rows.slice(1).filter(r =>
      (r[0] || '').toString().trim().toLowerCase() === type &&
      (r[2] || '').toString().trim().toLowerCase() === 'active'
    ).length;

    // ── note sync: write hover note on month-tab header cells ──
    async function syncHeaderNote(cpSheetRow, noteText) {
      try {
        const meta = await sheets.spreadsheets.get({
          spreadsheetId: sheetId,
          fields: 'sheets.properties(sheetId,title)'
        });
        const byTitle = {};
        (meta.data.sheets || []).forEach(s => { byTitle[s.properties.title] = s.properties.sheetId; });
        const colIdx = cpRowToMonthCol(cpSheetRow);
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
      if (targetRowIdx === -1) return res.status(404).json({ error: 'Habit not found' });
      const rowNote   = (rows[targetRowIdx][3] || '').toString().toLowerCase();
      const oldStatus = (rows[targetRowIdx][2] || '').toString().trim().toLowerCase();
      const newStatus = type === 'bad'
        ? ((oldStatus === 'conquered' || rowNote.includes('conquered')) ? 'ghost' : 'empty')
        : 'retired';
      const sheetRow = toSheetRow(targetRowIdx);
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `'⚙️ Control Panel'!G${sheetRow}`,   // Status column
        valueInputOption: 'RAW',
        requestBody: { values: [[newStatus]] }
      });
      if (newStatus === 'empty') await syncHeaderNote(sheetRow, '');
      return res.status(200).json({ success: true, action: 'removed', newStatus });
    }

    if (action === 'replace') {
      if (targetRowIdx === -1) return res.status(404).json({ error: 'Habit not found' });
      if (!newName) return res.status(400).json({ error: 'Missing newName' });
      const rowNote   = (rows[targetRowIdx][3] || '').toString().toLowerCase();
      const oldStatus = (rows[targetRowIdx][2] || '').toString().trim().toLowerCase();
      const oldNewStatus = type === 'bad'
        ? ((oldStatus === 'conquered' || rowNote.includes('conquered')) ? 'ghost' : 'empty')
        : 'retired';
      const sheetRow = toSheetRow(targetRowIdx);
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `'⚙️ Control Panel'!G${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[oldNewStatus]] }
      });

      let newSlotRow = sheetRow;
      if (oldNewStatus !== 'empty') {
        if (emptySlotIdx !== -1 && emptySlotIdx !== targetRowIdx) {
          newSlotRow = toSheetRow(emptySlotIdx);
        } else {
          return res.status(400).json({ error: 'No free slot for this habit type' });
        }
      }
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `'⚙️ Control Panel'!E${newSlotRow}:H${newSlotRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[type, newName, 'active', note || '']] }
      });
      await syncHeaderNote(newSlotRow, note ? note + noteTail : '');
      return res.status(200).json({ success: true, action: 'replaced' });
    }

    if (action === 'add') {
      if (!newName) return res.status(400).json({ error: 'Missing newName' });
      if (activeCount >= 7) return res.status(400).json({ error: 'Maximum 7 habits reached' });
      if (emptySlotIdx === -1) return res.status(400).json({ error: 'No free slot for this habit type' });
      const slotRow = toSheetRow(emptySlotIdx);
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `'⚙️ Control Panel'!E${slotRow}:H${slotRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[type, newName, 'active', note || '']] }
      });
      await syncHeaderNote(slotRow, note ? note + noteTail : '');
      return res.status(200).json({ success: true, action: 'added', row: slotRow });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
