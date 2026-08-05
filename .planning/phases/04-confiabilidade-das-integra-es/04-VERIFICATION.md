---
phase: 04-confiabilidade-das-integra-es
verified: 2026-08-05T17:51:00Z
status: passed
score: 8/8 must-haves verified (Success Criteria) + 6/6 requirements (REL-01..REL-06) traced
overrides_applied: 0
re_verification: false
---

# Phase 4: Confiabilidade das Integrações — Verification Report

**Phase Goal:** Integrações de saída (Agendor HTTP, SMTP) e o agendador cron toleram lentidão e
falhas sem travar ou derrubar o sistema.
**Verified:** 2026-08-05T17:51:00Z
**Status:** passed
**Re-verification:** No — initial verification (no prior `04-VERIFICATION.md` existed; the phase's
five reopenings all came from code review, never from a verifier gate).

## Method note

This phase is atypical: 38 plans, five code-review rounds, five reopenings, each closing a
verifiable blocker. Per the orchestrating agent's instructions, every claim below was re-derived
from the codebase directly — `grep`, `Read`, and running the actual test/lint/build commands —
never taken from SUMMARY.md prose. Success Criterion 4 (REL-04) and the CR3-01/CR4-01 extensions to
criteria 7-8 were verified against the **behavioral contract** (decision C9), not against the
`orgCategoryCache` mechanism name that C9 explicitly retired.

## Environment checks (reproduced independently)

| Check | Command | Result |
|---|---|---|
| Backend test suite | `cd backend && npm test` | **196/196 passing**, exit 0 |
| Backend coverage gate | `cd backend && npm run test:coverage` | exit 0; `agendor.js` 100% lines / 92.08% branches; `scheduler.js` 88.79% lines / 79.31% branches — matches claimed figures exactly |
| Backend lint | `cd backend && npm run lint` | exit 0, 44 warnings (documented baseline) |
| Frontend lint | `cd frontend && npm run lint` | exit 0, 60 warnings (documented baseline) |
| Frontend build | `cd frontend && npm run build` | exit 0, `dist/` produced |
| Working tree | `git status --porcelain` | clean |
| Pending todos | `ls .planning/todos/pending/ \| wc -l` | 41 (matches claim) |

## Goal Achievement — Success Criteria (ROADMAP.md, 8 items)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | REL-01: HTTP calls to Agendor (shared instance + ad-hoc `/resolved`) have an explicit, verifiable timeout | ✓ VERIFIED | `backend/src/agendor.js:20-25` — `axios.create({ timeout: 15000, ... })`. The former ad-hoc `axios.get()` in `notifications.js:220` was eliminated: `routes/notifications.js` now calls `getDealById(id)` (`agendor.js:396-410`), which routes through the same 15s-timeout instance. `test/agendor.timeout.test.js` scenario (2) asserts positively that `getDealById` uses the shared instance (relative path) and negatively that the global `axios.get` is never called — a real regression guard against the ad-hoc-call class of bug. |
| 2 | REL-02: SMTP send has a timeout and handles failure without throwing an uncaught exception | ✓ VERIFIED | `backend/src/emailer.js:24-36` — single `createTransporter()` factory sets `connectionTimeout: 10000`, `greetingTimeout: 10000`, `socketTimeout: 30000`, used at all 6 call sites (verified by grep: lines 227, 240, 478, 499, 504, 806). `sendMailWithRetry` (`emailer.js:208-224`) never rethrows — on exhaustion it `return`s `{ success: false, error }`. Covered by `test/emailer.timeout.test.js` and `test/emailer.transporteVivo.test.js`. Note: D-02's original "~1min40s worst case" was superseded in-phase by measured nodemailer 9 per-address-DNS-fallback behavior (Q6) — worst case is `30N+69`s; this correction is documented and a follow-up todo (`rel-02b-deadline-global-smtp.md`) exists with a scoped, non-blocking pendency. |
| 3 | REL-03: A failure in `runCheck`/`runWeeklySummary` is logged and the scheduler stays alive (process doesn't crash) | ✓ VERIFIED | `scheduler.js:545-550` — `catch (err) { results.error = err.message; logger.error(...) } finally { isRunning = false; ... }`, never rethrows. `runWeeklySummary` has an equivalent catch (`scheduler.js:616-618`). Lock-release under failure is the load-bearing detail (a leaked lock silently stops all future notifications) and is directly asserted by `test/scheduler.resilience.test.js` and `test/scheduler.failsafe.test.js`. |
| 4 | REL-04 (redação C9): org-category state is isolated per execution — no execution can read, erase, reuse, or contaminate another's state | ✓ VERIFIED | No module-level cache exists — confirmed by grep (`orgCategoryCache` does not appear anywhere in `agendor.js`; only referenced in comments explaining its removal). `getStaleDeals` creates `const cacheDaExecucao = new Map()` locally (`agendor.js:379`) and passes it by parameter into `getOrgCategory(orgId, cache)` (`agendor.js:108`); the map is garbage-collected with the execution. Both directions of interleaving are pinned by dedicated tests: `test/agendor.cacheConcurrency.test.js` (same-time interleaving) and `test/agendor.cacheInvalidation.test.js` (sequential refetch). This is the behavioral contract, not the retired mechanism name — correctly verified per C9. |
| 5 | REL-05: `'sent'` only written after confirmed send; total failure writes `'error'`, next round retries; dedup of real successes preserved | ✓ VERIFIED | `scheduler.js:287-322` — row inserted as `'pending'`, promoted to `'sent'` only when `houveEnvioConfirmado` (≥1 real success), else `'error'`. Exception path (`scheduler.js:328-399`) inspects `err.resultadosParciais` (two-layer-validated, WR2-04/WR3-03) to decide the same status, and the write-of-outcome itself is guarded by its own try/catch (WR2-02) so a SQLite failure at write time degrades to `'pending'` (fail-safe, C10) rather than aborting the round. Covered by `notificationStatus.*.test.js` (4 files) and `notificationStatus.canalParcial.test.js`. |
| 6 | REL-06: A failure in the future-tasks query aborts the round without notifying — logged, lock released, next round runs | ✓ VERIFIED | `scheduler.js:112-116` — `getDealsWithFutureTasks()` is part of the same `Promise.all` as `getStaleDeals`/`getUsers`; a rejection there propagates to the outer `try` and is caught by the REL-03 catch/finally (registered, lock released, no notification sent). Same fail-safe policy applied by CR3-01 to the org-category query, which now retries at the edge (`fetchWithRetry`) and, on persistent failure, marks the deal `CATEGORIA_INDECIDIVEL` instead of aborting the whole round — verified below (item 7). |
| 7 | REL-06/CR3-01 extension: a deal with undecidable org category is excluded from every owner-directed email (daily + individual weekly) but stays visible in the panel, the admin consolidated report, and the weekly snapshot; the round is not aborted | ✓ VERIFIED | `agendor.js:108-121` `getOrgCategory` retries via `fetchWithRetry`, and on persistent failure caches/returns the sentinel `CATEGORIA_INDECIDIVEL` (never `null`, which is what caused the old fail-open). `scheduler.js:226-233` — deals so marked hit `continue` (skip send) without aborting the `for` loop; `results.stale`/`getStaleDeals` output is untouched so the deal remains in the panel/reports (confirmed: no `categoriaIndecidivel` filter exists in `routes/deals.js`, `routes/reports.js`, or `frontend/src/components/DealsList.jsx` — grep returned zero hits). `emailer.js:796` filters the deal OUT of the individual weekly report (`sendOwnerWeeklySummary`) but `emailer.js:476-495` (`sendWeeklySummary`, admin consolidated) applies **no** such filter — exactly the asymmetric policy the user decided. Oracle: `test/agendor.categoriaIndecidivel.test.js`, `test/scheduler.categoriaIndecidivel.test.js`, `test/emailer.resumoIndecidivel.test.js`. |
| 8 | REL-03/REL-06 observability: a round where **no** deal could be notified due to undecidable category surfaces as a distinguishable error (count + `results.error` field the UI renders + error-level log line); partial suppression stays silent; suppression from another cause (dedup, funnel, no recipient) doesn't trigger it; the manual-send preview marks per-deal who **will** be notified | ✓ VERIFIED | `scheduler.js:164` — `categoriaIndecidivelNaRodada` increments at the **top** of the loop (before any `continue`), fixed by 04-37/WR5-01 specifically so an earlier dedup-guard `continue` cannot make the counter unreachable relative to `results.stale`. `scheduler.js:524-536` — alarm fires only when `categoriaIndecidivelNaRodada === results.stale` (total, not proportional), writes both `results.error` (scalar) and pushes to `results.errors[]` (the array the frontend actually renders), and logs at `logger.error`. Guarded against false triggers on partial suppression (scenario pair L/M in `scheduler.categoriaIndecidivel.test.js`) and against other-cause total suppression. Preview: `runCheckOnly()` (`scheduler.js:662-712`) computes `seraNotificado` per deal using the same four guards as `runCheck`, and `frontend/src/components/Dashboard.jsx:142-143` counts the send button label from `deals.filter(d => d.seraNotificado).length` rather than the raw stale total — confirmed by direct read of the component. |

**Score:** 8/8 Success Criteria verified against code (not SUMMARY prose).

### Requirements Traceability (REQUIREMENTS.md)

| Requirement | REQUIREMENTS.md status | Plan coverage | Verifier finding |
|---|---|---|---|
| REL-01 | Complete | 15+ plans reference it (04-03, 04-09, 04-22, etc.) | ✓ SATISFIED — see SC1 |
| REL-02 | Complete | 04-04, 04-05, 04-17, 04-33 | ✓ SATISFIED — see SC2 |
| REL-03 | Complete | 04-01, 04-07, 04-10, 04-15, 04-23, 04-26, 04-36 | ✓ SATISFIED — see SC3 |
| REL-04 | Complete (redação C9) | 04-07 → superseded by 04-08 → 04-12 (CR2-01 fix) | ✓ SATISFIED — see SC4 |
| REL-05 | Complete | 04-06, 04-10, 04-14, 04-15, 04-16, 04-24 | ✓ SATISFIED — see SC5 |
| REL-06 | Complete | 04-02, 04-11, 04-19, 04-20, 04-21, 04-25, 04-27, 04-28, 04-29, 04-30, 04-37 | ✓ SATISFIED — see SC6/7/8 |

No orphaned requirements: every plan's `requirements:` frontmatter across all 38 plans lists only
REL-01..REL-06 (verified by grep across all `*-PLAN.md`), and REQUIREMENTS.md maps only these six
IDs to Phase 4.

### User decisions honored (spot-checked against code, not against STATE.md prose)

| Decision | Check | Result |
|---|---|---|
| C9 — REL-04 written as behavioral contract, not mechanism | No `orgCategoryCache` in `agendor.js`; cache is execution-local `Map` | ✓ Honored |
| C10 — fail-safe write: row stays `'pending'` on registration failure, next round may resend | `scheduler.js:391-399` — try/catch around `updateNotificationStatus` inside the exception path | ✓ Honored |
| C11 — live SMTP transport carried forward on retry | `sendMailWithRetry` returns `transporteEmUso`, and `sendStaleNotification` passes it forward per destinatário (`emailer.js:294,317`) | ✓ Honored |
| CR3-01 route — undecidable-category deal stays off targeted email, stays on dashboard/reports | See SC7 above | ✓ Honored |
| Weekly summary policy — individual excludes, admin consolidated keeps | `emailer.js:476` (no filter) vs. `emailer.js:796` (filter) | ✓ Honored |
| CR4-01 threshold — TOTAL suppression only, not proportional | `scheduler.js:525-526` — exact equality `categoriaIndecidivelNaRodada === results.stale` | ✓ Honored |
| 04-35 decisions — funnel substring match; fail-open preserved with signal | `agendor.js:199-203` (`includes`, not `===`); `agendor.js:454`/`scheduler.js:143` (`funilAusente`/`funilNaoAvaliado` signal, no behavior change) | ✓ Honored |
| SEC-01 — token risk remains open, never displayed | `.env`/token value not read by this verifier; `test/secrets.grep.test.js` (192-194 in the suite output) actively asserts no secret literal appears in `src/`; todo `sec-01-rotate-agendor-token.md` still pending | ✓ Honored (correctly left open) |

### Data-Flow Trace (Level 4) — the two artifacts most likely to be hollow

| Artifact | Data variable | Source | Produces real data | Status |
|---|---|---|---|---|
| `Dashboard.jsx` send button count | `aNotificarCount` | `checkResult.deals.filter(d => d.seraNotificado)` ← `GET /api/notifications/run/status`-adjacent `checkOnly()` fetch ← `runCheckOnly()` in `scheduler.js`, which computes `seraNotificado` per deal from live guard evaluation (dedup, category, funnel, recipient, notifications-enabled) | Yes — computed per-request from `getStaleDeals`/`getUsers`/`getDealsWithFutureTasks`, not a static default | ✓ FLOWING |
| Total-suppression alarm surfaced in `sendNow()` toast | `result.errors[0]` | `POST /api/notifications/run` → `runCheck()` → `res.json(result)` (unprojected) → `results.errors` array pushed to in `scheduler.js:535` | Yes — array is empty on healthy rounds (asserted by scenario K) and populated with the literal alarm string on total suppression | ✓ FLOWING |

## Anti-Patterns Scan

Scanned the six touched production modules (`agendor.js`, `emailer.js`, `scheduler.js`,
`routes/notifications.js`, `routes/deals.js`, `routes/reports.js`) plus `Dashboard.jsx` for
`TODO|FIXME|HACK|XXX|TBD|placeholder|not implemented`.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | none found in scope | — | No debt markers in phase-touched files. The `TBD/FIXME/XXX` gate is clean. |

Two pre-existing, unrelated `console.log`/`console.warn` calls remain in `emailer.js` (lines noted
in project CLAUDE.md as legacy, explicitly out of Phase 4 scope — deferred to Phase 5 per
`04-CONTEXT.md`'s stated boundary). Not a Phase 4 gap.

## Core Value Assessment

**Core Value (milestone-level):** "Rede de testes automatizados sobre a lógica crítica de
notificação (quem recebe / quem não recebe) — para nunca mais uma regressão silenciosa."

**Judgment: the phase strengthens the Core Value net substantially, with one honestly-declared and
owned weak spot.**

Where the net is strongest:
- Every "who receives / who doesn't" boundary this phase touched or created — the org-category
  undecidable path (CR3-01), the funnel-substring fail-open (04-35), the dedup-vs-registration
  race (WR2-02/C10), the partial-success channel (WR-01/WR2-01/WR2-04/WR3-03) — has a dedicated
  characterization or new-behavior test file, and the "who receives" axis is explicitly declared
  stable since 04-21 by the r5 review, corroborated by five successive reopenings that kept
  finding instrument bugs, not recipient-list regressions, after that point.
- The phase's own review process is itself evidence the net works: every one of the five rounds
  found a real, reproducible defect via the test suite or targeted probes, and every fix shipped
  with a red-before-green pair, often including the deliberately-symmetric or sibling-construct
  scenario (r3's "symmetric scenario" mandate, r4/r5's "sibling inventory" + "reverse direction"
  mandates) that caught defects earlier rounds' own fixes introduced.

Where the net is thinnest (documented, owned, not hidden):
- **WR5-05** (todo, priority alta): three scenarios in `scheduler.categoriaIndecidivel.test.js`
  (H, I, J — exercising the funnel-rename behavior added by 04-35) assert `envios(...) >= 1`
  instead of the exact-equality `=== 1` used by every sibling scenario. Verified directly: lines
  938, 992-995, 1048-1051 of that file use `>= 1`. This means those three scenarios cannot detect
  a duplicate send — the *other* half of "who receives" (not sending an extra email to someone
  already notified) is unmeasured in exactly the cases that exercise the newest behavior change.
  This is a real, currently-open gap in the net's sensitivity, but it is registered with a named
  owner, a priority, and an explicit repro instruction — not silently left for a future verifier
  to rediscover.
- Coverage floor is uneven across files touched by this phase: `db.js` sits at 69.69% lines /
  40.74% functions and `routes/notifications.js` at 67.94% lines — both below the `agendor.js`/
  `scheduler.js` figures this phase drove up. These are pre-existing gaps this phase did not
  worsen (its own coverage numbers on the files it changed most, `agendor.js` and `scheduler.js`,
  are exceptionally high), but they are the honest boundary of "where the net is thin."

Net verdict: the phase delivered materially on the Core Value — the specific notification-decision
logic it modified is now the best-tested code in the repository — while leaving one named,
prioritized, and openly-documented sensitivity gap (WR5-05) rather than a silent one.

## Human Verification Required

None. Every Success Criterion resolved to code-level evidence (source + passing, targeted tests),
and the one UI-facing behavioral fix in this phase (CR5-01 toast text) is pinned by an explicit
backend contract test (`scheduler.resilience.test.js` scenario 6) plus a direct read of the
consuming `Dashboard.jsx` code path, leaving no residual ambiguity that would require a human to
click through the browser to resolve.

## Gaps Summary

No gaps block the phase goal. All 8 ROADMAP Success Criteria, all 6 REL requirements, and every
spot-checked user decision are verified directly against running code and passing tests, not
against SUMMARY.md narrative. The known residual items (`cr4-01b`, the eight r5 todos including
WR5-05, `rel-02b-deadline-global-smtp`, SEC-01) are correctly out of this phase's locked scope per
explicit user decisions recorded in STATE.md and are tracked as owned, prioritized todos rather
than being either silently dropped or wrongly claimed as resolved.

---

_Verified: 2026-08-05T17:51:00Z_
_Verifier: Claude (gsd-verifier)_
