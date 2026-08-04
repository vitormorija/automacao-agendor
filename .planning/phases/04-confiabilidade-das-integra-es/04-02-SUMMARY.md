---
phase: 04-confiabilidade-das-integra-es
plan: 02
subsystem: integrations
tags:
  [
    fail-safe,
    agendor-api,
    scheduler,
    node-test,
    fake-axios,
    seam,
    rel-06,
    logger,
  ]

# Dependency graph
requires:
  - phase: 01-rede-de-testes-da-logica-critica
    provides: 'helpers/fakeAxios.js, helpers/tmpDb.js, test/setup.js e a fixture synthetic/deals-page.json'
  - phase: 04-confiabilidade-das-integra-es
    plan: 01
    provides: 'os 5 invariantes de resiliência do runCheck (erro registrado sem relançar, lock liberado no finally) — o oráculo que torna o rethrow seguro'
provides:
  - 'getDealsWithFutureTasks com contrato "Set completo ou exceção" (rethrow em vez de catch→break)'
  - 'backend/test/scheduler.failsafe.test.js — 8 casos cobrindo os 5 cenários da Decisão Q2 + os consumidores B2 e B3'
  - 'Seam aditivo module.exports.staleHandler em routes/deals.js (o handler era uma arrow anônima)'
  - 'Cobertura de agendor.js em 88,09% e de routes/deals.js em 76% (era 0% — nenhum teste carregava a rota)'
affects:
  [
    04-03-timeouts-http,
    04-06-status-de-notificacao,
    05-observabilidade,
    fase-de-ui,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Fail-safe de decisão de segurança: quando um resultado parcial é usado para decidir quem NÃO recebe ação, o contrato vira completo-ou-exceção'
    - 'Execução direta de handler Express com `res` falso mínimo (Opção A de 04-PATTERNS §Sem Análogo) — primeiro teste do repositório a executar um handler de rota'
    - 'Limpeza pontual do notification_log por segunda conexão (openRaw) para tornar um caso independente da ordem, sob relógio congelado + dedup diário'

key-files:
  created:
    - backend/test/scheduler.failsafe.test.js
    - .planning/todos/pending/ui-01-toast-de-erro-no-check.md
  modified:
    - backend/src/agendor.js
    - backend/src/routes/deals.js

key-decisions:
  - 'O log antes do rethrow passa err.message, nunca o objeto err: err.config carrega o header Authorization: Token <AGENDOR_TOKEN>'
  - 'agendor.js passa a importar ./logger (código novo usa logger, PC-11); o console.log legado de :230 fica intocado para a Fase 5'
  - 'O 500 do GET /api/deals/stale é aceito: um try/catch local reintroduziria exatamente o parcial silencioso que este plano remove'
  - 'Q2-3 ganhou pré-condição `typeof r.error === "string"` — sem ela o caso passaria também antes da correção e não mediria nada'
  - 'Q2-4 assere `reason === undefined` em vez de `skipped === undefined` (skipped é contagem numérica em execução real) — mesma correção do 04-01'
  - 'Q2-5 limpa o notification_log antes de rodar, para não depender de quantas rodadas anteriores conseguiram notificar sob relógio congelado'

patterns-established:
  - 'Seam aditivo de handler de rota: converter a arrow inline em função nomeada, registrar `router.get(path, handler)` e anexar `module.exports.<handler>` após `module.exports = router`'
  - '`res` falso mínimo com `status()`/`json()` encadeáveis que acumulam `statusCode`/`body` — sem supertest, sem nock, sem porta'
  - 'Comentário de DECISÃO acima do catch alterado, explicando o consumidor a jusante que torna o parcial perigoso'

requirements-completed: [REL-06]

# Metrics
duration: 21min
completed: 2026-08-04
---

# Phase 4 Plan 02: Fail-safe da Consulta de Tarefas Futuras Summary

**`getDealsWithFutureTasks` deixou de devolver um `Set` parcial quando a API de tarefas falha — agora propaga a exceção, e a rodada inteira aborta com ZERO notificações em vez de notificar indevidamente deals que têm tarefa futura agendada.**

## Performance

- **Duration:** 21 min
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 4 (2 criados, 2 modificados)
- **Diff de produção:** 28 adições, 4 remoções em 2 arquivos

## Accomplishments

- **O `Set` parcial acabou.** O `catch { console.error; break }` de `agendor.js:224-227` devolvia silenciosamente o que já tinha coletado, e `scheduler.js:61` usava esse `Set` como **decisão de quem NÃO é notificado**. Meia proteção significava e-mail indevido para deals já sob acompanhamento — sem nenhum sinal de que algo falhou. Agora o contrato é **completo ou exceção**.
- **A falha é observável nos três consumidores.** `runCheck` registra em `results.error` e aborta com 0 envios; `runCheckOnly` rejeita e vira 500 na rota `/check`; `GET /api/deals/stale` vira 500 `{ error }` (decisão humana aceita).
- **Os 5 invariantes do 04-01 continuam verdes** — o rethrow chega exatamente no `catch` de `scheduler.js:171` que o plano anterior pinou, e nenhum dos 5 cenários precisou ser reescrito. A escolha do 04-01 de falhar por `/users` em vez de `/tasks` se pagou.
- **Primeiro handler Express executado por teste no repositório**, sem `supertest`/`nock` e sem subir porta.
- **Suíte de 83 para 91 testes.** Cobertura total de branches **subiu** de 64,87% para 66,27%; `agendor.js` em 88,09%, `routes/deals.js` de 0% (sintetizado) para 76%, `scheduler.js` de 63,6% para 67,27%.
- **Nenhum teste pré-existente editado** — confirma o Achado 1 da pesquisa (o golden WR-02 nunca exercitava o `catch` alvo, então o risco R-12 do contrato realmente não existia).

## Inventário de consumidores do comportamento alterado

| #  | Local                                        | Uso do `Set`                              | Efeito observado (pinado por teste)                                                            |
| -- | -------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| B1 | `scheduler.js:57` (`runCheck`)                | **Decisão de segurança** — filtro de `:61` | `Promise.all` rejeita → `results.error` preenchido → `finally` libera o lock → **0 notificações, 0 linhas no log**. Cenários Q2-1/Q2-2/Q2-3 |
| B2 | `scheduler.js:293` (`runCheckOnly`)            | Mesmo filtro, sem envio                    | Rejeita; `POST /api/notifications/check` já tem try/catch → 500 `{ error }`. Cenário B2         |
| B3 | `routes/deals.js:17` (`GET /api/deals/stale`)  | Apenas decorativo (`hasFutureTask`)        | Rejeita; catch de `:31-34` responde **500 `{ error }`**. A aba "Negócios" não carrega enquanto `/tasks` falhar — **aceito**. Cenário B3 |

## Os 7 cenários (8 casos de teste)

| #     | Cenário                                                              | RED (antes) | GREEN (depois) |
| ----- | -------------------------------------------------------------------- | ----------- | -------------- |
| Q2-1  | `/tasks` falha → 0 envios de e-mail e `getNotificationLogs().total === 0` | ✗ falhou    | ✓              |
| Q2-2  | `/tasks` falha → `results.error` é string não vazia com a mensagem     | ✗ falhou    | ✓              |
| Q2-3  | `/tasks` falha → `getStatus().isRunning === false`                     | ✗ falhou    | ✓              |
| B2    | `/tasks` falha → `runCheckOnly()` **rejeita**                          | ✗ falhou    | ✓              |
| B3    | `/tasks` falha → `staleHandler` responde 500 `{ error }`, sem chave `ok` | ✗ falhou    | ✓              |
| B3-b  | O seam não quebra o contrato do router (`typeof router === 'function'`) | ✓ já passava | ✓              |
| Q2-5  | Caminho feliz idêntico: deal 101 filtrado por tarefa futura, 103 notificado | ✓ já passava | ✓              |
| Q2-4  | Depois da rodada abortada, a rodada seguinte executa normalmente        | ✓ já passava | ✓              |

O passo RED foi verificado literalmente: `node --test test/scheduler.failsafe.test.js` saiu ≠ 0 com **5 falhas — exatamente Q2-1, Q2-2, Q2-3, B2 e B3** — antes de qualquer linha de `agendor.js` ser tocada, e o resto da suíte (86 de 91) permaneceu verde.

## Task Commits

1. **Task 1 — RED: seam `staleHandler` + os 7 cenários** — `58bb7f3` (`test`)
2. **Task 2 — GREEN: rethrow em `getDealsWithFutureTasks` + todo de UI** — `59f9fc5` (`fix!`)

## Files Created/Modified

- `backend/src/agendor.js` **(modificado, +13 −2)** — `require('./logger')` no topo; o `catch` de `getDealsWithFutureTasks` troca `console.error` + `break` por `logger.error('[Agendor] Erro ao buscar tarefas futuras:', err.message)` + `throw err`, precedido de um comentário de DECISÃO em PT-BR que nomeia o consumidor a jusante (`scheduler.js:61`) e explica por que parcial é pior que falha. `fetchDealsPage`, `getStaleDeals`, o cache, o `console.log` legado de `:230` e o `module.exports` **intocados**.
- `backend/src/routes/deals.js` **(modificado, +15 −2)** — arrow inline vira `async function staleHandler(req, res)` com **corpo idêntico byte a byte**; rota registrada como `router.get('/stale', staleHandler)`; bloco box-drawing + `module.exports.staleHandler` após `module.exports = router`. O shape `{ error: err.message }` e o `console.error(err)` preservados.
- `backend/test/scheduler.failsafe.test.js` **(criado, 337 linhas)** — teste do **novo fluxo**. Bootstrap canônico (tmpDb + `DB_PATH` → `setup` → `installFakeAxios` → stub de `nodemailer` com contador de envios → `require` de `db`/`scheduler`/`routes/deals`), relógio fixo em `2026-06-01T00:00:00.000Z`, fixture `synthetic/deals-page.json` reusada, falha injetada por flag mutável lida **dentro** do `routeHandler`.
- `.planning/todos/pending/ui-01-toast-de-erro-no-check.md` **(criado)** — a consequência de UI conhecida e deixada fora de escopo.

## Decisions Made

- **Só `err.message` no log, nunca o `err` cru** (T-04-02-04). O objeto de erro do axios carrega `config.headers.Authorization: Token <AGENDOR_TOKEN>`; `logger.js:16-17` expandiria um `Error` para o `.stack`, mas qualquer futuro `logger.error(..., err)` vazaria o token via `JSON.stringify` do objeto. A frase em PT-BR e a tag `[Agendor]` foram preservadas do log antigo — só o transporte mudou (`console.error` → `logger.error`), porque é **código novo** (PC-11).
- **O comentário explica a DECISÃO, não a mecânica.** Ele nomeia `scheduler.js:61` como o consumidor que transforma um `Set` parcial em e-mail indevido — sem isso, um leitor futuro veria só "propaga erro" e poderia reintroduzir o `catch` por parecer mais robusto.
- **Nenhum `try/catch` local em `routes/deals.js`.** Seria a reação instintiva ao 500, e reintroduziria exatamente o parcial silencioso que o plano remove. `DealsList.jsx:80` já exibe a mensagem de erro, então nada quebra em silêncio.
- **A borda que falha é `/tasks`** — o espelho do 04-01, que falha por `/users` justamente para sobreviver a esta mudança. Os dois arquivos juntos cobrem as duas metades do contrato de falha do `runCheck`.
- **PC-13 respeitado:** o stub de `nodemailer` não captura nem assere o objeto de opções (carrega `auth.pass`); só conta invocações de `sendMail`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug no critério do plano] `skipped === undefined` no cenário Q2-4 é impossível de satisfazer**

- **Found during:** Task 1 (redação do cenário Q2-4)
- **Issue:** O plano (e o esqueleto do 04-RESEARCH §Code Examples) mandava asserir `r.skipped === undefined` na rodada seguinte à falha. `scheduler.js:36` inicializa `results.skipped` como **contagem numérica** (`skipped: 0`); só o guard de `:27` devolve a flag `skipped: true`. Numa execução real `r.skipped` é sempre um número, então a asserção falharia em todo cenário de sucesso. É o **mesmo defeito de critério já encontrado e corrigido no 04-01**.
- **Fix:** Trocado pelo discriminador correto entre "execução real" e "execução recusada pelo guard": `reason === undefined`, somado a `typeof r.skipped === 'number'` (documenta que aqui `skipped` é contagem). Reforçado com `checked === 1` e `typeof ranAt === 'string'`, que provam que a rodada de fato andou. A distinção está comentada em PT-BR no próprio teste, com referência ao 04-01.
- **Files modified:** `backend/test/scheduler.failsafe.test.js`
- **Committed in:** `58bb7f3`

---

**2. [Rule 1 - Critério vago] O cenário Q2-3, como escrito no plano, passaria também ANTES da correção**

- **Found during:** Task 1 (verificação do passo RED)
- **Issue:** O plano especificava Q2-3 como `getStatus().isRunning === false` e listava esse cenário entre os que **devem falhar** no RED. Não falharia: antes do fail-safe a rodada terminava **com sucesso**, e o `finally` de `scheduler.js:174` já liberava o lock. O caso seria verde nos dois estados e não mediria nada — um teste que não pode ficar vermelho não é rede de segurança.
- **Fix:** Adicionada uma pré-condição explícita antes da asserção do lock: `typeof r.error === 'string'` ("a rodada precisa ter falhado para o caso dizer algo sobre o lock"). Com isso o cenário passa a medir o invariante certo — **liberação do lock no caminho de falha** — e fica vermelho no RED pelo motivo correto, como o plano pretendia. Comentado em PT-BR no teste.
- **Files modified:** `backend/test/scheduler.failsafe.test.js`
- **Verification:** RED produziu exatamente as 5 falhas previstas pelo plano (Q2-1, Q2-2, Q2-3, B2, B3).
- **Committed in:** `58bb7f3`

---

**3. [Rule 3 - Determinismo do teste] Q2-5 precisou limpar o `notification_log` antes de rodar**

- **Found during:** Task 1 (montagem do cenário de caminho feliz)
- **Issue:** O relógio está congelado em `2026-06-01` e `alreadyNotifiedToday` (`db.js:223`) dedupa por dia. Como os casos rodam em ordem no mesmo processo, o resultado de Q2-5 ("o deal sem tarefa futura é notificado") dependeria de quantas rodadas **anteriores** conseguiram notificar o deal 103 — e isso **muda entre RED e GREEN** (no RED as rodadas de Q2-1..B3 não abortam e gravam no log). O caso ficaria vermelho no RED por contaminação, não por defeito, poluindo o sinal do passo RED.
- **Fix:** `limparNotificationLog()` — `DELETE FROM notification_log` por uma **segunda conexão** ao mesmo arquivo (`openRaw`, padrão de `db.dedup.test.js:62-82`), chamado no início de Q2-5. Torna o caso independente de ordem e idêntico nos dois estados. Nenhuma função nova em `db.js`.
- **Files modified:** `backend/test/scheduler.failsafe.test.js`
- **Committed in:** `58bb7f3`

---

### Ajustes de forma (sem impacto no contrato)

**4. O símbolo `staleHandler` não existia — extração nomeada era pré-requisito, não escolha**

O plano cita "`routes/deals.js` `staleHandler`" como se já existisse. Não existia: o handler era uma **arrow anônima** registrada direto em `router.get('/stale', ...)` (`deals.js:11`). A extração foi feita como o plano manda na Parte A — puramente estrutural, **corpo idêntico byte a byte**, verificado por `git diff` (as únicas linhas alteradas são a assinatura, o registro da rota e o bloco de seam aditivo no fim). Já estava dentro de `files_modified`, então não há scope creep.

**5. 8 casos de teste para 7 cenários**

O plano pedia a asserção `typeof require('../src/routes/deals') === 'function'` **dentro** do cenário B3. Ela foi separada num caso próprio (`(B3) o seam não quebra o contrato do router`), seguindo literalmente o precedente de `config.route.smtpPass.test.js:49-52`, onde essa verificação é um `test()` autônomo. Motivo prático: ela é a única asserção do arquivo que **não** depende da borda falhar, e misturá-la ao B3 tornaria a falha ambígua. Todos os 7 cenários do plano estão cobertos.

---

**Total deviations:** 3 auto-fixed (2 correções de critério do plano — Rule 1; 1 de determinismo — Rule 3) + 2 ajustes de forma
**Impact on plan:** Nenhum scope creep. As duas correções de critério **fortalecem** os invariantes que o plano queria pinar. Nenhum defeito de produção inesperado foi descoberto.

## Issues Encountered

**Um warning novo de lint (44 → 45 no backend), deliberadamente não corrigido.**

Nomear o handler fez o Biome enxergar `req` como parâmetro não usado (`lint/correctness/noUnusedFunctionParameters`, `deals.js:11:29`) — a mesma variável já era ignorada na arrow anônima, mas ali a regra não dispara. A correção sugerida (`_req`) contraria o critério de aceite do plano, que fixa literalmente a assinatura `async function staleHandler(req, res)`, e `(req, res)` é a convenção do Express usada em todo o repositório. `npm run lint` continua saindo **0** (o baseline é tolerante a warnings por decisão registrada no `CLAUDE.md`). Registrado aqui para que a Fase 5 não interprete o +1 como regressão silenciosa.

**Cobertura: avaliar por arquivo, não pelo agregado.** Como previsto no 04-01, o total de branches **subiu** (64,87% → 66,27%) porque este plano carrega de verdade mais de `agendor.js` e `routes/deals.js`. `routes/deals.js` saiu de 0% sintetizado (`all: true`) para 76% real. As 11 linhas que sobram (`:19-30`) são o caminho de sucesso da rota, que nenhum cenário deste plano exercita — o plano é sobre a falha.

## Threat Flags

Nenhuma superfície de segurança nova fora do `<threat_model>` do plano. As disposições registradas foram cumpridas:

- **T-04-02-01 (mitigate)** — `throw err` implementado; Q2-1 prova 0 notificações na falha, Q2-5 prova filtro idêntico no sucesso.
- **T-04-02-02 (mitigate)** — `results.error` preenchido e `lastRunResult` atualizado; Q2-2 assere.
- **T-04-02-03 (accept)** — 500 do `/stale` aceito e **pinado** pelo cenário B3 (shape `{ error }`, sem chave `ok`).
- **T-04-02-04 (mitigate)** — o `logger.error` recebe `err.message`, nunca `err` nem `err.config`; verificado por grep.
- **T-04-02-05 (accept)** — rodada perdida por erro transitório: a cadência diária recupera; rollback = revert de `59f9fc5`.
- **T-04-02-SC (accept)** — nenhuma instalação de pacote; `package.json`/`package-lock.json` intocados.

## User Setup Required

Nenhuma. Os testes não fazem rede real (HTTP e SMTP stubados) e não tocam `backend/agendor.db` (`git status --porcelain backend/agendor.db` vazio).

## Verification

```
node --test test/scheduler.failsafe.test.js  (RED, antes da correção)  → exit ≠ 0 | 5 falhas: Q2-1, Q2-2, Q2-3, B2, B3
npm test                                     (RED)                     → 91 tests, 86 pass, 5 fail (só o arquivo novo)
node --test test/scheduler.failsafe.test.js  (GREEN)                   → 8 tests, 8 pass, 0 fail
node --test test/scheduler.resilience.test.js (04-01, pós-mudança)     → 5 tests, 5 pass, 0 fail
npm run test:coverage                                                  → exit 0 | 91 tests, 91 pass, 0 fail
npm run lint                                                           → exit 0 (45 warnings, +1 conhecido)

All files          | 46.83 stmts | 66.27 branch | 50 funcs | 46.83 lines   (pisos 20/60/20/20)
 agendor.js        | 88.09       | 74.07        | 100      | 88.09
 scheduler.js      | 67.27       | 59.09        | 66.66    | 67.27   (era 63,6)
 routes/deals.js   | 76          | 50           | 100      | 76      (era 0, sintetizado)

grep -n "throw err" backend/src/agendor.js                          → 114 (fetchDealsPage) e 237 (getDealsWithFutureTasks)
grep -c "console.error('[Agendor] Erro ao buscar tarefas futuras"   → 0
grep -c "require('./logger')" backend/src/agendor.js                → 1
console.log fora de comentário em agendor.js                        → 1 (só o legado de :230)
grep -c "module.exports.staleHandler" backend/src/routes/deals.js   → 1
grep -c "res.status(500).json({ error: err.message })"              → 1 (shape preservado)
grep -E "supertest|nock" backend/test/scheduler.failsafe.test.js    → (vazio)
git diff --name-only 283474f HEAD -- backend/test/                  → somente scheduler.failsafe.test.js
git diff --numstat 283474f HEAD -- backend/src/                     → 13/2 agendor.js, 15/2 routes/deals.js
git status --porcelain backend/agendor.db                           → (vazio)
```

## Next Phase Readiness

- **04-03 liberado — e este plano era pré-requisito dele.** O timeout de 15s torna o caminho de falha de `/tasks` **alcançável por lentidão**, não só por erro da API. Com o fail-safe já no lugar, o timeout não pode transformar uma resposta lenta em notificação indevida. A dependência dura do contrato §14 está satisfeita.
- **Erro de teste já calibrado para o 04-03:** a injeção usa `code: 'ECONNABORTED'` e `timeout of 15000ms exceeded` — a forma exata que o adaptador HTTP do axios produz (`transitional.clarifyTimeoutError` é `false` por padrão). O 04-03 pode reusar `erroDeBorda()` como molde.
- **04-06 protegido.** Ele altera `scheduler.js:109-164`; os cenários Q2-1 (0 linhas no log na rodada abortada) e Q2-5 (o deal notificado grava exatamente uma linha) somam-se aos do 04-01 como oráculo do fluxo de `status`.
- **Molde novo disponível:** `staleHandler` + `resFalso()` é a receita para testar qualquer handler Express sem `supertest`. O 04-03 tem `notifications.resolved.test.js` na mesma situação (04-PATTERNS §Sem Análogo Direto, Opção A).
- **Pendência registrada:** `ui-01-toast-de-erro-no-check` — o Dashboard mostra toast **verde** ("undefined negócio(s) parado(s) encontrado(s)") sob resposta 500. Defeito pré-existente de frontend tornado alcançável por este plano; UI está fora do escopo da Fase 4 por decisão do 04-CONTEXT.
- **Sem blockers.** Nada adiado para `deferred-items.md`.

## Self-Check: PASSED

- `backend/src/agendor.js` — FOUND
- `backend/src/routes/deals.js` — FOUND
- `backend/test/scheduler.failsafe.test.js` — FOUND
- `.planning/todos/pending/ui-01-toast-de-erro-no-check.md` — FOUND
- Commit `58bb7f3` — FOUND
- Commit `59f9fc5` — FOUND

---

_Phase: 04-confiabilidade-das-integra-es_
_Completed: 2026-08-04_
