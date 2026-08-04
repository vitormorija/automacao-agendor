---
phase: 04-confiabilidade-das-integra-es
plan: 08
subsystem: agendor-client
tags: [cr-01, wr-06, race-condition, concorrencia, cache, agendor, node-test, tdd, gap-closure]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    plan: 07
    provides: 'limpeza por execução do orgCategoryCache (REL-04) — é a instrução cuja interação com a leitura de estado de módulo criava a janela do CR-01'
  - phase: 01-rede-de-testes-da-logica-critica
    plan: 02
    provides: 'agendor.getStaleDeals.test.js + fixtures/synthetic/deals-page.json — o golden [101, 103] que detecta afrouxamento da exclusão por categoria'
  - phase: 04-confiabilidade-das-integra-es
    plan: 04
    provides: 'padrão de determinismo sem sleep (setImmediate real drena microtasks) do helper avancarRelogioAte de emailer.timeout.test.js'
provides:
  - 'backend/src/agendor.js: laço de enriquecimento de getStaleDeals consome o Map categoriaPorOrg, local à execução, construído com o retorno do Promise.all das organizações'
  - 'backend/test/agendor.cacheConcurrency.test.js — prova determinística do interleaving (2 casos, 179 linhas), com dois pontos de suspensão controlados no stub'
  - 'Comentários de agendor.js e de agendor.cacheInvalidation.test.js corrigidos: pararam de garantir uma propriedade que o código não tinha'
affects: [04-09, 05-observabilidade, 07-refatoracao-estrutural]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Dado externo que decide regra de negócio é capturado em estrutura LOCAL à execução; o cache de módulo vira detalhe interno da função que o gerencia'
    - 'Teste de concorrência determinístico por pontos de suspensão nomeados no stub (promessa pendente + resolvedor guardado), nunca por sleep/timing'
    - 'Pré-condições explícitas asseridas antes do interleaving (mensagem começando por "pré-condição:") — sem elas um teste concorrente pode passar sem ter exercitado o cruzamento'

key-files:
  created:
    - backend/test/agendor.cacheConcurrency.test.js
  modified:
    - backend/src/agendor.js
    - backend/test/agendor.cacheInvalidation.test.js

key-decisions:
  - 'O laço de enriquecimento lê `categoriaPorOrg.get(...)` (Map local) em vez de `orgCategoryCache[...]`: o retorno do Promise.all, que era descartado, passou a ser o dado consumido — duas linhas efetivas de produção'
  - 'getOrgCategory NÃO foi tocada e continua sendo a única leitora e escritora do dicionário de módulo; é isso que mantém 1 consulta por organização única dentro da rodada'
  - 'A limpeza por delete de chave (REL-04 / D-05) permanece intacta — a correção da corrida não podia desfazer o requisito entregue pelo 04-07'
  - 'A organização suspensa na execução A é a 210 porque o deal 110 já é excluído pela etapa "Oportunidade Perdida": controla o tempo sem alterar o resultado esperado'
  - 'A segunda consulta a /organizations/205 (a da execução B) também é suspensa — sem isso, B repopularia o cache antes da leitura de A e o teste ficaria refém da ordem de microtasks'
  - 'Comentário-bloco de agendor.js reescrito: o argumento delete-vs-reatribuir dependia da leitura direta que esta correção eliminou; o texto novo diz que a proteção contra sobreposição mora no mapa local, não na forma da limpeza'

patterns-established:
  - 'Nunca deixar uma decisão de "quem não é notificado" depender de estado mutável de módulo quando a função tem call-sites sem lock comum'
  - 'Comentário que afirma uma garantia deve nomear o teste que a pina — aqui, agendor.cacheConcurrency.test.js citado no próprio bloco de agendor.js'

requirements-completed: [REL-04]

# Metrics
duration: 12min
completed: 2026-08-04
---

# Phase 4 Plan 08: Corrida do orgCategoryCache Summary

**A exclusão por categoria deixou de depender de estado de módulo compartilhado: o laço de enriquecimento de `getStaleDeals` agora lê um `Map` local à execução, montado com o retorno do `Promise.all` que antes era descartado — duas execuções sobrepostas (o cron das 8h e alguém abrindo o dashboard) devolvem AMBAS o golden `[101, 103]`, e a organização `'Parceiro'` nunca mais entra na lista de notificação por causa de um cruzamento de timing.**

## Performance

- **Duration:** 12 min (tempo de execução; exclui a espera pela aprovação humana do C7)
- **Started:** 2026-08-04T21:44:51Z
- **Completed:** 2026-08-04T22:00:00Z
- **Tasks:** 3 (2 auto TDD + 1 checkpoint humano)
- **Files modified:** 3 (1 criado, 2 modificados)

## Accomplishments

- **CR-01 fechado** — o defeito crítico introduzido pelo 04-07 (a limpeza por execução criou a janela em que a leitura direta do dicionário devolvia `undefined`) foi eliminado na raiz: o laço não referencia mais `orgCategoryCache`.
- **Reprodução determinística do interleaving** — `agendor.cacheConcurrency.test.js` (179 linhas) força o cruzamento exato com dois pontos de suspensão controlados no stub, não com temporização. 10 execuções consecutivas, 10 verdes.
- **WR-06 fechado** — o comentário-bloco de `agendor.js` e o cabeçalho de `agendor.cacheInvalidation.test.js` paravam de pé sobre uma premissa nunca declarada e falsa ("existe no máximo uma execução em voo"). Ambos reescritos para descrever a garantia que o código agora realmente tem.
- **REL-04 preservado** — `delete orgCategoryCache[...]` continua sendo a primeira instrução de `getStaleDeals`; os 3 cenários de invalidação seguem verdes sem uma única asserção alterada.

## Task Commits

1. **Task 1: RED — teste determinístico do interleaving** — `8ef993f` (test)
2. **Task 2: GREEN — mapa local à execução + correção dos comentários** — `24b9eb3` (fix)
3. **Task 3: Checkpoint C7 — revisão humana** — sem commit (gate humano; aprovado 2026-08-04)

_TDD sem passo REFACTOR: o GREEN já é a forma final (duas linhas efetivas)._

## Files Created/Modified

- `backend/test/agendor.cacheConcurrency.test.js` (**novo**, 179 linhas) — 2 casos: o interleaving A/B com pré-condições explícitas, e uma execução sequencial posterior provando que o cruzamento não deixou estado corrompido.
- `backend/src/agendor.js` — `const categoriaPorOrg = new Map(await Promise.all(uniqueOrgIds.map(async (id) => [id, await getOrgCategory(id)])))` e `const orgCategory = categoriaPorOrg.get(deal.organization?.id) ?? null`; comentário-bloco da limpeza reescrito.
- `backend/test/agendor.cacheInvalidation.test.js` — **somente comentário** (0 linhas não-comentário alteradas, verificado por diff).

## Evidência RED → GREEN

**RED (medido, não afirmado)** — o teste de concorrência rodado contra o `agendor.js` anterior à correção (estado do commit `8ef993f`):

```
GOLDEN esperado    : [101, 103]
execução A devolveu: [101, 103, 105]   ← deal 105, organização 205 = 'Parceiro' (categoria EXCLUÍDA)
```

O deal `105` entra porque a execução B apaga as chaves entre a população e a leitura de A: `orgCategoryCache[205]` vira `undefined`, `?? null` produz `null`, e `EXCLUDED_CATEGORIES.includes(null)` é `false`.

**GREEN** — com o `Map` local aplicado, ambas as execuções devolvem `[101, 103]`; `assert.ok(!ids.includes(105))` verde nas duas.

**Determinismo** — 10 execuções consecutivas de `node --test test/agendor.cacheConcurrency.test.js`, 10 verdes. O interleaving vem dos dois pontos de suspensão (`/organizations/210` na execução A, a segunda chamada a `/organizations/205` na execução B), não de `sleep`.

## Verificação (re-executada no fechamento do plano, 2026-08-04)

| Gate | Resultado |
|------|-----------|
| `npm run test:coverage` | **exit 0** — `# tests 123 / # pass 123 / # fail 0`; `agendor.js` 91,63% linhas, 75,82% branches, 100% funcs |
| `npm run lint` | **exit 0** — 45 warnings (baseline tolerante do 02-02) |
| `orgCategoryCache[` fora de comentário em `agendor.js` | 4 (3 em `getOrgCategory` + 1 no `delete`) — conforme o critério |
| `categoriaPorOrg` fora de comentário | 2 — conforme o critério |
| `delete orgCategoryCache[` | 1 — REL-04 sobreviveu |
| `agendor.getStaleDeals.test.js` (golden) | **intocado** — fora do diff dos 2 commits |
| `backend/package.json` / `package-lock.json` | **intocados** — nenhuma instalação neste plano (T-04-08-SC) |
| Diff de `agendor.cacheInvalidation.test.js` | 0 linhas não-comentário alteradas |

## Threat Model — dispositions aplicadas

| Threat ID | Disposição | Como foi mitigada |
|-----------|-----------|-------------------|
| T-04-08-01 (Tampering na regra de negócio) | mitigate | Mapa local à execução; interleaving pinado com pré-condições explícitas |
| T-04-08-02 (Information Disclosure — organização excluída recebendo e-mail) | mitigate | Golden `[101, 103]` asserido nas DUAS execuções sobrepostas, mais `!ids.includes(105)` em ambas |
| T-04-08-03 (Regressão de REL-04) | mitigate | 3 cenários de invalidação verdes sem edição de asserção; `delete orgCategoryCache[` presente |
| T-04-08-04 (DoS/eficiência — multiplicar consultas) | mitigate | Cenário de contagem de urls do 04-07 verde: 6 organizações únicas, 6 chamadas |
| T-04-08-SC (Supply chain) | accept | Zero instalação de pacote; lockfile intocado |

## Decisions Made

Ver `key-decisions` no frontmatter. O ponto central: a discussão do 04-07 sobre `delete` vs. reatribuir era a resposta certa para a pergunta errada — protegia a forma da limpeza, quando o problema era o laço ler estado compartilhado. Com o mapa local, a forma da limpeza volta a ser um detalhe interno de `getOrgCategory`, e o comentário foi reescrito para dizer isso.

## Deviations from Plan

None — plan executed exactly as written. As duas linhas efetivas de produção, o arquivo de teste novo e a correção de comentário saíram exatamente como especificados; nenhuma regra de desvio foi acionada.

## Issues Encountered

Nenhum. A escolha das organizações a suspender (210 na execução A, 205 na B) veio pronta do plano e evitou a intermitência que um teste de concorrência mal-ancorado teria.

## Checkpoint C7 — aprovação humana

**Gate:** `blocking`, `auto_advance: false` (decisão Q4 do contrato de entrega).
**Aprovado em 2026-08-04.** O usuário confirmou:

- o laço de enriquecimento não lê mais estado de módulo compartilhado (a antiga linha `:219` foi REMOVIDA, e nada compartilhado a substituiu);
- o RED foi reproduzido de fato, com a saída literal `[101, 103, 105]` registrada;
- o golden `[101, 103]` de `agendor.getStaleDeals.test.js` não foi editado, e a limpeza de REL-04 sobreviveu;
- entrada no plano **04-09** autorizada.

## User Setup Required

None — nenhuma configuração de serviço externo.

## Next Phase Readiness

- **04-09 autorizado** pelo C7: `AGENDOR_TOKEN` fora do log de erro de `/api/deals/stale` (CR-02) + validação do id em `getDealById` (WR-03), terminando em C8.
- O `agendor.js` está com 91,63% de linhas cobertas — o arquivo mais bem coberto de `src/`, e o que carrega a regra de quem é notificado.
- **Nota para a Fase 7:** o `orgCategoryCache` de módulo continua existindo (dentro de `getOrgCategory`) e ainda é limpo a cada rodada. A migração completa para um cache de escopo de execução segue adiada, como registrado no 04-07 — mas a decisão de negócio já não depende dele.

## Self-Check: PASSED

- `backend/test/agendor.cacheConcurrency.test.js` — FOUND
- `backend/src/agendor.js` — FOUND
- `backend/test/agendor.cacheInvalidation.test.js` — FOUND
- Commit `8ef993f` (RED) — FOUND
- Commit `24b9eb3` (GREEN) — FOUND

---
*Phase: 04-confiabilidade-das-integra-es*
*Completed: 2026-08-04*
