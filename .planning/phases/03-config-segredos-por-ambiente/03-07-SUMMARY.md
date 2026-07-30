---
phase: 03-config-segredos-por-ambiente
plan: 07
subsystem: ci
tags: [ci, branch-protection, gitleaks, secret-scanning, gate, runbook]

# Dependency graph
requires:
  - phase: 03-06
    provides: "job `secrets` (gitleaks escopado ao range do PR) já mesclado e reportando na main"
  - phase: 02-04
    provides: "branch protection da main com [backend, frontend], strict e enforce_admins"
provides:
  - "main exige [backend, frontend, secrets] — segredo novo é barrado antes do merge"
  - "GitHub Secret Scanning + push protection habilitados (camada anterior ao push)"
  - "deploy/branch-protection.md documenta a ordem obrigatória do D-14 e as limitações medidas do gate"
affects: [todos os PRs futuros, phase-06]

tech-stack:
  added: []
  patterns:
    - "Prova de gate por PR descartável com segredo sintético, fechado sem merge"
    - "Camadas complementares: push protection age antes do push, gitleaks barra o merge"

key-files:
  created: []
  modified: ["deploy/branch-protection.md"]

key-decisions:
  - "Checkpoint da Task 1 satisfeito por evidência objetiva (secrets reportou success na main, run 30501477054) antes de qualquer alteração de proteção"
  - "Secret Scanning nativo habilitado parcialmente: 2 de 4 toggles; os outros 2 são recusados em silêncio neste plano de conta"
  - "A prova de gate exigiu trocar a chave de exemplo da AWS por uma sintética real-shaped — a canônica é allowlisted pelo gitleaks"

requirements-completed: [CFG-01]

duration: ~35min
completed: 2026-07-30
---

# Phase 3 Plan 07: Gate de Segredos Obrigatório Summary

**O job `secrets` passou de "existe e roda" para "barra o merge, comprovadamente": `main` agora exige
`[backend, frontend, secrets]` com `enforce_admins: true`, e um PR com segredo real-shaped ficou
`mergeStateStatus: BLOCKED`. O Secret Scanning nativo foi habilitado como camada anterior ao push.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-30
- **Tasks:** 3 (1 checkpoint verificado por evidência, 2 executadas)
- **Files modified:** 1 (`deploy/branch-protection.md`)

## Task 1 — checkpoint do D-14, satisfeito antes de agir

A pré-condição era que o contexto `secrets` já tivesse reportado na `main`. Verificado **antes** de
qualquer `gh api PUT`:

```
gh api repos/vitormorija/automacao-agendor/commits/main/check-runs
→ backend completed success · secrets completed success · frontend completed success
```

O contexto passou a existir na `main` com o merge do PR #3 (run `30501477054`). Se a ordem tivesse
sido invertida, a `main` exigiria um check inexistente e — com `enforce_admins: true` — todo PR
ficaria travado sem saída pelo próprio fluxo.

## Task 2 — `secrets` como required status check

```json
{"contexts": ["backend", "frontend", "secrets"], "strict": true,
 "enforce_admins": true, "allow_force_pushes": false}
```

O endpoint substitui a configuração **inteira**: omitir `backend` ou `frontend` do array os
removeria silenciosamente. Os três foram enviados juntos e a verificação imediata confirmou que os
dois antigos sobreviveram.

`deploy/branch-protection.md` atualizado: 7 ocorrências do par de contextos viraram trio, mais dois
blocos novos — o callout da ordem obrigatória do D-14 e a descrição do que o job faz, com as duas
limitações medidas (PR acima de 30 commits é escaneado parcialmente; o gitleaks não detecta segredo
em header `Authorization: Token`). Também ficou registrado que o `.gitleaksignore` só aceita
falso-positivo comprovado e que o fingerprint do token da Agendor não pode entrar nele.

## Task 3 — prova do gate e Secret Scanning

### A primeira tentativa falhou, e o erro era do teste

PR #5 com `AKIAIOSFODNN7EXAMPLE` → `secrets` **verde**, `mergeStateStatus: CLEAN`. O log dizia
`1 commits scanned. no leaks found`: o commit foi escaneado e nada foi achado.

Causa: essa é a chave de exemplo da documentação da AWS, e o gitleaks a mantém em allowlist
justamente para não gerar ruído em tutoriais. O gate foi testado com uma string que ele é projetado
para ignorar.

**Lição que vale além desta fase:** um teste de gate de segurança precisa usar um valor que o
detector realmente considere segredo. Um exemplo canônico de documentação prova o oposto do
pretendido — e teria sido registrado como "gate funciona" se ninguém olhasse o log.

### A segunda tentativa provou

Chave sintética real-shaped (`AKIA` + 16 alfanuméricos, gerada deterministicamente, sem `EXAMPLE`):

| Check | Resultado |
|---|---|
| `secrets` | ❌ **fail** (5s) |
| `backend` / `frontend` | ✅ pass |
| Estado do merge | `mergeStateStatus: BLOCKED` com `mergeable: MERGEABLE` |

`mergeable: MERGEABLE` é a metade que prova: não havia conflito, o merge era tecnicamente possível,
e foi a proteção que barrou. PR #5 fechado sem merge, branch `test/secrets-gate-proof` apagada local
e remotamente, `origin/main` confirmada sem resíduo.

### Secret Scanning nativo — habilitado pela metade, e isso importa

| Toggle | Estado |
|---|---|
| `secret_scanning` | ✅ enabled |
| `secret_scanning_push_protection` | ✅ enabled |
| `secret_scanning_non_provider_patterns` | ❌ disabled — PATCH aceito e ignorado |
| `secret_scanning_validity_checks` | ❌ disabled — idem |

O `PATCH` retorna `200` com o corpo do repositório, mas os dois últimos permanecem `disabled`:
o GitHub os recusa em silêncio neste plano de conta.

**Consequência que contradiz a expectativa registrada no D-11:** `non_provider_patterns` é
exatamente a regra que pegaria segredos genéricos. Sem ela, o scanning nativo só detecta padrões de
**provedores conhecidos**, e a Agendor não é um. Portanto **o token do `sec-01` não vai gerar alerta
nativo** — a contrapartida que foi apresentada ao usuário ao decidir D-11 ("vai abrir um alerta
permanente até você rotacionar") não se materializa. Há 0 alertas abertos, e é por esse motivo, não
porque a exposição tenha deixado de existir.

O valor que restou das duas camadas ativas é real e vale por si: push protection recusa o `git push`
que contenha um segredo de provedor conhecido, agindo **antes** de virar histórico — o que o
gitleaks, que age no PR, não consegue fazer.

## Decisions Made

- **Verificar antes de alterar.** A evidência da Task 1 foi coletada e conferida antes do `PUT`, não
  depois. Num gate cuja inversão é irreversível de dentro do fluxo, a ordem é a proteção.
- **Trocar o valor da prova em vez de afrouxar o gate.** Quando a primeira prova falhou, a correção
  foi no teste, não na configuração — reduzir a sensibilidade do scanner para "fazer o teste passar"
  teria produzido um gate mais fraco e um SUMMARY mentiroso.

## Deviations from Plan

**1. A chave de prova prescrita era allowlisted.**
- **Found during:** Task 3, primeira execução do PR #5.
- **Issue:** `AKIAIOSFODNN7EXAMPLE` não dispara o gitleaks (allowlist de exemplos de documentação).
- **Fix:** substituída por chave sintética determinística sem o literal `EXAMPLE`.
- **Verification:** `secrets` passou de `pass` para `fail`; merge de `CLEAN` para `BLOCKED`.

**2. Secret Scanning habilitado parcialmente** — 2 de 4 toggles, com os outros dois recusados em
silêncio pela API. Documentado acima em vez de reportado como sucesso completo.

---

**Total deviations:** 2, ambas de medição, nenhuma de escopo.

## Threat Flags

- **T-03-GATE-01 (merge de segredo na main):** *mitigado e comprovado* — `secrets` obrigatório;
  PR com segredo real-shaped ficou BLOCKED. `allow_force_pushes: false` e `allow_deletions: false`
  impedem contorno por force-push ou remoção da branch.
- **T-03-GATE-02 (inversão da ordem travar a main):** *evitado* — checkpoint verificado antes do PUT.
- **T-03-GATE-04/05 (push protection):** *parcialmente mitigado* — ativo para provedores conhecidos;
  segredos genéricos, incluindo o token da Agendor, ficam de fora (ver acima).

## Next Phase Readiness

- **Fase 3 fechada:** CFG-01 (03-03/04/06/07), CFG-02 e CFG-03 (03-05), CFG-04 (03-02).
- **Pendências operacionais carregadas:** `sec-01` (rotação do token — o único remédio real, e agora
  se sabe que nenhuma camada automática vai lembrar disso), `sec-02` (16 advisories de dependências,
  alvo Fase 4), `ops-01` (validar `.env` e PM2 no primeiro deploy).
- Todo PR para `main` agora exige lint, testes, gate de cobertura, build e varredura de segredos.

## Self-Check: PASSED

- VERIFIED: `gh api .../branches/main/protection` → contexts `[backend, frontend, secrets]`, strict, enforce_admins
- VERIFIED: PR #5 com segredo → `secrets` fail + `mergeStateStatus: BLOCKED`; fechado, branch removida, main sem resíduo
- VERIFIED: `secret_scanning` e `secret_scanning_push_protection` enabled
- VERIFIED: suíte 78/78 verde, branches 72,72% (piso 60)
- FOUND: `deploy/branch-protection.md` com os 3 contextos e o callout do D-14
