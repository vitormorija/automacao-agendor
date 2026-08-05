---
phase: 04-confiabilidade-das-integra-es
plan: 29
subsystem: integracao-agendor
tags: [gap-closure-r4, wr4-01, wr4-05, paginacao, envelope, fail-safe]
requires: [04-19, 04-22, 04-25]
provides:
  - "Teto MAX_PAGES na TERCEIRA paginação (getStaleDeals), com throw ANTES do Array.from"
  - "Guarda de envelope em getUsers — a última das três desreferências sem fallback"
  - "agendor.paginacao.test.js como oráculo também do TRATAMENTO DO ENVELOPE nas três bordas"
  - "Caso (8): as duas paginações irmãs VERIFICADAS por teste, não presumidas pela leitura"
affects: [backend/src/agendor.js, backend/test/agendor.paginacao.test.js]
tech-stack:
  added: []
  patterns:
    - "teto de paginação reusando a MESMA constante em todas as bordas — nunca uma segunda"
    - "throw antes da alocação derivada do valor da borda, nunca Math.min (truncar = parcial silencioso)"
    - "mensagem de falha que nomeia o MECANISMO suspeito daquela borda, não uma cópia da irmã"
    - "caso único que verifica as N construções gêmeas de uma vez (irmãs verificadas)"
key-files:
  created: []
  modified:
    - backend/src/agendor.js
    - backend/test/agendor.paginacao.test.js
decisions:
  - "D-WR4-01-a aplicada: o teto reusa MAX_PAGES, a MESMA constante das outras duas bordas"
  - "D-WR4-01-b aplicada: `totalPages > MAX_PAGES` com throw IMEDIATAMENTE após derivar totalPages e ANTES do Array.from; zero Math.min"
  - "D-WR4-01-c aplicada: mensagem própria de /deals, culpando meta.totalCount e não o parâmetro page"
  - "D-WR4-01-d aplicada: a justificativa foi REESCRITA nos DOIS arquivos que a declaravam, não removida"
  - "D-WR4-05-a aplicada: `data.data || []`, a mesma forma da irmã — a uniformidade é o próprio conserto"
  - "D-WR4-05-b aplicada: getUsers RESOLVE com o dicionário do que a borda entregou, não rejeita"
  - "RED medido caso a caso por --test-name-pattern: a não-terminação de (5) cancela o arquivo inteiro (precedente do 04-25)"
metrics:
  duration: ~40min
  tasks: 2
  files_created: 0
  files_modified: 2
  completed: 2026-08-05
---

# Phase 4 Plan 29: Teto na Terceira Paginação e Guarda de Envelope em getUsers Summary

As TRÊS paginações de `agendor.js` passaram a ter o mesmo teto e o mesmo tratamento de envelope:
`getStaleDeals` deixou de percorrer o total que a borda anunciar (a justificativa escrita para
dispensá-la do teto era factualmente falsa) e `getUsers` deixou de derrubar a rodada inteira com um
`TypeError` diante de uma resposta bem-sucedida sem a chave `data` — e a sanidade das duas irmãs
está **verificada por teste**, não presumida pela leitura.

## Os dois achados, e por que eram o mesmo desfecho

**WR4-01.** O comentário de `getUsers` afirmava que `getStaleDeals` era *"limitada por construção, e
não existe ali condição de parada vinda da resposta a ser frustrada"*. O array de páginas é finito,
mas o seu **comprimento** sai de `Math.ceil(meta.totalCount / perPage)` — um valor da borda. A sonda
do revisor mediu 201 requisições a `/deals` com `totalCount = 100000`, passando do teto sem nenhuma
exceção.

**WR4-05.** `getUsers` era a única das quatro desreferências de `data.data` do módulo sem fallback.
Uma resposta bem formada no envelope mas sem a chave `data` produzia um `TypeError` que **não é
capturado em lugar nenhum da função** e subia pelo `Promise.all` de `runCheck`.

Os dois terminam no mesmo lugar: o laço (ou a rejeição) vive dentro do `try` de `runCheck`, e o
custo real não é a requisição desperdiçada nem o e-mail perdido daquele dia — é o `finally` que
devolve `isRunning` a `false`. No caso de WR4-01 ele **nunca executa**, e toda rodada seguinte cai
no guard do topo devolvendo `{ skipped: true }`, para sempre, até reiniciar o processo. É
exatamente o modo de falha que WR3-06 existe para impedir e que o 04-25 fechou em duas das três
bordas.

## Task 1 — RED (commit `fcc9611`)

### A forma do RED divergiu, e a divergência é a mesma que o 04-25 já tinha medido

O plano previa uma execução única com (5) e (7) vermelhos e (6) e (8) verdes. **Não é observável.**
`node --test` trata o ARQUIVO como um subteste: o caso (5) estoura o `--test-timeout` e **cancela o
arquivo**, de modo que (6), (7) e (8) nunca chegam a ser executados nem reportados. Saída literal
da execução única prescrita (`node --test --test-timeout=30000`):

```
ok 1 - (1) /users com próxima página SEMPRE: a paginação falha no teto em vez de laçar para sempre
ok 2 - (2) SIMÉTRICO — /users com 2 páginas legítimas: o teto NÃO trunca a operação normal
ok 3 - (3) /tasks com página cheia SEMPRE: a paginação falha no teto em vez de laçar para sempre
ok 4 - (4) SIMÉTRICO — /tasks com 2 páginas legítimas: o Set sai completo das duas
not ok 1 - test/agendor.paginacao.test.js
  failureType: 'testTimeoutFailure'
  error: 'test timed out after 30000ms'
# tests 5 | pass 4 | fail 0 | cancelled 1
```

É a divergência (1) já registrada pelo 04-25, no mesmo arquivo, e a mitigação também é a mesma: os
quatro desfechos foram medidos **separadamente**, por `--test-name-pattern`.

### O caso (5): dos DOIS desfechos previstos, os DOIS aconteceram — e o plano pedia o registro

O plano previa *"uma falha de `assert.rejects` por a promessa ter resolvido, **ou** um estouro de
tempo se as requisições demorarem"*. São o mesmo defeito visto por dois relógios, e a única forma
de saber qual é o de fundo era afrouxar o teto do runner:

```
not ok 1 - (5) /deals anuncia mais páginas do que o teto: a TERCEIRA paginação falha em vez de percorrer o total anunciado
  duration_ms: 39076.940667
  failureType: 'testCodeFailure'
  error: 'Missing expected rejection: a terceira paginação precisa falhar de forma LEGÍVEL, como as outras duas, em vez de percorrer o total anunciado'
  code: 'ERR_ASSERTION'
  operator: 'rejects'
```

**O desfecho de fundo é a RESOLUÇÃO, não o travamento.** `getStaleDeals` percorreu as 201 páginas
anunciadas e **resolveu com sucesso** depois de 39,08 s — 40 lotes de 5 páginas com a pausa de 1 s
entre eles. Isso importa mais do que o timeout: uma rodada que resolve não deixa vestígio de erro
nenhum, e num `totalCount` de 10⁹ os mesmos 39 s viram semanas de laço com `isRunning` preso. O
estouro de tempo só aparece porque o runner tem um teto; **produção não tem**.

### Os outros três, medidos individualmente

```
ok 1 - (6) SIMÉTRICO — /deals com 2 páginas legítimas: o teto NÃO trunca a operação normal

not ok 1 - (7) /users com envelope sem a chave `data`: getUsers RESOLVE em vez de derrubar a rodada
  failureType: 'testCodeFailure'
  error: 'data.data is not iterable'
  name: 'TypeError'
  stack: |-
    getUsers (/Users/vitormorija/Automacao_agendor/backend/src/agendor.js:43:29)

ok 1 - (8) IRMÃS VERIFICADAS — /tasks e /deals com envelope sem a chave `data`: as duas resolvem
```

A previsão do plano para (7) bateu **literalmente**, inclusive na mensagem (`data.data is not
iterable`) e no ponto (`getUsers`). (6) e (8) verdes: a condição de PARAR — *"a armação está
interferindo nos filtros de `getStaleDeals`"* — **não foi atingida**, e isso está medido, não
argumentado: as fixtures de negócio atravessaram threshold de data, categoria, owner, status-id e
etapa sem nenhum ajuste.

### Critérios de aceite da Task 1

| Critério | Esperado | Medido |
|---|---|---|
| `node --test --test-timeout=30000` sai != 0 | sim | **sim** (cancelled 1) |
| `grep -c "^test("` | 8 | **8** |
| Asserções removidas no diff | 0 | **0** (as 4 remoções são o parágrafo falso do cabeçalho e as 2 declarações de modo) |
| `grep -cE "\b200\b"` | 0 | **0** |
| `grep -ci "simétrico"` | ≥ 3 | **4** |
| `grep -c "sem-data"` | ≥ 6 | **12** |
| `git diff --name-only -- backend/src/` | vazio | **vazio** |
| Linhas do arquivo | ≥ 300 | **387** |

## Task 2 — GREEN (commit `6f6d3a3`)

Três mudanças, nenhuma além delas. O diff não-comentário do arquivo inteiro cabe aqui:

```
-    for (const user of data.data) {
+    for (const user of data.data || []) {
+  if (totalPages > MAX_PAGES) {
+    throw new Error(
+      `[Agendor] /deals anunciou ${totalPages} páginas (> ${MAX_PAGES}) — meta.totalCount não parece corresponder ao filtro enviado`,
+    );
+  }
```

**(a) O teto da terceira paginação.** Imediatamente depois de derivar `totalPages` e **antes** de
`allRawDeals` e de `remainingPages`. A posição é a decisão: um `totalCount` de 10⁹ aloca o array
inteiro antes de qualquer requisição, e essa alocação sozinha já é o modo de falha contra o
`max_memory_restart: 300M` do `ecosystem.config.js`. A forma é `throw` e nunca
`Math.min(totalPages, MAX_PAGES)` — truncar trocaria não-terminação por resultado **parcial
silencioso**, a mesma direção de falha e mais difícil de perceber (D-WR3-06-b).

**(b) A guarda de envelope.** `data.data || []`, byte a byte a mesma forma que a paginação de
`/tasks` já usava. Não `data?.data ?? []`: a uniformidade entre as três **é** o conserto.

**(c) A justificativa reescrita.** O parágrafo passou a dizer o oposto medido — que o comprimento
do array vem de `meta.totalCount`, *"do mesmo lado da fronteira de onde vêm as condições de parada
das outras duas paginações"*. Reescrito e não removido (D-WR4-01-d): sem ele, o próximo leitor não
saberia que a pergunta já foi feita. O parágrafo imediatamente anterior, sobre a forma ser `throw`
e não `break`, ficou byte a byte.

### A mensagem é PRÓPRIA de propósito

`/users` e `/tasks` dizem *"a borda pode estar ignorando o parâmetro page"*. `/deals` diz
*"meta.totalCount não parece corresponder ao filtro enviado"*. O mecanismo é outro, e uma mensagem
copiada mandaria quem investiga para o lugar errado (D-WR4-01-c). Por isso o teste ganhou um
`padraoDoTetoDeDeals()` separado, em vez de reusar `padraoDoTeto('/deals')` — e o número continua
**derivado** de `MAX_PAGES` nos dois helpers.

### Critérios de aceite da Task 2 — todos bateram, sem exceção

| Critério | Esperado | Medido |
|---|---|---|
| `node --test test/agendor.paginacao.test.js` **sem** `--test-timeout` | 8 verdes, exit 0 | **8/8, exit 0, 128 ms** |
| `MAX_PAGES` não-comentário | 10 (era 8) | **10** |
| `totalPages > MAX_PAGES` não-comentário | 1 | **1** |
| `Math.min` não-comentário | 0 | **0** |
| `of data.data)` não-comentário | 0 | **0** |
| `"não existe ali condição de parada vinda da resposta"` | 0 | **0** |
| `await api.get(` não-comentário | 0 | **0** |
| `fetchWithRetry(` não-comentário | 6 | **6** |
| `while (page <= MAX_PAGES)` não-comentário | 2 | **2** |
| `TASKS_PER_PAGE` no diff (IN4-05) | 0 | **0** |
| `getDealsWithFutureTasks` no diff (IN4-05) | 0 | **0** |
| `três vezes` no diff (IN4-02) | 0 | **0** |
| Nove arquivos vizinhos, sem edição | verdes | **9/9 exit 0**, `git diff --name-only -- backend/test/` **vazio** |
| `npm run test:coverage` | exit 0 | **exit 0** |
| `npm run lint` | exit 0 | **exit 0** (44 warnings, baseline) |
| `git diff --name-only -- backend/src/` | só `agendor.js` | **só `agendor.js`** |

### Suíte e cobertura

- **174 → 178** testes, todos verdes (os 4 novos são os casos (5) a (8)).
- `agendor.js`: **100 %** linhas / statements / funções e **91,6 %** branches — era 90,69 % / 88,42 %.
- `npm run lint` exit 0 com 44 warnings — baseline inalterado. `biome format` limpo nos dois arquivos.

## Inventário de irmãos — construções gêmeas, com trabalho verificável

### WR4-01 — as três paginações do módulo

| Construção | Classificação | Evidência |
|---|---|---|
| `getUsers` (encerra por `links.next`) | **verificada-e-sã** | Teto do 04-25 intacto; casos (1) e (2) verdes **sem edição de asserção**. `while (page <= MAX_PAGES)` não-comentário = 2. |
| `getDealsWithFutureTasks` (encerra por página incompleta) | **verificada-e-sã** | Idem, casos (3) e (4). A função não aparece no diff (grep = 0). |
| `getStaleDeals` (deriva o volume de `meta.totalCount`) | **corrigida** | Mesmo `MAX_PAGES`, `throw` antes do `Array.from`. Casos (5) e (6). |
| Uma quarta paginação | **inexistente, medido** | `while (page <= MAX_PAGES)` não-comentário = **2** e `Array.from(` não-comentário = **1**, a de `getStaleDeals`. Não há outro laço de página no módulo. |

### WR4-01 — as frases que declaravam `getStaleDeals` limitada por construção

| Onde | Classificação | Evidência |
|---|---|---|
| `agendor.js`, o parágrafo "Por que getStaleDeals NÃO recebe teto" | **corrigida** | Reescrito. `grep -c "não existe ali condição de parada vinda da resposta"` = **0**. |
| `agendor.paginacao.test.js`, cabeçalho | **corrigida** | Reescrito na Task 1, **antes** do código. É o padrão de WR4-02 (atualizar um dos dois arquivos e deixar o outro mentindo) aplicado preventivamente. |
| `04-25-SUMMARY.md` (registra D-WR3-06-e) | **fora-de-escopo-com-medição, sem todo** | Registro histórico e datado do que uma execução fez, não instrução viva. Reescrevê-lo apagaria a razão pela qual WR4-01 pôde ser encontrado. Exclusão deliberada e nomeada. |
| `.planning/ROADMAP.md` e `.planning/REQUIREMENTS.md` | **verificadas-e-sãs, com divergência de medição** | Ver abaixo. |

### WR4-05 — as quatro desreferências do envelope

| Construção | Classificação | Evidência |
|---|---|---|
| `getUsers`: `for (const user of data.data)` | **corrigida** | Agora `\|\| []`. Caso (7): resolve com dicionário vazio. |
| a paginação de `/tasks`: `const tasks = data.data \|\| []` | **verificada-e-sã POR TESTE** | Caso (8) serve o envelope sem `data` e assere Set de tamanho zero — medido, não presumido. |
| `getStaleDeals`: `[...(firstPage.data \|\| [])]` e `r.data \|\| []` | **verificada-e-sã POR TESTE** | Caso (8), mesma execução: lista de comprimento zero. |
| `getOrgCategory`: `data.data?.category?.name` com fallback | **verificada-e-sã** | Encadeamento opcional em toda a cadeia (medido) e o `catch` da função já absorve qualquer falha, transformando-a na sentinela de indecidível. |
| `getDealById`: `return data.data \|\| null` | **verificada-e-sã** | Guardado, medido. |
| `firstPage.meta?.totalCount` com fallback zero | **verificada-e-sã** | Guardado, medido; é o valor cujo excesso o teto novo passa a recusar. |
| Consumidores do envelope FORA de `agendor.js` | **verificada-e-sã** | `grep -rn "data\.data" backend/src` fora de `agendor.js` = **0**. Nenhuma rota desembrulha o envelope por conta própria desde o 04-03. |

Das quatro desreferências não-comentário, as quatro estão agora guardadas — `of data.data)` = 0.

## Divergências medidas (registradas, não forçadas)

### 1. A previsão de FORMA do RED (a mesma do 04-25)

Já descrita acima. Não é divergência de comportamento: os quatro desfechos previstos ocorreram,
apenas não são observáveis numa execução única. Medidos por `--test-name-pattern`.

### 2. O grep `Array.from({ length:` do inventário do plano devolve 0, não 1

**Medido:** `grep -c "Array.from({ length:" backend/src/agendor.js` = **0**.
**Causa:** o Biome quebrou a chamada em múltiplas linhas — `Array.from(` numa linha e
`{ length: totalPages - 1 },` na seguinte. O padrão do plano pressupõe a forma de uma linha só.
**Medição equivalente:** `grep -v "^\s*//" ... | grep -c "Array.from("` = **1**, e é a de
`getStaleDeals`. **A conclusão do inventário sobrevive** — existe exatamente um array de páginas de
comprimento derivado no módulo. Número do plano não forçado; os dois valores ficam registrados.

### 3. ROADMAP e REQUIREMENTS **nomeiam** `getStaleDeals` — o plano media 0

**O plano afirmava:** *"nenhum dos dois nomeia `getStaleDeals`, `meta.totalCount` ou `MAX_PAGES`"*.
**Medido:** `meta.totalCount` = **0** e `MAX_PAGES` = **0** nos dois arquivos, como previsto; mas
`getStaleDeals` aparece **4 vezes no ROADMAP** e **3 no REQUIREMENTS**.

**A classificação "verificadas-e-sãs" sobrevive, e por medição e não por conveniência.** Nenhuma das
sete ocorrências fala de paginação, de volume ou de teto: são os testes de caracterização (TEST-02),
o isolamento do cache por execução (REL-04, redação C9), os títulos dos planos 01-02 e 04-07 na
lista, e o item de backlog PERF-01. **Nenhuma instrução viva declara `getStaleDeals` limitada por
construção fora dos dois arquivos que este plano corrigiu.** O sub-termo errado da medição do plano
fica registrado; o número não foi forçado nem para cima nem para baixo.

Esta é a quinta rodada da fase com divergência de contagem. As quatro anteriores foram **menção
dentro de comentário**; as duas desta são de outra classe — **forma do padrão de grep** (nº 2) e
**sub-termo factualmente errado numa medição composta** (nº 3).

## Deviations from Plan

Nenhuma. Nenhuma Rule 1-4 acionada, nenhum pacote instalado, `package.json` e lockfile intocados
(T-04-29-SC honrada). As três divergências acima são de **medição e de forma de observação**, não
de escopo nem de comportamento.

## Escopo que este plano NÃO fecha

- **IN4-05** (o literal `100` duas vezes na paginação de `/tasks`): fora do diff por critério
  explícito, grep = 0. Tem todo próprio.
- **IN4-02** (o parágrafo sobre a guarda de id fora do callback): fora do diff, grep = 0.
- **O `console.log` legado** de `getDealsWithFutureTasks`: continua lá (LOG-01, Fase 5).
- **T-04-29-06, aceito:** uma base legítima com mais de 20.000 negócios em andamento passa a
  falhar. Ordens de magnitude acima do uso real, mesma aceitação de T-04-25-05; o caso (6) protege
  o caminho normal.
- **Os demais achados da r4** (WR4-02, WR4-03, WR4-04, WR4-06, WR4-07): planos 04-30 a 04-34.

## Atenção para quem seguir

`agendor.paginacao.test.js` deixou de ser o oráculo apenas da **terminação** e passou a ser também
o do **tratamento do envelope**. As três bordas do módulo estão cobertas nas duas dimensões, e o
cabeçalho registra as duas. Uma quarta borda entra ali com o par completo: teto + simétrico
legítimo + envelope sem `data`. O caso (8) é o molde do "irmãs verificadas" — uma correção numa
borda só está fechada quando as gêmeas foram **medidas**, e não lidas.

## Self-Check: PASSED

Arquivos:
- FOUND: `backend/src/agendor.js`
- FOUND: `backend/test/agendor.paginacao.test.js`
- FOUND: `.planning/phases/04-confiabilidade-das-integra-es/04-29-SUMMARY.md`

Commits:
- FOUND: `fcc9611` — test(04-29): RED
- FOUND: `6f6d3a3` — fix(04-29): GREEN

Estado da árvore: `git status --short` limpo antes deste SUMMARY; suíte 178/178; cobertura exit 0;
lint exit 0.
