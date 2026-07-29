---
phase: 01-rede-de-testes-safety-net
plan: 03
subsystem: backend/db (regra de dedup do motor de notificação — mesmo dia)
tags: [testes, caracterização, dedup, alreadyNotifiedToday, day-boundary, sqlite, tempfile]
requires:
  - "01-01: runner node:test + setup.js + seam DB_PATH em db.js"
provides:
  - "Caracterização de alreadyNotifiedToday (hoje→true, sem-linha→false, ontem→false)"
  - "Helper tmpDb (banco SQLite em arquivo temporário + cleanup + conexão crua para seed)"
  - "Padrão de seed de sent_at controlado via segunda conexão ao mesmo arquivo temp"
affects: []
tech-stack:
  added: []
  patterns:
    - "DB_PATH apontando para arquivo temp (os.tmpdir) setado ANTES de require('../src/db')"
    - "Seed de linha com sent_at do passado por uma SEGUNDA conexão better-sqlite3 ao mesmo arquivo (contorna logNotification que grava sempre 'agora')"
    - "Isolamento total do backend/agendor.db: arquivo temp removido em after() (D-08)"
key-files:
  created:
    - backend/test/helpers/tmpDb.js
    - backend/test/db.dedup.test.js
  modified: []
decisions:
  - "D-08: SQLite real em arquivo temporário (nunca :memory: aqui) para viabilizar o caso day-boundary via segunda conexão ao mesmo arquivo"
metrics:
  duration_min: 12
  completed: "2026-07-22"
  tasks: 2
  files: 2
  tests: 3
requirements: [TEST-03]
---

# Phase 01 Plan 03: Caracterização da dedup do mesmo dia (alreadyNotifiedToday) Summary

Pina o comportamento ATUAL da regra que impede reenviar a mesma notificação de deal no mesmo dia — `alreadyNotifiedToday(deal_id)` — com testes de caracterização sobre SQLite real em arquivo temporário: notificado hoje → true, sem registro → false, e a fronteira do dia (notificado ontem → false) semeada por uma segunda conexão ao mesmo arquivo, já que `logNotification` só grava `sent_at = agora`.

## What Was Built

- **Helper `tmpDb.js`** (Task 1): `makeTmpDbPath()` gera um caminho único sob `os.tmpdir()` (com `pid` + sufixo aleatório) e devolve um `cleanup()` que remove o arquivo e os irmãos de journaling (`-journal`/`-wal`/`-shm`) ignorando erros; `openRaw(path)` abre uma conexão better-sqlite3 crua para seed direto. Arquivo side-effect-only, sem nenhuma chamada `test()` — descoberta acidental pelo runner é inofensiva.
- **Caracterização `db.dedup.test.js`** (Task 2): seta `process.env.DB_PATH` para o arquivo temp ANTES do `require('../src/db')` (o singleton abre a conexão no load — seam 01-01), pinando três casos:
  - **Caso A (hoje → true):** `logNotification({..., status:'sent'})` grava `sent_at = agora`; `alreadyNotifiedToday(id)` retorna `true`.
  - **Caso B (sem linha → false):** id nunca notificado retorna `false`.
  - **Caso C (ontem → false):** uma SEGUNDA conexão (`openRaw`) ao MESMO arquivo insere uma linha com `sent_at = agora - 24h` e `status:'sent'`; o singleton (outra conexão, mesmo arquivo) enxerga a linha e mesmo assim retorna `false`, documentando que a dedup compara pelo prefixo de DATA (`YYYY-MM-DD`) — ontem ≠ hoje.
  - `after()` fecha o singleton (`closeDb()`) e remove o arquivo temp; `backend/agendor.db` permanece intocado.

## How to Verify

```bash
cd backend && export PATH="$HOME/bin:$PATH"
node --test test/db.dedup.test.js   # 3 casos, exit 0
npm test                            # suíte completa verde (16 testes)
```

## Deviations from Plan

None — plano executado exatamente como escrito.

## Deferred Issues

None.

## Known Stubs

None — os testes exercitam a função de produção real (`alreadyNotifiedToday`) sem stubs; os dados semeados usam apenas ids/títulos sintéticos.

## Decisions Made

- **D-08:** SQLite real em arquivo temporário (não `:memory:`) é obrigatório aqui porque o caso day-boundary exige semear um `sent_at` do passado por uma segunda conexão; com `:memory:` cada conexão teria um banco isolado (RESEARCH Pitfall 4). O arquivo temp é sempre removido em `after()`, mantendo o isolamento do banco de produção.

## Threat Surface

- T-03-01 (Tampering — teste escrever no banco de produção): mitigado. `DB_PATH` aponta para `os.tmpdir()` antes do require; `after()` remove o arquivo; o caminho default nunca é usado.
- T-03-02 (Information Disclosure): aceito. Linhas semeadas usam apenas ids/títulos sintéticos (`9001/9002/9999`, "Deal notificado hoje/ontem"); nenhum PII real; arquivo temp descartado ao final.
- Nenhuma nova superfície de ameaça fora do `<threat_model>` do plano.

## Self-Check: PASSED

- FOUND: backend/test/helpers/tmpDb.js
- FOUND: backend/test/db.dedup.test.js
- FOUND commit 667fa2a (Task 1 helper)
- FOUND commit be61a35 (Task 2 dedup test)
- Full suite green: 16 tests pass, 0 fail
