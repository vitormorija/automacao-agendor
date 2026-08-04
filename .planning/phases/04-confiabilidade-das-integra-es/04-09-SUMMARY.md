---
phase: 04-confiabilidade-das-integra-es
plan: 09
subsystem: seguranca
tags: [cr-02, wr-03, log-sanitization, agendor-token, ssrf-de-caminho, input-validation, node-test, tdd, gap-closure]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    plan: 02
    provides: 'a propagação da falha de getDealsWithFutureTasks — foi ela que abriu o caminho rotineiro até o console.error de routes/deals.js, e o caso B3 de scheduler.failsafe.test.js que pina o 500 { error } dessa rota'
  - phase: 04-confiabilidade-das-integra-es
    plan: 03
    provides: 'getDealById(id) e o timeout de 15s na instância axios compartilhada — a função validada aqui nasceu naquele plano, e o timeout é o que torna o caminho de erro alcançável em produção'
  - phase: 04-confiabilidade-das-integra-es
    plan: 08
    provides: 'checkpoint C7 aprovado, autorizando a entrada nesta rodada de gap closure'
  - phase: 03-configuracao-e-segredos
    plan: 07
    provides: 'backend/test/secrets.grep.test.js — o gate que o token sintético do teste precisa continuar passando'
provides:
  - 'backend/src/routes/deals.js: o caminho de erro loga por logger.error com contexto + err.message; nenhum objeto de erro do axios alcança stream persistido'
  - 'backend/test/deals.errorLog.test.js — prova comportamental (215 linhas) de que um token sintético injetado em config.headers.Authorization não reaparece na serialização do que foi entregue ao logger, e de que console.error não é chamado'
  - 'backend/src/agendor.js: guarda Number.isInteger(dealId) && dealId > 0 em getDealById, antes de qualquer requisição HTTP'
  - 'backend/src/routes/notifications.js: testCardHandler nomeado + seam, e Number.parseInt no único escritor de notification_log.deal_id controlado pelo corpo da requisição'
  - 'backend/test/dealId.validation.test.js — 5 casos (212 linhas), incluindo a não-regressão do id chegando como string numérica do SQLite'
  - '5 todos de triagem em .planning/todos/pending/ — nenhum achado do 04-REVIEW descartado em silêncio'
affects: [04-10, 04-11, 05-observabilidade, 07-refatoracao-estrutural]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Log de erro em borda externa recebe string de contexto + err.message; passar o objeto de erro é proibido porque o AxiosError carrega config.headers.Authorization'
    - 'A prova de sanitização de log é comportamental (espião no logger + util.inspect de TODOS os argumentos), não estática; grep é sinal auxiliar e não garante a propriedade'
    - 'Teste de segredo usa valor SINTÉTICO reconhecível, nunca process.env nem backend/.env — e o valor é escolhido para não ser classificado como credencial por secrets.grep.test.js'
    - 'Valor lido do banco que vira componente de URL externa precisa de guarda de tipo ANTES da requisição; afinidade INTEGER sem STRICT não é validação'

key-files:
  created:
    - backend/test/deals.errorLog.test.js
    - backend/test/dealId.validation.test.js
    - .planning/todos/pending/in-01-status-pending-na-ui.md
    - .planning/todos/pending/in-02-seams-fora-do-module-exports.md
    - .planning/todos/pending/in-03-comentario-emailer-timeout.md
    - .planning/todos/pending/in-04-escape-html-no-test-card.md
    - .planning/todos/pending/cr-02b-console-error-objeto-completo-em-index.md
  modified:
    - backend/src/routes/deals.js
    - backend/src/agendor.js
    - backend/src/routes/notifications.js

key-decisions:
  - 'CR-02 fechado trocando console.error(err) por logger.error com contexto + err.message; a resposta res.status(500).json({ error: err.message }) NÃO mudou, porque o shape { error } é pinado pelo caso B3 de scheduler.failsafe.test.js'
  - 'A prova decisiva da sanitização é o teste comportamental; os greps registrados abaixo são sinal auxiliar e não recebem no SUMMARY um crédito que não têm (mesma disciplina que o 04-08 exigiu dos comentários de WR-06)'
  - 'Number(id) e não parseInt em getDealById: a normalização precisa aceitar a string numérica que o SQLite devolve e recusar "101abc"; parseInt aceitaria o segundo'
  - 'Number.parseInt(req.body.dealId, 10) || 0 em /test-card preserva o fallback de hoje quando não há id utilizável — o escritor grava número, e o || 0 continua valendo'
  - 'A linha da webUrl de /test-card (IN-04) permanece intocada por decisão de escopo: mexer nela exige alterar o template de e-mail, que o contrato da fase declara inalterado'
  - '[C8 — decisão vinculante do usuário, 2026-08-04] NÃO rotacionar o AGENDOR_TOKEN neste momento. SEC-01 permanece ABERTO como risco conscientemente aceito'
  - 'A higiene local executada no C8 (redação do token no MEMORY.md do Claude Code) reduz cópias adicionais, mas NÃO elimina a exposição histórica do Git e NÃO encerra SEC-01'

patterns-established:
  - 'Nenhuma função de log em backend/src/routes/ recebe o objeto de erro de uma borda HTTP — só mensagem, código e contexto seguro'
  - 'Todo escritor de coluna que depois vira componente de URL externa converte o tipo no ponto de escrita, além da guarda no ponto de leitura (defesa nos dois lados)'

requirements-completed: [REL-01, REL-06]

# Metrics
duration: 7min
completed: 2026-08-04
---

# Phase 4 Plan 09: Token da Agendor fora do log e id de negócio validado (CR-02 / WR-03) Summary

**O `AGENDOR_TOKEN` deixou de ter caminho até o disco: o `console.error(err)` de `GET /api/deals/stale` — que despejava o `AxiosError` inteiro, com `config.headers.Authorization`, no stream que o PM2 persiste em `/opt/agendor/logs/pm2-error.log` — virou `logger.error` com contexto e `err.message`, provado por um teste que injeta um token sintético no header e falha se ele reaparecer; e `getDealById` passou a recusar qualquer id que não seja inteiro positivo ANTES de emitir requisição, fechando o caminho pelo qual `deal_id: '../users'`, gravado pelo corpo de uma requisição autenticada, fazia o backend consultar outro recurso da Agendor com o token de serviço.**

## Performance

- **Duration:** 7 min (19:00:39 → 19:07:36 BRT; exclui a espera pela aprovação humana do C8 e o fechamento)
- **Started:** 2026-08-04T22:00:39Z
- **Completed:** 2026-08-04T22:07:36Z (código) / 2026-08-04T22:15:00Z (fechamento pós-C8)
- **Tasks:** 4 (2 auto TDD + 1 auto de documentação + 1 checkpoint humano)
- **Files modified:** 10 (7 criados, 3 modificados)

## Accomplishments

- **CR-02 fechado** — o único caminho identificado pelo `04-REVIEW` em que o token de serviço da Agendor chegava a um artefato **persistido em disco** foi eliminado. A correção é de 1 linha efetiva mais o `require` do logger.
- **Prova comportamental, não estática** — `deals.errorLog.test.js` espiona `logger.error` e `console.error`, serializa **todos** os argumentos de **todas** as chamadas com `util.inspect(args, { depth: null })` e assere que o token sintético não aparece, que `console.error` foi chamado **0 vezes**, e que o log útil (`[Deals]` + `timeout of 15000ms exceeded`) continua existindo.
- **WR-03 fechado nos dois lados** — guarda de tipo no leitor (`getDealById`) **e** conversão no escritor (`/test-card`). Um só dos dois deixaria a outra metade do problema de pé.
- **Não-regressão do caminho legítimo pinada** — `getDealById('101')` (string numérica, a forma como o valor sai do SQLite) continua consultando `/deals/101`. Sem esse caso, a validação estrita teria quebrado produção em silêncio.
- **Triagem escrita do 04-REVIEW** — 5 achados que ficaram fora desta rodada viraram todos rastreáveis, cada um citando `arquivo:linha` e o motivo de ter ficado fora.

## Task Commits

1. **Task 1: CR-02 — objeto de erro do axios fora do log de `/api/deals/stale`** — `f745ad5` (test, RED) → `347e51c` (fix, GREEN)
2. **Task 2: WR-03 — `getDealById` recusa id não-inteiro; escritor grava número** — `6be383a` (test, RED + seam) → `e6e164f` (fix, GREEN)
3. **Task 3: Triagem dos achados do 04-REVIEW deixados fora** — `53e4350` (docs)
4. **Task 4: Checkpoint C8 — revisão humana da sanitização** — sem commit (gate humano; **aprovado 2026-08-04**)

_TDD sem passo REFACTOR nas duas tasks: o GREEN já é a forma final._

## Files Created/Modified

- `backend/src/routes/deals.js` — `+1` require (`../logger`), `console.error(err)` → `logger.error('[Deals] Erro ao listar negócios parados:', err.message)`, mais comentário em PT-BR explicando a ameaça e citando o teste que a pina. `res.status(500).json({ error: err.message })` **intocada**.
- `backend/src/agendor.js` — corpo de `getDealById`: `const dealId = Number(id)` + `if (!Number.isInteger(dealId) || dealId <= 0) throw`, e o path passa a interpolar `dealId` (número convertido), nunca o argumento cru. O comentário-bloco anterior (por que a função não engole a falha) foi preservado.
- `backend/src/routes/notifications.js` — handler anônimo de `/test-card` virou `async function testCardHandler(req, res)` registrado por `router.post('/test-card', testCardHandler)`; `deal_id: req.body.dealId || 0` → `deal_id: Number.parseInt(req.body.dealId, 10) || 0`; seam `module.exports.testCardHandler` acrescentado ao bloco existente com justificativa. A linha da `webUrl` (IN-04) **intocada**.
- `backend/test/deals.errorLog.test.js` (**novo**, 215 linhas) — caso único com 3 asserções: pré-condição (500 + `typeof body.error === 'string'`), `console.error` chamado 0 vezes, e o token sintético ausente da serialização.
- `backend/test/dealId.validation.test.js` (**novo**, 212 linhas) — 5 casos: rejeição de `'../users'` com **zero** chamadas HTTP, rejeição de `0`/`null`, `getDealById(101)` → `/deals/101`, **não-regressão** `getDealById('101')` → `/deals/101`, e a leitura da linha gravada por `/test-card` asserindo `typeof deal_id === 'number'` (`0` para hostil, `5620` para válido).
- `.planning/todos/pending/in-01-status-pending-na-ui.md` (medium), `in-02-seams-fora-do-module-exports.md` (low), `in-03-comentario-emailer-timeout.md` (low), **`in-04-escape-html-no-test-card.md` (high)**, `cr-02b-console-error-objeto-completo-em-index.md` (low).

## Evidência RED → GREEN

**RED de CR-02 (medido, não afirmado)** — o teste rodado contra o `routes/deals.js` anterior à correção:

```
status=500 console.error_calls=2 CONTEM_TOKEN=true
```

`CONTEM_TOKEN=true` é o vazamento: o valor sintético injetado em `config.headers.Authorization` reaparecia na saída. `console.error_calls=2` mostra que o objeto de erro ia para o stream que o PM2 persiste. Após a correção: `console.error` chamado **0** vezes e `CONTEM_TOKEN=false`, com `[Deals]` e `timeout of 15000ms exceeded` ainda presentes no que foi logado.

**RED de WR-03** — o teste vermelho provou que um `deal_id` textual alcançava o path da API Agendor (`'../users'` compondo `/deals/../users` → `https://api.agendor.com.br/users`). Após a correção: a chamada é recusada com `[Agendor] id de negócio inválido` e `fake.get.mock.callCount() === 0` — a validação acontece **antes** da requisição, não depois.

## Verificação (re-executada no fechamento do plano, 2026-08-04T22:14Z)

| Gate | Resultado observado |
|------|---------------------|
| `npm run test:coverage` | **exit 0** — `# tests 131 / # pass 131 / # fail 0` |
| `npm run lint` | **exit 0** — 45 warnings (baseline tolerante do 02-02) |
| `node --test test/secrets.grep.test.js` | **exit 0** — o valor sintético não é classificado como segredo |
| Cobertura de `routes/deals.js` | 80% linhas / 50% branches / 100% funcs |
| Cobertura de `agendor.js` | 91,95% linhas / 79,38% branches / 100% funcs |
| `git status --porcelain` | **vazio** |
| `backend/package.json` / `package-lock.json` no diff `9fc1685..HEAD` | **intocados** (T-04-09-SC: zero instalação de pacote) |
| Arquivos alterados pelo plano | 10 — exatamente os declarados em `files_modified` |

### Contrato de sanitização de log — evidência

**A prova decisiva é o teste comportamental** (`deals.errorLog.test.js`): espião em `logger.error` + `console.error`, `util.inspect` de todos os argumentos, asserção de ausência do token sintético. Os greps abaixo são **sinal auxiliar** — eles não provam sozinhos que nenhum objeto de erro alcança o log, e não devem ser lidos como se provassem.

| Sinal auxiliar (grep) | Observado | Esperado |
|---|---|---|
| `console.error` em `routes/deals.js` | 0 | 0 |
| `logger.error('[Deals]` em `routes/deals.js` | 1 | 1 |
| `require('../logger')` em `routes/deals.js` | 1 | 1 |
| `err.message` em `routes/deals.js` | 2 (log + resposta) | 2 |
| `logger\.(error\|warn\|info\|debug)\([^)]*\berr\b[[:space:]]*[,)]` | **sem retorno** | vazio |
| `err\.(config\|request\|response\|stack)` em `routes/deals.js` | 0 | 0 |
| `AGENDOR_TOKEN\|process\.env\.AGENDOR` em `deals.errorLog.test.js` | 0 | 0 |
| `Number.isInteger` em `agendor.js` | 1 | 1 |
| `Number.parseInt(req.body.dealId` em `notifications.js` | 1 | 1 |
| `req.body.dealId \|\| 0` em `notifications.js` | 0 | 0 |
| `async function testCardHandler` / `module.exports.testCardHandler` | 1 / 1 | 1 / 1 |
| `req.body.dealId \|\| '5620'` (webUrl, IN-04 fora de escopo) | 1 | 1 (intocada) |

**Token sintético:** `AGENDOR-TOKEN-SINTETICO-DO-TESTE` (`deals.errorLog.test.js:52`) — caixa alta, com a palavra `SINTETICO`, sem formato de UUID. O teste referencia `.env` apenas em comentário e em `process.env.DB_PATH`; **não lê `process.env.AGENDOR_TOKEN` nem `backend/.env`** em nenhum ponto.

## Checkpoint C8 — aprovação humana e decisão sobre rotação

**Gate:** `blocking`, `auto_advance: false`. **Aprovado em 2026-08-04** ("Aprovado o checkpoint C8").

O usuário confirmou por escrito que nenhum `AxiosError`, `config`, `headers` ou `Authorization` completo pode chegar ao log; que o teste usa token sintético e nunca lê o real; recebeu o resultado da verificação de logs anteriores **como contagem, sem conteúdo sensível**; e autorizou a entrada no plano 04-10.

### Decisão vinculante do usuário sobre o `AGENDOR_TOKEN`

- **NÃO rotacionar** o `AGENDOR_TOKEN` neste momento.
- **SEC-01 permanece ABERTO**, como risco conscientemente aceito. Não foi marcado como resolvido em nenhum artefato (`REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, todos).
- O `AGENDOR_TOKEN` em `backend/.env` **não foi alterado**.
- O valor do token **não foi lido, impresso nem exibido** em nenhum momento deste plano.

### Higiene local executada (verificação somente leitura, sem conteúdo sensível)

Realizada pelo orquestrador durante o C8:

| Alvo | Resultado |
|------|-----------|
| Varredura em `~/.claude` (`.md`/`.json`/`.txt`) | token presente em **exatamente 1** arquivo — o `MEMORY.md` do Claude Code. Valor substituído por `[AGENDOR_TOKEN REDACTED]`; **contagem restante = 0** |
| `logs/error.log`, `logs/access.log` | **0** ocorrências do token e **0** linhas com contexto `Authorization`. Nenhum arquivo de log precisou ser removido |
| `backend/logs/`, `/opt/agendor/logs/` | **não existem** (não há servidor de produção — ver todo `ops-01`) |
| `backend/.env` | **não foi tocado nem lido** |

> **Esta limpeza local reduz cópias adicionais, mas NÃO elimina a exposição histórica do Git e NÃO encerra SEC-01.** O token continua no histórico do repositório **público** (commit `13905d4`), e apenas a rotação no painel da Agendor encerra essa exposição. O que este plano fecha é o caminho **futuro** de gravação em disco em produção — não a exposição já existente.

## Threat Model — dispositions aplicadas

| Threat ID | Disposição | Como foi tratada |
|-----------|-----------|------------------|
| T-04-09-01 (Information Disclosure — AxiosError no `pm2-error.log`) | mitigate | `logger.error` com contexto + `err.message`; teste assere token sintético ausente e `console.error` chamado 0 vezes |
| T-04-09-02 (SSRF de caminho via `getDealById`) | mitigate | Guarda `Number.isInteger(dealId) && dealId > 0`; teste assere **zero** chamadas HTTP no caminho recusado |
| T-04-09-03 (Tampering — `deal_id` textual de `req.body`) | mitigate | `Number.parseInt(req.body.dealId, 10) \|\| 0`; teste lê a linha gravada e assere `typeof === 'number'` |
| T-04-09-04 (DoS silencioso — validação quebrando o caminho legítimo) | mitigate | Caso 4 pina `getDealById('101')` → `/deals/101`; `notifications.resolved.test.js` verde sem edição |
| T-04-09-05 (Injeção de HTML/link no e-mail via `/test-card`, IN-04) | transfer | Todo `in-04-escape-html-no-test-card.md`, `priority: high` — exige mexer no template, declarado inalterado pelo contrato da fase |
| T-04-09-06 (Segredo sintético confundido com credencial pelo gate `secrets`) | mitigate | Valor em caixa alta com `SINTETICO`, sem formato de UUID; `secrets.grep.test.js` **exit 0** |
| T-04-09-SC (Supply chain) | accept | Zero instalação de pacote; `package.json` e lockfile intocados no diff do plano |

**Risco fora do registro STRIDE, aceito explicitamente pelo usuário:** exposição histórica do `AGENDOR_TOKEN` no repositório público (SEC-01) — **aceito, não mitigado, e permanece aberto**.

## Decisions Made

Ver `key-decisions` no frontmatter. O ponto central: a fase 04 já tinha reconhecido esta ameaça e a corrigido do outro lado (`agendor.js:291-292`, no 04-02, no mesmo plano que editou `routes/deals.js`) — CR-02 era inconsistência interna da fase, não defeito herdado. E em WR-03, a lição é que afinidade `INTEGER` sem `STRICT` **não é validação**: a defesa precisou existir no leitor e no escritor.

## Deviations from Plan

None — plan executed exactly as written. As duas correções de produção, o seam de teste, os dois arquivos de teste novos e os cinco todos saíram exatamente como especificados; nenhuma regra de desvio foi acionada.

## Issues Encountered

Nenhum. Os arquivos de teste vizinhos que o plano exigia manter verdes sem edição (`scheduler.failsafe.test.js` caso B3, `notifications.resolved.test.js`, `secrets.grep.test.js`) passaram sem uma linha alterada.

## User Setup Required

None — nenhuma configuração de serviço externo. **Nota operacional:** a rotação do `AGENDOR_TOKEN` foi explicitamente adiada pelo usuário no C8; `sec-01-rotate-agendor-token` segue pendente.

## Next Phase Readiness

- **04-10 autorizado** pelo C8.
- Suite em **131 testes**, todos verdes; `agendor.js` a 91,95% de linhas e `routes/deals.js` a 80%.
- **Carry-over registrado:** os 5 todos da triagem, sendo `in-04-escape-html-no-test-card` (**high**) o mais relevante — injeção de HTML/link no e-mail via `/test-card`, que este plano deliberadamente não fechou.
- **SEC-01 continua aberto** e é o risco de segurança de maior severidade em aberto no projeto.

## Self-Check: PASSED

- `backend/test/deals.errorLog.test.js` — FOUND
- `backend/test/dealId.validation.test.js` — FOUND
- `backend/src/routes/deals.js` — FOUND
- `backend/src/agendor.js` — FOUND
- `backend/src/routes/notifications.js` — FOUND
- `.planning/todos/pending/in-01-status-pending-na-ui.md` — FOUND
- `.planning/todos/pending/in-02-seams-fora-do-module-exports.md` — FOUND
- `.planning/todos/pending/in-03-comentario-emailer-timeout.md` — FOUND
- `.planning/todos/pending/in-04-escape-html-no-test-card.md` — FOUND
- `.planning/todos/pending/cr-02b-console-error-objeto-completo-em-index.md` — FOUND
- Commit `f745ad5` (RED CR-02) — FOUND
- Commit `347e51c` (GREEN CR-02) — FOUND
- Commit `6be383a` (RED WR-03) — FOUND
- Commit `e6e164f` (GREEN WR-03) — FOUND
- Commit `53e4350` (triagem) — FOUND

---
*Phase: 04-confiabilidade-das-integra-es*
*Completed: 2026-08-04*
