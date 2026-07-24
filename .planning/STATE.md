---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Phase 2 context gathered
last_updated: "2026-07-24T19:46:39.935Z"
last_activity: 2026-07-24 -- Quick task 260724-lea (WR-01 fix, 28/28 verde); WR-02/WR-03 dobrados na Phase 2
progress:
  total_phases: 8
  completed_phases: 1
  total_plans: 5
  completed_plans: 5
  percent: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-22)

**Core value:** Rede de testes automatizados sobre a lógica crítica de notificação (quem recebe / quem não recebe) — para nunca mais uma regressão silenciosa.
**Current focus:** Phase 2 — toolchain de qualidade & ci

## Current Position

Phase: 2
Plan: Not started
Status: Ready to plan
Last activity: 2026-07-24 -- Quick task 260724-lea (WR-01 fix, 28/28 verde); WR-02/WR-03 dobrados na Phase 2

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 15 | 3 tasks | 7 files |
| Phase 01 P02 | 45 | 4 tasks | 8 files |
| Phase 01 P03 | 12 | 2 tasks | 2 files |
| Phase 01 P04 | 6 | 1 tasks | 1 files |
| Phase 01 P05 | 10 | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Milestone]: Testes de caracterização antes de qualquer refatoração ou mudança de segurança (rede de segurança primeiro)
- [Milestone]: Mudanças que alteram comportamento (SEC-03/04/05) só entram com teste do novo fluxo, ou adiadas com justificativa documentada
- [Milestone]: "DONE" exige CI verde, zero segredos hardcoded e testes críticos passando
- [Phase ?]: [01-01]: Test runner nativo node:test (D-01/D-03), zero dependência de runtime nova
- [Phase ?]: [01-01]: Cobertura via c8@12 report-only (D-02); thresholds adiados para Phase 2
- [Phase ?]: [01-01]: Seam DB_PATH em db.js isola testes do backend/agendor.db; default de produção byte-idêntico (D-07)
- [Phase 01]: getStaleDeals caracterizado por two-lane (pure + integrated via stub axios); comparacao estrita do day-boundary pinada por golden — D-04/D-05/D-09: rede de seguranca contra regressao silenciosa nas regras de quem e notificado
- [Phase 01]: Fixture real-deal anonimizada commitada so apos aprovacao humana, sem reescrita de historico git — D-10: token/PII nunca entram no historico antes da revisao (checkpoint blocking-human)
- [Phase 01]: [01-03]: SQLite real em tempfile (nao :memory:) para o caso day-boundary da dedup via segunda conexao ao mesmo arquivo — D-08: viabiliza semear sent_at do passado sem tocar backend/agendor.db
- [Phase ?]: [01-04]: Quirk de match exato do funil beefor (near-miss NAO suprimido) pinado como comportamento ATUAL

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

- `wr-02-cover-getdealswithfuturetasks` (→ Phase 2) — caracterização de `getDealsWithFutureTasks` (0% coberto; usado pelo scheduler para decidir quem é notificado)
- `wr-03-enforce-coverage-thresholds` (→ Phase 2) — thresholds de cobertura (c8 `check-coverage`) integrados ao CI

### Blockers/Concerns

[Issues that affect future work]

- Node.js não está instalado no sistema (binários em `/tmp`, wrappers em `~/bin`); considerar ao configurar test runner/CI localmente
- Frontend e backend têm `package.json` separados (sem workspaces); toolchain (Phase 2) precisa cobrir os dois

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260724-lea | Fix WR-01: neutralizar SMTP_PASS/ADMIN_EMAIL no setup de testes | 2026-07-24 | cd050e1 | [260724-lea-fix-wr-01-neutralize-smtp-pass-and-admin](./quick/260724-lea-fix-wr-01-neutralize-smtp-pass-and-admin/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-24T19:46:39.926Z
Stopped at: Phase 2 context gathered
Resume file: .planning/phases/02-toolchain-de-qualidade-ci/02-CONTEXT.md
