---
phase: 04-confiabilidade-das-integra-es
plan: 20
subsystem: agendador-decisao-de-envio
tags: [cr3-01, blocker, fail-open, categoria-indecidivel, rel-05, rel-06, gap-closure-r3]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "04-19 (campo categoriaIndecidivel no objeto de negocio, produzido por getStaleDeals); 04-13 (avancarRelogioAte com os dois ramos); 04-14/04-15/04-16 (o bloco de envio logo abaixo da guarda nova, que este plano precisa preservar byte a byte)"
provides:
  - "Guarda por deal.categoriaIndecidivel no laco de runCheck: quem o sistema nao consegue classificar NAO recebe e-mail e NAO gera linha no notification_log"
  - "A rodada NAO aborta por uma organizacao inatingivel — guarda com continue, nunca com throw"
  - "O negocio suprimido permanece em results.deals com skipped: true e skipReason escrito (a outra metade da decisao do usuario)"
  - "3 cenarios end-to-end em scheduler.categoriaIndecidivel.test.js, incluindo o SIMETRICO (falha na 2a posicao da rodada)"
affects: [04-21, verificacao-da-fase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A guarda de elegibilidade nova copia a FORMA das vizinhas (dedup e funil) em vez de inventar uma: skipped, skipReason, results.skipped++, push, continue — o proximo leitor reconhece a construcao sem reler o bloco"
    - "Destinatarios DISTINTOS por negocio no teste end-to-end: sem isso 'zero envios para os destinatarios do 1o' seria indistinguivel de 'zero envios na rodada'"
    - "Cenario SIMETRICO como ordem INVERSA da rodada — o que separa 'a guarda funciona' de 'a guarda funciona porque o afetado calhava de ser o primeiro'"

key-files:
  created:
    - backend/test/scheduler.categoriaIndecidivel.test.js
  modified:
    - backend/src/scheduler.js

key-decisions:
  - "D-CR3-01-h respeitada: a guarda mora DEPOIS da dedup e ANTES da guarda de funil, com a mesma forma das vizinhas"
  - "D-CR3-01-i respeitada por medicao: nenhuma linha no notification_log para o indecidivel — `logNotification(` continua em 1 e os cenarios A e B asserem linhasDoDeal(...).length === 0"
  - "D-CR3-01-j respeitada: a guarda NAO loga; o logger.warn nomeando a organizacao ja sai em getStaleDeals (04-19) e repetir aqui duplicaria uma linha por negocio sem informacao nova"
  - "D-CR3-01-k respeitada: `continue`, nunca `throw` — r.error === undefined asserido em A e B"
  - "PC-13 satisfeito POR CONSTRUCAO: a fabrica de transporte ignora o objeto de opcoes (que carrega auth.pass); o stub de sendMail le exclusivamente mailOptions.to"

patterns-established:
  - "O cenario SIMETRICO desta rodada e a ORDEM INVERSA da rodada, nao uma variacao do dado — e o acoplamento posicional que um `continue` mal colocado produziria sem nenhum caso vermelho para acusa-lo"

requirements-completed: [REL-05, REL-06]

# Metrics
duration: 16min
completed: 2026-08-05
---

# Phase 04 Plan 20: a guarda de categoria indecidível no laço de runCheck (CR3-01, 2/3) Summary

**O 04-19 produziu a informação na borda e ninguém a lia — com a borda já corrigida, o agendador continuava enviando e-mail para um negócio cuja categoria de organização ele não conseguiu consultar, e o log da rodada dizia "2 notificações enviadas" num dia em que uma das duas organizações era inatingível; agora uma guarda de 8 linhas no laço de `runCheck`, entre a dedup e a de funil, tira o negócio indecidível do envio sem gerar linha no `notification_log` e sem abortar a rodada — medido nas DUAS ordens possíveis (falha no 1º e no 2º negócio) e com o caso de rodada sã pinando que a guarda não é larga demais.**

## Performance

- **Duration:** ~16 min
- **Tasks:** 2 de 2 (plano autônomo, sem checkpoint)
- **Commits:** 2 (1 por tarefa)
- **Suíte:** 153 → **156** (os 3 cenários novos), `npm run test:coverage` exit 0, `npm run lint` exit 0 (44 warnings, baseline)

## Accomplishments

### Task 1 — RED, com a saída literal

`backend/test/scheduler.categoriaIndecidivel.test.js`, 3 cenários. **A previsão do plano bateu exatamente:** A e B vermelhos, C já verde.

```
# 2026-06-01T00:00:20.000Z [WARN] [Agendor] Categoria indecidível: a organização "Org 2401"
#   (id 2401) não pôde ser consultada. O negócio 2301 fica FORA do envio e permanece no painel.
# 2026-06-01T00:00:20.000Z [INFO] [Scheduler] Concluído: 2 negócios parados, 2 notificações enviadas

not ok 1 - A: negócio de categoria indecidível não recebe e-mail nem linha de log, ...
    o negócio indecidível é marcado como ignorado, não removido
    false !== true

# 2026-06-01T00:00:20.000Z [WARN] [Agendor] Categoria indecidível: a organização "Org 2412"
#   (id 2412) não pôde ser consultada. O negócio 2312 fica FORA do envio e permanece no painel.
# 2026-06-01T00:00:20.000Z [INFO] [Scheduler] Concluído: 2 negócios parados, 2 notificações enviadas

not ok 2 - B: SIMÉTRICO — a falha na organização do SEGUNDO negócio produz o espelho exato ...
    false !== true

ok 3 - C: rodada sã — sem falha de categoria, os dois negócios são notificados e nenhum é ignorado
# tests 3 / # pass 1 / # fail 2
```

**A prova operacional do fail-open está nas DUAS linhas de log acima, não só na asserção:** o próprio SUT emite o `logger.warn` do 04-19 dizendo que o negócio "fica FORA do envio" e, quatro linhas depois, reporta `2 notificações enviadas` numa rodada de 2 negócios — ou seja, o negócio que o sistema acabou de declarar indecidível recebeu e-mail. O comentário do conserto anterior declarava um estado que o próprio sistema não entregava; é exatamente o padrão que reabriu esta fase três vezes.

A asserção que reprova primeiro é `skipped === true` (o negócio chega ao resultado como notificado, não ignorado). As asserções de envio e de `notification_log` ficam depois dela por desenho — no estado defeituoso elas também estariam vermelhas, mas o primeiro vermelho legível é o que diz *o que* a guarda deveria ter feito.

**Commit:** `151b233`

### Task 2 — GREEN

Uma mudança em `backend/src/scheduler.js`, e nada além dela: **20 inserções, 0 remoções**. Nenhuma linha existente foi tocada — o bloco de envio, o insert `'pending'`, a decisão de status, o `try/catch` de gravação do 04-15, os dois `results.notified++` do 04-14 e a validação do canal parcial do 04-16 estão byte a byte.

A guarda, imediatamente depois da dedup e antes da de funil, copia a forma das vizinhas:

| Elemento | Valor |
|---|---|
| Condição | `deal.categoriaIndecidivel` |
| Marca | `dealResult.skipped = true` |
| Motivo | `'categoria da organização não pôde ser consultada — negócio não notificado'` |
| Contador | `results.skipped++` |
| Visibilidade | `results.deals.push(dealResult)` |
| Desfecho | `continue` (nunca `throw`) |

O comentário de 11 linhas registra a DECISÃO, não a mecânica: por que não saber a categoria é indistinguível de "pode ser uma categoria excluída" (mesma regra da Decisão Q2 / REL-06), as duas metades da decisão do usuário de 2026-08-05 (fora do envio **e** dentro do painel), que a rodada não aborta, que nenhuma linha entra no `notification_log` e que o aviso nomeando a organização já sai em `getStaleDeals`. Cita `scheduler.categoriaIndecidivel.test.js` como oráculo.

Os 3 cenários ficaram verdes e os **6 arquivos vizinhos passaram sem edição**: `notificationStatus` (6), `notificationStatus.partialFailure` (3), `notificationStatus.registroResiliente` (1), `notificationStatus.canalParcial` (1), `scheduler.failsafe` (8), `scheduler.resilience` (5).

**Commit:** `c8e3ec5`

## Medições (contadas, não inferidas)

| Item | Medido | Critério do plano | Bate? |
|---|---|---|---|
| `categoriaIndecidivel` em `scheduler.js` (não-comentário) | **1** | 1 | sim |
| `results.notified++` (não-comentário) | **2** | 2 | sim |
| `catch (erroDeRegistro)` | **1** | 1 | sim |
| `Array.isArray(err?.resultadosParciais)` | **1** | 1 | sim |
| `skipReason` (não-comentário) | **2** | 2 | sim |
| `logNotification(` (não-comentário) | **1** | 1 | sim |
| `git diff --name-only backend/src/` | **só `scheduler.js`** | só `scheduler.js` | sim |
| `git diff --name-only backend/test/` na Task 2 | **vazio** | vazio | sim |
| `^test(` no arquivo novo | **3** | 3 | sim |
| `simétrico` no arquivo novo (case-insensitive) | **4** | ≥ 1 | sim |
| `^before(` no arquivo novo | **0** | 0 | sim |
| `organization:` no arquivo novo | **2** | ≥ 2 | sim |
| Linhas do arquivo novo | **382** | ≥ 140 | sim |
| Diff de `scheduler.js` | **20 inserções, 0 remoções** | — | sim |
| Suíte | **156** | 153 + 3 | sim |
| `npm run test:coverage` | exit **0** | exit 0 | sim |
| `npm run lint` | exit **0**, 44 warnings | exit 0 | sim |

**Todos os critérios de aceite numéricos bateram.** Nenhum se mostrou aritmeticamente impossível — como no 04-19, e diferente de 04-15/16/17.

### Um número que MUDOU e não é critério deste plano

`continue;` em linhas não-comentário de `scheduler.js`: **2 → 3**. É esperado e correto — a guarda nova É um `continue`. A proibição de `continue` novo (D-CR3-01-e) valia para `agendor.js` no 04-19, onde acrescentar um significaria REMOVER o negócio da lista e violar a decisão do usuário. Aqui o `continue` faz o oposto: pula o bloco de **envio**, e o `results.deals.push(dealResult)` da própria guarda mantém o negócio no resultado. Registrado para que a próxima rodada de review não leia a divergência como regressão.

## Como os cenários foram construídos (e por que assim)

**Organizações distintas por negócio.** `organizacaoDe(dealId) = dealId + 100`, e cada clone do molde 101 carrega a sua. Com uma organização só, a falha injetada atingiria os dois negócios e o cenário perderia a testemunha que prova que a rodada seguiu.

**Destinatários distintos por negócio.** O molde da fixture compartilha dono (11) e autor (21) entre clones; aqui cada negócio recebe o seu par (31/41 e 32/42, com quatro e-mails diferentes). Sem isso, "zero envios para os destinatários do primeiro negócio" seria indistinguível de "zero envios na rodada inteira" — o contador `enviosPorDestinatario` não teria como atribuir o envio ao negócio certo.

**Relógio rearmado por caso.** `mock.timers.reset()` + `enable()` no `beforeEach` (zero `before(` no arquivo). Cada cenário com falha persistente avança 15s de relógio falso pelas esperas de 5s/10s do retry, e o cutoff de 15 dias anda junto — o precedente medido está em `agendor.retry429.test.js`.

**Ids de negócio distintos por cenário** (2301/2302, 2311/2312, 2321/2322), porque a dedup do próprio SUT (`alreadyNotifiedToday`, sobre o `notification_log` real do SQLite temporário) acopla os casos entre si.

## Deviations from Plan

**Nenhum desvio.** O plano foi executado exatamente como escrito: uma única mudança em `backend/src/scheduler.js`, na posição prescrita, com a forma prescrita; nenhum arquivo além dos dois declarados em `files_modified`; nenhuma regra dos Rules 1-4 acionada.

## Riscos da matriz — como cada um foi neutralizado

| # | Risco | Como foi evitado (medido) |
|---|---|---|
| R3-06 | Guarda DENTRO do bloco de envio, inserindo linha `'pending'` sem envio | A guarda ficou ANTES da de funil; `logNotification(` = 1; `linhasDoDeal(indecidível).length === 0` verde em A e B |
| R3-07 | Abortar a rodada por engano | `continue`, não `throw`; `r.error === undefined` e `r.deals.length === 2` verdes em A e B |
| R3-08 | Editar o bloco de envio ao acrescentar a guarda acima dele | Diff de 20 inserções e **0 remoções**; as 3 marcas de 04-14/15/16 contadas; os 4 `notificationStatus.*` verdes sem edição |
| R3-09 | Guarda larga demais suprimindo negócio elegível | Cenário C verde: `r.notified === 2`, 4 envios, nenhum `skipped` |

## Threat Model — dispositions aplicadas

| Threat ID | Disposition | Como foi mitigado / aceito |
|---|---|---|
| T-04-20-01 | mitigate | Guarda por `deal.categoriaIndecidivel` antes do bloco de envio; A e B asserem **zero** envios para os destinatários do indecidível |
| T-04-20-02 | mitigate | `continue`, nunca `throw`; `r.error === undefined` e `r.deals.length === 2` asseridos nas duas ordens |
| T-04-20-03 | mitigate | A guarda fica antes do insert `'pending'`; `linhasDoDeal(...).length === 0` e `logNotification(` = 1 |
| T-04-20-04 | mitigate | `skipReason` em PT-BR no `dealResult`, asserido como string não vazia em A e B, mais o `logger.warn` do 04-19 |
| T-04-20-05 | accept | Decisão do usuário de 2026-08-05: um negócio elegível fica fora do envio no dia da falha e volta na rodada seguinte (REL-04 garante a reconsulta) |
| T-04-20-SC | accept | Nenhuma instalação de pacote; `git diff` de `backend/package.json` e `backend/package-lock.json` vazio |

Nenhum artefato deste plano exibe o valor do `AGENDOR_TOKEN`, e **SEC-01 permanece ABERTO** (decisão C8) — não foi tocado nem declarado resolvido.

## Escopo que este plano deliberadamente NÃO fecha

`emailer.js` **não foi tocado**. `sendOwnerWeeklySummary` é o SEGUNDO (e último) produtor de e-mail dirigido ao responsável e lê a mesma lista de `getStaleDeals` — fechar só o `runCheck` deixa o negócio indecidível voltar pela sexta-feira. É o **04-21**, e sem ele CR3-01 não está fechado.

`runCheckOnly` (a prévia do painel) continua devolvendo todos os negócios, indecidíveis inclusive — é superfície de visualização, e preservá-la é metade da decisão do usuário. `routes/deals.js` e `routes/reports.js` seguem espalhando o objeto de negócio sem filtrar por categoria, de propósito.

`getUsers` e `getDealById` continuam fora do retry da borda: escopo do 04-22 (WR3-01).

## Definition of Done

- [x] Cenários A, B e C verdes, com o RED de A e B registrado por saída literal
- [x] O cenário SIMÉTRICO (B) existe e está nomeado como tal no arquivo (4 ocorrências)
- [x] Zero envios e zero linhas de `notification_log` para o negócio indecidível
- [x] `r.error` indefinido e `r.deals.length === 2` nos dois cenários de falha
- [x] As marcas de 04-14, 04-15 e 04-16 continuam presentes em `scheduler.js` (2 / 1 / 1)
- [x] Suíte completa verde (156), cobertura acima dos pisos, `npm run lint` exit 0
- [x] Nenhum artefato exibe o valor do `AGENDOR_TOKEN` nem declara `sec-01` resolvido

## Known Stubs

Nenhum. Nenhum valor vazio/placeholder foi introduzido; `skipReason` sempre carrega um texto literal em PT-BR.

## Próximo

**04-21** — `sendOwnerWeeklySummary` deixa de incluir o negócio indecidível no e-mail INDIVIDUAL do responsável, preservando-o no consolidado do admin e no snapshot (política aprovada pelo usuário em 2026-08-05). Ele depende deste plano e do 04-19.

## Self-Check: PASSED

- 3/3 arquivos declarados existem em disco: `backend/test/scheduler.categoriaIndecidivel.test.js` (criado), `backend/src/scheduler.js` (modificado), este SUMMARY
- 2/2 commits existem no histórico: `151b233`, `c8e3ec5`
