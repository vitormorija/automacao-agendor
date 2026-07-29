# Codebase Structure

**Analysis Date:** 2026-07-22

## Directory Layout

```
Automacao_agendor/
├── backend/                    # Node.js/Express API + scheduler
│   ├── src/
│   │   ├── index.js            # Server bootstrap, middleware chain, graceful shutdown
│   │   ├── agendor.js          # Agendor API client + business filter rules
│   │   ├── db.js               # SQLite schema + all data-access functions
│   │   ├── emailer.js          # nodemailer transport + HTML email templates
│   │   ├── scheduler.js        # node-cron jobs (daily check, weekly summary)
│   │   ├── logger.js           # Minimal structured logger
│   │   ├── secret.js           # JWT_SECRET boot-time validation
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT verification middleware
│   │   └── routes/
│   │       ├── auth.js         # Login, password reset/change, user CRUD, login logs
│   │       ├── deals.js        # GET stale deals (read-only)
│   │       ├── notifications.js# Manual run/check, history, stats, test-email endpoints
│   │       ├── config.js       # GET/PUT app config, SMTP test
│   │       ├── reports.js      # Chart/aggregate data for ReportPanel
│   │       └── track.js        # Public email click-tracking redirect
│   ├── .env / .env.example     # Environment configuration (secrets not committed)
│   ├── agendor.db              # SQLite database file (gitignored, runtime data)
│   └── package.json
├── frontend/                   # React SPA (Vite)
│   ├── src/
│   │   ├── main.jsx            # React root mount
│   │   ├── App.jsx             # Tab shell, auth state, global fetch interceptor
│   │   ├── index.css           # Tailwind entrypoint
│   │   └── components/
│   │       ├── LoginPage.jsx
│   │       ├── Dashboard.jsx           # Summary cards + "run now" trigger
│   │       ├── DealsList.jsx           # Searchable stale-deals table
│   │       ├── ReportPanel.jsx         # recharts-based analytics/charts
│   │       ├── NotificationHistory.jsx # Paginated notification log
│   │       ├── ConfigPanel.jsx         # SMTP/schedule/threshold config form
│   │       └── ChangePasswordModal.jsx
│   ├── index.html
│   ├── vite.config.js          # Dev proxy /api → localhost:3001, build config
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── start.sh                # Launches Vite with explicit PATH (Node not globally installed)
│   └── package.json
├── deploy/                     # Production deployment scripts
│   ├── instalar.sh             # Install/provisioning script
│   ├── backup.sh               # DB backup script
│   └── nginx.conf              # Reverse proxy config
├── logs/                       # Runtime logs (access.log, error.log) — gitignored contents
├── ecosystem.config.js         # PM2 process manager config (repo root)
├── iniciar.sh                  # Root-level start script
├── DOCUMENTACAO.md, PRD.md, README.md  # Project documentation
└── .planning/codebase/         # Codebase map documents (this directory)
```

Non-essential/generated artifacts at repo root (presentations, reports, exports) are gitignored (`*.pptx`, `*.docx`, `*.csv`, `*.xlsx`, `relatorio_*.html`, `slides_screenshots/`, `unpacked/`) and are not part of the application — ignore `Agendor_Atualizar_Cards.pptx`, `Solucao_Monitoramento_Agendor.*`, `make_*.js`, `capture_screenshots.py`, `luiz_andrade_*`, `empresas_luiz.*`, `relatorio_luiz_andrade.*` when navigating the codebase; they are one-off outputs, not source.

## Directory Purposes

**`backend/src/`:**
- Purpose: All backend application code
- Contains: Server bootstrap, domain modules (flat files, no subfolders except `routes/` and `middleware/`), route handlers
- Key files: `index.js` (entry), `db.js` (data layer), `agendor.js` (external API + business rules)

**`backend/src/routes/`:**
- Purpose: One file per REST resource/feature area; each exports an `express.Router()`
- Contains: Route handler functions with inline validation and response shaping
- Key files: `auth.js` (largest, includes rate limiting + admin gating), `notifications.js` (test/manual-trigger endpoints)

**`backend/src/middleware/`:**
- Purpose: Express middleware shared across routes
- Contains: Currently only `auth.js` (JWT gate)

**`frontend/src/components/`:**
- Purpose: One component per tab/major UI feature, self-contained (own `fetch()` calls, own local state)
- Contains: `.jsx` files, no further nesting, no shared hooks/ or lib/ directory
- Key files: `Dashboard.jsx`, `DealsList.jsx`, `ReportPanel.jsx`, `ConfigPanel.jsx`, `NotificationHistory.jsx`, `LoginPage.jsx`, `ChangePasswordModal.jsx`

**`deploy/`:**
- Purpose: Shell scripts and nginx config for production server setup, not invoked by the app itself
- Contains: `instalar.sh` (provisioning), `backup.sh` (DB backup cron target), `nginx.conf` (reverse proxy)

**`logs/`:**
- Purpose: Runtime log output directory, created automatically by `backend/src/index.js` if missing
- Contains: `access.log` (morgan combined format), `error.log` (uncaught error stack traces)
- Generated: Yes (gitignored via `*.log`)

## Key File Locations

**Entry Points:**
- `backend/src/index.js`: Backend HTTP server bootstrap
- `frontend/src/main.jsx`: Frontend React mount point
- `iniciar.sh` / `ecosystem.config.js`: Process startup (shell script / PM2)

**Configuration:**
- `backend/.env` / `backend/.env.example`: Environment variables (SMTP defaults, `AGENDOR_TOKEN`, `JWT_SECRET`, `ADMIN_USERS`, `SEED_ADMIN_EMAIL/PASSWORD`, `BASE_URL`, `ALLOWED_ORIGINS`)
- `frontend/vite.config.js`: Dev server port/proxy, build output
- Runtime app config (SMTP creds, cron schedule, stale-day threshold): stored in SQLite `config` table, edited via `backend/src/routes/config.js` and `frontend/src/components/ConfigPanel.jsx` — NOT in files

**Core Logic:**
- `backend/src/agendor.js`: Business rules for what counts as a "stale deal" (category/owner/stage exclusions, notify-eligibility)
- `backend/src/scheduler.js`: Orchestration of daily/weekly automated runs
- `backend/src/db.js`: All SQL and schema

**Testing:**
- Not present. No test files, test runner config, or `__tests__`/`*.test.js` found in the repository.

## Naming Conventions

**Files:**
- Backend: lowercase, single-word or `camelCase.js` module names (`agendor.js`, `emailer.js`, `scheduler.js`); route files named after the resource (`deals.js`, `config.js`)
- Frontend: `PascalCase.jsx` for every React component file, matching the exported component name (`Dashboard.jsx` exports `Dashboard`)

**Directories:**
- Lowercase, plural for collections of similar files (`routes/`, `components/`), singular for single-purpose (`middleware/`)

**Functions (backend):**
- `camelCase`, verb-first for actions (`getStaleDeals`, `sendStaleNotification`, `scheduleTask`, `logNotification`), `get`/`set` prefix convention for config/data accessors in `db.js`

**Database:**
- Table names: `snake_case` (`notification_log`, `weekly_snapshots`, `app_users`, `reset_tokens`, `login_logs`)
- Columns: `snake_case`

**React components:**
- Functional components only, `export default function ComponentName()`
- Props destructured in function signature (e.g., `function Dashboard({ onTabChange })`)

## Where to Add New Code

**New API Endpoint:**
- Add a new route file under `backend/src/routes/` (e.g., `routes/foo.js`) exporting an `express.Router()`, then mount it in `backend/src/index.js` under `/api/foo`
- If it needs new business logic, add functions to `backend/src/agendor.js` (Agendor data) or a new domain module — avoid inlining heavy logic directly in the route file (see CONCERNS.md-style anti-pattern noted in ARCHITECTURE.md)

**New Database Table/Field:**
- Add `CREATE TABLE IF NOT EXISTS` DDL and any `ALTER TABLE` migration statements to `backend/src/db.js` (follow existing pattern: wrap `ALTER TABLE` in try/catch since better-sqlite3 has no migration framework)
- Add corresponding accessor functions in `db.js` and export them in the `module.exports` block at the bottom

**New Frontend Tab/Feature:**
- Create `frontend/src/components/NewFeature.jsx` following the self-contained pattern (own `fetch()` calls, own `useState`)
- Register it in `frontend/src/App.jsx`: add to `TABS` array and add a `{tab === 'newfeature' && <NewFeature />}` line in the `<main>` render block

**New Scheduled Job:**
- Add the job function to `backend/src/scheduler.js`, register it with `cron.schedule(...)` inside `scheduleTask()`, and add a `.stop()` call for it in `stopTasks()` for graceful shutdown

**Shared Utilities:**
- No dedicated `utils/` or `lib/` directory exists on either side. Backend shared helpers currently live directly in the domain module that uses them (e.g., URL-safety checks in `emailer.js` and `track.js` are duplicated, not shared) — if adding a cross-cutting helper, prefer a new top-level module in `backend/src/` (e.g., `backend/src/utils.js`) over duplicating logic.

## Special Directories

**`backend/node_modules/`, `frontend/node_modules/`, root `node_modules/`:**
- Purpose: Installed dependencies (three separate `package.json`/`node_modules` trees: root, backend, frontend)
- Generated: Yes
- Committed: No (gitignored)

**`logs/`:**
- Purpose: Runtime access/error logs written by `morgan` and the global error handler
- Generated: Yes (directory auto-created by `backend/src/index.js` if missing)
- Committed: No (`*.log` gitignored)

**`.claude/worktrees/`:**
- Purpose: Git worktree(s) created by Claude Code tooling for parallel work (e.g., `goofy-bose-c4e1ec`), mirrors backend/frontend structure
- Generated: Yes (tooling artifact, not part of the application)
- Committed: No (`.claude/` gitignored)

**`unpacked/`, `slides_screenshots/`:**
- Purpose: Extracted PowerPoint XML and screenshot exports used for building presentation decks
- Generated: Yes
- Committed: No (gitignored)

**`.planning/`:**
- Purpose: GSD planning artifacts including this codebase map (`.planning/codebase/`)
- Generated: Yes (by GSD tooling)
- Committed: Repository-dependent (not addressed by `.gitignore`)

---

*Structure analysis: 2026-07-22*
