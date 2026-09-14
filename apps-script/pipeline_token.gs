/**
 * HabiTally — link token for the Customers pipeline (checklist item 1.1).
 *
 * Paste this file into the Apps Script project bound to the Customers sheet,
 * next to pipeline_code.gs. Then, in the function that processes one customer
 * row (creates the sheet and sends the e-mail), replace the current appLink
 * construction with:
 *
 *   var token   = ensureToken_(sheet, rowIndex);          // 1-based row
 *   var appLink = buildAppLink_(name, token);             // name = column A
 *
 * and make sure ensureTokenHeader_(sheet) runs once (e.g. at the top of the
 * pipeline entry point). Existing customers need backfillTokens() run once
 * from the menu or the editor; until they have a token their old links stop
 * working after the API change ships.
 *
 * Customers sheet layout: A Fornavn · B E-post · C Status · D Sheet-lenke ·
 * E Sendt · F Token (new).
 */

var TOKEN_COL    = 6;                 // F
var TOKEN_HEADER = 'Token';
var TOKEN_LEN    = 16;
var TOKEN_CHARS  = 'abcdefghijklmnopqrstuvwxyz0123456789';
var APP_BASE     = 'https://habit-tracker-tau-tan.vercel.app/';

/** Random a-z0-9 token. Bytes come from SHA-256 over a UUID + time, with
 *  rejection sampling so every character is equally likely. */
function generateToken_() {
  var out = '';
  while (out.length < TOKEN_LEN) {
    var seed  = Utilities.getUuid() + Date.now() + Math.random();
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed);
    for (var i = 0; i < bytes.length && out.length < TOKEN_LEN; i++) {
      var b = bytes[i] & 0xff;
      if (b >= 252) continue;                 // 252 = 7 * 36 → no modulo bias
      out += TOKEN_CHARS.charAt(b % TOKEN_CHARS.length);
    }
  }
  return out;
}

/** Writes the "Token" header in F1 if the cell is empty. */
function ensureTokenHeader_(sheet) {
  var cell = sheet.getRange(1, TOKEN_COL);
  if (!String(cell.getValue()).trim()) cell.setValue(TOKEN_HEADER);
}

/** Returns the token for a row, generating and writing one if F is empty. */
function ensureToken_(sheet, rowIndex) {
  var cell  = sheet.getRange(rowIndex, TOKEN_COL);
  var token = String(cell.getValue()).trim();
  if (!/^[a-z0-9]{16}$/.test(token)) {
    token = generateToken_();
    cell.setValue(token);
  }
  return token;
}

/** App link with both user and token: ?user=<name>&t=<token>. */
function buildAppLink_(name, token) {
  return APP_BASE + '?user=' + encodeURIComponent(String(name).trim()) + '&t=' + token;
}

/** One-off: give every existing customer row a token. Safe to re-run; rows
 *  that already have a valid token are left untouched. Run from the editor or
 *  add it to the pipeline menu. */
function backfillTokens() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers')
           || SpreadsheetApp.getActiveSheet();
  ensureTokenHeader_(sheet);
  var last = sheet.getLastRow();
  var added = 0;
  for (var r = 2; r <= last; r++) {
    var name = String(sheet.getRange(r, 1).getValue()).trim();
    if (!name) continue;
    var before = String(sheet.getRange(r, TOKEN_COL).getValue()).trim();
    var token  = ensureToken_(sheet, r);
    if (token !== before) added++;
  }
  SpreadsheetApp.getUi().alert('Tokens: ' + added + ' generert, ' + (last - 1 - added) + ' uendret.');
}
