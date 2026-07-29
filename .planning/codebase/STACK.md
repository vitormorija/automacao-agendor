# Technology Stack

**Analysis Date:** 2026-07-29

## Languages

**Primary:**
- JavaScript (Node.js, CommonJS) - Backend: `backend/src/**/*.js`
- JavaScript (JSX, ES Modules) - Frontend: `frontend/src/**/*.jsx`

**Secondary:**
- Bash - Deployment/startup scripts: `iniciar.sh`, `frontend/start.sh`, `deploy/instalar.sh`, `deploy/backup.sh`
- SQL (embedded in JS via `better-sqlite3`) - Schema/queries: `backend/src/db.js`

## Runtime

**Environment:**
- Node.js >= 20 (declared in `backend/package.json` `engines.node`)
- No `.nvmrc` present anywhere in the repo (checked root, `backend/`, `frontend/`). CI is the closest thing to a pinned version: `.github/workflows/ci.yml` fixes Node to `'20'` via `actions/setup-node@v7` in both jobs.
- Local dev machine resolves Node from custom binaries — per project memory, wrappers in `~/bin/node`/`~/bin/npm` point at `/tmp/node-v22.13.1-darwin-arm64/bin/`. Verified in this environment (after `export PATH="$HOME/bin:$PATH"`): `node -v` → `v22.13.1`, `npm -v` → `10.9.2`.
- `backend/package.json` sets `"type": "commonjs"` (uses `require`/`module.exports` throughout `backend/src/`)
- `frontend/package.json` sets `"type": "module"` (uses ESM `import`/`export` throughout `frontend/src/`)

**Package Manager:**
- npm
- Three separate `package.json`/lockfile pairs (no workspaces):
  - `/package.json` + `/package-lock.json` (root — only `pptxgenjs`, used by ad-hoc scripts `make_pptx.js`, `make_docx.js`, `make_slides.js`, not part of the app)
  - `backend/package.json` + `backend/package-lock.json`
  - `frontend/package.json` + `frontend/package-lock.json`
- All three lockfiles present (committed)

## Frameworks

**Core:**
- Express ^4.19.2 - HTTP server and routing, `backend/src/index.js`
- React ^18.3.1 + ReactDOM ^18.3.1 - Frontend UI, `frontend/src/main.jsx`, `frontend/src/App.jsx`
- Vite ^5.3.1 (`@vitejs/plugin-react` ^4.3.1) - Frontend dev server/bundler, `frontend/vite.config.js`

**Testing:**
- `node:test` (Node.js built-in test runner) - backend unit/integration tests. `backend/package.json` `test` script: `node --test`. Test suite: `backend/test/` — 8 test files (`agendor.funnel.test.js`, `agendor.futureTasks.test.js`, `agendor.getStaleDeals.test.js`, `agendor.pure.test.js`, `agendor.realsample.test.js`, `auth.test.js`, `db.dedup.test.js`, `smoke.test.js`), 35 tests total, all passing (verified by running `node --test` in `backend/`).
- `node:assert/strict` - assertion library used across all test files (no Chai/Jest-style assertion library).
- `c8` ^12.0.0 (backend devDependency) - coverage tool wrapping `node --test`. `backend/package.json` `test:coverage` script: `c8 --reporter=text --reporter=lcov node --test`. Thresholds configured in `backend/.c8rc.json`: `lines: 20`, `statements: 20`, `functions: 20`, `branches: 60`, `check-coverage: true`, `all: true` (untested files still counted), `include: ["src/**/*.js"]`, `exclude: ["test/**", "src/index.js"]`.
- Test support (not test files themselves): `backend/test/setup.js` (required at the top of every test file — sets `JWT_SECRET`, `DB_PATH=:memory:`, `AGENDOR_TOKEN=test` defaults before any backend module loads, so `secret.js`'s fail-fast boot check and `db.js`'s SQLite-open-on-load don't blow up in CI; unconditionally blanks `SMTP_PASS`/`ADMIN_EMAIL` so no real secret leaks into the test DB); `backend/test/helpers/fakeAxios.js` (stubs the axios instance created inside `agendor.js` at module load, per the project's "mock the HTTP edge, not internal logic" testing convention); `backend/test/helpers/tmpDb.js` (opens a second connection to a temp-file SQLite DB to seed rows `:memory:` can't support, e.g. a controlled `sent_at` timestamp for dedup tests); fixtures in `backend/test/fixtures/` (`real-deals.sample.json`, anonymized; `synthetic/`).
- Frontend has **no test runner**. `frontend/package.json` `test` script is a placeholder no-op: `echo "(frontend sem testes nesta fase — gate é vite build)" && exit 0`. The frontend's CI quality gate is a successful `vite build`, not automated tests.

**Build/Dev:**
- Vite - frontend build (`npm run build` → `frontend/dist/`), dev server on port 5173 with `/api` proxy to `http://localhost:3001`
- Tailwind CSS ^3.4.4 + PostCSS ^8.4.38 + Autoprefixer ^10.4.19 - CSS pipeline, `frontend/tailwind.config.js`, `frontend/postcss.config.js`
- nodemon ^3.1.4 - backend dev auto-restart (`backend` `npm run dev` script), `backend/package.json`
- PM2 (`ecosystem.config.js`) - production process manager, not an npm dependency (installed globally on server via `deploy/instalar.sh`)
- `@biomejs/biome` 2.5.5 - single lint+format toolchain shared by backend and frontend (devDependency in **both** `backend/package.json` and `frontend/package.json`). Config: root `biome.json` (`"root": true`, VCS-aware via git, `formatter.indentStyle: space`/`indentWidth: 2`, `javascript.formatter.quoteStyle: single`, `assist.enabled: false`). Linter has `recommended: true` plus explicit overrides, most set to `"warn"` (not `"error"`) — see rule list in `biome.json` (`a11y`, `complexity`, `correctness`, `style`, `suspicious` groups). `files.includes` excludes `node_modules`, `dist`, `coverage`, `backend/agendor.db`, `backend/test/fixtures/**`, and all `*.css` files.
  - `npm run lint` → `biome lint .` (both packages)
  - `npm run format` → `biome format --write .` (both packages)
  - CI treats lint as warn-tolerant: `npm run lint` runs in both CI jobs but warnings do not fail the pipeline (only actual `biome lint` errors would).

## Key Dependencies

**Critical:**
- `axios` ^1.7.2 - HTTP client for all Agendor API calls, `backend/src/agendor.js`, `backend/src/routes/notifications.js`
- `better-sqlite3` ^9.6.0 - Synchronous SQLite driver, sole persistence layer, `backend/src/db.js`
- `nodemailer` ^6.9.13 - SMTP email sending (stale-deal alerts, weekly summaries, password reset), `backend/src/emailer.js`
- `node-cron` ^3.0.3 - Scheduled jobs (daily stale-check, weekly summary), `backend/src/scheduler.js`
- `jsonwebtoken` ^9.0.3 - JWT issuance/verification for app auth, `backend/src/routes/auth.js`, `backend/src/middleware/auth.js`
- `bcryptjs` ^3.0.3 - Password hashing, `backend/src/routes/auth.js`

**Infrastructure:**
- `helmet` ^8.1.0 - HTTP security headers, `backend/src/index.js`
- `cors` ^2.8.5 - CORS policy enforcement (origin allowlist), `backend/src/index.js`
- `morgan` ^1.10.1 - HTTP access logging to file, `backend/src/index.js`
- `dotenv` ^16.4.5 - Loads `backend/.env` at process start, `backend/src/index.js`
- `recharts` ^3.8.1 - Charts on the Reports panel, `frontend/src/components/ReportPanel.jsx`
- `react-hot-toast` ^2.4.1 - Toast notifications across UI
- `lucide-react` ^0.395.0 - Icon set
- `pptxgenjs` ^4.0.1 - Present in both root `package.json` and `backend/devDependencies`; used only by ad-hoc/one-off scripts (`make_pptx.js`, `make_slides.js`) for generating presentation decks, not part of the running application

## Configuration

**Environment:**
- Backend loads config from `backend/.env` (gitignored via `.gitignore` `.env`/`.env.*`; `backend/.env.example` documents required keys). Loaded via `dotenv` in `backend/src/index.js`, line 1.
- Frontend has no `.env` file; talks to backend exclusively through the Vite dev proxy (`/api` → `http://localhost:3001`) or, in production, is served as static files by the Express backend itself.
- Environment variables actually read in code (`process.env.*`, from `backend/src`):
  - `AGENDOR_TOKEN` — Agendor API auth token, `backend/src/agendor.js:4`, also read directly in `backend/src/routes/notifications.js:203`
  - `DB_PATH` — override for the SQLite file path (used by tests to force `:memory:`; defaults to `backend/agendor.db`), `backend/src/db.js:4`
  - `PORT` — backend listen port (default 3001), `backend/src/index.js:137`
  - `NODE_ENV` — `development`/`production` switch (affects logging, error verbosity, static frontend serving), `backend/src/index.js` (lines 51, 68, 80, 93, 98, 140), `backend/src/logger.js:9`
  - `JWT_SECRET` — **required, no fallback**; process throws at boot if missing or <16 chars, `backend/src/secret.js:7`
  - `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — one-time initial admin user seed, `backend/src/routes/auth.js:97-98`
  - `ADMIN_USERS` — comma-separated allowlist of usernames treated as admins for user-management endpoints, `backend/src/routes/auth.js:30`
  - `ALLOWED_ORIGINS` — comma-separated CORS allowlist, `backend/src/index.js:21-22`
  - `BASE_URL` — public backend URL used to build email click-tracking links, `backend/src/index.js:106`, `backend/src/emailer.js:28`
  - `BASE_URL_FRONTEND` — used to build password-reset links, `backend/src/routes/auth.js:262`
  - `LOG_LEVEL` — controls `backend/src/logger.js` verbosity, `backend/src/logger.js:8`
  - `ADMIN_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — documented in `backend/.env.example` and actually consulted at runtime via DB-backed config (`backend/src/db.js:106-111` seeds these into the `config` SQLite table on first boot; subsequent reads go through `getConfig()`, not `process.env`, except as the seed fallback)
- Secrets existence noted only: `backend/.env` is expected to exist per-environment (gitignored); contents never read per policy. `backend/.env.example` is a committed template with placeholder values only.

**Build:**
- `frontend/vite.config.js` — dev server port 5173, `/api` proxy, production build to `frontend/dist/` with manual vendor chunk for `react`/`react-dom`, no sourcemaps
- `frontend/tailwind.config.js` — content globs `./index.html`, `./src/**/*.{js,jsx}`
- `frontend/postcss.config.js` — `tailwindcss` + `autoprefixer`
- `biome.json` (repo root) — shared lint/format config for backend + frontend (see Build/Dev above)
- `backend/.c8rc.json` — coverage thresholds for `npm run test:coverage` (see Testing above)
- No `tsconfig.json` — project is plain JavaScript, not TypeScript

## CI/CD

- `.github/workflows/ci.yml` — GitHub Actions pipeline, two parallel jobs (`backend`, `frontend`), triggered on every `pull_request` and on `push` to `main`.
  - Both jobs pin Node to `'20'` via `actions/setup-node@v7`, with npm caching keyed to each package's own lockfile.
  - `permissions: contents: read` at the workflow level (least-privilege — no write access requested).
  - `backend` job (`working-directory: backend`): `npm ci` → `npm run lint` (Biome; warnings don't fail) → `npm run test:coverage` (`node --test` under `c8`, coverage gate from `backend/.c8rc.json`).
  - `frontend` job (`working-directory: frontend`): `npm ci` → `npm run lint` (Biome; warnings don't fail) → `npm run build` (`vite build` — the frontend's only CI gate, since there are no frontend tests).
  - Job IDs `backend`/`frontend` double as GitHub's required-status-check contexts for branch protection on `main` (see `deploy/branch-protection.md`) — the workflow comment explicitly warns not to add a custom `name:` to either job, since that would change the check context.

## Platform Requirements

**Development:**
- macOS (darwin), per project memory Node is not installed system-wide; must `export PATH="$HOME/bin:$PATH"` to use the project's Node wrappers
- Backend started directly with `node backend/src/index.js` (or `npm run dev` for nodemon)
- Frontend started via `frontend/start.sh` (invokes `node node_modules/.bin/vite`) or `iniciar.sh` at repo root (starts both backend and frontend, kills anything already bound to ports 3001/5173 first)

**Production:**
- Deploy target: Ubuntu 20.04/22.04/Debian 11+ Linux server, per `deploy/instalar.sh`
- Node.js 22.x installed via NodeSource setup script (note: production runs 22.x while CI validates against Node 20 — the `>=20` engine range in `backend/package.json` covers both)
- Process management: PM2, single app `agendor-backend`, config in `ecosystem.config.js` (`autorestart`, `max_memory_restart: 300M`, `max_restarts: 10`, single instance, no horizontal scaling)
- Reverse proxy: Nginx, config in `deploy/nginx.conf`, proxies all traffic on port 80 to `http://localhost:3001` (HTTPS block present but commented out, pending certificate)
- In production the Express backend serves the built frontend statically from `frontend/dist/` (`backend/src/index.js`, guarded by `NODE_ENV === 'production'` and existence of the dist folder) — this is a single-process deployment, not split frontend/backend hosting
- SQLite database file `backend/agendor.db` persisted on local disk; backed up daily via cron + `deploy/backup.sh` (keeps last 30 daily copies in `/opt/agendor/backups`)

---

*Stack analysis: 2026-07-29*
