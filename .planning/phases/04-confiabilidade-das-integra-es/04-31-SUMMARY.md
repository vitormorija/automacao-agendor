---
phase: 04-confiabilidade-das-integra-es
plan: 31
subsystem: notificacao
tags: [gap-closure-r4, wr4-06, previa, dashboard, oraculo-de-igualdade]
requires: [04-19, 04-20, 04-23, 04-28]
provides:
  - "seraNotificado: a prévia do envio marca, negócio a negócio, quem SERÁ notificado"
  - "Cenários F e G: o único par da suíte que compara a PRÉVIA com o ENVIO na mesma armação"
  - "O rótulo do botão de disparo conta destinatários, não negócios parados"
  - "in3-08 ALCANÇADO sem ser consertado: a prévia passa a EXIBIR o resultado de shouldNotifyOwner"
affects:
  - backend/src/scheduler.js
  - backend/test/scheduler.categoriaIndecidivel.test.js
  - frontend/src/components/Dashboard.jsx
tech-stack:
  added: []
  patterns:
    - "oráculo de IGUALDADE entre duas implementações da mesma regra, em vez de extrair um predicado compartilhado (refatoração estrutural proibida de se misturar a correção)"
    - "comparação pelo EFEITO IRREVERSÍVEL no banco (linha 'sent') em vez de por contador agregado"
    - "guarda de NÃO-VACUIDADE antes de toda asserção de igualdade entre conjuntos"
    - "fallback de campo novo no frontend quando a resposta anterior vem de localStorage"
key-files:
  created: []
  modified:
    - backend/src/scheduler.js
    - backend/test/scheduler.categoriaIndecidivel.test.js
    - frontend/src/components/Dashboard.jsx
decisions:
  - "D-WR4-06-a aplicada: MARCA, NÃO REMOVE — a lista da prévia continua completa"
  - "D-WR4-06-b aplicada: os QUATRO predicados, notificationsEnabled incluído de propósito"
  - "D-WR4-06-c aplicada: alreadyNotifiedToday consultada UMA vez por negócio (contagem 2, igual à entrada)"
  - "D-WR4-06-d aplicada: a divergência é pinada pelos cenários F e G, não por comentário"
  - "D-WR4-06-e aplicada: runCheckOnly() ANTES de runCheck() nos dois casos"
  - "D-WR4-06-f aplicada: fallback para total no frontend, por causa de dashboard_check_cache"
  - "D-WR4-06-g aplicada: o card e o toast continuam contando total"
  - "in3-08 NÃO tocado: alcançado por exibição, não por correção (decisão de direção reservada ao usuário)"
metrics:
  duration: ~40min
  tasks: 3
  files_created: 0
  files_modified: 3
  completed: 2026-08-05
---

# Phase 4 Plan 31: A Prévia do Envio Marca Quem Será Notificado Summary

O número que o operador lê **imediatamente antes de decidir disparar** deixou de prometer mais do
que o envio entrega: a prévia passou a marcar, negócio a negócio, quem será notificado — com os
mesmos quatro filtros da rodada real — e a divergência entre as duas implementações agora produz um
**vermelho**, não um comentário desatualizado.

## O achado, e por que ele é diferente dos outros da rodada

`runCheckOnly` aplicava **um** filtro (tarefas futuras); `runCheck` aplicava **quatro** guardas
antes do envio — dedup do dia, categoria indecidível, funil sem notificação ao responsável, e o
`else` de `notificationsEnabled && hasRecipient`. Nos outros achados da r4 o dano é um modo de
falha; aqui o dano é **uma decisão humana tomada com um número errado**: o consumidor não é uma
tabela decorativa, é o rótulo do botão de disparo, que renderizava literalmente
`Enviar notificações (${checkResult.total} negócios)`. A UI prometia `N` e o envio entregava
`N − (indecidíveis + Beefor + já notificados hoje)`.

O rótulo "superfície de visualização", com que o 04-20 justificou deixar `runCheckOnly` de fora,
descreve corretamente `GET /api/deals/stale` e `GET /api/reports`. Mas `POST /api/notifications/check`
responde a **outra pergunta** — *quem vai receber?* — e nela a resposta estava errada.

Medido na entrada: **0** casos sobre `runCheckOnly` em toda a suíte e **0** ocorrências de
`seraNotificado` no repositório.

## Task 1 — RED (commit `15f534a`)

### A previsão do plano bateu literalmente, nos dois casos

Saída literal da execução prescrita (`node --test test/scheduler.categoriaIndecidivel.test.js`):

```
ok 4 - D: 2 de 2 — a supressão TOTAL por categoria indecidível vira erro da rodada
ok 5 - E: SIMÉTRICO — 2 de 2 suprimidos por FUNIL não disparam o alarme de categoria
not ok 6 - F: a prévia concorda com o envio — o negócio de categoria indecidível vem marcado como não-notificável e PERMANECE na lista
  error: |-
    o negócio de categoria indecidível não pode ser prometido ao operador como destinatário
    + actual - expected
    + undefined
    - false
  code: 'ERR_ASSERTION'
not ok 7 - G: SIMÉTRICO por outro filtro — o negócio do funil Beefor também vem marcado como não-notificável, e a prévia continua concordando com o envio
  error: |-
    o negócio do funil que não notifica o responsável não pode ser prometido como destinatário
    + actual - expected
    + undefined
    - false
  code: 'ERR_ASSERTION'
# tests 7 | pass 5 | fail 2 | cancelled 0
```

Exatamente a previsão do plano: vermelhos na **primeira** asserção sobre o campo, com `undefined`
onde se espera `false`. A condição de PARAR (*"se algum ficar verde, o campo já existe por algum
caminho não medido"*) **não foi atingida**, e A a E ficaram verdes sem nenhum ajuste.

### O instrumento: igualdade entre conjuntos, medida no banco

O oráculo destes dois casos não é o valor de um campo isolado — é a **igualdade** entre o conjunto
de ids que a prévia promete e o conjunto que o envio de fato notificou. Os dois helpers novos:

- `idsPrometidosPelaPrevia(previa)` — ids com `seraNotificado` verdadeiro, ordenados.
- `idsNotificadosDeFato(resultado)` — ids cujo `notification_log` tem linha com status `'sent'`.

A comparação é feita sobre o **efeito irreversível registrado no banco**, e não sobre `r.notified`:
aquele é um contador, diz QUANTOS e nunca QUAIS. Dois conjuntos de mesmo tamanho e conteúdo trocado
passariam por um contador sem produzir vermelho nenhum — e é exatamente essa divergência que os
casos existem para pegar.

**Guarda de NÃO-VACUIDADE em cada caso.** Antes da igualdade, o conjunto prometido é asserido contra
`[segundo]`. Sem ela, dois conjuntos vazios satisfariam a comparação e o caso ficaria verde numa
implementação que não prometesse ninguém. Mesma classe da guarda de não-vacuidade do 04-30.

**A ordem das chamadas é obrigatória** (D-WR4-06-e): `runCheckOnly()` antes de `runCheck()`, porque
a prévia é somente leitura e o envio grava. Invertida, a linha `'sent'` mudaria a resposta da dedup
DENTRO da prévia e o oráculo passaria a medir o rastro do próprio teste.

### O simétrico é de FILTRO, não de posição — e é ele que fecha o achado

`F` cobre a categoria indecidível (o filtro introduzido pelo 04-20, o filtro do achado); `G` cobre o
funil Beefor, **anterior ao 04-20**. Sem o `G`, um conserto que tratasse exclusivamente
`categoriaIndecidivel` ficaria verde e a prévia continuaria mentindo pelo funil, com o botão
escrevendo um número maior do que o envio entrega.

`servirDealsDoFunilBeefor` ganhou um terceiro parâmetro **opcional** (o conjunto de ids que vão para
o Beefor). Omitido, o efeito é byte a byte o que o cenário E usa — E ficou verde sem edição.

### Critérios de aceite da Task 1

| Critério | Esperado | Medido |
|---|---|---|
| `node --test` sai != 0, com F e G vermelhos | sim | **sim** |
| `grep -c "^test("` | 7 | **7** |
| Asserções existentes removidas/alteradas (`-U0`) | 0 | **0** (e **0** também com `git diff` padrão) |
| `grep -c "runCheckOnly"` no arquivo de teste | ≥ 3 | **6** |
| `grep -ci "simétrico"` | ≥ 3 | **12** |
| `grep -cE "\.js:[0-9]+"` (referência por linha) | 0 | **0** |
| `git diff --name-only backend/src/ frontend/src/` | vazio | **vazio** |
| Linhas do arquivo | ≥ 550 | **760** |

## Task 2 — GREEN (commit `1b82e39`)

Todas as mudanças vivem **dentro de `runCheckOnly`**. O diff não-comentário cabe aqui:

```
+  const notifyAuthor = getConfig('notify_author') !== 'false';
+  const notificationsEnabled = getConfig('notifications_enabled') === 'true';
-    .map((deal) => ({
-      ...deal,
-      ownerEmail: users[deal.ownerId]?.email || null,
-      authorEmail: users[deal.authorId]?.email || null,
-      alreadyNotifiedToday: alreadyNotifiedToday(deal.id),
-    }));
+    .map((deal) => {
+      const ownerEmail = users[deal.ownerId]?.email || null;
+      const authorEmail = notifyAuthor ? users[deal.authorId]?.email || null : null;
+      const jaNotificadoHoje = alreadyNotifiedToday(deal.id);
+      return {
+        ...deal,
+        ownerEmail,
+        authorEmail,
+        alreadyNotifiedToday: jaNotificadoHoje,
+        seraNotificado:
+          !deal.categoriaIndecidivel &&
+          shouldNotifyOwner(deal) &&
+          !jaNotificadoHoje &&
+          Boolean(ownerEmail || authorEmail) &&
+          notificationsEnabled,
+      };
+    });
```

**(a) Os quatro predicados, não três** (D-WR4-06-b). `notificationsEnabled` entra de propósito: a
pergunta que o botão faz é *"quantos vão receber se eu clicar AGORA"*, e com as notificações
desligadas a resposta honesta é zero. `notify_author` também é lido, para que o e-mail do autor
signifique na prévia o mesmo que na rodada real — com ele desligado, o autor não é destinatário e
não pode contar como "existe alguém para receber".

**(b) A dedup é paga uma vez** (D-WR4-06-c). O valor de `alreadyNotifiedToday(deal.id)` vai para uma
variável e alimenta os DOIS campos. Medido: a contagem não-comentário continua em **2** — a de
`runCheck` e a única de `runCheckOnly` —, o mesmo valor de entrada. Duas chamadas dobrariam as
consultas do caminho de leitura do painel sem nenhum ganho (T-04-31-03).

**(c) Marca, não remove** (D-WR4-06-a). O `.filter` continua sendo só o de tarefas futuras
(`futureTasks.has(deal.id)` não-comentário = **1**). É a metade "permanece no painel" da decisão do
usuário, e é ela que dá sentido ao `total` que o card exibe.

**(d) O comentário registra a duplicação e aponta o guarda-corpo.** Ele diz por extenso que os
predicados são os mesmos quatro de `runCheck`, que a duplicação é deliberada — extrair um predicado
compartilhado seria refatoração estrutural da cadeia de guardas, no caminho do Core Value, e a
constraint de processo do CLAUDE.md proíbe misturá-la a uma correção —, e que **o guarda-corpo não é
o comentário, e sim os cenários F e G**. O comentário não reproduz o identificador do campo, de
propósito, para que a contagem não-comentário permaneça mensurável.

### Critérios de aceite da Task 2

| Critério | Esperado | Medido |
|---|---|---|
| `node --test test/scheduler.categoriaIndecidivel.test.js` | 7 verdes, exit 0 | **7/7, exit 0** |
| `seraNotificado` não-comentário em `scheduler.js` | 1 | **1** (e **1** no arquivo inteiro) |
| `alreadyNotifiedToday(deal.id)` não-comentário | 2 | **2** (entrada = 2) |
| `git diff backend/src/scheduler.js \| grep -c "results\."` | 0 | **0** — comando LITERAL do plano |
| `futureTasks.has(deal.id)` não-comentário | 1 | **1** |
| Os seis arquivos vizinhos, sem edição | exit 0 | **28/28, exit 0**; `git diff --name-only -- backend/test/` **vazio** |
| `npm run test:coverage` | exit 0 | **exit 0** |
| `npm run lint` (backend) | exit 0 | **exit 0** (44 warnings, baseline) |
| `git diff --name-only -- backend/src/` | só `scheduler.js` | **só `scheduler.js`** |

**Invariantes de `scheduler.js` medidas e NÃO regredidas** (as que o contexto de execução manda
vigiar): `catch (erroDeRegistro)` = **1**; `results.notified++` não-comentário = **2**; `continue;`
não-comentário = **3**; `skipReason` não-comentário = **3**; `skippedCategoriaIndecidivel`
não-comentário = **3**. `runCheck` ficou byte a byte — e desta vez o `grep -c "results\."` sobre o
`git diff` **padrão** já devolveu 0, sem precisar de `-U0` (ao contrário do 04-30, cujo contexto de
diff produzia falso positivo).

### Suíte e cobertura

- **181 → 183** testes, todos verdes (os 2 novos são F e G).
- `scheduler.js`: 85,93 % statements / 77,77 % branches / 85,93 % linhas. Cobertura exit **0**.
- Os **seis** arquivos vizinhos verdes SEM edição (28 casos): `notificationStatus`,
  `notificationStatus.partialFailure`, `notificationStatus.canalParcial`,
  `notificationStatus.registroResiliente`, `scheduler.failsafe`, `scheduler.resilience`.

## Task 3 — o botão do painel conta destinatários (commit `ca05995`)

```jsx
const aNotificarCount = !checkResult
  ? 0
  : checkResult.deals?.some((d) => d.seraNotificado !== undefined)
    ? checkResult.deals.filter((d) => d.seraNotificado).length
    : checkResult.total;
```

E o rótulo passou de `Enviar notificações (${checkResult.total} negócios)` para
`Enviar notificações (${aNotificarCount} a notificar)` — o texto mudou junto com o número, porque
manter a palavra "negócios" com um número de destinatários seria trocar uma mentira por outra.

**O fallback não é zelo decorativo** (D-WR4-06-f, T-04-31-05). A resposta anterior é persistida em
`localStorage` sob `dashboard_check_cache` e restaurada ao montar o componente; logo após o deploy o
painel pode renderizar uma resposta de backend antigo, sem o campo. Sem fallback o botão diria
**zero** com a lista cheia, e o operador concluiria que não há ninguém a notificar.

O card `N negócio(s) parado(s) encontrado(s)` e o toast de `checkOnly` continuam contando `total`
(D-WR4-06-g): respondem "quantos estão parados", que é outra pergunta.

### Critérios de aceite da Task 3

| Critério | Esperado | Medido |
|---|---|---|
| `cd frontend && npm run build` | exit 0 | **exit 0** |
| `cd frontend && npm run lint` | exit 0 | **exit 0** (60 warnings, exatamente o baseline) |
| `grep -c "seraNotificado"` no `Dashboard.jsx` | ≥ 2 | **2** |
| `grep -c "checkResult.total"` no `Dashboard.jsx` | 2 | **2** (ver Divergências nº 1) |
| `git diff --name-only -- frontend/src/` | só `Dashboard.jsx` | **só `Dashboard.jsx`** |
| `git diff --name-only -- backend/` nesta task | vazio | **vazio** |
| Referência por número de linha no componente | 0 | **0** |

## Inventário de irmãos — construções gêmeas de "superfície que anuncia quem será notificado"

### As três superfícies que listam negócios parados

| Superfície | Classificação | Evidência medida |
|---|---|---|
| `POST /api/notifications/check` (`runCheckOnly`) | **corrigida** | É a única que responde "quem vai receber" e a única que alimenta um botão de disparo. Cenários F e G verdes. |
| `GET /api/deals/stale` (`routes/deals.js` → `DealsList.jsx`) | **verificada-e-sã POR MEDIÇÃO** | `grep -c "notifications/run\|notifications/check" frontend/src/components/DealsList.jsx` = **0**: a tela não tem botão de disparo, e portanto não anuncia envio nenhum. Ver a Divergência nº 2 sobre a medição original. |
| `GET /api/reports` (`routes/reports.js` → `ReportPanel.jsx`) | **verificada-e-sã POR MEDIÇÃO** | Idem: **0** chamadas de disparo e **0** ocorrências de "notificar" no componente. Agregações para gráfico. |

### Os quatro filtros de `runCheck` (medido: 4 guardas antes do envio; `continue;` não-comentário = 3, mais o ramo `else`)

| Filtro | Classificação | Evidência medida |
|---|---|---|
| dedup do dia | **corrigido** | Já era calculado na prévia mas não entrava em nenhuma decisão exibida; agora compõe o campo, reusando a MESMA chamada. |
| categoria indecidível | **corrigido** | É o filtro do achado. Cenário F. |
| funil sem notificação (Beefor) | **corrigido** | Pré-existente ao 04-20 e igualmente ausente da prévia. Cenário G. |
| destinatário e notificações habilitadas | **corrigido** | O quarto ramo (D-WR4-06-b). Coberto indiretamente: `notificationsEnabled` verdadeiro nos dois casos, e o par de destinatários distintos é pré-condição da armação. |
| Um quinto filtro | **inexistente, medido** | `continue;` não-comentário = **3**, mais o ramo `else`; não há outra saída antes do bloco de envio. |

### Os dois consumidores do número

| Consumidor | Classificação | Evidência medida |
|---|---|---|
| Rótulo do botão de envio no `Dashboard.jsx` | **corrigido** | Passa a contar `seraNotificado`, com fallback. |
| Card "N negócio(s) parado(s) encontrado(s)" e toast de `checkOnly` | **verificados-e-sãos** | Contam `total` e continuam contando (D-WR4-06-g). O toast usa `result.total`, do payload cru da rota. |

### O filtro de elegibilidade que o inventário alcança e este plano NÃO fecha

| Construção | Classificação | Evidência medida |
|---|---|---|
| `shouldNotifyOwner` transformando funil ausente em string vazia e portanto NOTIFICANDO | **fora-de-escopo-com-medição, dono já existente** | `backend/src/agendor.js` **ausente do diff** dos três commits. Este plano o ALCANÇA — a prévia passou a EXIBIR o resultado de `shouldNotifyOwner`, tornando o efeito visível no painel — mas não o corrige: consertá-lo mudaria QUEM RECEBE, está pinado como quirk em `agendor.funnel.test.js`, e a pergunta central é de DIREÇÃO (fail-open ou fail-safe para os filtros de elegibilidade), reservada ao usuário. Dono: `.planning/todos/pending/in3-08-filtros-de-elegibilidade-fail-open.md`, prioridade alta, **não editado**. |

## Divergências medidas (registradas, não forçadas)

### 1. `grep -c "checkResult.total"` dá 2 como previsto, mas por COMPOSIÇÃO diferente

**O plano previa:** 2, *"o card e o toast"*.
**Medido:** **2** — mas as duas ocorrências são o **card** e o **fallback novo**. O toast usa
`result.total` (a variável local da resposta), sem o prefixo `checkResult`, e portanto **não casa**
o padrão. O padrão também não casa `checkResult?.total` da linha de `staleCount`, porque exige
exatamente um caractere entre `checkResult` e `total`.

**Consequência para o critério:** o número bate e a conclusão que ele sustenta — *"o rótulo do botão
deixou de usá-lo"* — é verdadeira e verificável na leitura do arquivo. O que não se sustenta é a
justificativa escrita do número. Registrado para que ninguém "conserte" o toast achando que o
critério o cobria. Sétima rodada da fase com divergência de contagem; classe NOVA: **número certo,
composição errada**.

### 2. A palavra "notificar" APARECE no `DealsList.jsx` — e a classificação sobrevive por outra medição

**O plano media:** *"nenhum texto desta tela usa a palavra 'notificar' para prometer envio"*.
**Medido:** a palavra aparece **uma vez**, em `N com tarefa agendada (sem notificação)`.

**Por que a classificação verificada-e-sã sobrevive, e mais forte:** a frase **declara uma exclusão**
em vez de prometer um envio — e a exclusão declarada é justamente a de tarefas futuras, o **único**
filtro que a prévia já aplicava corretamente antes deste plano. Ou seja, a única frase da tela que
fala de notificação está factualmente certa. A medição substituta é mais decisiva do que a original:
`grep -c "notifications/run\|notifications/check"` = **0** tanto em `DealsList.jsx` quanto em
`ReportPanel.jsx` — nenhuma das duas telas tem botão de disparo, e portanto nenhuma delas escreve um
número que anteceda a decisão de enviar.

## Deviations from Plan

Nenhuma Rule 1-4 acionada. Nenhum pacote instalado; `package.json` e lockfiles intocados (T-04-31-SC
honrada). As duas divergências acima são de **medição e de justificativa de medição**, não de escopo
nem de comportamento.

Uma escolha tomada dentro da ação e registrada: o comentário de `runCheckOnly` **não reproduz** o
identificador `seraNotificado`, para que a contagem não-comentário do critério de aceite permaneça
mensurável independentemente do suporte a `\s` no `grep` da plataforma (BSD vs GNU). As duas formas
do padrão foram medidas e devolveram **1** nas duas.

## Threat Flags

Nenhuma. As mudanças não introduzem endpoint, caminho de autenticação, acesso a arquivo nem alteração
de schema. `backend/src/routes/notifications.js` não foi tocado — o campo novo viaja dentro de
`deals`, que a rota já repassava sem transformar (`res.json({ total: deals.length, deals })`).

## Escopo que este plano NÃO fecha

- **`in3-08`** (`shouldNotifyOwner` fail-open com funil ausente): alcançado por exibição, não por
  correção. Dono existente, prioridade alta, arquivo não editado. Exige decisão de direção do
  usuário.
- **`cr4-01c`** (o `skipReason` invisível na UI): este plano exibe *se* o negócio será notificado, não
  *por quê* não será. `grep -rn "skipReason" frontend/src` continua em **0**. Dono previsto no 04-34.
- **`GET /api/deals/stale` e `GET /api/reports`**: nenhuma linha, por decisão. Continuam sem marcação
  de envio, e o inventário registra por que isso está correto.
- **Os demais achados da r4** (WR4-07, WR4-02, WR4-03 e os IN4-*): planos 04-32 a 04-34.

## Atenção para quem seguir

Os cenários **F e G são o único lugar da suíte que compara a PRÉVIA com o ENVIO**. Quem acrescentar
uma quinta guarda a `runCheck` e não acrescentar o predicado correspondente a `runCheckOnly` deixa os
dois vermelhos — e essa é exatamente a função deles. A guarda de não-vacuidade (`prometidos` asserido
contra `[segundo]`) não deve ser "simplificada" para uma comparação direta dos dois conjuntos: sem
ela, uma implementação que não prometesse ninguém passaria. E a ordem das duas chamadas
(`runCheckOnly()` antes de `runCheck()`) é parte do instrumento, não estilo.

O terceiro parâmetro de `servirDealsDoFunilBeefor` é **opcional por necessidade**: omitido, ele
reproduz o comportamento que o cenário E depende (os dois negócios no Beefor). Quem mudar o default
quebra o E.

## Self-Check: PASSED

Arquivos:
- FOUND: `backend/src/scheduler.js`
- FOUND: `backend/test/scheduler.categoriaIndecidivel.test.js`
- FOUND: `frontend/src/components/Dashboard.jsx`
- FOUND: `.planning/phases/04-confiabilidade-das-integra-es/04-31-SUMMARY.md`

Commits:
- FOUND: `15f534a` — test(04-31): RED
- FOUND: `1b82e39` — fix(04-31): GREEN
- FOUND: `ca05995` — fix(04-31): frontend

Estado da árvore: `git status --short` limpo antes deste SUMMARY; suíte 183/183; cobertura exit 0;
lint exit 0 no backend e no frontend; `npm run build` exit 0.
