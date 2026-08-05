---
phase: 04-confiabilidade-das-integra-es
plan: 25
subsystem: paginacao-da-borda-agendor
tags: [wr3-06, paginacao, nao-terminacao, lock-isrunning, rel-03, rel-06, gap-closure-r3]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "WR3-01 (04-22, as cinco bordas sob o mesmo fetchWithRetry); CR3-01 (04-19, a sentinela CATEGORIA_INDECIDIVEL); REL-06 / Decisão Q2 (04-02, o contrato 'Set completo ou falha explícita'); scheduler.resilience.test.js (o oráculo do lock isRunning)"
provides:
  - "MAX_PAGES = 200 como constante de módulo EXPORTADA, compartilhada pelas duas paginações que encerram por condição vinda da resposta"
  - "Falha explícita, em PT-BR e com a borda nomeada, quando o teto estoura — em vez de laço infinito"
  - "A variante por NÃO-TERMINAÇÃO do vazamento de isRunning fechada (a por exceção já era coberta)"
  - "backend/test/agendor.paginacao.test.js — 4 casos: o achado e o SIMÉTRICO, para cada uma das duas funções"
  - "WR3-06 fechado"
affects: [04-26, 04-27, verificacao-da-fase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Um laço não terminante que só consome MICROtarefas starva o event loop inteiro: nenhum timer roda, e o `--test-timeout` do runner NUNCA dispara. Para que a não-terminação seja testável, o stub da borda precisa ceder ao event loop (setImmediate) — o que também é mais fiel ao original, já que resposta HTTP real chega por I/O"
    - "`node --test` trata o ARQUIVO como um subteste: um caso que não termina cancela o arquivo inteiro e os casos seguintes nunca são reportados. Medir 'quem estava verde antes do conserto' exige `--test-name-pattern`, não leitura da saída do arquivo"
    - "Teto de paginação implementado como `break` seria trocar um defeito silencioso por outro (resultado PARCIAL tratado como completo); a forma correta é `while (page <= TETO)` com `throw` DEPOIS do laço — o caminho normal continua saindo pelo `break`, e só a não-terminação alcança o throw"

key-files:
  created:
    - backend/test/agendor.paginacao.test.js
  modified:
    - backend/src/agendor.js

key-decisions:
  - "D-WR3-06-a respeitada e MEDIDA: `MAX_PAGES = 200` é constante de módulo compartilhada pelas duas funções e exportada — `grep -c 'MAX_PAGES,'` = 1 (a linha do module.exports), e o teste deriva o número (`grep -cE '\\b200\\b'` no teste = 0)"
  - "D-WR3-06-b respeitada: `while (page <= MAX_PAGES)` = 2 e `page > MAX_PAGES` = 2 (não-comentário); os `break` existentes ficaram byte a byte; as ÚNICAS 2 remoções do diff são exatamente os dois `while (true)`"
  - "D-WR3-06-c respeitada: a mensagem nomeia a borda (`/users` e `/tasks`), o teto interpolado e a suspeita ('a borda pode estar ignorando o parâmetro page'), com tag `[Agendor]`"
  - "D-WR3-06-d respeitada: em getDealsWithFutureTasks o `throw` do teto está FORA do try interno — o catch da borda não o reloga"
  - "D-WR3-06-e respeitada: getStaleDeals não recebeu teto, e a justificativa está ESCRITA NO CÓDIGO (deriva totalPages de meta.totalCount e percorre array finito)"
  - "DIVERGÊNCIA MEDIDA (forma do RED): o plano previa uma execução única com (1) e (3) vermelhos e (2) e (4) verdes. Medido: `node --test` trata o ARQUIVO como um subteste, então a não-terminação do caso (1) cancela o arquivo e (2), (3) e (4) nunca são reportados. Os quatro desfechos foram medidos separadamente, por `--test-name-pattern`"
  - "CONSTRUÇÃO NECESSÁRIA (não prevista pelo plano): o stub resolve via `setImmediate`. Sem essa volta pelo event loop o laço consome só microtarefas, o `--test-timeout` não dispara e o RED TRAVARIA a suíte em vez de falhar — precisamente o risco R3-30"

patterns-established:
  - "agendor.paginacao.test.js é o oráculo da TERMINAÇÃO das paginações do módulo: uma terceira paginação que encerre por condição vinda da resposta entra ali, com o seu par (achado + simétrico)"

requirements-completed: [REL-03, REL-06]

# Metrics
duration: 16min
completed: 2026-08-05
---

# Phase 04 Plan 25: teto de páginas com falha explícita nas duas paginações sem limite (WR3-06) Summary

**`getStaleDeals` deriva o número de páginas de `meta.totalCount` e é limitada por construção, mas as outras duas paginam por condição de parada vinda da RESPOSTA — `if (!data.links?.next) break` em `getUsers` e `if (tasks.length < 100) break` em `getDealsWithFutureTasks` —, e uma borda que passe a ignorar o parâmetro `page` nunca satisfaz nenhuma das duas: medido no RED, as duas chamadas simplesmente NÃO TERMINAM, cada uma cancelando o arquivo de teste inteiro por estouro de tempo; como o laço vive dentro do `try` de `runCheck`, o `finally` que devolve `isRunning` a false nunca executa e toda execução seguinte cai no guard do topo devolvendo `{ skipped: true }` — para sempre, até reiniciar o processo, que é o modo de falha que o cabeçalho de `scheduler.resilience.test.js` declara como o pior daqui e que aquele arquivo cobria só na variante por EXCEÇÃO; agora as duas usam `while (page <= MAX_PAGES)` com `throw` DEPOIS do laço (nunca `break`, que trocaria não-terminação por resultado parcial silencioso), a mensagem nomeia a borda e a suspeita, e os dois casos SIMÉTRICOS provam que o teto não trunca paginação legítima — os 4 casos verdes em 80ms, sem `--test-timeout`.**

## Performance

- **Duration:** ~16 min
- **Tasks:** 2 de 2 (plano autônomo, sem checkpoint)
- **Commits:** 2 (1 por tarefa)
- **Suíte:** 168 → **172** (os 4 casos novos), `npm run test:coverage` exit **0**, `npm run lint` exit **0** (44 warnings, baseline)

## Accomplishments

### Task 1 — RED, com a saída literal

`backend/test/agendor.paginacao.test.js` criado com 4 casos (212 linhas).

**A previsão do plano bateu na direção que importa — as duas paginações não terminam —, mas a FORMA do vermelho divergiu.** O plano esperava uma execução única mostrando (1) e (3) vermelhos e (2) e (4) verdes. `node --test` trata o **arquivo** como um subteste: o caso (1) não termina, o timeout cancela o arquivo inteiro, e (2), (3) e (4) **nunca chegam a ser reportados**:

```
TAP version 13
# Subtest: test/agendor.paginacao.test.js
not ok 1 - test/agendor.paginacao.test.js
  ---
  duration_ms: 20002.723417
  failureType: 'testTimeoutFailure'
  error: 'test timed out after 20000ms'
  code: 'ERR_TEST_FAILURE'
  ...
# tests 1 / # pass 0 / # fail 0 / # cancelled 1
```

Os quatro desfechos foram então medidos **separadamente**, com `--test-name-pattern`. Os dois SIMÉTRICOS, já verdes antes de qualquer mudança em `src/` (é o que os torna prova de não-regressão, e não de conserto):

```
ok 1 - (2) SIMÉTRICO — /users com 2 páginas legítimas: o teto NÃO trunca a operação normal
ok 2 - (4) SIMÉTRICO — /tasks com 2 páginas legítimas: o Set sai completo das duas
# tests 2 / # pass 2 / # fail 0
```

E cada um dos dois casos do achado, isolado, com o mesmo desfecho — **estouro de tempo, não asserção**:

```
=== padrão ^\(1\) ===          === padrão ^\(3\) ===
not ok 1 - test/agendor.paginacao.test.js
  duration_ms: 15003.316333       duration_ms: 15002.224542
  failureType: 'testTimeoutFailure'
  error: 'test timed out after 15000ms'
# cancelled 1                   # cancelled 1
```

`failureType: 'testTimeoutFailure'` é a prova pedida: as chamadas não rejeitam, não resolvem e não erram — elas **não terminam**. A premissa da não-terminação não divergiu; se qualquer um dos dois tivesse terminado, a instrução era PARAR.

**Commit:** `161fbe7`

### Task 2 — GREEN

O diff de `backend/src/agendor.js` tem **16 linhas não-comentário**, e são exatamente as três mudanças prescritas — as **únicas 2 remoções** são os dois `while (true)`:

```
+const MAX_PAGES = 200;
-  while (true) {
+  while (page <= MAX_PAGES) {
+  if (page > MAX_PAGES) {
+    throw new Error(
+      `[Agendor] paginação de /users excedeu ${MAX_PAGES} páginas — a borda pode estar ignorando o parâmetro page`,
+    );
+  }
-  while (true) {
+  while (page <= MAX_PAGES) {
+  if (page > MAX_PAGES) {
+    throw new Error(
+      `[Agendor] paginação de /tasks excedeu ${MAX_PAGES} páginas — a borda pode estar ignorando o parâmetro page`,
+    );
+  }
+  MAX_PAGES,
```

Os 4 casos ficaram verdes em **79ms**, **sem** `--test-timeout` — o que é, por si só, a medida do conserto: o que antes não terminava agora falha em milissegundos.

Os **9 arquivos vizinhos passaram sem edição** (`git diff --name-only -- backend/test/` na Task 2 saiu vazio):

| Arquivo | Casos | Exit |
|---|---|---|
| `agendor.futureTasks` | 7 | 0 |
| `agendor.retry429` | 8 | 0 |
| `agendor.getStaleDeals` | 3 | 0 |
| `agendor.timeout` | 5 | 0 |
| `agendor.categoriaIndecidivel` | 5 | 0 |
| `agendor.cacheConcurrency` | 3 | 0 |
| `agendor.cacheInvalidation` | 3 | 0 |
| `scheduler.failsafe` | 8 | 0 |
| `scheduler.resilience` | 5 | 0 |

**Commit:** `f83d388`

## Medições (contadas, não inferidas)

| Item | Antes | Depois | Critério do plano | Bate? |
|---|---|---|---|---|
| `while (true)` (não-comentário, `agendor.js`) | 2 | **0** | 0 | sim |
| `while (page <= MAX_PAGES)` (não-comentário) | 0 | **2** | 2 | sim |
| `page > MAX_PAGES` (não-comentário) | 0 | **2** | 2 | sim |
| `MAX_PAGES,` (linha do `module.exports`) | 0 | **1** | presente | sim |
| `MAX_PAGES` (arquivo inteiro, código + comentário) | 0 | **8** | — | — |
| `await api.get(` (não-comentário) | 0 | **0** | 0 (contrato 04-22) | sim |
| `fetchWithRetry(` (não-comentário) | 6 | **6** | 6 (contrato 04-22) | sim |
| `api.get(` (não-comentário) | 5 | **5** | 5 (nenhuma borda nova) | sim |
| Linhas não-comentário no diff de `agendor.js` | — | **16** | — (3 mudanças prescritas) | sim |
| Remoções no diff | — | **2** | os dois `while (true)` | sim |
| `^test(` no arquivo novo | — | **4** | 4 | sim |
| `MAX_PAGES` no arquivo de teste | — | **5** | ≥ 4 | sim |
| `\b200\b` no arquivo de teste | — | **0** | 0 | sim |
| `simétrico` (case-insensitive) no teste | — | **2** | ≥ 1 | sim |
| Linhas do arquivo de teste | — | **212** | ≥ 120 | sim |
| `git diff --name-only -- backend/src/` na Task 1 | — | **vazio** | vazio | sim |
| `git diff --name-only -- backend/src/` na Task 2 | — | **só `agendor.js`** | só `agendor.js` | sim |
| Os 9 arquivos vizinhos | — | **exit 0, 47 casos** | exit 0 sem edição | sim |
| Suíte | 168 | **172** | 168 + 4 | sim |
| `npm run test:coverage` | — | exit **0** | exit 0 | sim |
| `npm run lint` | — | exit **0**, 44 warnings | exit 0 | sim |

Cobertura de `agendor.js` medida em **90,69% de linhas / 88,42% de branches** (era 89,53% / 86,72% depois do 04-22; pisos do `.c8rc.json`: 20 e 60). O ramo de estouro do teto, que antes não existia, passou a ser exercitado nas duas funções.

## Divergências medidas

**Duas, e nenhuma é de comportamento.**

**1. A FORMA do RED (registrada acima).** O critério da Task 1 dizia *"(1) e (3) falhando por estouro de tempo e (2) e (4) verdes"* **na mesma execução**. Isso não é observável: `node --test` trata o arquivo como um subteste único, então a primeira não-terminação **cancela o arquivo** e os três casos seguintes não são executados nem reportados (`# cancelled 1`, `# tests 1`). A *intenção* do critério — o arquivo sai com código diferente de 0, (1) e (3) falham por tempo e (2) e (4) já estavam verdes — está satisfeita e medida, em três execuções com `--test-name-pattern` em vez de uma. Valor medido registrado, número do plano não forçado.

**2. O stub precisou ceder ao event loop, e isso é o próprio risco R3-30.** A ação do plano dizia "sem relógio falso: as chamadas são aguardadas diretamente", e isso vale. Mas um stub que resolvesse de forma puramente **síncrona** faria o laço não terminante consumir apenas a fila de **microtarefas** — nenhum timer voltaria a rodar, o `--test-timeout` do runner **nunca dispararia**, e o RED travaria a suíte para sempre em vez de falhar. Que é exatamente R3-30 ("o caso do laço infinito travar a suíte no RED em vez de falhar"), cuja mitigação prescrita (`--test-timeout`) **não funciona sozinha**. Por isso o stub devolve a resposta através de `setImmediate`: uma volta real do event loop por página. Não é enfraquecimento do teste — é mais fiel ao original, já que uma resposta HTTP real chega por I/O, e o custo no GREEN é desprezível (4 casos em 79ms). O motivo está escrito no próprio arquivo de teste, para que ninguém "simplifique" o stub e ressuscite o travamento.

**A previsão da não-terminação em si não divergiu em nada**, nas duas funções.

## Como os casos foram construídos (e por que assim)

**O modo `'infinito'` é a borda ignorando `page`, não uma borda quebrada.** Ela responde `200` normalmente, com payload bem formado, e apenas **serve sempre a mesma página**: `/users` sempre com `links.next` presente, `/tasks` sempre com exatamente 100 tarefas. Nenhuma das duas condições de parada do SUT é satisfeita, e é só isso que o cenário faz. Uma borda que devolvesse erro seria outro caso — e já é coberto por `agendor.retry429.test.js`.

**As 100 tarefas são montadas UMA vez e reutilizadas** (mitigação de R3-31). Construir a página por requisição faria o caso do teto criar 20.000 objetos sem medir nada a mais.

**O contador é a diferença entre "falhou" e "falhou no lugar certo".** `assert.rejects` sozinho ficaria verde se a rejeição viesse de um erro de fixture ou de uma borda trocada. Só `chamadasUsers === MAX_PAGES` — igualdade **exata**, com o número **derivado do módulo** — demonstra que o laço percorreu o teto inteiro e parou nele: nem antes, nem uma página além.

**Os SIMÉTRICOS são obrigatórios, não extras, e por motivos diferentes em cada borda.** No caso (2), um teto que truncasse a paginação de `/users` faria responsáveis sumirem do dicionário — e com eles o e-mail de quem deveria ser notificado. No caso (4), o custo é ainda mais perverso: o Set de `getDealsWithFutureTasks` é usado por `runCheck` para decidir quem **NÃO** recebe notificação, então uma tarefa futura perdida vira notificação **indevida** para um negócio que está sendo acompanhado — a mesma classe de falha que a Decisão Q2 recusou. Os dois casos verificam por **valor** (o dicionário nas duas páginas; os ids das duas páginas do Set), não por tamanho.

**Por que `throw` depois do laço, e não `break` (R3-27).** Um `break` no lugar do `throw` transformaria não-terminação em **resultado parcial silencioso** — que é a mesma direção de falha do defeito original, só que mais difícil de perceber, porque a rodada terminaria "com sucesso". A forma prescrita mantém o caminho normal saindo pelo `break` existente (com `page` ainda dentro do teto) e faz só a não-terminação alcançar o `throw`. Os casos (1) e (3) exigem **rejeição**: se alguém trocar por `break`, eles ficam vermelhos por resolução em vez de rejeição.

## O teto é liberação de lock, não economia de requisição

O ponto do achado nunca foi a requisição desperdiçada. É que a falha nova é uma **rejeição comum**: ela sobe pelo `Promise.all` de `runCheck`, cai no `catch` externo que já existe, e o `finally` daquele mesmo `try` — o que faz `isRunning = false` — **executa**. Nenhuma linha do tratamento de erro de `runCheck` precisou mudar, e nenhuma mudou (`git diff` não lista `scheduler.js`). O que muda é que o `finally` passa a ser **alcançável** na presença de uma borda que ignore `page`.

`scheduler.resilience.test.js` continua verde sem edição: ele cobre a variante por **exceção** do mesmo vazamento, e este plano fecha a variante por **não-terminação** sem tocar naquele oráculo.

## Deviations from Plan

**Nenhum desvio de execução.** As três mudanças prescritas foram feitas e nada além delas; nenhum arquivo além dos dois declarados em `files_modified`; nenhuma regra dos Rules 1-4 acionada; nenhum pacote instalado (`package.json` e lockfile não aparecem no `git diff`).

`fetchWithRetry`, `getOrgCategory`, `getStaleDeals`, `getDealById`, `shouldNotifyOwner`, `isExcludedStage` e `getDealType` ficaram **byte a byte** — o diff inteiro é os 16 linhas não-comentário listadas acima mais comentário. O arquivo não foi reordenado.

Os dois arquivos passaram por `biome format` antes do commit (convenção do CLAUDE.md); em `agendor.js` o formatador **não teve o que reescrever** ("No fixes applied").

## Riscos da matriz — como cada um foi neutralizado

| # | Risco | Como foi evitado (medido) |
|---|---|---|
| R3-27 | Trocar o `break` por `return`/`break` e produzir resultado parcial silencioso | `page > MAX_PAGES` não-comentário = **2**, ambos com `throw`; casos (1) e (3) exigem `assert.rejects` — resolução os deixaria vermelhos |
| R3-28 | Pôr o `throw` do teto dentro do `try` de `getDealsWithFutureTasks` e duplicar o log | O `throw` está DEPOIS do `while`, fora do `try` interno; nenhuma linha de log duplicada na saída do caso (3) |
| R3-29 | O teste duplicar o literal e virar falso positivo | `MAX_PAGES` exportada (`grep -c 'MAX_PAGES,'` = 1) e `grep -cE '\b200\b'` no teste = **0** |
| R3-30 | O laço infinito travar a suíte no RED em vez de falhar | **Materializou-se na forma prevista pelo plano**: `--test-timeout` sozinho não bastava (starvation de microtarefas). Neutralizado pelo `setImmediate` no stub — ver Divergências. GREEN passa **sem** `--test-timeout` |
| R3-31 | Construir 20 mil objetos de tarefa e tornar o caso lento | Array de 100 tarefas montado UMA vez e reutilizado; os 4 casos rodam em **79ms** |

## Threat Model — dispositions aplicadas

| Threat ID | Disposition | Como foi mitigado / aceito |
|---|---|---|
| T-04-25-01 | mitigate | `MAX_PAGES` com falha explícita nas duas funções; casos (1) e (3) medem rejeição em exatamente `MAX_PAGES` requisições |
| T-04-25-02 | mitigate | A falha é rejeição comum, absorvida pelo `catch` externo de `runCheck`, cujo `finally` libera `isRunning`; `scheduler.js` não aparece no diff |
| T-04-25-03 | mitigate | O crescimento do dicionário de usuários encerra em 20.000 registros |
| T-04-25-04 | mitigate | Forma com `throw` (não `break`); contrato Q2 preservado e `agendor.futureTasks.test.js` verde sem edição |
| T-04-25-05 | accept | Uma paginação legítima acima de 200 páginas passaria a falhar — 20.000 registros por borda está ordens de magnitude acima do uso real, e os casos (2)/(4) protegem o caminho normal |
| T-04-25-SC | accept | Nenhuma instalação de pacote; `package.json` e lockfile intocados |

Nenhum artefato deste plano exibe o valor do `AGENDOR_TOKEN` — as mensagens novas carregam apenas o nome da borda e um inteiro, nunca o objeto de erro do axios (que traria `config.headers`). **SEC-01 permanece ABERTO** (decisão C8): não foi tocado nem declarado resolvido.

## Escopo que este plano deliberadamente NÃO fecha

**`getStaleDeals` não recebeu teto, e a justificativa está escrita no código** (D-WR3-06-e): ela deriva `totalPages` de `meta.totalCount` e percorre um `for` sobre um array finito de páginas. Não existe ali condição de parada vinda da resposta a ser frustrada. Sem essa frase no arquivo, o próximo leitor suspeitaria de esquecimento.

**A política de retry de 429 (04-22) e o timeout de 15s (D-01) ficaram intocados** — `fetchWithRetry` não aparece no diff, e `fetchWithRetry(` = 6 / `api.get(` = 5 continuam medidos.

**O tratamento de erro de `runCheck` não mudou nenhuma linha.** O teto se apoia no `catch`/`finally` que já existem; `scheduler.js` não está no diff.

**O `console.log` legado de `getDealsWithFutureTasks` continua lá** (LOG-01, Fase 5).

## Definition of Done

- [x] Os 4 casos verdes **sem** `--test-timeout`, com o RED registrado (falha por estouro de tempo) por saída literal
- [x] Os casos SIMÉTRICOS (2) e (4) existem e estão nomeados como tais
- [x] `while (true)` sumiu de `agendor.js` (medido: 0)
- [x] `MAX_PAGES` exportada e derivada pelo teste, sem literal duplicado (`\b200\b` no teste = 0)
- [x] A justificativa de por que `getStaleDeals` não recebe teto está escrita no código
- [x] Suíte completa verde (172), cobertura acima dos pisos, `npm run lint` exit 0

## Known Stubs

Nenhum. Nenhum valor vazio ou placeholder foi introduzido; a mudança de código é uma constante nova, duas condições de laço e dois `throw`.

## Próximo

**WR3-06 está fechado, nas duas direções.** Fica registrado para quem seguir: `agendor.paginacao.test.js` é o oráculo da **terminação** das paginações do módulo — uma terceira paginação que encerre por condição vinda da resposta entra ali, com o seu par (achado + simétrico), e herda `MAX_PAGES` do módulo. E o aviso de instrumentação: o stub daquele arquivo **precisa** ceder ao event loop; simplificá-lo para resolução síncrona ressuscita o travamento da suíte. O próximo é o **04-26** (WR3-04 + WR3-05 + WR3-07).

## Self-Check: PASSED

- 2/2 arquivos declarados existem em disco: `backend/test/agendor.paginacao.test.js` (criado), `backend/src/agendor.js` (modificado)
- 2/2 commits existem no histórico: `161fbe7`, `f83d388`
