---
phase: 04-confiabilidade-das-integra-es
plan: 22
subsystem: borda-agendor-retry
tags: [wr3-01, politica-unica, retry-429, rel-01, rel-03, gap-closure-r3]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "WR-02 (04-09, o helper fetchWithRetry e a politica de 429); WR-03 (a guarda de tipo do id em getDealById); CR3-01 (04-19, que colocou /organizations/:id no helper)"
provides:
  - "As CINCO chamadas HTTP do modulo sob a mesma politica de retry: zero ocorrencias de `await api.get(` em agendor.js"
  - "O comentario da politica ENUMERA as cinco bordas cobertas, com o ponto de chamada de cada uma — a afirmacao 'unica' virou conferivel"
  - "4 casos novos em agendor.retry429.test.js, incluindo os dois SIMETRICOS (exaustao e timeout em /users)"
  - "WR3-01 fechado"
affects: [04-23, verificacao-da-fase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Afirmacao de completude em comentario tem de vir com a LISTA que a torna conferivel: enquanto o bloco dizia so 'politica UNICA', ninguem foi procurar as tres bordas que faltavam"
    - "Validacao fica FORA do callback do retry: o que passa pelo helper ganha retentativa, nao ganha permissao — um id hostil dentro do callback sairia 3 vezes com o token no header, em vez de nenhuma"
    - "O cenario SIMETRICO desta rodada em DUAS direcoes sobre a mesma borda: (6) a exaustao ainda propaga (o retry nao virou 'engolir o erro') e (7) o timeout ainda nao entra (a politica nao se alargou de carona)"

key-files:
  created: []
  modified:
    - backend/src/agendor.js
    - backend/test/agendor.retry429.test.js

key-decisions:
  - "D-WR3-01-a respeitada e MEDIDA: as duas chamadas entraram no helper existente, sem politica nova nem parametro por borda — `fetchWithRetry(` em linhas nao-comentario = 6 (a definicao mais as cinco bordas)"
  - "D-WR3-01-b respeitada: a guarda de tipo do id continua ACIMA da chamada; o caso (8) assere 0 requisicoes para `'../users'` e dealId.validation.test.js saiu 0 SEM edicao"
  - "D-WR3-01-c respeitada: o comentario passou a enumerar as cinco bordas com o ponto de chamada de cada uma; `grep -c organizations` foi de 1 para 2"
  - "D-WR3-01-d respeitada: nenhuma mudanca de contrato — o caso (6) pina que a exaustao continua propagando com 3 requisicoes"
  - "DIVERGENCIA MEDIDA na previsao do RED: o plano previa `1 !== 2` nos casos (5) e (8); o valor real e uma falha ANTERIOR (a promessa rejeita com o 429 cru, antes de a asseracao de contagem ser alcancada)"

patterns-established:
  - "Enumerar a lista dentro do proprio comentario que afirma completude cria a obrigacao de manutencao no lugar certo: quem acrescentar uma sexta borda ou acrescenta uma linha, ou deixa a lista mentindo de forma visivel — diferente de 'unica', que mentia de forma invisivel"

requirements-completed: [REL-01, REL-03]

# Metrics
duration: 14min
completed: 2026-08-05
---

# Phase 04 Plan 22: as cinco bordas do módulo sob a mesma política de retry (WR3-01) Summary

**O comentário abria com "Política ÚNICA de retry da borda Agendor" e explicava que duplicar a regra criaria "um segundo lugar para ela divergir" — enquanto o helper cobria duas das cinco chamadas do módulo, e `/users`, a mais cara delas, ficava de fora não por decisão registrada mas por omissão; agora as cinco passam pelo mesmo `fetchWithRetry` (`await api.get(` chega a **zero** ocorrências), a guarda de tipo do id continua fora do callback com 0 requisições asseridas, e o bloco de comentário **enumera** as bordas com o ponto de chamada de cada uma, o que transforma a palavra "única" de retórica em afirmação conferível.**

## Performance

- **Duration:** ~14 min
- **Tasks:** 2 de 2 (plano autônomo, sem checkpoint)
- **Commits:** 2 (1 por tarefa)
- **Suíte:** 160 → **164** (os 4 casos novos), `npm run test:coverage` exit 0, `npm run lint` exit 0 (44 warnings, baseline)

## Accomplishments

### Task 1 — RED, com a saída literal

`backend/test/agendor.retry429.test.js` estendido de 4 para 8 casos, com os 4 existentes **byte a byte**.

```
ok 1 - (1) 429 transitório em /tasks é retentado e a rodada conclui
ok 2 - (2) 429 sempre: esgotadas as 3 tentativas, a falha PROPAGA (o fail-safe de REL-06 fica intacto)
ok 3 - (3) timeout NÃO é retentado: propaga na PRIMEIRA requisição (D-01)
ok 4 - (4) caracterização: o 429 de /deals continua retentado, e o golden não se move
not ok 5 - (5) 429 transitório em /users é retentado e a rodada conclui
not ok 6 - (6) SIMÉTRICO — 429 sempre em /users: esgotadas as 3 tentativas, a falha PROPAGA
    1 !== 3
ok 7 - (7) SIMÉTRICO na direção oposta — timeout em /users NÃO é retentado: propaga na PRIMEIRA requisição (D-01)
not ok 8 - (8) 429 transitório em /deals/:id é retentado, e a guarda de id continua ANTES da requisição
# tests 8 / # pass 5 / # fail 3
```

**A previsão do plano bateu na forma, e DIVERGIU na mecânica de (5) e (8)** — ver a seção *Divergências medidas*, abaixo. O caso (6) reprovou exatamente como previsto (`1 !== 3`) e o (7) já estava verde, também como previsto.

O detalhe do RED de (5) que dá a medida do achado vem do stack:

```
error: 'Request failed with status code 429'
  getUsers (backend/src/agendor.js:33:32)
```

Uma requisição, um 429, e a promessa de `getUsers` rejeita. Em produção essa rejeição acontece **dentro do `Promise.all` que `runCheck` usa como pré-requisito de tudo**: a rodada aborta antes do laço de envio, com zero negócios processados, zero e-mails e o único vestígio numa string em `results.error`. O cabeçalho do próprio arquivo já usava esse raciocínio — *"como o cron é DIÁRIO, um 429 transitório custa 24 HORAS SEM NENHUMA NOTIFICAÇÃO, em silêncio"* — para justificar o retry em `/tasks`, e citava nominalmente `getUsers` como uma das três consultas que martelam a API simultaneamente. Nada nele era específico de `/tasks`.

**Commit:** `eaab036`

### Task 2 — GREEN

Três mudanças em `backend/src/agendor.js`, **nada além delas**: 32 inserções, 11 remoções — e o diff de **linhas não-comentário é exatamente os dois pontos de chamada**, contado, não inferido:

```
-    const { data } = await api.get('/users', { params: { page, per_page: 100 } });
+    const { data } = await fetchWithRetry(() =>
+      api.get('/users', { params: { page, per_page: 100 } }),
+    );
-  const { data } = await api.get(`/deals/${dealId}`);
+  const { data } = await fetchWithRetry(() => api.get(`/deals/${dealId}`));
```

Todo o resto do diff é o bloco de comentário da política. Ele deixou de apenas se declarar único e passou a listar as cinco bordas com a função em que cada uma vive:

| # | Borda | Ponto de chamada | Entrou em |
|---|---|---|---|
| 1 | `/deals` | `fetchDealsPage` | WR-02 (04-09) |
| 2 | `/tasks` | `getDealsWithFutureTasks` | WR-02 (04-09) |
| 3 | `/organizations/:id` | `getOrgCategory` | CR3-01 (04-19) |
| 4 | `/users` | `getUsers` | **WR3-01 (este plano)** |
| 5 | `/deals/:id` | `getDealById` | **WR3-01 (este plano)** |

O bloco preserva o que já explicava e continua verdadeiro (só 429 entra; timeout de client fica fora de propósito, D-01; duplicar a regra criaria um segundo lugar para ela divergir) e acrescenta duas frases que o achado tornou necessárias: que a política é única **porque todas passam por aqui, e não porque é o único laço escrito**, e que passar pelo helper dá retentativa mas **não dá permissão** — a guarda de tipo do id fica acima da chamada, fora do callback. Referências por âncora nomeada, nunca por número de linha (WR2-06).

Os 8 casos ficaram verdes e os **vizinhos passaram sem edição**: `agendor.timeout`, `agendor.getStaleDeals`, `agendor.futureTasks`, `agendor.categoriaIndecidivel`, `dealId.validation`, `notifications.resolved`, `agendor.cacheInvalidation` e `agendor.cacheConcurrency`. `git diff --name-only -- backend/test/` na Task 2 saiu **vazio**.

**Commit:** `04c2917`

## Medições (contadas, não inferidas)

| Item | Antes | Depois | Critério do plano | Bate? |
|---|---|---|---|---|
| `await api.get(` (não-comentário) | 2 | **0** | 0 | sim |
| `fetchWithRetry(` (não-comentário) | 4 | **6** | 6 | sim |
| `api.get(` (não-comentário) | 5 | **5** | 5, inalterado | sim |
| `Number.isInteger(dealId)` | 1 | **1** | 1 | sim |
| `organizations` em `agendor.js` | 1 | **2** | maior que antes | sim |
| `continue;` (não-comentário) | 5 | **5** | — (não é regressão do 04-19) | sim |
| `^test(` em `agendor.retry429.test.js` | 4 | **8** | 8 | sim |
| Asserções removidas/alteradas no diff do teste | — | **0** | 0 | sim |
| `simétrico` no arquivo de teste (case-insensitive) | 0 | **4** | ≥ 1 | sim |
| Linhas do arquivo de teste | 213 | **368** | ≥ 260 | sim |
| Diff de código (não-comentário) em `agendor.js` | — | **2 pontos de chamada** | só (a) e (b) | sim |
| `git diff --name-only -- backend/src/` | — | **só `agendor.js`** | só `agendor.js` | sim |
| `git diff --name-only -- backend/test/` na Task 2 | — | **vazio** | vazio | sim |
| Suíte | 160 | **164** | 160 + 4 | sim |
| `npm run test:coverage` | — | exit **0** | exit 0 | sim |
| `npm run lint` | — | exit **0**, 44 warnings | exit 0 | sim |

**Todos os critérios de aceite numéricos bateram.** Cobertura de `agendor.js` medida em **89,53% de linhas / 86,72% de branches** (pisos do `.c8rc.json`: 20 e 60); `getUsers` e `getDealById` passaram a ter o ramo de 429 exercitado, que antes não existia para elas.

## Divergências medidas

**A previsão do RED para (5) e (8) não bateu — e o valor real é mais forte que o previsto.**

O plano previa `1 !== 2` nesses dois casos, isto é, a asserção de contagem de requisições reprovando. O medido é uma falha **anterior**: `failureType: 'testCodeFailure'`, `error: 'Request failed with status code 429'`, com stack apontando para `getUsers (agendor.js:33)` e `getDealById (agendor.js:113)`. A promessa **rejeita**, então o `await` do caso lança e a asserção de contagem nunca chega a ser avaliada.

Por que a previsão errou, e por que isso é sinal e não ruído: `1 !== 2` seria o desfecho se `getUsers` engolisse o 429 e devolvesse um dicionário parcial — o defeito de *fail-open*. O que ela faz é o oposto: propaga na primeira requisição. O defeito de WR3-01 nunca foi de proteção parcial (esse é o de CR3-01, fechado no 04-19); é de **ausência de rede de segurança antes de a falha virar explícita**. O RED medido registra exatamente isso, e o caso (6) permanece como o oráculo que garante que o conserto não trocou um defeito pelo outro.

Registrado conforme a instrução da rodada: valor medido acima do valor prescrito, sem forçar o número do plano.

## Como os casos foram construídos (e por que assim)

**O stub distingue `'/deals'` exato do prefixo `'/deals/'`.** A rota de paginação de negócios já era comparada com `===`; a nova usa `startsWith('/deals/')` — **com a barra**. Sem ela, a rota de `/deals/:id` capturaria também a paginação, e os casos (1)-(4) passariam a contar num contador que não é o deles (risco R3-16 da matriz). Os quatro casos antigos rodam no mesmo comando, então a quebra apareceria imediatamente.

**A resposta boa de `/users` não tem `links.next`.** Uma página só, para que a paginação encerre em uma requisição e o contador meça **tentativas**, não páginas.

**Verificação por VALOR no caso (5).** `assert.deepStrictEqual(users[11], { id, name, email })`, não `Object.keys(users).length`. É este dicionário que resolve o e-mail do responsável de cada negócio parado — um mapa do tamanho certo com o endereço errado notificaria a pessoa errada e passaria por uma asserção de contagem.

**O caso (8) mede a guarda ANTES do caminho feliz.** Com o contador ainda zerado pelo `beforeEach`, `getDealById('../users')` é recusado e o teste assere `chamadasDealById === 0`; só então o id válido é consultado e o contador chega a 2. A ordem não é estética: se a guarda tivesse migrado para dentro do callback, o id hostil sairia **três** vezes pela instância compartilhada — com o `AGENDOR_TOKEN` no header — em vez de nenhuma, e o 429 armado seria consumido pela requisição indevida.

**Os dois simétricos cobrem direções opostas da mesma borda.** O (6) impede que estender a política vire "engolir o erro" (dicionário parcial, a classe de falha que a Decisão Q2 recusou para as tarefas futuras). O (7) impede que estender a política a uma borda nova alargue, de carona, a política em si — retentar timeout levaria o pior caso de uma requisição de ~15s para ~60s, comendo a janela do cron que o teto de tempo de D-01 existe para proteger.

## Deviations from Plan

**Nenhum desvio de execução.** As três mudanças prescritas foram feitas e nada além delas; nenhum arquivo além dos dois declarados em `files_modified`; nenhuma regra dos Rules 1-4 acionada; nenhum pacote instalado.

Um ajuste de forma que não é desvio: uma chamada `assert.equal` de três argumentos foi quebrada em cinco linhas para caber no `lineWidth` de 80 do Biome (`biome.json` da raiz, obrigatório pelo CLAUDE.md). Foi o próprio `biome format` que ditou a forma; o conteúdo da asserção não mudou.

## Riscos da matriz — como cada um foi neutralizado

| # | Risco | Como foi evitado (medido) |
|---|---|---|
| R3-14 | Mover a guarda de tipo do id para dentro do callback | `Number.isInteger(dealId)` = 1 e continua acima da chamada; caso (8) assere 0 requisições para `'../users'`; `dealId.validation.test.js` verde **sem edição** |
| R3-15 | Criar uma segunda política (tentativas diferentes por borda) | `fetchWithRetry(` não-comentário = **6** exatamente (definição + 5 bordas); nenhum parâmetro `retries` novo no diff |
| R3-16 | O stub de `/deals/:id` capturar também `/deals` | Prefixo **com barra**; casos (1)-(4) verdes no mesmo comando, com `chamadasDeals === 2` intacto no (4) |
| R3-17 | Editar asserção de caso existente para "acomodar" o retry novo | `git diff \| grep -E "^-[^-]" \| grep -c assert` = **0** |

## Threat Model — dispositions aplicadas

| Threat ID | Disposition | Como foi mitigado / aceito |
|---|---|---|
| T-04-22-01 | mitigate | `fetchWithRetry` em `getUsers`; caso (5) mede 2 requisições e o dicionário completo por valor |
| T-04-22-02 | mitigate | Caso (6) exige rejeição na exaustão com 3 requisições; o contrato "completo ou falha" não mudou |
| T-04-22-03 | mitigate | Guarda de tipo permanece antes do callback; caso (8) assere 0 requisições para id inválido, e o comentário da política agora declara por escrito que o helper não dá permissão |
| T-04-22-04 | mitigate | Caso (7) mede 1 requisição; a condição `err.response?.status === 429` não foi tocada |
| T-04-22-05 | accept | O helper relança sem logar; nenhuma linha de log foi acrescentada por este plano |
| T-04-22-SC | accept | Nenhuma instalação de pacote; `git diff` de `backend/package.json` e `backend/package-lock.json` vazio |

Nenhum artefato deste plano exibe o valor do `AGENDOR_TOKEN`, e **SEC-01 permanece ABERTO** (decisão C8) — não foi tocado nem declarado resolvido.

## Escopo que este plano deliberadamente NÃO fecha

**A paginação não ganhou teto de páginas.** `getUsers` continua com `while (true)` e o `break` dependendo de `data.links?.next`; `getDealsWithFutureTasks` continua com o seu. Isso é **WR3-06, do 04-25**, e antecipá-lo aqui misturaria duas correções num commit.

Os corpos de `getStaleDeals`, `getOrgCategory`, `getDealsWithFutureTasks`, `shouldNotifyOwner`, `isExcludedStage`, `getDealType` e o `module.exports` ficaram **byte a byte** — o diff de código são os dois pontos de chamada e nada mais. O arquivo não foi reordenado.

O `console.log` legado de `getDealsWithFutureTasks` continua lá: migrá-lo é LOG-01, da Fase 5.

A cópia local de `avancarRelogioAte` em `emailer.timeout.test.js` continua duplicada — dívida disponível desde o 04-18, fora do escopo aqui.

## Definition of Done

- [x] Casos (5) a (8) verdes, com o RED registrado por saída literal
- [x] Os casos SIMÉTRICOS (6) e (7) existem e estão nomeados como tais no arquivo (4 ocorrências de "simétrico")
- [x] `await api.get(` chega a 0 ocorrências em `agendor.js`
- [x] O comentário da política enumera as cinco bordas, com o ponto de chamada de cada uma
- [x] Os 4 casos antigos de `retry429` sem nenhuma asserção alterada (0 no diff)
- [x] Suíte completa verde (164), cobertura acima dos pisos, `npm run lint` exit 0

## Known Stubs

Nenhum. Nenhum valor vazio ou placeholder foi introduzido; as duas mudanças de código são reescritas de chamadas existentes.

## Próximo

**WR3-01 está fechado.** O próximo é o **04-23** (WR3-02). Fica registrado para quem o executar: as cinco bordas agora dependem do mesmo helper, então qualquer mudança em `fetchWithRetry` passa a ter cinco consumidores — e o caso (7) é o alarme que dispara se a condição de 429 for alargada.

## Self-Check: PASSED

- 3/3 arquivos declarados existem em disco: `backend/src/agendor.js` (modificado), `backend/test/agendor.retry429.test.js` (modificado), este SUMMARY
- 2/2 commits existem no histórico: `eaab036`, `04c2917`
