---
phase: 04-confiabilidade-das-integra-es
plan: 10
subsystem: scheduler
tags:
  [
    wr-01,
    wr-04,
    wr-05,
    rel-05,
    gap-closure,
    dedup,
    notification-log,
    scheduler,
    emailer,
    node-test,
    tdd,
  ]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    plan: 06
    provides: 'notificationStatus.test.js (6 cenários de REL-05) — o oráculo que este plano tinha de manter verde SEM editar, e a semântica de status que ele não podia desfazer'
  - phase: 04-confiabilidade-das-integra-es
    plan: 04
    provides: 'emailer.timeout.test.js — a função avancarRelogioAte copiada para o helper, e o aviso de que a API assíncrona de tick não existe no Node 20 do CI'
  - phase: 04-confiabilidade-das-integra-es
    plan: 01
    provides: 'scheduler.resilience.test.js — o cenário (5) endurecido e o beforeEach que zera fake.get.mock.calls'
provides:
  - 'backend/src/emailer.js: sendStaleNotification anexa ao erro relançado o resultado por destinatário já coletado (o parcial atravessa a exceção)'
  - "backend/src/scheduler.js: houveEnvioConfirmado governa o status gravado nos DOIS caminhos (retorno e exceção) — uma exceção após envio confirmado mantém 'sent'"
  - "backend/src/scheduler.js: results.notified++ mora dentro do ramo 'sent' — o contador exibido no log e na UI só cresce com envio real"
  - 'backend/test/helpers/fakeTimers.js — avancarRelogioAte reutilizável'
  - 'backend/test/notificationStatus.partialFailure.test.js — 3 cenários (exceção após sucesso parcial, falha total por retorno, caminho feliz)'
  - 'backend/test/scheduler.resilience.test.js (5) — asserção de pré-condição que prova alcance da borda'
affects: [05-observabilidade, 07-refatoracao-estrutural]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Informação que precisa sobreviver a uma exceção viaja ANEXADA ao erro relançado, não numa variável de escopo externo — o array local se perde junto com a pilha'
    - 'Erro de teste classificado como DE REDE (mensagem com "timeout") quando o objeto de medida é justamente o ramo de retry que recria o transporte; erro PERMANENTE (EENVELOPE) quando não é'
    - 'Asserção de PRÉ-CONDIÇÃO com mensagem prefixada por "pré-condição:" antes das asserções de resultado — separa "o caminho foi alcançado" de "o caminho produziu X"'
    - 'Teeth de asserção nova verificado por mutação temporária do código de produção, revertida antes do commit'

key-files:
  created:
    - backend/test/helpers/fakeTimers.js
    - backend/test/notificationStatus.partialFailure.test.js
  modified:
    - backend/src/emailer.js
    - backend/src/scheduler.js
    - backend/test/scheduler.resilience.test.js

key-decisions:
  - "A correção sugerida pelo 04-REVIEW (houveEnvioConfirmado atribuído DEPOIS do await) não resolveria o caso que ela descreve: se sendStaleNotification lança, aquela linha nunca executa. A informação precisa ATRAVESSAR a exceção — daí o anexo ao erro"
  - "O try de emailer.js envolve APENAS os dois blocos de envio; createTransporter/from/subject ficam FORA para que a fábrica inicial continue lançando 'nua' e o cenário Q1-2 de notificationStatus.test.js não mude de significado"
  - 'A exceção continua sendo RELANÇADA sem alteração de mensagem nem de tipo — D-03 e Q1-2 dependem do throw'
  - "results.notified++ movido para dentro do ramo 'sent' em vez de condicionado por um if separado: um único ponto de verdade com o status gravado, impossível de divergir"
  - 'O identificador da propriedade anexada ao erro aparece UMA vez por arquivo (exigência de aceite do plano); os comentários explicam a decisão sem repetir o literal'
  - "A prova de WR-05 usa fake.get.mock.calls contendo '/users' (rota escolhida pelo plano) e não um espião no logger (rota sugerida pelo 04-REVIEW) — não introduz require novo no arquivo e não acopla o teste ao formato da mensagem de log"

patterns-established:
  - 'Quando um teste afirma pinar um catch, ele precisa de uma asserção que prove que a execução CHEGOU lá; assert.doesNotReject sozinho é satisfeito por qualquer early-return'
  - 'Mutação temporária do código de produção (revertida) é a forma barata de provar que uma asserção nova tem dentes, sem precisar de um framework de mutation testing'

requirements-completed: [REL-05]

# Metrics
duration: 14min
completed: 2026-08-04
---

# Phase 4 Plan 10: Sucesso Parcial, Contador e Prova de Caminho Summary

**Uma exceção que acontece depois de um destinatário já ter confirmado o envio deixou de rebaixar a linha do `notification_log` para `'error'` — o resultado parcial agora viaja anexado ao próprio erro, então quem já recebeu continua protegido pela dedup em vez de receber tudo de novo amanhã; no mesmo bloco, `results.notified` parou de contar falhas totais como envio, e o cenário (5) do teste de resiliência parou de passar por ausência de exceção.**

## Performance

- **Duration:** 14 min
- **Tasks:** 3 (Task 1 RED, Task 2 GREEN, Task 3 endurecimento de asserção)
- **Files modified:** 5 (2 criados, 3 modificados)
- **Diff de produção:** `emailer.js` +48 −29 (**+19 −0 ignorando indentação** — o resto é o recuo dos dois blocos de envio para dentro do `try`) · `scheduler.js` +26 −4
- **Suíte:** 131 → **135 testes**, 0 falhando

## Os três defeitos

### WR-01 — a regressão com consequência para o usuário final

O `catch` de `scheduler.js` gravava `updateNotificationStatus(logId, 'error', err.message)` **incondicionalmente**. `sendStaleNotification` pode lançar **depois** de o e-mail do dono ter saído: `sendMailWithRetry` chama `createTransporter()` **dentro do `catch` do laço de retry** (`emailer.js:211`), e essa fábrica lê o SQLite (`getConfig`).

| Momento | Antes da Fase 4 | Depois do 04-06 (defeito) | Agora |
| --- | --- | --- | --- |
| Exceção **após** um envio confirmado | linha `'sent'` otimista sobrevivia + segunda linha `'error'` → dedup intacta por acidente | **linha única `'error'`** → `alreadyNotifiedToday` volta a `false` → **amanhã reenvia para quem já recebeu** | linha única **`'sent'`** com o erro preservado na coluna `error` → dedup protege quem recebeu |
| Exceção **antes** de qualquer envio (Q1-2) | duas linhas | uma linha `'error'` | uma linha `'error'` (**inalterado**) |

**O que o 04-REVIEW não fechava.** A correção sugerida lá era `houveEnvioConfirmado = emailResults.some(...)` logo depois do `await`. Ela **não resolve o caso que descreve**: se `sendStaleNotification` lança, essa linha nunca executa e a variável continua `false`. O array de resultados de `emailer.js` é **local** e se perde junto com a pilha. A informação tinha de **atravessar a exceção** — por isso `sendStaleNotification` anexa o parcial ao próprio erro antes de relançar.

### WR-04 — o bloco contradizendo a si mesmo

`results.notified++` era incondicional. Numa falha total por retorno o bloco gravava `'error'` e em seguida incrementava o contador. `POST /api/notifications/run` devolvia `results.deals[0].notified === false` junto com `results.notified === 1`, e `logger.info('[Scheduler] Concluído: … N notificações enviadas')` reportava envios que não aconteceram — no dia em que o SMTP estivesse fora, o log diria que tudo saiu. O incremento passou para **dentro do ramo `'sent'`**: um único ponto de verdade, compartilhado com o status gravado.

### WR-05 — o teste que não provava o que afirmava

O cenário (5) de `scheduler.resilience.test.js` dizia pinar o `catch` de `runWeeklySummary`, mas a única asserção era `assert.doesNotReject`. A função tem um **early-return** (`if (!notificationsEnabled) return;`) **antes** do `Promise.all` que falha — qualquer regressão que a fizesse sair cedo (inclusive o seed de `notifications_enabled` mudar) manteria o caso verde sem nunca tocar o `catch`.

## Os 3 cenários novos (`notificationStatus.partialFailure.test.js`, 311 linhas)

| # | Cenário | Mecânica da injeção | Status no RED |
| - | ------- | ------------------- | ------------- |
| A (WR-01) | Exceção **depois** de um envio confirmado | `sendMail` resolve para o dono; para o autor lança erro **de rede** (mensagem com `timeout`) → o retry espera 3s e **recria** o transporte → a fábrica lança na **2ª** chamada | ✗ `'error' !== 'sent'` |
| B (WR-04) | Falha total por retorno | erro **permanente** (`EENVELOPE`, `550 Caixa postal indisponível`) para todos → o retry devolve `{ success:false }` na 1ª tentativa | ✗ `1 !== 0` |
| C | Caminho feliz (não-regressão do contador) | `sendMail` resolve para todos | ✓ já passava |

**RED literalmente verificado** (exit 1): A e B vermelhos **exatamente pelos motivos previstos pelo plano**, C verde. As duas asserções de **pré-condição** de A passaram já no RED (`enviosConfirmados === 1` e `transportesCriados === 2`) — ou seja, o vermelho de A é de fato "a exceção veio da recriação do transporte, depois de o dono ter recebido", e não o cenário Q1-2 disfarçado.

O helper `backend/test/helpers/fakeTimers.js` (44 linhas) existe porque A é o primeiro caso deste subsistema que **precisa** do ramo de retry: sem avançar o relógio falso, a espera de 3s de `emailer.js:209` seguraria o teste. É a única razão pela qual este arquivo habilita `apis: ['Date', 'setTimeout']` enquanto `notificationStatus.test.js` habilita só `'Date'` — e, com `meta.totalCount = 1`, a espera entre lotes de páginas de `agendor.js:203-210` nunca é atingida, então nada mais fica congelado.

## Task Commits

1. **Task 1 — RED: helper de relógio falso + 3 cenários** — `d2d638d` (`test`)
2. **Task 2 — GREEN: o parcial atravessa a exceção e governa status e contador** — `1671178` (`fix`)
3. **Task 3 — WR-05: o cenário (5) prova alcance da borda** — `8a60cde` (`test`)

## Files Created/Modified

- `backend/src/emailer.js` **(+48 −29; +19 −0 ignorando indentação)** — `sendStaleNotification` passou a envolver **apenas os dois blocos de envio** num `try`. `let transporter = createTransporter()`, `from`, `tipoSubject`, `subject` e `const results = []` ficaram **fora** dele de propósito: a fábrica inicial precisa continuar lançando sem carregar parcial nenhum, senão Q1-2 mudaria de significado (lá o desfecho correto **é** `'error'`). O `catch` anexa o array ao erro (guardado por `err && typeof err === 'object'`) e faz `throw err` — **o mesmo erro, sem alteração de mensagem nem de tipo**. Comentário de 14 linhas em PT-BR explicando a DECISÃO (por que o array não pode ficar para trás, e por que o `throw` permanece). **`sendMailWithRetry`, `createTransporter`, `dealEmailHtml`, os resumos semanais e o `console.warn` do retry: intocados** — medido, não afirmado (contagem de `sendMailWithRetry` fora de comentários: **3 antes, 3 depois**).
- `backend/src/scheduler.js` **(+26 −4)** — `let houveEnvioConfirmado = false;` declarado ao lado de `let logId = null;` (antes do `try`); a const `algumSucesso` **substituída** (não duplicada — 0 ocorrências restantes fora de comentários) pela atribuição àquela variável; `results.notified++` movido para dentro do ramo `'sent'` (linha 177, entre o `updateNotificationStatus(… 'sent' …)` das linhas 172-176 e o `} else {` da 178); e o `catch` lendo o parcial anexado ao erro com `?? []` antes de gravar `houveEnvioConfirmado ? 'sent' : 'error'`. `results.errors.push(err.message)`, a guarda `if (logId !== null)`, `allOk`, `dealResult.notified = allOk` e `if (!allOk) results.errors.push(...errors)` permanecem. O comentário-bloco ganhou 13 linhas: a regra que faltava (a mesma razão de "≥ 1 sucesso confirma `'sent'`" vale no caminho de **exceção**) e a justificativa do contador.
- `backend/test/notificationStatus.partialFailure.test.js` **(criado, 311 linhas)** — bootstrap na ordem canônica do 04-06 (`makeTmpDbPath` → `DB_PATH` → `setup` → `installFakeAxios` → stub de `nodemailer` → `require` de `db`/`scheduler`), `notify_author` ligado por `setConfig`, um id de deal por cenário (2101/2103/2105), e os contadores `transportesCriados`/`enviosConfirmados` como pré-condições asseridas. Cabeçalho de 32 linhas nomeando WR-01/WR-04 e a consequência operacional, e dizendo explicitamente que este arquivo **soma-se** a `notificationStatus.test.js` em vez de substituí-lo.
- `backend/test/helpers/fakeTimers.js` **(criado, 44 linhas)** — `avancarRelogioAte` copiada de `emailer.timeout.test.js:88-113` com o comentário que explica por que a API assíncrona de tick do Node 23 é proibida (o CI é Node 20), mais uma nota registrando que aquele arquivo **mantém a sua cópia local de propósito** — os testes das ondas 1-7 não são editados nesta rodada de gap closure, e a deduplicação fica como trabalho futuro.
- `backend/test/scheduler.resilience.test.js` **(+11 −0)** — asserção de pré-condição **acrescentada** ao cenário (5), logo após o `assert.doesNotReject`: `fake.get.mock.calls` precisa conter uma chamada cujo 1º argumento seja `'/users'`. Nenhuma asserção existente foi removida ou alterada (`git diff | grep -c "^-[^-]"` → **0**), nenhum outro cenário foi tocado e **nenhum `setConfig` foi introduzido** (0 ocorrências no arquivo) — é justamente a asserção que precisa detectar uma mudança de seed, não um seed fixado pelo teste.

## Decisions Made

- **A informação viaja anexada ao erro, não numa variável externa.** É o ponto que o 04-REVIEW não fechava. Uma variável atribuída depois do `await` nunca é atribuída quando o `await` lança. Anexar o parcial ao erro é a adição mínima que faz o dado sobreviver ao unwinding da pilha, e mantém o `throw` — do qual D-03 e Q1-2 dependem.
- **O `try` de `emailer.js` é deliberadamente estreito.** Envolver também `createTransporter()` faria a fábrica inicial passar a carregar um array vazio; o efeito prático seria nulo hoje (`[].some(...)` é `false`), mas mudaria o significado do cenário Q1-2 de "a exceção não traz nada" para "a exceção traz um parcial vazio". Manter a fronteira onde está deixa os dois casos distinguíveis por construção.
- **`results.notified++` dentro do ramo, não num `if` separado.** Condicioná-lo por um segundo `if (houveEnvioConfirmado)` funcionaria igual hoje e divergiria no primeiro refactor. Dentro do ramo, contador e status gravado são o mesmo ponto de decisão.
- **O identificador da propriedade anexada aparece uma única vez por arquivo.** É exigência literal de aceite do plano (`grep -c` = 1 em cada). Os comentários — inclusive o do bloco de `scheduler.js`, que o plano mandou atualizar mencionando-a — explicam a decisão **sem repetir o literal**, para não quebrar a medida. Registrado aqui porque é a única tensão entre o texto da ação e o critério de aceite do plano, e foi resolvida a favor do critério.
- **A prova de WR-05 é a chamada à borda, não um espião no logger.** O 04-REVIEW sugeria `mock.method(logger, 'error', ...)` e casar a mensagem. A rota do plano (`fake.get.mock.calls` contendo `'/users'`) não introduz `require` novo no arquivo, não acopla o teste ao **formato** da mensagem de log e reusa o `beforeEach` que já zera o contador. A propriedade medida é a mesma: a execução passou do early-return.
- **Os dentes da asserção nova foram medidos, não assumidos.** Mutação temporária em `scheduler.js` forçando o early-return (`const notificationsEnabled = false;`): o cenário (5) ficou **vermelho exatamente nesta asserção** (`# pass 4 / # fail 1`), e o restante do arquivo seguiu verde. A mutação foi revertida com `git checkout -- backend/src/scheduler.js` antes do commit da Task 3; `git diff --name-only -- backend/src/` ficou vazio.

## Deviations from Plan

### Ajuste de forma

**1. Três commits em vez do único listado no `<output>` do plano**

O `<output>` enumerava `fix(04-10): sucesso parcial sobrevive à exceção e notified só conta envio real (WR-01/WR-04/WR-05)`. As Tasks 1 e 2 são `tdd="true"` e o protocolo exige RED separado do GREEN (mesmo precedente de 04-02, 04-03, 04-04 e 04-06); a Task 3 é um arquivo diferente e um defeito diferente. Ficaram `d2d638d` (RED), `1671178` (GREEN, com a mensagem do plano menos o `WR-05`) e `8a60cde` (WR-05). O rollback continua sem ambiguidade: revert dos três.

**2. O comentário de `scheduler.js` explica o anexo sem citar o identificador literal**

O `<action>` da Task 2 pedia que o comentário-bloco dissesse "é por isso que `sendStaleNotification` anexa `resultadosParciais` ao erro"; o `<acceptance_criteria>` da mesma task exige `grep -c` = **1** naquele arquivo. Escrever o literal no comentário devolveria 2. O comentário diz "anexa ao erro o resultado por destinatário que já tinha coletado" — mesma informação, critério preservado.

**3. Os cenários B e C também são dirigidos por `avancarRelogioAte`**

O plano só o exigia em A. Como `setTimeout` está mockado no arquivo **inteiro** (é a diferença deliberada em relação a `notificationStatus.test.js`), qualquer caminho que viesse a esperar um timer travaria a suíte silenciosamente. O helper é inócuo quando não há timer pendente — resolve na primeira volta — e elimina essa classe de trava. Nenhuma asserção foi enfraquecida.

---

**Total deviations:** 0 auto-fixes (nenhum defeito encontrado além dos três que o plano descrevia) + 3 ajustes de forma
**Impact on plan:** Nenhum scope creep. Todos os critérios de aceite das 3 tasks foram satisfeitos, incluindo os greps literais.

## Issues Encountered

**Nenhum bloqueio.** O plano previu com precisão quais cenários falhariam no RED e por quê, e a previsão bateu exatamente — inclusive o detalhe de que a 2ª chamada à fábrica do transporte é a recriação dentro do `catch` do retry.

Uma armadilha vale registro para quem for medir "a exceção aconteceu depois do envio": **`assert` de resultado não distingue "exceção após envio" de "exceção antes de qualquer envio"** — os dois produzem uma exceção que chega ao mesmo `catch`. Sem os contadores `enviosConfirmados`/`transportesCriados` asseridos como pré-condição, o cenário A poderia ficar verde depois da correção medindo o caminho errado (o de Q1-2), cujo desfecho correto é o oposto (`'error'`). É a mesma lição de WR-05 aplicada preventivamente.

**Nenhum stub introduzido.** Nenhum valor vazio codificado, placeholder ou TODO/FIXME nos arquivos tocados.

**Cobertura:** `scheduler.js` 73,41% → **75,00%** de linhas; `emailer.js` 35,67% → **37,25%** (branches 83,87%). Agregado do backend: **57,92 stmts / 78,93 branches** (pisos 20/60).

## Threat Flags

Nenhuma superfície de segurança nova fora do `<threat_model>` do plano. As disposições registradas foram cumpridas:

- **T-04-10-01 (mitigate)** — o parcial atravessa a exceção; o `catch` só rebaixa quando nada foi confirmado. Provado pelo cenário A (`status === 'sent'`).
- **T-04-10-02 (mitigate)** — `assert.equal(db.alreadyNotifiedToday(2101), true)` no cenário A: quem já recebeu não é reenviado amanhã.
- **T-04-10-03 (mitigate)** — incremento movido para dentro do ramo `'sent'`; cenário B assere `r.notified === 0` **e** `r.deals[0].notified === false` numa falha total.
- **T-04-10-04 (mitigate)** — os 6 cenários de `notificationStatus.test.js` rodam verdes **sem edição** (`git diff --name-only` daquele arquivo: vazio); o cenário B repete a asserção de `'error'` para a falha total.
- **T-04-10-05 (mitigate)** — asserção de pré-condição sobre `fake.get.mock.calls` contendo `'/users'`, com os dentes verificados por mutação.
- **T-04-10-06 (mitigate)** — PC-13 respeitado: o stub de `createTransport` não captura, não assere e não imprime o objeto de opções; apenas **ramifica** por `mailOptions.to`, como já fazia `notificationStatus.test.js:150`.
- **T-04-10-SC (accept)** — nenhuma instalação de pacote. `git diff --name-only -- backend/package.json backend/package-lock.json` → vazio.

**SEC-01 permanece ABERTO** como risco conscientemente aceito (decisão C8 do usuário). Nada neste plano leu, imprimiu ou alterou o `AGENDOR_TOKEN`, e nada aqui o marca como resolvido.

## User Setup Required

Nenhuma. Os testes não abrem conexão de rede (HTTP e SMTP stubados), não dependem de espera real (relógio falso) e não tocam `backend/agendor.db` (`DB_PATH` aponta para arquivo temporário, removido no `after`).

**Observação operacional.** Dois números visíveis mudam em produção, ambos para mais perto da verdade: (1) o Dashboard/`logger.info` deixam de contar falhas totais como notificação enviada — se a contagem cair, a queda é a medida de quantos envios vinham falhando; (2) uma rodada que estourar **no meio** do envio agora deixa a linha `'sent'` (antes: `'error'`), o que é o comportamento correto e o que impede o reenvio no dia seguinte. O `in-01-status-pending-na-ui` (renderização do `'pending'`) continua pendente e não foi afetado.

## Verification

```
node --test test/notificationStatus.partialFailure.test.js  (RED)   → exit 1 | 3 tests, 1 pass, 2 fail
    A: 'error' !== 'sent'   (pré-condições enviosConfirmados=1 / transportesCriados=2 já verdes)
    B: 1 !== 0
    C: pass
node --test test/notificationStatus.partialFailure.test.js  (GREEN) → exit 0 | 3 tests, 3 pass

Arquivos das ondas 1-7 revalidados SEM edição (git diff --name-only -- backend/test/ → só resilience):
node --test test/notificationStatus.test.js   → exit 0
node --test test/scheduler.failsafe.test.js   → exit 0
node --test test/scheduler.resilience.test.js → exit 0 (5 cenários)
node --test test/emailer.timeout.test.js      → exit 0
(os 5 arquivos juntos: 31 tests, 31 pass, 0 fail)

npm run test:coverage → exit 0 | 135 tests, 135 pass, 0 fail
npm run lint          → exit 0 | Checked 50 files | Found 45 warnings (baseline inalterado)
biome format src/emailer.js src/scheduler.js test/helpers/fakeTimers.js \
             test/notificationStatus.partialFailure.test.js \
             test/scheduler.resilience.test.js → No fixes applied

All files      | 57.92 stmts | 78.93 branch | 55.42 funcs | 57.92 lines   (pisos 20/60/20/20)
 scheduler.js  | 75.00       | 73.33        | 66.66       | 75.00   (era 73,41)
 emailer.js    | 37.25       | 83.87        | 53.84       | 37.25   (era 35,67)
 db.js         | 69.69       | 82.85        | 40.74       | 69.69   (inalterado)

Greps de aceite (Task 1):
grep -c "avancarRelogioAte" backend/test/helpers/fakeTimers.js                       → 4  (>= 2)
grep -c "tickAsync"         backend/test/notificationStatus.partialFailure.test.js   → 0
grep -c "apis: ['Date', 'setTimeout']" .../notificationStatus.partialFailure.test.js → 1
grep -c "pré-condição:"     backend/test/notificationStatus.partialFailure.test.js   → 3  (2 no cenário A)

Greps de aceite (Task 2):
grep -c "resultadosParciais" backend/src/emailer.js                       → 1
grep -c "resultadosParciais" backend/src/scheduler.js                     → 1
grep -v "^\s*//" backend/src/scheduler.js | grep -c "results.notified++"  → 1
grep -v "^\s*//" backend/src/scheduler.js | grep -c "algumSucesso"        → 0
grep -c "houveEnvioConfirmado ? 'sent' : 'error'" backend/src/scheduler.js → 1
grep -v "^\s*//" backend/src/emailer.js | grep -c "sendMailWithRetry"     → 3 antes / 3 depois
posição do notified++: linha 177, entre updateNotificationStatus(…'sent'…) (172-176) e "} else {" (178)

Greps de aceite (Task 3):
git diff -- backend/test/scheduler.resilience.test.js | grep -c "^-[^-]"  → 0
grep -c "pré-condição: a falha da borda" backend/test/scheduler.resilience.test.js → 1
grep -c "'/users'"  backend/test/scheduler.resilience.test.js → 1 antes / 2 depois
grep -c "setConfig" backend/test/scheduler.resilience.test.js → 0

Mutação de controle (WR-05 tem dentes), revertida antes do commit:
  scheduler.js:231 `const notificationsEnabled = false;` → cenário (5) vermelho
  na asserção de pré-condição (# pass 4 / # fail 1); git checkout -- backend/src/scheduler.js
  → git diff --name-only -- backend/src/ vazio

git diff --numstat -- backend/src/ → 48/29 emailer.js · 26/4 scheduler.js
git diff -w --numstat -- backend/src/emailer.js → 19/0  (puramente aditivo fora a indentação)
git diff --name-only -- backend/package.json backend/package-lock.json → (vazio)
git status --porcelain backend/agendor.db → (vazio)
git stash list → (vazio)
```

## Next Phase Readiness

- **04-11 liberado.** Este plano encerra o diff de `scheduler.js` e `emailer.js` da rodada de gap closure; nenhum arquivo aqui é compartilhado com o que resta da onda.
- **Molde reusável:** `backend/test/helpers/fakeTimers.js` é o primeiro helper de relógio do projeto. Qualquer teste futuro que precise exercitar o ramo de retry de `sendMailWithRetry` importa daqui em vez de copiar; quem editar `emailer.timeout.test.js` numa fase futura deve trocar a cópia local pelo import.
- **Débito registrado, não esquecido:** a duplicação de `avancarRelogioAte` entre o helper e `emailer.timeout.test.js` está documentada dentro do próprio helper, com o motivo (não editar os testes das ondas 1-7 durante o gap closure).
- **Sem blockers.** Nada adiado para `deferred-items.md`. `package.json` intocado. SEC-01 continua aberto por decisão do usuário.

## Self-Check: PASSED

- `backend/src/emailer.js` — FOUND
- `backend/src/scheduler.js` — FOUND
- `backend/test/helpers/fakeTimers.js` — FOUND
- `backend/test/notificationStatus.partialFailure.test.js` — FOUND
- `backend/test/scheduler.resilience.test.js` — FOUND
- Commit `d2d638d` — FOUND
- Commit `1671178` — FOUND
- Commit `8a60cde` — FOUND

---

_Phase: 04-confiabilidade-das-integra-es_
_Completed: 2026-08-04_
