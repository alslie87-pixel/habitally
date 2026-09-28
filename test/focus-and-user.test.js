// Focus cells found by their labels + two customers sharing a first name
// (fix/focus-label-same-name).
//
// Both layouts seen in the real sheets are covered: the master has
// "Building:" in B19 / focus in C19 and "Eliminating:" in B20 / focus in
// C20; Martin's test sheet has the same labels one row further down
// (B20/C20 and B21/C21). Without labels the master cells C19/C20 are used.
//
// Everything runs against fake in-memory sheets: googleapis is replaced
// with a fake, writes are captured instead of sent, and an unexpected
// range fails the test. The real sheet is never touched.
//
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');

const CP = require('../api/_controlPanel');
const V = require('../api/_validate');
const { buildYear, makeCpRows, buildFocusGrid, fakeRes, withFakeGoogleapis } = require('./helpers');

const MONTHS = V.MONTHS;
const CUSTOMERS_ID = 'fake-customers';
const cell = a1 => CP.TAB + '!' + a1;

// ── findFocus ──────────────────────────────────────────────

test('findFocus: master layout (labels B19/B20, focus C19/C20)', () => {
  const f = CP.findFocus(buildFocusGrid());
  assert.deepEqual(f.good, { found: true, cell: cell('C19'), value: 'Exercise' });
  assert.deepEqual(f.bad,  { found: true, cell: cell('C20'), value: 'No sugar' });
});

test('findFocus: Martin layout, one row further down (C20/C21)', () => {
  const f = CP.findFocus(buildFocusGrid({ goodRow: 20, badRow: 21 }));
  assert.deepEqual(f.good, { found: true, cell: cell('C20'), value: 'Exercise' });
  assert.deepEqual(f.bad,  { found: true, cell: cell('C21'), value: 'No sugar' });
});

test('findFocus: labels in column D put the focus in column E', () => {
  const f = CP.findFocus(buildFocusGrid({ goodRow: 5, badRow: 6, labelCol: 3 }));
  assert.deepEqual(f.good, { found: true, cell: cell('E5'), value: 'Exercise' });
  assert.deepEqual(f.bad,  { found: true, cell: cell('E6'), value: 'No sugar' });
});

test('findFocus: no labels falls back to C19/C20 and still reads them', () => {
  const f = CP.findFocus(buildFocusGrid({ labels: false }));
  assert.deepEqual(f.good, { found: false, cell: cell('C19'), value: 'Exercise' });
  assert.deepEqual(f.bad,  { found: false, cell: cell('C20'), value: 'No sugar' });
});

test('findFocus: an empty Control Panel gives the fallback cells, empty values', () => {
  const f = CP.findFocus([]);
  assert.deepEqual(f.good, { found: false, cell: cell('C19'), value: '' });
  assert.deepEqual(f.bad,  { found: false, cell: cell('C20'), value: '' });
});

// ── the endpoints, with googleapis faked ───────────────────

// One fake serves every endpoint in this file. batchGet answers each range
// by what it names (month tab, habit slots, focus label area, Z1);
// values.get only answers the Customers sheet; writes are captured, never
// sent. Anything else fails the test.
const state = {
  monthGrids: buildYear(2026),
  cpRows: makeCpRows(),
  focusGrid: buildFocusGrid(),
  customersRows: [],
  tabs: MONTHS.concat(['⚙️ Control Panel']), // no "Archive <year>" tab: a new customer
  updates: []
};

function serveRange(range) {
  const m = /^'([^']+)'!/.exec(range);
  const tab = m ? MONTHS.indexOf(m[1]) : -1;
  if (tab !== -1) return { values: state.monthGrids[tab] };
  if (range === CP.HABITS_RANGE) return { values: state.cpRows };
  if (range === CP.FOCUS_SEARCH_RANGE) return { values: state.focusGrid };
  if (range === CP.ONBOARDED_CELL) return { values: [['']] };
  throw new Error('unexpected range in test: ' + range);
}

const fakeGoogle = {
  auth: { GoogleAuth: class { constructor() {} } },
  sheets: () => ({
    spreadsheets: {
      get: async () => ({ data: { sheets: state.tabs.map(t => ({ properties: { title: t } })) } }),
      values: {
        batchGet: async ({ ranges }) => ({ data: { valueRanges: ranges.map(serveRange) } }),
        get: async ({ spreadsheetId }) => {
          if (spreadsheetId === CUSTOMERS_ID) return { data: { values: state.customersRows } };
          throw new Error('unexpected values.get in test: ' + spreadsheetId);
        },
        update: async args => { state.updates.push(args); return {}; }
      }
    }
  })
};

const { updateFocus, getHabits, getStats, resolveSheetId } = withFakeGoogleapis(fakeGoogle, () => ({
  updateFocus: require('../api/update-focus'),
  getHabits: require('../api/get-habits'),
  getStats: require('../api/get-stats'),
  resolveSheetId: require('../api/_user').resolveSheetId
}));

process.env.GOOGLE_SERVICE_ACCOUNT = '{"type":"service_account"}';
process.env.GOOGLE_SHEET_ID = 'fake-sheet-for-tests';

const singleUser = () => { delete process.env.CUSTOMERS_SHEET_ID; };
const multiUser = () => { process.env.CUSTOMERS_SHEET_ID = CUSTOMERS_ID; };

async function callUpdateFocus(focusGrid, type, habitName) {
  singleUser();
  state.focusGrid = focusGrid;
  state.updates = [];
  const res = fakeRes();
  await updateFocus({ method: 'POST', query: {}, body: { type, habitName } }, res);
  return res;
}

test('update-focus writes to C19/C20 on the master layout', async () => {
  let res = await callUpdateFocus(buildFocusGrid(), 'good', 'Read');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].range, cell('C19'));
  assert.deepEqual(state.updates[0].requestBody.values, [['Read']]);

  res = await callUpdateFocus(buildFocusGrid(), 'bad', 'No sugar');
  assert.equal(res.statusCode, 200);
  assert.equal(state.updates[0].range, cell('C20'));
});

test('update-focus follows the labels on the Martin layout (C20/C21)', async () => {
  const grid = buildFocusGrid({ goodRow: 20, badRow: 21 });
  let res = await callUpdateFocus(grid, 'good', 'Exercise');
  assert.equal(res.statusCode, 200);
  assert.equal(state.updates[0].range, cell('C20'));

  res = await callUpdateFocus(grid, 'bad', 'No sugar');
  assert.equal(res.statusCode, 200);
  assert.equal(state.updates[0].range, cell('C21'));
});

test('update-focus without labels writes to the fallback cell C19', async () => {
  const res = await callUpdateFocus(buildFocusGrid({ labels: false }), 'good', 'Exercise');
  assert.equal(res.statusCode, 200);
  assert.equal(state.updates[0].range, cell('C19'));
});

test('update-focus still rejects a habit that is not active, and writes nothing', async () => {
  const res = await callUpdateFocus(buildFocusGrid(), 'good', 'Not a habit');
  assert.equal(res.statusCode, 400);
  assert.equal(state.updates.length, 0);
});

test('get-habits reads the focus through the labels on the Martin layout', async () => {
  singleUser();
  state.focusGrid = buildFocusGrid({ goodRow: 20, badRow: 21 });
  const res = fakeRes();
  await getHabits({ method: 'GET', query: { date: '2026-06-15' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.goodFocus, 'Exercise');
  assert.equal(res.body.badFocus, 'No sugar');
  assert.equal(res.body.goodFocusFound, true);
  assert.equal(res.body.badFocusFound, true);
});

// ── two customers with the same first name ─────────────────

const TOKEN_ONE = 'aaaaaaaaaaaaaaa1';
const TOKEN_TWO = 'bbbbbbbbbbbbbbb2';
const sheetUrl = id => 'https://docs.google.com/spreadsheets/d/' + id + '/edit';

test('resolveSheetId: both Martins get their own sheet', async () => {
  multiUser();
  state.customersRows = [
    ['Martin', '', sheetUrl('SHEET-ONE'), '', '', TOKEN_ONE],
    ['martin', '', sheetUrl('SHEET-TWO'), '', '', TOKEN_TWO]
  ];
  // the second Martin used to be refused at the first name hit
  assert.equal(await resolveSheetId({ query: { user: 'Martin', t: TOKEN_TWO } }), 'SHEET-TWO');
  assert.equal(await resolveSheetId({ query: { user: 'martin', t: TOKEN_ONE } }), 'SHEET-ONE');
});

test('resolveSheetId: a wrong token still resolves to nothing', async () => {
  multiUser();
  state.customersRows = [
    ['Martin', '', sheetUrl('SHEET-ONE'), '', '', TOKEN_ONE],
    ['martin', '', sheetUrl('SHEET-TWO'), '', '', TOKEN_TWO]
  ];
  assert.equal(await resolveSheetId({ query: { user: 'martin', t: 'ccccccccccccccc3' } }), null);
});

test('get-habits answers 404 for a wrong token', async () => {
  multiUser();
  state.customersRows = [['Martin', '', sheetUrl('SHEET-ONE'), '', '', TOKEN_ONE]];
  const res = fakeRes();
  await getHabits({ method: 'GET', query: { user: 'martin', t: 'ddddddddddddddd4', date: '2026-06-15' } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, 'unknown user');
});

// ── a sheet without any Archive tab (a new customer) ───────

test('get-stats works when the sheet has no Archive tab', async () => {
  singleUser();
  state.focusGrid = buildFocusGrid();
  const res = fakeRes();
  await getStats({ method: 'GET', query: { date: '2026-06-15' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.error, 'error: ' + res.body.error);
  assert.equal(res.body.trophyCase.current.year, 2026);
  assert.deepEqual(res.body.trophyCase.past, []); // no archives, no past years
  assert.equal(res.body.habits.length, 3);
  assert.equal(res.body.needsOnboarding, false);
});
