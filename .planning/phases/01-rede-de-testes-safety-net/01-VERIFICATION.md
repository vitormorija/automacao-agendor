---
phase: 01-rede-de-testes-safety-net
verified: 2026-07-24T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 01: Rede de Testes (Safety-Net) Verification Report

**Phase Goal:** Existe uma rede de testes automatizados que fixa o comportamento ATUAL da lógica crítica de notificação, permitindo detectar regressões antes de qualquer mudança de hardening ou refatoração.
**Verified:** 2026-07-24
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm test` no backend executa com um runner configurado e passa, local e em CI (TEST-01) | ✓ VERIFIED | `cd backend && export PATH="$HOME/bin:$PATH" && npm test` → `node --test`, **28 pass, 0 fail**, ~0.4s, no network I/O (deterministic, CI-safe). `package.json` scripts: `"test": "node --test"`, `"test:coverage": "c8 --reporter=text --reporter=lcov node --test"`. `npm run test:coverage` also ran green with a real text+lcov report (c8@12 devDependency present, report-only, no threshold gate — matches D-02/Phase-1 scope). No `.github/workflows` exists yet, but REQUIREMENTS.md TEST-01 wording is "executável em CI e local" (script must be CI-callable, not that a CI pipeline exists — CI wiring is explicitly Phase 2 / CI-01, CI-02 per ROADMAP and 01-CONTEXT.md "Fora de escopo: CI (Fase 2...)"). |
| 2 | Testes de caracterização de getStaleDeals() cobrem inclusão/exclusão por threshold de dias, categoria, stage, owner e funil, e passam contra o comportamento atual (TEST-02) | ✓ VERIFIED | `backend/test/agendor.getStaleDeals.test.js` drives the REAL `getStaleDeals()` through a stubbed `axios.create` (installed before `require('../src/agendor')`) with `mock.timers` pinned at `2026-06-01T00:00:00.000Z`. Golden assertion `assert.deepStrictEqual(ids, [101, 103])` over a 10-deal synthetic fixture (`test/fixtures/synthetic/deals-page.json`) covering: pre-2026 exclusion, fresh exclusion, category exclusion ('Parceiro'), owner exclusion ('Maria Lobato'), status-id exclusion, and stage exclusion. A dedicated **day-boundary golden** asserts the exact-cutoff deal (id 102) is EXCLUDED and the cutoff-1ms deal (id 103) is INCLUDED — pins the strict `<` comparison at agendor.js so a `<`→`<=` regression fails the suite. `backend/test/agendor.pure.test.js` separately pins `isExcludedStage` (incl. the 'Perdão de contrato' substring quirk) and `getDealType` classification. `git show a82a1e7` confirms the extraction of `isExcludedStage`/`getDealType` is byte-for-byte behavior-preserving (diacritics regex copied verbatim, line-117-equivalent `<` comparison untouched). |
| 3 | Teste confirma que o mesmo deal não é notificado duas vezes no mesmo dia (alreadyNotifiedToday) (TEST-03) | ✓ VERIFIED | `backend/test/db.dedup.test.js` (3 cases, all pass): (a) `logNotification({status:'sent'})` today → `alreadyNotifiedToday(id) === true`; (b) no row → `false`; (c) a row seeded via a SECOND better-sqlite3 connection to the same temp file with `sent_at = yesterday` → `alreadyNotifiedToday(id) === false`, pinning the day-boundary. Runs against a real SQLite temp file (`test/helpers/tmpDb.js`, `os.tmpdir()`-based), `DB_PATH` set before `require('../src/db')`; `after()` closes + deletes the temp file. `backend/agendor.db` is never touched (verified: DB_PATH points to `os.tmpdir()`, default path only used when env unset). |
| 4 | Teste fixa a supressão por funil (shouldNotifyOwner / NO_OWNER_NOTIFY_FUNNELS = "beefor") (TEST-04) | ✓ VERIFIED | `backend/test/agendor.funnel.test.js` (6 assertions, pure, zero-mock, no `agendor.js` edits — `shouldNotifyOwner` was already exported): `'beefor'`/`'Beefor'`/`' beefor '` → suppressed (false); `'beefor vendas'`/`'beeforx'` → NOT suppressed (true, exact-match quirk pinned as current behavior); `null`/`{}` → not suppressed (true). `git diff --name-only` for this plan's commit (`af99d3c`) lists only the test file — no source change. |
| 5 | Testes cobrem rate-limit de login e verificação de senha (TEST-05) | ✓ VERIFIED | `backend/test/auth.test.js` (6 assertions, all pass): 4 failed attempts → not blocked, 5th → blocked; `checkRateLimit` reports `blocked:true` + `minutesLeft` after the 5th; `mock.timers.tick(15*60*1000+1)` past the window → not blocked; `clearAttempts(ip)` releases immediately. `verifyPassword` covered for bcrypt match/no-match (real `bcrypt.hash` generated in-test) and legacy plaintext match/no-match (documents the `$2` discriminator). `git show 29ef2b1` confirms `verifyPassword` extraction is a verbatim DRY of the two duplicated compares (login + change-password) with the `$2` discriminator preserved exactly, plus non-invasive export attachments (`checkRateLimit`, `recordFailedAttempt`, `clearAttempts`, `verifyPassword`, `_loginAttempts`) that Express ignores on `module.exports = router`. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/package.json` | `test` + `test:coverage` scripts | ✓ VERIFIED | `"test": "node --test"`, `"test:coverage": "c8 --reporter=text --reporter=lcov node --test"`, `c8: ^12.0.0` devDependency |
| `backend/.c8rc.json` | report-only coverage config | ✓ VERIFIED | `all:true`, `include: src/**/*.js`, `exclude: test/**, src/index.js`, reporters text+lcov, no `check-coverage` threshold (intentional per D-02) |
| `backend/test/setup.js` | presets JWT_SECRET/DB_PATH/AGENDOR_TOKEN before any require | ✓ VERIFIED | side-effect-only, guarded (only-when-unset) assignments |
| `backend/test/smoke.test.js` | trivial passing test | ✓ VERIFIED | passes as part of the 28-test suite |
| `backend/src/db.js` | DB_PATH env seam, default unchanged | ✓ VERIFIED | `git show 08840aa` — default arm byte-identical (`path.join(__dirname, '..', 'agendor.db')`) |
| `backend/test/agendor.pure.test.js` | pure-lane characterization | ✓ VERIFIED | 42 lines, 6+ assertions, `isExcludedStage`/`getDealType` pinned incl. quirk |
| `backend/test/agendor.getStaleDeals.test.js` | integrated-lane characterization | ✓ VERIFIED | 71 lines, drives real `getStaleDeals` via fakeAxios + mock.timers, day-boundary golden present |
| `backend/test/fixtures/synthetic/deals-page.json` | one-per-rule synthetic deals incl. boundary cases | ✓ VERIFIED | 10 deals covering every exclusion rule + cutoff/cutoff±1ms |
| `backend/test/helpers/fakeAxios.js` | axios.create mock installer | ✓ VERIFIED | 15 lines, `mock.method(axios,'create',...)` |
| `backend/test/fixtures/real-deals.sample.json` | anonymized real-deal fixture, PII-free | ✓ VERIFIED | Committed (`13b89e1`) only after human approval checkpoint; content is 100% synthetic labels (Deal N/Owner N/Author N/Org N), no email/token/phone/CPF found by grep |
| `backend/test/helpers/tmpDb.js` | temp-file DB path + cleanup | ✓ VERIFIED | 46 lines, `makeTmpDbPath()` + `openRaw()` + cleanup, no test() calls |
| `backend/test/db.dedup.test.js` | alreadyNotifiedToday characterization incl. day boundary | ✓ VERIFIED | 78 lines, 3 cases (today/none/yesterday) |
| `backend/test/agendor.funnel.test.js` | beefor suppression characterization | ✓ VERIFIED | 44 lines, 6 assertions incl. both quirk cases |
| `backend/src/routes/auth.js` | verifyPassword extracted + rate-limit helpers exported | ✓ VERIFIED | `git show 29ef2b1` — DRY extraction + export attachments, `$2` discriminator verbatim |
| `backend/test/auth.test.js` | rate-limit + password verification characterization | ✓ VERIFIED | 87 lines, 6 assertions |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `test/setup.js` | `src/db.js` | `process.env.DB_PATH` read at load | ✓ WIRED | Confirmed via `git show 08840aa`, and dedup/auth tests set `DB_PATH` before requiring `db.js` |
| `package.json scripts.test` | node:test runner | `node --test` | ✓ WIRED | Ran directly: 28/28 pass |
| `test/agendor.getStaleDeals.test.js` | `agendor.js getStaleDeals` | fakeAxios installed BEFORE require | ✓ WIRED | Confirmed by reading the test file — `installFakeAxios(...)` called before `require('../src/agendor')` |
| `agendor.js getStaleDeals` | `isExcludedStage` | inline call replacing former inline logic | ✓ WIRED | `git show a82a1e7` shows the inline replaced with `isExcludedStage(deal.dealStage?.name)` |
| `.gitignore` | raw fixture captures + token | ignore entries before first fixture commit | ✓ WIRED | `.gitignore` hardened in plan 01-02 Task 3, before Task 4's fixture commit |
| `test/agendor.funnel.test.js` | `agendor.js shouldNotifyOwner` | already-exported pure predicate | ✓ WIRED | No source edit needed/made; test imports and calls it directly |
| `test/auth.test.js` | `auth.js` exports | `checkRateLimit`/`recordFailedAttempt`/`clearAttempts`/`verifyPassword`/`_loginAttempts` | ✓ WIRED | Confirmed present via boot-check one-liner and by running the test suite |
| `auth.js login + change-password` | `verifyPassword` | both duplicated compares replaced | ✓ WIRED | `git show 29ef2b1` — both call sites now call `verifyPassword(user.password, ...)` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite green | `cd backend && npm test` | `28 pass, 0 fail`, ~0.4s | ✓ PASS |
| Coverage report runs (report-only) | `npm run test:coverage` | Exits 0, text+lcov report emitted (agendor.js 65%, db.js 61%, auth.js 44% line coverage on the touched files — expected since coverage is intentionally scoped report-only, no threshold, in Phase 1) | ✓ PASS |
| Day-boundary golden genuinely discriminates | Read `test/agendor.getStaleDeals.test.js` assertions | `assert.equal(ids.includes(102), false)` / `assert.equal(ids.includes(103), true)` against a pinned clock — would fail if `<` were changed to `<=` | ✓ PASS |
| Src seams are behavior-preserving (not silent logic changes) | `git show` on 08840aa (db.js), a82a1e7 (agendor.js), 29ef2b1 (auth.js) | Every diff is either an added function (pure, byte-copied logic) + export attachment, or a `||`-defaulted env override with an unchanged fallback arm | ✓ PASS |
| Real-deal fixture contains no PII/token | `grep -iE "token|@|gmail|CPF|CNPJ" test/fixtures/real-deals.sample.json` | No output (no matches) | ✓ PASS |
| Fixture commit gated by human approval | `git log --oneline -- test/fixtures/real-deals.sample.json` | Single commit `13b89e1`, dated after the Task 1-3 commits of plan 01-02 (post-approval per SUMMARY) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TEST-01 | 01-01 | Test runner configurado no backend, script `test` executável em CI e local | ✓ SATISFIED | `node --test` wired, green, deterministic, network-free — CI-callable as-is; actual CI pipeline wiring is explicitly Phase 2 scope (CI-01/CI-02) |
| TEST-02 | 01-02 | Caracterização de getStaleDeals() (threshold, categoria, stage, owner, funil) | ✓ SATISFIED | pure + integrated lane goldens, incl. day-boundary; extraction verified behavior-preserving |
| TEST-03 | 01-03 | Dedup do mesmo dia (alreadyNotifiedToday) | ✓ SATISFIED | 3-case golden on real temp-file SQLite, day-boundary pinned |
| TEST-04 | 01-04 | Supressão por funil (shouldNotifyOwner / beefor) | ✓ SATISFIED | 6-assertion golden incl. exact-match quirks, zero source edit |
| TEST-05 | 01-05 | Rate-limit de login + verificação de senha | ✓ SATISFIED | 6-assertion golden, bcrypt + legacy plaintext, block/expiry/clear |

No orphaned requirements found — REQUIREMENTS.md maps exactly TEST-01..TEST-05 to Phase 1, and all five are claimed by a plan and independently verified above.

### Anti-Patterns Found

No BLOCKER-level anti-patterns. `grep -n -E "TBD|FIXME|XXX"` across all phase-touched `src/` and `test/` files returned zero matches. No `console.log`-only stub handlers, no hardcoded empty-array/`return null` stubs found in the touched source seams — all three src changes (`db.js`, `agendor.js`, `auth.js`) are additive/extractive and independently confirmed byte-preserving via `git show`.

Three non-blocker findings were raised by the independent code review (`01-REVIEW.md`, `status: issues_found`, 0 critical / 3 warning / 4 info) and are surfaced here for visibility, not as phase-blocking gaps (none map to a TEST-01..05 truth or ROADMAP success criterion):

| File | Severity | Finding | Impact |
|------|----------|---------|--------|
| `backend/test/setup.js` | ⚠️ Warning (non-blocking) | Does not neutralize `SMTP_HOST/PORT/USER/PASS/FROM`/`ADMIN_EMAIL` before `db.dedup.test.js` seeds a **real on-disk temp file** (not `:memory:`) — if a dev/CI shell has real SMTP secrets exported, they get written to `os.tmpdir()` (best-effort cleanup only) | Defense-in-depth gap, not a functional test-net gap. Does not affect any TEST-01..05 truth. |
| `backend/src/agendor.js:171-204` (`getDealsWithFutureTasks`) | ⚠️ Warning (non-blocking) | Zero test coverage (0% per c8) on a function `scheduler.js` uses to gate notification eligibility | Out of the phase's declared scope — TEST-02 requirement text and 01-CONTEXT.md phase boundary explicitly cover `getStaleDeals()`'s own rules (threshold/category/stage/owner/funnel), not `getDealsWithFutureTasks`. Real gap for a *future* fast-follow, but not part of this phase's contract. |
| `backend/.c8rc.json` | ⚠️ Warning (non-blocking) | No enforced coverage threshold — safety net could erode silently over time | Explicitly deferred to Phase 2 per D-02/RESEARCH Open Question 2 and 01-01-PLAN.md ("NO coverage thresholds in Phase 1") — matches declared scope, not a gap. |

## Human Verification Required

None. All five success criteria are independently verifiable via code inspection, git diff, and direct test execution — no visual, real-time, or subjective-UX behavior is in scope for this phase.

## Gaps Summary

No gaps block Phase 1 goal achievement. All 5 ROADMAP success criteria (TEST-01..TEST-05) are independently verified against the actual codebase (not SUMMARY claims): the full suite (`node --test`, 28/28) runs green and fast with zero network I/O; every characterization test genuinely discriminates pinned behavior (verified by reading assertions, not just file existence — e.g., the day-boundary goldens for both `getStaleDeals` and `alreadyNotifiedToday` would fail if the underlying comparison operator flipped); and every source seam (`db.js` DB_PATH, `agendor.js` `isExcludedStage`/`getDealType`, `auth.js` `verifyPassword`) was confirmed byte-for-byte behavior-preserving via `git show` diffs, not trusted from SUMMARY narrative. The independent code review found 0 critical/blocker issues; its 3 warnings are pre-existing scope boundaries (coverage thresholds deferred to Phase 2, `getDealsWithFutureTasks` outside TEST-02's declared scope) or defense-in-depth nits (SMTP env leakage into a temp file) that do not affect any of the five required truths for this phase.

---

*Verified: 2026-07-24*
*Verifier: Claude (gsd-verifier)*
