---
phase: 01-rede-de-testes-safety-net
plan: 05
subsystem: backend/auth
tags: [characterization, security, rate-limit, password-verification, seam]
requires:
  - "01-01 (test runner node:test + setup.js: JWT_SECRET/DB_PATH :memory:/AGENDOR_TOKEN)"
provides:
  - "verifyPassword helper (DRY do compare bcrypt/texto-puro, discriminador $2 preservado)"
  - "rate-limit helpers expostos como props do router (checkRateLimit/recordFailedAttempt/clearAttempts/_loginAttempts)"
  - "characterization golden do rate-limit de login e da verificação de senha (TEST-05)"
affects:
  - "backend/src/routes/auth.js (seams behavior-preserving; nenhuma mudança de comportamento observável)"
tech-stack:
  added: []
  patterns:
    - "node:test mock.timers({apis:['Date']}) para expirar a janela de bloqueio de 15 min"
    - "seams de teste anexados a module.exports sem quebrar o export do router (Express ignora props extras)"
key-files:
  created:
    - backend/test/auth.test.js
  modified:
    - backend/src/routes/auth.js
decisions:
  - "verifyPassword extraído como DRY behavior-preserving; discriminador '$2' preservado verbatim (T-05-01)"
  - "Rate-limit (5 tentativas / 15 min) pinado como comportamento ATUAL; qualquer mudança é Phase 6 com teste próprio (T-05-02)"
requirements: [TEST-05]
metrics:
  duration: 10
  completed: 2026-07-24
---

# Phase 01 Plan 05: Auth Rate-Limit + Password Verification Characterization Summary

Pin da lógica de segurança do `auth.js` — rate limiting de login (bloqueio por IP após 5 tentativas, janela de 15 min) e verificação de senha (bcrypt + texto puro legado) — com testes de caracterização golden, mais dois seams mínimos e behavior-preserving: `verifyPassword` (DRY do compare duplicado, com o discriminador `$2` preservado exatamente) e a exposição dos helpers de rate-limit como props do router exportado para os testes dirigirem e resetarem o `Map` em memória entre casos.

## What Was Built

### Task 1 — Seams em `backend/src/routes/auth.js` (behavior-preserving)
- `async function verifyPassword(storedHash, plain)` extraído perto da seção de rate-limit: `storedHash.startsWith('$2') ? bcrypt.compare(plain, storedHash) : plain === storedHash`.
- Os dois compares duplicados foram substituídos por `await verifyPassword(user.password, <plain>)`: no handler de `login` e no de `change-password`. Fluxo de controle, status codes, mensagens e logging ao redor intactos.
- `module.exports = router` mantido; anexados como seams de teste: `checkRateLimit`, `recordFailedAttempt`, `clearAttempts`, `verifyPassword`, `_loginAttempts` (o `Map`). Comentário em português nota que são seams e não afetam o roteamento do Express.
- Nenhuma alteração em `MAX_ATTEMPTS`, `BLOCK_MINUTES`, na lógica de rate-limit ou em `requireAdmin` (pertencem à Phase 6).

### Task 2 — `backend/test/auth.test.js` (6 asserções golden, TEST-05)
- `require('./setup')` PRIMEIRO, antes de requerer o auth.js (evita throw do secret.js e escrita no `backend/agendor.db`; DB em `:memory:`).
- `beforeEach` limpa o `Map` via `_loginAttempts.clear()`.
- Rate-limit: 4 primeiras falhas → `nowBlocked:false`; a 5ª → `nowBlocked:true`; `checkRateLimit` reporta `blocked` com `minutesLeft`; após `mock.timers.tick(15*60*1000 + 1)` reporta not blocked; `clearAttempts` libera o IP.
- Senha: hash bcrypt real gerado em-teste → match/no-match; ramo legado texto puro → match/no-match (documenta o discriminador `$2` selecionando o caminho plaintext).

## How to Verify

```bash
cd backend && export PATH="$HOME/bin:$PATH" && node --test test/auth.test.js   # 6 pass, exit 0
cd backend && export PATH="$HOME/bin:$PATH" && npm test                        # 28 pass (era 22)
# Boot check do export do router + seams:
JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx DB_PATH=':memory:' AGENDOR_TOKEN=test \
  node -e "const r=require('./src/routes/auth');if(typeof r!=='function')throw 0;['checkRateLimit','recordFailedAttempt','clearAttempts','verifyPassword','_loginAttempts'].forEach(k=>{if(r[k]===undefined)throw k});console.log('ok')"
```

`git diff` de `auth.js` limitado a: `verifyPassword` adicionado, os dois compares substituídos, e os attachments de export — sem mudança de mensagens/status codes/constantes de rate-limit.

## Deviations from Plan

None - plan executed exactly as written.

Testes de caracterização de código existente passaram na primeira execução (esperado — não é TDD de feature nova). Nenhum comportamento de auth foi "corrigido": o `$2` discriminator e todos os desfechos permanecem byte-idênticos, conforme threat register T-05-01/T-05-02/T-05-03.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | auth.js seams — verifyPassword DRY + export rate-limit helpers | 29ef2b1 | backend/src/routes/auth.js |
| 2 | Rate-limit + password verification characterization | fbb117d | backend/test/auth.test.js |

## Self-Check: PASSED

- FOUND: backend/src/routes/auth.js
- FOUND: backend/test/auth.test.js
- FOUND: commit 29ef2b1
- FOUND: commit fbb117d
