---
phase: 02-toolchain-de-qualidade-ci
plan: 04
subsystem: ci
tags: [ci, branch-protection, github, gate, runbook, merge-gate]

# Dependency graph
requires:
  - phase: 02-03
    provides: ".github/workflows/ci.yml com ids de job backend/frontend = contextos dos required status checks"
  - phase: 02-02
    provides: "npm run lint exit 0 nos dois pacotes (baseline warn-tolerante D-06) — sem isso o CI ficaria vermelho"
  - phase: 02-01
    provides: "35 testes verdes + gate de cobertura satisfeito no job backend"
provides:
  - "deploy/branch-protection.md — runbook reproduzível da branch protection (D-10)"
  - "main protegida: required status checks [backend, frontend], strict:true, enforce_admins:true"
  - "evidência CI-01 (PR real verde) e CI-02 (PR vermelho com merge BLOQUEADO)"
affects: [phase-03, todos os PRs futuros para main]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Branch protection aplicada via gh api PUT (config de repo não versionada → runbook auditável)"
    - "Prova de gate por PR descartável: falha proposital em arquivo isolado, fechado sem merge"

key-files:
  created: ["deploy/branch-protection.md"]
  modified: []

key-decisions:
  - "strict:true mantido (branch precisa estar atualizada com main antes do merge) — custo baixo num repo single-maintainer onde a main quase não anda"
  - "enforce_admins:true — a proteção vale também para o mantenedor; sem bypass do gate"
  - "required_pull_request_reviews:null — o gate é o CI, não review humano (projeto interno single-maintainer)"
  - "Falha proposital em arquivo NOVO isolado (backend/test/ci-gate-proof.test.js) em vez de editar um teste existente — some junto com a branch, sem risco de resíduo na rede de segurança"

patterns-established:
  - "Todo PR para main passa por backend+frontend verdes antes de poder mesclar"
  - "Runbook de config não-versionada documentado em deploy/ junto aos demais scripts de deploy"

requirements-completed: [CI-01, CI-02]

# Metrics
duration: ~25min
completed: 2026-07-29
---

# Phase 2 Plan 04: Branch Protection + Prova do Gate Summary

**A `main` passou de "tem CI" para "CI é gate obrigatório e comprovado": required status checks `backend`+`frontend` com `enforce_admins:true`, provados por um PR real verde (CI-01) e por um PR de falha proposital cujo merge ficou BLOQUEADO (CI-02), com o passo-a-passo registrado em `deploy/branch-protection.md` (D-10).**

## Performance

- **Duration:** ~25 min (execução em 2 sessões — Task 1 em 2026-07-24, Tasks 2-3 em 2026-07-29)
- **Started:** 2026-07-24
- **Completed:** 2026-07-29
- **Tasks:** 3 (1 auto + 2 checkpoints humanos bloqueantes)
- **Files modified:** 1 criado (`deploy/branch-protection.md`)

## Accomplishments

- **Runbook D-10** (`deploy/branch-protection.md`, PT): pré-requisitos, comando `gh api PUT` completo com as 4 chaves de topo, comando de verificação, procedimento de prova CI-02 e nota do Pitfall 3 (contexts devem casar com os ids dos jobs).
- **CI-01 provado em PR real** (PR #1, run `30474941235`): `backend` pass 15s, `frontend` pass 23s — e os logs confirmam execução real, não um verde vazio: `# tests 35 / # pass 35 / # fail 0` + tabela de cobertura no backend, `vite v5.4.21 ✓ built in 4.90s` no frontend.
- **Branch protection aplicada** na `main` sem 422 — o shape das 4 chaves documentado no runbook estava correto de primeira. Verificação retornou `{"strict":true,"contexts":["backend","frontend"],"checks":[{"context":"backend","app_id":15368},{"context":"frontend","app_id":15368}]}`, mais `enforce_admins.enabled:true`, `allow_force_pushes:false`, `allow_deletions:false`.
- **CI-02 provado** (PR #2, run `30475739903`): `backend` fail 18s (`not ok 29`, `# tests 36 / # fail 1`), `frontend` pass 24s, e a API do GitHub reportou `mergeStateStatus: BLOCKED` com `mergeable: MERGEABLE` — ou seja, o merge era tecnicamente possível e foi a proteção que barrou. PR fechado sem merge, branch apagada local e remotamente; `origin/main` confirmada sem nenhum vestígio do arquivo de prova.

## Task Commits

1. **Task 1: Runbook deploy/branch-protection.md (D-10)** - `a50eb6d` (docs)
2. **Task 2: required checks + PR verde (CI-01)** - sem commit de código: a branch protection é config de repositório no GitHub, não versionada (é precisamente o motivo de existir o runbook da Task 1). Commit auxiliar `docs(state)` para o STATE.md da retomada de sessão.
3. **Task 3: prova CI-02** - commit `e0a7553` criado e **descartado por design** junto com a branch `test/ci-gate-proof`.

**Plan metadata:** (final docs commit — este SUMMARY + STATE + ROADMAP)

## Evidência consolidada

| Requisito | Evidência | Onde |
|---|---|---|
| CI-01 | `backend` pass (35/35 testes + coverage), `frontend` pass (vite build) | PR #1, run 30474941235 |
| CI-02 | `backend` fail → `mergeStateStatus: BLOCKED` com `mergeable: MERGEABLE` | PR #2, run 30475739903 |
| D-10 | Runbook com `gh api PUT` + verificação + procedimento de prova | `deploy/branch-protection.md` |
| D-11 | PR de falha proposital barrado, fechado sem merge, branch descartada | PR #2 (closed) |

## Decisions Made

- **`strict: true` mantido:** exige que a branch esteja atualizada com a `main` antes do merge. Levantei o custo (rebase manual sempre que a `main` andar) e foi confirmado manter — num repo single-maintainer onde a `main` quase não se move, o custo é próximo de zero e ganha-se a garantia de que o CI verde foi medido contra o estado real de destino.
- **Prova por arquivo isolado:** o runbook sugeria quebrar um teste existente (`agendor.futureTasks.test.js`). Optei por um arquivo novo e autocontido, `backend/test/ci-gate-proof.test.js`, com comentário de cabeçalho explicitando que é temporário. Motivo: some inteiro com a branch, sem chance de deixar resíduo num teste real da rede de segurança — que é justamente o Core Value do milestone.

## Deviations from Plan

### Blocker externo resolvido (não previsto no plano)

**1. Push rejeitado por falta do escopo OAuth `workflow`**
- **Found during:** Task 2, no primeiro `git push` (53 commits acumulados, nunca publicados).
- **Issue:** `! [remote rejected] ... refusing to allow an OAuth App to create or update workflow .github/workflows/ci.yml without workflow scope`. O token do `gh` tinha `gist, read:org, repo` — sem `workflow`, o GitHub recusa qualquer push que crie/altere arquivos em `.github/workflows/`. Como o commit `c2093cc` (02-03) cria o `ci.yml`, o push inteiro era recusado.
- **Alternativa testada e descartada:** push via SSH (não sujeito à restrição de escopo OAuth) — `Permission denied (publickey)`, sem chave registrada no GitHub.
- **Fix:** ação humana obrigatória — `gh auth refresh -h github.com -s workflow` (device flow no navegador). Escopo confirmado depois: `gist, read:org, repo, workflow`.
- **Verification:** push subsequente bem-sucedido (`af3a257..a50eb6d`), CI disparou automaticamente no PR #1.
- **Nota para o futuro:** qualquer clone novo ou máquina nova que precise alterar `.github/workflows/` vai esbarrar nisso. Vale registrar no runbook de onboarding da Fase 8.

### Auto-fixed Issues

**2. Verificação local preventiva antes do push**
- **Found during:** Task 2, antes de publicar.
- **Issue:** publicar 53 commits sem checagem arriscava um CI vermelho por motivo trivial e um ciclo de ida e volta.
- **Fix:** rodado localmente `backend: lint (exit 0, 44 warnings tolerados por D-06) + test:coverage (exit 0, 35/35)` e `frontend: lint (exit 0) + build (exit 0)`.
- **Ressalva:** local em Node 22, CI em Node 20 — a checagem local reduz o risco mas não o elimina. O CI real confirmou verde depois.

---

**Total deviations:** 1 blocker externo (ação humana obrigatória) + 1 verificação preventiva. Nenhum scope creep, nenhuma mudança de comportamento no produto.

## Threat Flags

Mitigações do threat_model do plano, aplicadas e verificadas:
- **T-2-04-01 (Bypass/Tampering — merge de código não-verificado na main):** *mitigado e comprovado.* Required status checks `backend`+`frontend` com `enforce_admins:true`; provado por PR de falha proposital barrado (`mergeStateStatus: BLOCKED`). Bônus confirmado na resposta da API: `allow_force_pushes:false` e `allow_deletions:false` — não dá para contornar o gate por force-push nem apagando a branch.
- **T-2-04-02 (Repudiation — config não reproduzível/auditável):** *mitigado.* `deploy/branch-protection.md` versionado com o comando exato, e o `gh api PUT` executado sem 422 confirma que o runbook está correto na prática, não só no papel.
- **T-2-SC:** nenhum `npm install` neste plano.

**Nova superfície observada (fora do threat_model, registrada):** o escopo `workflow` do token OAuth agora permite alterar arquivos de CI a partir desta máquina. É a permissão mínima para o trabalho e está atrelada à conta do mantenedor, mas é uma capacidade nova que não existia antes deste plano.

## Next Phase Readiness

- **Phase 2 fechada:** QUAL-01/02/03 (02-02), CI-01 (02-03 + prova aqui), CI-02 (aqui). Os dois itens carregados da review da Fase 1 também: WR-02 (02-01) e WR-03 (02-03).
- A partir de agora **todo PR para `main` é barrado se lint, testes, gate de cobertura ou build falharem** — a rede de segurança da Fase 1 está mecanicamente protegida contra erosão silenciosa. É essa garantia que torna seguras as fases seguintes (hardening de segurança, refatoração), conforme o Core Value do milestone.
- **Pendência operacional que a Fase 3 herda:** o PR #1 (`chore/production-readiness`, 54 commits) está verde e agora mesclável — mas segue **aberto**. Decidir se merge antes ou depois da Fase 3.

## Self-Check: PASSED

- FOUND: deploy/branch-protection.md
- FOUND commit: a50eb6d
- VERIFIED: `gh api .../branches/main/protection/required_status_checks` → contexts [backend, frontend], strict:true
- VERIFIED: PR #1 checks backend+frontend = pass (CI-01)
- VERIFIED: PR #2 mergeStateStatus = BLOCKED com backend = fail (CI-02); PR fechado, branch removida, origin/main sem resíduo
