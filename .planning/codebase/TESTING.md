# Testing Patterns

**Analysis Date:** 2026-07-22

## Test Framework

**Runner:**
- None. No test runner is installed or configured anywhere in the repository.
- Confirmed: no `jest`, `vitest`, `mocha`, `ava`, `chai`, or `supertest` dependency in `backend/package.json` or `frontend/package.json`.
- No `jest.config.*`, `vitest.config.*`, `.mocharc*` file exists.
- No `test` script exists in either `package.json` (`backend/package.json` only defines `start` and `dev`; `frontend/package.json` only defines `dev`, `build`, `preview`).

**Assertion Library:**
- Not applicable — none installed.

**Run Commands:**
```bash
# No test command exists. Running `npm test` in either backend/ or frontend/
# will fail with npm's default "Missing script: test" error.
```

## Test File Organization

**Location:**
- Not applicable. No test files exist anywhere in the repository (verified via `find . -iname "*.test.*" -o -iname "*.spec.*"` and `find . -type d -iname "__tests__"` — both return zero results, excluding `node_modules`).

**Naming:**
- No convention established — there is no prior art to follow.

**Structure:**
- N/A.

## Test Structure

No test suites exist. There is no `describe`/`it`/`test` pattern anywhere in the codebase to reference.

## Mocking

**Framework:** None installed (no `sinon`, `jest.mock`, `msw`, or similar).

**What would need mocking if tests were added:**
- `backend/src/agendor.js` — the Agendor REST API (`axios` calls to `https://api.agendor.com.br/v3`). All business logic (stale-deal filtering, category exclusion, funnel exclusion) is currently entangled with live HTTP calls inside `getStaleDeals()`, `getUsers()`, `getDealsWithFutureTasks()`, `getOrgCategory()` — none of these are structured for dependency injection of a fake API client.
- `backend/src/emailer.js` — `nodemailer.createTransport(...)`/`transporter.sendMail(...)`. `createTransporter()` reads SMTP config directly from `getConfig()` (which reads SQLite) with no injection seam.
- `backend/src/db.js` — a single module-level `better-sqlite3` `Database` instance opened at `require()` time against the real file `backend/agendor.db`. There is no in-memory/test-database mode; any test importing this module (directly or transitively via `scheduler.js`, routes, etc.) touches the real on-disk DB file.
- `backend/src/scheduler.js` — `node-cron` scheduling (`cron.schedule(...)`) would need faking/advancing of time to test without waiting for real cron triggers.

## Fixtures and Factories

**Test Data:**
- None exist. No `fixtures/`, `__mocks__/`, `factories/`, or seed-data-for-tests directories anywhere in the repo.

**Location:**
- Not applicable.

## Coverage

**Requirements:** None enforced — no coverage tool configured (no `nyc`, `c8`, or `--coverage` flag anywhere).

**View Coverage:**
```bash
# Not applicable — no coverage tooling installed.
```

## Test Types

**Unit Tests:** None.

**Integration Tests:** None.

**E2E Tests:** None. (Note: `capture_screenshots.py` at repo root and `slides_screenshots/` are unrelated tooling for generating presentation slide screenshots, not for E2E application testing — do not mistake these for a testing setup.)

## Manual Verification Approach

In the absence of automated tests, the codebase relies on:
- **Health check endpoint** — `GET /api/health` in `backend/src/index.js` (line 56) returns `{ ok, time, env }` for manual/uptime-monitor verification that the server booted.
- **SMTP self-test endpoint** — `POST /api/config/test-smtp` in `backend/src/routes/config.js` calls `verifySmtp()` (`backend/src/emailer.js`) to manually confirm SMTP credentials work from the running app before relying on them for scheduled sends.
- **Dashboard "check only" action** — `checkOnly()` in `frontend/src/components/Dashboard.jsx` calls `POST /api/notifications/check`, which runs the full stale-deal detection logic (`runCheckOnly()` in `backend/src/scheduler.js`) WITHOUT sending emails or writing to `notification_log`, letting an operator manually inspect results before triggering `POST /api/notifications/run`.

## Recommendations for Adding Tests

If test coverage is introduced in a future phase, prioritize based on `CONCERNS.md` and this analysis:
- **Highest value, lowest coupling:** pure filtering/business-rule functions in `backend/src/agendor.js` — `getDealType()`, `shouldNotifyOwner()`, the stage-exclusion regex logic (`EXCLUDED_STAGE_WORDS` matching in `getStaleDeals()`) — these are deterministic and currently un-exported/inlined; consider extracting them as standalone exported pure functions first, then unit-test them without any HTTP/DB dependency.
- **Requires seams first:** `backend/src/db.js` would need a way to point at an in-memory or temp-file SQLite database (e.g. accept a path via constructor/env var) before it can be tested in isolation from production data.
- **Requires HTTP mocking:** `backend/src/agendor.js` and `backend/src/emailer.js` would need `axios`/`nodemailer` swapped for mocks (e.g. via `nock` for HTTP, or a lightweight fake transporter for `nodemailer`) since both currently instantiate their clients directly at call time with no injection point.

---

*Testing analysis: 2026-07-22*
