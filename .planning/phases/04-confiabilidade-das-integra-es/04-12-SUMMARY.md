---
phase: 04-confiabilidade-das-integra-es
plan: 12
subsystem: testing
tags: [node-test, agendor, concorrencia, cache, regras-de-notificacao]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "04-07 (invalidação do cache por execução via delete de chave) e 04-08 (mapa categoriaPorOrg local à execução) — as duas metades que este plano substitui por um mecanismo único"
provides:
  - "getOrgCategory(orgId, cache): o cache de categorias vem por parâmetro e é um Map criado dentro de getStaleDeals"
  - "Fim do dicionário de módulo orgCategoryCache e da limpeza por execução — refetch entre execuções passa a ser ESTRUTURAL"
  - "agendor.cacheConcurrency.test.js cobrindo as DUAS direções do entrelaçamento (CR-01 e CR2-01)"
affects: [04-13, 04-18, verificacao-da-fase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Estado de memoização escopado à unidade de trabalho (passado por parâmetro) em vez de estado de módulo — elimina a corrida por construção, não por limpeza"
    - "Teste de concorrência com ramificação de cenário DENTRO do routeHandler do stub (o stub é instalado uma única vez, antes do require do SUT)"

key-files:
  created: []
  modified:
    - backend/src/agendor.js
    - backend/test/agendor.cacheConcurrency.test.js
    - backend/test/agendor.cacheInvalidation.test.js

key-decisions:
  - "D-CR2-01-a aplicada: cache de categorias por parâmetro (forma mínima do review); lock/single-flight recusado por mudar o comportamento dos 8 call-sites"
  - "D-CR2-01-c aplicada: a limpeza por delete de chave (entregue pelo 04-07) foi REMOVIDA — não há mais o que limpar. REL-04 passa a ser entregue estruturalmente e continua provado pelos mesmos 3 cenários, sem edição de asserção"
  - "O cache é declarado imediatamente acima do Promise.all das organizações, e não no topo de getStaleDeals — é o único consumidor, e um comentário no topo sobre uma variável dezenas de linhas abaixo seria mais um ponteiro que envelhece (WR2-06)"

patterns-established:
  - "Prova do MECANISMO além do desfecho: além do golden, o caso assere um CONTADOR de consultas (1 → 2) que acusa herança de cache mesmo se o desfecho coincidisse por acaso"
  - "Âncoras de comentário por nome de arquivo/função, nunca por número de linha (WR2-06)"

requirements-completed: [REL-04]

# Metrics
duration: 26min
completed: 2026-08-05
---

# Phase 04 Plan 12: Cache de categorias escopado à execução (CR2-01) Summary

**`getOrgCategory` passou a receber um `Map` criado dentro de `getStaleDeals`: o dicionário de módulo `orgCategoryCache` e a limpeza por execução deixaram de existir, e uma falha transitória numa execução não decide mais quem a execução vizinha notifica.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-08-05T00:20:00Z
- **Completed:** 2026-08-05T00:46:00Z
- **Tasks:** 2 de 3 (Task 3 é o checkpoint C9, bloqueante, aguardando o humano)
- **Files modified:** 3

## Accomplishments

- **CR2-01 fechado.** A direção "escrita tardia de A contamina B" — a que o 04-08 deixou aberta e que o comentário de produção declarava resolvida — foi reproduzida deterministicamente e corrigida.
- **O estado compartilhado sumiu.** `orgCategoryCache` não existe mais em nenhuma linha de `backend/src/agendor.js` (nem em comentário). Cada execução de `getStaleDeals` nasce com um cache próprio e vazio.
- **REL-04 preservado por um mecanismo mais forte.** Os 3 cenários de `agendor.cacheInvalidation.test.js` continuam verdes **sem uma única asserção alterada** — o diff daquele arquivo é 100% comentário (medido).
- **Dois comentários que afirmavam mais do que o código garantia foram corrigidos** (`agendor.js`, bloco de REL-04; cabeçalho de `agendor.cacheInvalidation.test.js`), com âncoras por nome e não por linha.
- Suíte: **139 → 140 testes, todos verdes**; cobertura acima dos pisos; `npm run lint` exit 0.

## Task Commits

1. **Task 1: RED — cenário espelho (falha tardia de A contamina B)** — `2fb6e15` (test)
2. **Task 2: GREEN — cache escopado à execução + comentários corrigidos** — `da86a24` (fix)
3. **Task 3: Checkpoint C9** — **PENDENTE** (gate humano bloqueante; ver "Checkpoint C9" abaixo)

## Files Created/Modified

- `backend/src/agendor.js` — `getOrgCategory(orgId, cache)` usa `cache.has/get/set`; `const orgCategoryCache = {}` e o laço `delete` removidos; `const cacheDaExecucao = new Map()` criado imediatamente acima do `Promise.all` sobre `uniqueOrgIds`; comentário-bloco de REL-04 reescrito.
- `backend/test/agendor.cacheConcurrency.test.js` — terceiro caso (o espelho de CR2-01), controles de cenário próprios (`cenarioAtivo`, `chamadasDealsNoEspelho`, `liberarDealsDaExecucaoB`, `falhar205DaExecucaoA`, `consultas205NoEspelho`) e cabeçalho ampliado. **Diff puramente aditivo: 159 inserções, 0 remoções.**
- `backend/test/agendor.cacheInvalidation.test.js` — **somente comentários** (item (3) do cabeçalho, o parágrafo do "delete de chaves" e o parágrafo de ESCOPO; mais dois comentários internos que descreviam a limpeza removida).

## Passo (0) da Task 2 — pré-condição da mudança de assinatura (confirmada, não inferida)

`grep -rn "getOrgCategory" backend/src backend/test frontend/src` antes de qualquer edição:

- **Call-sites executáveis em produção: exatamente 1** — `backend/src/agendor.js`, dentro de `getStaleDeals` (`uniqueOrgIds.map(async (id) => [id, await getOrgCategory(id)])`).
- **Não está em `module.exports`** (o bloco exporta 7 nomes: `getUsers`, `getStaleDeals`, `getDealById`, `getDealsWithFutureTasks`, `shouldNotifyOwner`, `getDealType`, `isExcludedStage`).
- Todas as outras 12 ocorrências são **comentário** (`agendor.js` ×4, `agendor.timeout.test.js` ×2, `agendor.cacheInvalidation.test.js` ×6).

Nenhum segundo call-site foi encontrado, então a ordem de PARAR e reportar (risco R2-1) não foi acionada.

## RED medido, não afirmado

### Saída literal do `node --test` (Task 1, contra o `agendor.js` anterior à correção — reprodutível em `2fb6e15`)

```
ok 1 - duas execuções SOBREPOSTAS: a organização "Parceiro" não entra em nenhuma das listas (CR-01)
ok 2 - depois do entrelaçamento, uma execução sequencial continua devolvendo o golden
not ok 3 - escrita tardia: a falha de UMA execução não pode decidir quem a execução vizinha notifica (CR2-01)
  ---
  failureType: 'testCodeFailure'
  error: |-
    a execução B não falhou em nada: herdar o null de A faz uma organização "Parceiro" ser notificada

    true !== false

  code: 'ERR_ASSERTION'
  expected: false
  actual: true
  operator: 'strictEqual'
  ---
# tests 3
# pass 2
# fail 1
```

A falha é **exclusivamente** o caso novo; os dois casos de CR-01 seguiram verdes.

### Sonda descartável (mesmo cenário, imprimindo as listas) — `agendor.js` ANTES da correção

```
pré-condição: consultas205 === 1 (só a execução A consultou 205)
A -> [ 101, 103, 105 ]
B -> [ 101, 103, 105 ]
consultas205 ao final === 1
idsB.includes(105) === true  (esperado false: org 205 = "Parceiro")
```

Idêntica, linha por linha, à reprodução registrada em `04-REVIEW.md` §CR2-01. O contador em `1` é a prova do mecanismo: **B nem chegou a perguntar** — leu o `null` que a execução A gravou depois da limpeza de B.

### Sonda descartável — `agendor.js` DEPOIS da correção

```
pré-condição: consultas205 === 1 (só a execução A consultou 205)
A -> [ 101, 103, 105 ]
B -> [ 101, 103 ]
consultas205 ao final === 2
idsB.includes(105) === false  (esperado false: org 205 = "Parceiro")
```

`A` continua incluindo 105 — é o caminho de erro documentado pelo cenário (3) de `agendor.cacheInvalidation.test.js`, e ele **não** mudou. O que mudou é `B`, que reconsultou (contador 1 → 2) e voltou ao golden.

A sonda era um arquivo temporário (`backend/probe-red-04-12.js`), foi apagada e **não** está em nenhum commit. Para reproduzir o RED sem ela: `git checkout 2fb6e15 && cd backend && node --test test/agendor.cacheConcurrency.test.js`.

## Verificação (todos os critérios do plano, medidos)

| Critério | Comando | Resultado |
|---|---|---|
| 3 casos de concorrência verdes | `node --test test/agendor.cacheConcurrency.test.js` | exit 0, `# pass 3` |
| 3 cenários de invalidação verdes | `node --test test/agendor.cacheInvalidation.test.js` | exit 0, `# pass 3` |
| Golden intocado | `git diff --name-only backend/test/agendor.getStaleDeals.test.js` | vazio; `# pass 3` |
| Invalidação: só comentário | `git diff -- …cacheInvalidation.test.js \| grep -E "^[+-][^+-]" \| grep -vE "^[+-][[:space:]]*//" \| wc -l` | `0` |
| Teste de concorrência: sem remoções | `git diff -- …cacheConcurrency.test.js \| grep -c "^-[^-]"` | `0` |
| Stub instalado uma única vez | `grep -c "installFakeAxios(" …cacheConcurrency.test.js` | `1` |
| Sem mock de temporizador | `grep -c "setTimeout'" …cacheConcurrency.test.js` | `0` |
| Pré-condições asseridas | `grep -c "'pré-condição:" …cacheConcurrency.test.js` | `5` (2 do caso 1 + 3 do caso espelho) |
| `orgCategoryCache` extinto | `grep -c "orgCategoryCache" backend/src/agendor.js` | `0` (arquivo inteiro, inclusive comentários) |
| Limpeza extinta | `grep -c "delete orgCategoryCache\[" backend/src/agendor.js` | `0` |
| Cache de execução | `grep -c "cacheDaExecucao" backend/src/agendor.js` | `2` (declaração + argumento) |
| Único consumidor | `grep -c "getOrgCategory(id, cacheDaExecucao)"` / `grep -c "getOrgCategory("` | `1` / `2` |
| Suíte + cobertura | `npm run test:coverage` | exit 0, **140/140**, `agendor.js` 87,78% linhas / 84,31% branches |
| Lint | `npm run lint` | exit 0 |
| Format | `biome format` nos 3 arquivos | exit 0, "No fixes applied" |
| Regiões proibidas | `git diff backend/src/agendor.js` filtrado por `EXCLUDED_CATEGORIES=`/`getDealById`/`getDealsWithFutureTasks`/`fetchWithRetry`/`fetchDealsPage`/`module.exports` | nenhuma ocorrência |
| Dependências | `git diff --name-only backend/package.json backend/package-lock.json` | vazio |

Cobertura global: 57,77% linhas / 80,40% branches (pisos 20/60).

## Decisions Made

1. **O cache não é mais estado de módulo — é parâmetro.** `getOrgCategory(orgId, cache)`. A alternativa (lock/single-flight de módulo) foi recusada pelo próprio plano: mudaria o comportamento dos 8 call-sites de `getStaleDeals` e exigiria plano próprio.
2. **A limpeza por `delete` de chave, entregue pelo 04-07, foi removida.** Ela era uma corrida que dava para perder: uma execução em voo escrevia DEPOIS da limpeza da vizinha. Agora não há o que limpar. **Isto não é regressão de REL-04** — a propriedade observável ("categoria obsoleta não é usada entre execuções") continua provada pelos mesmos 3 cenários, sem edição de asserção. Precisa de decisão humana registrada no C9 (risco R2-2).
3. **O `Map` é declarado junto ao seu único consumidor**, imediatamente acima do `Promise.all`, e não no topo de `getStaleDeals`. Declarar no topo exigiria um comentário apontando para código dezenas de linhas abaixo — exatamente o tipo de ponteiro que WR2-06 está corrigindo.
4. **O determinismo do caso espelho vem de dois pontos de suspensão explícitos no stub** — a resposta de `/deals` da SEGUNDA execução e a rejeição de `/organizations/205` da PRIMEIRA — mais três pré-condições asseridas, nunca de temporização (risco R2-3). Nenhum temporizador é mockado; só o relógio.
5. **A ramificação de cenário mora dentro do `routeHandler`**, com `cenarioAtivo` restaurado ao fim do caso. O stub é instalado uma única vez, antes do `require('../src/agendor')`, porque a instância `api` nasce no load do módulo — reinstalar depois não teria efeito.
6. **O contador `consultas205NoEspelho` é asserido junto com o golden.** Sem ele, o caso provaria só o desfecho; com ele, prova o mecanismo — que B **reconsultou** em vez de herdar.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Dois comentários internos de `agendor.cacheInvalidation.test.js` continuavam descrevendo a limpeza removida**

- **Found during:** Task 2 (passo (e))
- **Issue:** O plano listou três ajustes de comentário no cabeçalho. Fora deles, o arquivo ainda afirmava, no bloco sobre a ordem dos casos, que *"cada execução começa limpando o cache"* — falso após a correção — e, no cenário (2), citava *"o `Promise.all` de `agendor.js:187`"`*, um ponteiro por número de linha (justamente o defeito que WR2-06 corrige). Deixá-los seria repetir o defeito de origem de CR2-01: comentário afirmando mais/outra coisa do que o código faz.
- **Fix:** reescritos para "cada execução nasce com o seu próprio cache de categorias, vazio" e "o `Promise.all` sobre `uniqueOrgIds` em `getStaleDeals`" (âncora por nome).
- **Files modified:** `backend/test/agendor.cacheInvalidation.test.js`
- **Verification:** o critério de aceitação do plano continua satisfeito — o diff do arquivo altera **somente** linhas de comentário (medido: `0` linhas não-comentário).
- **Committed in:** `da86a24` (commit da Task 2)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Nenhum escopo novo. A correção fica dentro da restrição explícita do plano ("nenhuma asserção, cenário ou fixture pode mudar neste arquivo") e é da mesma natureza dos ajustes que o plano já mandava fazer.

## Issues Encountered

- **`npx` não funciona nesta máquina** (o wrapper aponta para `/tmp/node-v22.13.1-darwin-arm64/bin/node`, que não existe mais no PATH resolvido). Contornado invocando o Biome pelo caminho do pacote: `node backend/node_modules/.bin/biome …`. `npm run lint` e `npm run test:coverage` funcionam normalmente com `export PATH="$HOME/bin:$PATH"`.
- **Lint reporta 45 warnings** contra os 44 do baseline do plano. O arquivo de teste alterado tem **zero** warnings (`biome lint` só nele: "Checked 1 file… No fixes applied"), então o delta é de baseline anterior, não deste plano. `npm run lint` sai 0 (o gate).

## Threat Flags

Nenhuma superfície nova. Os itens `mitigate` do registro do plano foram todos exercidos:

| Threat ID | Como foi mitigado | Evidência |
|---|---|---|
| T-04-12-01 | Cache por parâmetro, criado dentro da execução | contador 1 → 2 + golden em B |
| T-04-12-02 | `assert.equal(idsB.includes(105), false)` + `deepStrictEqual` do golden | caso espelho verde |
| T-04-12-03 | 3 cenários de invalidação verdes sem edição de asserção | diff 100% comentário |
| T-04-12-04 | Dedup preservada pelo `Promise.all` sobre `uniqueOrgIds` | cenário (2): 6 urls para 6 organizações |
| T-04-12-05 | `accept` (IN2-03, escopo do 04-18) — não tocado | — |
| T-04-12-SC | `accept` — nenhuma instalação de pacote | `package.json`/lockfile sem diff |

## Known Stubs

Nenhum. Não há código com valor fixo, placeholder ou fonte de dados não ligada neste plano.

## User Setup Required

None — nenhuma configuração de serviço externo.

## Checkpoint C9 — PENDENTE (gate humano bloqueante)

A Task 3 do plano é `checkpoint:human-verify` com `gate="blocking"` e `auto_advance: false`. **A execução está pausada aqui.** O humano precisa confirmar, por escrito:

1. Que não sobrevive estado de categorias entre execuções (ler `git diff da86a24 -- backend/src/agendor.js`).
2. Que o RED foi medido, não afirmado (as três saídas literais registradas acima).
3. **Decisão explícita sobre REL-04 / Success Criteria 4 do ROADMAP:** a limpeza por execução do 04-07 foi removida. Manter a redação atual ("invalidado a cada execução") ou ajustá-la para descrever o mecanismo novo no 04-18?
4. Que o golden `[101, 103]` e as asserções de `agendor.cacheInvalidation.test.js` não foram editados.
5. Autorização explícita para entrar no plano 04-13.

## Next Phase Readiness

- **04-13 (WR2-03) está bloqueado** até o C9 ser aprovado.
- O achado **crítico** da rodada 2 do code review está fechado; os restantes da r2 (WR2-01..WR2-06) são warnings, distribuídos entre 04-13 e 04-18.
- **SEC-01 permanece ABERTO** como risco conscientemente aceito (decisão C8) — nada neste plano o altera.
- Nota para quem verificar a fase: a ausência de `delete`/limpeza em `getStaleDeals` **não** é gap de REL-04. Ver "Decisions Made" item 2 e `must_haves.truths` do `04-12-PLAN.md`.

## Self-Check: PASSED

- Arquivos declarados existem: `backend/src/agendor.js`, `backend/test/agendor.cacheConcurrency.test.js`, `backend/test/agendor.cacheInvalidation.test.js`, `.planning/phases/04-confiabilidade-das-integra-es/04-12-SUMMARY.md`.
- Commits declarados existem: `2fb6e15` (RED), `da86a24` (GREEN), `bc95793` (SUMMARY).
- Sonda temporária `backend/probe-red-04-12.js` confirmada como removida e ausente de todos os commits.

---
*Phase: 04-confiabilidade-das-integra-es*
*Completed: 2026-08-05 (implementação; checkpoint C9 pendente)*
