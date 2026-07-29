---
phase: 1
slug: rede-de-testes-safety-net
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-22
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in, Node 20+/verified on 22.13.1) + `node:assert/strict` |
| **Config file** | `backend/.c8rc.json` (coverage) — Wave 0 installs |
| **Quick run command** | `npm test` (→ `node --test`) in `backend/` |
| **Full suite command** | `npm run test:coverage` (→ `c8 node --test`) in `backend/` |
| **Estimated runtime** | ~2–5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm run test:coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

> Populated from the finalized plans (01-01..01-05). Maps requirements → verification approach (RESEARCH.md two-lane strategy).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01 · T1-T3 | 01-01 | 1 | TEST-01 | T-01-SC (c8 install) | `npm test` runner wired, exits 0; c8 report-only coverage | infra | `npm test` | ❌ W0 | ⬜ pending |
| 01-02 · T1 | 01-02 | 2 | TEST-02 | T-02-04 | pure lane: isExcludedStage / getDealType quirks pinned (byte-preserving seam) | unit (pure) | `node --test test/agendor.pure.test.js` | ❌ W0 | ⬜ pending |
| 01-02 · T2 | 01-02 | 2 | TEST-02 | T-02-03, T-02-05 | integrated lane: threshold/cutoff-boundary(`<`)/category/owner/status via axios stub + mock.timers | unit + integration | `node --test test/agendor.getStaleDeals.test.js` | ❌ W0 | ⬜ pending |
| 01-02 · T3 | 01-02 | 2 | TEST-02 | T-02-01, T-02-02 | anonymized real-deal realism smoke through getStaleDeals; fixture uncommitted until approval | integration (smoke) | `npm test` + guard grep | ❌ W0 | ⬜ pending |
| 01-02 · T4 | 01-02 | 2 | TEST-02 | T-02-01, T-02-02 | human-verify gates the FIRST commit of the anonymized fixture (no PII/token) | manual gate | git status/log check (see Manual-Only) | ❌ W0 | ⬜ pending |
| 01-03 · T* | 01-03 | — | TEST-03 | — | dedup `alreadyNotifiedToday` incl. day-boundary (tempfile SQLite) | integration | `node --test test/db.dedup.test.js` | ❌ W0 | ⬜ pending |
| 01-04 · T* | 01-04 | — | TEST-04 | — | funnel suppression `beefor` exact-string quirk pinned (pure) | unit (pure) | `node --test test/agendor.pure.test.js` | ❌ W0 | ⬜ pending |
| 01-05 · T* | 01-05 | — | TEST-05 | — | rate-limit Map + bcrypt verifyPassword covered (mock.timers) | unit | `node --test test/auth.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs for 01-01 / 01-03 / 01-04 / 01-05 use `T*` where those plans' internal task numbering owns the requirement; TEST-01..05 each map to exactly one plan's `requirements` (TEST-01→01-01, TEST-02→01-02, TEST-03→01-03, TEST-04→01-04, TEST-05→01-05).*

---

## Wave 0 Requirements

- [ ] `backend/package.json` — add `test` (`node --test`) and `test:coverage` (`c8 node --test`) scripts
- [ ] `c8@12` devDependency installed (human-verify checkpoint per RESEARCH — `[ASSUMED]` package)
- [ ] `backend/.c8rc.json` — report-only coverage config (no thresholds in Phase 1)
- [ ] `backend/test/setup.js` — preset `JWT_SECRET`, `DB_PATH`, `AGENDOR_TOKEN` BEFORE any require (auth.js/secret.js fail-fast + ensureDefaultUsers)
- [ ] Seam: `backend/src/db.js` — `process.env.DB_PATH || <default>` (default unchanged)
- [ ] Seam: `backend/src/agendor.js` — export `getDealType` + pure `isExcludedStage` (byte-preserving normalization)
- [ ] Seam: `backend/src/routes/auth.js` — export `checkRateLimit`/`recordFailedAttempt`/`clearAttempts` + `verifyPassword`
- [ ] `.gitignore` — exclude raw fixture captures + token; commit only anonymized `*.sample.json` (after human-verify)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| c8 package legitimacy | TEST-01 | slopcheck offline; `[ASSUMED]` per RESEARCH | Verify `c8` on npm registry + no postinstall script before install |
| Real-deal fixture anonymization + commit gate | TEST-02 | One-time capture uses live token + real PII; a committed fixture cannot be cleanly removed without a git history rewrite | 01-02 Task 4: confirm fixture is untracked (`git status`/`git log`), contains no PII (names/org/title/email/phone/CPF) and no token, THEN approve → commit is the checkpoint's resume action |

---

## Validation Sign-Off

- [x] All auto tasks have a concrete `<automated>` verify command (or Wave 0 dependency); no auto task relies on manual-only verification
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (each 01-02 auto task has a `node --test`/`npm test` command)
- [x] Wave 0 covers all MISSING references (setup.js, fakeAxios, tmpDb, fixtures, .c8rc.json, seams, c8 install)
- [x] No watch-mode flags (all commands are single-shot `node --test` / `npm test`; no `--watch`)
- [x] No full end-to-end suite gate (runCheck e2e deferred per RESEARCH Open Question 1)
- [x] Feedback latency < 5s (whole suite is unit/in-memory)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
