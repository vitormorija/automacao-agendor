<!-- refreshed: 2026-07-29 -->
# Architecture

**Analysis Date:** 2026-07-29

## System Overview

```text
┌───────────────────────────────────────────────────────────────┐
│                 Frontend (React SPA, Vite)                     │
│  `frontend/src/App.jsx` — tab-based shell, fetch interceptor   │
├──────────────────┬──────────────────┬───────────────────────┤
│  Dashboard        │  DealsList        │  ConfigPanel/Report   │
│ `components/`     │ `components/`     │ `components/`         │
└────────┬──────────┴────────┬──────────┴──────────┬────────────┘
         │ fetch('/api/...', { Authorization: Bearer <jwt> })
         ▼
┌───────────────────────────────────────────────────────────────┐
│              Express API Layer (backend/src/index.js)          │
│  helmet → cors → json → morgan → authMiddleware → routers      │
├──────────┬──────────┬──────────┬──────────┬──────────────────┤
│ auth.js  │ deals.js │ notifi-  │ config.js│ reports.js       │
│          │          │ cations  │          │                  │
│ track.js (public, no auth)                                   │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬──────────────┘
     │          │          │          │          │
     ▼          ▼          ▼          ▼          ▼
┌───────────────────────────────────────────────────────────────┐
│              Domain / Service Modules (backend/src)            │
│  agendor.js (Agendor API client + business filters)            │
│  emailer.js (nodemailer + HTML templates)                      │
│  scheduler.js (node-cron orchestration: runCheck, weekly)       │
│  logger.js (structured console logger)                          │
│  secret.js (JWT_SECRET boot validation)                         │
└──────────┬───────────────────────────────┬──────────────────────┘
           │                               │
           ▼                               ▼
┌───────────────────────────┐   ┌──────────────────────────────┐
│  SQLite (better-sqlite3)   │   │  Agendor REST API (external)  │
│  `backend/agendor.db`      │   │  https://api.agendor.com.br/v3│
│  via `backend/src/db.js`   │   │  Token auth, called by agendor.js│
│  path overridable via      │   └──────────────────────────────┘
│  `DB_PATH` env (`:memory:` │
│  in tests)                 │
└───────────────────────────┘

Test suite (backend/test/*.test.js, Node's built-in `node:test`) exercises
these same modules directly, with `test/helpers/fakeAxios.js` standing in
for the Agendor HTTP boundary and `test/helpers/tmpDb.js` / DB_PATH pointing
db.js at :memory: or a temp file — no separate test-only architecture layer.
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Express bootstrap | Middleware chain, route mounting, static SPA serving, graceful shutdown | `backend/src/index.js` |
| Auth middleware | Verifies JWT on every request except public paths | `backend/src/middleware/auth.js` |
| Auth routes | Login, logout-implicit (client-side), password change/reset, user CRUD, login logs | `backend/src/routes/auth.js` |
| Deals routes | Read-only stale-deal listing for UI | `backend/src/routes/deals.js` |
| Notifications routes | Manual run/check triggers, history, stats, test-email endpoints, resolved-deal polling | `backend/src/routes/notifications.js` |
| Config routes | Get/update app config (SMTP, cron, thresholds), SMTP connectivity test | `backend/src/routes/config.js` |
| Reports routes | Aggregates stale deals into chart-ready groupings + weekly snapshot history | `backend/src/routes/reports.js` |
| Track routes | Public click-tracking redirect for email links (open redirect guarded) | `backend/src/routes/track.js` |
| Agendor client | Fetches/paginates deals, users, tasks from Agendor API; applies business filters (category exclusions, stage exclusions, owner exclusions, funnel notify rules) | `backend/src/agendor.js` |
| Emailer | Builds HTML emails (stale notification, weekly summaries, password reset) and sends via nodemailer using DB-stored SMTP config | `backend/src/emailer.js` |
| Scheduler | Orchestrates cron jobs: daily stale-deal check (`runCheck`), Friday weekly summary (`runWeeklySummary`); exposes manual `runCheckOnly` | `backend/src/scheduler.js` |
| DB layer | Single SQLite connection, schema creation/migrations, all data-access functions (config, notification_log, weekly_snapshots, app_users, reset_tokens, login_logs) | `backend/src/db.js` |
| Logger | Minimal structured logger (JSON in prod, readable text in dev) | `backend/src/logger.js` |
| Secret loader | Fails fast at boot if `JWT_SECRET` missing/weak | `backend/src/secret.js` |
| React shell | Tab navigation, auth state (localStorage token), global fetch interceptor that injects `Authorization` header | `frontend/src/App.jsx` |
| React components | One component per tab/feature area, each doing its own `fetch()` calls directly (no shared API client module) | `frontend/src/components/*.jsx` |
| Test suite | `node:test`-based tests on pure business filters, dedup, and auth rate-limiting/password logic; native runner + `c8` coverage, no separate test framework | `backend/test/*.test.js`, `backend/test/helpers/*.js` |

## Pattern Overview

**Overall:** Monolithic layered Node/Express backend + separate React SPA frontend, communicating over a JSON REST API on the same origin in production (frontend built and served as static files by Express) and via the Vite dev-proxy in development.

**Key Characteristics:**
- No ORM — raw SQL via `better-sqlite3` prepared statements, synchronous calls.
- No service/repository split beyond `db.js` (data access) and `agendor.js` (external API access) — route handlers call these directly.
- Route handlers double as the "application service" layer (business logic for aggregation/reporting lives inline in `routes/reports.js` and `routes/notifications.js`).
- Scheduler (`scheduler.js`) reuses the same domain functions (`agendor.js`, `emailer.js`, `db.js`) as the HTTP routes — no duplication between cron-triggered and manually-triggered runs.
- Frontend has no state management library or API client abstraction; each component performs its own `fetch()` and manages local state with `useState`/`useEffect`.
- Single shared SQLite file for both business data and app auth data (`config`, `notification_log`, `weekly_snapshots`, `app_users`, `reset_tokens`, `login_logs` all in one file: `backend/agendor.db`).
- Backend test suite runs against real modules with faked I/O boundaries, not a mocking framework: `backend/test/helpers/fakeAxios.js` intercepts `axios` calls made by `agendor.js`, and `db.js` honors a `DB_PATH` env var so tests point it at `:memory:` or a temp file instead of the real `agendor.db`. This is enabled by `backend/test/setup.js`, which pre-sets `JWT_SECRET`, `DB_PATH`, `AGENDOR_TOKEN`, `SMTP_PASS`, `ADMIN_EMAIL` before any domain module's require-time side effects run.

## Layers

**HTTP/Transport Layer:**
- Purpose: Request parsing, security headers, CORS, auth gate, logging, error normalization
- Location: `backend/src/index.js`, `backend/src/middleware/auth.js`
- Contains: Express middleware chain
- Depends on: `logger.js`, `secret.js`
- Used by: All route modules

**Route Layer:**
- Purpose: Maps HTTP endpoints to domain operations, validates input, shapes JSON responses
- Location: `backend/src/routes/*.js`
- Contains: Express routers, one file per resource area
- Depends on: `db.js`, `agendor.js`, `emailer.js`, `scheduler.js`
- Used by: `index.js` (mounted under `/api/*`)

**Domain/Integration Layer:**
- Purpose: Business rules (stale-deal filtering, notification eligibility) and external system access (Agendor API, SMTP)
- Location: `backend/src/agendor.js`, `backend/src/emailer.js`, `backend/src/scheduler.js`
- Contains: Business filter constants (`EXCLUDED_CATEGORIES`, `EXCLUDED_STAGE_WORDS`, `NO_OWNER_NOTIFY_FUNNELS`, `EXCLUDED_OWNERS`), pagination/retry logic, HTML email templates, cron scheduling
- Depends on: `db.js` (config reads), external HTTP APIs (Agendor, SMTP)
- Used by: Route layer, itself (scheduler calls agendor.js + emailer.js)

**Data Layer:**
- Purpose: Single point of SQLite access; schema definition, migrations, CRUD helpers
- Location: `backend/src/db.js`
- Contains: Table DDL, prepared-statement functions grouped by entity (config, notification_log, weekly_snapshots, app_users, reset_tokens, login_logs)
- Depends on: `better-sqlite3`; path overridable via `DB_PATH` env var
- Used by: Route layer, scheduler, auth routes, emailer (indirectly via config reads)

**Frontend Presentation Layer:**
- Purpose: Renders UI, collects user input, calls backend API directly
- Location: `frontend/src/App.jsx`, `frontend/src/components/*.jsx`
- Contains: React function components, Tailwind classes, `recharts` charts (`ReportPanel.jsx`), `react-hot-toast` notifications
- Depends on: Backend REST API (`/api/*`)
- Used by: Browser runtime (built by Vite)

**Test Layer:**
- Purpose: Verifies business-critical filtering/notification-eligibility rules and auth security behavior stay correct across changes
- Location: `backend/test/*.test.js`, `backend/test/helpers/`, `backend/test/fixtures/`
- Contains: `node:test` suites, an in-process `axios` fake, a temp-SQLite helper, anonymized real-sample and synthetic Agendor API fixtures
- Depends on: The exact modules under `backend/src/` (imports them directly, no separate build step)
- Used by: `npm test` / `npm run test:coverage` locally; the `backend` job in `.github/workflows/ci.yml`

## Data Flow

### Primary Request Path (Manual "Run Check Now")

1. User clicks "Executar agora" in `frontend/src/components/Dashboard.jsx` → `fetch('/api/notifications/run', { method: 'POST' })`
2. Global fetch interceptor in `frontend/src/App.jsx:29-39` injects `Authorization: Bearer <token>`
3. Request hits Express chain: helmet → cors → morgan → `authMiddleware` (`backend/src/middleware/auth.js:12`) → `backend/src/routes/notifications.js:45` (`POST /run`)
4. Route calls `runCheck()` in `backend/src/scheduler.js:26`
5. `runCheck` reads config (`getConfig('stale_days')`, `admin_email`, `notify_author`, `notifications_enabled`) then fetches `getStaleDeals`, `getUsers`, `getDealsWithFutureTasks` in parallel from `backend/src/agendor.js`
6. Filters out deals already notified today (`db.js: alreadyNotifiedToday`) and deals in `NO_OWNER_NOTIFY_FUNNELS` (`shouldNotifyOwner`)
7. For each eligible deal: writes a `notification_log` row first (`db.js: logNotification`, capturing `logId`), then calls `sendStaleNotification` (`backend/src/emailer.js`) which builds HTML and sends via `nodemailer` with retry (`sendMailWithRetry`, 3 attempts)
8. Aggregated result JSON (`checked`, `stale`, `notified`, `skipped`, `errors`, `deals[]`) returned to frontend; toast notification shown

### Daily/Weekly Scheduled Flow

1. `backend/src/index.js:143-144` calls `scheduleTask()` inside the `server.listen()` callback at boot
2. `scheduler.js: scheduleTask()` registers two `node-cron` jobs (timezone `America/Sao_Paulo`): daily `runCheck` per configured `cron_schedule` (default `0 8 * * *`), and Friday-11am `runWeeklySummary`
3. `runWeeklySummary` re-fetches stale deals/users, computes owner/category/funnel aggregates, persists a `weekly_snapshots` row (`db.js: saveWeeklySnapshot`), then sends one consolidated admin email (`sendWeeklySummary`) and one per-owner summary email (`sendOwnerWeeklySummary`)
4. `stopTasks()` is called from the graceful-shutdown handler (`SIGTERM`/`SIGINT`) in `backend/src/index.js` to cancel both cron timers before exit

### Email Click Tracking Flow

1. Emails built in `emailer.js` embed a link to `${BASE_URL}/api/track/click?log_id=<id>&u=<fallback>` (only when a public non-localhost `BASE_URL` is configured, validated at boot by `checkBaseUrl()` in `index.js`; otherwise the direct Agendor URL is used)
2. Recipient clicks → `GET /api/track/click` in `backend/src/routes/track.js` (public route, bypasses auth via `PUBLIC_PATHS` in `middleware/auth.js`)
3. Route looks up the log by id (`getLogById`), records `clicked_at` once (`recordClick`), and redirects to `deal.web_url`; falls back to a domain-validated `u` query param (`isSafeRedirect`, allowlists `agendor.com.br` and subdomains — prevents an open-redirect/phishing vector), then to the Agendor homepage as a last resort

**State Management:**
- Backend: no in-memory session state beyond a `Map` of login rate-limit attempts (`routes/auth.js: loginAttempts`) and scheduler run-lock flags (`scheduler.js: isRunning`, `currentTask`, `weeklyTask`, `lastRunResult`) — all reset on process restart
- Frontend: component-local `useState`/`useEffect` only; auth token and username persisted in `localStorage` (`auth_token`, `auth_user`)

## Key Abstractions

**Config-as-KV-store:**
- Purpose: All runtime-tunable settings (SMTP creds, cron schedule, stale-day threshold, admin emails, feature toggles) stored as string rows in the `config` table rather than env vars, editable via UI without a restart
- Examples: `backend/src/db.js:126-141` (`getConfig`/`setConfig`/`getAllConfig`), `backend/src/routes/config.js`
- Pattern: Key-value table seeded with defaults on module load (`defaults` object, `db.js:104-124`); consumers call `getConfig('key')` and parse/coerce inline (e.g., `parseInt(getConfig('stale_days')) || 15`)

**Notification log as audit + dedup + tracking source:**
- Purpose: `notification_log` table serves three roles simultaneously — audit trail, same-day dedup check (`alreadyNotifiedToday`), and click-tracking target (`recordClick`, `getLogById`)
- Examples: `backend/src/db.js:143-313`
- Pattern: Every send attempt (success or error) is logged before/around the SMTP call, with the returned `lastInsertRowid` threaded into the email body as the tracking `log_id`

**Deal enrichment pipeline:**
- Purpose: Raw Agendor deal objects are progressively enriched (owner email, org category, resolved status) by joining against `getUsers()` and `getOrgCategory()` results
- Examples: `backend/src/agendor.js:119-197` (`getStaleDeals`), used identically in `routes/deals.js`, `routes/reports.js`, `routes/notifications.js`, `scheduler.js`
- Pattern: Fetch raw list → filter by business rules (category/owner/stage/funnel exclusions) → map to enriched plain objects; repeated independently per call site rather than cached/shared (see Anti-Patterns)

## Entry Points

**HTTP Server:**
- Location: `backend/src/index.js`
- Triggers: `node src/index.js` (via `npm start` or `nodemon` in dev), or PM2 (`ecosystem.config.js`) in production
- Responsibilities: Registers middleware, mounts routers, serves built frontend in production, starts scheduler, handles `SIGTERM`/`SIGINT` graceful shutdown

**Cron Jobs:**
- Location: `backend/src/scheduler.js` (`scheduleTask`)
- Triggers: Invoked once at server boot from `backend/src/index.js:143`; internally uses `node-cron` timers
- Responsibilities: Daily stale-deal check + notification send; weekly admin/owner summary emails

**Frontend SPA:**
- Location: `frontend/src/main.jsx` → `frontend/src/App.jsx`
- Triggers: Browser loads `frontend/index.html`, Vite/React bootstraps
- Responsibilities: Renders login gate or tabbed dashboard depending on stored JWT

**Test Suite:**
- Location: `backend/test/*.test.js`, orchestrated by `backend/test/setup.js` (env-var presets applied before other modules load)
- Triggers: `npm test` (`node --test`) or `npm run test:coverage` (`c8 ... node --test`) inside `backend/`; the `backend` job in `.github/workflows/ci.yml` on every PR and push to `main`
- Responsibilities: Exercises pure business-filter functions (`agendor.js`: funnel notify rules, excluded stages, stale-deal selection against real and synthetic fixtures), notification dedup (`db.js`), and auth rate-limiting/password verification (`auth.js`) with real modules and faked HTTP/DB boundaries

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop; `better-sqlite3` calls are synchronous (blocking) by design, so all DB access is fast/local but can stall the event loop under heavy concurrent load
- **Global state:** Single shared SQLite `Database` instance opened once at module load (`backend/src/db.js:5`); scheduler module-level task handles (`currentTask`, `weeklyTask`, `isRunning`, `lastRunResult` in `backend/src/scheduler.js`); in-memory rate-limit `Map` (`routes/auth.js: loginAttempts`) and `orgCategoryCache` (`backend/src/agendor.js:33`) — all reset on restart
- **Circular imports:** None observed — dependency direction is strictly routes → domain modules → db/external APIs. `backend/src/index.js` deliberately defers `require('./scheduler')` and `require('./db')` to inside the `listen()` callback and `shutdown()` function to sequence initialization around the module-level DB connection
- **No process manager built in:** `ecosystem.config.js` (PM2) exists at repo root for production process management (`autorestart`, `max_memory_restart: 300M`, `max_restarts: 10`); graceful shutdown logic in `index.js` assumes `SIGTERM`/`SIGINT` from PM2 or shell
- **Single point of failure:** One SQLite file (`backend/agendor.db`) backs both business data and authentication data — no read replica, no connection pool, no migration framework beyond hand-written idempotent `ALTER TABLE` statements guarded by `catch (_) {}`
- **Test isolation via env, not containers:** `backend/test/setup.js` overrides `JWT_SECRET`, `DB_PATH` (`:memory:`), `AGENDOR_TOKEN`, `SMTP_PASS`, `ADMIN_EMAIL` before any domain module loads, because `secret.js` throws at require-time and `db.js` opens SQLite at require-time — any new backend module with require-time side effects must be accounted for here or tests will fail/leak state
- **CI enforces a coverage floor, not full coverage:** `backend/.c8rc.json` requires only 20% lines/statements/functions and 60% branches (`check-coverage: true`), scoped to `src/**/*.js` and excluding `src/index.js` — this is a measure-first floor (see `.planning/phases/02-*`), not a target; do not assume the whole codebase is well-tested because CI is green

## Anti-Patterns

### Duplicated deal-fetch-and-enrich logic across routes

**What happens:** `getStaleDeals` + `getUsers` + email-enrichment mapping is independently re-implemented in `backend/src/routes/deals.js`, `backend/src/routes/reports.js`, `backend/src/routes/notifications.js` (multiple endpoints), and `backend/src/scheduler.js`.
**Why it's wrong:** Any change to enrichment logic (e.g., new field) must be updated in 5+ places; increases risk of drift between dashboard, report, and notification views; each call re-fetches and re-paginates the full Agendor deal list even across near-simultaneous requests.
**Do this instead:** When touching this logic, extract a single `getEnrichedStaleDeals(staleDays)` helper in `backend/src/agendor.js` and have all routes/scheduler call it — as an isolated refactor phase, backed by the existing `backend/test/agendor.getStaleDeals.test.js` coverage, per the project's "don't mix refactor with new features" constraint.

### Business logic embedded directly in route handlers

**What happens:** Aggregation math (grouping by owner/category/funnel, urgency bands) lives inline in `backend/src/routes/reports.js:7-98`, mock-deal construction for test emails lives inline in `backend/src/routes/notifications.js:56-84`, and config validation logic lives inline in `backend/src/routes/config.js` (`VALIDATORS` map).
**Why it's wrong:** Makes route handlers large and hard to unit-test independent of Express; no reuse if aggregation is needed elsewhere (e.g., a future API for external consumers).
**Do this instead:** Prefer adding a pure, exported, directly-testable function in the same file or a sibling module rather than adding more inline blocks — mirroring how `agendor.js` already exports pure predicates like `isExcludedStage`, `shouldNotifyOwner`, `getDealType` for direct unit testing (`backend/test/agendor.pure.test.js`).

## Error Handling

**Strategy:** Try/catch per route handler returning `{ error: message }` or `{ ok: false, message }` with appropriate status codes; a final Express error-handling middleware (`backend/src/index.js:90-102`) catches uncaught errors, logs full stack to `logs/error.log`, and returns a generic message in production (no stack leakage).

**Patterns:**
- Route-level try/catch is the norm; no centralized `asyncHandler` wrapper — each async handler repeats `try { ... } catch (err) { res.status(500).json({ error: err.message }) }`
- `agendor.js: fetchDealsPage` implements manual retry-with-backoff for HTTP 429 from the Agendor API (`backend/src/agendor.js:100-116`)
- Non-critical failures (e.g., `getOrgCategory` failing for one org) are swallowed and cached as `null` rather than failing the whole request (`backend/src/agendor.js:34-46`)
- Auth failures never reveal whether a username exists: `forgot-password` always returns `{ ok: true }` (`backend/src/routes/auth.js:250-278`)

## Cross-Cutting Concerns

**Logging:** `backend/src/logger.js` — structured logger (JSON lines in production, readable text in dev), used for scheduler/auth/index events; `morgan` handles HTTP access logs to `logs/access.log` (all environments) plus console (`dev` format outside production); some modules still use raw `console.log`/`console.error` directly (e.g., `backend/src/agendor.js:225,230`, `backend/src/routes/track.js:31`) — inconsistent with `logger.js` elsewhere; do not replicate this in new code.

**Validation:** Manual per-field validators in `backend/src/routes/config.js:13-32` (`VALIDATORS` map keyed by config field); auth routes validate presence/length inline (`routes/auth.js`); no schema validation library (e.g., zod/joi) used anywhere.

**Authentication:** JWT-based, verified per-request in `backend/src/middleware/auth.js` against `JWT_SECRET` (fails boot if unset/short — `backend/src/secret.js`); passwords hashed with bcrypt (`bcryptjs`, 10 rounds), with a legacy plaintext-password comparison path preserved for compatibility (`verifyPassword` in `routes/auth.js`); login rate-limited by IP (in-memory, 5 attempts/15 min block, `routes/auth.js:44-78`); optional `ADMIN_USERS` env var restricts user-management endpoints (`routes/auth.js:26-42`).

---

*Architecture analysis: 2026-07-29*
