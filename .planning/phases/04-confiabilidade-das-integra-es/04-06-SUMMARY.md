---
phase: 04-confiabilidade-das-integra-es
plan: 06
subsystem: scheduler
tags:
  [
    rel-05,
    desc-1,
    notification-log,
    dedup,
    scheduler,
    better-sqlite3,
    node-test,
    tdd,
  ]

# Dependency graph
requires:
  - phase: 01-rede-de-testes-da-logica-critica
    plan: 03
    provides: 'db.dedup.test.js — molde exato da metade de banco: tmpDb + openRaw + semeadura por segunda conexão'
  - phase: 04-confiabilidade-das-integra-es
    plan: 01
    provides: 'scheduler.resilience.test.js — os 5 invariantes de resiliência que este plano não podia quebrar, e o bootstrap de 3 bordas stubadas que este arquivo reusa'
  - phase: 04-confiabilidade-das-integra-es
    plan: 04
    provides: 'emailer.timeout.test.js — o oráculo do retry (por isso este plano NÃO precisa repinar contagem de tentativas) e o aviso sobre mock.timers.tickAsync'
provides:
  - "backend/src/db.js updateNotificationStatus(log_id, status, error) — UPDATE por id, no estilo posicional de markResolved/recordClick"
  - "scheduler.js: a linha do notification_log nasce 'pending' e é reconciliada para 'sent'/'error' após o envio"
  - 'scheduler.js: o caminho de exceção atualiza a linha existente — o segundo INSERT desapareceu'
  - 'backend/test/notificationStatus.test.js — 6 cenários (5 literais de Q1 + R-11) em SQLite real'
  - '.planning/todos/pending/rel-05b-test-card-status.md — o terceiro escritor, deixado fora por decisão humana'
affects:
  [04-07-cache-de-categorias, 05-observabilidade, 07-refatoracao-estrutural]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registro de envio em duas etapas: INSERT 'pending' antes (o logId é o alvo do link de tracking) + UPDATE da MESMA linha depois do resultado"
    - 'Um id de deal sintético por cenário (clone do molde 101 da fixture) para que a própria dedup não acople os casos de teste entre si'
    - "Erro injetado deliberadamente NÃO classificável como erro de rede (EENVELOPE, '550 Caixa postal indisponível') — o retry devolve { success:false } na 1a tentativa, sem fake timers e sem tickAsync"
    - 'Contagem de linhas por getNotificationLogs({ limit }) + ordenação por `id` (o relógio congelado torna `sent_at` idêntico em todas as linhas do arquivo)'

key-files:
  created:
    - backend/test/notificationStatus.test.js
    - .planning/todos/pending/rel-05b-test-card-status.md
  modified:
    - backend/src/db.js
    - backend/src/scheduler.js

key-decisions:
  - "Status inicial 'pending' (decisão humana travada no PLAN): um crash no meio do envio deixa a linha não-deduplicante e portanto retentável amanhã — manter 'sent' e só corrigir na falha reabriria o DESC-1 em miniatura"
  - "≥ 1 destinatário confirmado mantém 'sent' e preserva o erro do que falhou na coluna `error` — classificar o parcial como 'error' faria quem JÁ recebeu receber de novo amanhã (risco R-11)"
  - 'O insert-first FICA: o logId continua sendo necessário antes do envio para o link de tracking; o que muda é o valor gravado, não a ordem'
  - "O cenário de exceção é declarado PRIMEIRO no arquivo de teste porque é o único que assere o `total` GLOBAL da tabela — medida limpa só enquanto é a primeira rodada (antes da correção: 2; depois: 1)"
  - 'Nenhuma migração de dados: a informação que reclassificaria as linhas históricas nunca foi gravada, e a dedup é por data — as datas já passaram'
  - "POST /api/notifications/test-card NÃO foi tocado (fidelidade ao contrato §11 e rollback atômico); virou o todo rel-05b-test-card-status"

patterns-established:
  - 'Quando a dedup do próprio SUT interfere entre casos, variar o ID de entrada em vez de limpar a tabela: mantém os 6 casos independentes nos DOIS estados (antes e depois da correção)'
  - "Preferir o erro permanente ao erro de rede quando o objeto de medida não é o retry — dispensa fake timers de setTimeout e o helper avancarRelogioAte"

requirements-completed: [REL-05]

# Metrics
duration: 12min
completed: 2026-08-04
---

# Phase 4 Plan 06: Status de Envio Consistente em Falhas Summary

**A linha do `notification_log` deixou de nascer mentindo: ela é inserida como `'pending'`, vira `'sent'` só quando ao menos um destinatário confirma e vira `'error'` quando nenhum confirma — o que devolve à `alreadyNotifiedToday` o significado que D-03 sempre supôs que ela tinha, e faz uma notificação que falhou ser retentada na rodada seguinte em vez de ficar silenciosamente perdida para sempre.**

## Performance

- **Duration:** 12 min
- **Tasks:** 2 (Task 1 RED, Task 2 GREEN — plano `tdd="true"` nas duas)
- **Files modified:** 4 (2 criados, 2 modificados)
- **Diff de produção:** `db.js` +10 −0 · `scheduler.js` +35 −16
- **Suíte:** 112 → **118 testes**, 0 falhando

## O defeito que foi consertado (DESC-1)

`scheduler.js:113` gravava `status: 'sent'` **antes** de enviar, para obter o `logId` do link de tracking. A partir daí:

| Caminho de falha | Antes | Agora |
| ---------------- | ----- | ----- |
| `{ success:false }` em todos os destinatários | linha permanecia **`'sent'`** (mentira) | linha vira **`'error'`** |
| Exceção escapando de `sendStaleNotification` | **duas** linhas: a `'sent'` original + uma `'error'` nova | **uma** linha, atualizada para `'error'` |
| Crash do processo no meio do envio | linha `'sent'` órfã, deal bloqueado para sempre | linha `'pending'`, retentável amanhã |

Como `alreadyNotifiedToday` (`db.js:223-232`) filtra `status = 'sent'`, **nenhum dos dois primeiros caminhos era retentado no dia seguinte** — ou seja, a premissa de "recuperação natural pela rodada diária" que sustenta a decisão D-03 do contexto da fase era **falsa**. Ela passou a ser verdadeira.

## Os 6 cenários (REL-05 / Decisão Q1 + risco R-11)

`backend/test/notificationStatus.test.js` — 381 linhas, SQLite real em arquivo temporário, as 3 bordas stubadas, relógio congelado em `2026-06-01T00:00:00.000Z`.

| # | Cenário | O que prova | Status no RED |
| - | ------- | ----------- | ------------- |
| Q1-2 | Exceção na fábrica SMTP | `status === 'error'` e **exatamente 1** linha para o deal (`total` global = 1) | ✗ **2 !== 1** |
| Q1-3 | `{ success:false }` em todos | `status === 'error'` com o erro agregado | ✗ `'sent' !== 'error'` |
| Q1-1 | Envio confirmado | `status === 'sent'`, `error` nulo | ✓ já passava |
| R-11 | Sucesso parcial (dono ok, autor falha) | `status === 'sent'` **e** o erro do que falhou registrado | ✗ `error` era nulo |
| Q1-4 | Linha de **hoje** com `'error'` | `alreadyNotifiedToday === false` — a rodada retenta | ✓ já passava |
| Q1-5 | Linha de **hoje** com `'sent'` | `alreadyNotifiedToday === true` — a dedup real continua íntegra | ✓ já passava |

O RED foi verificado literalmente: **3 falharam pelos motivos certos**, e os 3 que já passavam são a não-regressão — Q1-1 e Q1-5 provam que o conserto não afrouxou a garantia original de "quem recebeu hoje não recebe de novo hoje".

**Q1-4 não duplica `db.dedup.test.js:54-87`**, e isso está comentado dentro do teste: lá o `false` vinha da **data** (`sent_at` de ontem, `status = 'sent'`); aqui vem do **status** (`sent_at` de hoje, `status = 'error'`). São as duas metades da mesma cláusula SQL.

## Task Commits

1. **Task 1 — RED: os 6 cenários de status de envio** — `5930cf3` (`test`)
2. **Task 2 — GREEN: helper de UPDATE, fluxo de status e todo do test-card** — `8b6b7c6` (`fix`)

## Files Created/Modified

- `backend/src/db.js` **(+10 −0)** — `updateNotificationStatus(log_id, status, error)` inserida entre `markResolved` e `recordClick`, copiando o padrão daquelas duas literalmente (argumentos posicionais em `snake_case`, `db.prepare(...).run(...)` inline, SQL em maiúsculas, sem try/catch, sem retorno) e acrescentada ao `module.exports` na mesma vizinhança. Comentário de 3 linhas em PT-BR explicando **a decisão** (reconciliar a mesma linha em vez de inserir uma segunda), não a mecânica. **Zero DDL, zero migração, `logNotification` e `alreadyNotifiedToday` intocadas.**
- `backend/src/scheduler.js` **(+35 −16)** — bloco `:109-164`. `status: 'sent'` → `'pending'` no insert; `logId` declarado com `let logId = null` **antes** do `try` para ficar visível no catch; `algumSucesso` derivado ao lado do `allOk` existente; dois ramos de `updateNotificationStatus`; o segundo `logNotification` do catch substituído por um UPDATE guardado por `if (logId !== null)`. `dealResult.notified` continua sendo `allOk`, `results.errors.push(...errors)` e `results.notified++` intactos. Comentário-bloco de 14 linhas em PT-BR acima do `try` registrando **por que** `'pending'` e **por que** `≥ 1` sucesso confirma `'sent'`.
- `backend/test/notificationStatus.test.js` **(criado, 381 linhas)** — bootstrap na ordem canônica (`makeTmpDbPath` → `DB_PATH` → `setup` → `installFakeAxios` → stub de `nodemailer` → `require` de `db`/`scheduler`), `notify_author` ligado por `setConfig` para que dono e autor sejam destinatários distintos (o default do projeto é `'false'`), e `modoEnvio`/`fabricaDeveLancar` como variáveis mutáveis lidas **dentro** do stub.
- `.planning/todos/pending/rel-05b-test-card-status.md` **(criado)** — prioridade média, cita `routes/notifications.js:87-99`, registra a decisão humana de 2026-08-04 e traz a receita de correção em 4 passos (a mesma já aplicada e testada aqui).

## Inventário de consumidores do campo `status` — efeito medido

**Escritores (3):** `scheduler.js:113` **mudou** · `scheduler.js:144` **virou UPDATE** · `routes/notifications.js:94` **não mudou** (fora de escopo, todo `rel-05b`).

**Leitores que filtram `status = 'sent'` (4)** — todos passam a devolver números **menores**, e isso é **o conserto, não uma regressão**:

| Função (`db.js`) | Consumidor final | Efeito |
| --- | --- | --- |
| `alreadyNotifiedToday` | `scheduler.js:92` e `runCheckOnly` | Envio falho deixa de bloquear a rodada seguinte — **é o objetivo** |
| `getNotificationStats` | `GET /api/notifications/status` → `Dashboard.jsx:48` | `totalSent`/`totalClicked`/`clickRate` caem para o número **real** de envios confirmados |
| `getNotifiedDealIds` | `GET /api/notifications/notified-deals` → `DealsList.jsx:64,76` | Deals cujo envio falhou saem do mapa "já notificado" |
| `getNotifiedDeals` | `GET /api/notifications/resolved` → `NotificationHistory.jsx:26` | A lista encolhe |

**Leitor sem filtro:** `getNotificationLogs` (`SELECT *`) → o histórico e o Dashboard renderizam `log.status === 'sent' ? ✅ : ❌`. Linhas de falha passam de ✅ (mentira) para ❌ (verdade). **Zero mudança de frontend foi necessária** — o ramo `else` já trata qualquer status ≠ `'sent'`, incluindo o novo `'pending'` transitório.

**Não-leitor confirmado:** `routes/track.js` usa `getLogById`/`recordClick` e não lê `status` — o tracking de clique não foi afetado.

## Decisions Made

- **`'pending'` como status inicial.** A coluna é `TEXT NOT NULL DEFAULT 'sent'` **sem CHECK constraint**, então o valor novo não exigiu DDL nem migração. A consequência é deliberada e é o ponto: um crash entre o insert e o envio deixa a linha `'pending'`, que nenhum leitor conta como enviado — logo a rodada de amanhã retenta. Manter `'sent'` e só corrigir na falha teria deixado essa janela aberta, que é o próprio DESC-1 em miniatura.
- **`≥ 1` sucesso confirma `'sent'`, com o erro do que falhou preservado.** Houve envio real; classificar o parcial como `'error'` liberaria a dedup e faria quem **já recebeu** receber de novo no dia seguinte (risco R-11). O `error` agregado (`errors.join('; ')`) mantém o rastro do destinatário que falhou, então nada de diagnóstico se perde.
- **O insert-first ficou.** O `logId` é o identificador do link de tracking e precisa existir antes do e-mail sair. O plano não moveu a ordem — mudou o valor gravado. É a diferença entre um conserto de 35 linhas e uma refatoração do fluxo de tracking.
- **Um id de deal por cenário, em vez de limpar a tabela entre casos.** A dedup do próprio SUT é o que o arquivo mede; zerar a tabela entre testes mascararia o acoplamento. Servindo um clone do molde 101 com id próprio a cada rodada, os 6 casos ficam independentes **nos dois estados** — antes e depois da correção — o que é o que torna o RED interpretável.
- **Erro injetado permanente, não de rede.** O plano oferecia duas rotas (avançar o relógio falso com `avancarRelogioAte`, ou injetar um erro que o retry não classifica como de rede). Escolhi a segunda: `EENVELOPE` / `'550 5.1.1 Caixa postal indisponível'` faz `sendMailWithRetry` devolver `{ success:false }` na **primeira** tentativa, sem as esperas de 3s/6s. O objeto de medida aqui é o **status gravado**, não o retry — cujo oráculo já vive em `emailer.timeout.test.js` (04-04). O arquivo roda em ~95ms e não precisou de fake timers para `setTimeout`. **`mock.timers.tickAsync` não foi usado** (Node 23+; o CI é Node 20).
- **`test-card` fora, por escrito.** É o terceiro escritor de `'sent'` pré-envio e tem exatamente o mesmo defeito, mas o contrato §11 restringe o diff deste plano e o rollback atômico vale mais do que a correção de um endpoint de teste manual (`deal_id` tipicamente `0`, disparado por um humano que vê o resultado na hora). O todo `rel-05b-test-card-status` carrega a receita completa.

## Deviations from Plan

### Ajuste de forma

**1. Dois commits em vez do único listado no `<output>` do plano**

O plano enumerava `fix(04-06)!: status de envio consistente em falhas — 'sent' só após confirmação (REL-05)`. As duas tasks são `tdd="true"` e o protocolo exige RED separado do GREEN — mesmo precedente do 04-02, 04-03 e 04-04. Ficaram `5930cf3` (RED, `test`) e `8b6b7c6` (GREEN, com a mensagem literal do plano). O rollback continua sem ambiguidade: revert dos dois.

**2. Ordem de declaração dos cenários no arquivo de teste**

O plano lista Q1-1 primeiro. No arquivo, Q1-2 vem primeiro — porque é o único cenário que assere o `total` **global** da tabela, e essa medida só é limpa enquanto ele é a primeira rodada do arquivo. O motivo está comentado acima do teste. Nenhuma asserção foi enfraquecida; ao contrário, a de "sem linha `'sent'` órfã" ficou mais forte (`total === 1`, não apenas "1 linha para este deal").

---

**Total deviations:** 0 auto-fixes (nenhum defeito encontrado além do que o plano já descrevia) + 2 ajustes de forma
**Impact on plan:** Nenhum scope creep. Todos os critérios de aceite das 2 tasks foram satisfeitos, incluindo os greps literais.

## Issues Encountered

**Nenhum bloqueio.** O plano previu com precisão os 3 cenários que falhariam no RED e os 3 que já passariam, e a previsão bateu exatamente.

Uma armadilha vale registro para quem for testar fluxos que passam pelo agendador: **a dedup do próprio `runCheck` acopla os casos de teste entre si**. Um deal que termina uma rodada com `'sent'` fica bloqueado para o resto do arquivo, e um deal que termina com `'error'` não fica — ou seja, a interferência é **assimétrica entre o estado antes e o depois da correção**, e um arquivo escrito com um único id de deal produziria um RED ilegível (falhas em cascata por dedup, não pelo defeito). A solução (um id por cenário) está comentada no arquivo.

**Nenhum stub introduzido.** Nenhum valor vazio codificado, placeholder ou TODO/FIXME nos arquivos tocados.

**Cobertura:** `scheduler.js` subiu de 67,27% para **73,41%** de linhas; `db.js` de 68,79% para **69,69%**. Agregado do backend: 53,66 → **54,62 stmts** e 75,74 → **77,74 branches** (pisos 20/60).

## Threat Flags

Nenhuma superfície de segurança nova fora do `<threat_model>` do plano. As disposições registradas foram cumpridas:

- **T-04-06-01 (mitigate)** — insert com `'pending'` + `updateNotificationStatus` após o resultado; provado por Q1-1, Q1-2 e Q1-3.
- **T-04-06-02 (mitigate)** — o catch atualiza a linha existente; Q1-2 assere **exatamente 1** linha para o deal e `total === 1` na tabela.
- **T-04-06-03 (mitigate)** — Q1-4 assere `alreadyNotifiedToday === false` para um `'error'` de hoje: a rodada seguinte retenta.
- **T-04-06-04 (mitigate)** — a coluna `error` recebe apenas `r.error`/`err.message`. Verificado que nenhuma mensagem embute credencial: o erro do nodemailer para autenticação é `Invalid login`, sem a senha, e nenhum ponto do fluxo serializa o objeto de opções do transporte. PC-13 respeitado no teste — o stub de `createTransport` nem captura `opts`.
- **T-04-06-05 (mitigate)** — regra "≥ 1 sucesso confirma `'sent'`" implementada e provada por R-11, com Q1-5 garantindo que a dedup de quem recebeu continua ativa.
- **T-04-06-06 (accept)** — **nenhum script de migração foi criado**, conforme declarado no PLAN.
- **T-04-06-07 (accept)** — `routes/track.js` não foi tocado e não lê `status`.
- **T-04-06-SC (accept)** — nenhuma instalação de pacote; `package.json` e `package-lock.json` não aparecem no diff deste plano.

## User Setup Required

Nenhuma. Os testes não abrem conexão de rede (HTTP e SMTP stubados), não dependem de espera real e não tocam `backend/agendor.db` (`DB_PATH` aponta para arquivo temporário, removido no `after`).

**Observação operacional para quando isto chegar em produção:** o Dashboard vai mostrar `totalSent` **menor** do que mostrava antes, e o histórico vai exibir ❌ em linhas que antes apareciam ✅. Não é regressão — é a primeira vez que esses números refletem envios de fato confirmados. Se a queda for grande, ela é a medida de quantos envios vinham falhando em silêncio.

## Verification

```
node --test test/notificationStatus.test.js   (RED)    → 6 tests, 3 pass, 3 fail
node --test test/notificationStatus.test.js   (GREEN)  → 6 tests, 6 pass, 0 fail  (~95ms)
node --test test/db.dedup.test.js             (GREEN)  → 3 tests, 3 pass  (arquivo NÃO editado)
npm run test:coverage                                  → exit 0 | 118 tests, 118 pass, 0 fail
npm run lint                                           → exit 0 (45 warnings — baseline inalterado)
biome format src/db.js src/scheduler.js test/notificationStatus.test.js → No fixes applied

Ondas 1-4 revalidadas em conjunto:
node --test test/scheduler.resilience.test.js test/scheduler.failsafe.test.js \
            test/agendor.timeout.test.js test/notifications.resolved.test.js \
            test/emailer.timeout.test.js  → 34 tests, 34 pass, 0 fail

All files      | 54.62 stmts | 77.74 branch | 54.87 funcs | 54.62 lines   (pisos 20/60/20/20)
 scheduler.js  | 73.41       | 71.42        | 66.66       | 73.41   (era 67,27)
 db.js         | 69.69       | 82.85        | 40.74       | 69.69   (era 68,79)
 emailer.js    | 35.67       | 83.33        | 53.84       | 35.67

grep -c "status: 'sent'"           backend/src/scheduler.js → 0
grep -c "status: 'pending'"        backend/src/scheduler.js → 1
grep -c "logNotification"          backend/src/scheduler.js → 2  (import + a ÚNICA chamada restante)
grep -c "updateNotificationStatus" backend/src/scheduler.js → 4  (import + 2 ramos + catch)
grep -c "function updateNotificationStatus" backend/src/db.js → 1  (e no module.exports)
grep -c "SELECT COUNT" backend/test/notificationStatus.test.js → 0
git diff backend/src/db.js | grep -E "ALTER TABLE|CREATE TABLE|logNotification|alreadyNotifiedToday" → (vazio)
git diff --name-only backend/src/  → db.js, scheduler.js  (routes/notifications.js NÃO tocado)
git diff --numstat backend/src/    → 10/0 db.js · 35/16 scheduler.js
git status --porcelain backend/agendor.db → (vazio)
git stash list → (vazio)
```

## Next Phase Readiness

- **04-07 (limpeza do cache de categorias, REL-04) liberado.** É o último plano da fase e não toca `scheduler.js` nem `db.js` — nenhuma interseção com este diff. O aviso do 04-04 continua valendo e foi confirmado aqui: **não copiar `mock.timers.tickAsync` do `04-RESEARCH`** — ou usar o helper `avancarRelogioAte` (`emailer.timeout.test.js:78-101`), ou (preferível quando o retry não é o objeto de medida) injetar um erro que não seja classificável como erro de rede.
- **Molde reusável para o verificador de fase:** `notificationStatus.test.js` é o primeiro arquivo que combina as 3 bordas stubadas **com** asserções sobre o estado gravado no SQLite. Quem for cobrir o `test-card` (todo `rel-05b`) copia esse arquivo.
- **Débito registrado, não esquecido:** `.planning/todos/pending/rel-05b-test-card-status.md` — o terceiro escritor de `'sent'` pré-envio, com a receita de correção já validada por este plano.
- **Sem blockers.** Nada adiado para `deferred-items.md`. `package.json` intocado.

## Self-Check: PASSED

- `backend/src/db.js` — FOUND
- `backend/src/scheduler.js` — FOUND
- `backend/test/notificationStatus.test.js` — FOUND
- `.planning/todos/pending/rel-05b-test-card-status.md` — FOUND
- Commit `5930cf3` — FOUND
- Commit `8b6b7c6` — FOUND

---

_Phase: 04-confiabilidade-das-integra-es_
_Completed: 2026-08-04_
