# Testing Patterns

**Analysis Date:** 2026-07-29

## Test Framework

**Runner:**
- Node's built-in `node:test` runner (no external test framework dependency). Requires Node >= 18; the project targets Node >= 20 (`backend/package.json` `engines.node`).
- `backend/package.json` scripts: `"test": "node --test"` and `"test:coverage": "c8 --reporter=text --reporter=lcov node --test"`.
- No test runner or test script of substance exists in the frontend: `frontend/package.json`'s `"test"` script is `"echo \"(frontend sem testes nesta fase — gate é vite build)\" && exit 0"` — it always exits 0 and runs no assertions. The frontend's actual CI gate is `npm run build` (`vite build`), not a test suite.
- Coverage tool: `c8` ^12.0.0 (a `backend` devDependency), configured via `backend/.c8rc.json`.

**Assertion Library:**
- `node:assert/strict`, imported per-file as `const assert = require('node:assert/strict');`. No third-party assertion library (no `chai`, no `expect`-style libs).

**Run Commands:**
```bash
export PATH="$HOME/bin:$PATH"      # Node not on default PATH in this environment (see CLAUDE.md)
cd backend
npm test                            # node --test — runs all *.test.js under backend/test/
npm run test:coverage               # c8 --reporter=text --reporter=lcov node --test — runs tests + coverage gate
```
As of 2026-07-29 this produces 35 passing tests (0 failing) across 8 test files, in ~0.3s wall time for the plain run.

## Test File Organization

**Location:**
- All backend tests live under `backend/test/`, flat (no nested `__tests__` mirroring `src/`). There is no frontend test directory.

**Naming:**
- Test files: `<module>.<aspect>.test.js` — e.g. `agendor.funnel.test.js`, `agendor.getStaleDeals.test.js`, `agendor.futureTasks.test.js`, `agendor.pure.test.js`, `agendor.realsample.test.js`, `auth.test.js`, `db.dedup.test.js`, `smoke.test.js`.
- Support files that must NOT be treated as test suites by `node --test`'s auto-discovery are named without the `.test.` infix: `backend/test/setup.js`, `backend/test/helpers/tmpDb.js`, `backend/test/helpers/fakeAxios.js`. (`node --test`'s default pattern only picks up files matching `*.test.js`, `*-test.js`, or files under `test/`/`tests/` directories with certain name patterns — these helper files avoid the `.test.js` suffix specifically so they aren't independently executed as suites, even though they DO get loaded once as an import target of the real test files. `setup.js` is technically discoverable by `node --test`'s directory-based scan too, but since it registers zero `test()` calls it is a harmless no-op "suite" — visible in run output as `ok N - test/setup.js` with zero assertions.)

**Structure:**
```
backend/test/
├── setup.js                          # shared env preset, required first by every test file
├── smoke.test.js                     # trivial runner-connectivity check
├── agendor.pure.test.js              # pure helpers: getDealType, isExcludedStage
├── agendor.funnel.test.js            # shouldNotifyOwner / NO_OWNER_NOTIFY_FUNNELS
├── agendor.getStaleDeals.test.js     # getStaleDeals golden, fixed clock, fake axios
├── agendor.futureTasks.test.js       # getDealsWithFutureTasks golden, pagination
├── agendor.realsample.test.js        # anonymized real-data smoke (no assertions on ids)
├── auth.test.js                      # rate limiting + password verification
├── db.dedup.test.js                  # alreadyNotifiedToday same-day dedup boundary
├── helpers/
│   ├── fakeAxios.js                  # installFakeAxios(routeHandler) — stubs axios.create
│   └── tmpDb.js                      # makeTmpDbPath()/openRaw() — file-backed SQLite for seeding
└── fixtures/
    ├── real-deals.sample.json        # anonymized real Agendor sample (untracked until approved)
    └── synthetic/
        └── deals-page.json           # synthetic deal fixtures for the getStaleDeals golden
```

## CRITICAL: process isolation between test files

**Each test file in `backend/test/` runs in its own separate Node process/worker under `node --test`.** This is the single most important fact for writing new tests here, because several backend modules have load-time side effects and module-level singleton state:

- `backend/src/secret.js` throws at require-time if `JWT_SECRET` is missing/weak.
- `backend/src/db.js` opens ONE SQLite connection at module load (against `process.env.DB_PATH`).
- `backend/src/agendor.js` creates its `axios` instance (`axios.create(...)`) at module load.
- `backend/src/routes/auth.js` has a module-level `Map` (`_loginAttempts`) for rate-limiting state.

Because `node --test` isolates each test *file* into its own process, tests in different files never see each other's module-level state (e.g. `auth.test.js`'s rate-limit `Map` is fresh per file run, `db.dedup.test.js`'s SQLite singleton doesn't leak into `agendor.getStaleDeals.test.js`). This is what makes it safe for `db.dedup.test.js` to point `DB_PATH` at its own temp file and for `agendor.getStaleDeals.test.js`/`agendor.futureTasks.test.js` to install a fake `axios.create` before requiring `../src/agendor` — there's no cross-file contamination risk from load-order. Within a SINGLE file, though, module-level state IS shared across all `test()` blocks in that file (e.g. `auth.test.js` clears `_loginAttempts` in a `beforeEach` specifically because the Map persists across tests within that one file/process).

**Implication for new tests:** any stubbing that must happen "before the module under test is required" (faking `axios.create`, setting `DB_PATH` to a temp file, presetting `JWT_SECRET`) is safe to do at the top of a NEW test file without needing to worry about other test files that already required the real module — but it must still happen before the FIRST `require('../src/whatever')` within that same file, since CommonJS caches the module per-process and re-requiring won't re-run its top-level side effects.

## Shared Setup: `backend/test/setup.js`

Every test file's first line is `require('./setup');`. This file defines zero tests — it exists purely to preset environment variables before any backend module is loaded, since several modules read `process.env` at require-time (see above). Behavior:

- **Guarded presets** (only set if not already set by the test file itself): `JWT_SECRET` → `'test-jwt-secret-0123456789abcdef'`, `DB_PATH` → `':memory:'`, `AGENDOR_TOKEN` → `'test'`. Guarding lets an individual test file win by setting its own value BEFORE requiring `./setup` (see `db.dedup.test.js`, which sets `process.env.DB_PATH` to a temp file path before requiring `./setup`, so the guard sees it already set and does not overwrite it with `:memory:`).
- **Unguarded, always-overwritten**: `SMTP_PASS` and `ADMIN_EMAIL` are force-set to `''` on every load, regardless of what's already in the environment. This is intentional: it prevents a real secret exported in the developer's shell or CI environment from leaking into `db.js`'s config-seeding logic (which reads these two vars to seed initial config rows), since that seeded config could otherwise end up written into a test SQLite file.
- Never reads `backend/.env` — test environment values are disposable and have no relation to production config.

**Default DB mode is `:memory:`.** A test that needs a SECOND connection to the SAME database (to seed rows with a controlled timestamp that `db.js`'s own write functions can't produce, e.g. "notified yesterday") cannot use `:memory:` — each `better-sqlite3` connection to `:memory:` is an isolated, empty database. For that case, use the file-backed helper below instead.

## Helper: `backend/test/helpers/tmpDb.js`

Provides two functions for tests that need a file-backed (not in-memory) SQLite database so a second raw connection can see the same data as the module singleton in `db.js`:

- `makeTmpDbPath()` → `{ path, cleanup }`. Generates a unique path under `os.tmpdir()` (`agendor-test-<pid>-<random>.db`). `cleanup()` deletes the db file and its `-journal`/`-wal`/`-shm` siblings, silently ignoring errors (file may not exist).
- `openRaw(dbPath)` → a raw `better-sqlite3` `Database` instance pointed at the given path, used to seed rows directly (bypassing `db.js`'s API) with values `db.js`'s own functions can't produce, like a past `sent_at`.

**Usage pattern** (see `backend/test/db.dedup.test.js`):
```javascript
const { makeTmpDbPath, openRaw } = require('./helpers/tmpDb');

const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;   // BEFORE requiring './setup' or '../src/db'

require('./setup');              // setup.js's DB_PATH guard sees it's already set, doesn't override

const { test, after } = require('node:test');
const db = require('../src/db'); // singleton opens against DB_PATH

after(() => {
  db.closeDb();
  cleanup();
});
```
Never point a test at `backend/agendor.db` (the real production/dev database file) — always use `:memory:` (default via `setup.js`) or a temp file via `tmpDb.js`.

## Helper: `backend/test/helpers/fakeAxios.js`

Stubs the axios instance that `backend/src/agendor.js` creates at module load (`const api = axios.create(...)`), so tests can exercise the REAL business logic in `agendor.js` (filtering, pagination, date-boundary math) while controlling the HTTP responses.

```javascript
const { mock } = require('node:test');
const axios = require('axios');

function installFakeAxios(routeHandler) {
  const fakeInstance = { get: mock.fn(async (url, config) => routeHandler(url, config)) };
  mock.method(axios, 'create', () => fakeInstance);
  return fakeInstance;
}
```

**Must be installed BEFORE the first `require('../src/agendor')`** in the file, since `agendor.js` calls `axios.create(...)` once at load time and caches the resulting instance in a module-level `const`. Typical usage (see `agendor.getStaleDeals.test.js`, `agendor.futureTasks.test.js`, `agendor.realsample.test.js`):

```javascript
installFakeAxios((url, config) => {
  if (url === '/deals') return { data: { data: dealsPage, meta: { totalCount: dealsPage.length }, links: {} } };
  if (url.startsWith('/organizations/')) { /* ... */ }
  return { data: { data: [] } };
});

const { getStaleDeals } = require('../src/agendor'); // picks up the stub via axios.create
```
`installFakeAxios` returns the fake instance so tests can inspect call counts (`fake.get.mock.callCount()`) and reset them between tests (`fake.get.mock.resetCalls()` in a `beforeEach`) — used in `agendor.futureTasks.test.js` to assert exactly 2 HTTP calls across a 2-page pagination scenario.

## Fixtures

**Location:** `backend/test/fixtures/`
- `real-deals.sample.json` — an anonymized sample of real Agendor deal data. Explicitly excluded from Biome's scope (`biome.json`: `"!backend/test/fixtures/**"`). Per `agendor.realsample.test.js`'s header comment, this file is intentionally left UNTRACKED in git pending human approval — it is a smoke fixture only (asserts the pipeline doesn't throw on real-shaped data), not a golden/id-based assertion, precisely because its exact contents may not be committed.
- `synthetic/deals-page.json` — hand-authored synthetic deal fixtures used for the `getStaleDeals` golden test, where every deal's `updatedAt`/`createdAt` is deliberately chosen relative to a fixed mocked clock to exercise specific boundary conditions (exact cutoff, cutoff -1ms, pre-2026 creation date, excluded category, excluded owner, excluded stage word, wrong status id).

**Inline fixtures:** `agendor.futureTasks.test.js` defines its task fixtures inline in the test file itself (not in a separate JSON file) with per-entry comments explaining which boundary case each task exercises (open+future, finished+future, open+past, open+exact-boundary, missing `deal.id`, plus filler tasks to force pagination to a second page).

## Time control

Tests that depend on "now" (stale-date thresholds, future-task due dates, rate-limit block expiry) use `node:test`'s built-in `mock.timers`, NOT a fake-timers library:

```javascript
const { before, after, mock } = require('node:test');
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

before(() => { mock.timers.enable({ apis: ['Date'], now: FIXED_NOW }); });
after(() => { mock.timers.reset(); });
```
`auth.test.js`'s rate-limit-expiry test additionally uses `mock.timers.tick(15 * 60 * 1000 + 1)` to advance the mocked clock past the 15-minute block window within a single test, then calls `mock.timers.reset()` in a `finally` block scoped to that one test (rather than a file-level `after`) since only that specific test needs time advancement.

## Test Types

**Characterization ("golden") tests** — the dominant style in this suite. Every non-trivial test file's header comment states it documents CURRENT behavior, not ideal behavior (Portuguese: "DOCUMENTA O COMPORTAMENTO ATUAL — não o ideal"), and deliberately includes "quirk" assertions for surprising-but-real behavior (e.g. `agendor.pure.test.js`: `isExcludedStage('Perdão de contrato')` returns `true` because the substring match for "perd" catches "Perdão" too, unrelated to "perdido"; `agendor.funnel.test.js`: `shouldNotifyOwner({ funnel: 'beefor vendas' })` returns `true` because the funnel-suppression match is exact, not substring). When modifying business logic these tests protect, expect (and require) a deliberate, conscious test update — a failure here is a prompt for a decision, not necessarily a bug.

**Unit tests (pure functions, no I/O):** `agendor.pure.test.js` (`getDealType`, `isExcludedStage`), `agendor.funnel.test.js` (`shouldNotifyOwner`).

**Integrated tests (real logic + stubbed HTTP edge):** `agendor.getStaleDeals.test.js`, `agendor.futureTasks.test.js`, `agendor.realsample.test.js` — run the actual `agendor.js` functions with `axios.create` stubbed via `installFakeAxios`, combined with a fixed mocked clock. This is the dominant "integration" pattern in the suite: mock the HTTP boundary, not the internal logic.

**Database tests (real SQLite, temp file):** `db.dedup.test.js` — runs real `better-sqlite3` operations against a temp file, using a second raw connection to seed data the module's own API can't produce.

**Security-behavior tests:** `auth.test.js` — rate limiting (brute-force block after 5 failed attempts, 15-minute window, IP-scoped) and password verification (bcrypt hash path vs. legacy plaintext path, discriminated by the `$2` bcrypt prefix).

**E2E tests:** None.

## Coverage

**Enforced via `backend/.c8rc.json`:**
```json
{
  "all": true,
  "include": ["src/**/*.js"],
  "exclude": ["test/**", "src/index.js"],
  "reporter": ["text", "lcov"],
  "check-coverage": true,
  "per-file": false,
  "lines": 20,
  "statements": 20,
  "functions": 20,
  "branches": 60
}
```
- `"all": true` means c8 counts EVERY file matching `include` (all of `src/**/*.js`) toward the denominator, even files with zero test coverage (e.g. `scheduler.js`, `config.js`, `deals.js`, `notifications.js`, `reports.js`, `track.js`, `middleware/auth.js` currently show 0%) — this is why the overall thresholds are set low (20% lines/statements/functions) rather than near-100%: the gate is deliberately "don't regress below current," not "fully covered."
- `"per-file": false` means the 20/20/20/60 floors apply to the AGGREGATE across all included files, not to each file individually — an individual file can be at 0% as long as the whole-repo average clears the floor.
- `src/index.js` is excluded entirely (server bootstrap/wiring, not business logic).
- Observed coverage as of 2026-07-29 (`npm run test:coverage`): **23.32% statements, 65.48% branches, 24.61% functions, 23.32% lines** — roughly 5 points of branch-coverage slack above the 60% floor and ~3-4 points of statement/line/function slack above the 20% floor. A new test file that REMOVES coverage of already-tested code (e.g. deleting a passing assertion) can fail the gate even without failing an assertion, if the aggregate drops below these floors.
- `agendor.js` is the best-covered source file (79.25% lines) due to the golden/integrated tests; `emailer.js`, `scheduler.js`, `middleware/auth.js`, and most of `routes/*.js` (except `routes/auth.js`, partially exercised) remain at or near 0% — these are the highest-value targets for new test files per `CONCERNS.md`.

**View coverage:**
```bash
export PATH="$HOME/bin:$PATH"
cd backend && npm run test:coverage   # text summary printed to stdout + lcov.info generated for tooling
```

## CI Integration

`.github/workflows/ci.yml` runs two parallel jobs, `backend` and `frontend`, on every `pull_request` and on `push` to `main`. Both are configured as required status checks (job `id`s must not be renamed via a custom `name:`, per the workflow's own comments, since branch protection references the job id as the check context).

- **backend job:** `npm ci` → `npm run lint` (`biome lint .`, warn-tolerant, does not fail on the current warning baseline) → `npm run test:coverage` (`node --test` under `c8`, WILL fail the build if a test fails OR if the aggregate coverage gate in `.c8rc.json` is not met).
- **frontend job:** `npm ci` → `npm run lint` (`biome lint .`, warn-tolerant) → `npm run build` (`vite build` — this IS the frontend's gate; there is no frontend test step).
- Node 20 pinned via `actions/setup-node@v7` in both jobs, matching the production target (`engines.node >= 20`).

## Common Patterns

**Async testing:**
```javascript
test('getStaleDeals(15): golden do conjunto incluído', async () => {
  const result = await getStaleDeals(15);
  assert.deepStrictEqual(result.map((d) => d.id), [101, 103]);
});
```

**Boundary/"blindagem" (shield) assertions:** tests explicitly assert that a strict comparison operator (`<` vs `<=`, `>` vs `>=`) behaves as currently coded, with a comment stating what would happen if the operator were flipped — e.g. `getStaleDeals(15): fronteira estrita do dia` asserts a deal with `updatedAt` exactly equal to the cutoff is EXCLUDED (`<` is strict), and that changing to `<=` would flip this test. Follow this pattern for any new boundary-sensitive business rule: assert the exact-equality case explicitly, not just clearly-inside/clearly-outside cases.

**Isolating shared in-file state:**
```javascript
beforeEach(() => {
  auth._loginAttempts.clear(); // zero the in-memory rate-limit Map between test cases in this file
});
```

---

*Testing analysis: 2026-07-29*
