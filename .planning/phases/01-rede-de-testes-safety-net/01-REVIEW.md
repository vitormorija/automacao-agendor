---
phase: 01-rede-de-testes-safety-net
reviewed: 2026-07-24T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - backend/src/agendor.js
  - backend/src/db.js
  - backend/src/routes/auth.js
  - backend/scripts/capture-fixtures.js
  - backend/.c8rc.json
  - backend/package.json
  - backend/test/setup.js
  - backend/test/smoke.test.js
  - backend/test/agendor.pure.test.js
  - backend/test/agendor.getStaleDeals.test.js
  - backend/test/agendor.funnel.test.js
  - backend/test/agendor.realsample.test.js
  - backend/test/db.dedup.test.js
  - backend/test/auth.test.js
  - backend/test/helpers/fakeAxios.js
  - backend/test/helpers/tmpDb.js
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-24
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

This phase adds a characterization-test safety net over the "who gets notified" logic plus three minimal src seams: a `DB_PATH` env override in `db.js`, `getDealType`/`isExcludedStage` extractions + exports in `agendor.js`, and a `verifyPassword` helper + rate-limit exports in `auth.js`.

I ran `git diff` against the pre-phase commit for every touched `src` file and confirmed all three seams are **byte-for-byte behavior-preserving**: the `$2` bcrypt discriminator in `auth.js` is copied verbatim into `verifyPassword` and both call sites were mechanically replaced with no logic change; the strict `<` cutoff comparison and the exact combining-marks regex in `agendor.js`'s stage-exclusion logic were extracted into `isExcludedStage` without alteration; `db.js`'s `DB_PATH` override falls back to the original hardcoded production path (`path.join(__dirname, '..', 'agendor.db')`) when unset, and `DB_PATH` is not referenced anywhere in `ecosystem.config.js` or `.env.example`, so production behavior is unaffected. I also executed the full suite (`node --test`, 28/28 passing) and manually traced the `getStaleDeals` golden fixture (`deals-page.json`) against the filter pipeline (date threshold → `<` cutoff → category → owner → status → stage) to confirm the expected `[101, 103]` result is not a false-green — it is derived correctly from the actual filter order in `agendor.js`.

No BLOCKER-level findings were identified: no behavior change in the three flagged seams, no secrets hardcoded in source, no SQL/command injection, no test that touches the real production DB (`db.dedup.test.js` and `auth.test.js` both point `DB_PATH` away from `backend/agendor.db` before any `require('../src/db')`, and Node's `--test` runner isolates each test file in its own process so env vars set in one file never leak into another).

The findings below are quality/robustness gaps: an incomplete secret-isolation guard in the test harness, a real coverage gap in a function that gates who receives notifications, and a few documentation/quality nits.

## Warnings

### WR-01: Test harness doesn't neutralize SMTP/admin-email env vars before seeding a real on-disk DB

**File:** `backend/test/setup.js:14-24`, `backend/src/db.js:100-111`, `backend/test/helpers/tmpDb.js`
**Issue:** `setup.js` guards `JWT_SECRET`, `DB_PATH`, and `AGENDOR_TOKEN` (only sets them if absent), but does not guard `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, or `ADMIN_EMAIL`. `db.js` seeds `config` defaults from exactly those env vars on every load (lines 100-111), including `smtp_pass`. `db.dedup.test.js` uses the new `DB_PATH` seam to point the singleton connection at a **real file** in `os.tmpdir()` (`helpers/tmpDb.js`) rather than `:memory:`. If a developer's or CI runner's shell already has real `SMTP_PASS`/`ADMIN_EMAIL` exported (common when secrets are injected as env vars for other tooling in the same job), those values get written verbatim into a SQLite file in the shared, potentially world-readable OS temp directory. Cleanup is best-effort (`after()` hook, `cleanup()` swallows errors) and will not run if the test process is killed or crashes before the hook fires.
**Fix:** Extend `setup.js` to also default-guard the SMTP/admin env vars to inert test values, e.g.:
```js
for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'ADMIN_EMAIL']) {
  if (!process.env[k]) process.env[k] = '';
}
```
placed before any test requires `../src/db`.

### WR-02: `getDealsWithFutureTasks` — a core "who is notified" gate — has zero test coverage

**File:** `backend/src/agendor.js:171-204`
**Issue:** `scheduler.js` uses exactly two functions from `agendor.js` to decide notification eligibility: `shouldNotifyOwner` (funnel exclusion, covered by `agendor.funnel.test.js`) and `getDealsWithFutureTasks` (deals with an open, non-finished task due in the future are skipped — `scheduler.js:31,73,232`). The latter is completely untested; `c8` reports 0% coverage for lines 173-204. Given the project's stated Core Value for this phase — "nunca mais uma regressão silenciosa nas regras de quem é notificado" — this is a real gap in the safety net: a regression in the future-task exclusion logic (e.g., an off-by-one in the `dueDateGt`/`now` comparison, or the pagination `break` condition) would not be caught by any pinned test.
**Fix:** Add a characterization test file (e.g. `agendor.futureTasks.test.js`) using the existing `installFakeAxios` helper to pin: (a) a task with `finishedAt` null and `dueDate` in the future → deal id included in the returned `Set`; (b) a finished task → excluded; (c) a task with `dueDate` in the past → excluded; (d) pagination stop condition (`tasks.length < 100`).

### WR-03: No enforced coverage threshold — the new safety net can silently erode

**File:** `backend/.c8rc.json`, `backend/package.json:12`
**Issue:** `.c8rc.json` has no `check-coverage`, `lines`, `branches`, `functions`, or `statements` threshold, and `test:coverage` only reports — it never fails the process on regression. A future change could remove or weaken a characterization test (or add new notification-eligibility logic without a golden) and neither `npm test` nor `npm run test:coverage` would signal it.
**Fix:** Add minimum thresholds scoped to the files this phase actually pins, e.g.:
```json
{
  "check-coverage": true,
  "lines": 60,
  "per-file": true
}
```
or, more precisely, use `--include` scoped to `agendor.js`/`db.js`/`auth.js` critical-path functions if a repo-wide threshold is too strict for files intentionally left uncovered in this phase.

## Info

### IN-01: Stale comment — fixture is described as "untracked" but is already committed

**File:** `backend/test/agendor.realsample.test.js:5-6`, `backend/scripts/capture-fixtures.js:13`
**Issue:** Both files state the anonymized fixture "permanece UNTRACKED até a aprovação humana" / "commit ... é feito por outra etapa APÓS revisão humana (checkpoint)". `backend/test/fixtures/real-deals.sample.json` is already committed (`git log` shows commit `13b89e1 test(01-02): add anonymized real-deal realism fixture`). Content was manually verified anonymized (no PII), so this is not a security issue — but the comments now describe a governance step that has already happened, which could confuse a future reader trying to understand the approval workflow.
**Fix:** Update the comments to reflect the post-approval state, or move the pending-approval language to the PR/commit description rather than the source comment.

### IN-02: `DB_PATH` test seam is undocumented as a supported (or unsupported) production knob

**File:** `backend/src/db.js:4`
**Issue:** `DB_PATH` is a new environment-variable override with no mention in `backend/.env.example` or deployment docs. It is currently only consumed by tests, but nothing prevents an operator from setting it in production `.env`, and there's no comment in `db.js` clarifying its intended scope (test-only seam vs. supported config).
**Fix:** Add a one-line comment above `dbPath` clarifying it exists for test isolation (link to `test/helpers/tmpDb.js`) and is not an officially supported production setting, per the project's "explain the why" comment convention.

### IN-03: Test helpers/setup files show up as vacuous "passing tests" under `node --test`'s default discovery

**File:** `backend/test/setup.js`, `backend/test/helpers/fakeAxios.js`, `backend/test/helpers/tmpDb.js`
**Issue:** Node's `--test` runner treats every `.js` file under a directory named `test` (recursively) as a test file by default. Running `npm test` confirms `setup.js`, `helpers/fakeAxios.js`, and `helpers/tmpDb.js` each appear as their own zero-assertion "ok" entries in the TAP output (e.g. `ok 7 - test/helpers/fakeAxios.js`). Harmless today (no side effects at import time), but it inflates the visible test count and could make a genuinely broken helper (e.g. a syntax error) surface as a confusingly-named top-level "test failure" rather than a clear module-load error.
**Fix:** Either move helpers outside the `test/` tree convention Node auto-discovers (e.g. `test/_helpers/` is still matched — use a `--test-name-pattern` / explicit glob in the `test` script instead), or accept this as a known quirk and document it in a comment in `setup.js`.

### IN-04: Fragile regex literal (pre-existing, explicitly flagged as "do not rewrite")

**File:** `backend/src/agendor.js:72`
**Issue:** `isExcludedStage` normalizes accents via `.replace(/[̀-ͯ]/g, '')`, a character class whose range bounds are literal Unicode combining-mark characters embedded directly in the source rather than `̀`/`ͯ` escapes. This is invisible in most editors and fragile to any encoding/whitespace-tool mangling. The extraction comment correctly flags this as intentionally preserved byte-for-byte from the original inline code (not introduced by this phase), so this is not a regression — just a pre-existing quality debt now made more visible since the logic lives in its own named function.
**Fix:** In a future *behavior-preserving* cleanup (separate from this phase, per project constraints), add a test asserting `isExcludedStage` output is unchanged, then rewrite the regex using explicit Unicode escapes (`/[\u0300-\u036f]/g`, the combining diacritical marks block) instead of literal combining characters, for auditability, and remove the "não reescrever" warning once covered.

---

_Reviewed: 2026-07-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
