---
phase: 1
slug: rede-de-testes-safety-net
status: draft
nyquist_compliant: false
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

> Task IDs populated by the planner; this maps requirements → verification approach (from RESEARCH.md two-lane strategy).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | TEST-01 | — | `npm test` runner configured, exits 0 | infra | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | TEST-02 | — | getStaleDeals rules fixed (threshold/category/stage/owner/funnel) | unit + integrated (axios stub + mock.timers) | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | TEST-03 | — | same deal not notified twice/day (alreadyNotifiedToday) | integration (tempfile SQLite) | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | TEST-04 | — | funnel suppression `beefor` exact-string quirk fixed | unit (pure) | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | TEST-05 | — | rate-limit Map + bcrypt verifyPassword covered | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/package.json` — add `test` (`node --test`) and `test:coverage` (`c8 node --test`) scripts
- [ ] `c8@12` devDependency installed (human-verify checkpoint per RESEARCH — `[ASSUMED]` package)
- [ ] `backend/.c8rc.json` — report-only coverage config (no thresholds in Phase 1)
- [ ] `backend/test/setup.js` — preset `JWT_SECRET`, `DB_PATH`, `AGENDOR_TOKEN` BEFORE any require (auth.js/secret.js fail-fast + ensureDefaultUsers)
- [ ] Seam: `backend/src/db.js` — `process.env.DB_PATH || <default>` (default unchanged)
- [ ] Seam: `backend/src/agendor.js` — export `getDealType` + pure `isExcludedStage` (byte-preserving normalization)
- [ ] Seam: `backend/src/routes/auth.js` — export `checkRateLimit`/`recordFailedAttempt`/`clearAttempts` + `verifyPassword`
- [ ] `.gitignore` — exclude raw fixture captures + token; commit only anonymized `*.sample.json`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| c8 package legitimacy | TEST-01 | slopcheck offline; `[ASSUMED]` per RESEARCH | Verify `c8` on npm registry + no postinstall script before install |
| Real-deal fixture anonymization | TEST-02 | One-time capture uses live token + real PII | Human confirms committed `*.sample.json` has no PII and no token before commit |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
