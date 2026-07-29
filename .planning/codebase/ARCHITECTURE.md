<!-- refreshed: 2026-07-22 -->
# Architecture

**Analysis Date:** 2026-07-22

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                 Frontend (React SPA, Vite)                   │
│  `frontend/src/App.jsx` — tab-based shell, fetch interceptor │
├──────────────────┬──────────────────┬───────────────────────┤
│  Dashboard        │  DealsList        │  ConfigPanel/Report   │
│ `components/`     │ `components/`     │ `components/`         │
└────────┬──────────┴────────┬──────────┴──────────┬────────────┘
         │ fetch('/api/...', { Authorization: Bearer <jwt> })
         ▼
┌─────────────────────────────────────────────────────────────┐
│              Express API Layer (backend/src/index.js)        │
│  helmet → cors → json → morgan → authMiddleware → routers    │
├──────────┬──────────┬──────────┬──────────┬──────────────────┤
│ auth.js  │ deals.js │ notifi-  │ config.js│ reports.js       │
│          │          │ cations  │          │                  │
│ track.js (public, no auth)                                   │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬──────────────┘
     │          │          │          │          │
     ▼          ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────┐
│              Domain / Service Modules (backend/src)          │
│  agendor.js (Agendor API client + business filters)          │
│  emailer.js (nodemailer + HTML templates)                    │
│  scheduler.js (node-cron orchestration: runCheck, weekly)     │
│  logger.js (structured console logger)                        │
│  secret.js (JWT_SECRET boot validation)                       │
└──────────┬───────────────────────────────┬────────────────────┘
           │                               │
           ▼                               ▼
┌───────────────────────────┐   ┌──────────────────────────────┐
│  SQLite (better-sqlite3)   │   │  Agendor REST API (external)  │
│  `backend/agendor.db`      │   │  https://api.agendor.com.br/v3│
│  via `backend/src/db.js`   │   │  Token auth, called by agendor.js│
└───────────────────────────┘   └──────────────────────────────┘
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
| Emailer | Builds HTML emails (stale notification, weekly summaries) and sends via nodemailer using DB-stored SMTP config | `backend/src/emailer.js` |
| Scheduler | Orchestrates cron jobs: daily stale-deal check (`runCheck`), Friday weekly summary (`runWeeklySummary`); exposes manual `runCheckOnly` | `backend/src/scheduler.js` |
| DB layer | Single SQLite connection, schema creation/migrations, all data-access functions (config, notification_log, weekly_snapshots, app_users, reset_tokens, login_logs) | `backend/src/db.js` |
| Logger | Minimal structured logger (JSON in prod, readable text in dev) | `backend/src/logger.js` |
| Secret loader | Fails fast at boot if `JWT_SECRET` missing/weak | `backend/src/secret.js` |
| React shell | Tab navigation, auth state (localStorage token), global fetch interceptor that injects `Authorization` header | `frontend/src/App.jsx` |
| React components | One component per tab/feature area, each doing its own `fetch()` calls directly (no shared API client module) | `frontend/src/components/*.jsx` |

## Pattern Overview

**Overall:** Monolithic layered Node/Express backend + separate React SPA frontend, communicating over a JSON REST API on the same origin in production (frontend built and served as static files by Express) and via Vite dev-proxy in development.

**Key Characteristics:**
- No ORM — raw SQL via `better-sqlite3` prepared statements, synchronous calls
- No service/repository split beyond `db.js` (data access) and `agendor.js` (external API access) — route handlers call these directly
- Route handlers double as the "application service" layer (business logic for aggregation/reporting lives inline in `routes/reports.js` and `routes/notifications.js`)
- Scheduler (`scheduler.js`) reuses the same domain functions (`agendor.js`, `emailer.js`, `db.js`) as the HTTP routes — no duplication between cron-triggered and manually-triggered runs
- Frontend has no state management library or API client abstraction; each component performs its own `fetch()` and manages local state with `useState`/`useEffect`
- Single shared SQLite file for both business data and app auth data (`config`, `notification_log`, `weekly_snapshots`, `app_users`, `reset_tokens`, `login_logs` all in one file: `backend/agendor.db`)

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
- Contains: Business filter constants (`EXCLUDED_CATEGORIES`, `EXCLUDED_STAGE_WORDS`, `NO_OWNER_NOTIFY_FUNNELS`), pagination/retry logic, HTML email templates, cron scheduling
- Depends on: `db.js` (config reads), external HTTP APIs (Agendor, SMTP)
- Used by: Route layer, itself (scheduler calls agendor.js + emailer.js)

**Data Layer:**
- Purpose: Single point of SQLite access; schema definition, migrations, CRUD helpers
- Location: `backend/src/db.js`
- Contains: Table DDL, prepared-statement functions grouped by entity (config, notification_log, weekly_snapshots, app_users, reset_tokens, login_logs)
- Depends on: `better-sqlite3`
- Used by: Route layer, scheduler, emailer (indirectly via config reads)

**Frontend Presentation Layer:**
- Purpose: Renders UI, collects user input, calls backend API directly
- Location: `frontend/src/App.jsx`, `frontend/src/components/*.jsx`
- Contains: React function components, Tailwind classes, `recharts` charts (`ReportPanel.jsx`), `react-hot-toast` notifications
- Depends on: Backend REST API (`/api/*`)
- Used by: Browser runtime (built by Vite)

## Data Flow

### Primary Request Path (Manual "Run Check Now")

1. User clicks "Executar agora" in `frontend/src/components/Dashboard.jsx` → `fetch('/api/notifications/run', { method: 'POST' })`
2. Global fetch interceptor in `frontend/src/App.jsx:20-31` injects `Authorization: Bearer <token>`
3. Request hits Express chain: helmet → cors → morgan → `authMiddleware` (`backend/src/middleware/auth.js:12`) → `routes/notifications.js:33` (`POST /run`)
4. Route calls `runCheck()` in `backend/src/scheduler.js:12`
5. `runCheck` fetches `getStaleDeals`, `getUsers`, `getDealsWithFutureTasks` in parallel from `backend/src/agendor.js`
6. Filters out deals already notified today (`db.js: alreadyNotifiedToday`) and deals in `NO_OWNER_NOTIFY_FUNNELS`
7. For each eligible deal: writes a `notification_log` row (`db.js: logNotification`), then calls `sendStaleNotification` (`backend/src/emailer.js`) which builds HTML and sends via `nodemailer`
8. Aggregated result JSON returned to frontend; toast notification shown

### Daily/Weekly Scheduled Flow

1. `backend/src/index.js:115` calls `scheduleTask()` on server start
2. `scheduler.js: scheduleTask()` registers two `node-cron` jobs (timezone `America/Sao_Paulo`): daily `runCheck` per configured `cron_schedule` (default `0 8 * * *`), and Friday-11am `runWeeklySummary`
3. `runWeeklySummary` re-fetches stale deals/users, computes owner/category/funnel aggregates, persists a `weekly_snapshots` row (`db.js: saveWeeklySnapshot`), then sends one consolidated admin email and one per-owner summary email

### Email Click Tracking Flow

1. Emails built in `emailer.js` embed a link to `${BASE_URL}/api/track/click?log_id=<id>&u=<fallback>` (only when a public non-localhost `BASE_URL` is configured; otherwise the direct Agendor URL is used)
2. Recipient clicks → `GET /api/track/click` in `backend/src/routes/track.js` (public route, bypasses auth via `PUBLIC_PATHS`)
3. Route looks up the log by id, records `clicked_at` (`db.js: recordClick`), and redirects to `deal.web_url`; falls back to a domain-validated `u` query param, then to the Agendor homepage

**State Management:**
- Backend: no in-memory session state beyond a `Map` of login rate-limit attempts (`routes/auth.js: loginAttempts`) and scheduler run-lock flags (`scheduler.js: isRunning`, `currentTask`, `weeklyTask`, `lastRunResult`) — all reset on process restart
- Frontend: component-local `useState`/`useEffect` only; auth token persisted in `localStorage` (`auth_token`, `auth_user`)

## Key Abstractions

**Config-as-KV-store:**
- Purpose: All runtime-tunable settings (SMTP creds, cron schedule, stale-day threshold, admin emails, feature toggles) stored as string rows in the `config` table rather than env vars, editable via UI
- Examples: `backend/src/db.js:119-131` (`getConfig`/`setConfig`/`getAllConfig`), `backend/src/routes/config.js`
- Pattern: Key-value table seeded with defaults on boot; consumers call `getConfig('key')` and parse/coerce inline (e.g., `parseInt(getConfig('stale_days'))`)

**Notification log as audit + dedup + tracking source:**
- Purpose: `notification_log` table serves three roles simultaneously — audit trail, same-day dedup check (`alreadyNotifiedToday`), and click-tracking target (`recordClick`, `getLogById`)
- Examples: `backend/src/db.js:133-232`
- Pattern: Every send attempt (success or error) is logged before/around the SMTP call

**Deal enrichment pipeline:**
- Purpose: Raw Agendor deal objects are progressively enriched (owner email, org category, resolved status) by joining against `getUsers()` and `getOrgCategory()` results
- Examples: `backend/src/agendor.js:92-161` (`getStaleDeals`), used identically in `routes/deals.js`, `routes/reports.js`, `routes/notifications.js`, `scheduler.js`
- Pattern: Fetch raw list → filter by business rules → map to enriched plain objects; repeated per-route rather than cached/shared

## Entry Points

**HTTP Server:**
- Location: `backend/src/index.js`
- Triggers: `node src/index.js` (via `npm start` or `nodemon` in dev)
- Responsibilities: Registers middleware, mounts routers, serves built frontend in production, starts scheduler, handles `SIGTERM`/`SIGINT` graceful shutdown

**Cron Jobs:**
- Location: `backend/src/scheduler.js` (`scheduleTask`)
- Triggers: Invoked once at server boot from `index.js:115`; internally uses `node-cron` timers
- Responsibilities: Daily stale-deal check + notification send; weekly admin/owner summary emails

**Frontend SPA:**
- Location: `frontend/src/main.jsx` → `frontend/src/App.jsx`
- Triggers: Browser loads `frontend/index.html`, Vite/React bootstraps
- Responsibilities: Renders login gate or tabbed dashboard depending on stored JWT

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop; `better-sqlite3` calls are synchronous (blocking) by design, so all DB access is fast/local but can stall the event loop under heavy concurrent load
- **Global state:** Single shared SQLite `Database` instance opened once at module load (`backend/src/db.js:4`); scheduler module-level task handles (`currentTask`, `weeklyTask`, `isRunning`, `lastRunResult` in `backend/src/scheduler.js`); in-memory rate-limit `Map` and `orgCategoryCache` (`backend/src/agendor.js:31`) reset on restart
- **Circular imports:** None observed — dependency direction is strictly routes → domain modules → db/external APIs
- **No process manager built in:** `ecosystem.config.js` (PM2) exists at repo root for production process management; graceful shutdown logic in `index.js` assumes SIGTERM/SIGINT from PM2 or shell

## Anti-Patterns

### Duplicated deal-fetch-and-enrich logic across routes

**What happens:** `getStaleDeals` + `getUsers` + email-enrichment mapping is independently re-implemented in `routes/deals.js`, `routes/reports.js`, `routes/notifications.js` (multiple endpoints), and `scheduler.js`.
**Why it's wrong:** Any change to enrichment logic (e.g., new field) must be updated in 5+ places; increases risk of drift between dashboard, report, and notification views.
**Do this instead:** Extract a single `getEnrichedStaleDeals(staleDays)` helper in `backend/src/agendor.js` and have all routes/scheduler call it.

### Business logic embedded directly in route handlers

**What happens:** Aggregation math (grouping by owner/category/funnel, urgency bands) lives inline in `backend/src/routes/reports.js:18-62`, and mock-deal construction for test emails lives inline in `backend/src/routes/notifications.js:43-60`.
**Why it's wrong:** Makes route handlers large and hard to unit-test independent of Express; no reuse if aggregation is needed elsewhere (e.g., a future API for external consumers).
**Do this instead:** Move aggregation into a `reports.js`-style service module under `backend/src/` (not `routes/`), keeping route handlers thin (parse params → call service → send JSON).

## Error Handling

**Strategy:** Try/catch per route handler returning `{ error: message }` or `{ ok: false, message }` with appropriate status codes; a final Express error-handling middleware (`backend/src/index.js:78-89`) catches uncaught errors, logs full stack to `logs/error.log`, and returns a generic message in production (no stack leakage).

**Patterns:**
- Route-level try/catch is the norm; no centralized `asyncHandler` wrapper — each async handler repeats `try { ... } catch (err) { res.status(500).json({ error: err.message }) }`
- `agendor.js: fetchDealsPage` implements manual retry-with-backoff for HTTP 429 from the Agendor API (`backend/src/agendor.js:73-89`)
- Non-critical failures (e.g., `getOrgCategory` failing for one org) are swallowed and cached as `null` rather than failing the whole request (`backend/src/agendor.js:32-44`)

## Cross-Cutting Concerns

**Logging:** `backend/src/logger.js` — structured logger (JSON lines in production, readable text in dev), used for scheduler/auth/index events; `morgan` handles HTTP access logs to `logs/access.log` (production) and console (dev); some modules still use raw `console.log`/`console.error` (e.g., `backend/src/agendor.js:189,194`, `backend/src/routes/deals.js:24`) — inconsistent with `logger.js` elsewhere.

**Validation:** Manual per-field validators in `backend/src/routes/config.js:9-19` (`VALIDATORS` map keyed by config field); auth routes validate presence/length inline (`routes/auth.js`); no schema validation library (e.g., zod/joi) used anywhere.

**Authentication:** JWT-based, verified per-request in `backend/src/middleware/auth.js` against `JWT_SECRET` (fails boot if unset/short — `backend/src/secret.js`); passwords hashed with bcrypt (`bcryptjs`, 10 rounds); login rate-limited by IP (in-memory, 5 attempts/15 min block, `routes/auth.js:34-67`); optional `ADMIN_USERS` env var restricts user-management endpoints (`routes/auth.js:26-31`).

---

*Architecture analysis: 2026-07-22*
