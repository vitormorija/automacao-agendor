---
phase: 04-confiabilidade-das-integra-es
plan: 28
subsystem: agendador
tags: [gap-closure-r4, cr4-01, observabilidade, fail-safe, blocker]
requires: [04-19, 04-20, 04-23, 04-24]
provides:
  - "results.skippedCategoriaIndecidivel: contador dedicado que existe SEMPRE no payload da rodada"
  - "Alarme de supressão TOTAL por categoria indecidível em results.error, results.errors e logger.error"
  - "skipReason no quarto e último ramo de skip (notificações desativadas vs. sem destinatário)"
  - "Cenários D (apagão) e E (simétrico de causa) no oráculo de quem recebe e-mail"
affects: [backend/src/scheduler.js, backend/test/scheduler.categoriaIndecidivel.test.js]
tech-stack:
  added: []
  patterns:
    - "supressão contável: contador dedicado por CAUSA, separado do contador compartilhado"
    - "alarme aditivo depois do laço — sinal agregado que não decide comportamento por-item"
    - "cenário simétrico de CAUSA como guarda-corpo contra alarme ligado por quantidade"
key-files:
  created: []
  modified:
    - backend/src/scheduler.js
    - backend/test/scheduler.categoriaIndecidivel.test.js
decisions:
  - "D-CR4-01-a aplicada: limiar do alarme é 'todos os negócios' (results.stale > 0 && contador === results.stale)"
  - "D-CR4-01-b aplicada: o contador nasce no literal de results e incrementa SEMPRE, sem limiar"
  - "D-CR4-01-c aplicada: as DUAS superfícies preenchidas — results.error (nomeada pelo usuário) e results.errors (a única que a UI renderiza)"
  - "D-CR4-01-f aplicada: o quarto ramo de skip ganha motivo, não contador nem alarme"
  - "Ordem das asserções do cenário E invertida em relação à listagem do plano (funil antes do contador), para tornar o RED diagnóstico"
metrics:
  duration: ~35min
  tasks: 2
  files_created: 0
  files_modified: 2
  completed: 2026-08-05
---

# Phase 4 Plan 28: Supressão Total por Categoria Indecidível Vira Erro da Rodada Summary

Uma rodada em que a borda `/organizations/:id` cai inteira deixa de ser indistinguível de um dia
calmo: a supressão por categoria indecidível ganhou contador próprio (`results.skippedCategoriaIndecidivel`,
sempre presente no payload) e, quando é TOTAL, preenche `results.error`, entra no array que o
Dashboard já renderiza e emite `logger.error` — sem mudar uma linha do comportamento por negócio
aprovado em CR3-01.

## O achado, e o que exatamente foi fechado

CR4-01 (BLOCKER) não era um erro de direção: o fail-safe de CR3-01 está certo, o negócio
indecidível deve mesmo ficar fora do envio. O defeito era a **mudez**. A sonda do revisor (5
organizações em 429 persistente) media `results.error` `undefined`, `results.errors` `[]`, zero
e-mails, zero linhas em `notification_log` e o log dizendo `Concluído: 5 negócios parados, 0
notificações enviadas` — exatamente o que um dia em que todo mundo já tinha sido notificado às 8h
produz. `results.skipped` valia 5, mas é o **mesmo** contador que dedup, funil e "sem destinatário"
incrementam.

Antes de 04-19 a mesma indisponibilidade notificava todo mundo (fail-open, ruidoso). Depois, não
notificava ninguém (fail-safe, mudo). A troca de direção foi aprovada pelo usuário; a mudez nunca
foi discutida. É essa lacuna — e só ela — que este plano fecha.

## O que NÃO mudou (medido, não presumido)

- **O comportamento por negócio de CR3-01**: byte a byte. O negócio indecidível isolado continua
  fora do envio, dentro do painel, com `skipReason` escrito e `logger.warn` em `getStaleDeals`.
  Os cenários A e B seguem verdes com `r.error === undefined` e agora também com `r.errors.length === 0`.
- **`backend/src/agendor.js`**: não tocado. `git diff --name-only backend/src/` lista **apenas**
  `backend/src/scheduler.js`.
- **IN4-04** (a leitura de `r.success` nos dois ramos): `git diff backend/src/scheduler.js | grep -c "r.success"`
  = **0**. Não foi fechado de carona.
- **`runCheckOnly`**: `git diff backend/src/scheduler.js | grep -c "runCheckOnly"` = **0**.
- **`notification_log`**: continua sem linha na supressão, e isso é contrato (T-04-20-03). O
  cenário D assere zero linhas para os dois negócios.

## Task 1 — RED (commit `a8c4e67`)

Os 5 casos ficaram vermelhos, **todos na asserção nova do contador**, com a mesma forma
`undefined !== N`. Saída literal:

```
not ok 1 - A: negócio de categoria indecidível não recebe e-mail nem linha de log, e a rodada continua notificando o outro
    o contador dedicado existe e separa esta supressão da dedup, do funil e do "sem destinatário"
    undefined !== 1

not ok 2 - B: SIMÉTRICO — a falha na organização do SEGUNDO negócio produz o espelho exato do cenário A
    o contador dedicado conta o negócio suprimido também na ordem inversa
    undefined !== 1

not ok 3 - C: rodada sã — sem falha de categoria, os dois negócios são notificados e nenhum é ignorado
    o contador dedicado é zero numa rodada sã — ele não pode contar o que a guarda não suprimiu
    undefined !== 0

not ok 4 - D: 2 de 2 — a supressão TOTAL por categoria indecidível vira erro da rodada
    os DOIS negócios foram suprimidos pela guarda de categoria
    undefined !== 2

not ok 5 - E: SIMÉTRICO — 2 de 2 suprimidos por FUNIL não disparam o alarme de categoria
    nenhuma supressão por categoria: o contador dedicado discrimina a CAUSA
    undefined !== 0

# tests 5 | pass 0 | fail 5
```

O log do próprio SUT durante o cenário D confirma o defeito por outro ângulo — as duas
organizações caem e a rodada se anuncia normal:

```
[WARN] [Agendor] Categoria indecidível: a organização "Org 2431" (id 2431) não pôde ser consultada. O negócio 2331 fica FORA do envio e permanece no painel.
[WARN] [Agendor] Categoria indecidível: a organização "Org 2432" (id 2432) não pôde ser consultada. O negócio 2332 fica FORA do envio e permanece no painel.
[INFO] [Scheduler] Concluído: 2 negócios parados, 0 notificações enviadas
```

### Divergência medida: o cenário E ficou VERMELHO no RED, e o plano previa verde

O plano previa "E verde desde já, porque nada existe para disparar o alarme", e mandava **PARAR e
reportar** se E ficasse vermelho — com uma causa nomeada: *"a armação do funil não está produzindo
a supressão esperada"*.

**Não é esse o caso, e a evidência é a ordem em que E falhou.** O cenário E assere
`r.skippedCategoriaIndecidivel === 0`, e no estado defeituoso o campo é `undefined` — então E não
tinha como ficar verde. A previsão do plano é internamente inconsistente com o próprio
`<behavior>` que ele especifica para E; é um deslize de redação do planejamento, não um sinal de
armação quebrada.

Para tornar isso **verificável em vez de argumentado**, escrevi as asserções de E com as do funil
ANTES da do contador (o plano manda ordem explícita só para o cenário D; para E diz apenas
"Asserir"). Resultado: no RED, E passou por `r.stale === 2`, `r.skipped === 2`, `r.notified === 0`
e pelos quatro `envios(...) === 0`, e só então falhou no contador. Ou seja, **a armação do funil
Beefor produziu exatamente a supressão esperada** — a condição de PARAR não foi atingida. O motivo
dessa ordem está escrito no próprio arquivo de teste, para que ninguém a "arrume" depois.

### Critérios de aceite da Task 1

| Critério | Esperado | Medido |
|---|---|---|
| `node --test` sai != 0 | sim | sim (5 fail) |
| `grep -c "^test("` | 5 | **5** |
| Asserções removidas no diff | 0 | **0** |
| `grep -ci "simétrico"` | ≥ 2 | **7** |
| `grep -c "orgQueFalha\b"` | 0 | **0** |
| `grep -c "orgsQueFalham"` | ≥ 4 | **8** |
| `git diff --name-only backend/src/` | vazio | **vazio** |
| Linhas do arquivo de teste | ≥ 450 | **592** |

As 10 linhas removidas do diff são **exatamente** a conversão da armação (`orgQueFalha` escalar →
`orgsQueFalham` Set) — nenhuma delas contém `assert`.

## Task 2 — GREEN (commit `c801cf7`)

Quatro mudanças, nenhuma além delas:

**(a) O contador nasce no literal.** `skippedCategoriaIndecidivel: 0` ao lado de `skipped`, para
que o campo exista SEMPRE no payload e nenhum consumidor precise distinguir `undefined` de zero.

**(b) O incremento.** Dentro da guarda `if (deal.categoriaIndecidivel)`, ao lado do
`results.skipped++`. Incrementa **sempre**, independente do limiar — é ele, e não o alarme, que
desfaz a ambiguidade dos 4 `results.skipped++`.

**(c) O alarme.** Depois do `for`, antes do `logger.info` de conclusão, dentro do `try`. Condição:
`results.stale > 0 && results.skippedCategoriaIndecidivel === results.stale`. Preenche
`results.error`, faz `results.errors.push(...)` e emite `logger.error` com tag `[Scheduler]`,
carregando **apenas inteiros e texto fixo** — nenhum objeto de erro (CR-02 do 04-09, T-04-28-03).

**(d) O quarto ramo de skip.** O `else` do bloco de envio passa a escrever `dealResult.skipReason`,
distinguindo `notificações desativadas na configuração` de `nenhum destinatário com e-mail
cadastrado`.

### O enquadramento que ficou escrito no código

O comentário do bloco (c) diz, na ordem exigida, que **o bloco é ADITIVO, mora depois do laço e
NÃO decide quem recebe e-mail** — nenhuma escolha de limiar pode fazer isso. A invariante que o
limiar de 100% preserva é o **contrato agregado-observável de CR3-01**, pinado nos cenários A e B
(campo de erro vazio com 1 de 2 suprimidos): um limiar proporcional abaixo de 100% os tornaria
vermelhos porque a rodada passaria a se **anunciar** como falha num cenário que aquele contrato
fixou como normal — não porque alguém deixaria de ser notificado.

A formulação antiga e falsa ("um limiar menor mudaria o comportamento por negócio") **não** foi
escrita. Ela ficaria disponível como precedente para justificar, sob enquadramento errado, uma
mudança real de comportamento por negócio numa rodada futura.

### Critérios de aceite da Task 2 — todos bateram, sem exceção

| Critério | Esperado | Medido |
|---|---|---|
| `results.skipped++` não-comentário | 4 (inalterado) | **4** |
| `skipReason` não-comentário | 3 (era 2) | **3** |
| `skipReason` TOTAL (com comentário) | registrar à parte | **3** — não cresceu; o comentário fala em "motivo escrito", não no identificador |
| `skippedCategoriaIndecidivel` não-comentário | ≥ 3 | **3** (literal, incremento, condição) |
| `skippedCategoriaIndecidivel` TOTAL | registrar | **3** |
| `results.errors.push` não-comentário | 3 | **3** |
| `r.success` no diff (IN4-04) | 0 | **0** |
| `runCheckOnly` no diff | 0 | **0** |
| `git diff --name-only backend/src/` | só `scheduler.js` | **só `scheduler.js`** |
| Oráculo | 5 verdes | **5/5** |
| Seis vizinhos, sem edição | verdes | **28/28**, `git diff --name-only backend/test/` vazio |
| `npm run test:coverage` | exit 0 | **exit 0** |
| `npm run lint` | exit 0 | **exit 0** (44 warnings, baseline) |

**Esta é a primeira rodada da fase em que nenhum número prescrito divergiu do medido.** As quatro
rodadas anteriores tiveram divergências de contagem por menção dentro de comentário; aqui os
comentários novos foram escritos deliberadamente sem reproduzir os identificadores medidos.

### Invariantes herdadas — medidas e não regredidas

| Invariante | Esperado | Medido |
|---|---|---|
| `catch (erroDeRegistro)` | 1 | **1** |
| `results.notified++` não-comentário | 2 | **2** |
| `continue;` | 3 | **3** |
| `= alreadyNotifiedToday(deal.id);` | 1 | **1** |
| `alreadyNotifiedToday(deal.id)` não-comentário total | 2 | **2** (a 2ª em `runCheckOnly`, intocada) |
| `Array.isArray` não-comentário | 1 | **1** |

### Suíte e cobertura

- **172 → 174** testes, todos verdes (os 2 novos são D e E).
- `scheduler.js`: **83,12%** linhas / **78,87%** branches (era 81,85% / 76,81%).
- `npm run lint` exit 0 com 44 warnings — baseline inalterado.

## Inventário de irmãos — construções gêmeas, com trabalho verificável

Cada item marcado `corrigida` ou `verificada-e-sã` carrega medição ou teste, não menção.

### Os quatro `results.skipped++` de `runCheck`

| # | Ramo | Classificação | Evidência |
|---|---|---|---|
| 1 | dedup do dia | **verificada-e-sã** | Medido em `db.js`: `alreadyNotifiedToday` consulta `WHERE deal_id = ? AND sent_at LIKE ? AND status = 'sent'`. A supressão só ocorre quando existe linha `sent` para HOJE — o vestígio existe por construção e é consultável pelo histórico da UI. Não é falha de dependência. |
| 2 | categoria indecidível | **corrigida** | Contador dedicado + alarme de supressão total. Cenários A, B, C, D. |
| 3 | funil sem notificação (Beefor) | **verificada-e-sã** | Já escreve `skipReason` nomeando o funil; decisão determinística lida do payload do próprio negócio, sem chamada externa. **Reforçada por teste**: o cenário E prova por medição que uma supressão TOTAL por funil não dispara o alarme novo. |
| 4 | notificações desativadas / sem destinatário | **corrigida** | Era o único ramo sem `skipReason` nenhum (medido: 2 não-comentário, nenhuma delas aqui). Agora escreve o motivo, distinguindo as duas causas. `skipReason` não-comentário: 2 → 3. |

### O segundo produtor de e-mail dirigido ao responsável

| Construção | Classificação | Evidência |
|---|---|---|
| `sendOwnerWeeklySummary` em `emailer.js` | **verificada-e-sã** | Medido no arquivo: já tem contador PRÓPRIO (`ignoradosPorCategoriaNaoConsultada`) com linha de log dedicada `[Emailer] Relatório semanal: N card(s) fora do relatório individual porque a categoria da organização não pôde ser consultada`, **separado** do contador de funil (`skippedByFunnel`, com a sua própria linha `[Emailer]`). A supressão semanal já é distinguível por causa. Não é o caminho cuja mudez o blocker descreve. Não tocado. |

### As superfícies operacionais

| Superfície | Classificação | Evidência |
|---|---|---|
| `results.errors` (bloco de erros do Dashboard) | **corrigida** | É a superfície que a UI já renderiza (`lastRun?.errors?.length > 0`); o alarme entra nela. Cenário D assere `r.errors.length === 1`. |
| `results.error` | **corrigida** | Preenchido, conforme a decisão do usuário. Medido: `grep -n "\.error\b" frontend/src/components/Dashboard.jsx` mostra apenas `toast.error`, `result.reason` e `log.error` — **nenhum componente lê `lastRunResult.error`**. Por isso não bastava sozinho (D-CR4-01-c). |
| `notification_log` | **verificada-e-sã** | Continua sem linha, e isso é contrato (T-04-20-03). O cenário D assere zero linhas para os dois negócios. |
| `skipReason` por negócio na UI | **fora-de-escopo-com-medição** | `grep -rn "skipReason" frontend/src` = **0**. O motivo por negócio segue invisível na interface. Dono: todo `cr4-01c`, a criar no plano 04-34. |
| Prévia `runCheckOnly` / botão "Enviar notificações" | **corrigida em outro plano** | Achado WR4-06, plano 04-31. Nomeado para não ser presumido. Intocado aqui. |

### Residual declarado do próprio limiar

| Construção | Classificação | Evidência |
|---|---|---|
| Rodada MISTA: borda inteira fora, mas um negócio **sem organização** escapa da supressão | **fora-de-escopo-com-medição** | Medido em `agendor.js`: com `deal.organization?.id` falso, `getOrgCategory` nem é chamada e o negócio sai com `categoriaIndecidivel: false`. Nessa rodada o contador fica menor que `results.stale` e o alarme **não dispara**, apesar do apagão. Denominador derivado (só negócios com organização) foi avaliado e **rejeitado**: `deal.organization` na lista enriquecida é o **nome** (`deal.organization?.name`, fallback `null`), não o id — uma organização com id e sem nome faria o denominador divergir do numerador e o alarme falharia ABERTO por um caminho novo. Dono: todo `cr4-01b`, a criar no plano 04-34. |

## Deviations from Plan

### Desvios de escopo ou comportamento

Nenhum. Nenhuma Rule 1-4 acionada, nenhum pacote instalado, `package.json` e lockfile intocados
(T-04-28-SC honrada).

### Divergência de previsão (registrada, não forçada)

**1. [Previsão do plano] O cenário E ficou vermelho no RED; o plano previa verde**

- **Encontrado em:** Task 1
- **O que houve:** E assere `r.skippedCategoriaIndecidivel === 0` e o campo era `undefined` no
  estado defeituoso — E não tinha como ficar verde. A previsão do plano contradiz o `<behavior>`
  que o próprio plano especifica para E.
- **Por que não parei:** a instrução de PARAR era condicionada a uma causa nomeada — "a armação do
  funil não está produzindo a supressão esperada". Ordenei as asserções de E com as do funil antes
  da do contador (o plano só fixa ordem para D), e no RED E passou por `r.stale === 2`,
  `r.skipped === 2`, `r.notified === 0` e pelos quatro `envios(...) === 0` antes de falhar no
  contador. A armação do funil está correta e isso ficou **medido**, não argumentado.
- **Arquivos:** `backend/test/scheduler.categoriaIndecidivel.test.js`
- **Commit:** `a8c4e67`

**2. [Rule 1 - Bug] `gsd-sdk query state.*` sobrescreveu campos curados de `STATE.md`**

- **Encontrado durante:** state updates, depois dos dois commits de código
- **Problema:** `state.update-progress` e `state.record-session` recalculam o frontmatter a partir
  do disco e **clobberam estado curado**: `stopped_at` perdeu a narrativa encadeada da r4,
  `last_activity` voltou para o 04-27, `status` virou `verifying` e depois foi sobrescrito com o
  texto da linha `Status:` do corpo, e `completed_phases` caiu de 4 para 3 (`percent` 50 → 38).
  `state.advance-plan` falhou com *"Cannot parse Current Plan or Total Plans in STATE.md"* — a
  seção "Current Position" deste projeto é prosa curada, não o formato que o handler espera.
- **Correção:** `git checkout -- .planning/STATE.md` para restaurar, e edição manual do
  frontmatter e da "Current Position" preservando a narrativa da r4 (o bloco do planejamento
  ficou sob `--- planejamento da r4 abaixo ---`). Os handlers que funcionaram corretamente foram
  mantidos: `state.record-metric` (linha `| Phase 04 P28 | 35min | 2 tasks | 2 files |`),
  `roadmap.update-plan-progress` (04-28 marcado `[x]`, linha da fase de `27/27 Reaberta` para
  `28/34 In Progress`) e `requirements.mark-complete` (REL-03, REL-05 e REL-06 já estavam
  completos — `updated: false`, nenhuma escrita).
- **Verificado:** `total_plans` 43 → **50** e `completed_plans` 43 → **44** (as duas mudanças
  legítimas que o recálculo apontou) foram MANTIDAS; `completed_phases: 4` e `percent: 50`
  (convenção de fases deste projeto, não de planos) foram restaurados.
- **Arquivos:** `.planning/STATE.md`
- **Nota para as próximas execuções desta fase:** rodar `state.update-progress` e
  `state.record-session` **antes** de qualquer edição manual do `STATE.md`, e conferir o diff —
  eles não preservam a prosa curada que esta fase mantém em "Current Position" e em `stopped_at`.

## Escopo que este plano NÃO fecha

- **A rodada MISTA** (`cr4-01b`): o limiar "todos" não cobre o caso em que um negócio sem
  organização escapa da contagem e desarma o alarme. Medido e declarado acima.
- **`skipReason` na UI** (`cr4-01c`): 0 ocorrências em `frontend/src`. O motivo por negócio segue
  invisível na interface.
- **IN4-04** (leitura de `r.success`): fora do diff por critério explícito. Tem todo próprio.
- **Os demais achados da r4** (WR4-01..WR4-07): planos 04-29 a 04-34.

## Atenção para quem seguir

`scheduler.categoriaIndecidivel.test.js` deixou de ser o oráculo de **uma** supressão e virou o
oráculo do **par supressão/alarme**: o cabeçalho lista A a E com o papel de cada um. Uma sexta
causa de supressão entra ali **com o seu simétrico de causa** — o cenário E existe justamente para
impedir que um alarme futuro seja ligado por quantidade (`notified === 0` ou
`skipped === stale`) em vez de por causa.

## Self-Check: PASSED

Arquivos:
- FOUND: `backend/src/scheduler.js`
- FOUND: `backend/test/scheduler.categoriaIndecidivel.test.js`
- FOUND: `.planning/phases/04-confiabilidade-das-integra-es/04-28-SUMMARY.md`

Commits:
- FOUND: `a8c4e67` — test(04-28): RED
- FOUND: `c801cf7` — fix(04-28): GREEN

Estado da árvore: `git status --short` vazio antes deste SUMMARY; suíte 174/174; lint exit 0.
