---
phase: 01-rede-de-testes-safety-net
plan: 02
subsystem: backend/agendor (motor de notificação — regras de inclusão/exclusão)
tags: [testes, caracterização, golden, agendor, getStaleDeals, day-boundary, fixtures]
requires:
  - "01-01: runner node:test + setup.js + seam DB_PATH"
provides:
  - "Rede de caracterização sobre getStaleDeals (threshold, cutoff estrito `<`, categoria, stage, owner, status-id)"
  - "Seams puros getDealType + isExcludedStage exportados de agendor.js"
  - "Helper fakeAxios (stub de axios.create na borda HTTP)"
  - "Fixtures sintéticos por regra (incl. casos de day-boundary a cutoff ±1ms)"
  - "Fixture real-deal anonimizado (PII-free, token-free) para smoke de realismo"
  - "Script de captura one-shot capture-fixtures.js + hardening de .gitignore"
affects:
  - "backend/src/agendor.js (dois seams comportamento-preservantes)"
  - ".gitignore"
tech-stack:
  added: []
  patterns:
    - "Two-lane characterization: pure-lane (sem mocks) + integrated-lane (stub axios + relógio fixo via mock.timers)"
    - "Golden de day-boundary pinando o `<` estrito (cutoff exato EXCLUÍDO, cutoff-1ms INCLUÍDO)"
    - "Commit da fixture com PII gated por checkpoint human-verify (nunca entra no histórico antes da revisão)"
key-files:
  created:
    - backend/test/agendor.pure.test.js
    - backend/test/agendor.getStaleDeals.test.js
    - backend/test/helpers/fakeAxios.js
    - backend/test/fixtures/synthetic/deals-page.json
    - backend/test/fixtures/real-deals.sample.json
    - backend/test/agendor.realsample.test.js
    - backend/scripts/capture-fixtures.js
  modified:
    - backend/src/agendor.js
    - .gitignore
decisions:
  - "D-04: getDealType e isExcludedStage exportados como funções puras sem alterar a lógica (extração byte-a-byte do regex de diacríticos)"
  - "D-05: mock na borda HTTP (stub de axios.create) em vez de bater na API Agendor real"
  - "D-09: fixtures sintéticos por regra, incluindo o limite de dias no boundary (cutoff ±1ms)"
  - "D-10: alguns deals reais anonimizados, gitignored, commit gated por aprovação humana"
metrics:
  duration_min: 45
  completed: "2026-07-22"
  tasks: 4
  files: 8
  tests: 12
requirements: [TEST-02]
---

# Phase 01 Plan 02: Caracterização de getStaleDeals (rede de segurança do motor de notificação) Summary

Rede de testes de caracterização (golden) que pina o comportamento ATUAL das regras de "quem é notificado" em `getStaleDeals()` — threshold de dias com comparação `<` estrita no boundary, exclusão por categoria/stage/owner/status-id — via estratégia de duas pistas (pure-lane sem mocks + integrated-lane com stub de axios e relógio fixo), sem alterar a lógica de produção; entrega ainda uma fixture real-deal anonimizada (PII-free/token-free) commitada só após aprovação humana.

## What Was Built

- **Seams comportamento-preservantes em `agendor.js`** (Task 1): `getDealType` adicionado ao `module.exports` (zero movimentação de código — já era função standalone); `isExcludedStage(rawStageName)` extraído das linhas inline 138-139 com cópia **byte-a-byte** do regex de combining-marks (U+0300–U+036F) e do `EXCLUDED_STAGE_WORDS.some(...)`, substituindo o inline por uma única chamada `if (isExcludedStage(deal.dealStage?.name)) continue;`. A comparação estrita `updatedAt < cutoffDate` (linha 126) permanece **inalterada**.
- **Pure-lane golden** (`agendor.pure.test.js`): pina o quirk `isExcludedStage('Perdão de contrato') === true` (substring 'perd') e a classificação `getDealType` (Cliente/Cliente Ouro → 'Negócio'; Lead/null/Concorrente → 'Lead').
- **Integrated-lane golden** (`agendor.getStaleDeals.test.js` + `helpers/fakeAxios.js` + `fixtures/synthetic/deals-page.json`): dirige o `getStaleDeals(15)` REAL através de um stub de `axios.create` instalado ANTES do require, com `mock.timers` pinado em `2026-06-01T00:00:00.000Z` (⇒ cutoff `2026-05-17T00:00:00.000Z`). O golden de **day-boundary** afirma que o deal a cutoff exato é EXCLUÍDO e o deal a cutoff-1ms é INCLUÍDO — uma regressão de `<`→`<=` na linha 126 quebra a suíte.
- **Ferramentas de captura + hardening** (Task 3): `scripts/capture-fixtures.js` (one-shot manual, lê `AGENDOR_TOKEN` só do env, anonimiza nomes/orgs/títulos/emails/telefone/CPF-CNPJ para labels sintéticos, nunca escreve token/raw em caminho commitado); `.gitignore` estendido para excluir `test/fixtures/**/*.raw.json`; smoke de realismo (`agendor.realsample.test.js`) alimenta a amostra real via fakeAxios e confirma que atravessa o pipeline sem lançar.
- **Gate de commit da fixture** (Task 4): a `real-deals.sample.json` ficou untracked em disco após a Task 3 e só entrou no histórico (commit `13b89e1`) após a aprovação humana explícita — sem necessidade de reescrita de histórico git.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Guard regex do verify da Task 3 falso-positivava datas ISO**
- **Encontrado durante:** Task 3 (verify automatizado)
- **Problema:** O regex de guarda de PII `\+?\d[\d ().-]{8,}` (detecção de telefone) casava com timestamps ISO da fixture (ex.: `2026-02-03T...`), fazendo o guard sair com exit 1 mesmo sem PII real presente.
- **Correção:** O agente anterior ajustou o guard para primeiro remover os timestamps ISO e só então aplicar as heurísticas de email/token/telefone/CPF — mantendo exit 0 numa fixture limpa enquanto ainda captura PII genuína.
- **Arquivos:** guard inline do verify (não altera artefatos de produção)
- **Commit:** 52e9bf1 (Task 3)

## Authentication / Setup Gates

Nenhum gate de autenticação foi acionado. `AGENDOR_TOKEN` é consumido apenas pelo script de captura one-shot (não roda em CI). A fixture real-deal foi hand-authored/anonimizada e não exigiu token no ambiente de execução.

## Checkpoint Resolution

- **Task 4 (checkpoint:human-verify, gate=blocking-human):** APROVADO pelo usuário. Verificação independente confirmou que `real-deals.sample.json` era untracked (zero histórico git), 100% sintética (Deal N / Owner N / Author N / Org N), sem token/email/telefone/CPF/CNPJ/PII. Ação de resume executada: `git add` + commit `13b89e1`.

## Verification

- `node --test` (suíte completa do backend): **12/12 pass, 0 fail** após o commit da fixture.
- `git diff backend/src/agendor.js`: limitado aos dois seams; comparação `<` da linha 126 inalterada.
- Guard de PII/token/telefone/CPF em `real-deals.sample.json`: exit 0 (nada sensível).
- Fixture commitada só após aprovação (commit `13b89e1`, posterior aos commits de Task 1-3).

## Commits

- `a82a1e7` — test(01-02): seams getDealType/isExcludedStage + pure-lane golden
- `e143dc9` — test(01-02): integrated-lane golden de getStaleDeals via stub axios
- `52e9bf1` — test(01-02): script de captura + hardening .gitignore + smoke de realismo
- `13b89e1` — test(01-02): add anonymized real-deal realism fixture (Task 4, pós-aprovação)

## Self-Check: PASSED
