---
phase: 04-confiabilidade-das-integra-es
plan: 03
subsystem: integrations
tags:
  [
    timeout,
    axios,
    agendor-api,
    http-edge,
    node-test,
    fake-axios,
    seam,
    rel-01,
    sec-02,
    dependency-bump,
  ]

# Dependency graph
requires:
  - phase: 01-rede-de-testes-da-logica-critica
    provides: 'helpers/fakeAxios.js, helpers/tmpDb.js e test/setup.js — o bootstrap canônico de teste'
  - phase: 04-confiabilidade-das-integra-es
    plan: 02
    provides: 'fail-safe de getDealsWithFutureTasks (Set completo ou exceção) + o molde staleHandler/resFalso — dependência dura do contrato §14: o timeout torna o caminho de falha alcançável por lentidão, e o fail-safe precisava existir antes'
provides:
  - 'timeout: 15000 na instância axios compartilhada — teto de tempo em TODA chamada à API Agendor'
  - 'getDealById(id) como função de domínio exportada por agendor.js (a instância `api` continua privada)'
  - 'Eliminação do ponto órfão: zero chamadas axios cruas fora de agendor.js em todo backend/src'
  - 'backend/test/agendor.timeout.test.js — 5 cenários de REL-01/D-01'
  - 'backend/test/notifications.resolved.test.js — 7 casos de regressão do shape de GET /api/notifications/resolved'
  - 'Seam aditivo module.exports.resolvedHandler em routes/notifications.js'
  - 'fakeAxios estendido de forma aditiva: expõe createArgs (os argumentos entregues a axios.create)'
  - 'axios em ^1.19.0; npm audit do backend de 12 (5 high) para 9 (3 high)'
affects:
  [
    04-04-timeouts-smtp,
    04-05-bump-nodemailer,
    04-06-status-de-notificacao,
    04-07-cache-de-categorias,
    05-observabilidade,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Prova de configuração de borda por inspeção dos argumentos da fábrica (axios.create), em vez de provocar um timeout real — determinístico e sub-segundo'
    - 'Espião do método GLOBAL do módulo (axios.get) como asserção NEGATIVA: prova que a requisição passou pela instância configurada, e não apenas que alcançou o mesmo recurso'
    - 'Invocação única do handler no `before`, com os casos asserindo sobre o corpo guardado — necessária quando o handler tem efeito colateral (markResolved)'

key-files:
  created:
    - backend/test/agendor.timeout.test.js
    - backend/test/notifications.resolved.test.js
  modified:
    - backend/src/agendor.js
    - backend/src/routes/notifications.js
    - backend/test/helpers/fakeAxios.js
    - backend/package.json
    - backend/package-lock.json

key-decisions:
  - 'O timeout NÃO entra no retry de 429 de fetchDealsPage e isso é deliberado: um timeout não traz err.response, então já sai pelo throw err de :114. Retentá-lo levaria o pior caso de UMA página de ~15s para ~60s, anulando o motivo do limite'
  - 'A prova do timeout inspeciona os argumentos de axios.create, não espera um timeout real (RESEARCH Pitfall 1) — e o código de erro do axios é ECONNABORTED, não ETIMEDOUT'
  - 'A instância `api` continua FORA do module.exports (proibição explícita da Decisão Q3); o que se exporta é a função de domínio getDealById'
  - 'getDealById propaga a falha, ao contrário de getOrgCategory que engole: engolir devolveria null e faria a rota tratar "não consegui consultar" como "não mudou nada"'
  - 'dealStatus ficou pinado por asserção de valor porque é o único campo que o frontend usa para o rótulo ganho/perdido — a troca de envelope o perderia em silêncio, com a rota ainda respondendo 200'
  - 'O seam resolvedHandler entrou no commit RED (estrutural, corpo idêntico) para que o vermelho isolasse o ponto órfão em vez de acusar apenas a ausência do seam'
  - 'npm audit fix PROIBIDO e não usado: só npm install axios@^1.19.0, para que nenhum dos 6 advisories sem-major do sec-02 entrasse de carona'

patterns-established:
  - 'Extensão de helper de teste compartilhado só por ACRÉSCIMO de chave (createArgs), nunca por troca de formato — 3 arquivos já consomem fake.get.mock'
  - 'Seam aditivo de handler de rota (2º uso): arrow inline vira função nomeada, router.get(path, handler), module.exports.<handler> após module.exports = router'
  - 'Caso de teste que ESVAZIA o banco fica por último no arquivo e limpa por segunda conexão (openRaw) — torna o estado explícito em vez de implícito'

requirements-completed: [REL-01]

# Metrics
duration: 34min
completed: 2026-08-04
---

# Phase 4 Plan 03: Teto de Tempo na Borda Agendor Summary

**Toda chamada HTTP à API Agendor passou a ter teto de 15 segundos, e o ponto que escapava da instância compartilhada — um `axios.get` cru com url absoluta e header remontados dentro de `GET /api/notifications/resolved` — deixou de existir; `axios` subiu para 1.19.0 em commit isolado.**

## Performance

- **Duration:** 34 min
- **Tasks:** 4 (3 de execução + o checkpoint C4)
- **Files modified:** 7 (2 criados, 5 modificados)
- **Diff de produção:** 53 adições, 12 remoções em 2 arquivos
- **Diff de teste:** 484 adições, 1 remoção em 3 arquivos

## Accomplishments

- **O relógio de parede virou limite explícito.** Sem `timeout`, o axios espera **indefinidamente**. O modo de falha não é "erro" — é uma API *lenta* (não caída) travando o `Promise.all` do cron das 8h, com o sistema **parando de notificar em silêncio**. Exatamente a classe de regressão que o Core Value do milestone existe para impedir. Agora são 15s (D-01), pinados por asserção.
- **O ponto órfão acabou.** `routes/notifications.js:220` fazia `axios.get('https://api.agendor.com.br/v3/deals/' + id, { headers: { Authorization: 'Token ' + TOKEN } })` — url absoluta e header **remontados na rota**, portanto **fora** da instância configurada. Pôr `timeout` só na instância teria deixado esse caminho descoberto. Ele passou a usar `getDealById`, e o grep de aceite confirma: **zero ocorrências de `axios` em todo `backend/src/` fora de `agendor.js`**.
- **O token voltou a ser lido em um único lugar.** `const TOKEN = process.env.AGENDOR_TOKEN` sumiu da rota (T-04-03-03). A única leitura em `src/` é `agendor.js:5`, e `envExample.test.js` continua verde por causa dela.
- **O shape de `/resolved` ficou pinado, incluindo `dealStatus`.** A troca de envelope (`getDealById` já devolve `data.data`) é o tipo de mudança que perde um campo sem que nada quebre: a rota continuaria respondendo 200, só com o rótulo ganho/perdido do dashboard vazio. O teste assere o **valor** de `dealStatus`, não só a presença.
- **Suíte de 91 para 103 testes.** Cobertura total de branches subiu de 66,27% para **68,55%**; `agendor.js` de 88,09% para **90,42%**; `routes/notifications.js` de **0% (sintetizado) para 47,27%** — nenhum teste carregava esse arquivo antes.
- **`axios` 1.13.6 → 1.19.0 em commit próprio**, com o lockfile idêntico ao delta medido na pesquisa e **zero contaminação**. `npm audit` do backend: **12 (5 high) → 9 (3 high)**.

## O que cada teste novo prova

### `agendor.timeout.test.js` (5 casos, 186 linhas)

| # | Cenário | Status no RED |
| - | ------- | ------------- |
| 1 | A instância nasce com `timeout: 15000` **e** `baseURL`/header intactos | ✗ falhou |
| 2 | `getDealById(555)` chama pela **instância** com path relativo `/deals/555` — e o `axios.get` **global** fica em 0 chamadas | ✗ falhou |
| 3 | Desembrulha `data.data`; envelope vazio vira `null` (e `dealStatus` sobrevive) | ✗ falhou |
| 4 | `getDealById` **propaga** a falha (ao contrário de `getOrgCategory`) | ✗ falhou |
| 5 | Caracterização: erro `ECONNABORTED` **sem** `err.response` propaga na **1ª** tentativa — `/deals` chamado 1 vez | ✓ já passava |

O caso (5) é o alarme contra uma "melhoria" futura do retry: se alguém fizer `fetchDealsPage` retentar erros de rede genéricos, o pior caso de **uma única página** salta de ~15s para 15+5+15+10+15s — comendo justamente a janela que o D-01 protege.

### `notifications.resolved.test.js` (7 casos, 283 linhas)

| # | Cenário | Status no RED (com o seam já no lugar) |
| - | ------- | -------------------------------------- |
| 1 | Responde **200** mesmo com um item falhando na consulta | ✓ (contrato preservado) |
| 2 | Conjunto **exato** de chaves do corpo, comparado ordenado | ✗ falhou |
| 3 | Item resolvido traz `currentUpdatedAt` **e `dealStatus` com o id da borda** | ✗ falhou |
| 4 | Item cuja consulta falha volta como não-resolvido, em `pending`, distinguível do pendente normal | ✗ falhou |
| 5 | `resolvedRate` = inteiro arredondado; **`axios.get` global com 0 chamadas** | ✗ falhou |
| 6 | Lista vazia → corpo com zeros (early-return de `:206-214`) | ✓ (contrato preservado) |
| 7 | O seam não quebra o contrato do router | ✓ (contrato preservado) |

O RED foi verificado literalmente: **4 de 7 falharam**, e os 3 que passaram são exatamente os que **devem** passar nos dois estados (são contrato preservado, não medição da mudança). Nenhum teste tocou a rede real — o espião do `axios.get` global lança de propósito, então no estado antigo os itens caíam todos no catch por item.

## Task Commits

1. **Task 1 — RED: teto de tempo + `getDealById` + extensão do `fakeAxios`** — `b34eb6c` (`test`)
2. **Task 1 — GREEN: `timeout: 15000` + `getDealById`** — `b77d6fe` (`feat`)
3. **Task 2 — RED: shape de `/resolved` + seam `resolvedHandler`** — `1d43c7a` (`test`)
4. **Task 2 — GREEN: `/resolved` consome `getDealById`** — `f41b56c` (`refactor`)
5. **Task 3 — bump de `axios` em commit isolado** — `50a41c9` (`chore`)
6. **Task 4 — checkpoint C4** — aprovado pelo usuário ("aprovado"), sem commit próprio

## Files Created/Modified

- `backend/src/agendor.js` **(modificado, +30 −0)** — `timeout: 15000` acrescentado ao objeto de `axios.create` (as demais chaves intocadas), precedido de um comentário de DECISÃO em PT-BR que explica por que 15s, por que 30s e 10s foram rejeitados, e por que o timeout **não** entra no retry de 429. Nova função `getDealById(id)` junto de `getOrgCategory` (mesmo padrão de GET por id), com o "porquê" registrado: existe para que a rota não conheça a borda HTTP. Entrou no `module.exports`; **`api` não entrou** (Q3). `fetchDealsPage` **byte a byte intocado** (diff de 30 adições e **zero** remoções no arquivo inteiro).
- `backend/src/routes/notifications.js` **(modificado, +23 −12)** — 4 hunks, todos dentro de `/resolved`: import de `getDealById`, remoção do `const TOKEN`, troca do `axios.get` cru pela função de domínio com as duas leituras ajustadas (`deal?.updatedAt`, `deal?.dealStatus?.id`), e remoção do `require('axios')` após grep confirmar zero usos restantes (PC-4). O catch **por item** e o catch externo `{ error }` preservados. O handler `/test-card` (`:85-105`, escopo do 04-06) **não foi tocado** — confirmado pelos offsets dos hunks.
- `backend/test/helpers/fakeAxios.js` **(modificado, +15 −1)** — extensão **aditiva**: o objeto devolvido ganha `createArgs` (o config entregue a `axios.create`), preservando integralmente a chave `get` consumida por 3 arquivos. Cabeçalho `// Helper de teste (NÃO define testes)` e `module.exports = { installFakeAxios }` mantidos; o porquê da exposição está documentado no próprio helper.
- `backend/test/agendor.timeout.test.js` **(criado, 186 linhas)** — sem `mock.timers` (habilitar `setTimeout` congelaria a espera de paginação de `agendor.js:143`); fakes com `meta.totalCount` 0.
- `backend/test/notifications.resolved.test.js` **(criado, 283 linhas)** — tmpDb + semeadura de 3 linhas `status='sent'` por segunda conexão (`openRaw`), invocação única do handler no `before` com `res` falso mínimo.
- `backend/package.json` / `backend/package-lock.json` **(modificados)** — só o bump de `axios`.

## `npm audit` — antes e depois (contrato §15)

| Momento | Total | High | Moderate | Pacotes listados |
| ------- | ----- | ---- | -------- | ---------------- |
| **Antes** (início do 04-03) | **12** | **5** | 7 | axios, body-parser, brace-expansion, follow-redirects, form-data, morgan, nodemailer, path-to-regexp, qs, uuid |
| **Depois** (pós-bump) | **9** | **3** | 6 | body-parser, brace-expansion, morgan, nodemailer, path-to-regexp, qs, uuid |

Saíram exatamente **`axios`, `form-data` e `follow-redirects`**. Os 3 high remanescentes são `nodemailer` (escopo declarado do **04-05**), `path-to-regexp` e `morgan` — todos fora do escopo por D-06. **Nenhum advisory high/critical restante é atribuível a `axios` ou a transitivas dele.**

### Delta do lockfile (revisado em C4)

| Estado | Pacote | De → Para |
| ------ | ------ | --------- |
| Alterado | `axios` | 1.13.6 → 1.19.0 |
| Alterado | `follow-redirects` | 1.15.11 → 1.16.0 |
| Alterado | `form-data` | 4.0.5 → 4.0.6 |
| Alterado | `hasown` | 2.0.2 → 2.0.4 |
| Alterado | `proxy-from-env` | 1.1.0 → 2.1.0 |
| **Adicionado** | `agent-base` 6.0.2 (+ `debug`/`ms` aninhados) | **novo — esperado** |
| **Adicionado** | `https-proxy-agent` 5.0.1 (+ `debug`/`ms` aninhados) | **novo — esperado** |
| Removido | *(nenhum)* | — |

Idêntico ao delta medido na pesquisa. `https-proxy-agent` e `agent-base` **não existiam** na árvore: `axios@1.19.0` passou a declará-los como dependência direta. Sem esse aviso prévio, a reação correta de um revisor seria reprovar — foi por isso que o plano o embutiu no roteiro do checkpoint.

## Checkpoint C4

**Aprovado pelo usuário** ("aprovado"), com verificação independente do orquestrador antes da apresentação:

- `git show --stat 50a41c9` tocou **apenas** `package.json` + `package-lock.json`; **zero** arquivos em `test/`.
- Zero contaminação de `express`/`qs`/`morgan`/`nodemailer`/`path-to-regexp`/`body-parser`/`brace-expansion`/`node-cron`. (A única aparência de `qs` num grep foi **falso positivo** — casou dentro do hash base64 de integridade do `follow-redirects`, transitiva legítima do axios.)
- Nenhum teste editado para o bump passar; `npm ls axios` → 1.19.0; suíte e lint verdes antes e depois.

## Decisions Made

- **O timeout fica de fora do retry de 429, e o comentário diz por quê.** É a decisão mais fácil de "corrigir" errado depois: parece natural retentar um timeout. `fetchDealsPage` só reage a `err.response?.status === 429`, e um timeout de client **não traz `response`** — então já sai pelo `throw err` de `:114`, sem nenhuma alteração no retry. Retentá-lo levaria o pior caso de uma página de ~15s para ~60s, anulando o motivo do limite. O caso (5) do teste é o alarme permanente contra isso.
- **A prova é por inspeção da configuração, não por espera real** (RESEARCH Pitfall 1). Testar um timeout de verdade exigiria rede ou relógio falso, seria lento e frágil. E o código de erro do axios num timeout de client é **`ECONNABORTED`**, não `ETIMEDOUT` (`transitional.clarifyTimeoutError` é `false` por padrão) — um teste que assumisse `ETIMEDOUT` nunca passaria. Foi para viabilizar essa prova que o `fakeAxios` passou a expor `createArgs`.
- **A instância `api` continua privada.** Exportá-la seria o caminho mais curto para a rota, e é exatamente o que a Decisão Q3 proíbe: com a instância na mão, qualquer chamador futuro pode passar um `config` que **sobrescreve** o `timeout` por chamada, e o ponto órfão volta por outra porta. O que se exporta é a função de domínio.
- **`getDealById` propaga; `getOrgCategory` engole — e são diferentes de propósito.** Engolir aqui devolveria `null`, e a rota trataria "não consegui consultar" como "não mudou nada". O `catch` **por item** que já existia é quem absorve, e o caso (4) do teste de rota prova que o item com falha continua distinguível do pendente normal (`currentUpdatedAt` e `dealStatus` ausentes).
- **O seam entrou no commit RED, não no GREEN.** Com o seam ausente, os 7 casos falhavam por `resolvedHandler is not a function` — um vermelho que não diz nada sobre o defeito alvo. Extraindo o seam antes (estrutural, corpo idêntico), o RED passou a mostrar **exatamente** as 4 falhas causadas pelo ponto órfão. Mesmo raciocínio do 04-02.
- **A asserção NEGATIVA é o que dá valor aos dois arquivos** (padrão de `emailer.smtpPass.test.js:55-56`). Sem o espião do `axios.get` global, ambos os testes passariam também numa implementação que montasse a url absoluta à mão — porque ela alcança o mesmo recurso. É a asserção negativa que distingue "usa o cliente configurado" de "por acaso funciona".
- **`npm audit fix` proibido e não usado** (Pitfall 8). Seis dos advisories restantes têm correção sem major e entrariam de carona, quebrando o critério de C4 e arrastando o `sec-02` inteiro para dentro da fase.
- **PC-13 respeitado:** o valor do header `Authorization` nunca é impresso nem comparado — a asserção verifica apenas que é uma string começando com `Token `.

## Deviations from Plan

### Ajustes de forma (sem impacto no contrato)

**1. Cinco commits em vez dos dois listados no `<output>` do plano**

O plano enumerava dois commits: `feat(04-03): timeout...` e `chore(04-03): atualiza axios...`. As Tasks 1 e 2 são ambas `tdd="true"`, e o protocolo de execução exige commit de RED separado do de GREEN — o precedente direto é o 04-02 (`58bb7f3` RED → `59f9fc5` GREEN). Ficaram 5 commits: RED+GREEN da Task 1, RED+GREEN da Task 2, e o bump. **O requisito duro do plano foi preservado**: o bump de `axios` está sozinho em `50a41c9`, e o rollback continua sendo dois reverts independentes — (a) `b34eb6c`+`b77d6fe`+`1d43c7a`+`f41b56c`, (b) `50a41c9`.

**2. O seam `resolvedHandler` foi criado no commit RED, não no GREEN**

O plano descrevia a conversão da arrow em função nomeada dentro da Parte A da Task 2 (junto do GREEN). Foi antecipada para o RED pelo motivo explicado em *Decisions Made* — sem ela o vermelho é ambíguo. Puramente estrutural: corpo idêntico, só a assinatura, o registro da rota e o bloco de seam mudaram. Já estava em `files_modified`, então não há scope creep.

### Desvio de processo

**3. `git stash` executado por engano durante a Task 2 — comando proibido pelo contrato**

- **Encontrado durante:** Task 2 (GREEN), ao compor um diagnóstico de lint para conferir se o handler nomeado tinha introduzido um warning novo.
- **O que aconteceu:** um comando encadeado terminou com `git stash -q`, que guardou as alterações **não commitadas** de `routes/notifications.js` (a troca pelo `getDealById`) e reverteu a árvore ao estado de `1d43c7a`.
- **Recuperação:** detectado imediatamente na saída do próprio comando; `git stash list` mostrou **uma única** entrada, criada segundos antes a partir desta branch e apontando para `1d43c7a`. `git stash pop` restaurou tudo; a stash foi removida (`Dropped refs/stash@{0}`). O conteúdo foi reconferido por grep (`axios: 0`, `AGENDOR_TOKEN: 0`, `getDealById: 4`, `dealStatus: 2`) e a suíte revalidada em **103/103** *antes* do commit `f41b56c`.
- **Verificação independente:** o orquestrador confirmou `refs/stash` vazio, árvore limpa e integridade de `f41b56c`.
- **Impacto:** nenhum — nada foi perdido, nada foi contaminado, nenhum commit ficou incorreto.
- **Por que fica registrado:** `git stash` é proibido porque a pilha de stash é **compartilhada** entre o checkout principal e qualquer worktree vinculado (`refs/stash` vive no `.git/` pai). Aqui a execução era sequencial na árvore principal e não havia stash prévia, então o `pop` só podia devolver o que o `push` guardou — mas o mesmo engano numa execução com worktrees em paralelo aplicaria WIP de outra sessão. A Fase 5 deve saber disso.

---

**Total deviations:** 2 ajustes de forma + 1 desvio de processo (recuperado sem perda)
**Impact on plan:** Nenhum scope creep e nenhum defeito de produção inesperado. Todos os critérios de aceite das 3 tasks foram satisfeitos.

## Issues Encountered

**A contagem de warnings do lint ficou em 45 — sem regressão, e sem o +1 esperado.** Nomear o handler faz o Biome enxergar `req` como parâmetro não usado (`noUnusedFunctionParameters`), como aconteceu com `staleHandler` no 04-02. Neste caso o total **não** subiu: a regra já disparava sobre a arrow inline de `/resolved`, então o warning apenas mudou de linha. `npm run lint` sai **0** nos dois estados. Registrado para que a Fase 5 não interprete a estabilidade em 45 como "nada mudou".

**Cobertura: avaliar por arquivo, não pelo agregado.** O total de branches subiu de 66,27% para 68,55% porque este plano carrega `routes/notifications.js` de verdade pela primeira vez (0% sintetizado por `all: true` → 47,27% real). As linhas descobertas do arquivo (`:114-133, 138-171, 176-191, 196, 259-260`) são as outras rotas e o catch externo do `/resolved` — nenhuma delas é escopo deste plano.

## Threat Flags

Nenhuma superfície de segurança nova fora do `<threat_model>` do plano. As disposições registradas foram cumpridas:

- **T-04-03-01 (mitigate)** — `timeout: 15000` na fábrica; o caso (1) inspeciona os argumentos entregues a `axios.create`. Os 4 consumidores (`getUsers`, `getOrgCategory`, `fetchDealsPage`, `getDealsWithFutureTasks`) herdam sem alteração.
- **T-04-03-02 (mitigate)** — ponto órfão substituído por `getDealById`; greps de aceite em `routes/notifications.js`: `api.agendor.com.br` → **0**, `require('axios')` → **0**. E em todo `backend/src/` fora de `agendor.js`: **0** ocorrências de `axios`.
- **T-04-03-03 (mitigate)** — `const TOKEN` local removido; `AGENDOR_TOKEN` → **0** ocorrências na rota. Leitura única em `agendor.js:5`, com `envExample.test.js` (3/3) provando que a variável segue declarada.
- **T-04-03-04 (mitigate)** — o `id` de `getDealById` vem exclusivamente de `getNotifiedDeals()` (banco). A rota **não** aceita id de query nem de body, e um comentário na própria rota registra que não deve passar a aceitar.
- **T-04-03-05 (mitigate)** — `axios` em `^1.19.0`; `npm audit` 12/5 high → 9/3 high, sem nenhum high/critical atribuível a axios.
- **T-04-03-06 (mitigate)** — shape de `/resolved` pinado com conjunto exato de chaves, valor de `dealStatus` e o caminho de item com falha.
- **T-04-03-SC (accept/mitigate)** — `axios` aprovado no Package Legitimacy Audit (11,9 anos, 118M downloads/semana, sem `postinstall`), commit isolado e lockfile revisado em C4. `npm audit fix` e `slopcheck install` não foram executados.

## User Setup Required

Nenhuma. Os testes não fazem rede real (HTTP stubado nos dois arquivos novos) e não tocam `backend/agendor.db` (`git status --porcelain backend/agendor.db` vazio). O `node_modules` mudou por causa do bump — quem tiver o repositório clonado precisa de um `npm install` em `backend/` após puxar.

## Verification

```
node --test test/agendor.timeout.test.js       (RED)    → 5 tests, 1 pass, 4 fail
npm test                                       (RED)    → 96 tests, 92 pass, 4 fail (só o arquivo novo)
node --test test/agendor.timeout.test.js       (GREEN)  → 5 tests, 5 pass, 0 fail
node --test test/notifications.resolved.test.js (RED, sem seam)  → 7 tests, 0 pass, 7 fail
node --test test/notifications.resolved.test.js (RED, com seam)  → 7 tests, 3 pass, 4 fail
node --test test/notifications.resolved.test.js (GREEN)          → 7 tests, 7 pass, 0 fail
node --test test/scheduler.resilience.test.js test/scheduler.failsafe.test.js → 13 tests, 13 pass, 0 fail
node --test test/envExample.test.js                              → 3 tests, 3 pass, 0 fail
npm run test:coverage   (antes e depois do bump)                 → exit 0 | 103 tests, 103 pass, 0 fail
npm run lint            (antes e depois do bump)                 → exit 0 (45 warnings)
npm ls axios                                                     → axios@1.19.0

All files          | 52.38 stmts | 68.55 branch | 54.32 funcs | 52.38 lines   (pisos 20/60/20/20)
 agendor.js        | 90.42       | 74.44        | 100         | 90.42   (era 88,09)
 routes/notifications.js | 47.27 | 88.88        | 100         | 47.27   (era 0, sintetizado)
 routes/deals.js   | 76          | 50           | 100         | 76      (inalterado)

grep -c "timeout: 15000" backend/src/agendor.js                       → 1
grep -c "getDealById" backend/src/agendor.js                          → 3
grep "api," no bloco module.exports de agendor.js                     → 0 (instância não exportada)
git diff --numstat backend/src/agendor.js                             → 30/0 (zero remoções: fetchDealsPage intocado)
grep -rn "axios" backend/src/ | grep -v "^backend/src/agendor.js"      → (vazio)
grep -c "AGENDOR_TOKEN" backend/src/routes/notifications.js           → 0
grep -c "require('axios')" backend/src/routes/notifications.js        → 0
grep -c "api.agendor.com.br" backend/src/routes/notifications.js      → 0
grep -c "getDealById" backend/src/routes/notifications.js             → 4
grep -c "module.exports.resolvedHandler" backend/src/routes/notifications.js → 1
grep -c "dealStatus" backend/src/routes/notifications.js              → 2
git diff -U0 backend/src/routes/notifications.js | grep "^@@"          → 4 hunks (:18, :203, :220, :238) — nenhum em :85-105
git diff HEAD~1 --numstat (Task 3)                                    → só package.json + package-lock.json
git status --porcelain backend/agendor.db                             → (vazio)
git stash list                                                        → (vazio)
```

## Next Phase Readiness

- **04-04 liberado (timeouts SMTP, REL-02).** Arquivo e borda diferentes (`emailer.js`, `nodemailer`), sem sobreposição de arquivos com este plano. O molde de prova é o mesmo: inspecionar os argumentos entregues à fábrica em vez de esperar um timeout real — só que ali o análogo já existe pronto (`emailer.smtpPass.test.js`).
- **04-05 (bump de `nodemailer` 6→9) com o caminho limpo.** Este plano gastou a metade `axios` do D-06; o `npm audit` do 04-05 parte de **9 (3 high)** e deve chegar a **8 (2 high)**. O delta esperado do lockfile é de **uma única linha** (nodemailer não tem dependências) — o diff mais limpo possível para o checkpoint C5.
- **04-06 protegido de um lado.** Ele altera `scheduler.js:109-164` e `routes/notifications.js`; o seam `resolvedHandler` e os 7 casos de shape já pinam a rota `/resolved`, e o `/test-card` de `:85-105` — o outro alvo do 04-06 — foi deliberadamente deixado intocado aqui.
- **Molde novo disponível:** `createArgs` do `fakeAxios` serve a qualquer prova futura sobre a configuração da instância HTTP, e o espião do método global é a receita para asserção negativa de "a chamada não escapou da borda configurada".
- **Sem blockers.** Nada adiado para `deferred-items.md`. O único ponto de atenção operacional é o `npm install` em `backend/` após puxar a branch.

## Self-Check: PASSED

- `backend/src/agendor.js` — FOUND
- `backend/src/routes/notifications.js` — FOUND
- `backend/test/helpers/fakeAxios.js` — FOUND
- `backend/test/agendor.timeout.test.js` — FOUND
- `backend/test/notifications.resolved.test.js` — FOUND
- `backend/package.json` — FOUND
- `backend/package-lock.json` — FOUND
- Commit `b34eb6c` — FOUND
- Commit `b77d6fe` — FOUND
- Commit `1d43c7a` — FOUND
- Commit `f41b56c` — FOUND
- Commit `50a41c9` — FOUND

---

_Phase: 04-confiabilidade-das-integra-es_
_Completed: 2026-08-04_
