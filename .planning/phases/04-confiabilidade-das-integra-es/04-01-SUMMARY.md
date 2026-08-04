---
phase: 04-confiabilidade-das-integra-es
plan: 01
subsystem: testing
tags: [node-test, c8, scheduler, cron, caracterizacao, golden-test, fake-axios, nodemailer, better-sqlite3]

# Dependency graph
requires:
  - phase: 01-rede-de-testes-da-logica-critica
    provides: "helpers/fakeAxios.js, helpers/tmpDb.js, test/setup.js e a fixture synthetic/deals-page.json"
  - phase: 03-config-segredos-por-ambiente
    provides: "setup.js com NODE_ENV=test e SMTP_PASS='' sem guarda; convenção de um arquivo por variação de ambiente"
provides:
  - "backend/test/scheduler.resilience.test.js — 5 cenários que pinam os invariantes de resiliência do agendador (REL-03)"
  - "Seam aditivo module.exports.runWeeklySummary em scheduler.js (a função não era exportada)"
  - "Primeiro teste do repositório que atravessa scheduler.js ponta a ponta com as 3 bordas stubadas"
  - "Cobertura de scheduler.js de 10,65% para 63,6% — a rede que torna 04-02 e 04-06 seguros"
affects: [04-02-fail-safe-tarefas-futuras, 04-06-status-de-notificacao, 05-observabilidade, 07-refatoracao-estrutural]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Caracterização de orquestrador: runCheck REAL contra 3 bordas stubadas (HTTP via installFakeAxios, SMTP via mock.method(nodemailer), SQLite em arquivo temporário)"
    - "Injeção de falha por variável mutável de módulo lida dentro do routeHandler — o stub nunca é reinstalado após o require"
    - "Deferred controlado pelo teste para segurar uma borda e exercitar o guard de concorrência sem sleep nem timer"
    - "Seam aditivo de export com comentário box-drawing em PT-BR (padrão de routes/auth.js:361-369) aplicado pela primeira vez fora de routes/"

key-files:
  created:
    - backend/test/scheduler.resilience.test.js
  modified:
    - backend/src/scheduler.js

key-decisions:
  - "A borda que falha nos 5 cenários é /users (getUsers propaga) e não /tasks (getDealsWithFutureTasks engole), para que os testes sobrevivam ao fail-safe do 04-02"
  - "runWeeklySummary exposta por seam aditivo em vez de entrar no module.exports principal — deixa explícito que nenhum consumidor de produção a importa"
  - "mock.timers habilita apenas 'Date'; habilitar 'setTimeout' congelaria a espera entre lotes de páginas de agendor.js:143"
  - "A prova de 'a rodada não foi recusada pelo guard' é reason === undefined, não skipped === undefined: results.skipped é contagem numérica (scheduler.js:36)"
  - "Nenhuma linha de lógica de produção alterada: git diff de backend/src/ = 8 adições, 0 remoções"

patterns-established:
  - "Ordem canônica de bootstrap para testes de orquestrador: tmpDb + DB_PATH -> require('./setup') -> installFakeAxios -> stub de nodemailer -> require('../src/db') e require('../src/scheduler')"
  - "Flags de injeção de falha reatribuídas no início de cada test() — node --test isola por arquivo, não por caso"
  - "Deferred sempre liberado e aguardado antes do fim do arquivo, para não deixar promessa pendurada gravando em banco já fechado"

requirements-completed: [REL-03]

# Metrics
duration: 24min
completed: 2026-08-04
---

# Phase 4 Plan 01: Caracterização da Resiliência do Agendador Summary

**5 cenários golden que pinam o contrato de falha do `runCheck`/`runWeeklySummary` — erro registrado sem relançar, lock `isRunning` liberado no `finally`, rodada seguinte permitida e concorrente recusada — levando `scheduler.js` de 10,65% para 63,6% de cobertura sem tocar uma linha de lógica de produção.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-08-04T00:00:00Z
- **Completed:** 2026-08-04T00:24:00Z
- **Tasks:** 3 (2 de implementação + 1 checkpoint aprovado)
- **Files modified:** 2 (1 criado, 1 modificado)

## Accomplishments

- **A rede que protege o resto da fase existe.** `scheduler.js` era o arquivo com menos cobertura do backend (10,65%) e é exatamente o que os planos 04-02 e 04-06 vão alterar. Os 5 invariantes agora ficam vermelhos no CI se qualquer um deles regredir.
- **O modo de falha mais perigoso do sistema está pinado.** Um vazamento do lock `isRunning` não derruba nada — faz o guard de `scheduler.js:27` recusar toda execução seguinte, e o sistema **para de notificar em silêncio**. Os cenários 2 e 3 tornam isso impossível de passar despercebido.
- **Primeiro teste do repositório que atravessa o orquestrador ponta a ponta**, com as três bordas (HTTP Agendor, SMTP, SQLite) stubadas simultaneamente — o molde que o `scheduler.failsafe.test.js` do 04-02 vai reusar.
- **Diff de produção de 8 linhas, todas aditivas e todas comentário/export.** D-04 (somente caracterização) cumprido literalmente.
- Suíte de 78 para 83 testes, cobertura e lint verdes.

## Os 5 invariantes pinados (REL-03)

| # | Cenário | Invariante do comportamento **atual** | Linha do SUT protegida |
|---|---------|----------------------------------------|------------------------|
| 1 | Falha de borda em `/users` durante `runCheck` | `await runCheck()` **resolve**; a mensagem vai para `results.error` e a exceção **não é relançada** | `scheduler.js:171-173` (catch) |
| 2 | `getStatus().isRunning` logo após a falha | `false` — o lock é liberado mesmo no caminho de erro | `scheduler.js:174-177` (finally) |
| 3 | Segunda `runCheck()` com a borda sã | roda de verdade: `checked === 2`, `ranAt` gravado, `reason === undefined` | `scheduler.js:27` (guard não travou) |
| 4 | `runCheck()` concorrente com a primeira em voo | devolve literalmente `skipped === true` e `reason === 'Verificação já em andamento'`, sem executar | `scheduler.js:27-29` (guard) |
| 5 | `runWeeklySummary()` com a borda falhando | resolve sem lançar (`assert.doesNotReject`); comentado que ela **não tem lock** — pinado como está | `scheduler.js:242-244` (catch) |

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Seam aditivo + bootstrap do teste + cenários 1-3** — `e806bd8` (test)
2. **Task 2: Cenários 4-5 (concorrência, resumo semanal) + gate de fase** — `aab1a0c` (test)
3. **Task 3: Checkpoint C2** — sem commit (gate humano, aprovado)

## Files Created/Modified

- `backend/test/scheduler.resilience.test.js` **(criado)** — 5 cenários de caracterização de REL-03. Bootstrap canônico (tmpDb + `DB_PATH` → `setup` → `installFakeAxios` → stub de `nodemailer` → `require` de `db`/`scheduler`), relógio fixo em `2026-06-01T00:00:00.000Z` reusando `fixtures/synthetic/deals-page.json`, injeção de falha e deferred por variáveis mutáveis lidas dentro do `routeHandler`.
- `backend/src/scheduler.js` **(modificado, +8 −0)** — bloco de comentário box-drawing em PT-BR + `module.exports.runWeeklySummary = runWeeklySummary;`. Nenhuma outra linha tocada.

## Decisions Made

- **A borda que falha é `/users`, não `/tasks`.** `getUsers` (`agendor.js:16`) propaga o erro sem `catch`, enquanto `getDealsWithFutureTasks` o engole (`agendor.js:224-227`) — e é exatamente esse `catch` que o plano 04-02 vai transformar em rethrow. Falhando por `/users`, os 5 cenários continuam válidos e verdes depois do fail-safe, em vez de precisarem ser reescritos no plano seguinte.
- **Seam aditivo em vez de entrar no `module.exports` principal.** `runWeeklySummary` só é alcançada pelo cron (`scheduleTask`), nenhum consumidor de produção a importa. Um bloco separado com comentário torna essa assimetria explícita e evita sugerir que ela virou API pública do módulo.
- **`mock.timers.enable({ apis: ['Date'] })` — sem `setTimeout`.** Com `totalCount = 10` a fixture não gera segunda página, mas habilitar `setTimeout` congelaria a espera entre lotes de `agendor.js:143` caso a fixture cresça, transformando o teste num travamento silencioso.
- **O deferred é sempre liberado e aguardado.** Sem `await emAndamento` no cenário 4, a rodada terminaria depois do `after` e tentaria gravar num banco já fechado.
- **PC-13 respeitado:** nenhuma asserção toca o objeto de opções do transporte SMTP (ele carrega `auth.pass`); o stub de `nodemailer` nem captura as opções.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug no critério do plano] Asserção `r.skipped === undefined` era impossível de satisfazer**

- **Found during:** Task 1 (cenário 3 — "a execução seguinte a uma falha roda normalmente")
- **Issue:** O plano mandava asserir `r.skipped === undefined` na segunda `runCheck()`. Isso nunca poderia passar: `scheduler.js:36` inicializa `results.skipped` como **contagem numérica** (`skipped: 0`), e só o guard de `:27` devolve a flag `skipped: true`. Numa execução real `r.skipped` é sempre um número, então a asserção como escrita falharia em todo cenário de sucesso. O bug está no critério do plano, não no código de produção.
- **Fix:** Trocado pelo discriminador correto entre "execução real" e "execução recusada pelo guard": `reason === undefined` (só a recusa traz `reason`) somado a `typeof r.skipped === 'number'` (documenta explicitamente que aqui `skipped` é contagem). Reforçado com `checked === 2` e `typeof ranAt === 'string'`, que provam que a rodada de fato andou até o fim — o invariante fica pinado com mais força do que o critério original pedia. A distinção está comentada em PT-BR dentro do próprio teste.
- **Files modified:** `backend/test/scheduler.resilience.test.js`
- **Verification:** `node --test test/scheduler.resilience.test.js` verde; o cenário 4 assere `skipped === true` literal, provando que as duas formas de `skipped` estão cobertas e distinguidas.
- **Committed in:** `e806bd8` (commit da Task 1)
- **Revisão:** verificado no código pelo orquestrador (`scheduler.js:36`) e **aceito** antes da aprovação de C2.

---

**Total deviations:** 1 auto-fixed (1 correção de critério do plano — Rule 1)
**Impact on plan:** Nenhum scope creep. A correção fortalece o invariante que o plano queria pinar. Nenhum defeito de produção foi descoberto durante a caracterização, então a cláusula "registrar e parar" do contrato §6 **não foi acionada**.

## Issues Encountered

**Queda da cobertura total de branches de 72,72% para 64,87% — não é regressão.**

O `backend/.c8rc.json` usa `"all": true`. Para arquivos que nenhum processo de teste chega a carregar, o c8 sintetiza a cobertura a partir do fonte, sem dados de branch do V8 — o que infla artificialmente o percentual global de branches. Este plano é o primeiro a **carregar de fato** `scheduler.js` e `emailer.js` (via `require('../src/scheduler')`, que puxa `emailer.js`), então os branches reais e não exercitados desses dois arquivos passaram a contar. O piso de 60 continua respeitado com folga, e o número que importa subiu: `scheduler.js` de **10,65% para 63,6%**.

Consequência prática para os próximos planos: à medida que 04-02, 04-04 e 04-06 carregarem mais do `emailer.js` (hoje em 30,27%), o percentual global de branches tende a **subir de volta**. Não tratar a oscilação do total como sinal; olhar o per-file.

## User Setup Required

Nenhuma — nenhum serviço externo configurado. Os testes não fazem rede real (HTTP e SMTP stubados) e não tocam `backend/agendor.db` (`DB_PATH` aponta para arquivo temporário, removido no `after`).

## Checkpoint C2 — APROVADO

O plano tinha um `checkpoint:human-verify` bloqueante (contrato §21) autorizando a entrada no primeiro plano **comportamental** da fase.

**Evidência apresentada e verificada de forma independente pelo orquestrador:**

- `git diff --numstat HEAD~2 HEAD -- backend/src/` = `8  0  backend/src/scheduler.js` — **puramente aditivo**, zero remoções
- Único arquivo de produção tocado: `scheduler.js`
- 83 testes passando, 0 falhando (baseline 78)
- `npm run test:coverage` exit 0 — pisos 20/20/20/60 respeitados
- `npm run lint` exit 0
- `git status --porcelain backend/agendor.db` vazio — banco de desenvolvimento intocado
- Commits `e806bd8` e `aab1a0c` presentes, um por task
- Desvio Rule-1 verificado no código e aceito como correto

**Resposta do usuário: "aprovado"** — entrada no plano 04-02 (fail-safe de tarefas futuras, REL-06) autorizada.

## Verification

```
npm run test:coverage  → exit 0 | 83 tests, 83 pass, 0 fail
npm run lint           → exit 0
node --test test/scheduler.resilience.test.js → 5 tests, 5 pass

All files      | 44.6 stmts | 64.87 branch | 46.25 funcs | 44.6 lines
 scheduler.js  | 63.6       | 57.5         | 50          | 63.6      (era 10,65)

git diff --numstat backend/src/  → 8  0  backend/src/scheduler.js
git diff --name-only backend/test/ → somente scheduler.resilience.test.js
git status --porcelain backend/agendor.db → (vazio)
```

## Next Phase Readiness

- **04-02 liberado.** É o consumidor direto desta rede: vai trocar o `catch`-que-engole de `agendor.js:224-227` por rethrow, fazendo o `Promise.all` de `scheduler.js:54-58` rejeitar. Os cenários 1-3 deste plano são exatamente o oráculo de que essa rejeição continua sendo **registrada e não relançada** — e como a borda que falha aqui é `/users`, nenhum dos 5 cenários precisa ser reescrito.
- **04-06 protegido.** O plano que altera o fluxo de `status` da notificação (REL-05) mexe no bloco `scheduler.js:109-164`; os cenários 3 e 4 garantem que o lock e o guard sigam íntegros depois da mudança.
- **Molde reusável:** o bootstrap deste arquivo (3 bordas stubadas + relógio fixo + injeção por flag mutável) é o que `scheduler.failsafe.test.js` deve copiar.
- **Sem blockers.** Nenhum defeito de produção descoberto; nada foi adiado para `deferred-items.md`.
- **Atenção para o verificador de fase:** o total de branches oscila por causa do `all: true` do c8 (ver Issues Encountered). Avaliar por arquivo, não pelo agregado.

---
*Phase: 04-confiabilidade-das-integra-es*
*Completed: 2026-08-04*
