---
phase: 04-confiabilidade-das-integra-es
plan: 23
subsystem: laco-de-runcheck-fail-safe
tags: [wr3-02, dedup, fail-safe, c10, rel-03, rel-05, gap-closure-r3]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "WR2-02 (04-15, o try/catch da GRAVAÇÃO do desfecho e o arquivo registroResiliente); CR3-01 (04-20, a guarda de categoria indecidível logo abaixo da dedup); WR2-01 (04-14, os dois results.notified++)"
provides:
  - "As TRÊS operações de banco do laço de runCheck protegidas: nenhuma delas pode mais abortar a rodada"
  - "A leitura de dedup com fail-safe DECLARADO: falhar a leitura significa notificar (C10), não silenciar"
  - "2 cenários novos em notificationStatus.registroResiliente.test.js — E (o achado) e F (o vizinho, que já era seguro e deixou de ser presunção)"
  - "WR3-02 fechado"
affects: [04-24, verificacao-da-fase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Quando um plano protege UMA operação com o argumento 'esta conexão pode estar indisponível', o argumento vale para TODAS as operações da mesma conexão no mesmo laço — o 04-15 protegeu a terceira e deixou a primeira exposta por não fazer a varredura"
    - "O vizinho seguro entra no arquivo de teste como asserção, não como presunção: F já passava no RED e é isso que o torna útil — ele pina o que hoje é verdade por construção e ficaria vermelho se alguém movesse o insert para fora do try do bloco de envio"
    - "Fail-safe se escolhe pela direção do custo, não pela cautela aparente: assumir 'true' na falha de dedup PARECE conservador (não envia) e é a pior classe de falha do Core Value"

key-files:
  created: []
  modified:
    - backend/src/scheduler.js
    - backend/test/notificationStatus.registroResiliente.test.js

key-decisions:
  - "D-WR3-02-a respeitada e MEDIDA: a leitura vive num try/catch próprio com a variável inicializada em false — `= alreadyNotifiedToday(deal.id);` = 1, `if (alreadyNotifiedToday(deal.id))` = 0"
  - "D-WR3-02-b respeitada: só `erroDeDedup.message` vai ao logger.error, tag [Scheduler] — nenhum objeto de erro é logado"
  - "D-WR3-02-c respeitada: o corpo do if de skip ficou byte a byte; o diff tem 2 remoções e as 2 são as linhas reescritas"
  - "D-WR3-02-d respeitada: runCheckOnly NÃO foi tocada — `git diff | grep -c runCheckOnly` = 0; o total não-comentário de `alreadyNotifiedToday(deal.id)` continua 2, exatamente como antes"
  - "DIVERGÊNCIA MEDIDA: o critério de aceite da Task 1 esperava 3 ocorrências de `mock.method(db`; o grep devolve 4 — as 3 instalações reais mais 1 MENÇÃO dentro do bloco de comentário que explica a armadilha de CommonJS. A intenção do critério (todas antes do require do scheduler) está satisfeita: linhas 171, 183, 201 e 213, contra 222 do require"

patterns-established:
  - "Um arquivo de teste que nasce como oráculo de UMA falha vira o oráculo da CLASSE dela: registroResiliente passou a cobrir as três operações de banco do laço, e o cabeçalho lista as três com o papel de cada uma — quem acrescentar uma quarta operação encontra o lugar já preparado"

requirements-completed: [REL-03, REL-05]

# Metrics
duration: 12min
completed: 2026-08-05
---

# Phase 04 Plan 23: a leitura de dedup deixa de abortar a rodada (WR3-02) Summary

**O 04-15 protegeu a gravação do desfecho argumentando que "a conexão SQLite pode estar indisponível — é justamente uma das origens possíveis da exceção que trouxe o fluxo até aqui — e `updateNotificationStatus` usa a MESMA conexão": o argumento estava correto e incompleto, porque `alreadyNotifiedToday(deal.id)` usa a mesma conexão, é a PRIMEIRA operação de banco do laço e vivia fora de qualquer `try` interno — medido no RED, uma única falha ali produzia `results.error` preenchido, `r.deals.length = 0`, `r.notified = 0` e ZERO e-mails num dia em que dois deveriam sair; agora a leitura tem o mesmo fail-safe declarado do resto do laço, e não saber se já notificamos é lido como "não deduplica" (C10), com o vizinho imediato — a falha no INSERT — pinado por asserção em vez de presumido.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 de 2 (plano autônomo, sem checkpoint)
- **Commits:** 2 (1 por tarefa)
- **Suíte:** 164 → **166** (os 2 cenários novos), `npm run test:coverage` exit 0, `npm run lint` exit 0 (44 warnings, baseline)

## Accomplishments

### Task 1 — RED, com a saída literal

`backend/test/notificationStatus.registroResiliente.test.js` estendido de 1 para 3 cenários (291 → 490 linhas), com o cenário D **byte a byte**.

```
ok 1 - D: falha ao registrar o desfecho não aborta a rodada — o deal seguinte continua sendo notificado
not ok 2 - E: falha ao LER a dedup não aborta a rodada — os dois deals são processados e notificados
  ---
  failureType: 'testCodeFailure'
  error: |-
    a falha ao ler a dedup não pode abortar a rodada
    + actual - expected

    + 'The database connection is not open'
    - undefined
  code: 'ERR_ASSERTION'
ok 3 - F: falha no INSERT do notification_log não aborta a rodada — o deal seguinte continua sendo notificado
# tests 3 / # pass 2 / # fail 1
```

A previsão do plano **bateu**: E vermelho com `results.error` preenchido, D e F verdes. O plano pedia também o valor medido de `r.deals.length` — a asserção de `r.error` é a primeira e interrompe o caso antes dele, então o valor foi medido à parte (cópia de rascunho do arquivo, executada e apagada, `git status` conferido em seguida):

```
MEDIDO r.deals.length = 0 | r.notified = 0 | enviosConfirmados = 0
```

**Zero, não um** — o mesmo achado estrutural que o 04-15 e o 04-16 já tinham medido: `results.deals.push(dealResult)` fica no FIM do corpo do laço, depois do ponto da exceção, então a rodada perde também o registro do negócio que disparou a falha. O número reproduz exatamente o que o review registrou (`deals processados: 0 (esperado 2)`, `e-mails enviados: 0 (esperado 2)`).

A prova operacional veio no log do próprio SUT, com o ponto exato da morte da rodada:

```
[ERROR] [Scheduler] Erro na verificação: Error: The database connection is not open
    at runCheck (backend/src/scheduler.js:93:11)
```

`scheduler.js:93` era a condição do `if` da dedup. O `catch` que capturou não é nenhum dos internos: é o **externo** de `runCheck`, o que encerra a função inteira.

**Commit:** `e2a68fc`

### Task 2 — GREEN

Uma mudança em `backend/src/scheduler.js`, **nada além dela**: 26 inserções, 2 remoções — e as **2 remoções são exatamente as duas linhas reescritas**, conferido no diff:

```
-      // Não notificar duas vezes no mesmo dia
-      if (alreadyNotifiedToday(deal.id)) {
```

No lugar delas, a variável inicializada em `false`, o `try` que a atribui, o `catch (erroDeDedup)` que loga só a mensagem, e o `if` existente lendo a variável. O corpo do `if` (marcar `skipped`, `results.skipped++`, `push`, `continue`) não aparece no diff.

Os 3 cenários ficaram verdes e os **7 arquivos vizinhos passaram sem edição**: `notificationStatus` (6), `notificationStatus.partialFailure` (3), `notificationStatus.canalParcial` (1), `scheduler.categoriaIndecidivel` (3), `scheduler.failsafe` (8), `scheduler.resilience` (5) e `db.dedup` (3). `git diff --name-only -- test/` na Task 2 saiu **vazio**.

**Commit:** `a47bb58`

## Medições (contadas, não inferidas)

| Item | Antes | Depois | Critério do plano | Bate? |
|---|---|---|---|---|
| `if (alreadyNotifiedToday(deal.id))` | 1 | **0** | 0 | sim |
| `= alreadyNotifiedToday(deal.id);` | 0 | **1** | 1 | sim |
| `alreadyNotifiedToday(deal.id)` (não-comentário, arquivo inteiro) | 2 | **2** | 2, inalterado | sim |
| `catch (erroDeDedup)` (não-comentário) | 0 | **1** | 1 | sim |
| `catch (erroDeRegistro)` | 1 | **1** | 1 | sim |
| `results.notified++` (não-comentário) | 2 | **2** | 2 | sim |
| `categoriaIndecidivel` (não-comentário) | 1 | **1** | 1 | sim |
| `continue;` (não-comentário) | 3 | **3** | — (não é regressão do 04-20) | sim |
| `runCheckOnly` no diff de `scheduler.js` | — | **0** | 0 | sim |
| `^test(` no arquivo de teste | 1 | **3** | 3 | sim |
| Asserções removidas/alteradas no diff do teste | — | **0** | 0 | sim |
| `pré-condição` no arquivo de teste | 3 | **8** | ≥ 5 | sim |
| Linhas do arquivo de teste | 291 | **490** | ≥ 380 | sim |
| `mock.method(db` (linhas casadas) | 1 | **4** | 3 | **não — ver Divergências** |
| Ordem dos mocks vs. `require('../src/scheduler')` | — | **171, 183, 201, 213 < 222** | todos antes | sim |
| `git diff --name-only -- src/` | — | **só `scheduler.js`** | só `scheduler.js` | sim |
| `git diff --name-only -- test/` na Task 2 | — | **vazio** | vazio | sim |
| Suíte | 164 | **166** | 164 + 2 | sim |
| `npm run test:coverage` | — | exit **0** | exit 0 | sim |
| `npm run lint` | — | exit **0**, 44 warnings | exit 0 | sim |

Cobertura de `scheduler.js` medida em **80,79% de linhas / 76,47% de branches** (pisos do `.c8rc.json`: 20 e 60). O ramo de exceção da leitura de dedup, que não existia, passou a ser exercitado.

## Divergências medidas

**Uma só, e é de contagem do critério, não de comportamento.**

O critério da Task 1 dizia: *"`grep -n "mock.method(db" …` mostra 3 ocorrências, todas com número de linha menor que o do `require('../src/scheduler')`"*. O grep devolve **4 linhas**: 171, 183, 201 e 213. A de 171 não é uma instalação de mock — é a **menção literal** `mock.method(db, 'updateNotificationStatus', …)` dentro do bloco de comentário que explica a armadilha de CommonJS, e ela já existia no arquivo antes desta rodada (o baseline medido do mesmo grep era 1, não 0, pela mesma razão). As instalações reais são 3: 183, 201 e 213.

A **intenção** do critério — nenhum mock instalado depois do require do scheduler, sob pena de cenário verde falso — está satisfeita e medida: 222 é a linha do `require('../src/scheduler')`, e as quatro linhas casadas são todas menores. Registrado conforme a instrução da rodada: valor medido acima do valor prescrito, sem forçar o número do plano.

A previsão do RED não divergiu: E vermelho, D e F verdes, exatamente como escrito. O único detalhe é que a asserção que dispara primeiro é a de `r.error`, então `r.deals.length` não aparece na saída do runner — foi medido à parte e vale **0**, o valor que o plano previa.

## Como os cenários foram construídos (e por que assim)

**Cada mock falha SÓ na primeira chamada do seu modo, e delega para a referência real nas demais.** É esse detalhe que faz o cenário medir *"a rodada continuou fazendo o seu trabalho"* em vez de apenas *"a rodada continuou"*: o segundo negócio precisa ser lido, inserido e registrado de verdade. E é também o que mantém funcionando as asserções que o próprio teste faz sobre o banco (`db.alreadyNotifiedToday(primeiro)` no cenário D, que atravessa o mock novo com `modoDedup = 'ok'`).

**As pré-condições vêm antes das asserções centrais, e a de ordem vem depois do `length`.** `leiturasQueFalharam === 1` e `insertsQueFalharam === 1` impedem que um mock nunca consultado — o desfecho da armadilha de CommonJS — passe como prova (lição de WR-05). Já `r.deals[0].id === primeiro` é avaliada só depois de `r.deals.length`, porque no estado defeituoso o array está vazio e ler `[0].id` ali produziria um `TypeError` em vez de um vermelho legível. Esse é o padrão que o cenário D já usava e que os dois novos herdam.

**O cenário E assere 4 envios, não 2.** A metade do contrato que mais parece descuido é justamente a que precisa estar pinada: o negócio cuja leitura de dedup falhou **é notificado**. Uma "melhoria" futura que inicializasse a variável em `true` (isto é, *"na dúvida, não envia"*) pareceria conservadora e seria a pior classe de falha do Core Value — notificação perdida em silêncio. `enviosConfirmados === 4` e `r.notified === 2` são o alarme que dispara se alguém tentar. A escolha entre reenviar e silenciar não é do executor: é decisão do usuário registrada em **C10** — duplicata incomoda e é aceitável; deixar alguém sem notificação não é.

**O cenário F entra porque já passava, não apesar disso.** O vizinho imediato da operação consertada precisava ser **verificado** e pinado, não presumido — foi a ausência dessa verificação que reabriu esta fase três vezes seguidas (CR2-01 → CR3-01, WR2-02 → WR3-02, WR2-04 → WR3-03). Ele é seguro porque a exceção nasce **dentro** do `try` do bloco de envio: o `catch` a absorve e, com `logId` ainda nulo, não há linha a atualizar. O que ele passa a proteger é o futuro: se alguém mover o insert para fora daquele `try`, F fica vermelho.

## O trade-off, escrito onde ele é decidido

A ressalva do revisor foi explícita e está honrada no comentário do código: **C10 não cobria este caso**. Lá o usuário aprovou *"linha `'pending'`, retentável amanhã"* para a falha de gravação de UM negócio; aqui o custo era a **rodada inteira**. O que C10 decide e vale aqui é a **direção** do fail-safe — entre reenviar e silenciar, reenviar. O que C10 não tinha diante de si era a magnitude, e é por isso que a magnitude está registrada por escrito no comentário, não apenas no SUMMARY.

## Deviations from Plan

**Nenhum desvio de execução.** A mudança prescrita foi feita e nada além dela; nenhum arquivo além dos dois declarados em `files_modified`; nenhuma regra dos Rules 1-4 acionada; nenhum pacote instalado (`package.json` e lockfile não aparecem no `git diff`).

Um ajuste de processo que não é desvio: para medir `r.deals.length` no estado defeituoso sem alterar as asserções entregues, uma **cópia de rascunho** do arquivo de teste foi criada, executada com um `console.log` injetado e apagada em seguida. `git status --short` foi conferido depois e listava apenas o arquivo de teste modificado — nenhum resíduo.

## Riscos da matriz — como cada um foi neutralizado

| # | Risco | Como foi evitado (medido) |
|---|---|---|
| R3-18 | Fail-safe invertido (tratar a falha como "já notificado" e silenciar) | A variável nasce `false`; o cenário E assere `enviosConfirmados === 4`, linha `'sent'` no primeiro negócio e `r.notified === 2` |
| R3-19 | Envolver o laço inteiro num `try` e mascarar outras falhas | Diff de 2 remoções, ambas as linhas reescritas; `catch (erroDeDedup)` não-comentário = 1; `continue;` = 3, inalterado |
| R3-20 | Logar o objeto de erro e vazar `config.headers` com o `AGENDOR_TOKEN` | O `logger.error` recebe `erroDeDedup.message`; nenhum objeto de erro aparece no diff |
| R3-21 | Mock instalado depois do require do scheduler → verde falso | Linhas 183/201/213 contra 222 do require; pré-condição `leiturasQueFalharam === 1` verde no GREEN e o RED provando que o mock foi de fato consultado |

## Threat Model — dispositions aplicadas

| Threat ID | Disposition | Como foi mitigado / aceito |
|---|---|---|
| T-04-23-01 | mitigate | `try/catch` próprio na leitura; cenário E assere `r.deals.length === 2` (medido 0 no RED) |
| T-04-23-02 | mitigate | Apenas `erroDeDedup.message` vai ao `logger.error` |
| T-04-23-03 | mitigate | `logger.error` com tag `[Scheduler]`, na mesma forma do `erroDeRegistro` do 04-15 |
| T-04-23-04 | accept | Trade-off aprovado em C10; o reenvio a quem já recebeu é o custo escolhido, e está escrito no comentário do código |
| T-04-23-05 | mitigate | Cenário E assere 4 envios e `r.notified === 2` — quem inverter o fail-safe deixa o caso vermelho |
| T-04-23-SC | accept | Nenhuma instalação de pacote; `package.json` e lockfile intocados |

Nenhum artefato deste plano exibe o valor do `AGENDOR_TOKEN`, e **SEC-01 permanece ABERTO** (decisão C8) — não foi tocado nem declarado resolvido.

## Escopo que este plano deliberadamente NÃO fecha

**`runCheckOnly` não foi alterada, e isso é decisão registrada, não esquecimento (D-WR3-02-d).** Ela é a prévia somente-leitura do painel: uma falha ali vira erro HTTP visível na tela do usuário, não silêncio. A classe de falha que este plano combate — a rodada morrer sem que ninguém saiba — não existe naquele caminho. É por isso que o total não-comentário de `alreadyNotifiedToday(deal.id)` continua **2** e não 1: a segunda ocorrência é a propriedade homônima montada em `runCheckOnly`, preservada de propósito.

**WR3-03 não foi antecipado.** O endurecimento do canal parcial valida o contêiner (`Array.isArray`) e não os elementos — `[null]` continua reabrindo a rodada abortada. É o 04-24, e misturá-lo aqui juntaria duas correções num commit.

A semântica da dedup quando a leitura **funciona** não mudou: `alreadyNotifiedToday` continua filtrando `sent_at LIKE hoje% AND status = 'sent'`, e `db.dedup.test.js` saiu 0 sem edição. O bloco de envio, o registro em duas etapas, o canal parcial, os dois `results.notified++` e o `try/catch` do 04-15 ficaram byte a byte, assim como a guarda de categoria indecidível do 04-20 logo abaixo.

## Definition of Done

- [x] Cenário E verde, com o RED registrado por saída literal
- [x] Cenário F (vizinho) presente e verde, com a justificativa escrita de por que ele já era seguro
- [x] Cenário D sem nenhuma asserção alterada (0 no diff)
- [x] Apenas a mensagem do erro vai ao log
- [x] `runCheckOnly` intocada, com a justificativa registrada por escrito no plano e neste SUMMARY
- [x] Suíte completa verde (166), cobertura acima dos pisos, `npm run lint` exit 0

## Known Stubs

Nenhum. Nenhum valor vazio ou placeholder foi introduzido; a única mudança de código é a reescrita de uma leitura existente.

## Próximo

**WR3-02 está fechado, e com ele as três operações de banco do laço de `runCheck` estão protegidas.** Fica registrado para quem seguir: `notificationStatus.registroResiliente.test.js` passou a ser o oráculo da CLASSE inteira, com o cabeçalho listando as três operações e o papel de cada uma — uma quarta operação de banco no laço deve entrar acompanhada do seu cenário nesse arquivo. O próximo é o **04-24** (WR3-03).

## Self-Check: PASSED

- 3/3 arquivos declarados existem em disco: `backend/src/scheduler.js` (modificado), `backend/test/notificationStatus.registroResiliente.test.js` (modificado), este SUMMARY
- 2/2 commits existem no histórico: `e2a68fc`, `a47bb58`
