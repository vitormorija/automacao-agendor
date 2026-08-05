---
phase: 04-confiabilidade-das-integra-es
plan: 19
subsystem: borda-agendor-categorias
tags: [cr3-01, blocker, fail-open, retry-429, categoria-indecidivel, rel-01, rel-04, rel-06, gap-closure-r3]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "04-02/04-09 (fetchWithRetry, a politica UNICA de retry da borda); 04-12 (cache de categorias por execucao, que multiplicou a frequencia de exposicao ao fail-open); 04-13 (avancarRelogioAte com os dois ramos, usado por todos os casos deste plano)"
provides:
  - "getOrgCategory dentro da politica UNICA de retry da borda — /organizations/:id deixou de ser a unica chamada Agendor sem tratamento de 429"
  - "Sentinela CATEGORIA_INDECIDIVEL exportada por agendor.js, substituindo o `null` do caminho de erro"
  - "Campo categoriaIndecidivel no objeto de negocio devolvido por getStaleDeals — o insumo que o 04-20 e o 04-21 vao ler para NAO enviar"
  - "logger.warn com a tag [Agendor] nomeando organizacao e negocio: a falha de categoria deixou de ser silenciosa"
  - "5 casos novos em agendor.categoriaIndecidivel.test.js, incluindo o SIMETRICO (organizacao elegivel que tambem vira indecidivel)"
  - "A suite deixou de exigir o fail-open: a assercao que ficava VERMELHA quando alguem consertasse CR3-01 nao existe mais"
affects: [04-20, 04-21, verificacao-da-fase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sentinela como STRING (nao Symbol, nao objeto) para que o tipo guardado no cache continue `string | null` e nenhum leitor do Map mude de forma (mesmo motivo estrutural de D-05)"
    - "A informacao nova viaja em campo NOVO em vez de num valor especial de um campo antigo, para nao reescrever a semantica que relatorios ja consomem"
    - "Fail-safe NAO seletivo: sem categoria conhecida ninguem e elegivel, e o custo (um negocio elegivel fora do envio no dia da falha) e pinado por um caso de teste proprio"

key-files:
  created:
    - backend/test/agendor.categoriaIndecidivel.test.js
  modified:
    - backend/src/agendor.js
    - backend/test/agendor.cacheInvalidation.test.js
    - backend/test/agendor.cacheConcurrency.test.js

key-decisions:
  - "[Decisao do usuario, 2026-08-05, vinculante] Rota INDECIDIVEL: retry primeiro; persistindo a falha, o negocio fica FORA do envio mas PERMANECE no painel e nos relatorios. A rota de abortar a rodada inteira foi explicitamente rejeitada e nao foi implementada."
  - "D-CR3-01-e respeitada por medicao: nenhum `continue` novo em getStaleDeals — a contagem de `continue;` em linhas nao-comentario e 5 antes e 5 depois"
  - "D-CR3-01-d: orgCategory continua `null` para o indecidivel, preservando o agrupamento 'Indefinido' de routes/reports.js e de runWeeklySummary; a informacao nova viaja em categoriaIndecidivel"
  - "D-CR3-01-f: o logger.warn mora em getStaleDeals (que conhece o NOME da organizacao) e vem DEPOIS dos demais filtros, para que so negocios que de fato entram na lista gerem linha de log"
  - "T-04-19-03 mitigado: o warn loga nome/id da organizacao e id do negocio — nunca o objeto de erro do axios, que carrega config.headers com o AGENDOR_TOKEN"

patterns-established:
  - "Todo plano de correcao desta rodada inclui o cenario SIMETRICO nomeado por escrito — aqui, a organizacao ELEGIVEL que tambem vira indecidivel"

requirements-completed: [REL-01, REL-04, REL-06]

# Metrics
duration: 21min
completed: 2026-08-05
---

# Phase 04 Plan 19: a consulta de categoria entra no retry da borda e falha como INDECIDÍVEL (CR3-01) Summary

**O único filtro de elegibilidade que dependia de uma segunda chamada HTTP falhava na direção insegura — `catch { return null }` mais `EXCLUDED_CATEGORIES.includes(null) === false` fazia uma organização `'Parceiro'` ser notificada por causa de um 429 transitório, com a rodada reportando sucesso; agora `/organizations/:id` está dentro da política ÚNICA de retry (medido: 3 tentativas no persistente, 2 no transitório, 1 no erro sem `response`) e a exaustão vira a sentinela `CATEGORIA_INDECIDIVEL`, que o objeto de negócio expõe como `categoriaIndecidivel: true` sem sair da lista — e a asserção que ratificava o fail-open como contrato deixou de existir.**

## Performance

- **Duration:** ~21 min
- **Tasks:** 3 de 3 (plano autônomo, sem checkpoint)
- **Commits:** 4 (3 de tarefa + 1 de correção de comentário)
- **Suíte:** 148 → **153** (os 5 casos novos), `npm run test:coverage` exit 0, `npm run lint` exit 0 (44 warnings, baseline)

## Accomplishments

### Task 1 — RED, com a saída literal

`backend/test/agendor.categoriaIndecidivel.test.js`, 5 casos, todos vermelhos antes do conserto:

```
not ok 1 - (1) 429 SEMPRE numa organização de categoria EXCLUÍDA ...
    a consulta de categoria precisa passar pela política ÚNICA de retry da borda (3 tentativas)
    1 !== 3
not ok 2 - (2) SIMÉTRICO — 429 SEMPRE numa organização de categoria NÃO excluída ...
    a política de retry vale para qualquer organização, não só para as de categoria excluída
    1 !== 3
not ok 3 - (3) 429 TRANSITÓRIO ...
    a 1ª consulta levou 429 e a 2ª foi a retentativa
    1 !== 2
not ok 4 - (4) erro SEM response ...
    a falha não retentável também deixa a categoria indecidível — o fail-safe não depende do código HTTP
    + undefined  - true
not ok 5 - (5) negócio SEM organização ...
    ausência de organização não é falha de consulta
    + undefined  - false
# tests 5 / # pass 0 / # fail 5
```

A previsão do plano **bateu exatamente**: (1), (2) e (3) reprovam pela contagem de tentativas (a borda não retentava nem uma vez), (4) e (5) reprovam porque o campo `categoriaIndecidivel` não existia. Nenhum caso já estava verde.

**Commit:** `601ab08`

### Task 2 — GREEN

Quatro mudanças em `backend/src/agendor.js`, nenhuma além delas:

| # | Mudança | Efeito medido |
|---|---|---|
| (a) | `const CATEGORIA_INDECIDIVEL = '__categoria_indecidivel__'` junto de `EXCLUDED_CATEGORIES`, exportada | `grep -c "CATEGORIA_INDECIDIVEL"` = 6; presente no `module.exports` único |
| (b) | `getOrgCategory` passa a usar `fetchWithRetry(() => api.get(...))` | `await api.get(` **3 → 2**; `fetchWithRetry(` **3 → 4** |
| (c) | O `catch` grava e devolve a sentinela em vez de `null` | `cache.set(orgId, null)` **1 → 0** |
| (d) | `getStaleDeals` deriva `categoriaIndecidivel`, reduz `orgCategory` a `null` e acrescenta o campo ao objeto | `categoriaIndecidivel` (não-comentário) = 4; `logger.warn` **0 → 1** |

O arquivo **não foi reordenado**: `fetchWithRetry` continua declarada depois de `getOrgCategory`, e a içagem de `async function` resolve a chamada de cima (R3-05 evitado — o diff de `agendor.js` na Task 2 são 57 inserções e 6 remoções, sem uma única linha movida).

Os 5 casos ficaram verdes e os 7 arquivos irmãos de `agendor.*` passaram **sem edição**: `getStaleDeals` (golden `[101, 103]`), `retry429`, `futureTasks`, `timeout`, `funnel`, `pure`, `realsample`.

**Commit:** `129b3a4`

### Task 3 — a rede de testes para de ratificar o fail-open

- **`agendor.cacheInvalidation.test.js`, cenário (3):** a asserção `idsComFalha.includes(305) === true`, que existia sob o comentário *"Isto documenta o comportamento ATUAL do caminho de erro"* e que ficaria **vermelha ao consertar CR3-01**, foi substituída por duas asserções mais fortes — o negócio 305 **está presente** (o painel o preserva) **e** `categoriaIndecidivel === true` (é o campo, não a ausência, que impede o e-mail). A segunda execução (`orgQueFalha = null` → `idsAposRecuperacao.includes(305) === false`) continua provando o isolamento de REL-04.
- **`agendor.cacheConcurrency.test.js`, caso "escrita tardia":** `idsA.includes(105) === true` ficou **byte a byte**; ganhou abaixo dela uma asserção de que esse negócio vem com `categoriaIndecidivel === true`. Os pontos de suspensão, os contadores e a prova de mecanismo (`consultas205NoEspelho === 2`) não foram tocados.

**Commit:** `20933be`

## Medições (contadas, não inferidas)

| Item | Antes | Depois | Critério do plano | Bate? |
|---|---|---|---|---|
| `await api.get(` (não-comentário) | 3 | **2** | 2 | sim |
| `fetchWithRetry(` (não-comentário) | 3 | **4** | 4 | sim |
| `cache.set(orgId, null)` | 1 | **0** | 0 | sim |
| `categoriaIndecidivel` (não-comentário, `src`) | 0 | **4** | ≥ 3 | sim |
| `CATEGORIA_INDECIDIVEL` (`src`) | 0 | **6** | ≥ 3 | sim |
| `logger.warn` (não-comentário) | 0 | **1** | 1 | sim |
| **`continue;` (não-comentário)** | **5** | **5** | 5 | **sim — nenhum `continue` novo (D-CR3-01-e, risco R3-02)** |
| `^test(` no arquivo novo | — | **5** | 5 | sim |
| `simétrico` no arquivo novo (case-insensitive) | — | **2** | ≥ 1 | sim |
| `^before(` no arquivo novo | — | **0** | 0 | sim |
| `mock.timers.reset()` no arquivo novo | — | **2** | ≥ 2 | sim |
| `idsComFalha.includes(305), true` | 1 | **0** | 0 | sim |
| `categoriaIndecidivel` em `cacheInvalidation` | 0 | **3** | ≥ 1 | sim |
| `categoriaIndecidivel` em `cacheConcurrency` | 0 | **2** | ≥ 1 | sim |
| `consultas205NoEspelho,` | 3 | **3** | 3 | sim |
| `idsAposRecuperacao.includes(305)` | 1 | **1** | 1 | sim |
| Suíte | 148 | **153** | 148 + 5 | sim |

**Nenhum critério de aceite deste plano se mostrou aritmeticamente impossível** — diferente de 04-15, 04-16 e 04-17, os números prescritos foram medidos no arquivo real antes de o plano ser escrito e todos bateram.

### A inferência do plano sobre os testes de cache foi CONFIRMADA por medição

A premissa era que pôr `getOrgCategory` sob `fetchWithRetry` **não** mudaria a contagem de consultas dos dois arquivos de cache, porque as falhas injetadas neles são `new Error(...)` simples — **sem** `response.status`, portanto fora do ramo de 429. Confirmado pelos próprios gates daqueles arquivos, que continuaram verdes sem alteração:

- `cacheInvalidation` cenário (2): `urlsDeOrganizacao.length === 6` (uma consulta por organização única)
- `cacheConcurrency` caso "escrita tardia": `consultas205NoEspelho === 2`

Se qualquer um tivesse mudado, o plano mandava PARAR. Não mudou.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Comentário descrevendo comportamento removido] O bloco do `cacheDaExecucao` ainda citava o `null` do catch**

- **Found during:** Task 3, ao reler `agendor.js` no estado pós-Task 2
- **Issue:** o comentário de `cacheDaExecucao` em `getStaleDeals` afirma, no presente, que *"o `null` que o catch de getOrgCategory grava num erro transitório morre junto com a execução que falhou"*. Depois da Task 2 o catch grava a sentinela, não `null`. É exatamente o padrão que reabriu esta fase três vezes: o comentário do conserto declara um estado que o próprio conserto acabou de remover.
- **Fix:** o comentário passou a nomear `CATEGORIA_INDECIDIVEL` e registrou entre parênteses que o `null` é história, e que o problema nunca foi o isolamento — era a direção da falha.
- **Files modified:** `backend/src/agendor.js`
- **Verificação:** diff **exclusivamente de comentário**, contado — 0 linhas não-comentário
- **Commit:** `806b83a` (separado, para rollback independente)

### Desvios de forma declarados

**2. A mensagem de asserção da 2ª execução de `cacheInvalidation` foi corrigida, apesar de o plano dizer "intacta"**

O plano manda deixar a segunda execução do cenário (3) **intacta**. O comportamento, a asserção e a expressão contada pelo critério (`idsAposRecuperacao.includes(305)` = 1) ficaram intactos. O que mudou foi a **string da mensagem**: dizia *"o null cacheado pelo catch de getOrgCategory sobreviveu…"* e passou a dizer *"o valor cacheado…"*, porque `null` deixou de ser o valor gravado ali. O próprio 04-REVIEW registra que uma mensagem de asserção **não é oráculo e pode ser corrigida**. Nenhum critério de aceite mede essa string.

**3. Três comentários de contexto dos arquivos de cache foram atualizados além do texto que o plano nomeia**

O plano pede a reescrita do comentário do trecho editado e do item (3) do cabeçalho de `cacheInvalidation`. Foram atualizados também: o comentário do stub de `/organizations/:id` nos **dois** arquivos (para nomear a sentinela e registrar, no lugar onde importa, o fato medido de que um erro sem `response` fica fora do ramo de 429) e o parágrafo de CR2-01 no cabeçalho de `cacheConcurrency` (que descrevia no presente o `null` já removido). Todos são comentário; nenhuma asserção, contador ou ponto de suspensão foi tocado.

## Dívida conhecida, nomeada e localizada

**O NOME do caso (3) de `agendor.cacheInvalidation.test.js` continua dizendo `null`:**
`'cenário (3): `null` cacheado por erro transitório não contamina a execução seguinte'`.

Não foi renomeado **de propósito**, pelo precedente decidido no 04-18: nome de caso é **string**, é citado por outros artefatos de planejamento e serve de âncora de referência entre arquivos — renomeá-lo é mexer num oráculo. O que o caso mede continua exatamente o mesmo (o valor gravado pelo catch de uma execução não atravessa para a seguinte); só o rótulo do valor mudou de `null` para a sentinela, e o corpo do caso já diz isso por escrito. Registrado aqui para que a próxima rodada de review não o leia como achado novo.

## Escopo que este plano deliberadamente NÃO fecha

`scheduler.js` e `emailer.js` **não foram tocados**. Este plano produz a informação (`categoriaIndecidivel`) e mantém o negócio na lista; quem **deixa de enviar** é o `runCheck` (04-20) e o `sendOwnerWeeklySummary` (04-21). Até o 04-20 entrar, o comportamento observável de envio é o de hoje — **exceto pelo retry**, que sozinho já elimina o caso dominante do achado (o 429 transitório, medido no caso (3): 2 consultas e o negócio 105 excluído por categoria, como sempre).

`getDealType` continua devolvendo `'Lead'` para categoria nula — o rótulo do card não muda nesta rodada (D-CR3-01-g, registrado como Info).

`getUsers` e `getDealById` continuam **fora** do retry: são escopo do 04-22 (WR3-01). Por isso o critério `await api.get(` = 2, e não 0.

## Threat Model — dispositions aplicadas

| Threat ID | Disposition | Como foi mitigado / aceito |
|---|---|---|
| T-04-19-01 | mitigate | Sentinela no `catch` + campo `categoriaIndecidivel`; casos (1) e (2) verdes |
| T-04-19-02 | mitigate | `fetchWithRetry` na borda, política inalterada; caso (3) mede 2 tentativas |
| T-04-19-03 | mitigate | O `logger.warn` loga nome/id da organização e id do negócio; **nunca** o objeto de erro nem `err.config` (o `AxiosError` carrega `config.headers` com o `AGENDOR_TOKEN`). Contagem de `logger.warn` = 1 |
| T-04-19-04 | mitigate | `logger.warn` com tag `[Agendor]` + campo persistido no objeto de negócio |
| T-04-19-05 | accept | Política não mudou: caso (4) mede 1 tentativa para erro sem `response` |
| T-04-19-06 | accept | Custo do fail-safe pinado por escrito no caso (2) |
| T-04-19-SC | accept | Nenhuma instalação de pacote; `git diff` de `backend/package.json` e `backend/package-lock.json` **vazio** |

Nenhum artefato deste plano exibe o valor do `AGENDOR_TOKEN`, e **SEC-01 permanece ABERTO** (decisão C8) — não foi tocado nem declarado resolvido.

## Definition of Done

- [x] Os 5 casos de `agendor.categoriaIndecidivel.test.js` verdes, com o RED registrado por saída literal
- [x] O caso SIMÉTRICO (2) existe e está nomeado como tal no arquivo
- [x] `getOrgCategory` usa `fetchWithRetry`; `await api.get(` caiu de 3 para 2
- [x] Nenhuma asserção da suíte exige mais `includes(305) === true` como contrato de fail-open
- [x] `agendor.getStaleDeals.test.js` verde e sem edição
- [x] Suíte completa verde (153), cobertura acima dos pisos, `npm run lint` exit 0
- [x] Nenhum artefato exibe o `AGENDOR_TOKEN` nem declara `sec-01` resolvido

## Known Stubs

Nenhum. Nenhum valor vazio/placeholder foi introduzido; o campo `categoriaIndecidivel` sempre carrega um booleano derivado.

## Próximo

**04-20** — `runCheck` deixa de enviar para o negócio indecidível, **sem abortar a rodada**. Ele depende deste plano: reverter o `129b3a4` exige reverter o 04-20 antes.

## Self-Check: PASSED

- 5/5 arquivos declarados existem em disco (1 criado, 3 modificados, 1 SUMMARY)
- 4/4 commits existem no histórico: `601ab08`, `129b3a4`, `20933be`, `806b83a`
