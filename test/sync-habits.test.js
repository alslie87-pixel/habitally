// Batched tick writes (feature/batched-tick-sync).
//
// The app queues taps and flushes them to /api/sync-habits as one call;
// the endpoint must turn a flush into exactly ONE batchUpdate, refuse bad
// cells whole, and apply the same year gate as toggle-habit. Everything
// runs against fake in-memory sheets; the real sheet is never touched.
//
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');

const { outOfYearMessage } = require('../api/_year');
const { buildYear, fakeRes, withFakeGoogleapis } = require('./helpers');

const state = {
  grids: buildYear(2026),
  batchGets: [],
  batchUpdates: []
};

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

const fakeGoogle = {
  auth: { GoogleAuth: class { constructor() {} } },
  sheets: () => ({
    spreadsheets: {
      values: {
        batchGet: async ({ ranges }) => {
          state.batchGets.push(ranges);
          return { data: { valueRanges: ranges.map(range => {
            const m = /^'([^']+)'!/.exec(range);
            const mi = MONTHS.indexOf(m && m[1]);
            if (mi === -1) throw new Error('unexpected range in test: ' + range);
            return { values: state.grids[mi] };
          }) } };
        },
        batchUpdate: async args => { state.batchUpdates.push(args); return {}; },
        get: async () => { throw new Error('unexpected values.get in test'); },
        update: async () => { throw new Error('unexpected single-cell update in test'); }
      }
    }
  })
};

const syncHabits = withFakeGoogleapis(fakeGoogle, () => require('../api/sync-habits'));

process.env.GOOGLE_SERVICE_ACCOUNT = '{"type":"service_account"}';
process.env.GOOGLE_SHEET_ID = 'fake-sheet-for-tests';
delete process.env.CUSTOMERS_SHEET_ID;

async function call(dateStr, changes) {
  state.batchGets = [];
  state.batchUpdates = [];
  const res = fakeRes();
  await syncHabits({ method: 'POST', query: { date: dateStr }, body: { changes } }, res);
  return res;
}

test('a flush becomes one batchUpdate; the last change per cell wins', async () => {
  state.grids = buildYear(2026);
  const res = await call('2026-06-15', [
    { sheetName: 'June', row: 20, col: 10, value: true },
    { sheetName: 'June', row: 21, col: 3,  value: true },
    { sheetName: 'June', row: 20, col: 10, value: false }  // spammed: overrides the first
  ]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.applied, 2);

  assert.equal(state.batchUpdates.length, 1);          // ONE write for the whole flush
  const req = state.batchUpdates[0].requestBody;
  assert.equal(req.valueInputOption, 'USER_ENTERED');
  assert.deepEqual(req.data, [
    { range: "'June'!J20", values: [[false]] },
    { range: "'June'!C21", values: [[true]] }
  ]);
  assert.equal(state.batchGets.length, 1);             // one gate read of the one tab
  assert.deepEqual(state.batchGets[0], ["'June'!A1:P46"]);
});

test('an invalid cell refuses the whole flush and writes nothing', async () => {
  state.grids = buildYear(2026);
  for (const bad of [
    { sheetName: 'June', row: 20, col: 2,  value: true },   // col B: not a habit col
    { sheetName: 'June', row: 9,  col: 10, value: true },   // summary row
    { sheetName: 'Nope', row: 20, col: 10, value: true },   // unknown tab
    { sheetName: 'June', row: 20, col: 10, value: 'TRUE' }  // value must be a boolean
  ]) {
    const res = await call('2026-06-15', [
      { sheetName: 'June', row: 21, col: 10, value: true }, bad
    ]);
    assert.equal(res.statusCode, 400);
    assert.equal(state.batchUpdates.length, 0);
  }
});

test('an empty or oversized flush is refused', async () => {
  let res = await call('2026-06-15', []);
  assert.equal(res.statusCode, 400);
  res = await call('2026-06-15', Array.from({ length: 101 }, () =>
    ({ sheetName: 'June', row: 20, col: 10, value: true })));
  assert.equal(res.statusCode, 400);
  assert.equal(state.batchUpdates.length, 0);
});

test('ticks into a sheet whose year is over are refused whole (409)', async () => {
  state.grids = buildYear(2029);                       // ends 30 Dec 2029
  const res = await call('2029-12-31', [
    { sheetName: 'December', row: 29, col: 10, value: true }
  ]);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, outOfYearMessage());
  assert.equal(state.batchUpdates.length, 0);
});

test('1-2 January still writes into the old sheet\'s December tab', async () => {
  state.grids = buildYear(2026);                       // runs to 3 Jan 2027
  const res = await call('2027-01-02', [
    { sheetName: 'December', row: 43, col: 10, value: true }
  ]);
  assert.equal(res.statusCode, 200);
  assert.equal(state.batchUpdates.length, 1);
  assert.deepEqual(state.batchUpdates[0].requestBody.data,
    [{ range: "'December'!J43", values: [[true]] }]);
});
