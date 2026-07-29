# Technology Stack

**Analysis Date:** 2026-07-22

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
- No `.nvmrc` present. Local dev machine resolves Node from custom binaries — per project memory, wrappers in `~/bin/node`/`~/bin/npm` point at `/tmp/node-v22.13.1-darwin-arm64/bin/`. In this environment `node -v` resolves to v25.9.0 (PATH-dependent, not pinned by any config file).
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
- Not detected. No test runner, no `*.test.js`/`*.spec.js` files, no `test` script in any `package.json`.

**Build/Dev:**
- Vite - frontend build (`npm run build` → `frontend/dist/`), dev server on port 5173 with `/api` proxy to `http://localhost:3001`
- Tailwind CSS ^3.4.4 + PostCSS ^8.4.38 + Autoprefixer ^10.4.19 - CSS pipeline, `frontend/tailwind.config.js`, `frontend/postcss.config.js`
- nodemon ^3.1.4 - backend dev auto-restart (`backend` `npm run dev` script), `backend/package.json`
- PM2 (`ecosystem.config.js`) - production process manager, not an npm dependency (installed globally on server via `deploy/instalar.sh`)

## Key Dependencies

**Critical (backend, `backend/package.json`):**
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

**Frontend (`frontend/package.json`):**
- `recharts` ^3.8.1 - Charts on the Reports panel, `frontend/src/components/ReportPanel.jsx`
- `react-hot-toast` ^2.4.1 - Toast notifications across UI
- `lucide-react` ^0.395.0 - Icon set

**Infrastructure:**
- `pptxgenjs` ^4.0.1 - Present in both root `package.json` and `backend/devDependencies`; used only by ad-hoc/one-off scripts (`make_pptx.js`, `make_slides.js`) for generating presentation decks, not part of the running application

## Configuration

**Environment:**
- Backend loads config from `backend/.env` (gitignored; `.env.example` documents required keys). Loaded via `dotenv` in `backend/src/index.js`, line 1.
- Frontend has no `.env` file; talks to backend exclusively through the Vite dev proxy (`/api` → `http://localhost:3001`) or, in production, is served as static files by the Express backend itself.
- Environment variables actually read in code (`process.env.*`, from `backend/src`):
  - `AGENDOR_TOKEN` — Agendor API auth token, `backend/src/agendor.js`
  - `PORT` — backend listen port (default 3001), `backend/src/index.js`
  - `NODE_ENV` — `development`/`production` switch (affects logging, error verbosity, static frontend serving), `backend/src/index.js`, `backend/src/logger.js`
  - `JWT_SECRET` — **required, no fallback**; process throws at boot if missing or <16 chars, `backend/src/secret.js`
  - `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — one-time initial admin user seed, `backend/src/routes/auth.js`
  - `ADMIN_USERS` — comma-separated allowlist of usernames treated as admins for user-management endpoints, `backend/src/routes/auth.js`
  - `ALLOWED_ORIGINS` — comma-separated CORS allowlist, `backend/src/index.js`
  - `BASE_URL` — public backend URL used to build email click-tracking links, `backend/src/index.js`, `backend/src/emailer.js`
  - `BASE_URL_FRONTEND` — used to build password-reset links, `backend/src/routes/auth.js` (defaults to `http://localhost:5173`)
  - `LOG_LEVEL` — controls `backend/src/logger.js` verbosity (`error`/`warn`/`info`/`debug`)
  - `ADMIN_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `STALE_DAYS` — documented in `.env.example` but actually consulted at runtime via DB-backed config (`backend/src/db.js` `defaults` object seeds these into the `config` SQLite table on first boot; subsequent reads go through `getConfig()`, not `process.env`, except as the seed fallback)
- Secrets existence noted only: `backend/.env` is present on disk (970 bytes) — contents not read per policy.

**Build:**
- `frontend/vite.config.js` — dev server port 5173, `/api` proxy, production build to `frontend/dist/` with manual vendor chunk for `react`/`react-dom`
- `frontend/tailwind.config.js` — content globs `./index.html`, `./src/**/*.{js,jsx}`
- `frontend/postcss.config.js` — `tailwindcss` + `autoprefixer`
- No `tsconfig.json` — project is plain JavaScript, not TypeScript

## Platform Requirements

**Development:**
- macOS (darwin), per project memory Node is not installed system-wide; must `export PATH="$HOME/bin:$PATH"` to use the project's Node wrappers
- Backend started directly with `node backend/src/index.js` (or `npm run dev` for nodemon)
- Frontend started via `frontend/start.sh` (invokes `node node_modules/.bin/vite`) or `iniciar.sh` at repo root (starts both backend and frontend, kills anything already bound to ports 3001/5173 first)

**Production:**
- Deploy target: Ubuntu 20.04/22.04/Debian 11+ Linux server, per `deploy/instalar.sh`
- Node.js 22.x installed via NodeSource setup script
- Process management: PM2, single app `agendor-backend`, config in `ecosystem.config.js` (`autorestart`, `max_memory_restart: 300M`, `max_restarts: 10`)
- Reverse proxy: Nginx, config in `deploy/nginx.conf`, proxies all traffic on port 80 to `http://localhost:3001` (HTTPS block present but commented out, pending certificate)
- In production the Express backend serves the built frontend statically from `frontend/dist/` (`backend/src/index.js`, guarded by `NODE_ENV === 'production'` and existence of the dist folder) — this is a single-process deployment, not split frontend/backend hosting
- SQLite database file `backend/agendor.db` persisted on local disk; backed up daily via cron + `deploy/backup.sh` (keeps last 30 daily copies in `/opt/agendor/backups`)

---

*Stack analysis: 2026-07-22*
