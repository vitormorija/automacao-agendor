---
phase: 04-confiabilidade-das-integra-es
plan: 07
subsystem: agendor-client
tags: [rel-04, d-05, cache, invalidacao, agendor, node-test, tdd]

# Dependency graph
requires:
  - phase: 01-rede-de-testes-da-logica-critica
    plan: 02
    provides: 'agendor.getStaleDeals.test.js + fixtures/synthetic/deals-page.json — o molde do stub de /organizations/:id e o golden [101, 103] que protege a exclusão por categoria'
  - phase: 02-toolchain-e-ci
    plan: 01
    provides: 'agendor.futureTasks.test.js — o padrão de resetCalls/callCount e de ramificação dentro do routeHandler'
  - phase: 04-confiabilidade-das-integra-es
    plan: 03
    provides: 'timeout de 15s na instância axios compartilhada — o teto de tempo que torna barato reconsultar as organizações a cada rodada'
provides:
  - 'backend/src/agendor.js: orgCategoryCache invalidado por delete de chave como primeira instrução de getStaleDeals'
  - 'backend/test/agendor.cacheInvalidation.test.js — 3 cenários (refetch entre execuções, 1 consulta por org única, null-de-erro não persistente)'
  - 'ORGS_DOS_DEALS_STALE = [201, 203, 205, 206, 207, 210] — golden das organizações consultadas por execução'
affects: [05-observabilidade, 07-refatoracao-estrutural]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Invalidação de cache preservando a REFERÊNCIA do objeto (delete por chave), obrigatória quando o dicionário é lido fora da função que o gerencia'
    - 'Ordem de declaração dos casos como parte do teste: o caso que mede contagem de chamadas exige cache frio e por isso vem primeiro'
    - 'Deal sintético anexado à fixture compartilhada (variável mutável dealsServidos) para exercitar um ramo que o estado quente do cache tornaria inalcançável'

key-files:
  created:
    - backend/test/agendor.cacheInvalidation.test.js
  modified:
    - backend/src/agendor.js

key-decisions:
  - 'Limpeza por `delete orgCategoryCache[k]`, nunca reatribuição: getOrgCategory (:50) e a leitura direta de :195 fecham sobre a MESMA referência — reatribuir daria `undefined` à exclusão por categoria e organizações excluídas voltariam a ser notificadas'
  - 'Primeira instrução de getStaleDeals, antes de fetchDealsPage(1, perPage): depois do Promise.all de :187 o laço de enriquecimento leria um dicionário vazio e a exclusão por categoria sumiria'
  - 'Limpeza por execução e não TTL (D-05): o TTL mudaria o FORMATO do valor guardado de string para objeto e quebraria a leitura direta de :195 — mesmo desfecho da reatribuição'
  - 'O cenário de eficiência é declarado PRIMEIRO no arquivo de teste porque só mede o que promete com o cache frio; no estado RED qualquer caso anterior o contaminaria para zero chamadas'
  - 'Deal sintético 305 (org "Parceiro" cuja consulta falha) porque as 6 organizações da fixture já estão cacheadas quando o erro é injetado — sem ele o RED do cenário (3) seria inalcançável, não vermelho'

patterns-established:
  - 'Quando um cache de módulo é lido por mais de um caminho, invalidar SEMPRE por delete de chave — a reatribuição é uma bifurcação silenciosa de referência'
  - 'Provar eficiência contando urls em fake.get.mock.calls (filtradas por prefixo) em vez de conferir callCount total: o número fica legível e a asserção de "sem repetição" fica separada da de "quantidade certa"'

requirements-completed: [REL-04]

# Metrics
duration: 9min
completed: 2026-08-04
---

# Phase 4 Plan 07: Invalidação do Cache de Categorias Summary

**O `orgCategoryCache` deixou de ser um dicionário imortal: cada `getStaleDeals` começa deletando suas chaves, então uma organização recategorizada no Agendor vale já na rodada seguinte e um `null` gravado por erro transitório para de contaminar todas as execuções restantes do processo — sem custar uma única consulta a mais dentro da rodada, e com o golden `[101, 103]` verde para provar que a exclusão por categoria não foi afrouxada.**

## Performance

- **Duration:** 9 min
- **Tasks:** 2 (Task 1 RED, Task 2 GREEN — plano `tdd="true"` nas duas)
- **Files modified:** 2 (1 criado, 1 modificado)
- **Diff de produção:** `agendor.js` **+24 −0** (uma instrução de 3 linhas + 21 de comentário)
- **Suíte:** 118 → **121 testes**, 0 falhando

## O defeito que foi consertado (REL-04 / D-05)

`const orgCategoryCache = {}` (`agendor.js:47`) é estado de módulo que **nunca** era invalidado. Duas consequências, ambas silenciosas:

| Caminho | Antes | Agora |
| ------- | ----- | ----- |
| Organização recategorizada para `'Parceiro'` no Agendor | continuava sendo notificada **até o próximo restart do processo** (sob PM2 single-instance, potencialmente semanas) | a rodada seguinte já reconsulta e a exclui |
| Erro transitório em `/organizations/:id` | o `catch` de `getOrgCategory` (`:56-59`) cacheava `null`, e `null` **não** está em `EXCLUDED_CATEGORIES` — a organização excluída passava a ser notificada em **todas** as rodadas seguintes | o `null` morre com a execução em que foi gravado |

O segundo é o mais grave dos dois: um único blip de rede numa consulta de organização derrubava permanentemente a regra de exclusão daquela organização, e nada no sistema registrava isso — a rodada terminava "com sucesso".

## Os 3 cenários (REL-04 / Decisão D-05)

`backend/test/agendor.cacheInvalidation.test.js` — 195 linhas, borda HTTP stubada, relógio congelado em `2026-06-01T00:00:00.000Z`, fixture `deals-page.json` reusada.

| # | Cenário | O que prova | Status no RED |
| - | ------- | ----------- | ------------- |
| (2) | Uma consulta por organização única por execução | 6 urls `/organizations/`, sem repetição, exatamente `[201, 203, 205, 206, 207, 210]` | ✓ já passava |
| (3) | `null` de erro não contamina a execução seguinte | a org 305 (`'Parceiro'`) volta a ser excluída quando a API se recupera | ✗ `true !== false` |
| (1) | Recategorização vale na execução seguinte | `201` vira `'Parceiro'` entre as rodadas e o deal `101` sai da 2ª | ✗ `true !== false` |

O RED foi verificado literalmente e bateu com a previsão do plano: **2 falharam, 1 passou**, e as duas falhas trouxeram a mensagem de asserção escrita para elas (`o null cacheado pelo catch de getOrgCategory sobreviveu à execução em que foi gravado` / `a 2ª execução serviu a categoria obsoleta do cache em vez de reconsultar o Agendor`).

**A prova de eficiência é contada, não inferida:** o cenário (2) filtra `fake.get.mock.calls` pelas urls que começam com `/organizations/`, assere que são **6** (o número de organizações únicas entre os deals stale), que `urls.length === new Set(urls).size` (nenhuma repetição) e que o conjunto de ids é exatamente `[201, 203, 205, 206, 207, 210]`. Esse golden documenta um fato não óbvio do SUT: a consulta de categoria acontece **antes** das exclusões por categoria/owner/status/etapa, então as organizações `205` (Parceiro), `206` (owner excluído), `207` (status 3) e `210` (etapa "Perdida") **também** são consultadas — a limpeza por execução não introduziu isso, ela apenas passou a repeti-lo a cada rodada.

## Task Commits

1. **Task 1 — RED: refetch entre execuções e 1 consulta por org** — `123c85d` (`test`)
2. **Task 2 — GREEN: limpeza das chaves na primeira instrução de getStaleDeals** — `dd25dbf` (`feat`)

## Files Created/Modified

- `backend/src/agendor.js` **(+24 −0)** — bloco inserido no topo do corpo de `getStaleDeals` (`:149`), imediatamente antes do cálculo de `cutoffDate` e, portanto, antes de `const firstPage = await fetchDealsPage(1, perPage)` (hoje `:179`). Três linhas de código (`for (const orgId of Object.keys(orgCategoryCache)) { delete orgCategoryCache[orgId]; }`) e 21 de comentário em PT-BR no estilo do arquivo (`:87-91`, `:98-100`): o comentário registra **a decisão** — por que deletar chaves em vez de reatribuir, por que a primeira instrução, e por que limpeza e não TTL — não a mecânica. **Zero remoções.** `getOrgCategory`, a leitura direta de `:195`, `EXCLUDED_CATEGORIES`, o `Promise.all` de `:187` e o `module.exports` estão byte-idênticos.
- `backend/test/agendor.cacheInvalidation.test.js` **(criado, 195 linhas)** — bootstrap na ordem canônica (`require('./setup')` → `installFakeAxios` → `require('../src/agendor')`), `mock.timers.enable({ apis: ['Date'], now: FIXED_NOW })` **apenas** para `Date`, `ORG_CATEGORY` e `dealsServidos`/`orgQueFalha` como variáveis mutáveis lidas **dentro** do `routeHandler` (Pitfall 4 — o stub é instalado uma única vez).

## Decisions Made

- **`delete` por chave, jamais reatribuição.** O `orgCategoryCache` é lido por dois caminhos que fecham sobre a mesma referência: `getOrgCategory` (`:50`) e a **leitura direta** do dicionário em `:195`, que é onde `EXCLUDED_CATEGORIES` decide a exclusão. Reatribuir deixaria um lado escrevendo em um objeto novo e o outro lendo o antigo; a leitura direta devolveria `undefined`, `EXCLUDED_CATEGORIES.includes(undefined)` é `false`, e **organizações excluídas voltariam a ser notificadas**. A constante é declarada com `const`, o que torna a reatribuição um erro de sintaxe — mas a proibição vale pelo motivo estrutural, não pelo `const`.
- **Primeira instrução, não "em algum ponto antes do uso".** Se a limpeza caísse depois do `Promise.all` de `:187`, o laço de enriquecimento leria um dicionário vazio, `orgCategory` viraria `null` para todos e a exclusão por categoria sumiria inteira (Pitfall 6). O ponto correto é antes de `fetchDealsPage(1, perPage)`, verificado pela numeração de linha: limpeza em `:170-172`, `firstPage` em `:179`.
- **Limpeza por execução, não TTL (D-05).** Um TTL exigiria guardar timestamp junto do valor, mudando o **formato** do dado de string para objeto — e a leitura direta de `:195` passaria a receber um objeto, com exatamente o mesmo desfecho da reatribuição. A limpeza não muda formato nenhum, então `:195` não precisou ser tocada. O cache com escopo de execução (Map local) continua sendo a solução mais limpa e continua adiado para a Fase 7: exige mudar a assinatura de `getOrgCategory` **e** a linha `:195`, o que é refatoração estrutural.
- **Ordem de declaração dos casos como parte do teste.** O cenário (2) mede o número de consultas de **uma** execução; no estado RED, qualquer caso declarado antes dele já teria populado o cache e a contagem cairia para zero — transformando um caso que **deve** passar em falha por contaminação, e tornando o RED ilegível. Ele vem primeiro, e o motivo está comentado no arquivo. Em GREEN a ordem é indiferente, já que cada execução começa limpando o cache: essa indiferença é, ela própria, um efeito da correção.
- **Deal sintético 305 em vez de reusar uma organização da fixture no cenário (3).** No estado RED, as 6 organizações da fixture já estão cacheadas quando o erro seria injetado — e uma consulta que o cache atende **nem chega a ser tentada**, logo nem chega a falhar. Sem uma organização nova, o cenário (3) passaria trivialmente no RED e não mediria nada. O deal 305 (clone do molde 105: stale sob `FIXED_NOW`, status 1, etapa benigna, owner válido, org `'Parceiro'`) é anexado à fixture apenas durante aquele caso, via a variável mutável `dealsServidos`, e removido no fim. A fixture em disco **não** foi alterada.
- **A 1ª execução do cenário (3) também é asserção, não só preparação.** `assert.equal(idsComFalha.includes(305), true)` documenta o comportamento **atual** do caminho de erro — o `null` cacheado deixa uma organização `'Parceiro'` passar pelo filtro — e vale nos dois estados, antes e depois da correção. É o que dá sentido à asserção da 2ª execução: sem ela, "305 não está na lista" poderia significar apenas que o deal nunca esteve lá.

## Deviations from Plan

### Ajustes de forma

**1. Dois commits em vez do único listado no `<output>` do plano**

O plano enumerava `feat(04-07): invalida orgCategoryCache a cada execução (REL-04)`. As duas tasks são `tdd="true"` e o protocolo exige RED separado do GREEN — mesmo precedente do 04-02, 04-03, 04-04 e 04-06. Ficaram `123c85d` (RED, `test`) e `dd25dbf` (GREEN, com a mensagem literal do plano). O rollback continua sem ambiguidade: revert dos dois.

**2. Ordem de declaração dos cenários no arquivo de teste**

O plano lista (1), (2), (3). No arquivo a ordem é **(2), (3), (1)**, e isso não é cosmético: o próprio plano exige que "o cenário (2) já passe nesta etapa", o que **só é verdade com o cache frio** — ou seja, só se ele for o primeiro caso do arquivo. Foi verificado empiricamente no RED (2 falhas, 1 sucesso, exatamente como previsto). O motivo está comentado acima do primeiro `test()`. Nenhuma asserção foi enfraquecida.

**3. Critério de aceite `grep -c "installFakeAxios" … retorna 1` → retorna **2**, com a intenção satisfeita**

A intenção do critério é "o stub **não** é reinstalado" (Pitfall 4). O arquivo segue a convenção de bootstrap dos 3 testes que já usam o helper (`agendor.getStaleDeals.test.js:9,24`, `agendor.futureTasks.test.js:11,61`, `notifications.resolved.test.js`): o import destruturado numa linha e a chamada em outra. `grep -c` conta **linhas**, então o número é 2 — e seria 2 também nos três arquivos existentes. A medida que corresponde à intenção é `grep -c "installFakeAxios("`, que retorna **1**: existe uma única instalação. Contorcer o import para `require('./helpers/fakeAxios').installFakeAxios(...)` só para forçar o `1` quebraria a convenção do repositório sem ganho de garantia — CLAUDE.md manda seguir o padrão do arquivo vizinho.

**4. `grep -c "orgCategoryCache = {}" … retorna 1` exigiu reescrever uma frase do comentário**

A primeira redação do comentário citava a anti-forma literalmente (`` `orgCategoryCache = {}` deixaria… ``), o que fazia o grep retornar **2** — a declaração de `:47` mais a menção no comentário. A frase foi reescrita para "Reatribuir o dicionário a um objeto vazio deixaria…", preservando o conteúdo da decisão e devolvendo o grep a **1**. Vale registrar por quê: o critério existe para detectar uma **reatribuição real**, e um comentário que cita a anti-forma produz um falso positivo indistinguível do defeito que o grep procura.

---

**Total deviations:** 0 auto-fixes (nenhum defeito encontrado além do que o plano já descrevia) + 4 ajustes de forma
**Impact on plan:** Nenhum scope creep. Todos os critérios de aceite das 2 tasks foram satisfeitos, com as duas ressalvas de grep documentadas acima.

## Issues Encountered

**Nenhum bloqueio.**

Um achado vale registro para quem for testar invalidação de cache de módulo: **no estado RED, o cache quente torna certos ramos inalcançáveis, não vermelhos**. O ramo do `catch` de `getOrgCategory` só é atingível para uma chave ainda não cacheada — então um teste de "erro transitório" escrito sobre uma organização já consultada por um caso anterior passa trivialmente e não mede nada. O sintoma é traiçoeiro porque o teste fica **verde** no RED, que é onde se espera vermelho. A solução (uma organização nova, servida só naquele caso) está comentada no arquivo.

**Nenhum stub introduzido.** Nenhum valor vazio codificado, placeholder ou TODO/FIXME nos arquivos tocados.

**Cobertura:** `agendor.js` chegou a **92,15%** de linhas / **75,82%** de branches / **100%** de funções — o ramo do `catch` de `getOrgCategory`, apontado como descoberto no 04-CONTEXT §Established Patterns, passou a ser exercitado pelo cenário (3). Agregado do backend: 54,62 → **55,09 stmts** e 77,74 → **78,12 branches** (pisos 20/60).

## Threat Flags

Nenhuma superfície de segurança nova fora do `<threat_model>` do plano. As disposições registradas foram cumpridas:

- **T-04-07-01 (mitigate)** — limpeza das chaves na primeira instrução de `getStaleDeals`; o cenário (1) prova o refetch entre execuções.
- **T-04-07-02 (mitigate)** — nenhuma reatribuição: `grep -c "orgCategoryCache = {}" backend/src/agendor.js` → **1** (só a declaração de `:47`) e `grep -c "delete orgCategoryCache"` → **1**. O detector — o golden `assert.deepStrictEqual(ids, [101, 103])` de `agendor.getStaleDeals.test.js:61` — está **verde e sem edição** (`git diff --name-only backend/test/` vazio no commit da Task 2).
- **T-04-07-03 (mitigate)** — o cenário (3) prova que o `null` gravado pelo `catch` não sobrevive à execução em que foi gravado.
- **T-04-07-04 (mitigate)** — o cenário (2) conta **6** consultas para **6** organizações únicas, sem repetição: o `Promise.all` de `:187` continua deduplicando dentro da rodada e a limpeza por execução não multiplicou chamadas.
- **T-04-07-SC (accept)** — nenhuma instalação de pacote; `package.json` e `package-lock.json` não aparecem no diff deste plano.

## User Setup Required

Nenhuma. Os testes não abrem conexão de rede (borda HTTP stubada), não dependem de espera real e não tocam `backend/agendor.db` (`DB_PATH` fica em `:memory:` pelo `setup.js`).

**Observação operacional:** cada rodada diária passa a fazer novamente uma consulta `GET /organizations/:id` por organização única com deal parado — o custo que a rodada já pagava na **primeira** execução após cada restart, agora pago em todas. Com o timeout de 15s do 04-03 e a ordem de grandeza atual (unidades a dezenas de organizações), o acréscimo é de segundos numa janela de cron diária. É o preço explícito de nunca mais servir categoria obsoleta.

## Verification

```
node --test test/agendor.cacheInvalidation.test.js  (RED)    → 3 tests, 1 pass, 2 fail
node --test test/agendor.cacheInvalidation.test.js  (GREEN)  → 3 tests, 3 pass, 0 fail  (~74ms)
node --test test/agendor.getStaleDeals.test.js      (GREEN)  → 3 tests, 3 pass  (arquivo NÃO editado)
npm run test:coverage                                        → exit 0 | 121 tests, 121 pass, 0 fail
npm run lint                                                 → exit 0 (45 warnings — baseline inalterado)
biome format src/agendor.js test/agendor.cacheInvalidation.test.js → No fixes applied

Ondas 1-6 revalidadas em conjunto:
node --test test/scheduler.resilience.test.js test/scheduler.failsafe.test.js \
            test/agendor.timeout.test.js test/notifications.resolved.test.js \
            test/emailer.timeout.test.js test/notificationStatus.test.js
                                                             → 40 tests, 40 pass, 0 fail

All files      | 55.09 stmts | 78.12 branch | 54.87 funcs | 55.09 lines   (pisos 20/60/20/20)
 agendor.js    | 92.15       | 75.82        | 100         | 92.15

grep -c "delete orgCategoryCache" backend/src/agendor.js  → 1
grep -c "orgCategoryCache = {}"   backend/src/agendor.js  → 1   (só a declaração de :47)
grep -n "delete orgCategoryCache" backend/src/agendor.js  → 171
grep -n "const firstPage = await fetchDealsPage(1, perPage)" backend/src/agendor.js → 179
grep -c "deals-page.json"    backend/test/agendor.cacheInvalidation.test.js → 1
grep -c "installFakeAxios("  backend/test/agendor.cacheInvalidation.test.js → 1
grep -c "mock.timers.enable" backend/test/agendor.cacheInvalidation.test.js → 1  (apis: ['Date'])
git diff --name-only backend/test/   (na Task 2) → (vazio)
git diff --numstat backend/src/agendor.js → 24/0
git status --porcelain backend/agendor.db → (vazio)
git stash list → (vazio)
```

## Next Phase Readiness

- **Fase 4 encerrada do lado do código.** REL-01 a REL-06 entregues nos 7 planos; este era o último. Restam apenas os passos de verificação/fechamento da fase.
- **Débito da fase que continua aberto e rastreado:** `.planning/todos/pending/rel-02b-deadline-global-smtp.md` (teto global de SMTP, aberto pela correção Q6 a D-02 no 04-05) e `.planning/todos/pending/rel-05b-test-card-status.md` (terceiro escritor de `'sent'` pré-envio, deixado fora por decisão humana no 04-06).
- **Entrada para a Fase 7 (refatoração estrutural):** o cache com escopo de execução (Map local passado a `getOrgCategory` e à linha `:195`) continua sendo a solução mais limpa e continua adiada. Este plano deixa o terreno pronto: os 3 cenários de `agendor.cacheInvalidation.test.js` são exatamente a rede que essa refatoração vai precisar para não afrouxar nada — e o golden `ORGS_DOS_DEALS_STALE` pina que a deduplicação por rodada é um requisito, não um acidente.
- **Aviso das ondas 4/6 confirmado mais uma vez, agora sem custo:** `mock.timers.tickAsync` **não foi usado** e não foi necessário — este arquivo habilita `mock.timers` só para `Date`, e a fixture cabe em uma página (`totalCount` ≤ 100), então nenhuma espera de paginação (`agendor.js:203`) é exercitada.
- **Sem blockers.** Nada adiado para `deferred-items.md`. `package.json` intocado.

## Self-Check: PASSED

- `backend/src/agendor.js` — FOUND
- `backend/test/agendor.cacheInvalidation.test.js` — FOUND
- Commit `123c85d` — FOUND
- Commit `dd25dbf` — FOUND

---

_Phase: 04-confiabilidade-das-integra-es_
_Completed: 2026-08-04_
