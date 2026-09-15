// Simple per-key daily counter for /api/get-coaching (checklist item 1.3).
//
// State lives in this module's memory. On Vercel that means:
//   - it is per serverless instance, so two warm instances each have their
//     own count, and
//   - a cold start resets everything to zero.
// So the limit is "at most N per instance per day", not a hard guarantee.
// That is good enough to stop an accidental or casual loop from running up
// the OpenAI bill; a hard limit would need the count stored in the sheet or
// in Vercel KV.
//
// The day bucket is a YYYY-MM-DD string chosen by the caller (get-coaching
// passes the user's local date from ?date=), so the reset happens at the
// user's midnight, not the server's.

const counts = new Map(); // key -> { day, count }

function checkDailyLimit(key, day, max) {
  const cur = counts.get(key);
  if (!cur || cur.day !== day) {
    counts.set(key, { day, count: 1 });
    return { allowed: true, remaining: max - 1 };
  }
  if (cur.count >= max) return { allowed: false, remaining: 0 };
  cur.count++;
  return { allowed: true, remaining: max - cur.count };
}

// test hook
function _reset() { counts.clear(); }

module.exports = { checkDailyLimit, _reset };
