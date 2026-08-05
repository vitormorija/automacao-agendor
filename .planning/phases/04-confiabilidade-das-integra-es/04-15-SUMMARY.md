---
phase: 04-confiabilidade-das-integra-es
plan: 15
subsystem: scheduler
tags: [rel-05, wr2-02, notification-log, fail-safe, resiliencia, tdd, checkpoint-c10]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "04-06 (status em duas etapas 'pending' -> 'sent'/'error'), 04-10 (canal err.resultadosParciais + houveEnvioConfirmado governando o status nos dois caminhos), 04-13 (avancarRelogioAte com desfecho normalizado), 04-14 (results.notified++ no ramo de excecao que grava 'sent')"
provides:
  - "A gravacao do desfecho dentro do catch do bloco de envio nao pode mais derrubar a rodada: try/catch proprio, log da mensagem, e o for dos deals segue"
  - "Fail-safe declarado no codigo: linha 'pending' nao deduplica, a rodada seguinte retenta — reenvio no pior caso, aprovado pelo usuario no C10"
  - "notificationStatus.registroResiliente.test.js (Cenario D) como oraculo de que a rodada sobrevive a uma falha de gravacao"
affects: [04-16, 04-17, 04-18, verificacao-da-fase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Excecao nascida DENTRO de um catch tem guarda propria: o catch externo de runCheck nao pode ser o destino de uma falha de registro"
    - "Mock de funcao consumida por desestruturacao CommonJS instalado ANTES do require do modulo consumidor (senao o teste fica verde por nao mockar nada)"
    - "Dois deals servidos por rodada como unica forma de distinguir 'a rodada seguiu' de 'a rodada acabou porque nao havia mais nada'"

key-files:
  created:
    - backend/test/notificationStatus.registroResiliente.test.js
  modified:
    - backend/src/scheduler.js
    - backend/src/emailer.js

key-decisions:
  - "D-WR2-02-a aplicada: a falha do registro e capturada e logada, e a rodada segue"
  - "D-WR2-02-b aplicada: so erroDeRegistro.message vai ao logger, nunca o objeto"
  - "D-WR2-02-c aplicada: results.notified++ fora do try de registro — o contador acompanha a DECISAO de status, nao o sucesso da gravacao"
  - "D-WR2-02-d respeitada: o consumidor do canal parcial nao foi tocado (Array.isArray e o 04-16)"
  - "C10 (usuario, 2026-08-05): o reenvio no dia seguinte e o desfecho PREFERIDO ao abandono dos deals restantes — decisao do usuario, nao do executor"
  - "C10 (usuario, 2026-08-05): o todo in-01-status-pending-na-ui MANTEM prioridade media apesar do aumento de frequencia do 'pending'"
  - "Desvio de forma declarado: um unico try envolve o if/else do status (criterio exige exatamente 1 catch), e o incremento vira um if proprio abaixo do catch"

patterns-established:
  - "RED medido pela saida literal do runner, e a previsao do plano CORRIGIDA pela medicao (1 -> 0) em vez de reportada como prevista"

requirements-completed: [REL-05]

# Metrics
duration: 21min
completed: 2026-08-05
---

# Phase 04 Plan 15: a falha ao registrar o desfecho para de derrubar a rodada (WR2-02) Summary

**Uma exceção nascida DENTRO do `catch` do bloco de envio — a gravação do desfecho falhando pela mesma conexão SQLite que causou a falha original — escapava para o `catch` externo de `runCheck` e apagava a rodada inteira; agora ela é capturada, logada e a rodada segue, com a linha do deal afetado em `'pending'` e retentável amanhã por decisão explícita do usuário.**

## Performance

- **Duration:** ~21 min
- **Tasks:** 3 de 3 (RED + GREEN + checkpoint C10 aprovado)
- **Files:** 1 criado, 2 modificados
- **Diff de produção:** 1 `try/catch` novo em `scheduler.js` + reposicionamento de 1 incremento + comentários; `emailer.js` **só comentário**

## Accomplishments

- **WR2-02 fechado.** `updateNotificationStatus` é chamada de dentro do `catch` do bloco de envio e usa a **mesma conexão** que pode ter originado a exceção. Quando ela lançava, nada segurava: a falha subia para o `catch` externo de `runCheck`, abortava o `for` dos deals e a rodada terminava sem processar os negócios restantes.
- **O defeito é um passo pior do que o plano previu** — e a medição corrigiu a previsão. Ver a seção do RED abaixo.
- **O fail-safe está escrito no código, não inferido.** O comentário do bloco diz o que acontece (`'pending'` não deduplica, a rodada de amanhã retenta), por que essa é a escolha, e que o trade-off foi decidido no C10.
- **O comentário de `emailer.js` parou de declarar coberto um cenário que não estava.** Ele citava a conexão fechada pelo desligamento do processo como exemplo do que o canal `err.resultadosParciais` resolve — justamente o caso em que o canal não ajuda em nada. Passou a citar o cenário A de `notificationStatus.partialFailure.test.js` (falha da fábrica do transporte durante o retry, com o banco vivo) e a declarar o desfecho do caso não coberto.
- **Nenhum arquivo de teste das ondas 1-7 teve asserção alterada.** `git diff --name-only backend/test/` vazio ao final da Task 2.
- Suíte: **144/144 verdes** (143 → 144, exatamente o cenário novo); cobertura acima dos pisos; `npm run lint` exit 0.

## Task Commits

1. **Task 1: RED — a rodada morre quando o registro do desfecho falha** — `e781208` (test)
2. **Task 2: GREEN — registro protegido e comentário que para de citar um cenário não coberto** — `40eaf54` (fix)
3. **Task 3: Checkpoint C10** — aprovado por escrito pelo usuário em 2026-08-05 (sem commit próprio)

## RED medido, não afirmado — e a previsão do plano corrigida

Saída literal de `node --test test/notificationStatus.registroResiliente.test.js` em `e781208` (antes da correção de produção):

```
# 2026-06-01T00:00:00.000Z [ERROR] [Scheduler] Erro na verificação: Error: The database connection is not open
#     at .../test/notificationStatus.registroResiliente.test.js:167:11
#     at Object.apply (node:internal/test_runner/mock/mock:598:20)
#     at runCheck (.../backend/src/scheduler.js:208:15)
# Subtest: D: falha ao registrar o desfecho não aborta a rodada — o deal seguinte continua sendo notificado
not ok 1 - D: falha ao registrar o desfecho não aborta a rodada — o deal seguinte continua sendo notificado
  ---
  failureType: 'testCodeFailure'
  error: |-
    a falha ao registrar não pode abortar a rodada

    + actual - expected

    + 'The database connection is not open'
    - undefined

  code: 'ERR_ASSERTION'
# tests 1
# pass 0
# fail 1
```

Três leituras que valem registrar:

1. **A pré-condição passou antes da falha** (`registrosQueFalharam === 1`): o vermelho é sobre o desfecho da rodada, não sobre o caminho não ter sido percorrido. O stack aponta para `scheduler.js:208` — a gravação do `'error'` dentro do `catch`, exatamente o ponto que WR2-02 nomeia.
2. **A prova operacional apareceu na linha do próprio SUT:** `[ERROR] [Scheduler] Erro na verificação: Error: The database connection is not open`. Uma falha de *escrita de log* virou uma falha da *verificação inteira*.
3. **A previsão do plano estava otimista, e a medição a corrigiu.**

### Divergência medida: `r.deals.length === 0`, não `1`

O plano previa `r.deals.length === 1` no RED (o deal que falhou entraria em `results.deals`, e só os seguintes se perderiam). O valor **medido** é `0`. Sondado com uma cópia descartável do arquivo de teste — a asserção de `r.error` comentada apenas para revelar a asserção seguinte —, removida em seguida e **nunca commitada**:

```
error: os deals seguintes da rodada precisam continuar sendo processados

0 !== 2

expected: 2
actual: 0
```

A razão é estrutural: `results.deals.push(dealResult)` fica **depois** do `try/catch` do bloco de envio, dentro do corpo do `for`. Quando a exceção do registro escapa, ela pula o push — então a rodada perde também o registro do deal que disparou a falha, não apenas "os deals seguintes". O sentido do achado não muda; o custo é um passo maior do que o estimado. O critério de aceite do plano admitia a variação (`r.deals.length === 1` **e/ou** `r.error` preenchido), e o `r.error` preenchido foi confirmado.

Consequência de ordenação no teste: a pré-condição `r.deals[0].id === 2201` prescrita pelo plano **não pode** vir antes de `r.deals.length`. No estado defeituoso o array está vazio, e ler `r.deals[0].id` produziria um `TypeError` em vez de um vermelho legível. Ela ficou logo após a asserção de `length`, com comentário explicando o porquê — a contagem de `"pré-condição:"` exigida pelo critério (≥ 2) é satisfeita com folga (3).

## O diff de produção

### `backend/src/scheduler.js`

```js
try {
  if (houveEnvioConfirmado) {
    updateNotificationStatus(logId, 'sent', err.message);
  } else {
    updateNotificationStatus(logId, 'error', err.message);
  }
} catch (erroDeRegistro) {
  logger.error(
    '[Scheduler] Falha ao registrar o desfecho do envio:',
    erroDeRegistro.message,
  );
}
...
if (houveEnvioConfirmado) results.notified++;
```

Mais dois blocos de comentário: um explicando a decisão do `try/catch` (a conexão pode estar indisponível; registrar e seguir; `'pending'` retentável; só a mensagem ao logger por CR-02 do 04-09; o teste que pina), outro explicando por que o incremento ficou fora do `try`.

Nada mais mudou no bloco: `results.errors.push(err.message)`, a guarda `if (logId !== null)`, `const parciais = err.resultadosParciais ?? []`, o `parciais.some(...)`, todo o ramo de retorno (incluindo o `results.notified++` de lá), o `allOk`, o `finally` e `runWeeklySummary` estão byte a byte iguais.

### Desvio de forma, declarado

O plano pedia o incremento **"dentro do mesmo ramo"** do `if/else` que o 04-14 criou. Isso é incompatível com o critério de aceite que exige **exatamente um** `catch (erroDeRegistro)`: manter o incremento dentro do ramo `'sent'` com a chamada protegida exigiria dois `try/catch`, um por ramo.

| Item | Plano | Entregue | Razão |
|---|---|---|---|
| Nº de `catch (erroDeRegistro)` | 1 (critério de aceite) | 1 | Um único `try` envolve o `if/else` inteiro do status |
| Posição do `results.notified++` | "fora do `try`, dentro do mesmo ramo" | fora do `try`, num `if` próprio abaixo do `catch` | As duas exigências do plano são incompatíveis entre si; a resolvida é a do critério de aceite, que é o contrato verificável |

O custo é exatamente o que o 04-14 quis evitar: `houveEnvioConfirmado` volta a ser testado em duas construções seguidas, que podem divergir. Mitigação **escrita no comentário e sustentada por oráculo**: quem as fizer divergir deixa vermelho o cenário A (contador `1` com linha `'sent'`) ou o cenário B (contador `0` com linha `'error'`) de `notificationStatus.partialFailure.test.js`. O `results.notified++` continua aparecendo em exatamente 2 linhas de código, e a do caminho de exceção (242) vem depois da linha do `catch` (221), como o critério exige.

### `backend/src/emailer.js` — só comentário

`git diff | grep -E "^[+-][^+-]" | grep -vE "^[+-][[:space:]]*//" | wc -l` imprime **`0`**. Nenhuma linha de código de `sendStaleNotification` ou `sendMailWithRetry` mudou: a fábrica inicial continua FORA do `try` (Q1-2), a anexação de `resultadosParciais` continua sendo a única linha de código com esse nome, e o `throw err` continua relançando o mesmo erro sem alterar mensagem nem tipo (D-03).

O que o comentário passou a dizer, em duas partes:

1. **O que o canal cobre:** a recriação do transporte dentro do retry falhando **com o banco vivo** — o cenário A de `notificationStatus.partialFailure.test.js`.
2. **O que ele NÃO resolve (WR2-02):** quando a exceção nasce de uma conexão SQLite indisponível, o agendador tentaria gravar pela mesma conexão e a gravação falharia junto. Esse caso tem outro desfecho, do lado do agendador: ele captura a falha do registro, a linha permanece `'pending'` e a rodada seguinte retenta, conforme `notificationStatus.registroResiliente.test.js`.

A frase foi escrita **sem nomear a função de desligamento** — a referência é ao estado ("conexão indisponível"), como o critério exige: `grep -ci "shutdown" backend/src/emailer.js` retorna `0`.

## O teste novo

`backend/test/notificationStatus.registroResiliente.test.js` (291 linhas, 1 cenário). Bootstrap copiado de `notificationStatus.partialFailure.test.js`, com duas diferenças que carregam comentário próprio:

1. **Dois deals por rodada** (`servirDeals(2201, 2202)`). É a única forma de provar "a rodada continua": com um deal só, não há como distinguir "seguiu" de "acabou porque não havia mais nada". `getStaleDeals` não reordena, então o primeiro id servido é o primeiro processado.
2. **Mock de `updateNotificationStatus` instalado ANTES do `require('../src/scheduler')`** (linha 159 vs 172). `scheduler.js` desestrutura a função no topo, e a desestruturação captura a **referência** no load — um mock aplicado depois não seria visto, o cenário ficaria verde já no RED e pagaríamos com falsa confiança (risco R2-17). O mock falha **só na primeira** chamada (`Error('The database connection is not open')`, mensagem fiel ao `better-sqlite3`) e delega para a referência real nas demais, que é o que permite ao segundo deal ser registrado normalmente.

O erro de envio nasce da **fábrica inicial** de `sendStaleNotification` — a que fica FORA do `try` daquela função. Isso é deliberado: assim o erro chega ao agendador **sem** `resultadosParciais`, o consumidor percorre o `?? []` que já existe hoje e **nada do escopo do 04-16 é exercitado**. Este arquivo não depende daquele conserto e não muda de desfecho com ele — que é o que torna o rollback dos dois planos independente.

PC-13 respeitado: o objeto de opções do transporte não é capturado, asserido nem impresso.

## Decisão do usuário no checkpoint C10 (vinculante, 2026-08-05)

**Registrado aqui como decisão do usuário, não como escolha do executor:**

1. **O trade-off do fail-safe está APROVADO.** Quando a gravação do desfecho falha, a linha fica `'pending'`, a rodada continua processando os demais deals, e a rodada seguinte **pode reenviar para quem já recebeu**. Palavras do usuário: *reenvio é o desfecho preferido — duplicata incômoda é aceitável; deixar alguém sem notificação não é.* A alternativa (o estado anterior) era abortar a rodada, deixando os deals restantes — e o próprio deal afetado — sem notificação nenhuma.
2. **O todo `in-01-status-pending-na-ui` MANTÉM prioridade média.** O usuário avaliou que este plano aumenta a frequência do estado `'pending'` (que renderiza como ✗ vermelho em `NotificationHistory.jsx:306`) e decidiu que isso **não** muda a prioridade. O arquivo do todo não foi editado.

Os demais pontos do C10 foram aceitos como apresentados: RED reproduzido com a correção da previsão (1 → 0), diff de `emailer.js` exclusivamente comentário, só `erroDeRegistro.message` no logger, `Array.isArray` ausente por ser escopo do 04-16, e o desvio de forma do incremento com um único `catch`.

## Verificação (todos os critérios do plano, medidos)

| Critério | Comando | Resultado |
|---|---|---|
| RED do Cenário D | `node --test test/notificationStatus.registroResiliente.test.js` (em `e781208`) | exit ≠ 0, `# fail 1`, `r.error = 'The database connection is not open'` |
| RED: deals perdidos | sonda descartável (removida) | `0 !== 2` — nem o deal que falhou entra em `results.deals` |
| Mock antes do require | `grep -n` do `mock.method` vs do `require('../src/scheduler')` | `159` < `172` |
| Pré-condições no teste | `grep -c "pré-condição:"` | `3` (≥ 2 exigidas) |
| Relógio falso | `grep -c "apis: \['Date', 'setTimeout'\]"` | `1` |
| Sem exercitar WR2-04 | `grep -c "Object.freeze"` | `0` |
| Task 1 sem tocar produção | `git diff --name-only backend/src/` durante a Task 1 | vazio |
| Cenário D verde | `node --test test/notificationStatus.registroResiliente.test.js` | exit 0, `# pass 1` |
| Sucesso parcial sem edição | `node --test test/notificationStatus.partialFailure.test.js` | `# pass 3` |
| REL-05/Q1 sem edição | `node --test test/notificationStatus.test.js` | `# pass 6` |
| REL-02 sem edição | `node --test test/emailer.timeout.test.js` | `# pass 9` |
| Fail-safe (REL-06) sem edição | `node --test test/scheduler.failsafe.test.js` | `# pass 8` |
| Resiliência (REL-03) sem edição | `node --test test/scheduler.resilience.test.js` | `# pass 5` |
| Testes vizinhos intocados | `git diff --name-only backend/test/` após a Task 2 | vazio |
| Guarda única | `grep -v '^\s*//' src/scheduler.js \| grep -c 'catch (erroDeRegistro)'` | `1` |
| Só a mensagem ao logger | idem, `erroDeRegistro.message` / `erroDeRegistro)$` | `1` / `0` |
| 04-16 não antecipado | idem, `err.resultadosParciais ?? []` / `Array.isArray` | `1` / `0` |
| Contador fora do try | `grep -n "catch (erroDeRegistro)\|results.notified++"` | `221` (catch) < `242` (incremento) |
| Incremento uma vez por caminho | `grep -v '^\s*//' \| grep -c 'results.notified++'` | `2` |
| Desligamento fora do comentário | `grep -ci "shutdown" src/emailer.js` | `0` |
| Anexação intocada | `grep -v '^\s*//' src/emailer.js \| grep -c 'resultadosParciais'` | `1` |
| Diff de `emailer.js` só comentário | `git diff … \| grep -E "^[+-][^+-]" \| grep -vE "^[+-][[:space:]]*//" \| wc -l` | `0` |
| Produção restrita a dois arquivos | `git diff --name-only backend/src/` | `scheduler.js`, `emailer.js` |
| `package.json` / lockfile | `git diff --name-only` | vazio |
| Suíte + cobertura | `npm run test:coverage` | exit 0, **144/144** |
| Lint | `npm run lint` | exit 0 (45 warnings, baseline do 04-14) |
| Format | `biome format` nos 3 arquivos | exit 0, "No fixes applied" |

Cobertura global: **58,49% linhas / 80,57% branches** (pisos 20/60). `scheduler.js` em 77,77% linhas / 74,60% branches — o ramo novo é exercitado pelo Cenário D.

## Decisions Made

1. **A falha do registro é capturada e logada, e a rodada segue** (D-WR2-02-a). O `catch` externo de `runCheck` existe para falhas da *verificação*; uma falha de *escrita de log* não pode usá-lo como destino.
2. **Só `erroDeRegistro.message` vai ao logger** (D-WR2-02-b). Um erro de borda carrega `config.headers` com o `AGENDOR_TOKEN` — é o achado CR-02 fechado no 04-09, e ele vale para toda chamada de log nova.
3. **O incremento acompanha a decisão de status, não a gravação** (D-WR2-02-c). Colocá-lo dentro do `try` faria a rodada reportar zero num dia em que o e-mail saiu e só a gravação falhou — a sub-contagem que o 04-14 acabou de fechar (risco R2-16 do plano).
4. **O consumidor do canal parcial não foi tocado** (D-WR2-02-d). `Array.isArray` continua ausente. Isso preserva o rollback independente que motivou a divisão entre 04-15 e 04-16: reverter este plano não desfaz o endurecimento do canal, e vice-versa.
5. **Um único `try` envolve o `if/else` do status** (desvio de forma declarado). As duas exigências do plano — "1 catch" e "incremento dentro do mesmo ramo" — são incompatíveis; prevaleceu o critério de aceite verificável, com a divergência mitigada por comentário e pelos oráculos A e B do sucesso parcial.

## Deviations from Plan

Nenhuma deviation de execução das Regras 1-4 (nenhum bug, funcionalidade crítica faltante ou bloqueio foi encontrado fora do escopo). Três ajustes prescritos pela medição ou pelos próprios critérios do plano, todos já detalhados acima:

1. **Previsão do RED corrigida pela medição:** `r.deals.length === 0`, não `1`. Reportar o número previsto teria sido afirmar em vez de medir — e teria escondido que a rodada perde também o deal que falhou.
2. **Ordem das asserções:** a pré-condição `r.deals[0].id === 2201` ficou depois da asserção de `r.deals.length`, porque antes dela produziria `TypeError` em vez de vermelho legível no estado defeituoso.
3. **Forma do `try/catch`:** um único `try` sobre o `if/else`, com o incremento num `if` próprio abaixo do `catch` (ver a tabela do desvio de forma).

Além disso, uma asserção não prescrita pelo plano foi acrescentada ao Cenário D: `enviosConfirmados === 2` como pré-condição de que o segundo deal **enviou de verdade** (dono e autor), e não apenas gravou uma linha. Ela nasceu de um warning de variável não usada do Biome — o contador estava sendo incrementado sem nunca ser lido. Em vez de silenciar o warning, o contador virou oráculo.

**Total deviations:** 0 (Regras 1-4)

## Issues Encountered

- **`npx` continua não funcionando nesta máquina** (mesmo achado do 04-12/04-13/04-14). O Biome foi invocado por caminho de pacote: `node backend/node_modules/.bin/biome …`.
- **Lint reporta 45 warnings**, idêntico ao baseline do 04-14; os três arquivos deste plano não acrescentam nenhum. `npm run lint` sai 0 (o gate).

## Threat Flags

Nenhuma superfície nova. Itens do registro do plano:

| Threat ID | Disposição | Como foi tratado | Evidência |
|---|---|---|---|
| T-04-15-01 | mitigate | `try/catch` na gravação do desfecho | Cenário D assere `r.deals.length === 2` e o segundo deal com linha `'sent'` |
| T-04-15-02 | mitigate | Só `erroDeRegistro.message` ao logger | grep não-comentário: `erroDeRegistro.message` = 1, objeto logado = 0 |
| T-04-15-03 | mitigate | `logger.error` com tag `[Scheduler]`, greppável por subsistema | a mensagem `[Scheduler] Falha ao registrar o desfecho do envio:` no bloco |
| T-04-15-04 | mitigate | Comentário de `emailer.js` troca o exemplo e declara o desfecho do caso não coberto | diff exclusivamente de comentário; `grep -ci shutdown` = 0 |
| T-04-15-05 | accept | Reenvio no dia seguinte por linha `'pending'` não deduplicante | **Aprovado pelo usuário no C10** (decisão registrada acima); escrito no comentário do bloco e pinado por `alreadyNotifiedToday(2201) === false` |
| T-04-15-06 | accept | `throw` de primitivo estourando em `results.errors.push(err.message)` antes de qualquer guarda | Lacuna conhecida e declarada; fechá-la mudaria outra instrução do `catch` |
| T-04-15-SC | accept | Nenhuma instalação de pacote | `backend/package.json` e lockfile sem diff |

## Known Stubs

Nenhum. Nenhum valor fixo, placeholder ou fonte de dados não ligada.

## User Setup Required

None.

## Next Phase Readiness

- **04-16 (WR2-04) está tecnicamente liberado, mas o despacho é do orquestrador** — o usuário instruiu explicitamente não entrar no 04-16 por conta própria. Aquele plano endurece o consumidor do canal parcial (`err.resultadosParciais ?? []` → `Array.isArray`), que este plano deixou **intocado** de propósito. O Cenário D não exercita aquele caminho (o erro nasce da fábrica inicial, sem parcial anexado), então os dois planos são revertíveis independentemente.
- **Ordem de rollback declarada** (risco R2-13), caso precisem voltar: 04-16, depois 04-15, depois 04-14.
- **`in-01-status-pending-na-ui` permanece em prioridade média** por decisão do usuário no C10, ciente de que este plano aumenta a frequência do estado.
- **SEC-01 permanece ABERTO** como risco conscientemente aceito (decisão C8) — nada neste plano o altera.
- **DECISÃO C9** (atualizar a redação do Success Criteria 4 do ROADMAP sobre REL-04) segue pendente para o **04-18**.
- **Próximo checkpoint bloqueante:** C11, no 04-17 (WR2-05). `auto_advance` deve continuar OFF.

## Self-Check: PASSED

- Arquivos declarados existem: `backend/test/notificationStatus.registroResiliente.test.js` (291 linhas), `backend/src/scheduler.js`, `backend/src/emailer.js`, `.planning/phases/04-confiabilidade-das-integra-es/04-15-SUMMARY.md`.
- Commits declarados existem: `e781208` (RED), `40eaf54` (GREEN).
- Nenhum arquivo temporário deixado para trás: a sonda `_tmp-red-probe.test.js` foi removida e nunca commitada; `git status --short` limpo após cada commit.

---
*Phase: 04-confiabilidade-das-integra-es*
*Completed: 2026-08-05*
