---
phase: 01-rede-de-testes-safety-net
plan: 01
subsystem: testing
tags: [node-test, c8, coverage, sqlite, test-harness, env-seam]

# Dependency graph
requires: []
provides:
  - "backend `npm test` wired to the built-in node:test runner (zero new runtime deps)"
  - "report-only c8 coverage via `npm run test:coverage` (c8@12 devDependency)"
  - "shared test/setup.js presetting JWT_SECRET, DB_PATH=':memory:', AGENDOR_TOKEN before any module load"
  - "DB_PATH env seam in db.js (production default byte-unchanged) so tests never touch backend/agendor.db"
affects: [02, 03, 04, 05, notification-tests, auth-tests, ci]

# Tech tracking
tech-stack:
  added: [c8@12 (dev-only, report-only coverage)]
  patterns:
    - "node:test built-in runner (no test framework dependency)"
    - "side-effect-only test/setup.js required first in each test file to neutralize import side-effects"
    - "conditional env presets (only-when-unset) so per-file overrides win"
    - "DB_PATH env seam with byte-preserved production default"

key-files:
  created:
    - backend/.c8rc.json
    - backend/test/setup.js
    - backend/test/smoke.test.js
  modified:
    - backend/package.json
    - backend/package-lock.json
    - backend/src/db.js
    - .gitignore

key-decisions:
  - "D-01/D-03: native node:test runner wired via backend `test` script — zero new runtime dependency"
  - "D-02: coverage via c8, report-only (no thresholds in Phase 1; thresholds deferred to Phase 2)"
  - "D-07: db.js accepts DB_PATH env override, default arm byte-identical to prior path expression"
  - "c8@12 legitimacy confirmed via blocking-human gate (threat T-01-SC): istanbul-team package, no preinstall/postinstall lifecycle scripts"

patterns-established:
  - "Test setup: require('./setup') first in every test file; setup.js is side-effect-only and never reads production backend/.env"
  - "Coverage is report-only in Phase 1 — no failing threshold gate"

requirements-completed: [TEST-01]

# Metrics
duration: ~15min
completed: 2026-07-22
---

# Phase 01 Plan 01: Rede de Testes — Test-Runner Foundation Summary

**Backend test harness stood up on the built-in node:test runner with report-only c8@12 coverage, a shared side-effect-only setup that isolates tests from production data via a byte-preserving DB_PATH seam in db.js.**

## Performance

- **Duration:** ~15 min (continuation from checkpoint)
- **Completed:** 2026-07-22
- **Tasks:** 3 (Task 1 pre-committed; Task 2 human gate approved; Task 3 executed here)
- **Files modified:** 7 (across both commits)

## Accomplishments
- `cd backend && npm test` runs `node --test` and is green (2 passing tests, CI-callable)
- `npm run test:coverage` produces a report-only c8 text+lcov coverage report, exits 0 (no threshold gate)
- Shared `test/setup.js` presets JWT_SECRET, DB_PATH=':memory:', AGENDOR_TOKEN before any require — tests never touch backend/agendor.db and never read production backend/.env
- DB_PATH env seam added to db.js line 4 with the production default byte-preserved

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire node:test runner, shared setup, and DB_PATH seam** - `08840aa` (feat) — pre-committed before checkpoint
2. **Task 2: Verify c8 package legitimacy before install** - checkpoint (blocking-human gate), approved by user — no code
3. **Task 3: Install c8 devDependency and prove coverage runs** - `0725c4a` (chore)

**Plan metadata:** committed with SUMMARY.md, STATE.md, ROADMAP.md, REQUIREMENTS.md

## Files Created/Modified
- `backend/package.json` - `test` (`node --test`) + `test:coverage` (c8) scripts; c8 ^12.0.0 devDependency
- `backend/package-lock.json` - c8 dependency tree
- `backend/.c8rc.json` - report-only coverage config (all:true, include src/**/*.js, exclude test/** and src/index.js; text + lcov)
- `backend/test/setup.js` - side-effect-only env presets, conditional (only-when-unset)
- `backend/test/smoke.test.js` - trivial passing node:test proving the runner is wired
- `backend/src/db.js` - DB_PATH env seam (default byte-unchanged)
- `.gitignore` - ignore generated `coverage/` report output

## Decisions Made
- c8@12 legitimacy confirmed through the blocking-human gate (threat T-01-SC): `npm view c8 scripts` shows no preinstall/postinstall lifecycle hooks, only the package's own dev scripts. User independently verified c8@12 on the npm registry (istanbul team, github.com/bcoe/c8).
- Coverage kept report-only per D-02 / RESEARCH Open Question 2 — no thresholds in Phase 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Ignore generated coverage/ output**
- **Found during:** Task 3 (coverage run)
- **Issue:** `npm run test:coverage` generates a `coverage/` directory left untracked; leaving generated output untracked or accidentally committing it is undesirable and the plan did not specify gitignore handling.
- **Fix:** Added `coverage/` to root `.gitignore` under a "Cobertura de testes" section.
- **Files modified:** .gitignore
- **Verification:** `git status` no longer surfaces coverage/ as untracked.
- **Committed in:** `0725c4a` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 missing-critical / hygiene)
**Impact on plan:** Necessary repo hygiene for a report-only coverage tool. No scope creep — no behavior change.

## Issues Encountered
- None. Install and coverage ran cleanly. `npm install --save-dev c8@12` reported "removed 77 packages" as normal dependency-tree deduplication (no source files deleted; verified via `git diff --diff-filter=D`).
- `npm audit` reports pre-existing vulnerabilities in the dependency tree — out of scope for this plan (not introduced by c8's own runtime path); not addressed here.

## Threat Model Compliance
- **T-01-SC (Tampering, npm install c8):** mitigated — blocking-human gate satisfied before install; no lifecycle scripts.
- **T-01-01 (Info Disclosure, JWT_SECRET):** mitigated — setup.js sets a throwaway JWT_SECRET only; never reads production backend/.env.
- **T-01-02 (Tampering, tests touching real DB):** mitigated — setup.js presets DB_PATH=':memory:'; db.js default byte-preserved for unset env only.

## Next Phase Readiness
- Test-runner foundation complete: later plans can write node:test files (require('./setup') first) against isolated SQLite.
- Coverage available report-only; thresholds are a Phase 2 concern.
- Two separate package.json (backend/frontend) remain — frontend toolchain still out of scope for this plan.

---
*Phase: 01-rede-de-testes-safety-net*
*Completed: 2026-07-22*

## Self-Check: PASSED

All created files exist; both task commits (08840aa, 0725c4a) present; DB_PATH seam and c8 devDependency verified.
