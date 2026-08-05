---
phase: 04-confiabilidade-das-integra-es
plan: 14
subsystem: scheduler
tags: [rel-05, wr2-01, notification-log, contador, sucesso-parcial, tdd]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "04-06 (status em duas etapas: 'pending' -> 'sent'/'error'), 04-10 (canal err.resultadosParciais e results.notified++ dentro do ramo 'sent' no caminho de retorno), 04-13 (avancarRelogioAte com desfecho normalizado)"
provides:
  - "results.notified incrementado no ramo de EXCEÇÃO que grava 'sent' — contador e linha do notification_log nunca discordam, nos dois caminhos"
  - "Cenário A de notificationStatus.partialFailure.test.js com oráculo para a relação linha↔contador no caminho de exceção"
affects: [04-15, 04-16, verificacao-da-fase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Decisão de status escrita como if/else (não como ternário dentro da chamada) para que o incremento do contador tenha lugar físico ao lado do status que ele reflete"
    - "Assimetria intencional entre dois campos preservada por comentário + asserção explícita, em vez de atribuição redundante que o próximo leitor 'harmonizaria'"

key-files:
  created: []
  modified:
    - backend/src/scheduler.js
    - backend/test/notificationStatus.partialFailure.test.js

key-decisions:
  - "D-WR2-01-a aplicada: o incremento vive DENTRO do mesmo ramo que grava 'sent', nos dois caminhos"
  - "D-WR2-01-b aplicada: sem `dealResult.notified = false;` — o campo já nasce false; a intenção fica em comentário e é pinada por asserção"
  - "Desvio menor do snippet do review: o `if (houveEnvioConfirmado)` governa também a ESCOLHA do status (if/else), não só o incremento"

patterns-established:
  - "RED medido pela saída literal do runner (0 !== 1 com a linha já em 'sent'), não afirmado"

requirements-completed: [REL-05]

# Metrics
duration: 11min
completed: 2026-08-05
---

# Phase 04 Plan 14: `results.notified` acompanha o status no caminho de exceção (WR2-01) Summary

**O contador que o log de produção e a UI exibem como "notificações enviadas" deixou de reportar zero num dia em que houve envio real: quem grava `'sent'` incrementa, nos dois caminhos, e a assimetria intencional com `dealResult.notified` passou a ser pinada por asserção em vez de ficar implícita.**

## Performance

- **Duration:** ~11 min
- **Tasks:** 2 de 2 (RED + GREEN)
- **Files:** 0 criados, 2 modificados
- **Diff de produção:** 1 chamada convertida em `if/else` + 1 linha de incremento + comentários

## Accomplishments

- **WR2-01 fechado.** O ramo de exceção de `scheduler.js` gravava `'sent'` quando `err.resultadosParciais` trazia sucesso, mas não tocava `results.notified`. Agora o `if (houveEnvioConfirmado)` governa **status e contador juntos**, exatamente como no ramo de retorno que o 04-10 já havia corrigido.
- **A inconsistência ganhou oráculo.** O cenário A — justamente onde os dois discordavam — não asseria nem `r.notified` nem `r.deals[0].notified`. Agora assere os dois, com comentário explicando por que `1` e `false` convivem sem se contradizer.
- **RED medido, não afirmado:** `0 !== 1` com a linha do `notification_log` já em `'sent'` e `enviosConfirmados === 1`. É a reprodução literal da sonda do `04-REVIEW.md` §WR2-01.
- **Nenhum arquivo de teste das ondas 1-7 teve asserção alterada.** O cenário A só **ganhou** asserções; B e C intocados; `notificationStatus.test.js` sem uma linha de diff.
- Suíte: **143/143 verdes** (mesma contagem do 04-13 — este plano acrescenta asserções a um caso existente, não casos novos); cobertura acima dos pisos; `npm run lint` exit 0.

## Task Commits

1. **Task 1: RED — cenário A exige que o contador concorde com a linha** — `73dc1b5` (test)
2. **Task 2: GREEN — o contador acompanha o status no caminho de exceção** — `f8d649b` (fix)

## RED medido, não afirmado

Saída literal de `node --test test/notificationStatus.partialFailure.test.js` em `73dc1b5` (antes da correção de produção):

```
# Subtest: A: exceção após o dono já ter recebido mantém "sent" e a dedup protege quem recebeu
not ok 1 - A: exceção após o dono já ter recebido mantém "sent" e a dedup protege quem recebeu
  ---
  duration_ms: 45.112084
  location: '.../backend/test/notificationStatus.partialFailure.test.js:209:1'
  failureType: 'testCodeFailure'
  error: |-
    houve envio real: o número que o logger.info do scheduler e a UI exibem não pode dizer que nada saiu

    0 !== 1

  code: 'ERR_ASSERTION'
  expected: 1
  actual: 0
ok 2 - B: falha total por retorno deixa results.notified em 0 e a linha em "error"
ok 3 - C: caminho feliz mantém results.notified em 1, linha "sent" e erro nulo
# tests 3
# pass 2
# fail 1
```

Duas leituras que valem registrar:

1. **A ÚNICA falha é o cenário A**, e ela é em `r.notified` — as pré-condições (`enviosConfirmados === 1`, `transportesCriados === 2`) passaram, ou seja, o vermelho é sobre o contador e não sobre o caminho ter sido percorrido.
2. A mesma execução imprimiu, na linha do próprio SUT, **`[Scheduler] Concluído: 1 negócios parados, 0 notificações enviadas`** — enquanto a linha do `notification_log` daquele deal já estava gravada como `'sent'`. É o defeito operacional inteiro numa linha de log: o operador leria "nada saiu" num dia em que um e-mail saiu.

Depois da correção, o mesmo log da mesma execução diz `1 notificações enviadas`, e o caso A fica verde sem que B ou C mudem de desfecho.

## O diff de produção, inteiro

```js
if (houveEnvioConfirmado) {
  // O contador segue o status TAMBÉM aqui (WR2-01): houve envio real, e
  // é este número que o logger.info de conclusão e a UI exibem como
  // "notificações enviadas". Já dealResult.notified permanece false DE
  // PROPÓSITO — ele responde a outra pergunta ("todos os destinatários
  // confirmaram?"), e no sucesso parcial a resposta é não. Quem pina
  // essa relação é o cenário A de notificationStatus.partialFailure.test.js.
  updateNotificationStatus(logId, 'sent', err.message);
  results.notified++;
} else {
  updateNotificationStatus(logId, 'error', err.message);
}
```

Mais o parágrafo do comentário-bloco de duas etapas, que antes justificava o incremento **só** no ramo de retorno e agora diz que a regra vale nos dois — nomeando as duas direções do mesmo defeito (super-contagem = WR-04, sub-contagem = WR2-01) e explicando **por que a forma é `if/else` e não ternário**: sem o `if/else`, o incremento não tem lugar físico ao lado do status, que foi exatamente como a assimetria nasceu.

Nada mais mudou: `results.errors.push(err.message)`, a guarda `if (logId !== null)`, a leitura de `err.resultadosParciais`, o `allOk`, o `dealResult.notified = allOk` do ramo de retorno, o `finally` e `runWeeklySummary` estão byte a byte iguais.

## Desvio (menor) do snippet do review

O `04-REVIEW.md` §WR2-01 propõe manter o ternário e acrescentar um `if (houveEnvioConfirmado)` **depois** da chamada, contendo o incremento **e** um `dealResult.notified = false;`. Duas diferenças na entrega, ambas prescritas pelo próprio plano:

| Item | Review | Entregue | Razão |
|---|---|---|---|
| Escolha do status | ternário dentro da chamada, com um `if` separado logo abaixo | `if/else` regendo status **e** contador | Um único ponto de decisão; a duplicação do teste `houveEnvioConfirmado` em duas construções seguidas é o que permite que elas divirjam de novo |
| `dealResult.notified = false;` | explícito | **não escrito** (D-WR2-01-b) | O campo já é `false` na construção de `dealResult`; reatribuir o mesmo valor é código morto que o próximo leitor tende a ler como "aqui alguma coisa muda". A intenção está no comentário do ramo **e** pinada por `assert.equal(r.deals[0].notified, false, …)` no cenário A |

O risco R2-12 do plano ("um leitor futuro 'harmoniza' `dealResult.notified` com o contador") é coberto pela asserção, não pelo comentário sozinho: quem harmonizar deixa o cenário A vermelho.

## Verificação (todos os critérios do plano, medidos)

| Critério | Comando | Resultado |
|---|---|---|
| RED isolado no cenário A | `node --test test/notificationStatus.partialFailure.test.js` (em `73dc1b5`) | exit ≠ 0, `# pass 2 / # fail 1`, falha em `r.notified` (`0 !== 1`); B e C `ok` |
| Diff da Task 1 não remove código | `git diff … \| grep -c "^-[^-]"` | `0` |
| `grep -c "r.notified"` no teste | antes / depois | **2 → 3** (exatamente a asserção nova) |
| Task 1 sem tocar produção | `git diff --name-only backend/src/` durante a Task 1 | vazio |
| `notificationStatus.test.js` intocado | `git diff --name-only` | vazio, e `# pass 6` |
| Sucesso parcial verde | `node --test test/notificationStatus.partialFailure.test.js` | exit 0, `# pass 3` |
| Fail-safe (REL-06) sem edição | `node --test test/scheduler.failsafe.test.js` | `# pass 8` |
| Resiliência (REL-03) sem edição | `node --test test/scheduler.resilience.test.js` | `# pass 5` |
| Dedup sem edição | `node --test test/db.dedup.test.js` | `# pass 3` |
| Incremento uma vez por ramo | `grep -v '^\s*//' src/scheduler.js \| grep -c 'results.notified++'` | `2` |
| Incremento DENTRO do bloco `'sent'` | `grep -n "updateNotificationStatus\|results.notified++\|} else {"` | `205` (`'sent'`) < `206` (incremento) < `207` (`} else {`) |
| Sem atribuição redundante | `grep -v '^\s*//' … \| grep -c 'dealResult.notified = false'` | `0` |
| Ternário extinto | `grep -v '^\s*//' … \| grep -cF "houveEnvioConfirmado ? 'sent' : 'error'"` | `0` |
| Produção restrita a um arquivo | `git diff --name-only backend/src/` | apenas `backend/src/scheduler.js` |
| `emailer/agendor/db/package/lockfile` intocados | `git diff --name-only …` | vazio |
| Suíte + cobertura | `npm run test:coverage` | exit 0, **143/143** |
| Lint | `npm run lint` | exit 0 (45 warnings, baseline do 04-13) |
| Format | `biome format` nos 2 arquivos | exit 0, "No fixes applied" |

Cobertura global: **57,94% linhas / 80,35% branches** (pisos 20/60). `scheduler.js` em 75,85% linhas / 72,88% branches — o ramo novo é exercitado pelo cenário A.

## Nota sobre o critério `grep -c "r.notified"`

O critério do plano pede que a contagem **aumente em 1** (2 → 3). Na primeira redação o cabeçalho do arquivo citava `` `r.notified` `` em prosa, e a contagem foi para **4** — a mesma classe de ruído registrada no 04-13 (linha de comentário casando com um grep pensado para código). O cabeçalho foi reescrito para nomear os campos por seus nomes completos (`results.notified` / `dealResult.notified`), que não casam com o padrão, e a contagem ficou exatamente **3**, medindo o que o critério pretende: uma asserção nova. A troca é puramente redacional e aconteceu antes do commit da Task 1.

## Decisions Made

1. **O `if/else` rege status e contador juntos** (D-WR2-01-a). O ternário dentro da chamada era a causa estrutural da assimetria: ele não deixava lugar natural para o incremento.
2. **Nenhuma atribuição redundante de `dealResult.notified`** (D-WR2-01-b). Comentário + asserção provam a intenção; uma atribuição para o mesmo valor não prova nada e convida à interpretação errada.
3. **As duas asserções novas ficam imediatamente após as pré-condições**, antes das asserções sobre a linha gravada — a ordem de leitura do caso é "provei o caminho → confiro o que a rodada REPORTA → confiro o que ela GRAVOU".
4. **A robustez do `catch` contra falha própria e o endurecimento do canal parcial não foram tocados** — são 04-15 (WR2-02) e 04-16 (WR2-04). Este plano manteve o diff de produção do tamanho do achado.

## Deviations from Plan

Nenhuma deviation de execução (Regras 1-4 não acionadas). O único ajuste foi a redação do cabeçalho do teste descrita na nota do `grep`, feita para satisfazer o critério de aceitação literal do próprio plano — sem efeito sobre asserções, casos ou comportamento.

**Total deviations:** 0

## Issues Encountered

- **`npx` continua não funcionando nesta máquina** (mesmo achado do 04-12/04-13). O Biome foi invocado por caminho de pacote: `node backend/node_modules/.bin/biome …`.
- **Lint reporta 45 warnings**, idêntico ao baseline do 04-13; os dois arquivos deste plano não acrescentam nenhum. `npm run lint` sai 0 (o gate).

## Threat Flags

Nenhuma superfície nova. Itens do registro do plano:

| Threat ID | Disposição | Como foi tratado | Evidência |
|---|---|---|---|
| T-04-14-01 | mitigate | Incremento dentro do mesmo ramo que grava `'sent'` | cenário A assere `r.notified === 1`; log do SUT passou de "0 notificações enviadas" para "1" |
| T-04-14-02 | mitigate | Status gravado inalterado nos dois desfechos | cenário A: `status === 'sent'` e `alreadyNotifiedToday === true`; `notificationStatus.test.js` `# pass 6` sem edição |
| T-04-14-03 | mitigate | `results.notified++` em exatamente 2 linhas de código, uma por ramo | grep não-comentário = `2`; cenário B assere `0` na falha total |
| T-04-14-04 | mitigate | O stub de `createTransport` não captura nem imprime o objeto de opções (PC-13); não foi alterado | diff do teste restrito ao cabeçalho e ao corpo do cenário A |
| T-04-14-SC | accept | Nenhuma instalação de pacote | `backend/package.json` e lockfile sem diff |

## Known Stubs

Nenhum. Nenhum valor fixo, placeholder ou fonte de dados não ligada.

## User Setup Required

None.

## Next Phase Readiness

- **04-15 (WR2-02) está liberado** — plano autônomo, sem checkpoint aqui. Ele mexe no MESMO `catch`: a robustez contra o próprio `updateNotificationStatus` falhar (SQLite fechado). O incremento entregue aqui vive dentro desse bloco, então o 04-15 deve preservá-lo ao envolver a atualização em proteção própria — e o cenário A é o oráculo que acusa se ele sumir.
- **Ordem de rollback declarada pelo plano** (risco R2-13), caso algum dos três precise voltar: 04-16, depois 04-15, depois 04-14.
- **SEC-01 permanece ABERTO** como risco conscientemente aceito (decisão C8) — nada neste plano o altera.
- **DECISÃO C9** (atualizar a redação do Success Criteria 4 do ROADMAP sobre REL-04) segue pendente para o **04-18**.

## Self-Check: PASSED

- Arquivos declarados existem: `backend/src/scheduler.js`, `backend/test/notificationStatus.partialFailure.test.js`, `.planning/phases/04-confiabilidade-das-integra-es/04-14-SUMMARY.md`.
- Commits declarados existem: `73dc1b5` (RED), `f8d649b` (GREEN).
- Nenhum arquivo temporário criado ou deixado para trás; `git status --short` limpo após cada commit.

---
*Phase: 04-confiabilidade-das-integra-es*
*Completed: 2026-08-05*
