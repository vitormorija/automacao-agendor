---
phase: 04-confiabilidade-das-integra-es
plan: 11
subsystem: integrations
tags:
  [
    gap-closure,
    wr-02,
    retry,
    rate-limit,
    agendor-api,
    fail-safe,
    node-test,
    fake-timers,
    rel-06,
  ]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    plan: 02
    provides: 'o contrato "Set completo ou exceção" de getDealsWithFutureTasks — é ele que transforma um 429 transitório em rodada abortada, e é ele que este plano NÃO afrouxa'
  - phase: 04-confiabilidade-das-integra-es
    plan: 03
    provides: 'o teto de tempo de 15s (D-01) e o molde de erro ECONNABORTED sem err.response — a fronteira que mantém timeout fora do retry'
  - phase: 04-confiabilidade-das-integra-es
    plan: 10
    provides: 'backend/test/helpers/fakeTimers.js (avancarRelogioAte) — avanço de relógio falso portátil para Node 20'
provides:
  - 'fetchWithRetry: política ÚNICA de retry da borda Agendor (só 429, 3 tentativas, 5s/10s), compartilhada por fetchDealsPage e getDealsWithFutureTasks'
  - 'backend/test/agendor.retry429.test.js — 4 casos: 429 retentado em /tasks, exaustão que propaga, timeout fora do retry, e caracterização do 429 em /deals'
  - 'Cobertura de agendor.js em 93,71% de linhas e 85,57% de branches'
affects: [05-observabilidade, 07-refatoracao]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Política de borda extraída para helper com caracterização do consumidor ANTERIOR escrita antes da extração (o golden vira o oráculo da refatoração)'
    - 'Relógio falso rearmado em beforeEach quando o próprio SUT avança o tempo — sem isso o avanço de um caso contamina o cutoff de datas do caso seguinte'
    - 'Envelope local que normaliza o desfecho (sucesso/falha) antes de entregar a promessa a avancarRelogioAte, para que assert.rejects continue sendo o oráculo'

key-files:
  created:
    - backend/test/agendor.retry429.test.js
  modified:
    - backend/src/agendor.js

key-decisions:
  - 'A política de 429 virou UM helper (fetchWithRetry) em vez de uma terceira cópia do laço: mesma borda, mesmo módulo, dois consumidores'
  - 'A lógica do laço foi copiada byte a byte de fetchDealsPage — nenhuma constante, condição ou tempo de espera mudou; o caso 4 é o oráculo disso'
  - 'Timeout continua FORA do retry (D-01): é a ausência de err.response que o mantém fora, e o caso 3 pina isso do lado de /tasks'
  - 'A exaustão continua propagando — retentar não é engolir; o contrato Q2 do 04-02 (Set completo ou exceção) permanece intacto e scheduler.failsafe.test.js rodou sem edição'
  - 'getUsers deliberadamente SEM retry: é a borda que scheduler.resilience.test.js usa para falhar'

patterns-established:
  - 'Caracterizar o consumidor existente ANTES de extrair a política compartilhada: o caso que já passa é o que impede a extração de mudar a regra sem querer'
  - 'beforeEach com mock.timers.reset() + enable() quando o caminho sob teste consome tempo (reset antes, porque enable lança se já habilitado)'

requirements-completed: [REL-06]

# Metrics
duration: 22min
completed: 2026-08-04
---

# Phase 4 Plan 11: Retry de 429 na Consulta de Tarefas Futuras Summary

**Um HTTP 429 transitório em `/tasks` deixou de custar 24 horas sem nenhuma notificação: `getDealsWithFutureTasks` passou a herdar a mesma política de retry que `/deals` já tinha, agora em um único lugar (`fetchWithRetry`), sem afrouxar o fail-safe "Set completo ou exceção" do 04-02.**

## Performance

- **Duration:** 22 min
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 2 (1 criado, 1 modificado)
- **Diff de produção:** 39 adições, 12 remoções em 1 arquivo (`backend/src/agendor.js`)

## Accomplishments

- **WR-02 fechado.** Desde o 04-02 qualquer falha de `getDealsWithFutureTasks` **aborta a rodada inteira** (pinado por `scheduler.failsafe.test.js` Q2-1: zero e-mails, zero linhas de log). Como o cron é diário, um 429 — o erro que a API usa justamente para dizer "tente de novo" — significava **24h de silêncio**, sem retry e sem alerta. Agora a requisição é retentada 3 vezes antes de a falha virar explícita.
- **A política de 429 da borda Agendor existe em UM lugar.** `fetchWithRetry(fn, retries = 3)` é a única ocorrência de `err.response?.status === 429` e da espera `(attempt + 1) * 5000` em todo o `agendor.js` — verificado por grep nos critérios de aceite. Antes da mudança havia uma cópia; a alternativa (copiar o laço para `/tasks`) criaria um **segundo lugar para a mesma regra divergir**, dentro do mesmo módulo e da mesma borda.
- **A extração veio protegida por caracterização escrita ANTES dela.** O caso 4 (`/deals` devolve 429 uma vez → golden `[101, 103]` com exatamente 2 requisições à página 1) **já passava no RED** e é o oráculo que impediria a extração de mudar condição, número de tentativas ou tempo de espera sem ninguém notar.
- **O fail-safe de REL-06 não foi afrouxado.** O caso 2 assere que, esgotadas as tentativas, a chamada **rejeita** — e exatamente após 3 requisições. `scheduler.failsafe.test.js` rodou **sem uma linha editada**.
- **Timeout continua fora do retry (D-01).** O caso 3 é o espelho, do lado de `/tasks`, do caso (5) de `agendor.timeout.test.js`: um erro sem `err.response` propaga na **primeira** requisição. Se alguém "melhorar" o retry para cobrir erros de rede, o pior caso desta consulta saltaria de ~15s para ~60s — comendo a janela do cron que o teto de tempo existe para proteger.
- **Suíte de 135 para 139 testes**, todos verdes. `agendor.js` em **93,71%** de linhas e **85,57%** de branches; branches do agregado em **80,81%** (piso 60).

## Os 4 casos

| # | Cenário                                                                   | RED (antes)          | GREEN (depois) |
| - | ------------------------------------------------------------------------- | -------------------- | -------------- |
| 1 | 429 transitório em `/tasks` → Set completo com `101`, **2 requisições**    | ✗ rejeitou com 429   | ✓              |
| 2 | 429 sempre → **rejeita** após **exatamente 3** requisições                 | ✗ contagem 1, não 3  | ✓              |
| 3 | timeout (`ECONNABORTED`, sem `response`) → rejeita na **1ª** requisição    | ✓ já passava         | ✓              |
| 4 | 429 em `/deals` → golden `[101, 103]` com **2** requisições à página 1     | ✓ já passava         | ✓              |

O passo RED foi verificado **duas vezes**: na Task 1 contra o `agendor.js` intocado, e de novo após a correção de determinismo da Task 2 (restaurando temporariamente o `agendor.js` da `HEAD` anterior, rodando, e devolvendo a versão corrigida). Nas duas vezes o resultado foi idêntico: **falham exatamente os casos 1 e 2**; 3 e 4 passam.

## Task Commits

1. **Task 1 — RED: 4 casos, com o 429 de `/deals` caracterizado** — `a5470cd` (`test`)
2. **Task 2 — GREEN: `fetchWithRetry` nos dois consumidores** — `46c7a2a` (`fix`)

## Files Created/Modified

- `backend/src/agendor.js` **(modificado, +39 −12)** — três mudanças:
  1. `async function fetchWithRetry(fn, retries = 3)` criada **imediatamente acima** de `fetchDealsPage`, com o laço copiado byte a byte (`for (let attempt = 0; attempt < retries; attempt++)`, `err.response?.status === 429 && attempt < retries - 1`, `const wait = (attempt + 1) * 5000`, `throw err` fora da condição). Comentário em PT-BR acima explica a **decisão** (por que só 429, por que timeout fica fora, por que helper e não cópia), não a mecânica. **Não** entra no `module.exports` — última ocorrência do símbolo na linha 300, `module.exports = {` na 342.
  2. `fetchDealsPage(page, perPage, retries = 3)` reduzida a uma expressão sobre `fetchWithRetry`, repassando `retries`. **Assinatura e valor de retorno inalterados** (continua devolvendo `data`, o envelope da Agendor).
  3. Em `getDealsWithFutureTasks`, o `api.get('/tasks', ...)` direto virou `await fetchWithRetry(() => api.get('/tasks', {...}))`. **Todo o resto do laço é idêntico**: o `try/catch` externo, o `logger.error(..., err.message)` e o `throw err` permanecem, e o comentário-bloco de contrato ganhou uma frase dizendo que o 429 agora é retentado **antes** de a falha virar explícita e que só a exaustão aborta a rodada.

  Também atualizado o comentário de topo do arquivo (D-01), que ainda apontava o retry como pertencente a `fetchDealsPage` em números de linha já obsoletos. `getUsers`, `getOrgCategory`, `getDealById`, `getStaleDeals` e o bloco `module.exports` **intocados** — confirmado pelos hunks do `git diff -U1`.

- `backend/test/agendor.retry429.test.js` **(criado, 223 linhas)** — bootstrap canônico (`require('./setup')` → `installFakeAxios` → `require('../src/agendor')`), relógio falso com `apis: ['Date', 'setTimeout']` em `2026-06-01T00:00:00.000Z`, estado mutável de módulo lido **dentro** do `routeHandler` (contadores `chamadasTasks`/`chamadasDeals` e modos `modoTasks`/`modoDeals`), erros injetados fiéis ao axios (429 **com** `response.status`; timeout **sem** `response`). Reusa a fixture `synthetic/deals-page.json` e o mapa `ORG_CATEGORY` do golden de `getStaleDeals`.

## Decisions Made

- **Helper, não terceira cópia.** O repositório já tem duas implementações de retry manual (`fetchDealsPage`, borda HTTP; `sendMailWithRetry`, borda SMTP — domínios diferentes, duplicação aceita). Uma terceira **dentro do mesmo módulo e da mesma borda** seria o lugar onde a política divergiria em silêncio. A extração é contida (uma função, um arquivo) e chegou com caracterização prévia, então não é refatoração estrutural de arquitetura.
- **Cópia byte a byte, deliberadamente.** Nenhuma constante, condição ou tempo de espera mudou. Tentações rejeitadas: jitter, backoff exponencial, cobrir 503. Todas alterariam o pior caso de tempo da rodada sem teste que justificasse — e o plano é sobre não perder a rodada, não sobre otimizá-la.
- **Timeout permanece fora do retry** e agora está pinado **nos dois consumidores**: `agendor.timeout.test.js` caso (5) para `/deals`, caso 3 deste arquivo para `/tasks`.
- **`getUsers` continua sem retry.** Está fora do achado, e é a borda que `scheduler.resilience.test.js` usa para falhar — dar retry a ela mudaria o significado daquele arquivo.
- **Retentar não é engolir.** O contrato Q2 do 04-02 permanece literal: o `Set` sai completo ou não sai. O retry só adia a explicitação da falha em, no máximo, 15s.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Determinismo do teste] O relógio falso avançado por um caso contaminava o golden do caso seguinte**

- **Found during:** Task 2 (primeira execução GREEN)
- **Issue:** O plano especificava `before(() => mock.timers.enable(...))` — habilitação **única** para o arquivo. Mas avançar o tempo é justamente o mecanismo que faz as esperas do retry resolverem: cada caso que retenta **deixa o relógio adiantado** (10s por `tick`) para o próximo. No RED isso era invisível (nada retentava, então nada avançava); no GREEN, o caso 4 rodava com `now` já em `00:00:30`, o `cutoffDate` de 15 dias andava junto, e os deals **102** e **104** — que existem na fixture exatamente para pinar a fronteira estrita do dia — entravam no resultado. O golden vinha `[101, 102, 103, 104]`. O caso ficaria vermelho por **contaminação de ordem**, não por defeito de produção, e a leitura óbvia ("a extração quebrou o golden") seria falsa.
- **Fix:** `mock.timers.reset()` + `mock.timers.enable({ apis: ['Date', 'setTimeout'], now: FIXED_NOW })` movidos para o `beforeEach` (reset **antes**, porque `enable()` lança se os timers já estiverem habilitados); o `before` foi removido e o `after` com `reset()` permaneceu. Comentado em PT-BR no próprio teste, nomeando o mecanismo. É a mesma classe de correção do desvio 3 do 04-02 (independência de ordem sob relógio congelado).
- **Files modified:** `backend/test/agendor.retry429.test.js`
- **Verification:** com a correção aplicada, o RED foi **reexecutado** contra o `agendor.js` da `HEAD` anterior e produziu exatamente as mesmas 2 falhas previstas (casos 1 e 2). A correção não amolece o RED.
- **Committed in:** `46c7a2a`

---

**2. [Rule 3 - Blocking] `avancarRelogioAte` não observa rejeições, e 3 dos 4 casos rejeitam**

- **Found during:** Task 1 (redação dos casos 2 e 3)
- **Issue:** `helpers/fakeTimers.js:29` só encadeia o caminho de **sucesso** (`promessa.then((valor) => { concluida = true; ... })`). Numa rejeição a flag nunca vira `true`, o laço estoura as 20 iterações e lança `'a promessa não concluiu após avançar o relógio falso'` — **substituindo** o erro 429 que o caso mede, e ainda deixando a promessa derivada rejeitada sem handler. O plano prescrevia `assert.rejects(() => avancarRelogioAte(...), /429/)`, que nunca casaria com `/429/`.
- **Fix:** envelope local `avancarRelogioAteDesfecho(promessa)` no próprio arquivo de teste: normaliza o desfecho para um **valor** (`{ tipo: 'sucesso' | 'falha' }`), deixa o helper avançar o relógio, e só então relança. `assert.rejects` continua sendo o oráculo. **O helper compartilhado não foi editado** — ele é oráculo estável do 04-10, e o critério de aceite do plano exige que `git diff backend/test/` mostre apenas o arquivo novo. Estendê-lo/dedupá-lo (junto com a cópia local de `emailer.timeout.test.js`) fica registrado aqui como trabalho futuro.
- **Files modified:** `backend/test/agendor.retry429.test.js`
- **Committed in:** `a5470cd`

---

### Ajustes de forma (sem impacto no contrato)

**3. O caso 3 usa o envelope de avanço de relógio, embora hoje não precise**

O plano escrevia o caso do timeout como `assert.rejects(() => getDealsWithFutureTasks(), ...)`, sem avanço de relógio — correto para o comportamento atual, já que um timeout propaga na primeira tentativa. O risco está no **futuro**: com `setTimeout` mockado, se alguém alargar o retry para cobrir erros de rede, a espera nunca é tickada, a promessa nunca se acomoda e o caso **trava a suíte** em vez de falhar (`node:test` não impõe timeout por caso). Com o envelope, esse mesmo cenário produz uma falha legível na asserção `chamadasTasks === 1`. A asserção do plano foi preservada integralmente.

**4. Comentário de topo do `agendor.js` atualizado**

O bloco de D-01 (`:15-18`) dizia "o retry de 429 **de fetchDealsPage** (`:101-117`)" — referência que a extração tornaria falsa, com números de linha já obsoletos desde o 04-03. Passou a apontar a política da borda (`fetchWithRetry`). Mudança apenas de comentário, fora das funções que o critério de aceite protege.

---

**Total deviations:** 2 auto-fixed (Rule 3 — determinismo e bloqueio de ferramenta) + 2 ajustes de forma
**Impact on plan:** Nenhum scope creep, nenhum arquivo além dos dois previstos. Nenhum defeito de produção inesperado foi descoberto — os dois desvios são de **infraestrutura de teste**, e o segundo expõe uma limitação real do helper do 04-10 que vale registrar para a Fase 5/7.

## Issues Encountered

**Lint estável em 45 warnings** (o mesmo baseline desde o 04-02). Nenhum warning novo: `fetchWithRetry` não introduz parâmetro não usado nem sombra de nome.

**Cobertura subiu onde o plano tocou.** `agendor.js` foi de 88,09% (medido no 04-02) para **93,71%** de linhas e de 74,07% para **85,57%** de branches — o novo arquivo exercita os dois ramos do retry (retenta / propaga) em ambos os consumidores, que antes só eram alcançados pelo caminho feliz. As linhas remanescentes (`42-43`, `224-234`, `238-246`) são o `catch` de `getOrgCategory` e o laço de lotes de páginas, fora do escopo deste plano.

## Threat Flags

Nenhuma superfície de segurança nova fora do `<threat_model>` do plano. As disposições registradas foram cumpridas:

- **T-04-11-01 (mitigate)** — `fetchWithRetry` aplicado a `/tasks`; caso 1 prova conclusão após a retentativa (2 requisições, Set com o deal 101).
- **T-04-11-02 (mitigate)** — limite de 3 tentativas preservado byte a byte; caso 2 assere exatamente 3 requisições **e** a propagação da falha.
- **T-04-11-03 (mitigate)** — caso 4 caracterizou o 429 de `/deals` **antes** da extração; greps confirmam **uma** ocorrência de `err.response?.status === 429` e **uma** de `(attempt + 1) * 5000` fora de comentários.
- **T-04-11-04 (mitigate)** — caso 3 assere 1 requisição para erro sem `err.response`; `agendor.timeout.test.js` rodou sem edição.
- **T-04-11-05 (mitigate)** — `catch` externo com `throw err` e o comentário de contrato permanecem; `scheduler.failsafe.test.js` rodou sem edição.
- **T-04-11-SC (accept)** — nenhuma instalação de pacote; `backend/package.json` e `backend/package-lock.json` intocados (`git diff --name-only` vazio para ambos).

**SEC-01 permanece ABERTO** como risco conscientemente aceito (decisão C8 do usuário). Nada neste plano o toca: o `AGENDOR_TOKEN` não foi lido, impresso nem alterado, e o `backend/.env` não foi acessado.

## User Setup Required

Nenhuma. Os testes não fazem rede real (borda HTTP stubada) e não tocam `backend/agendor.db` (`git status --porcelain backend/agendor.db` vazio).

## Verification

```
node --test test/agendor.retry429.test.js  (RED, antes da correção)   → exit 1 | 4 tests, 2 pass, 2 fail (casos 1 e 2)
node --test test/agendor.retry429.test.js  (RED, reexecutado)         → exit ≠ 0 | mesmas 2 falhas (casos 1 e 2)
node --test test/agendor.retry429.test.js  (GREEN)                    → 4 tests, 4 pass, 0 fail
node --test test/agendor.futureTasks.test.js                          → exit 0 (sem edição)
node --test test/agendor.timeout.test.js                              → exit 0 (sem edição)
node --test test/agendor.getStaleDeals.test.js                        → exit 0 (sem edição)
node --test test/agendor.cacheConcurrency.test.js                     → exit 0 (sem edição)
node --test test/agendor.cacheInvalidation.test.js                    → exit 0 (sem edição)
node --test test/scheduler.failsafe.test.js                           → exit 0 (sem edição)
npm run test:coverage                                                 → exit 0 | 139 tests, 139 pass, 0 fail
npm run lint                                                          → exit 0 (45 warnings, baseline inalterado)
biome format src/agendor.js test/agendor.retry429.test.js             → exit 0

All files          | 58.42 stmts | 80.81 branch | 55.95 funcs | 58.42 lines   (pisos 20/60/20/20)
 agendor.js        | 93.71       | 85.57        | 100         | 93.71

grep -c "async function fetchWithRetry" src/agendor.js                          → 1
grep -v "^[[:space:]]*//" src/agendor.js | grep -c "fetchWithRetry("            → 3 (definição + 2 call-sites)
grep -v "^[[:space:]]*//" src/agendor.js | grep -c "err.response?.status === 429" → 1
grep -v "^[[:space:]]*//" src/agendor.js | grep -c "(attempt + 1) \* 5000"      → 1
última linha com fetchWithRetry: 300  <  linha de "module.exports = {": 342     → não exportado
grep -c "tickAsync" test/agendor.retry429.test.js                               → 0
grep -c "avancarRelogioAte" test/agendor.retry429.test.js                       → 8
grep -c "installFakeAxios(" test/agendor.retry429.test.js                       → 1
grep -c "mock.method(axios" test/agendor.retry429.test.js                       → 0
grep -c "code: 'ECONNABORTED'" test/agendor.retry429.test.js                    → 1
git diff --name-only 15ad948 HEAD -- backend/                                   → src/agendor.js, test/agendor.retry429.test.js
git diff --name-only -- backend/package.json backend/package-lock.json          → (vazio)
git status --porcelain backend/agendor.db                                       → (vazio)
```

## Next Phase Readiness

- **Gap closure da Fase 4 encerrado.** Este era o último dos 4 planos aditivos (04-08..04-11) do `04-REVIEW.md`. CR-01, CR-02 e WR-01..WR-06 estão todos fechados.
- **SEC-01 continua o único item de segurança em aberto da fase**, por decisão consciente e vinculante do usuário (C8): o token da API Agendor exposto no histórico do repositório público **não** foi rotacionado, e este SUMMARY **não** o marca como resolvido.
- **Débito registrado para a Fase 5/7:** `helpers/fakeTimers.js` só observa promessas pelo caminho de sucesso; hoje há **duas** compensações locais para isso (a cópia inteira do helper em `emailer.timeout.test.js` e o envelope `avancarRelogioAteDesfecho` deste arquivo). Estender o helper para observar rejeições e dedupar as cópias é trabalho de uma fase que possa editar testes das ondas anteriores.
- **A política de retry agora tem um único ponto de mudança.** Qualquer evolução futura (jitter, backoff exponencial, cobrir 503) é uma edição em `fetchWithRetry`, com os casos 2, 3 e 4 deste arquivo como rede — e o caso 3 continua sendo o alarme contra estender o retry a erros de rede.
- **Sem blockers.** Nada adiado para `deferred-items.md`.

## Self-Check: PASSED

- `backend/src/agendor.js` — FOUND
- `backend/test/agendor.retry429.test.js` — FOUND
- `.planning/phases/04-confiabilidade-das-integra-es/04-11-SUMMARY.md` — FOUND
- Commit `a5470cd` — FOUND
- Commit `46c7a2a` — FOUND

---

_Phase: 04-confiabilidade-das-integra-es_
_Completed: 2026-08-04_
