---
phase: 04-confiabilidade-das-integra-es
plan: 32
subsystem: notificacao
tags: [gap-closure-r4, wr4-07, resumo-semanal, custo-agregado, guarda-de-nome]
requires: [04-19, 04-20, 04-21, 04-24]
provides:
  - "O rótulo do relatório individual resolve pela MELHOR FONTE: negócio, depois cadastro, depois rótulo neutro"
  - "Cenário (6): o único caso da suíte que mede o custo AGREGADO de uma exceção montada fora do try/catch do envio"
  - "Asserções sobre a AUSÊNCIA de `undefined` e `null` no corpo enviado, não sobre contagem"
  - "Guarda de defesa em profundidade em ownerWeeklyHtml, declarada sem caso dedicado"
affects:
  - backend/src/emailer.js
  - backend/test/emailer.resumoIndecidivel.test.js
tech-stack:
  added: []
  patterns:
    - "encadeamento de fallbacks que PREFERE a melhor fonte (cadastro) em vez de só evitar a exceção"
    - "oráculo sobre o CORPO ENVIADO (ausência de `undefined`/`null`) em vez de contagem de envios"
    - "caso AGREGADO com o item defeituoso em PRIMEIRO lugar na ordem de agrupamento"
    - "sonda temporária, medida e apagada, para quantificar o estado defeituoso"
key-files:
  created: []
  modified:
    - backend/src/emailer.js
    - backend/test/emailer.resumoIndecidivel.test.js
decisions:
  - "D-WR4-07-a aplicada: guarda no template como defesa em profundidade"
  - "D-WR4-07-b aplicada: o rótulo prefere o nome do CADASTRO (users[d.ownerId]?.name) ao rótulo neutro"
  - "D-WR4-07-c aplicada e DECLARADA no código: a guarda do template não ganha caso dedicado, com motivo e precedente (D-WR3-03-b, 04-24)"
  - "D-WR4-07-d aplicada: o caso (6) é AGREGADO e o sem-nome vem PRIMEIRO — a ordem é instrumento"
  - "D-WR4-07-e aplicada: a asserção é sobre o HTML, não sobre a contagem"
  - "wr4-07b NÃO fechado de carona: dealEmailHtml ausente do diff, dono no 04-34"
  - "agendor.js intocado: produzir ownerName null explícito é deliberado"
metrics:
  duration: ~35min
  tasks: 2
  files_created: 0
  files_modified: 2
  completed: 2026-08-05
---

# Phase 4 Plan 32: Um Responsável Sem Nome Deixa de Derrubar o Resumo Semanal Inteiro Summary

O rótulo do relatório individual passou a resolver pela **melhor fonte disponível** — o nome do
negócio, depois o nome do **cadastro**, depois um rótulo neutro — e um responsável sem nome deixou
de custar o relatório semanal de **todos** os comerciais.

## O achado, e por que o dano não é proporcional à causa

`getStaleDeals` produz `ownerName: null` **explícito** quando o payload da borda traz `owner` sem
`name`. Esse nulo atravessava `sendOwnerWeeklySummary` intacto — o agrupamento decide QUEM recebe
por `users[d.ownerId]?.email`, mas guardava `d.ownerName` como rótulo — e chegava ao `split` de
`ownerWeeklyHtml`.

O custo não era um e-mail perdido. O template é montado **dentro** do laço de destinatários e
**antes** do `try/catch` que envolve o `sendMail`, então a exceção saía de `sendOwnerWeeklySummary`,
subia até o `catch` de `runWeeklySummary` e encerrava o resumo semanal inteiro. O único vestígio era
uma linha genérica de log.

A assimetria que confirma descuido e não decisão estava medida no plano e reconfirmada aqui: a rota
`POST /test-owner-summary` já protege o mesmo campo com `ownerName || d.ownerName || 'Comercial
Teste'`. O caminho de produção não protegia nada.

## Task 1 — RED (commit `3f38b6a`)

### A previsão do plano bateu literalmente nos três casos

```
ok 4 - (4) os dois filtros compõem: funil Beefor e categoria indecidível somam, não se substituem
not ok 5 - (5) responsável sem nome no negócio, mas com nome no cadastro: o rótulo resolve pelo cadastro
  error: "Cannot read properties of null (reading 'split')"
  name: 'TypeError'
  stack: |-
    ownerWeeklyHtml (backend/src/emailer.js)
    sendOwnerWeeklySummary (backend/src/emailer.js)
not ok 6 - (6) AGREGADO — um responsável sem nome não pode custar o relatório de TODOS os outros
  error: "Cannot read properties of null (reading 'split')"
not ok 7 - (7) nem no negócio, nem no cadastro: o envio acontece com um rótulo neutro
  error: "Cannot read properties of null (reading 'split')"
# tests 7 | pass 4 | fail 3 | cancelled 0
```

Os casos (1) a (4) ficaram verdes sem nenhum ajuste — a condição de PARAR (*"a extensão da armação
afetou a política"*) **não foi atingida**. Acrescentar os ids 12 e 13 a `USERS` não muda nada nos
casos antigos: todos referenciam exclusivamente o id 11, e o agrupamento só consulta o dicionário
pelo `ownerId` de negócios que estão na lista.

### O custo agregado foi MEDIDO, não presumido

O plano exige o valor literal de `enviosCapturados.length` do caso (6) no estado defeituoso. Como a
exceção escapa **antes** de qualquer asserção, o valor não aparece na saída do runner. Foi medido por
uma **sonda temporária** (`backend/test/__probe_wr4_07.js`, criada, executada e **apagada** antes do
commit — `git status --short` confirmou a árvore limpa em `backend/test/`):

```
MEDIDO enviosCapturados.length = 0
MEDIDO destinatarios = []
MEDIDO erro = TypeError: Cannot read properties of null (reading 'split')
```

**Zero de dois.** O responsável 11, que não tem defeito nenhum, não recebia nada por causa do 12.
Esse é o número que quantifica o achado: não "um e-mail perdido", e sim "nenhum e-mail enviado".

### A ordem do caso (6) é instrumento, não estilo

`Object.entries(byOwner)` segue a ordem de inserção, que é a ordem da lista de negócios notificáveis.
Com o sem-nome em **segundo** lugar, o primeiro grupo já teria sido enviado antes da exceção e o caso
ficaria **verde com o defeito presente** (R4-26). Por isso o sem-nome vem primeiro, e está escrito no
comentário do caso.

### A asserção é sobre o corpo enviado

Os três casos usam `assertHtmlSemNuloNoNome`, que exige a ausência das strings `undefined` e `null`
no HTML, além do nome esperado. Um conserto que apenas evitasse a exceção e imprimisse
"Olá, undefined!" passaria por qualquer asserção de quantidade (R4-25, D-WR4-07-e). Medido antes de
escrever: o template de `ownerWeeklyHtml` não contém nenhuma dessas strings por conta própria, nem a
palavra `Comercial` — as três asserções são não-vacuosas.

### Critérios de aceite da Task 1

| Critério | Esperado | Medido |
|---|---|---|
| `node --test` sai != 0, com (5),(6),(7) vermelhos e (1) a (4) verdes | sim | **sim** (pass 4 / fail 3) |
| `grep -c "^test("` | 7 | **7** |
| Asserções existentes removidas/alteradas (`-U0`) | 0 | **0** (e **0** também no diff padrão) |
| `grep -cE "\.js:[0-9]+"` (referência por linha) | 0 | **0** |
| `git diff --name-only backend/src/` | vazio | **vazio** |
| Linhas do arquivo (`min_lines: 280`) | ≥ 280 | **343** |

## Task 2 — GREEN (commit `5fd6be8`)

O diff não-comentário cabe aqui inteiro:

```
-  const firstName = ownerName.split(' ')[0];
+  const firstName = (ownerName || 'Comercial').split(' ')[0];
-      byOwner[owner.email] = { name: d.ownerName, deals: [] };
+      byOwner[owner.email] = {
+        name: d.ownerName || users[d.ownerId]?.name || 'Comercial',
+        deals: [],
+      };
```

**(a) A guarda da fonte é o conserto de verdade.** O dicionário de `getUsers` tem o nome cadastrado
mesmo quando o negócio não tem. Preferir essa fonte é diferente de só evitar a exceção: sem ela, o
comercial receberia uma saudação genérica com o nome dele disponível a um `?.name` de distância.
A decisão de **quem recebe** continua vindo de `owner?.email` — byte a byte.

**(b) A guarda do template é defesa em profundidade**, e está **declarada** no comentário como tal,
com o motivo escrito (o outro chamador já guarda o campo; pinar exigiria um seam novo num módulo que
não exporta a função) e o precedente nomeado (D-WR3-03-b, 04-24). Não ganhou caso dedicado, e isso
não é esquecimento — é D-WR4-07-c.

**(c) O rótulo neutro é `Comercial`**, e não `Sem responsável`. A razão é o próprio consumidor: o
valor alimenta `firstName`, e `'Sem responsável'` produziria a saudação "Olá, **Sem**!". `Comercial`
lê bem na saudação e converge com a convenção da rota de teste (`'Comercial Teste'`).

### Critérios de aceite da Task 2

| Critério | Esperado | Medido |
|---|---|---|
| `node --test test/emailer.resumoIndecidivel.test.js` | 7 verdes, exit 0 | **7/7, exit 0** |
| `ownerName.split(` não-comentário | 0 | **0** |
| `\.split(` não-comentário | 1 | **1** |
| `users\[d.ownerId\]?.name` não-comentário | 1 | **1** |
| `git diff ... \| grep -c "dealEmailHtml"` | 0 | **0** |
| `git diff ... \| grep -c "categoriaIndecidivel"` | 0 | **0** |
| `git diff ... \| grep -c "skippedByFunnel"` | 0 | **0** |
| Diff de código não-comentário | ≤ 4 | **5 adicionadas / 2 removidas** — ver Divergências nº 2 |
| Os cinco vizinhos, sem edição | exit 0 | **21/21, exit 0**; `git diff --name-only -- backend/test/` **vazio** |
| `npm run test:coverage` | exit 0 | **exit 0** — 183 → **186** |
| `npm run lint` | exit 0 | **exit 0** (44 warnings, baseline) |
| `git diff --name-only -- backend/src/` | só `emailer.js` | **só `emailer.js`** |

### Suíte e cobertura

- **183 → 186** testes, todos verdes (os 3 novos são os cenários 5, 6 e 7).
- `emailer.js`: 89,78 % statements / 63,7 % branches / 94,11 % funcs / 89,78 % linhas.
- Cobertura exit **0**; lint exit **0** com os mesmos 44 warnings do baseline.

## Inventário de irmãos — "campo de nome que pode ser nulo chegando a e-mail"

### Dentro de `emailer.js`

| Construção | Classificação | Evidência medida |
|---|---|---|
| `ownerWeeklyHtml`: o `split` sobre `ownerName` | **corrigida** | Única desreferência do módulo. `ownerName.split(` não-comentário = **0**; `\.split(` não-comentário continua = **1**. |
| `sendOwnerWeeklySummary`: o rótulo do agrupamento | **corrigida** | É a fonte que alimentava a desreferência. Cenários 5, 6 e 7 verdes. |
| `buildOwnerBlocks`: `d.ownerName \|\| 'Sem responsável'` | **verificada-e-sã** | Já guardado; ausente do diff. |
| `dealEmailHtml`: interpola `ownerName` em duas saudações, sem guarda | **fora-de-escopo-com-medição** | São INTERPOLAÇÕES, não desreferências: com `null` produzem "Olá, null!" no e-mail diário — feio, não lança e não custa o envio de ninguém. Consertá-lo muda o TEXTO de um e-mail real no caminho do Core Value e precisa do próprio caso. `git diff \| grep -c "dealEmailHtml"` = **0**. Dono: todo **`wr4-07b`**, criado no 04-34. |
| `sendStaleNotification`: passa `deal.ownerName` e `deal.authorName` | **fora-de-escopo-com-medição** | É o ponto de chamada do item acima, não uma construção separada. Ausente do diff. |

### Fora de `emailer.js`

| Construção | Classificação | Evidência medida |
|---|---|---|
| `runWeeklySummary` (`scheduler.js`): `d.ownerName \|\| 'Sem responsável'` no snapshot | **verificada-e-sã** | Guardado; `scheduler.js` ausente do diff. |
| `runCheck` (`scheduler.js`): `dealResult.ownerName` e `logNotification({ owner_name })` | **verificadas-e-sãs** | Apenas transportam o valor; nenhuma desreferência, e a coluna do banco aceita nulo. |
| `POST /test-owner-summary`: `ownerName \|\| d.ownerName \|\| 'Comercial Teste'` | **verificada-e-sã** | É a assimetria que o achado usa como prova. `routes/notifications.js` ausente do diff. |
| `agendor.js`: `ownerName: deal.owner?.name \|\| null` | **verificada-e-sã e DELIBERADA** | Ausente do diff (R4-27). Mudar a FONTE esconderia o dado ausente do painel, dos relatórios e do snapshot — três superfícies — para consertar um template. |

### Os campos irmãos do mesmo objeto

| Construção | Classificação | Evidência medida |
|---|---|---|
| `authorName`, `organization`, `funnel`, `stage`, `title`, `webUrl` | **verificadas-e-sãs** | Em `ownerWeeklyHtml`, `organization`, `funnel` e `stage` já aparecem guardados com travessão; `title` e `webUrl` são interpolados, não desreferenciados. Não existe outra desreferência de campo de texto do negócio nos templates — medido pela **única** ocorrência de `.split(` no módulo. |

## Divergências medidas (registradas, não forçadas)

### 1. O baseline dizia 8 ocorrências de `ownerName`; são **11**, em **10** linhas

**O plano media:** *"Total de ocorrências do identificador: 8"*.
**Medido:** `grep -o 'ownerName' | wc -l` = **11**; `grep -c` = **10** linhas. A diferença vem das
linhas que contêm o identificador **duas vezes** (`ownerName: deal.ownerName` e
`ownerName: deal.authorName` em `sendStaleNotification`), e de `grep -c` contar linhas e não
ocorrências.

**Consequência:** nenhuma. A conclusão que o número sustenta — **uma** única desreferência no módulo
— é medida por outro comando (`.split(` não-comentário = 1) e sobrevive intacta. Registrado para que
ninguém "reconcilie" o inventário com o número errado.

### 2. O teto de 4 linhas não-comentário ficou em **5 adicionadas / 2 removidas**

**O plano previa:** *"o diff de código não passa de 4 linhas não-comentário (as duas mudanças, mais o
que o Biome reformatar)"*.
**Medido:** **5** linhas adicionadas e **2** removidas.

**Por quê:** as mudanças **semânticas** são exatamente **duas**, como previsto. O encadeamento
`d.ownerName || users[d.ownerId]?.name || 'Comercial'` passou das 80 colunas do `biome.json`, e o
Biome quebrou o literal de objeto de uma linha em quatro. O próprio plano já antecipava "mais o que o
Biome reformatar" — o que não coube foi o teto numérico, não a intenção. O número **não foi forçado**:
espremer a expressão numa linha só exigiria abreviar o encadeamento ou desligar o formatador.

**Oitava rodada da fase com divergência de contagem.** Esta é da mesma classe da nº 2 do 04-29
(reformatação do Biome alterando a forma medida), não de escopo nem de comportamento.

## Deviations from Plan

Nenhuma Rule 1-4 acionada. Nenhum pacote instalado; `package.json` e lockfiles intocados (T-04-32-SC
honrada). As duas divergências acima são de **medição**, não de escopo.

Uma escolha tomada dentro da ação e registrada: o **rótulo neutro** é `'Comercial'` e não
`'Sem responsável'` (a forma usada por `buildOwnerBlocks` e por `runWeeklySummary`), porque aqui o
valor alimenta o **primeiro nome da saudação** e a forma do módulo produziria "Olá, Sem!". Medido
antes de escolher: a palavra `Comercial` não ocorre no template, então a asserção do cenário (7) é
não-vacuosa.

Uma segunda escolha registrada: o fallback foi escrito como `users[d.ownerId]?.name` — a forma
literal de D-WR4-07-b — e não como `owner.name`, embora `owner` já esteja resolvido uma linha acima e
seja comprovadamente não-nulo naquele ponto (o `if (!owner?.email) continue;` o garante). A forma
literal é auto-contida: sobrevive a um reordenamento futuro que mova a linha para antes da guarda.

## Threat Flags

Nenhuma. As mudanças não introduzem endpoint, caminho de autenticação, acesso a arquivo nem alteração
de schema. Nenhum objeto de opções do transporte é impresso ou comparado — o stub continua lendo
exclusivamente `to` e `html` (PC-13, T-04-32-04).

## Escopo que este plano NÃO fecha

- **`wr4-07b`** (`dealEmailHtml` interpolando nome nulo no e-mail **diário**): classificado
  fora-de-escopo-com-medição, ausente do diff, dono a criar no 04-34. É interpolação, não
  desreferência: produz "Olá, null!" e não custa o envio de ninguém.
- **`agendor.js`**: nenhuma linha, por decisão. `ownerName: null` explícito é deliberado.
- **A política de CR3-01**: nenhuma linha. `sendWeeklySummary` continua **não** filtrando o negócio
  indecidível de propósito, e o cenário (3) segue sendo o oráculo disso.
- **Os demais achados da r4** (WR4-02, WR4-03 e os IN4-*): planos 04-33 e 04-34.

## Atenção para quem seguir

O cenário **(6) é o único lugar da suíte que mede o custo AGREGADO** de uma exceção montada fora do
`try/catch` do envio. Quem inverter a ordem dos dois negócios o deixa verde **com o defeito
presente** — a ordem é parte do instrumento. E `assertHtmlSemNuloNoNome` não deve ser "simplificada"
para uma contagem de envios: é ela que separa "não lança" de "não mente".

O parâmetro `ownerName` de `negocio(...)` distingue `undefined` (cai no padrão) de `null` (vai
intacto). Trocar a comparação explícita por `ownerName || 'Fulana Silva'` apagaria os três cenários
novos sem produzir um único vermelho.

## Self-Check: PASSED

Arquivos:
- FOUND: `backend/src/emailer.js`
- FOUND: `backend/test/emailer.resumoIndecidivel.test.js`
- FOUND: `.planning/phases/04-confiabilidade-das-integra-es/04-32-SUMMARY.md`
- REMOVIDA (intencional): `backend/test/__probe_wr4_07.js` — sonda temporária, nunca commitada

Commits:
- FOUND: `3f38b6a` — test(04-32): RED
- FOUND: `5fd6be8` — fix(04-32): GREEN

Estado da árvore: `git status --short` limpo em `backend/` antes deste SUMMARY; suíte 186/186;
cobertura exit 0; lint exit 0.
