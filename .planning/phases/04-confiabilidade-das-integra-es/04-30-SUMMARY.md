---
phase: 04-confiabilidade-das-integra-es
plan: 30
subsystem: integracao-agendor
tags: [gap-closure-r4, wr4-04, in4-01, concorrencia, fan-out, rate-limit]
requires: [04-19, 04-22, 04-25, 04-29]
provides:
  - "LOTE_DE_ORGS: teto de CONCORRÊNCIA na única borda do módulo com fan-out proporcional ao dado"
  - "agendor.loteDeOrganizacoes.test.js como oráculo de concorrência EM VOO (não de contagem total)"
  - "Caso (3): o lote irmão da paginação de negócios VERIFICADO por medição, não presumido"
  - "IN4-01 fechado: o comentário do lote de páginas deixou de citar o valor do outro lote"
affects: [backend/src/agendor.js, backend/test/agendor.loteDeOrganizacoes.test.js]
tech-stack:
  added: []
  patterns:
    - "teto de concorrência por lote (for sobre fatias + Promise.all por fatia), sem pausa entre lotes"
    - "oráculo de concorrência: stub que CEDE ao event loop e conta entradas/saídas, guardando o máximo simultâneo"
    - "guarda de NÃO-VACUIDADE no teste em vez de derivação da constante, quando a constante ainda não existe no RED"
key-files:
  created:
    - backend/test/agendor.loteDeOrganizacoes.test.js
  modified:
    - backend/src/agendor.js
decisions:
  - "D-WR4-04-a aplicada: LOTE_DE_ORGS = 10, constante de módulo EXPORTADA"
  - "D-WR4-04-b aplicada: for sobre fatias de uniqueOrgIds, Promise.all por fatia, SEM pausa entre lotes"
  - "D-WR4-04-c aplicada: arquivo de teste NOVO; agendor.cacheInvalidation.test.js byte a byte, rodado como regressão"
  - "D-WR4-04-d aplicada: o oráculo é a CONCORRÊNCIA MÁXIMA EM VOO, com o total como asserção complementar"
  - "D-WR4-04-e aplicada: IN4-01 fechado dentro deste plano; o comentário deixou de citar número"
  - "D-WR4-04-f aplicada: 4 linhas novas no bloco de política de retry; o parágrafo de IN4-02 byte a byte"
  - "DIVERGÊNCIA DELIBERADA: ORGS_UNICAS não é DERIVADA de LOTE_DE_ORGS — é asserida contra ela (ver Divergências nº 1)"
metrics:
  duration: ~35min
  tasks: 2
  files_created: 1
  files_modified: 1
  completed: 2026-08-05
---

# Phase 4 Plan 30: Teto de Concorrência na Consulta de Categoria por Organização Summary

A única borda de `agendor.js` cujo número de requisições cresce com o VOLUME DE DADOS deixou de
disparar todas as chamadas ao mesmo tempo: a fase de categorias de `getStaleDeals` passou a sair em
lotes de `LOTE_DE_ORGS`, sem mudar uma vírgula do que a função devolve — e o lote IRMÃO da
paginação de negócios está **verificado por medição**, não presumido pela leitura.

## O achado, e por que ele é pior do que parece

`getOrgCategory` dispara uma requisição por organização única dos negócios parados, e desde CR3-01
cada uma passa por `fetchWithRetry`. Sob HTTP 429, `N` requisições viram `3N` — a sonda do revisor
mediu 5 organizações produzindo 15 requisições. **O erro que está sendo retentado é justamente o
que a API usa para pedir menos tráfego**, então retentar em massa prolonga a própria janela de rate
limit que causou a falha; e é essa janela que produz a supressão em massa que CR4-01 tornou audível.

O agravante que nenhum plano tinha olhado: `getStaleDeals` é também o **caminho de leitura do
painel**. Medido: **8 invocações** de `getStaleDeals(...)` fora do próprio `agendor.js` — três em
`scheduler.js`, uma em `routes/deals.js`, uma em `routes/reports.js` e **três** em
`routes/notifications.js`. Com `DealsList.jsx` em auto-refresh, cada atualização de tela com a API
rate-limitada passou a custar `3N` requisições e até ~15 s de espera dentro do handler HTTP.

## Task 1 — RED (commit `adbe279`)

### A previsão do plano bateu literalmente, nos três casos

Saída literal da execução prescrita (`node --test test/agendor.loteDeOrganizacoes.test.js`):

```
not ok 1 - (1) 25 organizações únicas: a consulta de categoria respeita um teto de CONCORRÊNCIA
  failureType: 'testCodeFailure'
  error: 'o fan-out da borda de categorias não pode ser proporcional ao volume de dados: máximo em voo medido = 25, teto = undefined'
  code: 'ERR_ASSERTION'
ok 2 - (2) SIMÉTRICO — o resultado não muda: uma consulta por organização e a categoria excluída continua excluída
ok 3 - (3) IRMÃO VERIFICADO — o lote da paginação de negócios continua com o seu próprio teto
# tests 3 | pass 2 | fail 1 | cancelled 0
```

**`maxEmVooOrganizacoes = 25`** — 25 organizações únicas, 25 requisições SIMULTÂNEAS. A condição de
PARAR do plano (*"se (2) ou (3) ficarem vermelhos, a armação está medindo outra coisa"*) **não foi
atingida**: as 25 fixtures sintéticas atravessaram threshold de data, categoria, owner, status-id e
etapa sem nenhum ajuste, e o lote da paginação já media 5 antes de qualquer conserto.

### O instrumento: concorrência EM VOO, não contagem total

`totalOrganizacoes` vale **25 nos dois estados** — antes e depois do conserto. É por isso que
D-WR4-04-d proíbe usá-lo como oráculo: contagem total não distingue "dez de cada vez" de "vinte e
cinco de uma vez". O stub mantém, por borda, `emVoo` / `maxEmVoo` / `total`, incrementando ao
ENTRAR e decrementando dentro do `setImmediate` que resolve a promessa.

**A resolução por `setImmediate` é construção necessária, e o motivo está escrito no arquivo:** um
stub puramente síncrono resolveria a promessa antes de a próxima chamada do `map` sair, "em voo"
voltaria a zero entre uma requisição e a seguinte, e o máximo medido seria SEMPRE 1 — o instrumento
marcaria concorrência 1 em qualquer implementação, inclusive na defeituosa. É o risco R4-15, e ele
não se materializou porque a mitigação estava prescrita na ação.

### Critérios de aceite da Task 1

| Critério | Esperado | Medido |
|---|---|---|
| `node --test` sai != 0, com (1) vermelho e (2)/(3) verdes | sim | **sim** |
| `grep -c "^test("` | 3 | **3** |
| `grep -c "LOTE_DE_ORGS"` | ≥ 2 | **6** |
| `grep -ci "simétrico"` | ≥ 1 | **1** |
| `grep -cE "\.js:[0-9]+"` | 0 | **0** |
| `git diff --name-only backend/src/` | vazio | **vazio** |
| Linhas do arquivo | ≥ 180 | **282** |

## Task 2 — GREEN (commit `531479e`)

Quatro mudanças, nenhuma além delas. O diff não-comentário do arquivo inteiro cabe aqui:

```
+const LOTE_DE_ORGS = 10;
-  const categoriaPorOrg = new Map(
-    await Promise.all(
-      uniqueOrgIds.map(async (id) => [
-        id,
-        await getOrgCategory(id, cacheDaExecucao),
-      ]),
-    ),
-  );
+  const categoriaPorOrg = new Map();
+  for (let i = 0; i < uniqueOrgIds.length; i += LOTE_DE_ORGS) {
+    const lote = uniqueOrgIds.slice(i, i + LOTE_DE_ORGS);
+    const pares = await Promise.all(
+      lote.map(async (id) => [id, await getOrgCategory(id, cacheDaExecucao)]),
+    );
+    for (const [id, categoria] of pares) categoriaPorOrg.set(id, categoria);
+  }
+  LOTE_DE_ORGS,
```

**(a) A constante.** `LOTE_DE_ORGS = 10`, junto de `MAX_PAGES`, exportada. O valor é o dobro do
`batchSize` de páginas porque uma consulta por id é muito mais barata que uma página de cem
registros. Exportar é o que permite ao teste citar o número em vez de duplicá-lo — a lição de R3-29,
já paga uma vez nesta fase com `MAX_PAGES`.

**(b) O lote.** `for` sobre fatias, `Promise.all` por fatia, alimentando o `Map` declarado antes do
laço. **O par `[id, categoria]` foi preservado byte a byte** — é ele que impede R4-13 (categoria
associada ao id errado, que reabriria o fail-open de CR3-01 por caminho novo). **Sem pausa entre
lotes** (D-WR4-04-b): a pausa da paginação existe porque cada requisição de lá traz 100 registros;
aqui o objetivo é limitar CONCORRÊNCIA, não taxa. Medido: `Promise.all` não-comentário em
`agendor.js` continua em **2**, e nenhum `setTimeout` novo entrou no diff (R4-16 não se
materializou).

**(c) O comentário do lote irmão (IN4-01).** A frase dizia "batches de 10" imediatamente acima de
`const batchSize = 5;`. Com este plano o módulo passou a ter DOIS lotes, e um deles vale exatamente
10 — deixar a frase errada ali tornaria os dois indistinguíveis. **O número foi REMOVIDO em vez de
corrigido**: o comentário agora aponta para o identificador `batchSize`, que não pode divergir de si
mesmo. `grep -c "batches de 10"` = **0**.

**(d) A frase no bloco de política de retry.** Quatro linhas registrando que `/organizations/:id` é
a única das cinco bordas cujo número de chamadas é proporcional ao volume de dados, e que por isso
tem teto próprio. Nenhuma linha existente do bloco foi alterada — o parágrafo de IN4-02 (a guarda de
id fora do callback) ficou byte a byte.

### Critérios de aceite da Task 2

| Critério | Esperado | Medido |
|---|---|---|
| `node --test test/agendor.loteDeOrganizacoes.test.js` | 3 verdes, exit 0 | **3/3, exit 0** |
| `LOTE_DE_ORGS` não-comentário | ≥ 3 | **4** (declaração, `i +=`, `i +`, export) |
| `grep -c "LOTE_DE_ORGS,"` (export) | ≥ 1 | **1** |
| `uniqueOrgIds.map` não-comentário | 0 | **0** |
| `Promise.all` não-comentário em `agendor.js` | 2 | **2** (entrada = 2) |
| `batchSize = 5` não-comentário | 1 | **1** |
| `batches de 10` | 0 | **0** |
| IN4-02 (`três vezes`) em linhas ALTERADAS | 0 | **0** (ver Divergências nº 2) |
| IN4-05 (`getDealsWithFutureTasks`) em linhas ALTERADAS | 0 | **0** (ver Divergências nº 2) |
| `git diff --name-only -- backend/src/` | só `agendor.js` | **só `agendor.js`** |
| `agendor.cacheInvalidation.test.js` sem edição, verde | sim | **`git diff --name-only -- backend/test/` VAZIO**, 3/3 |
| `npm run test:coverage` | exit 0 | **exit 0** |
| `npm run lint` | exit 0 | **exit 0** (44 warnings, baseline) |

### Suíte e cobertura

- **178 → 181** testes, todos verdes (os 3 novos são os casos (1) a (3)).
- `agendor.js`: **100 %** linhas / statements / funções e **91,72 %** branches — era 100 % / 91,6 %.
  Não regrediu.
- Os **dez** arquivos vizinhos verdes SEM edição (55 casos, exit 0):
  `cacheInvalidation`, `cacheConcurrency`, `getStaleDeals`, `categoriaIndecidivel`, `paginacao`,
  `retry429`, `timeout`, `futureTasks`, `scheduler.categoriaIndecidivel`, `scheduler.failsafe`.
- Contratos herdados medidos e NÃO regredidos: `await api.get(` = **0**, `fetchWithRetry(` = **6**,
  `api.get(` = **5** (04-22); `MAX_PAGES` não-comentário = **10**, `of data.data)` = **0** (04-25 /
  04-29).

## Inventário de irmãos — construções gêmeas de "fan-out sem teto de concorrência"

### Os onze `Promise.all` de `backend/src` (medido: **11** não-comentário, inalterado)

| Construção | Classificação | Evidência |
|---|---|---|
| `getStaleDeals`, fase de categorias (`uniqueOrgIds.map`) | **corrigida** | `uniqueOrgIds.map` não-comentário = **0**; caso (1) verde com `LOTE_DE_ORGS` como teto. |
| `getStaleDeals`, paginação (`batch.map`) | **verificada-e-sã POR MEDIÇÃO** | Caso (3): 6 páginas anunciadas, `maxEmVooDeals` medido = **5**, `totalDeals` = **6**. Medido, não lido. |
| `runCheck`, `runWeeklySummary`, `runCheckOnly` (`scheduler.js`) | **verificadas-e-sãs** | Os três são `Promise.all([...])` sobre array LITERAL de elementos fixos — medido pelo padrão `Promise.all([`, que não aceita comprimento derivado do dado. |
| `routes/deals.js`, `routes/reports.js` e três rotas de `routes/notifications.js` | **verificadas-e-sãs** | Idem, `Promise.all([`. Além disso herdam o lote de graça: quem faz o fan-out é `getStaleDeals`. |
| `routes/notifications.js`, `GET /resolved` (`notifiedDeals.map` → `getDealById`) | **fora-de-escopo-com-medição** | É o único outro `Promise.all(` de `backend/src` SEM colchete literal, ou seja, o terceiro fan-out proporcional ao dado. Fora do escopo aprovado; `try/catch` por item impede aborto; disparado por clique, não pelo cron. Dono: todo **`wr4-04b`**, a criar no 04-34. |

### O caminho de leitura do painel

| Construção | Classificação | Evidência |
|---|---|---|
| `GET /api/deals/stale`, `GET /api/reports`, `runCheckOnly` e as três rotas de notificações | **corrigidas por herança, MEDIDO** | **8** invocações de `getStaleDeals(` fora de `agendor.js`; o lote vive DENTRO dela, então as oito herdam sem nenhuma linha nas rotas. `git diff --name-only -- backend/src/` lista só `agendor.js`. |
| Auto-refresh do `DealsList.jsx` | **verificada-e-sã** | Nenhuma linha de `frontend/` no diff. O custo por atualização cai junto, sem mudança de frontend. |

### Os comentários gêmeos da construção alterada

| Construção | Classificação | Evidência |
|---|---|---|
| `// ... (batches de 10)` acima de `const batchSize = 5;` | **corrigida** | IN4-01. `grep -c "batches de 10"` = **0**; o comentário aponta para o identificador e não cita número. |
| Bloco de política de retry, parágrafo "três delas saem no MESMO `Promise.all` de runCheck" | **corrigida (acréscimo)** | 4 linhas novas registrando a borda com fan-out proporcional ao dado. Zero linhas existentes alteradas. |
| Mesmo bloco, parágrafo sobre a guarda de id fora do callback | **fora-de-escopo-com-medição** | IN4-02. `git diff -U0` = **0** ocorrências de `três vezes`. Dono: todo **`in4-02`**, a criar no 04-34. |
| Bloco do cache por execução ("o `Promise.all` abaixo percorre `uniqueOrgIds`") | **verificada-e-sã, com nota** | Ficou byte a byte por exigência do plano ("o cache por execução e o bloco de comentário que o explica" entre os intocáveis). A frase continua VERDADEIRA no essencial — `uniqueOrgIds` segue deduplicado antes de qualquer consulta, e a afirmação que ela sustenta ("uma chamada por organização única, nunca uma por deal") está asserida nos casos (1) e (2). O que mudou é que o `Promise.all` agora percorre FATIAS de `uniqueOrgIds`. Registrado aqui para não virar o próximo WR de "comentário que afirma mais do que o código entrega". |

## Divergências medidas (registradas, não forçadas)

### 1. `ORGS_UNICAS` NÃO é derivada de `LOTE_DE_ORGS` — é asserida contra ela

**O plano pedia:** *"importar `LOTE_DE_ORGS` e DERIVAR dele todos os números do teste"*.
**O que foi feito:** `LOTE_DE_ORGS` é importada e usada nas asserções, mas o tamanho da fixture é
`ORGS_UNICAS = 25` — o número que os próprios critérios de aceite do plano fixam (`totalOrganizacoes
=== 25`).

**Por quê, medido:** no instante do RED a constante **ainda não existe no módulo**, e o import
devolve `undefined`. Uma derivação (`LOTE_DE_ORGS * 2 + 5`) produziria `NaN`, `Array.from({length:
NaN})` daria zero negócios servidos, e os casos (2) e (3) ficariam vermelhos **por aritmética**, não
por defeito — destruindo justamente a observação que o plano exige ("(2) e (3) verdes já no estado
atual") e a medição de `maxEmVooOrganizacoes = 25`.

**A substituição é mais forte contra R4-17, não mais fraca.** O caso (1) assere explicitamente
`LOTE_DE_ORGS < ORGS_UNICAS` com a mensagem *"a fixture precisa ser maior que o teto, senão o caso
(1) fica vacuamente verde"*. Uma derivação faria a fixture crescer **em silêncio** junto com a
constante; a guarda fica **vermelha** e obriga quem mudar o teto a olhar para a fixture. Nenhum
literal `10` aparece no arquivo de teste.

### 2. Os greps de IN4-02 e IN4-05 devolvem 1, não 0 — e o motivo é o CONTEXTO do diff

**O plano previa:** `git diff backend/src/agendor.js | grep -c "três vezes"` = 0 e o mesmo para
`getDealsWithFutureTasks`.
**Medido com o comando literal do plano:** **1** e **1**.
**Causa:** `git diff` imprime 3 linhas de CONTEXTO em torno de cada hunk, e um cabeçalho de hunk
`@@ ... async function getDealsWithFutureTasks() {`. Nenhuma das duas ocorrências é uma linha
alterada:

- `git diff -U0 -- backend/src/agendor.js | grep -cE 'três vezes|getDealsWithFutureTasks'` = **0**
- filtrando só linhas `+`/`-`: **0** e **0**

**As duas conclusões sobrevivem por medição:** IN4-02 e IN4-05 continuam FORA do diff. Os dois
valores ficam registrados e o número do plano não foi forçado. Mesma classe da divergência nº 2 do
04-29 (**forma do padrão de grep**, não sub-termo errado) — sexta rodada da fase com divergência de
contagem.

### 3. Os "6 pontos de chamada" de `getStaleDeals` são **8** invocações

**O plano media:** *"6 pontos de chamada: `scheduler.js` (3), `routes/deals.js`, `routes/reports.js`,
`routes/notifications.js`"*.
**Medido:** `grep -rn 'getStaleDeals(' backend/src/ | grep -v agendor.js` (fora da declaração) = **8**
— o plano contou `routes/notifications.js` uma vez, mas ela invoca `getStaleDeals(staleDays)` em
**três** rotas distintas.

**A conclusão do inventário não só sobrevive como FICA MAIS FORTE:** são oito consumidores herdando
o lote de graça, não seis, e nenhuma linha de rota precisou mudar. Número do plano não forçado; os
dois valores ficam registrados.

### 4. `Promise.all` em `backend/src`: 11 não-comentário (bate), 16 linhas que casam (era 14)

O total não-comentário — o número que o inventário usa — está **exatamente em 11**, como o plano
corrigido previa. As linhas que casam o padrão subiram de 14 para **16** porque os comentários novos
deste plano mencionam `Promise.all` duas vezes (o do lote em `agendor.js` e o do arquivo de teste
não conta, por ser outro diretório). Menção em comentário, a mesma classe das quatro primeiras
divergências da fase; o número que importa não mudou.

## Deviations from Plan

Nenhuma Rule 1-4 acionada. Nenhum pacote instalado, `package.json` e lockfile intocados (T-04-30-SC
honrada). A divergência nº 1 acima é uma **decisão de instrumento tomada dentro da ação da Task 1**
(o plano prescreve derivação; a derivação é impossível no instante do RED) e está registrada com a
medição que a motiva. As nº 2, 3 e 4 são de **medição e de forma de observação**, não de escopo nem
de comportamento.

## Escopo que este plano NÃO fecha

- **IN4-02** (o parágrafo sobre a guarda de id fora do callback): fora do diff por critério,
  `-U0` = 0. Dono previsto no 04-34.
- **IN4-05** (o literal `100` duas vezes na paginação de `/tasks`): fora do diff, `-U0` = 0.
- **`wr4-04b`** — o fan-out gêmeo de `GET /api/notifications/resolved`: medido e classificado no
  inventário, sem conserto. É o terceiro `Promise.all` proporcional ao dado do backend, e a consulta
  que o alimenta (`getNotifiedDeals()`) não tem `LIMIT`.
- **Jitter e circuit breaker**: o achado WR4-04 os nomeia, e este plano entrega apenas o teto de
  concorrência. Acrescentá-los é decisão que o plano não abriu, e D-WR4-04-b exige medir antes.
- **O `console.log` legado** de `getDealsWithFutureTasks`: continua lá (LOG-01, Fase 5).
- **Os demais achados da r4** (WR4-06, WR4-07, WR4-02, WR4-03): planos 04-31 a 04-34.

## Atenção para quem seguir

`agendor.loteDeOrganizacoes.test.js` é o oráculo de **concorrência**, e a distinção importa: ele
falha se alguém "otimizar" o lote de volta para um `Promise.all` único, e continua verde se o total
de requisições mudar. Uma sexta borda com fan-out proporcional ao dado entra ali com o trio
completo — teto medido em voo, simétrico de resultado inalterado, e o irmão VERIFICADO.

A guarda de não-vacuidade do caso (1) (`LOTE_DE_ORGS < ORGS_UNICAS`) é deliberada e não deve ser
"simplificada" para uma derivação: ela existe para que um aumento do teto force uma decisão explícita
sobre a fixture em vez de silenciar o caso.

## Self-Check: PASSED

Arquivos:
- FOUND: `backend/src/agendor.js`
- FOUND: `backend/test/agendor.loteDeOrganizacoes.test.js`
- FOUND: `.planning/phases/04-confiabilidade-das-integra-es/04-30-SUMMARY.md`

Commits:
- FOUND: `adbe279` — test(04-30): RED
- FOUND: `531479e` — fix(04-30): GREEN

Estado da árvore: `git status --short` limpo antes deste SUMMARY; suíte 181/181; cobertura exit 0;
lint exit 0.
