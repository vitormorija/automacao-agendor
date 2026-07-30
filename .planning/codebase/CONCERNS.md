# Codebase Concerns

**Analysis Date:** 2026-07-29

## Tech Debt

**Test suite exists but leaves core send-path and route layer at 0% coverage:**
- Issue: `backend/test/` now has 8 test files / 35 tests on the native `node:test` runner (`backend/package.json` `test`/`test:coverage` scripts, `backend/.c8rc.json` coverage gate). This resolves the previous "no automated test suite" gap. However, `npm run test:coverage` shows `scheduler.js` at 0%, `middleware/auth.js` at 0%, and `routes/config.js`, `routes/deals.js`, `routes/notifications.js`, `routes/reports.js`, `routes/track.js` all at 0%. `emailer.js` — the module that actually sends the stale-deal and weekly-summary emails — sits at only 4.22% statement coverage (only pure template-fragment helpers are exercised; `sendStaleNotification`, `sendMailWithRetry`, `sendWeeklySummary`, `sendOwnerWeeklySummary` are untested).
- Files: `backend/src/scheduler.js`, `backend/src/middleware/auth.js`, `backend/src/routes/config.js`, `backend/src/routes/deals.js`, `backend/src/routes/notifications.js`, `backend/src/routes/reports.js`, `backend/src/routes/track.js`, `backend/src/emailer.js`
- Impact: The Core Value of this stabilization effort is "never again a silent regression in who gets notified." `agendor.js` (the filtering logic) is well covered (79.25% stmts, 69.11% branch), but the orchestration that turns a filtered deal list into an actual sent email (`scheduler.runCheck`, `emailer.sendStaleNotification`) has essentially no test coverage. A regression that breaks the *sending* step (wrong recipient list, silently-swallowed SMTP error, broken retry logic) would not be caught by the current suite.
- Fix approach: Prioritize `scheduler.js` (`runCheck`, `runCheckOnly`, `runWeeklySummary`) and `emailer.js` (`sendStaleNotification`, `sendMailWithRetry`) next, using a fake/mock SMTP transport the same way `backend/test/helpers/fakeAxios.js` mocks Agendor. `middleware/auth.js` and the route files are lower priority (thinner wrappers around already-tested domain logic) but should not stay indefinitely at 0%.

**Coverage gate margin is thin:**
- Issue: `backend/.c8rc.json` sets `check-coverage: true` with `branches: 60` (percent) against `all: true` scanning of `src/**/*.js` (only `src/index.js` excluded). Current measured branch coverage is 65.48% (74/113) — about 10 branches of slack before the gate goes red.
- Files: `backend/.c8rc.json`
- Impact: Any new `src/` file added without accompanying tests (or any new conditional branch added to an already-covered file) can flip CI red on an unrelated PR, or — worse — someone lowers the threshold to unblock a merge rather than writing the test.
- Fix approach: As coverage grows from the work above, ratchet the `branches` floor upward in the same PR that adds the tests, rather than leaving it static at 60. Treat any proposal to lower the threshold as a signal to write tests instead.

**Dependency vulnerabilities in backend production dependencies (not gated by CI):**
- Issue: `npm audit --omit=dev` in `backend/` (2026-07-29) reports 11 vulnerabilities (7 moderate, 4 high) in production dependencies: `axios@1.13.6` (multiple high-severity SSRF/prototype-pollution/ReDoS advisories, e.g. `GHSA-3p68-rc4w-qgx5`), `nodemailer@6.10.1` (high — SMTP command injection, `GHSA-c7w3-x93f-qmm8`, and several others), `express@4.22.1`'s transitive `path-to-regexp@0.1.12` (high — ReDoS, `GHSA-37ch-88jc-xwx2`), plus moderate advisories in `body-parser`, `follow-redirects`, `form-data`, `morgan`. `.github/workflows/ci.yml` runs `npm run lint` and `npm run test:coverage` but does **not** run `npm audit` or any SCA scanner, so these are never surfaced in CI.
- Files: `backend/package.json` (dependency versions), `.github/workflows/ci.yml` (no audit step)
- Impact: `axios` and `path-to-regexp` fixes are available via a plain `npm audit fix` (non-breaking, patch-level). The `nodemailer` fix requires a major bump to `9.x` per `npm audit fix --force` ("breaking change") — `emailer.js` (`createTransporter`, `sendMailWithRetry`) would need re-verification against nodemailer's v7+ API changes before upgrading. Frontend (`npm audit` in `frontend/`) reports 0 vulnerabilities — this is a backend-only issue.
- Fix approach: Run `npm audit fix` in `backend/` for the non-breaking fixes (axios, path-to-regexp, body-parser, follow-redirects, form-data, morgan) as a low-risk maintenance PR. Plan the `nodemailer` major-version upgrade separately with test coverage on the send path (see coverage gap above) as a prerequisite, since there is currently no automated safety net for `sendMailWithRetry`.

**Inconsistent logging: `console.*` vs structured `logger`:**
- Issue: `backend/src/logger.js` implements a structured logger (JSON in production) intended to replace ad-hoc `console.*` calls, but several modules still call `console.log`/`console.error`/`console.warn` directly instead of `logger`.
- Files: `backend/src/agendor.js:225,230` (`getDealsWithFutureTasks` catch/summary), `backend/src/emailer.js:185,676,709,719` (`sendMailWithRetry` warn, weekly-summary logs, per-recipient error), `backend/src/routes/deals.js:32`, `backend/src/routes/track.js:31`, `backend/src/index.js:93` (dev-only stack dump, arguably acceptable since it's explicitly gated on non-production)
- Impact: In production these calls are not JSON-structured, breaking any log-parsing/aggregation pipeline that would consume `logger`'s JSON output; `NODE_ENV` gating and log-level filtering (`LOG_LEVEL`) also don't apply to raw `console.*` calls.
- Fix approach: Replace remaining `console.*` calls in `backend/src/agendor.js`, `backend/src/emailer.js`, `backend/src/routes/deals.js`, and `backend/src/routes/track.js` with `require('./logger')` (or `../logger` from routes). Tracked for Phase 5.

**`orgCategoryCache` in `backend/src/agendor.js` never expires:**
- Issue: The module-level `orgCategoryCache` object (`backend/src/agendor.js:33-44`) caches organization category lookups for the lifetime of the process with no TTL or invalidation.
- Files: `backend/src/agendor.js:33-44`
- Impact: If an organization's category changes in Agendor (e.g., moves from "Lead" to "Cliente" or gets marked "Inativo (sem resposta)"), the cached stale value keeps being used until the backend process restarts — deals could be wrongly included/excluded from notifications for days.
- Fix approach: Add a TTL (e.g., re-fetch after 24h) or clear the cache at the start of each `getStaleDeals()` run / daily cron cycle.

**No outbound HTTP timeout on Agendor API calls:**
- Issue: `axios.create({ baseURL: BASE_URL, headers: {...} })` in `backend/src/agendor.js:6-9` does not set a `timeout`, and the same is true for the ad-hoc axios call in `backend/src/routes/notifications.js` (`GET /resolved` handler, `axios.get('https://api.agendor.com.br/v3/deals/...')`).
- Files: `backend/src/agendor.js:6-9`, `backend/src/routes/notifications.js` (resolved handler)
- Impact: A hung/slow Agendor API response can block the daily cron run (`runCheck()` in `backend/src/scheduler.js`) or a manual "check now" request indefinitely, since there's no client-side timeout to fall back on (only 429 retry logic exists, not generic timeout/network failure handling for `getStaleDeals`/`getUsers`).
- Fix approach: Set an explicit `timeout` (e.g., 15-30s) on the shared axios instance and the notifications.js axios call.

**In-memory login rate limiting resets on restart / doesn't scale horizontally:**
- Issue: `loginAttempts` in `backend/src/routes/auth.js` is a plain in-process `Map`, with no periodic cleanup of stale entries either.
- Files: `backend/src/routes/auth.js` (rate-limit block near top of file)
- Impact: PM2 restarts (deploys, crashes, `ecosystem.config.js` auto-restart) silently clear all rate-limit state, allowing renewed brute-force attempts right after a restart. The `Map` also grows unbounded for distinct IPs that never clear (blocked entries are deleted only after their block window elapses, but a large volume of unique attacking IPs would accumulate entries until each expires).
- Fix approach: Acceptable for a single-instance internal tool; if the app is ever scaled to multiple instances behind a load balancer, move rate limiting to the SQLite `login_logs` table (already recorded) or an external store (Redis).

**Repo root cluttered with non-application files (tracked in git):**
- Issue: The repo root contains a `package.json`/`package-lock.json` pair (now tracked — `git ls-files package.json package-lock.json` confirms both are committed, added in commit `4059350`) declaring only `pptxgenjs`, alongside one-off scripts (`make_pptx.js`, `make_docx.js`, `make_slides.js`, `capture_screenshots.py`) and large generated artifacts (`Agendor_Atualizar_Cards.pptx` ~29.7MB, `Automacao_Agendor_Apresentacao.pptx`, `DOCUMENTACAO.docx`, `relatorio_luiz_andrade.pdf`, `empresas_luiz.xlsx`, etc.) that are unrelated to the running application (which lives entirely in `backend/` and `frontend/`).
- Files: `package.json`, `package-lock.json`, `make_pptx.js`, `make_docx.js`, `make_slides.js`, `capture_screenshots.py`, `Agendor_Atualizar_Cards.pptx`, `Agendor_Atualizar_Cards.pptx.bak`, `Automacao_Agendor_Apresentacao.pptx`, `DOCUMENTACAO.docx`, `Solucao_Monitoramento_Agendor.docx`/`.pdf`, `relatorio_luiz_andrade.html`/`.pdf`, `luiz_andrade_cards.xlsx`, `empresas_luiz.xlsx`/`.txt`, stray Office lock files (`~$*.pptx`, `~$*.xlsx`)
- Impact: A third `node_modules` gets installed at repo root; it's unclear to a new contributor whether these scripts/artifacts are part of the shipped product; the ~30MB+ of binary Office files bloat every clone unnecessarily.
- Fix approach: Move presentation/report-generation scripts and their `package.json` into a `tools/` directory outside the deployed app, and either `git rm` the large generated binary artifacts (regenerable from the scripts) or move them to a non-git artifact store. Decide deliberately whether any of this belongs in version control.

## Known Bugs

**dotenv resolves `backend/.env` from the wrong working directory under PM2 (latent, not yet triggered):**
- Symptoms: None yet observed in production — `dotenv.config()` fails silently (`{ error: ENOENT }`, no throw) rather than crashing, so the app currently boots fine as long as no code path *requires* an env var that would otherwise come from `.env`.
- Files: `backend/src/index.js:1` (`require('dotenv').config()` — no `path` option, resolves from `process.cwd()`), `ecosystem.config.js:6` (`cwd: '/opt/agendor'`, while the actual file lives at `/opt/agendor/backend/.env`)
- Trigger: Any future change that adds required-env validation at boot (e.g., a stricter version of `backend/src/secret.js`'s "fail fast if `JWT_SECRET` missing" pattern applied to another var) will find the var undefined under PM2 in production, even though it's correctly set in `backend/.env`, and the process will refuse to start or behave with unintended defaults.
- Workaround: None currently needed because behavior degrades silently; scheduled to be fixed in Phase 3 plan `03-01` by passing an explicit `path: path.join(__dirname, '.env')` (or equivalent) to `dotenv.config()`.

## Security Considerations

**Agendor API production token exposed in public git history (HIGH, open):**
- Risk: The real production Agendor API token (`c57f59ef-...`) is recoverable from commit `13905d4` ("feat: automação de monitoramento de negócios parados no Agendor") in two files: `.claude/settings.local.json` (embedded in `Authorization: Token` headers inside recorded `curl` commands) and `backend/.env.example` (committed with the real value instead of a placeholder). Commit `20509cd` ("security: remove arquivos locais com tokens do rastreamento git") removed both files from tracking going forward but did **not** purge them from history — `git show 13905d4:.claude/settings.local.json` still recovers the token in any clone. The repository (`github.com/vitormorija/automacao-agendor`) is public.
- Files: historical — `.claude/settings.local.json`, `backend/.env.example` (as of commit `13905d4`)
- Current mitigation: None that actually revokes exposure. Rewriting history was evaluated and rejected as insufficient (objects stay reachable via the GitHub API even when unreferenced; forks/clones already made are unaffected). Making the repo private was tested on 2026-07-29 and reverted the same day, because a private repo on this free-tier GitHub account cannot use branch protection (both classic protection rules and the newer rulesets return `403 Upgrade to GitHub Pro`), which would remove the required-status-check merge gate that Phase 2 CI work depends on.
- Recommendations: Rotate the token in the Agendor admin panel — this is the only action that actually remediates the exposure. Deliberately deferred as of 2026-07-29 to preserve the public-repo branch-protection tradeoff above; tracked in `.planning/todos/pending/sec-01-rotate-agendor-token.md`. Treat this as the highest-priority open security item in the project.

**SMTP password stored in plaintext in the database:**
- Risk: `backend/src/db.js` (`defaults.smtp_pass`) and `backend/src/routes/config.js` (`setConfig('smtp_pass', ...)`) store the SMTP password unencrypted in the `config` table of `backend/agendor.db`, seeded from the environment at first boot and editable via the UI.
- Files: `backend/src/db.js` (config defaults), `backend/src/routes/config.js` (GET/PUT config)
- Current mitigation: The value is masked (`••••••••`) on `GET /api/config` so it isn't leaked to the frontend after initial entry; the DB file itself is gitignored (`*.db` in `.gitignore`).
- Recommendations: Because it lives in the DB, `smtp_pass` is copied verbatim into every daily backup under `/opt/agendor/backups` (`deploy/backup.sh`), multiplying the number of at-rest copies of the plaintext credential. Phase 3 moves SMTP credentials to the environment instead of the DB-backed config table, removing this from the backup surface entirely.

**`ADMIN_USERS` "legacy" fallback fails open — any authenticated user can manage accounts:**
- Risk: `requireAdmin()` in `backend/src/routes/auth.js` explicitly allows every authenticated user through to user-management routes (`GET/POST /users`, `DELETE /users/:username`, `GET /logs`) when the `ADMIN_USERS` env var is unset or empty (`if (!ADMIN_USERS.length) return next();`).
- Files: `backend/src/routes/auth.js` (`ADMIN_USERS` parsing + `requireAdmin`, routes at `/users`, `/users/:username`, `/logs`)
- Current mitigation: Documented in a code comment ("não configurado → não restringe") and in `backend/.env.example` (`ADMIN_USERS=admin@cadmus.com.br`, with an inline comment instructing operators to set it in production).
- Recommendations: Fail closed instead — deny account-management endpoints unless `ADMIN_USERS` is explicitly and non-emptily set, since a misconfigured or forgotten env var in production silently grants every logged-in user admin rights over accounts (create/delete users, read login logs). Deferred to Phase 6.

**JWT stored in `localStorage` (XSS exposure), CSP disabled:**
- Risk: `frontend/src/App.jsx` stores the auth JWT in `localStorage` (`localStorage.getItem('auth_token')` / `setItem`), readable by any JavaScript executing in the page context — including injected scripts from an XSS vulnerability.
- Files: `frontend/src/App.jsx` (token get/set/remove around lines 31, 43-45, 66-67)
- Current mitigation: `helmet` is used for security headers, but Content-Security-Policy is explicitly disabled (`contentSecurityPolicy: false` in `backend/src/index.js:15`, "desativado pois o frontend usa CDN/inline"), removing a key XSS mitigation layer.
- Recommendations: If feasible, move the token to an httpOnly cookie set by the backend, or at minimum enable a CSP once the frontend build no longer needs inline scripts/CDN assets, to reduce the blast radius of any future XSS bug.

**Login-failure timing difference could allow username enumeration:**
- Risk: `backend/src/routes/auth.js` returns immediately (records failed attempt + 401) when a username doesn't exist, without performing a dummy bcrypt compare, while the existing-user wrong-password path performs a real bcrypt compare. This creates a timing difference that could allow username enumeration.
- Files: `backend/src/routes/auth.js` (login handler, username-not-found vs wrong-password branches)
- Current mitigation: Both cases return the same generic message ("Usuário ou senha incorretos."), and rate limiting/blocking exists.
- Recommendations: Low priority for an internal team tool with a small user base; if hardening further, perform a constant-time dummy hash comparison even when the username is not found.

**Backend production dependencies carry known CVEs (see Tech Debt above for detail):**
- Risk: `axios@1.13.6` (SSRF/prototype-pollution/ReDoS advisories), `nodemailer@6.10.1` (SMTP command injection and related), transitive `path-to-regexp@0.1.12` via `express@4.22.1` (ReDoS) — 11 total advisories per `npm audit --omit=dev` in `backend/`, none gated by CI.
- Files: `backend/package.json`, `.github/workflows/ci.yml`
- Current mitigation: None automated. `axios`/`path-to-regexp`/`body-parser`/`follow-redirects`/`form-data`/`morgan` have non-breaking fixes available (`npm audit fix`); `nodemailer` needs a major-version bump.
- Recommendations: Apply the non-breaking `npm audit fix` set promptly; schedule the `nodemailer` v9 migration behind new send-path test coverage.

## Performance Bottlenecks

**Full deal-list re-fetch + org-category API calls on every dashboard/report page load:**
- Problem: `GET /api/deals/stale`, `GET /api/reports/current`, `GET /api/notifications/check`, and `POST /api/notifications/run` all call `getStaleDeals()` from scratch, which paginates the entire "Em andamento" deals list from Agendor (`backend/src/agendor.js:119-` region) and issues one `/organizations/:id` request per unique organization every single time, with only the in-process (non-expiring) `orgCategoryCache` reducing repeat calls within the same process lifetime.
- Files: `backend/src/agendor.js` (`getStaleDeals`, `getOrgCategory`), `backend/src/routes/deals.js`, `backend/src/routes/reports.js`
- Cause: No shared/persistent caching layer for the deals list itself — each dashboard tab load (`frontend/src/components/DealsList.jsx`, `frontend/src/components/ReportPanel.jsx`) triggers a full re-fetch+re-filter cycle against the live Agendor API.
- Improvement path: The frontend already partially compensates with `localStorage` caching (`deals_cache`, `report_cache`, `dashboard_check_cache`) and manual "refresh" actions, but a short-lived server-side cache (e.g., 5 minute in-memory TTL cache around `getStaleDeals()`) would reduce Agendor API load and page latency further, especially as deal volume grows.

**`getDealsWithFutureTasks()` paginates the entire open-tasks list on every check:**
- Problem: `backend/src/agendor.js` (`getDealsWithFutureTasks`, ~line 201 onward) fetches all tasks with `dueDateGt: yesterday` across all pages (100/page, sequential — not parallelized like `getStaleDeals`) on every `runCheck()`/`runCheckOnly()`/`GET /api/deals/stale` call.
- Files: `backend/src/agendor.js` (`getDealsWithFutureTasks`), `backend/src/scheduler.js`, `backend/src/routes/deals.js`
- Cause: Sequential `while (true)` pagination with no parallel batching (unlike `getStaleDeals`'s multi-page-at-a-time approach), and no caching between calls.
- Improvement path: Parallelize pagination similarly to the batch approach in `getStaleDeals()`, or cache results for a short TTL shared across the call sites that invoke it within the same check cycle.

## Fragile Areas

**Stale-deal filtering logic in `getStaleDeals()` is a long chain of implicit business rules:**
- Files: `backend/src/agendor.js` (`getStaleDeals`, lines ~119-190; constants `EXCLUDED_CATEGORIES` at 49, `EXCLUDED_OWNERS` at 55, `EXCLUDED_STAGE_WORDS` at 71)
- Why fragile: Whether a deal is included/excluded depends on multiple independently-evolving rules: `EXCLUDED_CATEGORIES`, `EXCLUDED_OWNERS` (currently `['Maria Lobato']`), `dealStatusId !== 1`, and a normalized-string substring match against `EXCLUDED_STAGE_WORDS` for stage names. A new deal stage name in Agendor containing one of these substrings incidentally would be silently excluded from notifications with no logging of *why* a given deal was filtered out.
- Safe modification: Any change to these constants should be cross-checked against the full current list of stage names/categories/owner names in the live Agendor account before deploying, and ideally the filtering should emit a debug log per excluded deal (`deal.id`, matched rule) to make future incidents diagnosable.
- Test coverage: Partial — `backend/test/agendor.getStaleDeals.test.js`, `agendor.funnel.test.js`, `agendor.pure.test.js`, and `agendor.realsample.test.js` now exercise much of this path (79.25% stmt / 69.11% branch coverage on `agendor.js` overall), a substantial improvement over the previous fully-untested state. The `EXCLUDED_OWNERS` name-match branch and some stage-word edge cases are among the remaining uncovered lines.

**`shouldNotifyOwner()` / `NO_OWNER_NOTIFY_FUNNELS` hardcodes a single special-cased funnel ("beefor"):**
- Files: `backend/src/agendor.js:61-65`, referenced from `backend/src/scheduler.js` and `backend/src/emailer.js` (owner-summary building)
- Why fragile: Funnel-based notification suppression is matched via exact lowercase string (`'beefor'`). If the funnel is renamed in Agendor (even by a single character or trailing space beyond what `.trim()` handles), the exclusion silently stops working and owners of Beefor deals would start receiving notifications again, or vice versa if a new similarly-named funnel is added and should NOT be excluded.
- Safe modification: When adding/removing funnels from this exclusion list, verify the exact funnel name string currently returned by the Agendor API (`deal.dealStage.funnel.name`) rather than assuming it matches the UI label.
- Test coverage: Covered — `backend/test/agendor.funnel.test.js` (6 tests) exercises `shouldNotifyOwner()` directly.

**`notification_log` growth is unbounded — no retention/archival policy:**
- Files: `backend/src/db.js` (table DDL, `idx_notiflog_sent_at`/`idx_notiflog_status` indexes, `getNotifiedDeals()` at line 284), `backend/src/routes/notifications.js` (`GET /resolved` handler consuming `getNotifiedDeals()`)
- Why fragile: Every notification sent (daily, per deal, per recipient) inserts a row and is never purged. `getNotificationLogs()` is paginated so read performance is initially fine (indexed via `idx_notiflog_sent_at`), but `getNotifiedDeals()` does a `GROUP BY deal_id` scan over the whole table with no `LIMIT`, and `GET /api/notifications/resolved` calls the Agendor API once per row returned by `getNotifiedDeals()` with no cap — as history grows this endpoint's latency and outbound API call volume grow unbounded too.
- Safe modification: Add a `LIMIT`/date-range filter to `getNotifiedDeals()` before it's used by `/api/notifications/resolved`, or introduce a periodic archival job for `notification_log` rows older than N months.
- Test coverage: `backend/test/db.dedup.test.js` covers the same-day dedup path (`alreadyNotifiedToday`) but not `getNotifiedDeals()`'s unbounded-scan behavior or the `/resolved` route's per-row Agendor call fan-out.

## Scaling Limits

**SQLite (`better-sqlite3`) single-file DB with `PM2 instances: 1`:**
- Current capacity: `ecosystem.config.js` runs a single PM2 instance (`instances: 1`), consistent with `better-sqlite3` being a synchronous, single-process, file-based database not designed for multi-process concurrent writers.
- Limit: The app cannot horizontally scale beyond one Node process without migrating off SQLite (or using SQLite in WAL mode with careful multi-process coordination, which isn't configured here). This is a deliberate, accepted constraint per `CLAUDE.md` ("Deploy: Alvo único de produção via PM2, single-instance — sem staging, sem escala horizontal"), not an oversight.
- Scaling path: Acceptable for current internal-tool scale (one company, daily cron, dashboard used by a handful of internal users). If load grows significantly, migrate to Postgres/MySQL and update `backend/src/db.js`'s query layer — explicitly out of scope for the current stabilization effort.

**Agendor API pagination assumes moderate total deal/task counts:**
- Current capacity: `getStaleDeals()` fetches all pages of "Em andamento" deals in parallel batches with a pause between batches; `getDealsWithFutureTasks()` fetches all future tasks sequentially, page by page (see Performance Bottlenecks above).
- Limit: As the Agendor account accumulates deals/tasks over multiple years, both fetches take proportionally longer per run, with the sequential task-fetch scaling linearly with total open-task pages since it isn't parallelized.
- Scaling path: If runs start exceeding the daily cron's practical window or causing timeouts, parallelize `getDealsWithFutureTasks()` like `getStaleDeals()`, or ask Agendor whether a server-side `updatedAt` filter can reduce the fetched dataset directly instead of client-side filtering after fetching everything.

## Dependencies at Risk

**Backend production dependencies with open CVEs — see Security Considerations above for full detail:**
- `axios@1.13.6` — high-severity SSRF/prototype-pollution/ReDoS advisories; non-breaking fix available.
- `nodemailer@6.10.1` — high-severity SMTP command injection and related advisories; fix requires a major-version bump to `9.x` (breaking, needs re-verification of `emailer.js`'s transporter API usage).
- `express@4.22.1` (transitive `path-to-regexp@0.1.12`) — high-severity ReDoS; non-breaking fix available within the express 4.x line.
- `body-parser`, `follow-redirects`, `form-data`, `morgan` — moderate advisories, non-breaking fixes available.
- Frontend dependencies: `npm audit` in `frontend/` reports 0 vulnerabilities as of 2026-07-29.
- No `npm audit` (or equivalent SCA tool) step exists in `.github/workflows/ci.yml` — these findings are not currently enforced by CI and require manual periodic checking.

## Missing Critical Features

**No React error boundary:**
- Problem: No `ErrorBoundary`/`componentDidCatch` implementation exists anywhere under `frontend/src`. An uncaught render error in any tab (`Dashboard`, `DealsList`, `NotificationHistory`, `ConfigPanel`, `ReportPanel`) would blank the entire app for the user instead of degrading gracefully.
- Blocks: Resilient UX when the backend returns unexpected/malformed data to one panel.

## Test Coverage Gaps

**Notification-send path (`emailer.js`) and orchestration (`scheduler.js`):**
- What's not tested: `sendStaleNotification`, `sendMailWithRetry`, `sendWeeklySummary`, `sendOwnerWeeklySummary` in `backend/src/emailer.js` (4.22% coverage); `runCheck`, `runCheckOnly`, `runWeeklySummary`, `scheduleTask`, `getStatus` in `backend/src/scheduler.js` (0% coverage).
- Files: `backend/src/emailer.js`, `backend/src/scheduler.js`
- Risk: This is the actual "who gets emailed and when" execution path, downstream of the well-tested filtering logic in `agendor.js`. A regression here (e.g., a broken retry loop that silently drops failed sends, or a scheduler bug that double-fires the daily job) would not be caught by the current suite and directly threatens the project's stated Core Value.
- Priority: High — this is the single largest remaining gap relative to the stated goal of a safety net over notification logic.

**Route layer and auth middleware:**
- What's not tested: `backend/src/middleware/auth.js` (JWT verification gate, 0%), `backend/src/routes/config.js`, `routes/deals.js`, `routes/notifications.js`, `routes/reports.js`, `routes/track.js` (all 0%).
- Files: as listed above
- Risk: Lower than the send-path gap since these are largely thin wrappers around already-tested domain functions (`db.js`, `agendor.js`), but `middleware/auth.js` gating every non-public request and `routes/track.js`'s open-redirect guard are both security-relevant enough to warrant at least smoke-level tests.
- Priority: Medium.

**Entire frontend (100% of `frontend/src`):**
- What's not tested: No component tests exist for `Dashboard.jsx`, `DealsList.jsx`, `ConfigPanel.jsx`, `NotificationHistory.jsx`, `ReportPanel.jsx`, `LoginPage.jsx`, `ChangePasswordModal.jsx`. `frontend/package.json` has no `test` script and no test runner is configured.
- Files: `frontend/src/components/*.jsx`
- Risk: UI regressions (e.g., broken config form validation, broken auth-token handling in `App.jsx`) are only caught by manual click-through testing.
- Priority: Low/Medium — lower risk than backend notification logic since UI bugs are usually visible immediately to users, but still worth basic smoke tests for the login/auth flow given its security sensitivity.

---

*Concerns audit: 2026-07-29*
