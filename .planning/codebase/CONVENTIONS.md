# Coding Conventions

**Analysis Date:** 2026-07-22

## Naming Patterns

**Files:**
- Backend: lowercase, single-word or dot-free module names — `agendor.js`, `db.js`, `emailer.js`, `scheduler.js`, `logger.js`, `secret.js`.
- Backend route files live in `backend/src/routes/` and are named after the resource, singular verb-free noun — `deals.js`, `notifications.js`, `config.js`, `reports.js`, `track.js`, `auth.js`.
- Backend middleware in `backend/src/middleware/` — `auth.js`.
- Frontend components: PascalCase `.jsx` — `Dashboard.jsx`, `DealsList.jsx`, `ConfigPanel.jsx`, `NotificationHistory.jsx`, `ReportPanel.jsx`, `LoginPage.jsx`, `ChangePasswordModal.jsx`.
- No test files exist anywhere in the repo (see `TESTING.md`).

**Functions:**
- camelCase throughout, verb-first: `getUsers`, `getStaleDeals`, `runCheck`, `scheduleTask`, `sendStaleNotification`, `checkRateLimit`, `logNotification`.
- Boolean-returning helpers prefixed with `is`/`should`/`has`: `isBool`, `shouldNotifyOwner`, `hasRecipient` (local var).
- Internal/private helpers in the same module are not exported (e.g. `createTransporter`, `dealEmailHtml`, `urgencyColor` in `backend/src/emailer.js`) — only the public API surface is listed in `module.exports`.

**Variables:**
- camelCase for locals: `staleDays`, `adminEmails`, `notificationsEnabled`.
- `SCREAMING_SNAKE_CASE` for module-level constants: `BASE_URL`, `TOKEN`, `INACTIVE_CATEGORY`, `EXCLUDED_CATEGORIES`, `MAX_ATTEMPTS`, `BLOCK_MINUTES`, `TOKEN_EXPIRY`, `BCRYPT_ROUNDS` (see `backend/src/agendor.js`, `backend/src/routes/auth.js`).
- React state setters follow the `set<Noun>` pattern from `useState`: `setStatus`, `setRunning`, `setCheckResult` (`frontend/src/components/Dashboard.jsx`).

**Types:**
- No TypeScript in the project — pure JavaScript (CommonJS backend, ES modules frontend). No type annotations; shapes are documented informally via destructuring and inline Portuguese comments.

## Code Style

**Formatting:**
- No Prettier or formatting tool configured (no `.prettierrc*` found anywhere in the repo).
- No trailing semicolons dropped consistently — semicolons ARE used throughout backend `.js` files; frontend `.jsx` largely omits semicolons at statement ends (`frontend/src/App.jsx`, `frontend/src/components/Dashboard.jsx`). Match the existing style per file/directory rather than imposing one convention repo-wide.
- 2-space indentation throughout both backend and frontend.
- Single quotes preferred for strings; template literals used heavily for interpolation (especially HTML email bodies in `backend/src/emailer.js`).

**Linting:**
- No ESLint config found (no `.eslintrc*`, `eslint.config.*`, or `biome.json`). No lint script in either `backend/package.json` or `frontend/package.json`.
- No linting is enforced — be extra careful with unused variables and consistent style since no automated check exists.

## Import Organization

**Backend (CommonJS):**
- `require()` calls at the top of the file, ungrouped — no blank-line separation between "external package" and "local module" imports observed (see `backend/src/index.js` lines 1-8, mixing `dotenv`, `express`, `cors`, `helmet`, `morgan`, `fs`, `path`, then `./logger`).
- Route files typically require `express`, then instantiate `express.Router()` immediately, then require local `../db`, `../scheduler`, `../emailer`, `../secret`, `../logger` (see `backend/src/routes/config.js`, `backend/src/routes/auth.js`).
- Some requires are deferred inline inside functions to avoid circular-dependency issues at module load time, e.g. `backend/src/index.js` requires `./scheduler` and `./db` inside `server.listen()` callback and `shutdown()` rather than at top of file.
- `module.exports = { ... }` as a single object at the bottom of every backend module — never `exports.foo = ...` assignments.

**Frontend (ES modules):**
- `import { useState, useEffect } from 'react'` first, then third-party libs (`lucide-react`, `react-hot-toast`), then local component imports last (see `frontend/src/App.jsx` lines 1-10).
- No path aliases configured — all local imports use relative paths (`./components/Dashboard`).
- Default export per component file: `export default function ComponentName(...) { ... }`.

## Error Handling

**Backend:**
- Express routes wrap async work in `try/catch` and respond with `{ ok: false, message: '...' }` (Portuguese, user-facing) on failure, or `{ error: '...' }` from the global error middleware — the two response shapes coexist (`ok`/`message` in route handlers vs `error` in `backend/src/index.js`'s catch-all middleware). Follow whichever shape the specific route file already uses.
- A global error-handling middleware in `backend/src/index.js` (lines 78-89) catches uncaught route errors, logs full stack to `logs/error.log`, and returns a generic message in production (`err.status || 500`) — never leaks stack traces to the client when `NODE_ENV=production`.
- Network-flaky operations (SMTP send, Agendor API paging) use manual retry loops with exponential-ish backoff: `sendMailWithRetry()` in `backend/src/emailer.js` (3 attempts, 3s/6s wait) and `fetchDealsPage()` in `backend/src/agendor.js` (3 attempts, 5s/10s/15s wait, specifically on HTTP 429).
- Silent-catch pattern (`catch (_) {}` or `catch {}`) used deliberately for non-critical/idempotent operations: migration `ALTER TABLE` statements in `backend/src/db.js` (columns may already exist), `closeDb()` (already closed), auth token parsing in `frontend/src/App.jsx`. When adding new idempotent operations, follow this pattern rather than adding new error propagation paths.
- Auth failures never reveal whether a username exists (`backend/src/routes/auth.js` `forgot-password` handler always returns `{ ok: true }` regardless of whether the account was found) — preserve this behavior for any new auth-adjacent endpoint.

**Frontend:**
- `fetch` calls wrapped in `try/catch` with `catch {}` (silently swallow) or a `toast.error(...)` call to surface failure to the user — see `fetchStatus()` vs `checkOnly()` in `frontend/src/components/Dashboard.jsx`. Non-critical background refreshes use silent catch; user-initiated actions (buttons) surface errors via `react-hot-toast`.
- `react-hot-toast`'s `toast.loading(...)` + `{ id: toastId }` pattern is used for any async action triggered by a button click, updating the same toast to success/error on completion (`checkOnly`, `sendNow` in `Dashboard.jsx`).

## Logging

**Framework:** Custom zero-dependency structured logger at `backend/src/logger.js`. Exposes `error`, `warn`, `info`, `debug`.

**Patterns:**
- In development, logs plain text: `${time} [${level}] ${message}`. In production (`NODE_ENV=production`), logs single-line JSON: `{ time, level, message }` — designed for log aggregation.
- Level controlled by `LOG_LEVEL` env var, defaults to `info`.
- Errors passed as `Error` objects are automatically expanded to `.stack` (or `.message` if no stack) inside `emit()`.
- Use `logger.info/warn/error/debug(...)` for all new backend code — do NOT use raw `console.log`/`console.error` in new modules. NOTE: some existing modules still use raw `console.*` directly (`backend/src/agendor.js` lines 189/194, `backend/src/emailer.js` lines 175, 608, 633, 636) — this is legacy and should not be replicated in new code; prefer `require('./logger')`.
- HTTP access logs are handled separately via `morgan` (not the custom logger): `combined` format written to `logs/access.log` in all environments, plus `dev` format to console outside production (`backend/src/index.js` lines 40-45).
- Log messages prefixed with a bracketed module tag in Portuguese, e.g. `[Scheduler]`, `[Auth]`, `[Emailer]`, `[Agendor]` — follow this tagging convention for any new logger call so log lines remain greppable by subsystem.

## Comments

**When to Comment:**
- Comments are written in Portuguese throughout, matching all user-facing strings and log messages.
- Section-header comments use a distinctive box-drawing style to delimit logical blocks within a file: `// ── Section Name ──────────────────────`  (see `backend/src/index.js`, `backend/src/routes/auth.js`, `backend/src/db.js`). Use this style when adding a new logical section to an existing file that already uses it.
- Business-rule rationale is documented inline immediately above the code it explains, not in a separate doc — e.g. the `NO_OWNER_NOTIFY_FUNNELS` explanation in `backend/src/agendor.js` (lines 51-55) explains *why* the Beefor funnel is excluded, not just *what* the code does. Follow this "explain the why" style for any non-obvious business rule.
- Security-sensitive code is heavily commented to explain the threat being mitigated, e.g. `backend/src/secret.js` (why no fallback for `JWT_SECRET`), `backend/src/routes/auth.js` (why rate limiting, why the `forgot-password` response is always generic).

**JSDoc/TSDoc:**
- Not used anywhere in the codebase. No `@param`/`@returns` annotations found. Function documentation is a single-line `//` comment directly above the function signature at most.

## Function Design

**Size:** Functions range from a few lines (simple getters/setters in `backend/src/db.js`) to ~100+ lines for complex orchestration (`runCheck()` in `backend/src/scheduler.js`, `getStaleDeals()` in `backend/src/agendor.js`, email HTML builders in `backend/src/emailer.js`). Large functions are tolerated when they represent a single cohesive workflow (e.g. one HTTP handler, one email template) — prefer extracting a helper only when logic is reused (see `sendMailWithRetry`, `getPublicBaseUrl`, `getOrgCategory` as extracted, reusable pieces).

**Parameters:**
- Functions with more than 2-3 parameters use a single destructured object parameter, e.g. `sendStaleNotification({ deal, ownerEmail, authorEmail, logId })`, `logNotification({ deal_id, deal_title, ... })`, `ownerWeeklyHtml({ ownerName, deals, weekLabel, staleDays })`. Follow this pattern for any new function taking 3+ inputs.
- Simple utility functions take positional args: `getOrgCategory(orgId)`, `markResolved(deal_id, resolved_at)`.

**Return Values:**
- Route handlers always respond with a JSON object containing at minimum `ok: true/false` (custom routes) or the raw resource (GET endpoints, e.g. `getAllConfig()` result). New routes should follow the `{ ok, message }` or `{ ok, ...data }` shape used by sibling routes in the same file.
- Async operations that can partially fail (batch email sends) return an array of per-item result objects: `{ to, success, error? }` — see `sendStaleNotification`, `sendWeeklySummary`, `sendOwnerWeeklySummary` in `backend/src/emailer.js`.

## Module Design

**Exports:**
- Backend: every module ends with a single `module.exports = { ... }` block naming every public function explicitly (no wildcard/barrel exports). See bottom of `backend/src/db.js` (lines 291-301), `backend/src/agendor.js` (line 198), `backend/src/scheduler.js` (line 252).
- Frontend: each component file has exactly one `export default function ComponentName(...)`. Small presentational sub-components used only within the same file (e.g. `StatCard`, `NotificationRow`, `OwnerRanking` in `frontend/src/components/Dashboard.jsx`) are defined below the main component and NOT exported — kept as private, file-local helpers. Follow this pattern rather than creating new small component files for view-only sub-widgets used in a single parent.

**Barrel Files:**
- Not used. No `index.js` re-export aggregator files exist in `backend/src/routes/` or `frontend/src/components/` — every route/component is required/imported directly by its explicit path.

---

*Convention analysis: 2026-07-22*
