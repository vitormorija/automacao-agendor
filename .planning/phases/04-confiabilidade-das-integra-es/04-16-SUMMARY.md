---
phase: 04-confiabilidade-das-integra-es
plan: 16
subsystem: scheduler
tags: [rel-05, wr2-04, canal-parcial, fail-safe, sloppy-mode, tdd]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "04-10 (canal err.resultadosParciais + houveEnvioConfirmado governando o status nos dois caminhos), 04-13 (avancarRelogioAte com desfecho normalizado), 04-14 (results.notified++ no ramo de excecao), 04-15 (try/catch proprio na gravacao do desfecho, no MESMO catch)"
provides:
  - "O consumidor do canal parcial valida o TIPO do que recebe: ausencia E corrupcao viram 'nada confirmado', com desfecho fail-safe (linha 'error', retentavel amanha)"
  - "Um parcial de tipo errado deixou de derrubar o `for` dos deals — a rodada continua e os negocios seguintes sao notificados"
  - "O produtor (emailer.js) declara por escrito que anexar o parcial pode falhar EM SILENCIO (erro congelado / throw de primitivo, sloppy mode do CommonJS)"
  - "notificationStatus.canalParcial.test.js (Cenario E) como oraculo do canal corrompido"
affects: [04-17, 04-18, verificacao-da-fase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canal improvisado entre modulos (propriedade anexada a um erro) e validado por TIPO no consumidor, nao so por ausencia"
    - "Erro CONGELADO (Object.freeze) como instrumento de teste: reproduz deterministicamente a anexacao que falha sem TypeError em sloppy mode"
    - "Indice do transporte preso no fecho do mock de createTransport para distinguir o transporte do 1o deal do transporte do 2o, sem inspecionar o objeto de opcoes (PC-13)"

key-files:
  created:
    - backend/test/notificationStatus.canalParcial.test.js
  modified:
    - backend/src/scheduler.js
    - backend/src/emailer.js

key-decisions:
  - "D-WR2-04-a aplicada: o canal ATUAL foi endurecido (validacao de tipo no consumidor); o contrato de sendStaleNotification nao mudou"
  - "D-WR2-04-b aplicada: o produtor MANTEM a anexacao e passa a documentar que ela pode falhar em silencio"
  - "D-WR2-04-c respeitada: notificationStatus.test.js nao foi alterado"
  - "D-WR2-04-d respeitada: plano autonomo, sem checkpoint — o trade-off do fail-safe ja fora aprovado no C10 (04-15)"
  - "Desvio de forma declarado: a expressao prescrita nao cabe em 80 colunas e o Biome a quebra em 3 linhas — o diff de codigo de scheduler.js tem 4 linhas (1 statement removido, 1 statement acrescentado), nao 2"

patterns-established:
  - "RED medido pela saida literal do runner E a previsao do plano corrigida por sonda descartavel (r.deals.length: previsto 1, medido 0) — segunda ocorrencia do mesmo achado estrutural do 04-15"

requirements-completed: [REL-05]

# Metrics
duration: 16min
completed: 2026-08-05
---

# Phase 04 Plan 16: o canal do resultado parcial é validado antes de ser consumido (WR2-04) Summary

**Um `err.resultadosParciais` de tipo errado — o que sobra quando a anexação do produtor falha em silêncio num erro congelado — fazia o `.some` lançar DENTRO do `catch` do bloco de envio e apagava a rodada inteira; agora ausência e corrupção do canal são lidas do mesmo jeito ("nada confirmado"), a linha vai para `'error'` e os deals seguintes continuam sendo notificados.**

## Performance

- **Duration:** ~16 min
- **Tasks:** 2 de 2 (RED + GREEN); plano autônomo, sem checkpoint
- **Files:** 1 criado, 2 modificados
- **Diff de produção:** 1 statement trocado em `scheduler.js` (+ comentário); `emailer.js` **só comentário**

## Accomplishments

- **WR2-04 fechado.** O consumidor fazia `const parciais = err.resultadosParciais ?? [];` e chamava `.some`. O `??` protege contra ausência, não contra tipo: um valor de outra natureza fazia o `.some` lançar **de dentro do próprio `catch`**, a exceção subia para o `catch` externo de `runCheck` e o `for` dos deals morria ali.
- **A origem do valor errado foi reproduzida, não suposta.** O Cenário E injeta um erro **congelado** (`Object.freeze`) que já carrega `resultadosParciais` com tipo errado. Em sloppy mode — todo módulo CommonJS deste backend — a anexação do produtor sobre ele **não levanta `TypeError`**: simplesmente não acontece, e o valor errado chega intacto ao consumidor. Uma pré-condição do teste assere isso diretamente, depois da rodada.
- **O desfecho passou a ser fail-safe em vez de catastrófico.** Com o canal corrompido: linha `'error'` (não deduplica → a rodada de amanhã retenta) e a rodada segue. Antes: `'pending'` e **nenhum** dos deals restantes processado. Nos dois estados o deal afetado é retentável — o que muda é que os **outros** deals deixam de ser perdidos. Nenhum destinatário recebe a mais nem a menos por causa desta mudança.
- **O trabalho do 04-15 sobreviveu ao diff.** O `catch (erroDeRegistro)` continua sendo exatamente 1 e o `results.notified++` do 04-14 continua aparecendo em exatamente 2 linhas de código, uma por caminho. `notificationStatus.registroResiliente.test.js` verde sem edição.
- **Nenhum arquivo de teste vizinho teve asserção alterada.** `git diff --name-only backend/test/` vazio ao final da Task 2.
- Suíte: **145/145 verdes** (144 → 145, exatamente o cenário novo); cobertura acima dos pisos; `npm run lint` exit 0.

## Task Commits

1. **Task 1: RED — um canal parcial corrompido derruba o restante da rodada** — `184969f` (test)
2. **Task 2: GREEN — consumidor validado por tipo e produtor que declara a própria fragilidade** — `faca7b0` (fix)

## RED medido, não afirmado — e a previsão do plano corrigida de novo

Saída literal de `node --test test/notificationStatus.canalParcial.test.js` em `184969f` (sobre o código **já com o 04-15 aplicado**):

```
# 2026-06-01T00:00:00.000Z [INFO] [Scheduler] Iniciando verificação — threshold: 15 dias
# [Emailer] Tentativa 1 falhou (Connection timeout ao entregar a mensagem). Aguardando 3s antes de retentar...
# 2026-06-01T00:00:10.000Z [ERROR] [Scheduler] Erro na verificação: TypeError: parciais.some is not a function
#     at runCheck (/Users/vitormorija/Automacao_agendor/backend/src/scheduler.js:197:26)
# Subtest: E: um resultado parcial de tipo errado não pode abortar a rodada — a linha vai para "error" e o deal seguinte é notificado
not ok 1 - E: um resultado parcial de tipo errado não pode abortar a rodada — a linha vai para "error" e o deal seguinte é notificado
  ---
  failureType: 'testCodeFailure'
  error: |-
    um parcial de tipo errado não pode abortar a rodada

    + actual - expected

    + 'parciais.some is not a function'
    - undefined

  code: 'ERR_ASSERTION'
# tests 1
# pass 0
# fail 1
```

Três leituras que valem registrar:

1. **A pré-condição do plano se confirmou:** com o 04-15 já no lugar, o Cenário E **continua vermelho**. O `.some` sobre um valor não-array acontece **antes** da chamada de gravação que o 04-15 envolveu em `try/catch` — as duas correções são independentes, e não houve divergência de estado que exigisse parar.
2. **A prova operacional apareceu na linha do próprio SUT:** `[ERROR] [Scheduler] Erro na verificação: TypeError: parciais.some is not a function`. O stack aponta para `scheduler.js:197` — o `.some` dentro do `catch`, exatamente o ponto que WR2-04 nomeia. O runner ainda registra a tentativa de retry logo acima, provando que o caminho medido é o da **recriação do transporte dentro do `try`**.
3. **As três pré-condições passaram antes do vermelho** — inclusive `ERRO_CONGELADO.resultadosParciais === 'isto não é um array'`, que é a prova de que a anexação do produtor falhou em silêncio e o valor errado atravessou intacto. O vermelho é sobre o desfecho da rodada, não sobre o caminho não ter sido percorrido (risco R2-20 fechado por medição).

### Divergência medida: `r.deals.length === 0`, não `1`

O plano previa `r.deals.length === 1` no RED. O valor **medido** é `0`, pela mesma razão estrutural que o 04-15 já havia descoberto: `results.deals.push(dealResult)` fica **depois** do `try/catch` do bloco de envio, dentro do corpo do `for` — quando a exceção escapa, ela pula o push, e a rodada perde também o registro do deal que disparou a falha.

Sondado com uma cópia descartável do arquivo de teste (`_tmp-red-probe.test.js`, apenas a asserção de `r.error` removida para revelar a seguinte), removida em seguida e **nunca commitada**:

```
not ok 1 - E: um resultado parcial de tipo errado não pode abortar a rodada — …
  error: |-
  expected: 2
  actual: 0
```

O critério de aceite do plano admitia a variação (`r.deals.length === 1` **e/ou** `r.error` preenchido), e o `r.error` preenchido foi confirmado.

## O diff de produção

### `backend/src/scheduler.js` — 1 statement

```diff
-            const parciais = err.resultadosParciais ?? [];
+            const parciais = Array.isArray(err?.resultadosParciais)
+              ? err.resultadosParciais
+              : [];
```

Mais um bloco de comentário explicando a **decisão**: o `??` só protege contra ausência; um valor de outro tipo faria o `.some` lançar dentro do `catch` e abortar o `for`; ausência **e** corrupção passam a ser lidas como "nada confirmado", com desfecho fail-safe (linha `'error'`, retentável amanhã, trade-off aprovado no C10); e o encadeamento opcional é **defensivo e não protege contra `throw null`**, porque `results.errors.push(err.message)` — primeira instrução do `catch` — já teria estourado antes. Lacuna conhecida e declarada.

Conforme a regra do plano (risco R2-22), o comentário **descreve a guarda em prosa** e não reproduz a expressão literal, para que o grep de aceite continue medindo a linha de código.

Nada mais mudou no bloco: `results.errors.push(err.message)`, a guarda `if (logId !== null)`, o `parciais.some(...)`, o `try/catch (erroDeRegistro)` do 04-15, a decisão de status, o `if (houveEnvioConfirmado) results.notified++` do 04-14, todo o ramo de retorno, o `allOk`, o `finally` e `runWeeklySummary` estão byte a byte iguais.

### Desvio de forma, declarado

| Item | Plano | Entregue | Razão |
|---|---|---|---|
| Linhas de código no diff de `scheduler.js` | exatamente `2` | `4` | A expressão prescrita por **D-WR2-04-a** ocupa 98 colunas com a indentação do bloco; o `lineWidth` padrão do Biome é 80, e `biome format` a quebra em ternário de 3 linhas. Manter em uma linha exigiria desativar o formatador que o `CLAUDE.md` torna obrigatório |

O **intento** do critério — "nada além da linha do consumidor mudou" — está integralmente satisfeito e é verificável no diff acima: **um** statement removido, **um** statement acrescentado, zero outras linhas de código. A contagem de 4 é consequência da quebra do formatador sobre o mesmo statement, não de trabalho extra. O grep de aceite que importa (`Array.isArray(err?.resultadosParciais)` = 1 em linha não-comentário) continua valendo, porque a chamada permanece inteira na primeira linha do ternário.

### `backend/src/emailer.js` — só comentário

`git diff | grep -E "^[+-][^+-]" | grep -vE "^[+-][[:space:]]*//" | wc -l` imprime **`0`**. Nenhuma linha de código mudou: o `try` continua envolvendo apenas os dois blocos de envio, a fábrica inicial continua **fora** dele (Q1-2), `err.resultadosParciais = results` continua sendo a única linha de código com esse nome, o `throw err` continua relançando o mesmo erro sem alterar mensagem nem tipo (D-03), e `sendMailWithRetry` não foi tocada (a propagação do transporte vivo é escopo do 04-17).

O que o comentário passou a declarar, **sem desfazer a reescrita do 04-15**:

- anexar o parcial **pode falhar em silêncio** — num erro congelado (`Object.freeze`, ou um erro singleton de biblioteca) módulos CommonJS em sloppy mode não levantam `TypeError`, e um `throw` de primitivo nem chega a entrar na guarda de tipo;
- num erro congelado, um valor pré-existente com esse nome, **de qualquer tipo**, sobrevive intacto até o consumidor;
- por isso o agendador valida o **tipo** do que recebe e lê tanto a ausência quanto a corrupção como "nada confirmado", com desfecho fail-safe: linha `'error'`, não deduplica, a rodada de amanhã retenta.

## O teste novo

`backend/test/notificationStatus.canalParcial.test.js` (317 linhas, 1 cenário). Bootstrap copiado de `notificationStatus.partialFailure.test.js` (tmpDb + `DB_PATH` antes do `require('./setup')`, `installFakeAxios` antes dos requires de `src/`, stub de `nodemailer.createTransport` com variáveis mutáveis de módulo, `notify_author = 'true'`, `FIXED_NOW`, `MOLDE` = deal 101, `linhasDoDeal`), com três diferenças que carregam comentário próprio:

1. **Dois deals por rodada** (`servirDeals(2203, 2204)`), padrão herdado do 04-15 — a única forma de distinguir "a rodada seguiu" de "a rodada acabou porque não havia mais nada".
2. **A gravação do desfecho NÃO é substituída por mock** (`grep -c "updateNotificationStatus"` = **0** no arquivo). Aqui o registro funciona; o caso quebra exclusivamente pelo canal. É isso que mantém 04-15 e 04-16 revertíveis de forma independente.
3. **Índice do transporte preso no fecho** do stub de `createTransport`: é ele que faz os envios do **primeiro** deal falharem (erro de rede → retry → recriação que lança o erro congelado) e os do **segundo** funcionarem, sem inspecionar o objeto de opções. PC-13 respeitado: aquele objeto não é capturado, asserido nem impresso.

## Verificação (todos os critérios do plano, medidos)

| Critério | Comando | Resultado |
|---|---|---|
| RED do Cenário E (com o 04-15 já aplicado) | `node --test test/notificationStatus.canalParcial.test.js` (em `184969f`) | exit `1`, `# fail 1`, `r.error = 'parciais.some is not a function'` |
| RED: deals perdidos | sonda descartável (removida) | `0 !== 2` — previsão do plano (`1`) corrigida pela medição |
| Erro congelado no teste | `grep -c "Object.freeze"` | `2` (≥ 1 exigido) |
| Registro NÃO mockado | `grep -c "updateNotificationStatus"` | `0` |
| Pré-condições no teste | `grep -c "pré-condição:"` | `4` (≥ 2 exigidas) |
| Relógio falso | `grep -c "apis: \['Date', 'setTimeout'\]"` | `1` |
| Tamanho do arquivo | `wc -l` | `317` (≥ 110 exigidas) |
| Task 1 sem tocar produção | `git diff --name-only backend/src/` durante a Task 1 | vazio |
| Task 1 sem tocar vizinhos | `git diff --name-only` dos 4 arquivos citados | vazio |
| Cenário E verde | `node --test test/notificationStatus.canalParcial.test.js` | exit 0, `# pass 1` |
| WR2-02 sem edição | `node --test test/notificationStatus.registroResiliente.test.js` | exit 0, `# pass 1` |
| Sucesso parcial sem edição | `node --test test/notificationStatus.partialFailure.test.js` | exit 0, `# pass 3` |
| REL-05/Q1 sem edição | `node --test test/notificationStatus.test.js` | exit 0, `# pass 6` |
| REL-02 sem edição | `node --test test/emailer.timeout.test.js` | exit 0, `# pass 9` |
| Fail-safe (REL-06) sem edição | `node --test test/scheduler.failsafe.test.js` | exit 0, `# pass 8` |
| Resiliência (REL-03) sem edição | `node --test test/scheduler.resilience.test.js` | exit 0, `# pass 5` |
| Testes vizinhos intocados | `git diff --name-only backend/test/` após a Task 2 | vazio |
| Guarda nova presente | `grep -v '^\s*//' src/scheduler.js \| grep -c 'Array.isArray(err?.resultadosParciais)'` | `1` |
| Consumidor antigo ausente | idem, `err.resultadosParciais ?? []` | `0` |
| 04-15 no lugar | idem, `catch (erroDeRegistro)` | `1` |
| 04-14 no lugar | idem, `results.notified++` | `2` |
| `.some` preservado | idem, `parciais.some` | `1` |
| Diff de código de `scheduler.js` | `git diff \| grep -E "^[+-][^+-]" \| grep -vE "^[+-][[:space:]]*//" \| wc -l` | `4` — **desvio declarado** (1 statement removido, 1 acrescentado, quebrado em 3 linhas pelo Biome) |
| Anexação intocada | `grep -v '^\s*//' src/emailer.js \| grep -c 'resultadosParciais'` | `1` |
| Diff de `emailer.js` só comentário | `git diff \| grep -E "^[+-][^+-]" \| grep -vE "^[+-][[:space:]]*//" \| wc -l` | `0` |
| Fragilidade declarada | `grep -ci "sloppy\|congelado" src/emailer.js` | `3` (≥ 1 exigido) |
| Produção restrita a dois arquivos | `git diff --name-only backend/src/` | `emailer.js`, `scheduler.js` |
| `package.json` / lockfile | `git diff --name-only` | vazio |
| Suíte + cobertura | `npm run test:coverage` | exit 0, **145/145** |
| Lint | `npm run lint` | exit 0 (45 warnings, mesmo baseline do 04-15) |
| Format | `biome format` nos 3 arquivos | exit 0, "No fixes applied" |

Cobertura global: **58,89% linhas / 80,80% branches** (pisos 20/60). `scheduler.js` em 78,75% linhas / 75% branches — o ramo novo é exercitado pelo Cenário E.

## Decisions Made

1. **O canal atual foi endurecido, não substituído** (D-WR2-04-a). O contrato de `sendStaleNotification` não mudou: ela continua lançando, e o parcial continua viajando anexado ao erro. A alternativa do review (devolver `{ results, erro }`) mudaria o contrato pinado por `notificationStatus.test.js` (Q1-2) e está **fora desta rodada por escopo travado do usuário**.
2. **Ausência e corrupção do parcial têm o MESMO significado** (D-WR2-04-b). Ler qualquer uma como "nada confirmado" é o que torna o desfecho fail-safe previsível: a linha vai para `'error'`, não deduplica, e a rodada de amanhã retenta.
3. **A lacuna do `throw null` fica declarada, não fechada.** `results.errors.push(err.message)` é a primeira instrução do `catch` e já estouraria antes de qualquer guarda deste plano. O `?.` da expressão nova é defensivo e o comentário diz explicitamente que ele **não** deve ser vendido como proteção contra `throw null` — fechá-la mudaria outra instrução do `catch` e é escopo de outra rodada.
4. **O formatador venceu a contagem literal do critério de aceite** (desvio de forma declarado). Entre reproduzir a expressão de D-WR2-04-a e manter o diff em 2 linhas, prevaleceu a expressão — a contagem era um proxy do intento ("nada além do consumidor mudou"), e esse intento está verificado diretamente pelo diff.

## Deviations from Plan

Nenhuma deviation de execução das Regras 1-4 (nenhum bug, funcionalidade crítica faltante ou bloqueio foi encontrado fora do escopo). Três ajustes prescritos pela medição ou por incompatibilidade interna do próprio plano, todos detalhados acima:

1. **Previsão do RED corrigida pela medição:** `r.deals.length === 0`, não `1` — mesmo achado estrutural que o 04-15 já havia registrado, confirmado de novo por sonda descartável.
2. **Ordem das asserções:** as pré-condições que só valem no estado corrigido (`transportesCriados === 3`) ficaram **depois** das asserções centrais, e uma versão fraca (`transportesCriados >= 2`, que vale nos dois estados) ficou antes. Colocar a contagem forte no topo produziria, no RED, um vermelho sobre o instrumento em vez de sobre o defeito.
3. **Contadores de envio separados:** o plano prescrevia `enviosConfirmados === 0` como pré-condição rotulada "nenhum destinatário do primeiro deal confirmou". Essa asserção é auto-contraditória no estado corrigido, em que o **segundo** deal envia de verdade e o contador total termina em `2`. Foi implementada como `enviosConfirmadosDoPrimeiroDeal === 0` (a pré-condição, com o rótulo do plano) mais `enviosConfirmados === 2` (a prova de que a rodada continuou fazendo o seu trabalho, e não apenas de que não estourou).

Além disso, uma pré-condição não prescrita foi acrescentada: `ERRO_CONGELADO.resultadosParciais === 'isto não é um array'`, avaliada **depois** da rodada. Ela fecha o risco R2-20 pela raiz — prova que a anexação do produtor não sobrescreveu o valor, ou seja, que ela falhou em silêncio e o canal chegou corrompido ao consumidor.

**Total deviations:** 0 (Regras 1-4)

## Issues Encountered

- **`npx` continua não funcionando nesta máquina** (mesmo achado do 04-12/04-13/04-14/04-15). O Biome foi invocado por caminho de pacote: `node backend/node_modules/.bin/biome …`.
- **Lint reporta 45 warnings**, idêntico ao baseline do 04-15; os três arquivos deste plano não acrescentam nenhum. `npm run lint` sai 0 (o gate).

## Threat Flags

Nenhuma superfície nova. Itens do registro do plano:

| Threat ID | Disposição | Como foi tratado | Evidência |
|---|---|---|---|
| T-04-16-01 | mitigate | Validação de tipo antes do `.some` | Cenário E assere `r.deals.length === 2` e o segundo deal com linha `'sent'` |
| T-04-16-02 | mitigate | Ausência e corrupção lidas como "nada confirmado" (fail-safe `'error'`) | linha do 2203 em `'error'` com `enviosConfirmadosDoPrimeiroDeal === 0` |
| T-04-16-03 | mitigate | Comentário do produtor declara a falha silenciosa da anexação e o desfecho fail-safe | `grep -ci "sloppy\|congelado"` = 3; diff de `emailer.js` exclusivamente comentário |
| T-04-16-04 | mitigate | Bloco lido inteiro antes de editar; estado do 04-15 confirmado no arquivo real | `catch (erroDeRegistro)` = 1 e `results.notified++` = 2 depois do diff; `registroResiliente` verde sem edição |
| T-04-16-05 | accept | Linha `'error'` não deduplicante → possível reenvio amanhã | Mesmo trade-off aprovado no C10 (04-15); pinado por `alreadyNotifiedToday(2203) === false`. Hoje a mesma linha já ficaria `'pending'`, igualmente retentável |
| T-04-16-06 | accept | `throw null` estourando em `results.errors.push(err.message)` antes da guarda | Lacuna conhecida, declarada no comentário do bloco |
| T-04-16-SC | accept | Nenhuma instalação de pacote | `backend/package.json` e lockfile sem diff |

## Known Stubs

Nenhum. Nenhum valor fixo, placeholder ou fonte de dados não ligada.

## User Setup Required

None.

## Next Phase Readiness

- **04-17 (WR2-05) é o próximo, e ele traz o checkpoint bloqueante C11.** `auto_advance` deve continuar **OFF**. Aquele plano mexe em `sendMailWithRetry` (propagação do transporte vivo), que este plano deixou **intocada** de propósito.
- **Ordem de rollback declarada**, caso precisem voltar: 04-17, 04-16, 04-15, 04-14. Reverter este plano volta ao `?? []` sem validação de tipo e **não** desfaz a proteção da gravação do desfecho (04-15).
- **`emailer.timeout.test.js` mantém a sua cópia local de `avancarRelogioAte`** de propósito — ela é oráculo de REL-02 e o `emailer.js` ainda muda no 04-17.
- **SEC-01 permanece ABERTO** como risco conscientemente aceito (decisão C8) — nada neste plano o altera.
- **DECISÃO C9** (atualizar a redação do Success Criteria 4 do ROADMAP sobre REL-04) segue pendente para o **04-18**, junto de WR2-06 e dos todos IN2-01..IN2-04.

## Self-Check: PASSED

- Arquivos declarados existem: `backend/test/notificationStatus.canalParcial.test.js` (317 linhas), `backend/src/scheduler.js`, `backend/src/emailer.js`, `.planning/phases/04-confiabilidade-das-integra-es/04-16-SUMMARY.md`.
- Commits declarados existem: `184969f` (RED), `faca7b0` (GREEN).
- Nenhum arquivo temporário deixado para trás: a sonda `_tmp-red-probe.test.js` foi removida e nunca commitada; `git status --short` limpo após cada commit.

---
*Phase: 04-confiabilidade-das-integra-es*
*Completed: 2026-08-05*
