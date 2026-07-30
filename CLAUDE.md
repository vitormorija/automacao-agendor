<!-- GSD:project-start source:PROJECT.md -->
## Project

**Automação Agendor — Estabilização & Produção**

Sistema interno que monitora negócios ("deals") parados no CRM Agendor e notifica os responsáveis por e-mail. É composto por um backend Node/Express + SQLite (client da API Agendor, filtros de negócio, agendador cron, envio de e-mail) e um dashboard React (login, negócios parados, histórico, relatórios, configuração). Já está **funcional e em uso**. Esta etapa não constrói produto novo — profissionaliza e prepara o que existe para produção, preservando o comportamento atual.

**Core Value:** Antes de qualquer mudança, existir uma **rede de testes automatizados sobre a lógica crítica de notificação** (quem recebe / quem não recebe). É ela que torna todo o resto — hardening, refatoração, mudanças de segurança — seguro. Se só uma coisa desta etapa der certo, é esta: nunca mais uma regressão silenciosa nas regras de quem é notificado.

### Constraints

- **Processo**: Reorganização incremental — não reescrever o projeto inteiro
- **Processo**: Não alterar comportamento funcional sem teste cobrindo o novo comportamento
- **Processo**: Não misturar refatoração estrutural com novas funcionalidades no mesmo trabalho
- **Processo**: Não remover código sem comprovar que está realmente inutilizado
- **Deploy**: Alvo único de produção via PM2 (`ecosystem.config.js`), single-instance — sem staging, sem escala horizontal
- **Tech stack**: Manter stack atual (Express 4, better-sqlite3 9, React 18, Vite 5); sem trocar frameworks nesta etapa
- **Dados**: SQLite compartilhado para dados de negócio e auth; manter (sem migrar de banco)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- JavaScript (Node.js, CommonJS) - Backend: `backend/src/**/*.js`
- JavaScript (JSX, ES Modules) - Frontend: `frontend/src/**/*.jsx`
- Bash - Deployment/startup scripts: `iniciar.sh`, `frontend/start.sh`, `deploy/instalar.sh`, `deploy/backup.sh`
- SQL (embedded in JS via `better-sqlite3`) - Schema/queries: `backend/src/db.js`
## Runtime
- Node.js >= 20 (declared in `backend/package.json` `engines.node`)
- No `.nvmrc` present. Local dev machine resolves Node from custom binaries — per project memory, wrappers in `~/bin/node`/`~/bin/npm` point at `/tmp/node-v22.13.1-darwin-arm64/bin/`. In this environment `node -v` resolves to v25.9.0 (PATH-dependent, not pinned by any config file).
- `backend/package.json` sets `"type": "commonjs"` (uses `require`/`module.exports` throughout `backend/src/`)
- `frontend/package.json` sets `"type": "module"` (uses ESM `import`/`export` throughout `frontend/src/`)
- npm
- Three separate `package.json`/lockfile pairs (no workspaces):
- All three lockfiles present (committed)
## Frameworks
- Express ^4.19.2 - HTTP server and routing, `backend/src/index.js`
- React ^18.3.1 + ReactDOM ^18.3.1 - Frontend UI, `frontend/src/main.jsx`, `frontend/src/App.jsx`
- Vite ^5.3.1 (`@vitejs/plugin-react` ^4.3.1) - Frontend dev server/bundler, `frontend/vite.config.js`
- `node:test` nativo (Node >= 20) + `c8` ^12 para cobertura — backend. 8 arquivos em `backend/test/` (35 testes). Scripts: `npm test` (`node --test`) e `npm run test:coverage`. Gate de cobertura ativo em `backend/.c8rc.json` (`check-coverage: true`, `per-file: false`; pisos lines/statements/functions 20, branches 60). Cada arquivo de teste roda em **processo próprio** — é a unidade de isolamento para variações de ambiente. Frontend não tem testes: seu gate é `vite build`.
- Vite - frontend build (`npm run build` → `frontend/dist/`), dev server on port 5173 with `/api` proxy to `http://localhost:3001`
- Tailwind CSS ^3.4.4 + PostCSS ^8.4.38 + Autoprefixer ^10.4.19 - CSS pipeline, `frontend/tailwind.config.js`, `frontend/postcss.config.js`
- nodemon ^3.1.4 - backend dev auto-restart (`backend` `npm run dev` script), `backend/package.json`
- PM2 (`ecosystem.config.js`) - production process manager, not an npm dependency (installed globally on server via `deploy/instalar.sh`)
## Key Dependencies
- `axios` ^1.7.2 - HTTP client for all Agendor API calls, `backend/src/agendor.js`, `backend/src/routes/notifications.js`
- `better-sqlite3` ^9.6.0 - Synchronous SQLite driver, sole persistence layer, `backend/src/db.js`
- `nodemailer` ^6.9.13 - SMTP email sending (stale-deal alerts, weekly summaries, password reset), `backend/src/emailer.js`
- `node-cron` ^3.0.3 - Scheduled jobs (daily stale-check, weekly summary), `backend/src/scheduler.js`
- `jsonwebtoken` ^9.0.3 - JWT issuance/verification for app auth, `backend/src/routes/auth.js`, `backend/src/middleware/auth.js`
- `bcryptjs` ^3.0.3 - Password hashing, `backend/src/routes/auth.js`
- `helmet` ^8.1.0 - HTTP security headers, `backend/src/index.js`
- `cors` ^2.8.5 - CORS policy enforcement (origin allowlist), `backend/src/index.js`
- `morgan` ^1.10.1 - HTTP access logging to file, `backend/src/index.js`
- `dotenv` ^16.4.5 - Loads `backend/.env` at process start, `backend/src/index.js`
- `recharts` ^3.8.1 - Charts on the Reports panel, `frontend/src/components/ReportPanel.jsx`
- `react-hot-toast` ^2.4.1 - Toast notifications across UI
- `lucide-react` ^0.395.0 - Icon set
- `pptxgenjs` ^4.0.1 - Present in both root `package.json` and `backend/devDependencies`; used only by ad-hoc/one-off scripts (`make_pptx.js`, `make_slides.js`) for generating presentation decks, not part of the running application
## Configuration
- Backend loads config from `backend/.env` (gitignored; `.env.example` documents required keys). Loaded via `dotenv` in `backend/src/index.js`, line 1.
- Frontend has no `.env` file; talks to backend exclusively through the Vite dev proxy (`/api` → `http://localhost:3001`) or, in production, is served as static files by the Express backend itself.
- Environment variables actually read in code (`process.env.*`, from `backend/src`):
- Secrets existence noted only: `backend/.env` is present on disk (970 bytes) — contents not read per policy.
- `frontend/vite.config.js` — dev server port 5173, `/api` proxy, production build to `frontend/dist/` with manual vendor chunk for `react`/`react-dom`
- `frontend/tailwind.config.js` — content globs `./index.html`, `./src/**/*.{js,jsx}`
- `frontend/postcss.config.js` — `tailwindcss` + `autoprefixer`
- No `tsconfig.json` — project is plain JavaScript, not TypeScript
## Platform Requirements
- macOS (darwin), per project memory Node is not installed system-wide; must `export PATH="$HOME/bin:$PATH"` to use the project's Node wrappers
- Backend started directly with `node backend/src/index.js` (or `npm run dev` for nodemon)
- Frontend started via `frontend/start.sh` (invokes `node node_modules/.bin/vite`) or `iniciar.sh` at repo root (starts both backend and frontend, kills anything already bound to ports 3001/5173 first)
- Deploy target: Ubuntu 20.04/22.04/Debian 11+ Linux server, per `deploy/instalar.sh`
- Node.js 22.x installed via NodeSource setup script
- Process management: PM2, single app `agendor-backend`, config in `ecosystem.config.js` (`autorestart`, `max_memory_restart: 300M`, `max_restarts: 10`)
- Reverse proxy: Nginx, config in `deploy/nginx.conf`, proxies all traffic on port 80 to `http://localhost:3001` (HTTPS block present but commented out, pending certificate)
- In production the Express backend serves the built frontend statically from `frontend/dist/` (`backend/src/index.js`, guarded by `NODE_ENV === 'production'` and existence of the dist folder) — this is a single-process deployment, not split frontend/backend hosting
- SQLite database file `backend/agendor.db` persisted on local disk; backed up daily via cron + `deploy/backup.sh` (keeps last 30 daily copies in `/opt/agendor/backups`)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Backend: lowercase, single-word or dot-free module names — `agendor.js`, `db.js`, `emailer.js`, `scheduler.js`, `logger.js`, `secret.js`.
- Backend route files live in `backend/src/routes/` and are named after the resource, singular verb-free noun — `deals.js`, `notifications.js`, `config.js`, `reports.js`, `track.js`, `auth.js`.
- Backend middleware in `backend/src/middleware/` — `auth.js`.
- Frontend components: PascalCase `.jsx` — `Dashboard.jsx`, `DealsList.jsx`, `ConfigPanel.jsx`, `NotificationHistory.jsx`, `ReportPanel.jsx`, `LoginPage.jsx`, `ChangePasswordModal.jsx`.
- No test files exist anywhere in the repo (see `TESTING.md`).
- camelCase throughout, verb-first: `getUsers`, `getStaleDeals`, `runCheck`, `scheduleTask`, `sendStaleNotification`, `checkRateLimit`, `logNotification`.
- Boolean-returning helpers prefixed with `is`/`should`/`has`: `isBool`, `shouldNotifyOwner`, `hasRecipient` (local var).
- Internal/private helpers in the same module are not exported (e.g. `createTransporter`, `dealEmailHtml`, `urgencyColor` in `backend/src/emailer.js`) — only the public API surface is listed in `module.exports`.
- camelCase for locals: `staleDays`, `adminEmails`, `notificationsEnabled`.
- `SCREAMING_SNAKE_CASE` for module-level constants: `BASE_URL`, `TOKEN`, `INACTIVE_CATEGORY`, `EXCLUDED_CATEGORIES`, `MAX_ATTEMPTS`, `BLOCK_MINUTES`, `TOKEN_EXPIRY`, `BCRYPT_ROUNDS` (see `backend/src/agendor.js`, `backend/src/routes/auth.js`).
- React state setters follow the `set<Noun>` pattern from `useState`: `setStatus`, `setRunning`, `setCheckResult` (`frontend/src/components/Dashboard.jsx`).
- No TypeScript in the project — pure JavaScript (CommonJS backend, ES modules frontend). No type annotations; shapes are documented informally via destructuring and inline Portuguese comments.
## Code Style
- Formatação via **Biome** (`biome.json` na raiz do repo, cobrindo backend CJS e frontend ESM): `npm run format` = `biome format --write .`. Não há Prettier — não introduzir um segundo formatador.
- No trailing semicolons dropped consistently — semicolons ARE used throughout backend `.js` files; frontend `.jsx` largely omits semicolons at statement ends (`frontend/src/App.jsx`, `frontend/src/components/Dashboard.jsx`). Match the existing style per file/directory rather than imposing one convention repo-wide.
- 2-space indentation throughout both backend and frontend.
- Single quotes preferred for strings; template literals used heavily for interpolation (especially HTML email bodies in `backend/src/emailer.js`).
- Lint via **Biome** (mesmo `biome.json` da raiz; não há ESLint): `npm run lint` = `biome lint .`, presente em `backend/package.json` e `frontend/package.json`.
- O lint **é** verificado automaticamente: roda no CI (`.github/workflows/ci.yml`) e é status check obrigatório para mesclar na `main`. O baseline é deliberadamente tolerante a warnings — regras que exigiriam mudança de código foram rebaixadas a `warn` para que `npm run lint` saia 0 no código atual (44 warnings no backend, 60 no frontend). Corrigir esses warnings é trabalho de fases futuras, com teste cobrindo qualquer mudança de comportamento.
- CSS está fora do escopo do Biome — o parser aborta no `@apply` do Tailwind.
## Import Organization
- `require()` calls at the top of the file, ungrouped — no blank-line separation between "external package" and "local module" imports observed (see `backend/src/index.js` lines 1-8, mixing `dotenv`, `express`, `cors`, `helmet`, `morgan`, `fs`, `path`, then `./logger`).
- Route files typically require `express`, then instantiate `express.Router()` immediately, then require local `../db`, `../scheduler`, `../emailer`, `../secret`, `../logger` (see `backend/src/routes/config.js`, `backend/src/routes/auth.js`).
- Some requires are deferred inline inside functions to avoid circular-dependency issues at module load time, e.g. `backend/src/index.js` requires `./scheduler` and `./db` inside `server.listen()` callback and `shutdown()` rather than at top of file.
- `module.exports = { ... }` as a single object at the bottom of every backend module — never `exports.foo = ...` assignments.
- `import { useState, useEffect } from 'react'` first, then third-party libs (`lucide-react`, `react-hot-toast`), then local component imports last (see `frontend/src/App.jsx` lines 1-10).
- No path aliases configured — all local imports use relative paths (`./components/Dashboard`).
- Default export per component file: `export default function ComponentName(...) { ... }`.
## Error Handling
- Express routes wrap async work in `try/catch` and respond with `{ ok: false, message: '...' }` (Portuguese, user-facing) on failure, or `{ error: '...' }` from the global error middleware — the two response shapes coexist (`ok`/`message` in route handlers vs `error` in `backend/src/index.js`'s catch-all middleware). Follow whichever shape the specific route file already uses.
- A global error-handling middleware in `backend/src/index.js` (lines 78-89) catches uncaught route errors, logs full stack to `logs/error.log`, and returns a generic message in production (`err.status || 500`) — never leaks stack traces to the client when `NODE_ENV=production`.
- Network-flaky operations (SMTP send, Agendor API paging) use manual retry loops with exponential-ish backoff: `sendMailWithRetry()` in `backend/src/emailer.js` (3 attempts, 3s/6s wait) and `fetchDealsPage()` in `backend/src/agendor.js` (3 attempts, 5s/10s/15s wait, specifically on HTTP 429).
- Silent-catch pattern (`catch (_) {}` or `catch {}`) used deliberately for non-critical/idempotent operations: migration `ALTER TABLE` statements in `backend/src/db.js` (columns may already exist), `closeDb()` (already closed), auth token parsing in `frontend/src/App.jsx`. When adding new idempotent operations, follow this pattern rather than adding new error propagation paths.
- Auth failures never reveal whether a username exists (`backend/src/routes/auth.js` `forgot-password` handler always returns `{ ok: true }` regardless of whether the account was found) — preserve this behavior for any new auth-adjacent endpoint.
- `fetch` calls wrapped in `try/catch` with `catch {}` (silently swallow) or a `toast.error(...)` call to surface failure to the user — see `fetchStatus()` vs `checkOnly()` in `frontend/src/components/Dashboard.jsx`. Non-critical background refreshes use silent catch; user-initiated actions (buttons) surface errors via `react-hot-toast`.
- `react-hot-toast`'s `toast.loading(...)` + `{ id: toastId }` pattern is used for any async action triggered by a button click, updating the same toast to success/error on completion (`checkOnly`, `sendNow` in `Dashboard.jsx`).
## Logging
- In development, logs plain text: `${time} [${level}] ${message}`. In production (`NODE_ENV=production`), logs single-line JSON: `{ time, level, message }` — designed for log aggregation.
- Level controlled by `LOG_LEVEL` env var, defaults to `info`.
- Errors passed as `Error` objects are automatically expanded to `.stack` (or `.message` if no stack) inside `emit()`.
- Use `logger.info/warn/error/debug(...)` for all new backend code — do NOT use raw `console.log`/`console.error` in new modules. NOTE: some existing modules still use raw `console.*` directly (`backend/src/agendor.js` lines 189/194, `backend/src/emailer.js` lines 175, 608, 633, 636) — this is legacy and should not be replicated in new code; prefer `require('./logger')`.
- HTTP access logs are handled separately via `morgan` (not the custom logger): `combined` format written to `logs/access.log` in all environments, plus `dev` format to console outside production (`backend/src/index.js` lines 40-45).
- Log messages prefixed with a bracketed module tag in Portuguese, e.g. `[Scheduler]`, `[Auth]`, `[Emailer]`, `[Agendor]` — follow this tagging convention for any new logger call so log lines remain greppable by subsystem.
## Comments
- Comments are written in Portuguese throughout, matching all user-facing strings and log messages.
- Section-header comments use a distinctive box-drawing style to delimit logical blocks within a file: `// ── Section Name ──────────────────────`  (see `backend/src/index.js`, `backend/src/routes/auth.js`, `backend/src/db.js`). Use this style when adding a new logical section to an existing file that already uses it.
- Business-rule rationale is documented inline immediately above the code it explains, not in a separate doc — e.g. the `NO_OWNER_NOTIFY_FUNNELS` explanation in `backend/src/agendor.js` (lines 51-55) explains *why* the Beefor funnel is excluded, not just *what* the code does. Follow this "explain the why" style for any non-obvious business rule.
- Security-sensitive code is heavily commented to explain the threat being mitigated, e.g. `backend/src/secret.js` (why no fallback for `JWT_SECRET`), `backend/src/routes/auth.js` (why rate limiting, why the `forgot-password` response is always generic).
- Not used anywhere in the codebase. No `@param`/`@returns` annotations found. Function documentation is a single-line `//` comment directly above the function signature at most.
## Function Design
- Functions with more than 2-3 parameters use a single destructured object parameter, e.g. `sendStaleNotification({ deal, ownerEmail, authorEmail, logId })`, `logNotification({ deal_id, deal_title, ... })`, `ownerWeeklyHtml({ ownerName, deals, weekLabel, staleDays })`. Follow this pattern for any new function taking 3+ inputs.
- Simple utility functions take positional args: `getOrgCategory(orgId)`, `markResolved(deal_id, resolved_at)`.
- Route handlers always respond with a JSON object containing at minimum `ok: true/false` (custom routes) or the raw resource (GET endpoints, e.g. `getAllConfig()` result). New routes should follow the `{ ok, message }` or `{ ok, ...data }` shape used by sibling routes in the same file.
- Async operations that can partially fail (batch email sends) return an array of per-item result objects: `{ to, success, error? }` — see `sendStaleNotification`, `sendWeeklySummary`, `sendOwnerWeeklySummary` in `backend/src/emailer.js`.
## Module Design
- Backend: every module ends with a single `module.exports = { ... }` block naming every public function explicitly (no wildcard/barrel exports). See bottom of `backend/src/db.js` (lines 291-301), `backend/src/agendor.js` (line 198), `backend/src/scheduler.js` (line 252).
- Frontend: each component file has exactly one `export default function ComponentName(...)`. Small presentational sub-components used only within the same file (e.g. `StatCard`, `NotificationRow`, `OwnerRanking` in `frontend/src/components/Dashboard.jsx`) are defined below the main component and NOT exported — kept as private, file-local helpers. Follow this pattern rather than creating new small component files for view-only sub-widgets used in a single parent.
- Not used. No `index.js` re-export aggregator files exist in `backend/src/routes/` or `frontend/src/components/` — every route/component is required/imported directly by its explicit path.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- No ORM — raw SQL via `better-sqlite3` prepared statements, synchronous calls
- No service/repository split beyond `db.js` (data access) and `agendor.js` (external API access) — route handlers call these directly
- Route handlers double as the "application service" layer (business logic for aggregation/reporting lives inline in `routes/reports.js` and `routes/notifications.js`)
- Scheduler (`scheduler.js`) reuses the same domain functions (`agendor.js`, `emailer.js`, `db.js`) as the HTTP routes — no duplication between cron-triggered and manually-triggered runs
- Frontend has no state management library or API client abstraction; each component performs its own `fetch()` and manages local state with `useState`/`useEffect`
- Single shared SQLite file for both business data and app auth data (`config`, `notification_log`, `weekly_snapshots`, `app_users`, `reset_tokens`, `login_logs` all in one file: `backend/agendor.db`)
## Layers
- Purpose: Request parsing, security headers, CORS, auth gate, logging, error normalization
- Location: `backend/src/index.js`, `backend/src/middleware/auth.js`
- Contains: Express middleware chain
- Depends on: `logger.js`, `secret.js`
- Used by: All route modules
- Purpose: Maps HTTP endpoints to domain operations, validates input, shapes JSON responses
- Location: `backend/src/routes/*.js`
- Contains: Express routers, one file per resource area
- Depends on: `db.js`, `agendor.js`, `emailer.js`, `scheduler.js`
- Used by: `index.js` (mounted under `/api/*`)
- Purpose: Business rules (stale-deal filtering, notification eligibility) and external system access (Agendor API, SMTP)
- Location: `backend/src/agendor.js`, `backend/src/emailer.js`, `backend/src/scheduler.js`
- Contains: Business filter constants (`EXCLUDED_CATEGORIES`, `EXCLUDED_STAGE_WORDS`, `NO_OWNER_NOTIFY_FUNNELS`), pagination/retry logic, HTML email templates, cron scheduling
- Depends on: `db.js` (config reads), external HTTP APIs (Agendor, SMTP)
- Used by: Route layer, itself (scheduler calls agendor.js + emailer.js)
- Purpose: Single point of SQLite access; schema definition, migrations, CRUD helpers
- Location: `backend/src/db.js`
- Contains: Table DDL, prepared-statement functions grouped by entity (config, notification_log, weekly_snapshots, app_users, reset_tokens, login_logs)
- Depends on: `better-sqlite3`
- Used by: Route layer, scheduler, emailer (indirectly via config reads)
- Purpose: Renders UI, collects user input, calls backend API directly
- Location: `frontend/src/App.jsx`, `frontend/src/components/*.jsx`
- Contains: React function components, Tailwind classes, `recharts` charts (`ReportPanel.jsx`), `react-hot-toast` notifications
- Depends on: Backend REST API (`/api/*`)
- Used by: Browser runtime (built by Vite)
## Data Flow
### Primary Request Path (Manual "Run Check Now")
### Daily/Weekly Scheduled Flow
### Email Click Tracking Flow
- Backend: no in-memory session state beyond a `Map` of login rate-limit attempts (`routes/auth.js: loginAttempts`) and scheduler run-lock flags (`scheduler.js: isRunning`, `currentTask`, `weeklyTask`, `lastRunResult`) — all reset on process restart
- Frontend: component-local `useState`/`useEffect` only; auth token persisted in `localStorage` (`auth_token`, `auth_user`)
## Key Abstractions
- Purpose: All runtime-tunable settings (SMTP creds, cron schedule, stale-day threshold, admin emails, feature toggles) stored as string rows in the `config` table rather than env vars, editable via UI
- Examples: `backend/src/db.js:119-131` (`getConfig`/`setConfig`/`getAllConfig`), `backend/src/routes/config.js`
- Pattern: Key-value table seeded with defaults on boot; consumers call `getConfig('key')` and parse/coerce inline (e.g., `parseInt(getConfig('stale_days'))`)
- Purpose: `notification_log` table serves three roles simultaneously — audit trail, same-day dedup check (`alreadyNotifiedToday`), and click-tracking target (`recordClick`, `getLogById`)
- Examples: `backend/src/db.js:133-232`
- Pattern: Every send attempt (success or error) is logged before/around the SMTP call
- Purpose: Raw Agendor deal objects are progressively enriched (owner email, org category, resolved status) by joining against `getUsers()` and `getOrgCategory()` results
- Examples: `backend/src/agendor.js:92-161` (`getStaleDeals`), used identically in `routes/deals.js`, `routes/reports.js`, `routes/notifications.js`, `scheduler.js`
- Pattern: Fetch raw list → filter by business rules → map to enriched plain objects; repeated per-route rather than cached/shared
## Entry Points
- Location: `backend/src/index.js`
- Triggers: `node src/index.js` (via `npm start` or `nodemon` in dev)
- Responsibilities: Registers middleware, mounts routers, serves built frontend in production, starts scheduler, handles `SIGTERM`/`SIGINT` graceful shutdown
- Location: `backend/src/scheduler.js` (`scheduleTask`)
- Triggers: Invoked once at server boot from `index.js:115`; internally uses `node-cron` timers
- Responsibilities: Daily stale-deal check + notification send; weekly admin/owner summary emails
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
### Business logic embedded directly in route handlers
## Error Handling
- Route-level try/catch is the norm; no centralized `asyncHandler` wrapper — each async handler repeats `try { ... } catch (err) { res.status(500).json({ error: err.message }) }`
- `agendor.js: fetchDealsPage` implements manual retry-with-backoff for HTTP 429 from the Agendor API (`backend/src/agendor.js:73-89`)
- Non-critical failures (e.g., `getOrgCategory` failing for one org) are swallowed and cached as `null` rather than failing the whole request (`backend/src/agendor.js:32-44`)
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
