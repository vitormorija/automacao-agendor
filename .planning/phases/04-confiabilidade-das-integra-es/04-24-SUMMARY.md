---
phase: 04-confiabilidade-das-integra-es
plan: 24
subsystem: canal-parcial-do-agendador
tags: [wr3-03, canal-parcial, fail-safe, dedup, c10, wr-01, rel-05, gap-closure-r3]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "WR2-04 (04-16, a guarda Array.isArray e o cenário E com erro congelado); WR2-01 (04-14, os dois results.notified++ e a assimetria dealResult.notified); WR-01 (04-10, a dedup que protege quem já recebeu); WR2-02 (04-15, o try/catch da gravação e o catch (erroDeRegistro))"
provides:
  - "O canal `err.resultadosParciais` validado nas DUAS camadas: contêiner (Array.isArray, do 04-16) e elemento (truthy + success === true)"
  - "A validação por elemento que NÃO custa confirmação genuína — um sucesso real ao lado de um elemento corrompido continua contando"
  - "Desreferência defensiva (`erroDeRegistro?.message`) no log da falha de gravação, declarada como defesa em profundidade sem caso dedicado"
  - "2 cenários novos em notificationStatus.canalParcial.test.js — F (o achado) e G (o SIMÉTRICO, a direção oposta)"
  - "WR3-03 fechado"
affects: [04-25, 04-26, 04-27, verificacao-da-fase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Validar o CONTÊINER de um canal improvisado não é validar o canal: `Array.isArray` fecha o valor não-array e deixa passar `[null]`, que lança na desreferência do elemento — mesmo desfecho, mesma porta, um nível mais fundo"
    - "Todo endurecimento de leitura tem uma direção oposta que precisa ser pinada no mesmo commit: 'parou de lançar' e 'parou de lançar sem perder nada' são contratos diferentes, e só o segundo par (F+G) fecha o achado"
    - "A premissa que produziu o defeito estava escrita no próprio comentário: 'uma propriedade homônima de qualquer tipo' inclui array de elementos não-objeto — a guarda foi calibrada pelo exemplo do cenário, não pela premissa que o cenário declarava"

key-files:
  created: []
  modified:
    - backend/src/scheduler.js
    - backend/src/emailer.js
    - backend/test/notificationStatus.canalParcial.test.js

key-decisions:
  - "D-WR3-03-a respeitada e MEDIDA: o predicado é `r && r.success === true`, comparação ESTRITA — `r.success === true` não-comentário = 1, `parciais.some((r) => r.success)` = 0, e `Array.isArray(err?.resultadosParciais)` continua = 1 (as duas guardas somadas, não trocadas)"
  - "D-WR3-03-b respeitada: `erroDeRegistro?.message` não-comentário = 1, com o motivo da ausência de caso dedicado escrito NO CÓDIGO (mockar a gravação neste arquivo quebraria o isolamento que mantém os dois consertos revertíveis)"
  - "D-WR3-03-c respeitada: os dois blocos de comentário passam a dizer contêiner E elemento; diff de emailer.js com 0 linhas não-comentário (medido)"
  - "O comentário foi escrito SEM reproduzir literalmente a expressão do predicado (R3-26): os greps de aceite mediram a linha de código, e a contagem deu 1, não 2"
  - "DIVERGÊNCIA MEDIDA: o critério da Task 1 esperava 3 ocorrências de `Object.freeze`; o grep devolve 4 — as 3 construções reais mais 1 MENÇÃO dentro do comentário do cabeçalho, que já existia (baseline medido = 2, não 1). Filtrando comentário, o valor é exatamente 3"

patterns-established:
  - "notificationStatus.canalParcial.test.js deixou de ser o oráculo de UMA corrupção (o contêiner) e virou o das DUAS camadas do canal, com o cabeçalho listando E/F/G e o papel de cada um — uma terceira forma de corrupção entra ali, ao lado das existentes"

requirements-completed: [REL-05]

# Metrics
duration: 14min
completed: 2026-08-05
---

# Phase 04 Plan 24: o canal parcial validado no elemento, não só no contêiner (WR3-03) Summary

**O 04-16 endureceu a leitura do canal parcial com `Array.isArray(err?.resultadosParciais)` e escreveu no comentário que "ausência e corrupção passam a ser lidas do mesmo jeito" — mas `Array.isArray` valida o CONTÊINER e nada mais, e a própria premissa do cenário E (um erro congelado de biblioteca carregando "uma propriedade homônima de qualquer tipo") não dá razão nenhuma para supor que esse tipo seria preferencialmente string e não array: medido no RED, um `[null]` passa pela guarda intacto e `parciais.some((r) => r.success)` lança `TypeError: Cannot read properties of null (reading 'success')` DENTRO do próprio `catch`, a exceção sobe ao `catch` externo de `runCheck`, aborta o `for` e deixa `r.deals.length = 0`, `r.notified = 0` e ZERO e-mails num dia em que dois deveriam sair — mesmo desfecho de WR2-04, um nível mais fundo; agora o predicado exige `r && r.success === true`, as duas guardas somadas em vez de trocadas, e o cenário SIMÉTRICO prova que endurecer não custou nenhuma confirmação genuína: um `[null, { success: true }]` continua gravando `'sent'`, e a dedup continua protegendo quem já recebeu.**

## Performance

- **Duration:** ~14 min
- **Tasks:** 2 de 2 (plano autônomo, sem checkpoint)
- **Commits:** 2 (1 por tarefa)
- **Suíte:** 166 → **168** (os 2 cenários novos), `npm run test:coverage` exit **0**, `npm run lint` exit **0** (44 warnings, baseline)

## Accomplishments

### Task 1 — RED, com a saída literal

`backend/test/notificationStatus.canalParcial.test.js` estendido de 1 para 3 cenários (318 → 544 linhas), com o cenário E **sem nenhuma asserção alterada**.

```
ok 1 - E: um resultado parcial de tipo errado não pode abortar a rodada — a linha vai para "error" e o deal seguinte é notificado

not ok 2 - F: um elemento não-objeto dentro do parcial não pode abortar a rodada — o contêiner válido não basta
  ---
  failureType: 'testCodeFailure'
  error: |-
    um elemento não-objeto no parcial não pode abortar a rodada
    + actual - expected

    + "Cannot read properties of null (reading 'success')"
    - undefined
  code: 'ERR_ASSERTION'

not ok 3 - G: um elemento corrompido ao lado de um sucesso genuíno não pode custar a confirmação — o simétrico de F
  ---
  failureType: 'testCodeFailure'
  error: |-
    um parcial misto não pode abortar a rodada
    + actual - expected

    + "Cannot read properties of null (reading 'success')"
    - undefined
  code: 'ERR_ASSERTION'

# tests 3 / # pass 1 / # fail 2
```

**A previsão do plano bateu nas duas direções**, inclusive na razão do vermelho de G: `Array.prototype.some` avalia o primeiro elemento antes do segundo, então o `null` derruba o caso antes que o sucesso genuíno chegue a ser lido.

A prova operacional veio no log do próprio SUT, com o ponto exato da morte da rodada — e **duas vezes**, uma por cenário:

```
[ERROR] [Scheduler] Erro na verificação: TypeError: Cannot read properties of null (reading 'success')
    at backend/src/scheduler.js:261:40
    at Array.some (<anonymous>)
    at runCheck (backend/src/scheduler.js:261:26)
```

`scheduler.js:261` era exatamente a linha do `.some`, e o `catch` que capturou não é nenhum dos internos: é o **externo** de `runCheck`, o que encerra a função inteira (`results.error = err.message`).

O plano pedia também o valor medido de `r.deals.length` — a asserção de `r.error` é a primeira e interrompe o caso antes dele, então o valor foi medido à parte (cópia de rascunho do arquivo com um `console.log` injetado, executada e apagada; `git status --short` conferido em seguida, listando apenas o arquivo de teste modificado):

```
MEDIDO modo=canal-corrompido      r.deals.length=2 r.notified=1 enviosConfirmados=2 transportesCriados=3
MEDIDO modo=canal-elemento-nulo   r.deals.length=0 r.notified=0 enviosConfirmados=0 transportesCriados=2
MEDIDO modo=canal-elemento-misto  r.deals.length=0 r.notified=0 enviosConfirmados=0 transportesCriados=2
```

**Zero, não um** — o mesmo achado estrutural já medido no 04-15, no 04-16 e no 04-23: `results.deals.push(dealResult)` fica no FIM do corpo do laço, depois do ponto da exceção, então a rodada perde também o registro do negócio que disparou a falha. E `transportesCriados = 2` em vez de 3 é a medida direta de que o segundo negócio **nunca chegou a ser servido**. Os números reproduzem exatamente o que o review registrou (`deals processados: 0 (esperado 2)`, `e-mails enviados: 0 (esperado 2)`). A linha do modo `canal-corrompido` na mesma execução é o controle: o cenário E, já corrigido pelo 04-16, atravessa a rodada inteira.

**Commit:** `f52394c`

### Task 2 — GREEN

O diff de `backend/src/scheduler.js` tem **exatamente 6 linhas não-comentário**, e são as duas mudanças prescritas:

```
-            if (parciais.some((r) => r.success)) houveEnvioConfirmado = true;
+            if (parciais.some((r) => r && r.success === true)) {
+              houveEnvioConfirmado = true;
+            }
-                erroDeRegistro.message,
+                erroDeRegistro?.message,
```

A quebra em bloco (3 linhas onde havia 1) é do Biome: a expressão em linha única passaria da largura configurada. `npm run lint` sai 0 e `npm run format` não teria o que reescrever.

O diff de `backend/src/emailer.js` é **exclusivamente de comentário**, medido:
`git diff src/emailer.js | grep -E "^[+-][^+-]" | grep -vE "^[+-][[:space:]]*//" | wc -l` → **0**.

Os 3 cenários ficaram verdes e os **8 arquivos vizinhos passaram sem edição** — `git diff --name-only` na Task 2 lista **só** `backend/src/emailer.js` e `backend/src/scheduler.js`:

| Arquivo | Casos | Exit |
|---|---|---|
| `notificationStatus` | 6 | 0 |
| `notificationStatus.partialFailure` | 3 | 0 |
| `notificationStatus.registroResiliente` | 3 | 0 |
| `scheduler.categoriaIndecidivel` | 3 | 0 |
| `emailer.timeout` | 9 | 0 |
| `emailer.transporteVivo` | 3 | 0 |
| `scheduler.failsafe` | 8 | 0 |
| `scheduler.resilience` | 5 | 0 |

**Commit:** `1f18244`

## Medições (contadas, não inferidas)

| Item | Antes | Depois | Critério do plano | Bate? |
|---|---|---|---|---|
| `r.success === true` (não-comentário, `scheduler.js`) | 0 | **1** | 1 | sim |
| `parciais.some((r) => r.success)` (não-comentário) | 1 | **0** | 0 | sim |
| `Array.isArray(err?.resultadosParciais)` (não-comentário) | 1 | **1** | 1 (a guarda do 04-16 continua) | sim |
| `erroDeRegistro?.message` (não-comentário, `grep -F`) | 0 | **1** | 1 | sim |
| Linhas não-comentário no diff de `emailer.js` | — | **0** | 0 | sim |
| Linhas não-comentário no diff de `scheduler.js` | — | **6** | — (2 mudanças prescritas) | sim |
| `^test(` no arquivo de teste | 1 | **3** | 3 | sim |
| Asserções removidas/alteradas no diff do teste | — | **0** | 0 | sim |
| `Object.freeze` (arquivo inteiro) | 2 | **4** | 3 | **não — ver Divergências** |
| `Object.freeze` (não-comentário) | 1 | **3** | 3 (intenção) | sim |
| `simétrico` (case-insensitive) no teste | 0 | **6** | ≥ 1 | sim |
| `mock.method(db` no teste | 0 | **0** | 0 (a gravação segue sem mock) | sim |
| Linhas do arquivo de teste | 318 | **544** | ≥ 420 | sim |
| `git diff --name-only src/` na Task 1 | — | **vazio** | vazio | sim |
| `git diff --name-only test/` na Task 2 | — | **vazio** | vazio | sim |
| Os 8 arquivos vizinhos | — | **exit 0, 40 casos** | exit 0 sem edição | sim |
| Suíte | 166 | **168** | 166 + 2 | sim |
| `npm run test:coverage` | — | exit **0** | exit 0 | sim |
| `npm run lint` | — | exit **0**, 44 warnings | exit 0 | sim |

Cobertura de `scheduler.js` medida em **81,85% de linhas / 76,81% de branches**; `emailer.js` em **89,49% / 63,07%** (pisos do `.c8rc.json`: 20 e 60). O ramo em que o `.some` percorre um array com elemento inválido, que antes lançava, passou a ser exercitado nos dois desfechos.

### Invariantes herdadas, medidas e NÃO regredidas

| Item | Estado exigido | Medido |
|---|---|---|
| `catch (erroDeRegistro)` (não-comentário) | exatamente 1 | **1** |
| `results.notified++` (não-comentário) | 2, um por caminho | **2** |
| `continue;` (não-comentário) | 3 (guarda do 04-20) | **3** |
| `categoriaIndecidivel` (não-comentário) | 1 | **1** |
| `= alreadyNotifiedToday(deal.id);` (04-23) | 1 | **1** |
| `if (alreadyNotifiedToday(deal.id))` | 0 | **0** |
| `alreadyNotifiedToday(deal.id)` total não-comentário | 2 (a 2ª em `runCheckOnly`, intocada) | **2** |

## Divergências medidas

**Uma só, e é de contagem do critério, não de comportamento.**

O critério da Task 1 dizia: *"`grep -c "Object.freeze" backend/test/notificationStatus.canalParcial.test.js` retorna 3"*. O grep devolve **4**: linhas 12, 153, 166 e 177. A de **12 não é uma construção** — é a **menção literal** `` `Object.freeze` `` dentro do bloco de comentário do cabeçalho que explica a armadilha do sloppy mode, e ela **já existia** antes desta rodada (o baseline medido do mesmo grep era **2**, não 1, exatamente pela mesma razão). As construções reais são 3: 153 (`ERRO_CONGELADO`, do 04-16), 166 (`ERRO_CONGELADO_ELEMENTO_NULO`) e 177 (`ERRO_CONGELADO_ELEMENTO_MISTO`).

A **intenção** do critério — os três erros do arquivo são congelados de verdade, porque é o congelamento que faz a anexação do produtor falhar em silêncio e o valor corrompido chegar intacto ao consumidor — está satisfeita e medida: `grep -v "^\s*//" | grep -c "Object.freeze"` → **3**. Registrado conforme a instrução da rodada: valor medido acima do valor prescrito, sem forçar o número do plano.

É a mesma classe de divergência do 04-23 (`mock.method(db` previsto 3, medido 4 pela menção em comentário): critérios de grep sobre arquivos cujos comentários citam o próprio código medem código **e** prosa.

**A previsão do RED não divergiu em nada.** F e G vermelhos, E verde, o `TypeError` com a mensagem exata prevista, e `r.deals.length` medido em **0** — o valor que o plano previa.

## Como os cenários foram construídos (e por que assim)

**Os três cenários compartilham o mesmo caminho de código do stub.** O `if (modoEnvio === 'canal-corrompido' && …)` virou uma consulta a uma tabela `ERRO_DO_MODO` que mapeia modo → erro congelado. Isso é deliberado: o que varia entre E, F e G é **apenas o valor que chega ao consumidor do canal**, e nada mais — nem o instante da exceção, nem o transporte que a lança, nem quantos envios saem. Um cenário que também mudasse o caminho não separaria "a leitura mudou de desfecho" de "o caminho mudou".

**O cenário F assere que o CONTÊINER é válido, por pré-condição.** `assert.equal(Array.isArray(ERRO_CONGELADO_ELEMENTO_NULO.resultadosParciais), true)` existe para deixar explícito que este cenário **passa pela guarda do 04-16 em vez de contorná-la**. Sem essa linha, alguém poderia ler F como "mais um caso de tipo errado" e concluir que o 04-16 estava incompleto na mesma dimensão — não estava: a dimensão é outra.

**O cenário G é o simétrico exigido, e a ordem dos elementos é o ponto.** `[null, { success: true }]` põe o elemento corrompido **antes** do sucesso genuíno de propósito: é o primeiro que o `.some` avalia, e é por isso que G também nasce vermelho hoje. Depois do conserto, é a mesma ordem que prova que a validação por elemento **não** vira "descarta o array inteiro ao primeiro inválido" — a forma mais natural de "resolver" F produziria exatamente esse defeito.

**Por que G é obrigatório e não um extra.** Endurecer a leitura para que ela deixe de LANÇAR é metade do conserto. A outra metade é não **perder** uma confirmação genuína: rebaixar para `'error'` uma linha cujo e-mail saiu de verdade faz ela deixar de deduplicar (`alreadyNotifiedToday` filtra `status = 'sent'`), e a rodada de amanhã reenvia para quem já recebeu — precisamente o desfecho que **WR-01 (04-10)** existe para impedir. F e G se apoiam em direções opostas, e é o **par** que fecha WR3-03.

**A assimetria intencional continua pinada.** G assere `r.notified === 2` **e** `r.deals[0].notified === false` na mesma respiração: o contador conta envio real (e o parcial confirmado é envio real), enquanto `dealResult.notified` responde outra pergunta — "todos os destinatários confirmaram?" —, e no sucesso parcial a resposta é não. É o contrato do 04-14, e G o exercita por um caminho novo.

**O conteúdo do array é a ENTRADA SOB TESTE, não uma afirmação sobre a realidade do envio** — e isso está escrito no arquivo. No stub deste arquivo nenhum e-mail do primeiro negócio chega a sair (`enviosConfirmadosDoPrimeiroDeal === 0` em F, `enviosConfirmados === 2` em G, todos do segundo negócio); é a leitura do canal — e só ela — que decide o status gravado. Ler G como "o e-mail saiu" seria confundir o instrumento com o objeto medido.

## O comentário é metade do conserto

O achado nasceu de um comentário que afirmava mais do que o código entregava: *"ausência e corrupção passam a ser lidas do mesmo jeito"*. Enquanto o bloco dizia isso, o próximo leitor não ia procurar a corrupção que faltava — é o mesmo mecanismo que produziu WR3-01 (o comentário dizia "política ÚNICA" sobre um helper que cobria 2 de 5 bordas).

Os dois blocos agora dizem **contêiner E elemento**, enumeram os três cenários que os pinam pelo nome, e trazem a frase em sentido oposto (a confirmação genuína que não pode ser perdida) — que é a parte que nenhum comentário anterior tinha. O comentário foi escrito **sem reproduzir literalmente a expressão do predicado** (mitigação de R3-26): os greps de aceite mediram a linha de código, e a contagem deu **1**, não 2.

## Deviations from Plan

**Nenhum desvio de execução.** As mudanças prescritas foram feitas e nada além delas; nenhum arquivo além dos três declarados em `files_modified`; nenhuma regra dos Rules 1-4 acionada; nenhum pacote instalado (`package.json` e lockfile não aparecem no `git diff`).

`backend/src/emailer.js` recebeu **diff exclusivamente de comentário**, como o plano previa — nenhuma linha de código precisou mudar ali, então não houve o caso de parada previsto no contexto da rodada.

Um ajuste de processo que não é desvio: para medir `r.deals.length` no estado defeituoso sem alterar as asserções entregues, uma **cópia de rascunho** do arquivo de teste foi criada em `backend/test/`, executada com um `console.log` injetado e apagada em seguida. `git status --short` foi conferido depois e listava apenas o arquivo de teste modificado — nenhum resíduo.

Três linhas do stub do arquivo de teste foram reescritas (`modoEnvio === 'canal-corrompido'` → consulta a `ERRO_DO_MODO`). Isso é **prescrito** pela ação da Task 1 ("fazer o stub de `createTransport` lançar o erro correspondente ao modo ativo") e não toca o cenário E: o diff tem **0 asserções removidas ou alteradas**, medido.

## Riscos da matriz — como cada um foi neutralizado

| # | Risco | Como foi evitado (medido) |
|---|---|---|
| R3-22 | Trocar `Array.isArray` pelo predicado novo em vez de somar as duas guardas | `Array.isArray(err?.resultadosParciais)` não-comentário = **1**, inalterado; a linha do ternário não aparece no diff |
| R3-23 | Usar `r?.success` truthy e aceitar `success: 'sim'` como confirmação | `r.success === true` não-comentário = **1**; a comparação estrita está no código e o motivo está escrito ao lado |
| R3-24 | Perder a confirmação genuína ao "endurecer" demais | Cenário G verde asserindo linha `'sent'`, `db.alreadyNotifiedToday(primeiro) === true` e `r.notified === 2` |
| R3-25 | Diff de `emailer.js` extrapolar comentário | **0** linhas não-comentário no diff; `emailer.timeout` (9) e `emailer.transporteVivo` (3) verdes sem edição |
| R3-26 | O comentário reproduzir a expressão do predicado e invalidar o próprio grep | O comentário descreve a regra em prosa; `grep -c "r.success === true"` = **1**, não 2 |

## Threat Model — dispositions aplicadas

| Threat ID | Disposition | Como foi mitigado / aceito |
|---|---|---|
| T-04-24-01 | mitigate | Predicado validando o elemento; cenário F assere `r.deals.length === 2` (medido **0** no RED) e `transportesCriados === 3` (medido **2** no RED) |
| T-04-24-02 | mitigate | Cenário G assere `'sent'` e `db.alreadyNotifiedToday(primeiro) === true` |
| T-04-24-03 | mitigate | Comparação estrita com `true` — um `success` truthy de outro tipo é lido como não confirmado |
| T-04-24-04 | mitigate | `erroDeRegistro?.message` (medido = 1), com a ausência de caso dedicado declarada no próprio código |
| T-04-24-05 | accept | Lacuna do `throw null` em `results.errors.push(err.message)` — conhecida e declarada desde o 04-16, continua fora de escopo; a declaração foi preservada no comentário |
| T-04-24-SC | accept | Nenhuma instalação de pacote; `package.json` e lockfile intocados |

Nenhum artefato deste plano exibe o valor do `AGENDOR_TOKEN`, e **SEC-01 permanece ABERTO** (decisão C8) — não foi tocado nem declarado resolvido. PC-13 continua satisfeito por construção no arquivo de teste: o stub de `createTransport` não recebe sequer o objeto de opções, então o objeto com `auth.pass` nunca é ligado a um nome no teste.

## Escopo que este plano deliberadamente NÃO fecha

**A lacuna do `throw null` continua aberta, e por decisão registrada.** `results.errors.push(err.message)` é a **primeira** instrução do `catch` do bloco de envio: um `throw` de primitivo estoura ali, antes de qualquer guarda deste plano. Fechá-la muda outra instrução e pede plano próprio; a declaração no comentário do 04-16 foi preservada palavra por palavra na parte que a descreve.

**`erroDeRegistro?.message` não ganhou caso dedicado (D-WR3-03-b).** Pinar essa linha exigiria mockar a gravação **dentro** do arquivo do canal parcial, que deliberadamente não a mocka — é esse isolamento que mantém os consertos do 04-15 e do 04-16/04-24 revertíveis de forma independente. O residual está registrado aqui e no comentário do código, junto da lacuna do `throw null`.

**O contrato de `sendStaleNotification` não mudou**: ele continua **lançando** o erro original, sem alterar mensagem nem tipo (D-03 e o cenário Q1-2 de `notificationStatus.test.js` dependem disso, e ambos seguem verdes sem edição). A anexação do parcial no produtor continua existindo exatamente como está — `err.resultadosParciais = results` não aparece no diff. E o desfecho quando o canal é **bem formado** é idêntico ao de ontem: os cenários A e B de `notificationStatus.partialFailure.test.js` passaram sem edição.

**`runCheckOnly` não foi tocada** — a prévia somente-leitura do painel não tem bloco de envio nem canal parcial.

## Definition of Done

- [x] Cenários F e G verdes, com o RED registrado por saída literal
- [x] O cenário SIMÉTRICO (G) existe e está nomeado como tal, no nome do caso e no comentário
- [x] Cenário E sem nenhuma asserção alterada (0 no diff)
- [x] Diff de `emailer.js` exclusivamente de comentário (verificado por contagem: 0)
- [x] Suíte completa verde (168), cobertura acima dos pisos, `npm run lint` exit 0

## Known Stubs

Nenhum. Nenhum valor vazio ou placeholder foi introduzido; a única mudança de código é o endurecimento de um predicado existente e um encadeamento opcional numa leitura de mensagem.

## Próximo

**WR3-03 está fechado, nas duas direções.** Fica registrado para quem seguir: `notificationStatus.canalParcial.test.js` deixou de ser o oráculo de UMA corrupção e virou o das duas camadas do canal — o cabeçalho lista E, F e G com o papel de cada um, e uma terceira forma de corrupção do canal entra ali, ao lado das existentes. O próximo é o **04-25** (WR3-06: a paginação sem teto de páginas em `getUsers`).

## Self-Check: PASSED

- 3/3 arquivos declarados existem em disco: `backend/src/scheduler.js` (modificado), `backend/src/emailer.js` (modificado), `backend/test/notificationStatus.canalParcial.test.js` (modificado)
- 2/2 commits existem no histórico: `f52394c`, `1f18244`
