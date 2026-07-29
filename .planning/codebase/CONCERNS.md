# Codebase Concerns

**Analysis Date:** 2026-07-22

## Tech Debt

**No automated test suite:**
- Issue: There is no test runner (Jest/Vitest/Mocha), no `test` script in either `backend/package.json` or `frontend/package.json`, and no `*.test.js`/`*.spec.js` files anywhere outside `node_modules`.
- Files: `backend/package.json` (no `test` script), `frontend/package.json` (no `test` script)
- Impact: Every change to business logic (stale-deal filtering in `backend/src/agendor.js`, notification dedup in `backend/src/db.js`, scheduler flow in `backend/src/scheduler.js`) is verified manually. Regressions (e.g., in the exclusion filters or "already notified today" logic) can ship silently.
- Fix approach: Add Vitest/Jest for backend unit tests, starting with `getStaleDeals()` filtering logic and `alreadyNotifiedToday()`/`shouldNotifyOwner()` in `backend/src/agendor.js` and `backend/src/db.js`, since these directly control who gets emailed.

**Root-level `package.json` / `package-lock.json` are untracked stray files:**
- Issue: `package.json` at repo root declares only `pptxgenjs` as a dependency (used by `make_pptx.js`, a presentation-generation script) and is currently untracked in git (`?? package.json`, `?? package-lock.json` per `git status`). This is unrelated to the actual app (which lives in `backend/` and `frontend/`, each with their own `package.json`).
- Files: `package.json`, `package-lock.json`, `make_pptx.js`, `make_docx.js`, `make_slides.js`, `capture_screenshots.py`
- Impact: Confusing repo root — a third `node_modules` may be installed at root, and it's unclear whether these presentation-generation scripts are meant to be part of the shipped product or one-off internal tooling. They are already excluded from git via `.gitignore` entries (`*.pptx`, `make_pptx.js`, etc.) but the root `package.json` slipped through.
- Fix approach: Move presentation-generation scripts + their `package.json` into a `tools/` or `scripts/` directory outside the main repo, or gitignore the root `package.json`/`package-lock.json` explicitly, and decide whether they belong in version control at all.

**Inconsistent logging: `console.*` vs structured `logger`:**
- Issue: `backend/src/logger.js` implements a structured logger (JSON in production) intended to replace ad-hoc `console.*` calls, but several modules still call `console.log`/`console.error`/`console.warn` directly instead of `logger`.
- Files: `backend/src/agendor.js` (`console.error`, `console.log` in `getDealsWithFutureTasks`), `backend/src/emailer.js` (`console.warn`, `console.error` in `sendMailWithRetry`/`sendOwnerWeeklySummary`), `backend/src/routes/deals.js` (`console.error`), `backend/src/routes/track.js` (`console.error`)
- Impact: In production these calls are not JSON-structured, breaking any log-parsing/aggregation pipeline that would consume `logger`'s JSON output; `NODE_ENV` gating and log-level filtering (`LOG_LEVEL`) also don't apply to raw `console.*` calls.
- Fix approach: Replace remaining `console.*` calls in `backend/src/agendor.js`, `backend/src/emailer.js`, `backend/src/routes/deals.js`, and `backend/src/routes/track.js` with `require('./logger')` (or `../logger` from routes).

**`orgCategoryCache` in `backend/src/agendor.js` never expires:**
- Issue: The module-level `orgCategoryCache` object (`backend/src/agendor.js:31`) caches organization category lookups for the lifetime of the process with no TTL or invalidation.
- Files: `backend/src/agendor.js:31-44`
- Impact: If an organization's category changes in Agendor (e.g., moves from "Lead" to "Cliente" or gets marked "Inativo (sem resposta)"), the cached stale value keeps being used until the backend process restarts — deals could be wrongly included/excluded from notifications for days.
- Fix approach: Add a TTL (e.g., re-fetch after 24h) or clear the cache at the start of each `getStaleDeals()` run / daily cron cycle.

**No outbound HTTP timeout on Agendor API calls:**
- Issue: `axios.create({ baseURL: BASE_URL, headers: {...} })` in `backend/src/agendor.js:6-9` does not set a `timeout`, and the same is true for the ad-hoc axios call in `backend/src/routes/notifications.js:155` (`/resolved` endpoint).
- Files: `backend/src/agendor.js:6-9`, `backend/src/routes/notifications.js:155-158`
- Impact: A hung/slow Agendor API response can block the daily cron run (`runCheck()` in `backend/src/scheduler.js`) or a manual "check now" request indefinitely, since there's no client-side timeout to fall back on (only 429 retry logic exists, not generic timeout/network failure handling for `getStaleDeals`/`getUsers`).
- Fix approach: Set an explicit `timeout` (e.g., 15-30s) on the shared axios instance and the notifications.js axios call.

**In-memory login rate limiting resets on restart / doesn't scale horizontally:**
- Issue: `loginAttempts` in `backend/src/routes/auth.js:34` is a plain in-process `Map`, with no periodic cleanup of stale entries either.
- Files: `backend/src/routes/auth.js:34-67`
- Impact: PM2 restarts (deploys, crashes, `ecosystem.config.js` auto-restart) silently clear all rate-limit state, allowing renewed brute-force attempts right after a restart. The `Map` also grows unbounded for distinct IPs that never clear (blocked entries are deleted only after their block window elapses, but a large volume of unique attacking IPs would accumulate entries until each expires).
- Fix approach: Acceptable for a single-instance internal tool; if the app is ever scaled to multiple instances behind a load balancer, move rate limiting to the SQLite `login_logs` table (already recorded) or an external store (Redis).

## Known Bugs

**None identified as reproducible bugs during this pass.** The codebase includes many defensive comments describing past fixes (JWT_SECRET made mandatory, BASE_URL localhost detection, log-stream leak fix in `backend/src/index.js:39`, deal exclusion via `EXCLUDED_STAGE_WORDS`/`dealStatusId` in `backend/src/agendor.js:130-139`), suggesting an active bug-fixing history rather than currently-open defects. See "Fragile Areas" below for logic that is easy to break during future changes.

## Security Considerations

**JWT stored in `localStorage` (XSS exposure):**
- Risk: `frontend/src/App.jsx` and `frontend/src/components/LoginPage.jsx` store the auth JWT in `localStorage` (`localStorage.setItem('auth_token', data.token)`), which is readable by any JavaScript executing in the page context — including injected scripts from an XSS vulnerability.
- Files: `frontend/src/App.jsx:23,35-36,54-55`, `frontend/src/components/LoginPage.jsx:207-208`
- Current mitigation: `helmet` is used for security headers, but Content-Security-Policy is explicitly disabled (`contentSecurityPolicy: false` in `backend/src/index.js:14`, "desativado pois o frontend usa CDN/inline"), removing a key XSS mitigation layer.
- Recommendations: If feasible, move the token to an httpOnly cookie set by the backend, or at minimum enable a CSP once the frontend build no longer needs inline scripts, to reduce the blast radius of any future XSS bug.

**`ADMIN_USERS` "legacy" fallback allows any authenticated user to manage accounts:**
- Risk: `requireAdmin()` in `backend/src/routes/auth.js:26-31` explicitly allows all authenticated users to create/delete users and view login logs when `ADMIN_USERS` env var is unset/empty ("não configurado → não restringe").
- Files: `backend/src/routes/auth.js:19-31`
- Current mitigation: Documented in code comments and in `backend/.env.example` (`ADMIN_USERS=admin@cadmus.com.br` with instructions to set it in production).
- Recommendations: Consider failing closed by default (deny user-management endpoints unless `ADMIN_USERS` is explicitly set) rather than failing open, since a misconfigured/forgotten env var in production silently grants every logged-in user admin rights over accounts.

**`smtp_pass` stored in plaintext in SQLite `config` table:**
- Risk: `backend/src/db.js` `defaults.smtp_pass` and `setConfig('smtp_pass', ...)` (via `backend/src/routes/config.js`) store the SMTP password unencrypted in `backend/agendor.db`.
- Files: `backend/src/db.js:105`, `backend/src/routes/config.js:31-46`
- Current mitigation: The value is masked (`••••••••`) on `GET /api/config` (`backend/src/routes/config.js:25`) so it isn't leaked to the frontend; the DB file itself is gitignored (`*.db` in `.gitignore`) and file-level backups (`deploy/backup.sh`) copy the raw `.db` file.
- Recommendations: Ensure the SQLite file and its backups (`deploy/backup.sh` writes to `$APP_DIR/backups`) have restrictive filesystem permissions in production, since anyone with read access to the DB file (or a backup) gets the SMTP credentials in cleartext.

**`bcryptjs` password compare has no explicit timing-safe guarantee against username enumeration mitigation gaps:**
- Risk: `backend/src/routes/auth.js:117-121` returns immediately (`recordFailedAttempt` + 401) when a username doesn't exist, without performing a dummy bcrypt compare, while an existing-user wrong-password path (`124-126`) does perform a real bcrypt compare. This creates a timing difference that could allow username enumeration.
- Files: `backend/src/routes/auth.js:115-126`
- Current mitigation: Both cases return the same generic message ("Usuário ou senha incorretos."), and rate limiting/blocking exists.
- Recommendations: Low priority for an internal team tool with a small user base, but if hardening further, perform a constant-time dummy hash comparison even when the username is not found.

## Performance Bottlenecks

**Full deal-list re-fetch + org-category API calls on every dashboard/report page load:**
- Problem: `GET /api/deals/stale`, `GET /api/reports/current`, `GET /api/notifications/check`, and `POST /api/notifications/run` all call `getStaleDeals()` from scratch, which paginates the entire "Em andamento" deals list from Agendor (`backend/src/agendor.js:92-161`) and issues one `/organizations/:id` request per unique organization (`Promise.all(uniqueOrgIds.map(id => getOrgCategory(id)))` at `agendor.js:122`) every single time, with only the in-process (non-expiring) `orgCategoryCache` reducing repeat calls within the same process lifetime.
- Files: `backend/src/agendor.js:73-161`, `backend/src/routes/deals.js:7-27`, `backend/src/routes/reports.js:6-82`
- Cause: No shared/persistent caching layer for the deals list itself — each dashboard tab load (`frontend/src/components/DealsList.jsx`, `frontend/src/components/ReportPanel.jsx`) triggers a full re-fetch+re-filter cycle against the live Agendor API.
- Improvement path: The frontend already partially compensates with `localStorage` caching (`deals_cache`, `report_cache`, `dashboard_check_cache`) and manual "refresh" actions, but a short-lived server-side cache (e.g., 5 minute in-memory TTL cache around `getStaleDeals()`) would reduce Agendor API load and page latency further, especially as deal volume grows.

**`getDealsWithFutureTasks()` paginates the entire open-tasks list on every check:**
- Problem: `backend/src/agendor.js:165-196` fetches all tasks with `dueDateGt: yesterday` across all pages (100/page, sequential — not parallelized like `getStaleDeals`) on every `runCheck()`/`runCheckOnly()`/`GET /api/deals/stale` call.
- Files: `backend/src/agendor.js:165-196`, `backend/src/scheduler.js:28-32`, `backend/src/routes/deals.js:10-14`
- Cause: Sequential `while (true)` pagination with no parallel batching (unlike `getStaleDeals`'s 5-page-at-a-time approach), and no caching between calls.
- Improvement path: Parallelize pagination similarly to `fetchDealsPage`/batch approach in `getStaleDeals()`, or cache results for a short TTL shared across the three call sites that invoke it (`scheduler.js` twice, `routes/deals.js` once) within the same check cycle.

## Fragile Areas

**Stale-deal filtering logic in `getStaleDeals()` is a long chain of implicit business rules:**
- Files: `backend/src/agendor.js:57-161`
- Why fragile: Whether a deal is included/excluded depends on multiple independently-evolving rules: `EXCLUDED_CATEGORIES`, `EXCLUDED_OWNERS`, `dealStatusId !== 1`, and a normalized-string substring match against `EXCLUDED_STAGE_WORDS` (`stageName.includes(w)`) for stage names like "perdido"/"ganho"/"congelado". A new deal stage name in Agendor containing one of these substrings incidentally (e.g., a custom stage named "Perdão de contrato") would be silently excluded from notifications with no logging of *why* a given deal was filtered out.
- Safe modification: Any change to these constants should be cross-checked against the full current list of stage names/categories in the live Agendor account before deploying, and ideally the filtering should emit a debug log per excluded deal (`deal.id`, matched rule) to make future incidents diagnosable.
- Test coverage: None — this is pure business logic with zero automated tests (see Tech Debt above).

**`shouldNotifyOwner()` / `NO_OWNER_NOTIFY_FUNNELS` hardcodes a single special-cased funnel ("beefor"):**
- Files: `backend/src/agendor.js:46-60`, referenced in `backend/src/scheduler.js:73-79` and `backend/src/emailer.js:602-610`
- Why fragile: Funnel-based notification suppression is matched via exact lowercase string (`'beefor'`). If the funnel is renamed in Agendor (even by a single character or trailing space beyond what `.trim()` handles), the exclusion silently stops working and owners of Beefor deals would start receiving notifications again, or vice versa if a new similarly-named funnel is added and should NOT be excluded.
- Safe modification: When adding/removing funnels from this exclusion list, verify the exact funnel name string currently returned by the Agendor API (`deal.dealStage.funnel.name`) rather than assuming it matches the UI label.
- Test coverage: None.

**`notification_log` growth is unbounded — no retention/archival policy:**
- Files: `backend/src/db.js:12-23` (table definition), `backend/src/routes/notifications.js:10-15` (paginated read)
- Why fragile: Every notification sent (daily, per deal, per recipient) inserts a row and is never purged. Over years of operation this table grows indefinitely; `getNotificationLogs()` is paginated so read performance is initially fine (indexed via `idx_notiflog_sent_at`), but `getNotifiedDeals()` (`db.js:208-218`) does a `GROUP BY deal_id` scan over the whole table with no LIMIT, and `GET /api/notifications/resolved` (`routes/notifications.js:143-193`) calls the Agendor API once per row returned by `getNotifiedDeals()` with no cap — as history grows this endpoint's latency and outbound API call volume grow unbounded too.
- Safe modification: Add a `LIMIT`/date-range filter to `getNotifiedDeals()` before it's used by `/api/notifications/resolved`, or introduce a periodic archival job for `notification_log` rows older than N months.
- Test coverage: None.

## Scaling Limits

**SQLite (`better-sqlite3`) single-file DB with `PM2 instances: 1`:**
- Current capacity: `ecosystem.config.js` runs a single PM2 instance (`instances: 1`), consistent with `better-sqlite3` being a synchronous, single-process, file-based database not designed for multi-process concurrent writers.
- Limit: The app cannot horizontally scale beyond one Node process without migrating off SQLite (or using SQLite in WAL mode with careful multi-process coordination, which isn't configured here).
- Scaling path: Acceptable for current internal-tool scale (one company, daily cron, dashboard used by a handful of internal users). If load grows significantly, migrate to Postgres/MySQL and update `backend/src/db.js`'s query layer.

**Agendor API pagination assumes stable `per_page=100` and moderate total deal counts:**
- Current capacity: `getStaleDeals()` fetches all pages of "Em andamento" deals in batches of 5 pages in parallel with a 1s pause between batches (`backend/src/agendor.js:105-111`); `getDealsWithFutureTasks()` fetches all future tasks sequentially, page by page.
- Limit: As the Agendor account accumulates deals/tasks over multiple years, both the stale-deals fetch and the future-tasks fetch take proportionally longer per run (the sequential task-fetch in particular scales linearly with total open-task pages, since it isn't parallelized).
- Scaling path: If runs start exceeding the daily cron's practical window or causing timeouts, parallelize `getDealsWithFutureTasks()` like `getStaleDeals()`, or ask Agendor whether a server-side `updatedAt` filter can reduce the fetched dataset directly instead of client-side filtering after fetching everything.

## Dependencies at Risk

**None flagged as critically at risk.** Core dependencies (`express@4`, `better-sqlite3@9`, `axios@1.7`, `nodemailer@6.9`, `jsonwebtoken@9`, `bcryptjs@3`, `react@18`, `vite@5`) are actively maintained, mainstream packages. No dependency audit output was captured in this pass (no `npm audit` run); recommend running `npm audit` periodically in both `backend/` and `frontend/` as part of routine maintenance, since none appears wired into CI (no CI configuration files were found in the repo).

## Missing Critical Features

**No React error boundary:**
- Problem: No `ErrorBoundary`/`componentDidCatch` implementation exists anywhere under `frontend/src`. An uncaught render error in any tab (`Dashboard`, `DealsList`, `NotificationHistory`, `ConfigPanel`, `ReportPanel`) would blank the entire app for the user instead of degrading gracefully.
- Blocks: Resilient UX when the backend returns unexpected/malformed data to one panel.

**No automated CI pipeline:**
- Problem: No `.github/workflows/`, `.gitlab-ci.yml`, or other CI configuration was found in the repo.
- Blocks: Lint/test/build verification on pull requests; currently all verification is manual before merging to `main`/deploying via `deploy/instalar.sh`.

## Test Coverage Gaps

**Entire backend business logic (100% of `backend/src`):**
- What's not tested: Stale-deal filtering (`getStaleDeals`), notification dedup (`alreadyNotifiedToday`), funnel-based suppression (`shouldNotifyOwner`), auth flow (login, rate limiting, password reset), scheduler orchestration (`runCheck`, `runWeeklySummary`), config validation (`backend/src/routes/config.js` VALIDATORS).
- Files: `backend/src/agendor.js`, `backend/src/db.js`, `backend/src/scheduler.js`, `backend/src/routes/*.js`
- Risk: Since this system silently determines who receives (or doesn't receive) email notifications about stale deals, an untested regression could cause emails to stop going out — or go out incorrectly — without anyone noticing until a manual audit.
- Priority: High — start with `getStaleDeals()` filtering rules and `alreadyNotifiedToday()`/rate-limit logic in `auth.js`, since these are the highest-impact, most rule-heavy pieces of logic.

**Entire frontend (100% of `frontend/src`):**
- What's not tested: No component tests exist for `Dashboard.jsx`, `DealsList.jsx`, `ConfigPanel.jsx`, `NotificationHistory.jsx`, `ReportPanel.jsx`, `LoginPage.jsx`, `ChangePasswordModal.jsx`.
- Files: `frontend/src/components/*.jsx`
- Risk: UI regressions (e.g., broken config form validation, broken auth-token handling in `App.jsx`) are only caught by manual click-through testing.
- Priority: Medium — lower risk than backend notification logic since UI bugs are usually visible immediately to users, but still worth basic smoke tests for the login/auth flow given its security sensitivity.

---

*Concerns audit: 2026-07-22*
