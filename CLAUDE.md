# CLAUDE.md — habit-tracker

Guidance for Claude (and humans) working in this repo.

## Stack

- **Frontend:** a single vanilla web app — `index.html` (no framework, no build step).
- **Backend:** serverless functions in `/api`, talking to a **Google Sheet** as the
  data store via the `googleapis` library.
- **Hosting:** deployed on **Vercel** → https://habit-tracker-tau-tan.vercel.app
- **Runtime:** Node `24.x`. Only dependency: `googleapis`.

### API endpoints (`/api`)

| File | Sheet access | Purpose |
|---|---|---|
| `_user.js` | **read** (Customers sheet) | Resolves `?user=` + `?t=` to the customer's spreadsheet ID. |
| `_date.js` | — | `todayFrom(req)`: the client's `?date=` or server midnight. |
| `_validate.js` | **read** (Control Panel) | Shared input validation for the write endpoints. |
| `_streak.js` | — | The streak rule and the focus-habit counter, both year-wide. |
| `_year.js` | — | Which year the sheet covers; gates the app after new year. |
| `get-habits.js` | **read** (readonly scope) | One batchGet over all twelve month tabs + the Control Panel; returns habits, config, the year-wide streak and the focus counters. |
| `get-coaching.js` | **none** | No sheet access — takes stats from the request body, calls OpenAI (`OPENAI_API_KEY`), returns a coaching note. |
| `toggle-habit.js` | **write** | Toggles a habit cell for a day. Dashboard C7 belongs to the sheet’s own Apps Script. |
| `set-onboarded.js` | **write** | Writes the hidden onboarding marker (Control Panel Z1). |
| `update-focus.js` | **write** | Updates the current focus. |
| `update-config.js` | **write** | Updates Control Panel configuration. |

### Environment variables (set in Vercel — do not hardcode)

- `GOOGLE_SERVICE_ACCOUNT` — JSON service-account credentials for the Sheets API.
- `GOOGLE_SHEET_ID` — the spreadsheet the app reads/writes.
- `OPENAI_API_KEY` — used by `get-coaching.js`.

## App philosophy

- **In the app: positive feedback.** The day-to-day surface is encouraging and
  supportive — it nudges, celebrates progress, and stays kind.
- **On the Insights view: honest stats.** Insights is where the real, unvarnished
  numbers live — no rounding up, no cheerleading. Keep the two concerns separate:
  don't let the encouraging tone bleed into Insights, and don't let raw stats
  bleed into the everyday feedback.

## Standing rules (for any change in this repo)

1. **Always work on a new branch.** Never commit directly to `main`.
2. **Always open a PR** for the change.
3. **Never merge.** Leave the PR open for the human to review and merge.
4. **Never write to the live Google Sheet.** Don't run the write endpoints
   (`toggle-habit`, `update-focus`, `update-config`, `set-onboarded`) against the
   real sheet, and don't add code that does so as a side effect of testing.
5. **Never touch environment variables** (`GOOGLE_SERVICE_ACCOUNT`, `GOOGLE_SHEET_ID`,
   `OPENAI_API_KEY`) or their values **without asking first.**
6. **If blocked, don't guess.** Write your questions in the PR description and stop —
   wait for answers rather than making an assumption or a workaround.
