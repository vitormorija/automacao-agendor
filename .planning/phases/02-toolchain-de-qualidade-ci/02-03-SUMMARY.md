---
phase: 02-toolchain-de-qualidade-ci
plan: 03
subsystem: ci
tags: [ci, github-actions, coverage, c8, gate, toolchain, supply-chain]

# Dependency graph
requires:
  - phase: 02-01
    provides: "caracterização getDealsWithFutureTasks (WR-02) — fecha a lacuna antes de flipar o gate"
  - phase: 02-02
    provides: "scripts lint/format/test + Biome baseline warn-tolerante (npm run lint exit 0 nos dois pacotes)"
provides:
  - ".github/workflows/ci.yml — pipeline com 2 jobs paralelos (backend, frontend), node 20, least-privilege"
  - "gate de cobertura c8 ativo (.c8rc.json check-coverage:true) sem falhar o estado atual"
  - "ids de job backend/frontend = contextos dos required status checks (base para CI-02 em 02-04)"
affects: [02-04, branch-protection, ci-gate-proof]

# Tech tracking
tech-stack:
  added:
    - "actions/checkout@v7 (GitHub Action — major atual confirmada, A1)"
    - "actions/setup-node@v7 (GitHub Action — major atual confirmada, A1)"
  patterns:
    - "CI 2 jobs paralelos, working-directory por pacote, cache npm por lockfile (sem workspaces)"
    - "Coverage gate measure-first: pisos medidos logo abaixo do observado (per-file:false)"
    - "Least-privilege workflow: permissions contents:read (nenhum secret referenciado)"

key-files:
  created: [".github/workflows/ci.yml"]
  modified: ["backend/.c8rc.json"]

key-decisions:
  - "actions/checkout e setup-node pinados @v7 (não @v4 do skeleton) — majors atuais confirmadas via gh api (A1); v4 está 3 majors atrás"
  - "Pisos de cobertura measure-first: lines/statements 20 (obs 23.32), functions 20 (obs 24.61), branches 60 (obs 65.48) — margem contra flutuação"
  - "per-file:false (NÃO o per-file:true/lines:60 do todo — falharia nos arquivos intencionalmente descobertos: scheduler.js, routes/*, middleware/auth.js a 0%)"
  - "Gate cobre 4 métricas (lines+statements+functions+branches) para a rede de segurança não erodir em silêncio (T-2-03-04)"

patterns-established:
  - "CI de 2 jobs least-privilege, cache por lockfile, id do job == contexto do status check (Pitfall 3)"
  - "Coverage gate declarativo no .c8rc.json — mesmo comando (npm run test:coverage) reporta e bloqueia"

requirements-completed: [CI-01, WR-03]

# Metrics
duration: 6min
completed: 2026-07-24
---

# Phase 2 Plan 03: CI Pipeline + Gate de Cobertura Summary

**Pipeline de CI (.github/workflows/ci.yml) com 2 jobs paralelos (backend, frontend) em node 20 e least-privilege, mais o flip measure-first do gate de cobertura c8 (.c8rc.json check-coverage:true, pisos logo abaixo do observado) — a rede de segurança da Fase 1 agora não erode em silêncio e cada PR passa a rodar lint+testes(+coverage)+build.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-24
- **Completed:** 2026-07-24
- **Tasks:** 2 (2 commits — um por task)
- **Files modified:** 2 (1 criado: ci.yml; 1 modificado: .c8rc.json)

## Accomplishments
- `.github/workflows/ci.yml` criado: `name: CI`, `on: pull_request + push(branches:[main])`, `permissions: contents: read` (least-privilege — nenhum secret referenciado, T-2-03-01/03).
- Dois jobs com ids EXATAMENTE `backend` e `frontend` (sem `name:` custom → id vira o contexto do status check, Pitfall 3), `runs-on: ubuntu-latest`, `defaults.run.working-directory` por pacote.
- Steps backend: `checkout@v7` → `setup-node@v7` (node 20, cache npm, `cache-dependency-path: backend/package-lock.json`) → `npm ci` → `npm run lint` → `npm run test:coverage`.
- Steps frontend: os mesmos + `npm run build` (vite) no lugar de coverage.
- `biome lint .` via `npm run lint` (warn-tolerante); NENHUM `biome ci` nem `--error-on-warnings` (Pitfall 2 — baseline warn D-06 não pode falhar o CI).
- Gate de cobertura c8 flipado (WR-03): `.c8rc.json` com `check-coverage:true`, `per-file:false` e pisos `lines/statements:20`, `functions:20`, `branches:60` — todos logo abaixo do observado; `npm run test:coverage` sai exit 0 no estado atual.

## Task Commits

1. **Task 1: .github/workflows/ci.yml (2 jobs paralelos, CI-01)** - `c2093cc` (feat)
2. **Task 2: flip do gate de cobertura c8 (WR-03, measure-first)** - `de2cc92` (feat)

**Plan metadata:** (final docs commit — este SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified
- `.github/workflows/ci.yml` - **criado.** Pipeline CI 2 jobs (backend/frontend), node 20, cache por lockfile, `permissions: contents: read`. Scripts corretos por job; sem `biome ci`/`--error-on-warnings`.
- `backend/.c8rc.json` - **modificado.** +`check-coverage:true`, `per-file:false`, `lines:20`, `statements:20`, `functions:20`, `branches:60`. Chaves originais (`all`/`include`/`exclude`/`reporter`) preservadas.

## Medição de cobertura (measure-first, WR-03)

`cd backend && npm run test:coverage` — 35/35 testes verde. Aggregate observado ("All files"):

| Métrica | Observado | Piso escolhido | Margem |
|---------|-----------|----------------|--------|
| Lines | 23.32% | 20 | 3.32 |
| Statements | 23.32% | 20 | 3.32 |
| Functions | 24.61% | 20 | 4.61 |
| Branches | 65.48% | 60 | 5.48 |

**Por que estes N:** pisos modestos logo abaixo do agregado (margem contra flutuação), `per-file:false` porque vários arquivos são intencionalmente descobertos nesta fase (`scheduler.js`, `routes/config|deals|notifications|reports|track.js`, `middleware/auth.js` a 0% — serão cobertos em fases futuras COM teste do novo comportamento). O `per-file:true`/`lines:60` do todo `wr-03` foi deliberadamente NÃO usado: falharia imediatamente pela cobertura zero desses arquivos. O gate cobre 4 métricas para bloquear erosão silenciosa da rede de segurança (T-2-03-04); nenhuma delas falha o estado atual (exit 0 confirmado).

## Decisions Made
- **checkout/setup-node @v7 (não @v4):** o skeleton do RESEARCH marcava `@v4` como [ASSUMED] (A1). `gh api repos/actions/{checkout,setup-node}/releases/latest` retornou `v7.0.1` e `v7.0.0` (ambos `prerelease:false`, publicados jul/2026); `v4` está 3 majors atrás. Ajustado para `@v7` conforme a própria instrução da task (confirmar e ajustar). Pinar a major tag mitiga T-2-03-02 (ação de terceiro comprometida) mantendo patches automáticos.
- **Gate em 4 métricas:** além de `lines`, adicionados `statements/functions/branches` porque os valores observados dão margem segura — reforça a proteção contra erosão sem risco de falso-vermelho.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Major tags das actions atualizadas @v4 → @v7**
- **Found during:** Task 1 (antes de commitar — passo A1 de confirmação de tag)
- **Issue:** O skeleton assumia `actions/checkout@v4` e `actions/setup-node@v4`, mas as majors atuais são `@v7` (v4 desatualizada). A própria task instrui confirmar e ajustar.
- **Fix:** Pinado `@v7` em ambas as actions nos dois jobs.
- **Files modified:** `.github/workflows/ci.yml`
- **Verification:** `gh api .../releases/latest` → v7.x (não prerelease); ci.yml contém `actions/checkout@v7` e `actions/setup-node@v7`.
- **Committed in:** `c2093cc`

---

**Total deviations:** 1 auto-fixed (1 blocking — tag update previsto pela própria task via A1).
**Impact on plan:** Nenhum scope creep. A prova de CI verde em PR real e o bloqueio de merge (CI-02, branch protection) ficam para 02-04, conforme o plano.

## Threat Flags

Nenhuma nova superfície de segurança fora do threat_model do plano. Mitigações aplicadas:
- **T-2-03-01 (EoP):** `permissions: contents: read` no topo do ci.yml.
- **T-2-03-02 (Tampering):** actions pinadas na major tag `@v7` (confirmada atual) + `npm ci` (lockfile determinístico).
- **T-2-03-03 (Info Disclosure):** nenhum secret referenciado no workflow (lint/test/build públicos) — accept.
- **T-2-03-04 (Tampering/erosão):** c8 `check-coverage` bloqueia PRs que baixem a cobertura abaixo do piso (WR-03), em 4 métricas.
- **T-2-SC:** `npm ci` + lockfiles atualizados em 02-02.

## Next Phase Readiness
- ci.yml estruturalmente pronto (validado localmente pelos checks node; execução real do workflow ocorre no GitHub em 02-04).
- Gate de cobertura ativo e verde — pronto para bloquear regressões em PRs.
- 02-04 pode: (1) abrir PR e confirmar CI verde; (2) configurar required status checks `backend`/`frontend` na branch protection da main (D-10); (3) PR de falha proposital confirmando bloqueio (CI-02/D-11).

## Self-Check: PASSED

- FOUND: .github/workflows/ci.yml
- FOUND: backend/.c8rc.json
- FOUND commits: c2093cc, de2cc92
