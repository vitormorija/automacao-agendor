---
phase: 04-confiabilidade-das-integra-es
plan: 26
subsystem: higiene-do-instrumento-de-teste
tags: [wr3-04, wr3-05, wr3-07, contaminacao-de-ordem, relogio-falso, estado-neutro, rel-02, rel-04, gap-closure-r3]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "o beforeEach modelo de agendor.retry429.test.js (04-11); o helper corrigido em helpers/fakeTimers.js (04-13/WR2-03); o fim das mudanças em emailer.js (04-17), que fez expirar a justificativa da cópia local; os dois arquivos de cache (04-19/CR3-01) e os dois de notificationStatus criados na rodada 2 (04-14, 04-15)"
provides:
  - "Zero arquivos da suíte habilitam 'setTimeout' num `before` de topo — os três que avançam o relógio o rearmam por caso"
  - "Uma ÚNICA implementação de avancarRelogioAte em circulação: a cópia local do oráculo de REL-02 desapareceu"
  - "Estado neutro reafirmado em beforeEach nos dois arquivos que ramificam por estado global de módulo"
  - "in2-02 fechado (movido para .planning/todos/completed/)"
  - "wr3-07b aberto, com a medição que prova por que o beforeEach NÃO serve para o estado de armação"
  - "WR3-04, WR3-05 e WR3-07 fechados"
affects: [04-27, verificacao-da-fase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Restauração de estado global na ÚLTIMA instrução do corpo de um `test()` é restauração no CAMINHO FELIZ: ela não roda quando uma asserção falha antes dela. O lugar correto é um `beforeEach` que REAFIRMA o valor neutro — um único responsável pelo estado, e independente do desfecho do caso anterior"
    - "Nem todo estado mutável de módulo é estado de CENÁRIO. Manipulador de suspensão e contador consumidos ao longo da ordem declarada dos casos são estado de ARMAÇÃO, e resetá-los RE-ARMA uma suspensão que ninguém libera — a suíte não fica vermelha, ela deixa de terminar"
    - "Grep de contagem sobre um arquivo de teste comentado em PT-BR precisa FILTRAR comentário antes de concluir divergência: `setTimeout` aparece em 3 arquivos exatamente para explicar por que NÃO é habilitado"

key-files:
  created:
    - .planning/todos/pending/wr3-07b-estado-de-armacao-em-cacheconcurrency.md
  modified:
    - backend/test/notificationStatus.partialFailure.test.js
    - backend/test/notificationStatus.registroResiliente.test.js
    - backend/test/notificationStatus.canalParcial.test.js
    - backend/test/emailer.timeout.test.js
    - backend/test/helpers/fakeTimers.js
    - backend/test/agendor.cacheConcurrency.test.js
    - backend/test/agendor.cacheInvalidation.test.js
    - .planning/todos/completed/in2-02-relogio-falso-em-before.md

key-decisions:
  - "D-WR3-04-a respeitada byte a byte: `mock.timers.reset()` ANTES do `enable(...)`, dentro do `beforeEach` já existente dos três arquivos; `before(` de topo = 0 nos três, `mock.timers.reset()` = 2 em cada"
  - "D-WR3-04-b CONFIRMADA POR MEDIÇÃO, com o filtro de comentário que o plano avisou ser necessário: zero arquivos habilitam 'setTimeout' num `before` de topo. Uma varredura ingênua acusa 3 falsos positivos (notificationStatus.test.js, scheduler.failsafe, scheduler.resilience) — nos três a palavra aparece dentro de um comentário que explica por que só 'Date' é habilitado"
  - "D-WR3-05-a respeitada: emailer.timeout.test.js importa de ./helpers/fakeTimers; `async function avancarRelogioAte` no arquivo = 0, `helpers/fakeTimers` = 1, e a implementação única da suíte é a do helper"
  - "D-WR3-07-a e D-WR3-07-b respeitadas com escopo COMPLETO em cacheInvalidation: as TRÊS variáveis lidas pelo routeHandler no hook (gate `sed`-range = 3), as duas restaurações de fim de corpo removidas, e o passo do MEIO do cenário (3) preservado (`orgQueFalha = null;` = 3)"
  - "D-WR3-07-c respeitada e NÃO 'completada': o `beforeEach` de cacheConcurrency tem EXATAMENTE uma atribuição (gate = 1) e as 8 declarações `let` de topo ficaram intactas (gate = 8)"
  - "R3-40 evitado seguindo a ordem prescrita: restauração de fim de corpo removida ANTES de inserir o hook, nos dois arquivos. Nenhum gate de `sed` devolveu 0"
  - "DIVERGÊNCIA DE ESCOPO (uma, e para MENOS): dois `new Error(...)` pré-existentes de canalParcial que o `biome format` reflui foram DEVOLVIDOS ao estado original, para que o diff dos seis arquivos seja estritamente hooks, importações e comentário — como o plano exige"

patterns-established:
  - "backend/test/helpers/fakeTimers.js é a única implementação de avancarRelogioAte da suíte, e a nota de topo agora diz isso por escrito, com o histórico das três cópias que convergiram para lá"

requirements-completed: [REL-02, REL-03, REL-04]

# Metrics
duration: 21min
completed: 2026-08-05
---

# Phase 04 Plan 26: relógio por caso, helper único e estado neutro em beforeEach (WR3-04, WR3-05, WR3-07) Summary

**Os três achados desta rodada não são sobre o produto — são sobre o INSTRUMENTO, e produzem o mesmo dano: um vermelho atribuído ao ator errado, apontando para um defeito de produção que não existe; três arquivos habilitavam o relógio falso uma única vez num `before` de topo, de modo que cada `tick(10000)` de `avancarRelogioAte` (até 200s por chamada) deixava o relógio adiantado para o caso seguinte — e o `cutoff` de 15 dias anda junto com ele, precedente já medido em `agendor.retry429.test.js`, onde 30s trouxeram os deals de fronteira 102 e 104 para dentro do golden; o oráculo de REL-02 guardava uma cópia local do helper com o defeito que o 04-13 já havia corrigido no compartilhado (um `then` de um argumento só, que deixa a promessa derivada órfã na rejeição e faz o `node:test` creditar a falha ao caso VIZINHO); e os dois arquivos de cache devolviam o estado global ao valor neutro na ÚLTIMA instrução do corpo do `test()`, ou seja, no caminho feliz — qualquer asserção que falhasse antes deixava o `routeHandler` respondendo pelo cenário errado dali em diante. Agora: `before(` de topo = 0 nos três, `helpers/fakeTimers.js` é a única implementação em circulação, e o estado neutro tem UM responsável em cada arquivo de cache. O diff de produção do plano inteiro é ZERO, nenhuma asserção mudou nos seis arquivos, e a suíte fica em 172/172 — exatamente o total da entrada.**

## Performance

- **Duration:** ~21 min
- **Tasks:** 3 de 3 (plano autônomo, sem checkpoint)
- **Commits:** 3 (1 por tarefa)
- **Suíte:** 172 → **172** (este plano não acrescenta nem remove casos), `npm run test:coverage` exit **0**, `npm run lint` exit **0** (44 warnings, baseline inalterado)
- **Diff:** 9 arquivos, +206 / −75 — e **nenhum** deles em `backend/src/`

## Accomplishments

### Task 1 — WR3-04: o relógio é rearmado por caso, nos TRÊS arquivos

O `before` de topo deixou de existir em `notificationStatus.partialFailure`, `registroResiliente` e `canalParcial`. A habilitação passou para o `beforeEach` já existente de cada um, precedida de `mock.timers.reset()`, exatamente como em `agendor.retry429.test.js` (o `reset()` vem antes porque `enable()` lança sobre temporizadores já habilitados). O comentário que explicava por que `'setTimeout'` entra junto de `'Date'` foi **preservado** e passou a acompanhar o hook, acrescido do motivo do rearme por caso e da citação de `in2-02`. O `after` com `mock.timers.reset()` ficou intacto nos três.

**O vizinho entrou.** O review nomeia os dois arquivos criados na rodada 2; o defeito foi **copiado** de `partialFailure`, registrado como `in2-02` e ainda aberto. Consertar só os dois nomeados repetiria pela quarta vez o padrão que reabriu esta fase três vezes.

Como `before` deixou de ser usado, ele saiu da desestruturação de `require('node:test')` nos três arquivos — é a única mudança de código além dos hooks.

**Commit:** `44c3e5c`

### Task 2 — WR3-05: a cópia local do helper desapareceu

`emailer.timeout.test.js` passou a importar `avancarRelogioAte` de `./helpers/fakeTimers`, e o bloco de comentário que justificava a cópia foi substituído pelo registro de que o motivo — não trocar instrumento e objeto medido na mesma rodada — **expirou** quando o 04-17 terminou de mexer no `emailer.js`. Nenhum caso, nenhuma asserção e nenhum `mock.timers.enable` de dentro dos casos mudou: o padrão daquele arquivo (habilitar o relógio dentro do próprio caso, com `reset()` num `finally`) continua como estava.

**O vizinho entrou.** `helpers/fakeTimers.js` declarava por escrito, na nota de topo, que a duplicação era **deliberada**. Trocar o consumidor sem atualizar a nota deixaria a suíte afirmando que existe uma cópia que já não existe — é assim que uma convenção volta a se degradar. A nota agora registra as três cópias que convergiram para lá (o envelope de `retry429` no 04-13, a de `emailer.timeout` agora) e um aviso de por que não fazer uma quarta. **Nenhuma linha de código do helper mudou** — gate medido: 0 linhas não-comentário no diff dele.

**Commit:** `46cf90a`

### Task 3 — WR3-07: estado neutro em `beforeEach`, com escopos deliberadamente diferentes

Nos dois arquivos, a restauração de fim de corpo foi **removida antes** de o hook ser inserido (a ordem prescrita contra R3-40); nenhum gate de `sed` devolveu 0, então a armadilha da substituição por primeira ocorrência não chegou a ocorrer.

- **`agendor.cacheInvalidation` — escopo COMPLETO.** O `beforeEach` existente passou a reafirmar as **três** variáveis lidas pelo `routeHandler`: `dealsServidos = dealsPage`, `orgQueFalha = null` e `delete ORG_CATEGORY[201]`, preservando o `fake.get.mock.resetCalls()` que já estava lá. As duas restaurações de fim de corpo (cenários (3) e (1)) saíram. **O `orgQueFalha = null` do MEIO do cenário (3) ficou** — ele não é limpeza, é o passo em que a API volta a responder antes da segunda execução, e é dele que depende a asserção que prova REL-04. 3/3 verdes, como o Experimento B previa.
- **`agendor.cacheConcurrency` — escopo estreito, por medição.** Um `beforeEach` novo com **uma única atribuição** (`cenarioAtivo`), e a restauração final do caso do espelho removida. `beforeEach` entrou na desestruturação de `node:test`. As outras 7 variáveis **não** foram tocadas, e o hook carrega escrito, ao lado, o sintoma de "completar a lista". 3/3 verdes, como o Experimento C previa.

Dois comentários que ainda afirmavam que o caso do espelho "restaura ao final" foram corrigidos — deixá-los seria a mesma classe de defeito da Task 2 (a suíte descrevendo por escrito um mecanismo que não existe mais).

**O que ficou de fora tem dono:** `.planning/todos/pending/wr3-07b-estado-de-armacao-em-cacheconcurrency.md` (69 linhas), prioridade baixa, com as 7 variáveis nomeadas, a mensagem literal do Experimento A e a indicação de que o conserto correto é escopar a armação por caso, não um hook.

**Commit:** `3c94508`

## Medições (contadas, não inferidas)

| Item | Critério do plano | Medido | Bate? |
|---|---|---|---|
| `^before\(` em `partialFailure` / `registroResiliente` / `canalParcial` | 0 / 0 / 0 | **0 / 0 / 0** | sim |
| `mock.timers.reset()` nos três | ≥ 2 em cada | **2 / 2 / 2** | sim |
| Arquivos com `'setTimeout'` em `before` de topo (filtrando comentário) | 0 | **0** | sim |
| `async function avancarRelogioAte` em `emailer.timeout.test.js` | 0 | **0** | sim |
| `helpers/fakeTimers` em `emailer.timeout.test.js` | 1 | **1** | sim |
| Implementações de `avancarRelogioAte` na suíte | só `helpers/fakeTimers.js` | **só `helpers/fakeTimers.js`** | sim |
| Diff de `helpers/fakeTimers.js`, linhas não-comentário | 0 | **0** | sim |
| `beforeEach(` em `cacheConcurrency` / `cacheInvalidation` | 1 / 1 | **1 / 1** | sim |
| `cenarioAtivo = 'limpeza-apaga-leitura'` dentro do hook de CC | 1 | **1** | sim |
| `cenarioAtivo = 'limpeza-apaga-leitura'` no arquivo inteiro | 2 | **2** | sim |
| `^let cenarioAtivo` | 1 | **1** | sim |
| Atribuições no `beforeEach` de CC (D-WR3-07-c) | 1 | **1** | sim |
| `^let ` em `cacheConcurrency` | 8 | **8** | sim |
| As TRÊS de `cacheInvalidation` dentro do hook | 3 | **3** | sim |
| `orgQueFalha = null;` | 3 | **3** | sim |
| `dealsServidos = dealsPage;` | 2 | **2** | sim |
| `^let dealsServidos` | 1 | **1** | sim |
| `delete ORG_CATEGORY[201]` dentro do hook / no arquivo | 1 / 1 | **1 / 1** | sim |
| `^let ` em `cacheInvalidation` | 2 | **2** | sim |
| Linhas do todo `wr3-07b` | 30–80 | **69** | sim |
| `Promise resolution is still pending` no todo | presente | **presente** | sim |
| Asserções no diff dos SEIS arquivos (plano inteiro) | 0 | **0** | sim |
| `git diff --name-only backend/src/` (plano inteiro, `HEAD~3..HEAD`) | vazio | **vazio** | sim |
| `package.json` / lockfile no diff | ausentes | **ausentes** | sim |
| Suíte | 172 (igual à entrada) | **172 / 172** | sim |
| `npm run test:coverage` | exit 0 | exit **0** | sim |
| `npm run lint` | exit 0 | exit **0**, 44 warnings | sim |

Cobertura inalterada, como esperado num plano sem diff de produção: `agendor.js` em 90,69% linhas / 88,42% branches; total 73,4% / 76,48% (pisos do `.c8rc.json`: 20 e 60).

## Divergências medidas

**Uma, e é de escopo — para MENOS, não para mais.**

**O `biome format` refluiu duas linhas pré-existentes que este plano não deveria tocar.** Ao formatar `notificationStatus.canalParcial.test.js` (convenção do CLAUDE.md), o Biome quebrou em três linhas dois `new Error('transporte SMTP indisponível ao recriar a conexão (...)')` que já estavam no arquivo desde o 04-24 e nada têm a ver com hooks. O critério de aceite só conta `assert` no diff, e essas linhas não são asserções — passariam. Mas a ação do plano é explícita: *"Nenhuma asserção é acrescentada, removida ou alterada. Só hooks, importações e a movimentação de instruções de restauração."* As duas linhas foram **devolvidas** ao estado original, e o diff dos seis arquivos passou a ser estritamente isso. O custo registrado: aquele arquivo tem duas linhas acima da largura do formatador, e um `npm run format` futuro vai reformatá-las — é dívida de formatação pré-existente, não deste plano, e não foi silenciada.

**Nenhuma divergência de comportamento.** Nenhum caso ficou vermelho depois da mudança dos hooks — o que responde a pergunta que a ação da Task 3 mandava PARAR e reportar: **nenhum caso dependia da contaminação** que o `beforeEach` remove, nos dois arquivos de cache. Idem para o relógio: os três arquivos de `notificationStatus` continuam com 3 casos verdes cada, sem edição de asserção, ou seja, nenhum deles carregava o adiantamento do relógio como pré-condição implícita — que era exatamente a informação que o registro `in2-02` pedia para confirmar ao mexer.

## A varredura que o plano mandou fazer, e o falso positivo que ela produz

O plano exige confirmar por medição — e reportar, não silenciar — que **nenhum outro** arquivo da suíte habilita `'setTimeout'` num `before` de topo. Uma varredura ingênua (bloco `before` inteiro, sem filtro) acusa **três**:

```
backend/test/notificationStatus.test.js:169
backend/test/scheduler.failsafe.test.js:172
backend/test/scheduler.resilience.test.js:140
```

Os três são **falso positivo da mesma classe que o plano avisou existir**: a palavra `setTimeout` aparece dentro de um comentário pré-existente que explica por que só `'Date'` é habilitado ali (*"Só 'Date': habilitar 'setTimeout' congelaria a espera entre lotes de páginas"*). Filtrando linhas de comentário, o resultado é **zero**, e o controle da mesma varredura mostra que as 7 linhas de `enable` remanescentes em `before` de topo pedem `apis: ['Date']` e só isso. **D-WR3-04-b confirmada: nenhum arquivo além dos três entrou, e nenhum outro precisaria entrar.**

## Por que `beforeEach` e não a última instrução do caso

A restauração no fim do corpo de um `test()` é restauração **no caminho feliz**. Se uma asserção falha antes dela, ela não roda — e o estado global sujo sobrevive. Nos dois arquivos de cache isso significa um `routeHandler` respondendo pelo **cenário errado** nos casos seguintes: o segundo vermelho chega com a mensagem de outro caso e aponta para um defeito de produção que não existe. É o mesmo custo que WR2-03 usou para justificar o conserto do helper de relógio, aplicado um nível acima. Com o hook, existe **um** lugar responsável pelo estado, e ele é independente do desfecho do caso anterior.

A ordem de declaração dos casos de `cacheInvalidation` **continua sendo parte do teste** (o cenário (2) precisa medir uma execução com cache frio). O hook não reordena nem renomeia nada — só garante que cada caso comece do mesmo ponto.

## Sobre o cenário simétrico

**Este plano não tem cenário simétrico de comportamento, e a justificativa está por escrito no `<objective>`, não improvisada aqui:** nenhuma das três correções introduz ou altera ramificação de comportamento. Elas trocam o momento em que um hook roda, a origem de uma função de teste e o lugar onde uma variável volta ao valor neutro. Não existe "direção oposta" de um `beforeEach`; o que se poderia asserir sobre ele é a suíte continuar verde com o **mesmo número de casos** — e isso foi critério de aceite nas três tasks, medido em 172/172.

**O que existe é o VIZINHO, e os três entraram como trabalho obrigatório:** `partialFailure` na Task 1 (o arquivo de onde o defeito foi copiado), `helpers/fakeTimers.js` e sua nota de topo na Task 2, e `orgQueFalha` + `ORG_CATEGORY` na Task 3 — as duas variáveis que o texto do achado **não** cita e que sofriam do mesmo defeito. Cada uma delas tem gate automatizado próprio na tabela de medições: nomear o vizinho sem verificá-lo seria o mesmo defeito desta fase, um nível acima.

## Riscos da matriz — como cada um foi neutralizado

| # | Risco | Como foi evitado (medido) |
|---|---|---|
| R3-32 | `enable()` lançar por temporizadores já habilitados ao mover para `beforeEach` | `mock.timers.reset()` precede o `enable()` nos três arquivos (`mock.timers.reset()` = 2 em cada); nenhum erro "timers already enabled" |
| R3-33 | Algum caso depender da contaminação que o hook remove | Não materializou: 3/3 e 3/3 verdes nos dois arquivos de cache, sem edição de asserção. D-WR3-07-c respeitada (1 atribuição no hook de CC), então o modo de falha medido no Experimento A não foi provocado |
| R3-34 | Mudar asserção junto com hook, disfarçando alteração de oráculo | `assert` no diff dos seis arquivos = **0**, medido sobre o plano inteiro (`HEAD~3..HEAD`) |
| R3-40 | Inserir o hook antes de remover a restauração antiga e substituir a linha errada | Ordem prescrita seguida nos dois arquivos; nenhum gate de `sed` devolveu 0 |
| R3-35 | O helper compartilhado divergir da cópia no ramo de sucesso | `emailer.timeout` 9/9, `fakeTimers.helper` 3/3, `agendor.retry429` 8/8 — todos exit 0 |

## Threat Model — dispositions aplicadas

| Threat ID | Disposition | Como foi mitigado / aceito |
|---|---|---|
| T-04-26-01 | mitigate | Helper único (Task 2) e estado neutro em `beforeEach` (Tasks 1 e 3): nenhum instrumento da suíte pode mais creditar uma falha ao caso vizinho por rejeição órfã ou estado sujo |
| T-04-26-02 | mitigate | Zero asserções no diff dos seis arquivos, medido sobre o plano inteiro |
| T-04-26-03 | mitigate | Rearme por caso e reafirmação de estado; total de testes idêntico à entrada (172) |
| T-04-26-04 | mitigate | Nenhum caso ficou vermelho, então nada foi "consertado no escuro"; a informação (nenhum caso dependia da contaminação) está registrada acima |
| T-04-26-SC | accept | Nenhuma instalação de pacote; `package.json` e lockfile ausentes do diff (medido) |

Nenhum artefato deste plano exibe o valor do `AGENDOR_TOKEN`. **SEC-01 permanece ABERTO** — não foi tocado nem declarado resolvido, e o seu todo não foi editado.

## Escopo que este plano deliberadamente NÃO fecha

**As 7 variáveis de ARMAÇÃO de `cacheConcurrency`** — `liberar210`, `liberar205DaExecucaoB`, `chamadas205`, `chamadasDealsNoEspelho`, `liberarDealsDaExecucaoB`, `falhar205DaExecucaoA`, `consultas205NoEspelho`. Elas não são estado de cenário: os pontos de suspensão são armados uma única vez e consumidos ao longo da ordem declarada dos casos, e zerá-los **re-arma** uma suspensão que ninguém libera — os casos (2) e (3) deixam de terminar, com `Promise resolution is still pending but the event loop has already resolved`. Isso está **medido** (Experimento A do planejamento), não inferido, e é a razão de o hook ter gate de exatamente uma atribuição. O conserto correto é escopar a armação por caso (fábrica de estado por cenário), que é redesenho do arquivo. Registrado em `.planning/todos/pending/wr3-07b-estado-de-armacao-em-cacheconcurrency.md`.

**Nenhum arquivo de `backend/src/`.** O diff de produção é zero, e isso é critério de aceite verificado sobre os três commits.

**Nenhum outro todo foi editado.** `in-01`, `rel-02b` e `sec-01` mantêm prioridade e estado atuais por decisão do usuário; os únicos arquivos de `.planning/todos/` no diff são `in2-02` (movido para `completed/`) e `wr3-07b` (criado).

**A dívida de formatação de `canalParcial`** (duas linhas acima da largura do Biome, pré-existentes) — registrada nas Divergências, não corrigida aqui para manter o diff estritamente no escopo do plano.

## Definition of Done

- [x] A justificativa escrita da ausência de cenário simétrico está no objetivo, e o vizinho de cada task está nomeado e corrigido
- [x] Zero `before(` de topo nos três arquivos que avançam o relógio
- [x] Uma única implementação de `avancarRelogioAte` na suíte
- [x] As três variáveis de `cacheInvalidation` reafirmadas no hook, cada uma com gate próprio
- [x] `beforeEach` de `cacheConcurrency` com exatamente uma atribuição, e o todo `wr3-07b` aberto com a medição
- [x] Zero asserções alteradas nos seis arquivos
- [x] `git diff --name-only backend/src/` vazio no plano inteiro
- [x] Todo `in2-02` movido para `completed/`; nenhum outro todo editado
- [x] Suíte completa verde com o mesmo total da entrada (172); `npm run lint` exit 0

## Known Stubs

Nenhum. Este plano não introduz valor vazio, placeholder nem componente sem fonte de dados — ele move hooks, troca uma importação e reafirma variáveis já existentes.

## Próximo

**WR3-04, WR3-05 e WR3-07 estão fechados.** Fica registrado para quem seguir: `backend/test/helpers/fakeTimers.js` é a **única** implementação de `avancarRelogioAte` — quem precisar avançar relógio falso importa de lá, e a nota de topo do arquivo explica por que uma quarta cópia é má ideia. E o aviso da armação: o `beforeEach` de `agendor.cacheConcurrency.test.js` é curto **de propósito**; completá-lo pendura a suíte, e o motivo está tanto no comentário do hook quanto no todo `wr3-07b`. O próximo é o **04-27**, o último do gap closure r3.

## Self-Check: PASSED

- 9/9 arquivos declarados existem em disco (7 modificados + `wr3-07b` criado + `in2-02` movido para `completed/`)
- 3/3 commits existem no histórico: `44c3e5c`, `46cf90a`, `3c94508`
- `git diff --name-only HEAD~3 HEAD -- backend/src/` vazio, medido após o terceiro commit
