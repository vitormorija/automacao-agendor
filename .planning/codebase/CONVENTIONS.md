# Coding Conventions

**Analysis Date:** 2026-07-29

## Naming Patterns

**Files:**
- Backend: lowercase, single-word or dot-free module names — `agendor.js`, `db.js`, `emailer.js`, `scheduler.js`, `logger.js`, `secret.js`.
- Backend route files live in `backend/src/routes/` and are named after the resource, singular verb-free noun — `deals.js`, `notifications.js`, `config.js`, `reports.js`, `track.js`, `auth.js`.
- Backend middleware in `backend/src/middleware/` — `auth.js`.
- Frontend components: PascalCase `.jsx` — `Dashboard.jsx`, `DealsList.jsx`, `ConfigPanel.jsx`, `NotificationHistory.jsx`, `ReportPanel.jsx`, `LoginPage.jsx`, `ChangePasswordModal.jsx`.
- Backend test files live in `backend/test/` and are named `<module>.<aspect>.test.js` — `agendor.funnel.test.js`, `agendor.getStaleDeals.test.js`, `agendor.futureTasks.test.js`, `agendor.pure.test.js`, `agendor.realsample.test.js`, `auth.test.js`, `db.dedup.test.js`, `smoke.test.js`. Non-test support files under `backend/test/` are named without `.test.` — `setup.js`, `helpers/tmpDb.js`, `helpers/fakeAxios.js` — so `node --test`'s default file discovery (which matches `*.test.js`) does not pick them up as suites.

**Functions:**
- camelCase throughout, verb-first: `getUsers`, `getStaleDeals`, `runCheck`, `scheduleTask`, `sendStaleNotification`, `checkRateLimit`, `logNotification`.
- Boolean-returning helpers prefixed with `is`/`should`/`has`: `isBool`, `shouldNotifyOwner`, `hasRecipient` (local var).
- Internal/private helpers in the same module are not exported (e.g. `createTransporter`, `dealEmailHtml`, `urgencyColor` in `backend/src/emailer.js`) — only the public API surface is listed in `module.exports`. Exception made deliberately for testability: `backend/src/routes/auth.js` attaches normally-private seams (`checkRateLimit`, `recordFailedAttempt`, `clearAttempts`, `verifyPassword`, `_loginAttempts`) as extra properties on the exported router function specifically so `backend/test/auth.test.js` can reach and reset them — follow this "attach seam to the existing export" pattern rather than exporting new top-level functions when a test needs to reach into a route module's internals.

**Variables:**
- camelCase for locals: `staleDays`, `adminEmails`, `notificationsEnabled`.
- `SCREAMING_SNAKE_CASE` for module-level constants: `BASE_URL`, `TOKEN`, `INACTIVE_CATEGORY`, `EXCLUDED_CATEGORIES`, `MAX_ATTEMPTS`, `BLOCK_MINUTES`, `TOKEN_EXPIRY`, `BCRYPT_ROUNDS` (see `backend/src/agendor.js`, `backend/src/routes/auth.js`).
- React state setters follow the `set<Noun>` pattern from `useState`: `setStatus`, `setRunning`, `setCheckResult` (`frontend/src/components/Dashboard.jsx`).

**Types:**
- No TypeScript in the project — pure JavaScript (CommonJS backend, ES modules frontend). No type annotations; shapes are documented informally via destructuring and inline Portuguese comments.

## Code Style

**Formatting:**
- Biome is the single formatter, configured at the repo root in `biome.json` (`"root": true`), covering both `backend/` (CommonJS) and `frontend/` (ES modules) from one shared config — there is no per-package Biome config.
- Formatter settings: 2-space indentation, single quotes for JS/JSX strings (`javascript.formatter.quoteStyle: "single"`).
- Run `npm run format` (defined identically in `backend/package.json` and `frontend/package.json`, both aliasing `biome format --write .`) to auto-fix formatting before committing.
- CSS files are explicitly excluded from Biome's scope (`files.includes: ["!**/*.css"]` in `biome.json`) — the Biome CSS parser aborts on Tailwind's `@apply` directive, so no formatter/linter runs against `.css` files in this repo.
- Semicolons are used throughout backend `.js` files; frontend `.jsx` largely omits semicolons at statement ends (`frontend/src/App.jsx`, `frontend/src/components/Dashboard.jsx`). Biome's recommended rule set does not enforce a semicolon style here — match the existing style per file/directory rather than imposing one convention repo-wide.
- Template literals used heavily for interpolation (especially HTML email bodies in `backend/src/emailer.js`).

**Linting:**
- Biome is also the linter, `linter.enabled: true` in `biome.json`, built on `linter.rules.recommended: true` plus a short list of explicit overrides.
- Both `backend/package.json` and `frontend/package.json` define `"lint": "biome lint ."`. This is run in CI (`.github/workflows/ci.yml`, both `backend` and `frontend` jobs) and **is a required check to merge** — do not treat linting as optional or unenforced.
- **The lint baseline is deliberately warn-tolerant, not silent.** A specific set of rules that would require non-trivial code changes to satisfy have been explicitly downgraded from Biome's default `error` severity to `warn` in `biome.json`'s `linter.rules` block: `a11y.useButtonType`, `a11y.noLabelWithoutControl`, `a11y.noAutofocus`, `a11y.useKeyWithClickEvents`, `a11y.noStaticElementInteractions`, `complexity.useOptionalChain`, `complexity.useArrowFunction`, `correctness.noUnusedFunctionParameters`, `correctness.useParseIntRadix`, `correctness.noUnusedVariables`, `correctness.useExhaustiveDependencies`, `correctness.noUnusedImports`, `style.useNodejsImportProtocol`, `style.useTemplate`, `style.useConst`, `suspicious.useIterableCallbackReturn`, `suspicious.noArrayIndexKey`. This means `npm run lint` exits 0 with warnings currently present (44 in `backend/`, 60 in `frontend/`, observed 2026-07-29) — new code that trips one of these specific rules will not fail CI, but genuinely new `error`-level violations (anything NOT in the override list above) WILL fail the build.
- Do not add new code that relies on the warn-tolerance to introduce sloppiness (unused vars, missing `useEffect` deps, etc.) — the downgrades exist to avoid a disruptive mass-rewrite of pre-existing code, not to license new violations. Prefer writing new code that would pass at `error` severity even where the baseline currently tolerates a warning.
- `biome.json`'s `files.includes` explicitly excludes `node_modules`, `dist`, `coverage`, `backend/agendor.db`, `backend/test/fixtures/**`, and all `*.css` files from both lint and format.

## Import Organization

**Backend (CommonJS):**
- `require()` calls at the top of the file, ungrouped — no blank-line separation between "external package" and "local module" imports observed (see `backend/src/index.js` lines 1-8, mixing `dotenv`, `express`, `cors`, `helmet`, `morgan`, `fs`, `path`, then `./logger`).
- Route files typically require `express`, then instantiate `express.Router()` immediately, then require local `../db`, `../scheduler`, `../emailer`, `../secret`, `../logger` (see `backend/src/routes/config.js`, `backend/src/routes/auth.js`).
- Some requires are deferred inline inside functions to avoid circular-dependency issues at module load time, e.g. `backend/src/index.js` requires `./scheduler` and `./db` inside `server.listen()` callback and `shutdown()` rather than at top of file.
- `module.exports = { ... }` as a single object at the bottom of every backend module — never `exports.foo = ...` assignments.
- Test files require `./setup` as their very first line, before any other require (see all files under `backend/test/`) — this ordering is load-bearing, not stylistic (see TESTING.md).

**Frontend (ES modules):**
- `import { useState, useEffect } from 'react'` first, then third-party libs (`lucide-react`, `react-hot-toast`), then local component imports last (see `frontend/src/App.jsx` lines 1-10).
- No path aliases configured — all local imports use relative paths (`./components/Dashboard`).
- Default export per component file: `export default function ComponentName(...) { ... }`.

## Error Handling

**Backend:**
- Express routes wrap async work in `try/catch` and respond with `{ ok: false, message: '...' }` (Portuguese, user-facing) on failure, or `{ error: '...' }` from the global error middleware — the two response shapes coexist (`ok`/`message` in route handlers vs `error` in `backend/src/index.js`'s catch-all middleware). Follow whichever shape the specific route file already uses.
- A global error-handling middleware in `backend/src/index.js` (lines 78-89) catches uncaught route errors, logs full stack to `logs/error.log`, and returns a generic message in production (`err.status || 500`) — never leaks stack traces to the client when `NODE_ENV=production`.
- Network-flaky operations (SMTP send, Agendor API paging) use manual retry loops with exponential-ish backoff: `sendMailWithRetry()` in `backend/src/emailer.js` (3 attempts, 3s/6s wait) and `fetchDealsPage()` in `backend/src/agendor.js` (3 attempts, 5s/10s/15s wait, specifically on HTTP 429).
- **Silent-catch pattern is deliberate, not an oversight.** `catch (_) {}` or `catch {}` is used intentionally for non-critical/idempotent operations: migration `ALTER TABLE` statements in `backend/src/db.js` (columns may already exist), `closeDb()` (already closed), auth token parsing in `frontend/src/App.jsx`, and `backend/test/helpers/tmpDb.js`'s `cleanup()` (temp file may not exist yet). When adding new idempotent operations, follow this pattern rather than adding new error propagation paths — do not "fix" an existing silent catch into a logged/thrown error without confirming the operation is actually not idempotent.
- **Auth failures must never reveal account existence.** `backend/src/routes/auth.js`'s `forgot-password` handler always returns `{ ok: true }` regardless of whether the account was found. This is a security property, not an accident — preserve it for any new auth-adjacent endpoint. `backend/test/auth.test.js` documents the related brute-force rate-limiting behavior (5 attempts, 15-minute block) as a regression net specifically so this class of security behavior cannot be silently weakened.

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
- **Log messages are prefixed with a bracketed module tag in Portuguese** — e.g. `[Scheduler]`, `[Auth]`, `[Emailer]`, `[Agendor]` — follow this tagging convention for any new logger call so log lines remain greppable by subsystem.

## Comments

**When to Comment:**
- Comments are written in Portuguese throughout, matching all user-facing strings and log messages. This extends to test files: every file under `backend/test/` uses Portuguese header comments and inline rationale.
- Section-header comments use a distinctive box-drawing style to delimit logical blocks within a file: `// ── Section Name ──────────────────────`  (see `backend/src/index.js`, `backend/src/routes/auth.js`, `backend/src/db.js`, and `backend/test/auth.test.js`'s `// ── Rate limiting ──` / `// ── Verificação de senha ──`). Use this style when adding a new logical section to an existing file that already uses it.
- Business-rule rationale is documented inline immediately above the code it explains, not in a separate doc — e.g. the `NO_OWNER_NOTIFY_FUNNELS` explanation in `backend/src/agendor.js` (lines 51-55) explains *why* the Beefor funnel is excluded, not just *what* the code does. Follow this "explain the why" style for any non-obvious business rule.
- Security-sensitive code is heavily commented to explain the threat being mitigated, e.g. `backend/src/secret.js` (why no fallback for `JWT_SECRET`), `backend/src/routes/auth.js` (why rate limiting, why the `forgot-password` response is always generic).
- Test files follow a "characterization test" comment convention worth reusing for any new test: a file-header comment states the test documents *current* behavior, not ideal behavior (Portuguese: "DOCUMENTA O COMPORTAMENTO ATUAL — não o ideal"), and individual `test()` names embed the same qualifier (e.g. `'isExcludedStage: QUIRK "Perdão de contrato" é EXCLUÍDO — documenta comportamento ATUAL'`). This makes it explicit in the test name itself that a failing assertion after a future code change is a deliberate prompt to make a conscious decision, not proof of a bug.

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

*Convention analysis: 2026-07-29*
