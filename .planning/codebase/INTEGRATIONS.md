# External Integrations

**Analysis Date:** 2026-07-22

## APIs & External Services

**CRM (primary integration):**
- Agendor API v3 — the entire application exists to monitor deals ("negócios") in this CRM and email owners about stale ones
  - Base URL: `https://api.agendor.com.br/v3` (hardcoded constant `BASE_URL` in `backend/src/agendor.js`)
  - Client: `axios` instance created in `backend/src/agendor.js` with a default `Authorization` header
  - Auth: Token-based, header format `Authorization: Token <AGENDOR_TOKEN>`. Token read from `process.env.AGENDOR_TOKEN` (set in `backend/.env`, documented in `backend/.env.example`)
  - Endpoints consumed:
    - `GET /deals?deal_status_id=1&per_page=100&page=N` — paginated fetch of in-progress deals, `fetchDealsPage()` in `backend/src/agendor.js`; retries up to 3x on HTTP 429 with backoff
    - `GET /users?page=N&per_page=100` — user directory (id, name, `contact.email`), `getUsers()` in `backend/src/agendor.js`
    - `GET /organizations/:id` — organization category lookup (cached in-memory per orgId), `getOrgCategory()` in `backend/src/agendor.js`
    - `GET /tasks?dueDateGt=<iso>&per_page=100&page=N` — future/open tasks, used to suppress notifications for deals with a scheduled follow-up, `getDealsWithFutureTasks()` in `backend/src/agendor.js`
    - `GET /deals/:id` — single deal refresh, used to detect whether a previously-notified deal has since been updated, `backend/src/routes/notifications.js` (`GET /api/notifications/resolved`), calls axios directly (not via the shared `api` client)
  - Deal web URLs (`deal._webUrl`) point to `web.agendor.com.br` — used as the email CTA link and validated in the click-tracking redirect (`isSafeRedirect()` in `backend/src/routes/track.js` only allows `agendor.com.br` / `*.agendor.com.br` hosts)

## Data Storage

**Databases:**
- SQLite (file-based, embedded, no server process)
  - Client/driver: `better-sqlite3` ^9.6.0 (synchronous API)
  - File: `backend/agendor.db` (relative to `backend/src/db.js`, gitignored)
  - Schema and all queries defined inline in `backend/src/db.js` (no ORM, no migration framework — schema evolves via `ALTER TABLE ... ADD COLUMN` wrapped in try/catch for idempotency)
  - Tables: `config` (key/value app settings), `notification_log` (every email sent + click/resolution tracking), `weekly_snapshots` (historical weekly stats for charts), `app_users` (login credentials), `reset_tokens` (password-reset tokens, 1h expiry), `login_logs` (audit trail of login attempts)

**File Storage:**
- Local filesystem only. No S3/cloud storage integration detected.
- `backend/logs/` (referenced as `../../logs` from `backend/src/index.js`) — access/error logs written via file streams (`fs.createWriteStream`)
- `backups/` directory on production server (`deploy/backup.sh`) — plain file copies of `agendor.db`, rotated to keep last 30

**Caching:**
- In-memory only, process-local, not shared/distributed:
  - `orgCategoryCache` object in `backend/src/agendor.js` — caches Agendor organization → category lookups for the lifetime of the process
  - `loginAttempts` Map in `backend/src/routes/auth.js` — IP-based login rate-limit state (5 attempts → 15 min block), lost on restart

## Authentication & Identity

**Auth Provider:**
- Custom (no third-party auth provider/OAuth). Self-contained username/password + JWT implementation.
  - Implementation: `backend/src/routes/auth.js` (login, verify, change-password, forgot/reset-password, user management), `backend/src/middleware/auth.js` (request-level JWT enforcement), `backend/src/secret.js` (JWT secret loading/validation)
  - Passwords hashed with `bcryptjs` (10 rounds); legacy plaintext passwords are auto-migrated to bcrypt hashes on next successful login (`backend/src/routes/auth.js`, `ensureDefaultUsers()` and inline migration in `POST /login`)
  - JWT signed with `JWT_SECRET` env var (mandatory — process refuses to boot without it, `backend/src/secret.js`), 8-hour expiry (`TOKEN_EXPIRY = '8h'`)
  - Initial admin account seeded from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` env vars only when no users exist yet (`backend/src/routes/auth.js`, `ensureDefaultUsers()`)
  - Admin-only endpoints (user create/list/delete, login logs) gated by `requireAdmin` middleware, checking username against comma-separated `ADMIN_USERS` env var (if unset, any authenticated user is treated as admin — legacy/permissive default)
  - Public (unauthenticated) routes explicitly allowlisted in `backend/src/middleware/auth.js`: `/api/auth/login`, `/api/auth/verify`, `/api/track/click`, `/api/health`
  - Login rate limiting: in-memory per-IP counter, 5 failed attempts → 15-minute block (`backend/src/routes/auth.js`)

## Monitoring & Observability

**Error Tracking:**
- Not detected. No Sentry/Bugsnag/error-tracking SaaS integration. Errors are caught and written to a local file (`logs/error.log`) via the global Express error handler in `backend/src/index.js` and logged via `backend/src/logger.js`.

**Logs:**
- Custom minimal structured logger, `backend/src/logger.js` — JSON lines in production, human-readable text in development; level controlled by `LOG_LEVEL` env var
- HTTP access logs via `morgan` (`combined` format) written to `logs/access.log`; `morgan('dev')` also to console when `NODE_ENV !== 'production'` (`backend/src/index.js`)
- No external log aggregation/shipping (e.g., no Datadog, no Loki) — logs stay on local disk, rotated only via `pm2` log settings in `ecosystem.config.js`

## CI/CD & Deployment

**Hosting:**
- Self-managed Linux VM/server (no managed PaaS like Vercel/Heroku/Railway detected)
- Single process serves both API and static frontend build in production (`backend/src/index.js` serves `frontend/dist/` when `NODE_ENV=production`)

**CI Pipeline:**
- Not detected. No `.github/workflows/`, no CI config files found in the repo.
- Deployment is manual/scripted: `deploy/instalar.sh` (full server bootstrap: installs Node 22 via NodeSource, PM2, Nginx, clones repo from `https://github.com/vitormorija/automacao-agendor.git`, builds frontend, configures Nginx and PM2, sets up a cron-based DB backup)

## Environment Configuration

**Required env vars (backend, `backend/.env`, documented in `backend/.env.example`):**
- `AGENDOR_TOKEN` — Agendor CRM API token
- `JWT_SECRET` — required at boot, ≥16 chars
- `PORT`, `NODE_ENV`
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` — first-boot admin bootstrap
- `ADMIN_USERS` — admin allowlist for user-management endpoints
- `ALLOWED_ORIGINS` — CORS allowlist
- `BASE_URL` — public backend URL for email click-tracking links
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — outbound email (seeded into SQLite `config` table on first boot, then editable via the app's Config panel/API rather than requiring redeploy)
- `ADMIN_EMAIL` — recipient(s) for admin summary emails (also seeded into DB config)
- `STALE_DAYS` — default stale-deal threshold (seeded into DB config, default 15)

**Secrets location:**
- `backend/.env` (gitignored) on each environment; `backend/.env.example` is the committed template with placeholder values only
- SMTP credentials and other operational config, once seeded, live in the `config` table of `backend/agendor.db` (editable at runtime via `PUT /api/config`, `backend/src/routes/config.js`) — the SMTP password is masked (`••••••••`) in `GET /api/config` responses and never echoed back in full

## Webhooks & Callbacks

**Incoming:**
- None from Agendor (no push-webhook receiver). All Agendor data is pulled via polling/API calls on a schedule or on-demand.
- `GET /api/track/click` (`backend/src/routes/track.js`) acts as an email click-tracking redirect endpoint: records a click timestamp against a `notification_log` row, then 302-redirects to the deal's Agendor URL. Public route (no auth), restricts redirect targets to `agendor.com.br`/`*.agendor.com.br` hosts to avoid open-redirect abuse.

**Outgoing:**
- SMTP email delivery via `nodemailer` (`backend/src/emailer.js`) — not a webhook, but the app's only outbound push mechanism: stale-deal alert emails, weekly admin summary, weekly per-owner summary, password-reset emails
- No outgoing webhooks to third-party systems (e.g., Slack, Teams) detected

---

*Integration audit: 2026-07-22*
