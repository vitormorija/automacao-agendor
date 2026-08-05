---
phase: 04-confiabilidade-das-integra-es
plan: 21
subsystem: resumo-semanal-individual
tags: [cr3-01, caminho-vizinho, categoria-indecidivel, rel-02, rel-06, gap-closure-r3]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "04-19 (campo categoriaIndecidivel produzido por getStaleDeals); 04-20 (a mesma regra aplicada no envio DIARIO, em runCheck) — este plano fecha o SEGUNDO e ultimo produtor de e-mail dirigido ao responsavel"
provides:
  - "sendOwnerWeeklySummary exclui o negocio de categoria indecidivel do e-mail INDIVIDUAL do comercial, como segundo passo de filtro com contagem propria"
  - "O consolidado do admin (sendWeeklySummary) e o snapshot semanal continuam listando o negocio — a outra metade da decisao do usuario, medida por asseracao sobre o HTML"
  - "4 cenarios em emailer.resumoIndecidivel.test.js, incluindo o SIMETRICO (exclusao total sem e-mail vazio) e a composicao com o filtro de funil Beefor"
  - "CR3-01 fechado nos tres caminhos (borda, envio diario, resumo semanal)"
affects: [04-22, verificacao-da-fase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Filtro novo como PASSO SEPARADO, nunca embutido no filter existente: o contador antigo (skippedByFunnel) continua significando o que o nome diz, e cada supressao tem contagem propria"
    - "Asseracao sobre o HTML enviado, nao so sobre a contagem — um conserto que apenas contasse diferente e continuasse listando o card passaria por uma asseracao de contagem"
    - "logger.warn em codigo NOVO dentro de um arquivo cujo console.* legado NAO e migrado: a contagem de console.* e medida antes e depois para provar que LOG-01 (Fase 5) nao foi antecipado"

key-files:
  created:
    - backend/test/emailer.resumoIndecidivel.test.js
  modified:
    - backend/src/emailer.js

key-decisions:
  - "D-CR3-01-l respeitada e MEDIDA nas duas direcoes: o e-mail individual exclui (cenarios 1, 2 e 4) e o consolidado do admin mantem (cenario 3, asserindo o titulo no HTML do admin)"
  - "D-CR3-01-m respeitada por medicao: skippedByFunnel continua em 3 linhas nao-comentario e e calculado sobre o PRIMEIRO passo; o segundo filtro tem variavel e contagem proprias"
  - "D-CR3-01-n respeitada: logger.warn com tag [Emailer] e require('./logger') no topo; as 4 linhas de console.* legadas ficaram byte a byte (4 antes, 4 depois)"
  - "D-CR3-01-o respeitada: nenhum caminho novo para o caso vazio — a saida antecipada existente ja resolve, e o cenario (2) o pina"
  - "PC-13 satisfeito: o stub de sendMail le exclusivamente mailOptions.to e mailOptions.html; zero ocorrencias de deepStrictEqual(mailOptions"

patterns-established:
  - "O cenario SIMETRICO desta rodada e o defeito do LADO OPOSTO do mesmo filtro: (1) prova que o filtro tira o card certo; (2) prova que ele nao produz um e-mail vazio. Sem (2), um filtro correto e um filtro que gera 'Seus 0 cards parados' seriam indistinguiveis"

requirements-completed: [REL-02, REL-06]

# Metrics
duration: 12min
completed: 2026-08-05
---

# Phase 04 Plan 21: o resumo semanal individual e a categoria indecidível (CR3-01, 3/3) Summary

**O 04-20 fechou o envio diário e o negócio indecidível voltava pela sexta-feira: `sendOwnerWeeklySummary` é o segundo — e último — produtor de e-mail dirigido ao responsável, lê a mesma lista de `getStaleDeals` e entregava ao comercial exatamente o card que o agendador acabara de se recusar a notificar; agora um segundo predicado no filtro, como passo separado com contagem própria e `logger.warn`, tira o card do e-mail individual e o mantém no consolidado do admin e no snapshot — a política que o filtro do funil Beefor já aplicava no mesmo bloco, medida nas duas direções.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 de 2 (plano autônomo, sem checkpoint)
- **Commits:** 2 (1 por tarefa)
- **Suíte:** 156 → **160** (os 4 cenários novos), `npm run test:coverage` exit 0, `npm run lint` exit 0 (44 warnings, baseline)

## Accomplishments

### Task 1 — RED, com a saída literal

`backend/test/emailer.resumoIndecidivel.test.js`, 4 cenários. **A previsão do plano bateu exatamente:** (1), (2) e (4) vermelhos, (3) já verde.

```
TAP version 13
# [Emailer] Relatório semanal enviado para Fulana Silva <comercial@exemplo.invalid> — 2 card(s)
# [Emailer] Relatório semanal enviado para Fulana Silva <comercial@exemplo.invalid> — 2 card(s)
# [Emailer] Relatório semanal: 1 card(s) ignorado(s) por funil sem notificação ao responsável
# [Emailer] Relatório semanal enviado para Fulana Silva <comercial@exemplo.invalid> — 2 card(s)

not ok 1 - (1) exclusão parcial: o card indecidível não vai no e-mail individual do comercial
    2 !== 1   (expected: 1, actual: 2)

not ok 2 - (2) SIMÉTRICO — exclusão total: nenhum e-mail, e não um e-mail vazio
    1 !== 0   (expected: 0, actual: 1)

ok 3 - (3) o consolidado do admin CONTINUA listando o negócio indecidível

not ok 4 - (4) os dois filtros compõem: funil Beefor e categoria indecidível somam, não se substituem
    2 !== 1   (expected: 1, actual: 2)

# tests 4 / # pass 1 / # fail 3
```

**A prova operacional está nas três primeiras linhas de log, emitidas pelo próprio SUT.** No cenário (1) o sistema anuncia `Relatório semanal enviado ... — 2 card(s)` numa lista de dois negócios em que **um deles é indecidível**: o card que `runCheck` se recusa a enviar desde o 04-20 sai pela sexta-feira com o mesmo peso de um card legítimo, e o log não distingue um do outro. A terceira linha é a testemunha do precedente: no cenário (4) o filtro de funil já suprime o card do Beefor e o diz em voz alta — o card indecidível, ao lado, passa em silêncio.

A asserção que reprova primeiro em (1) e (4) é `results[0].count === 1`; em (2) é `enviosCapturados.length === 0`. As asserções sobre o HTML vêm logo depois por desenho: no estado defeituoso elas também estariam vermelhas, mas o primeiro vermelho legível é o que diz *quantos* cards o comercial recebeu.

**Commit:** `920215a`

### Task 2 — GREEN

Uma mudança em `backend/src/emailer.js`, e nada além dela: **25 inserções, 2 remoções** — e as duas remoções são exatamente as duas linhas reescritas (`const notifiable = deals.filter(shouldNotifyOwner);` e o cálculo de `skippedByFunnel` sobre ela). Nenhuma outra linha do arquivo foi tocada.

O filtro virou dois passos explícitos:

| Passo | Entrada | Saída | Contagem | Log |
|---|---|---|---|---|
| 1 — funil | `deals` | `doFunilNotificavel` | `skippedByFunnel` (inalterado) | `console.log` legado, byte a byte |
| 2 — categoria | `doFunilNotificavel` | `notifiable` | `ignoradosPorCategoriaNaoConsultada` | `logger.warn` novo, tag `[Emailer]` |

O nome da variável de contagem nova é `ignoradosPorCategoriaNaoConsultada` — com `C` maiúsculo — o que faz o critério `grep -c "categoriaIndecidivel"` medir **só o predicado**, e não o contador. O `logger.warn` carrega **apenas um inteiro** interpolado: nenhum objeto de erro, nenhuma opção de transporte, nenhuma credencial (T-04-21-04).

O comentário existente do filtro de funil foi **estendido**, não substituído: mais 14 linhas em PT-BR declarando que o mesmo princípio vale para o card indecidível, por quê (não saber a categoria é indistinguível de "pode ser uma categoria excluída"), que esta é a segunda de duas superfícies de e-mail ao responsável (a outra é `runCheck`, fechada no 04-20), e que os dois filtros são passos separados de propósito. Cita `emailer.resumoIndecidivel.test.js` como oráculo. Referências por âncora nomeada, nunca por número de linha (WR2-06).

Os 4 cenários ficaram verdes e os **arquivos vizinhos passaram sem edição**: `emailer.timeout` (9), `emailer.transporteVivo` (3), `emailer.smtpPass` (3), `scheduler.categoriaIndecidivel` (3). `git diff --name-only backend/test/` na Task 2 saiu **vazio**.

**Commit:** `32135ca`

## Medições (contadas, não inferidas)

| Item | Antes | Depois | Critério do plano | Bate? |
|---|---|---|---|---|
| `categoriaIndecidivel` em `emailer.js` (não-comentário) | 0 | **1** | 1 | sim |
| `skippedByFunnel` (não-comentário) | 3 | **3** | 3, inalterado | sim |
| `require('./logger')` | 0 | **1** | 1 | sim |
| `logger.warn` (não-comentário) | 0 | **1** | 1 | sim |
| `console.(log|warn|error)` (não-comentário) | **4** | **4** | igual antes e depois | sim |
| `git diff backend/src/emailer.js \| grep -c weeklySummaryHtml` | — | **0** | 0 | sim |
| `^test(` no arquivo novo | — | **4** | 4 | sim |
| `simétrico` no arquivo novo (case-insensitive) | — | **2** | ≥ 1 | sim |
| `includes('NEGOCIO-INDECIDIVEL')` no arquivo novo | — | **3** | ≥ 2 | sim |
| `deepStrictEqual(mailOptions` no arquivo novo | — | **0** | 0 | sim |
| Linhas do arquivo novo | — | **193** | ≥ 120 | sim |
| `git diff --name-only backend/src/` | — | **só `emailer.js`** | só `emailer.js` | sim |
| `git diff --name-only backend/test/` na Task 2 | — | **vazio** | vazio | sim |
| Diff de `emailer.js` | — | **25 inserções, 2 remoções** | — | — |
| Suíte | 156 | **160** | 156 + 4 | sim |
| `npm run test:coverage` | — | exit **0** | exit 0 | sim |
| `npm run lint` | — | exit **0**, 44 warnings | exit 0 | sim |

**Todos os critérios de aceite numéricos bateram.** Nenhum se mostrou aritmeticamente impossível — como no 04-19 e no 04-20, e diferente de 04-15/16/17.

Cobertura de `emailer.js` medida em **89,42% de linhas / 63,63% de branches** (pisos do `.c8rc.json`: 20 e 60).

## Como os cenários foram construídos (e por que assim)

**Chamada direta, sem banco de negócios e sem axios.** As duas funções são públicas e recebem a lista pronta, então os negócios sintéticos são objetos no formato que `getStaleDeals` devolve depois do 04-19. Isso mantém o arquivo barato (109ms) e o oráculo preciso: o que está sob teste é a **decisão do filtro**, não a borda que produz o campo — essa já tem o seu próprio arquivo (`agendor.categoriaIndecidivel.test.js`).

**Asserção sobre o HTML, não só sobre a contagem.** Em (1) e (4) o corpo do e-mail é verificado por `includes` do título literal. Um conserto que apenas ajustasse `ownerDeals.length` no assunto e continuasse renderizando a linha da tabela passaria por uma asserção de contagem — e o comercial continuaria lendo o card.

**Títulos reconhecíveis por `includes`** (`NEGOCIO-NORMAL`, `NEGOCIO-INDECIDIVEL`, `NEGOCIO-BEEFOR`), porque `buildDealRows` e `buildOwnerBlocks` interpolam `${d.title}` diretamente no HTML.

**O cenário (3) chama `sendWeeklySummary`, não `sendOwnerWeeklySummary`.** É a única forma de medir a metade "permanece nos relatórios" da decisão do usuário em vez de presumi-la: se alguém "harmonizar" as duas funções aplicando o filtro nas duas, é o (3) que fica vermelho.

**Um único `mock.method` para o arquivo inteiro**, como manda o molde de `emailer.timeout.test.js` (`node --test` isola por arquivo, não por `test()`). O `beforeEach` zera `enviosCapturados`; nenhum cenário reinstala o mock no meio do arquivo.

## Deviations from Plan

**Nenhum desvio.** O plano foi executado exatamente como escrito: uma única mudança em `backend/src/emailer.js`, com as duas partes prescritas (o filtro e o comentário) e nada além delas; nenhum arquivo além dos dois declarados em `files_modified`; nenhuma regra dos Rules 1-4 acionada.

Um detalhe de forma que vale registrar por não ser desvio: a variável de contagem foi nomeada `ignoradosPorCategoriaNaoConsultada` (e não `...Indecidivel`) **de propósito**, para que o critério `grep -c "categoriaIndecidivel"` meça o predicado do filtro e só ele — se o contador carregasse a mesma palavra em minúscula, o critério de valor 1 seria inatingível sem que nada estivesse errado.

## Riscos da matriz — como cada um foi neutralizado

| # | Risco | Como foi evitado (medido) |
|---|---|---|
| R3-10 | Embutir o predicado novo no `filter(shouldNotifyOwner)` e fazer `skippedByFunnel` mentir | Dois passos separados; `skippedByFunnel` medido em 3 antes e 3 depois, e continua calculado sobre o primeiro passo |
| R3-11 | Filtrar também o consolidado do admin | Cenário (3) verde asserindo `html.includes('NEGOCIO-INDECIDIVEL') === true` no e-mail do admin; `grep weeklySummaryHtml` no diff = 0 |
| R3-12 | Migrar o `console.*` legado junto (LOG-01, Fase 5) | Contagem não-comentário de `console.*`: **4 antes, 4 depois** |
| R3-13 | Enviar e-mail vazio quando tudo é indecidível | Cenário (2) verde: `enviosCapturados.length === 0` e `deepStrictEqual(results, [])`; a saída antecipada existente não foi tocada |

## Threat Model — dispositions aplicadas

| Threat ID | Disposition | Como foi mitigado / aceito |
|---|---|---|
| T-04-21-01 | mitigate | Segundo predicado no filtro; cenários (1), (2) e (4) com asserção sobre o HTML enviado |
| T-04-21-02 | mitigate | O card de organização não consultada permanece apenas nas superfícies internas — cenário (3) mede que o admin ainda o vê |
| T-04-21-03 | mitigate | `logger.warn` com tag `[Emailer]` e contagem própria, separada de `skippedByFunnel` (medida em 3 antes e depois) |
| T-04-21-04 | mitigate | O aviso interpola **apenas um inteiro**; o stub do teste lê só `mailOptions.to` e `mailOptions.html` (PC-13, `deepStrictEqual(mailOptions` = 0) |
| T-04-21-05 | accept | Decisão do usuário de 2026-08-05: o comercial pode deixar de ver um card legítimo no relatório da semana da falha; o card segue no painel e no consolidado do admin, e a semana seguinte reconsulta |
| T-04-21-SC | accept | Nenhuma instalação de pacote; `git diff` de `backend/package.json` e `backend/package-lock.json` vazio |

Nenhum artefato deste plano exibe o valor do `AGENDOR_TOKEN`, e **SEC-01 permanece ABERTO** (decisão C8) — não foi tocado nem declarado resolvido.

## Escopo que este plano deliberadamente NÃO fecha

`sendWeeklySummary`, `weeklySummaryHtml`, `buildOwnerBlocks` e `ownerWeeklyHtml` estão **byte a byte**: o consolidado do admin é superfície de observação por decisão. `saveWeeklySnapshot` e os agrupamentos `byOwner`/`byCategory`/`byFunnel` de `runWeeklySummary` também não foram tocados — o histórico de relatório continua contando o card.

`runCheckOnly`, `routes/deals.js` e `routes/reports.js` seguem sem filtrar por categoria, de propósito.

As rotas `POST /api/notifications/test-owner-summary` e `/send-owner-summaries` **herdaram o filtro de graça**, por chamarem a mesma função — nenhuma delas foi editada.

As 4 linhas de `console.*` de `emailer.js` continuam lá: migrá-las é LOG-01, da Fase 5.

`getUsers` e `getDealById` continuam fora do retry da borda: escopo do **04-22** (WR3-01).

## Definition of Done

- [x] Os 4 cenários verdes, com o RED de (1), (2) e (4) registrado por saída literal
- [x] O cenário SIMÉTRICO (2) existe e está nomeado como tal no arquivo (2 ocorrências)
- [x] O consolidado do admin continua listando o negócio indecidível (cenário 3)
- [x] `skippedByFunnel` continua significando o que o nome diz, com contagem inalterada (3 → 3)
- [x] Nenhuma linha de `console.*` legada foi migrada (4 → 4)
- [x] Suíte completa verde (160), cobertura acima dos pisos, `npm run lint` exit 0

## Known Stubs

Nenhum. Nenhum valor vazio ou placeholder foi introduzido; o `logger.warn` novo carrega sempre uma contagem inteira real.

## Próximo

**CR3-01 está fechado nos três caminhos** — borda (04-19), envio diário (04-20) e resumo semanal individual (04-21). O próximo é o **04-22** (WR3-01): `getUsers` e `getDealById` ainda estão fora da política única de retry da borda Agendor.

## Self-Check: PASSED

- 3/3 arquivos declarados existem em disco: `backend/test/emailer.resumoIndecidivel.test.js` (criado), `backend/src/emailer.js` (modificado), este SUMMARY
- 2/2 commits existem no histórico: `920215a`, `32135ca`
