---
id: in3-05-stoptasks-duplicado
type: todo
status: pending
priority: baixa
created: 2026-08-05
source: Fase 4, code review 04-REVIEW.md (rodada 3) §IN3-05 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, scheduler, duplicacao, graceful-shutdown, phase-4-carryover]
---

# IN3-05 — `stopTasks()` duplica o bloco de parada do topo de `scheduleTask()`

**Onde:** `scheduleTask` e `stopTasks`, em `backend/src/scheduler.js` (a âncora são os nomes das
duas funções). O consumidor de `stopTasks` é o `shutdown` de `backend/src/index.js`, no graceful
shutdown por `SIGTERM`/`SIGINT`.

**O que acontece:** as duas funções contêm o mesmo bloco, palavra por palavra — parar `currentTask`
e anulá-la, parar `weeklyTask` e anulá-la. Oito linhas idênticas em dois lugares, com dois donos
diferentes: `scheduleTask` para os temporizadores antigos antes de registrar os novos (é o que
torna a função reaplicável quando a configuração de cron muda pela UI), e `stopTasks` os para para
valer, no encerramento do processo.

**Por que isso importa:** hoje são exatamente dois temporizadores, e as duas cópias estão em dia.
O problema é o terceiro. Este é o formato de duplicação que fica **meio-atualizada**: quem
acrescentar um temporizador novo vai passar pela função que estiver editando — muito provavelmente
`scheduleTask`, que é onde o registro acontece —, acrescentar as três linhas de parada ali, e não
ter nenhum sinal de que existe uma segunda cópia a alimentar.

O desfecho não é cosmético. Um `cron` que sobrevive ao `stopTasks` continua rodando **depois** do
graceful shutdown: o processo que deveria estar encerrando dispara uma execução com o SQLite já a
caminho do fechamento e a borda SMTP num estado indefinido. Numa operação single-instance por PM2,
com `autorestart` e `max_restarts`, é o tipo de resíduo que aparece como falha intermitente no
reinício e não como um erro que aponta para a causa.

Prioridade **baixa** porque não há defeito hoje e o custo de deixar aberto é condicional a uma
mudança futura — mas o conserto é de uma linha, o que torna a razão custo/benefício boa quando
alguém estiver nesse arquivo por outro motivo.

## Correção proposta

`scheduleTask` passa a chamar `stopTasks()` na primeira instrução, e o bloco duplicado sai:

```js
function scheduleTask() {
  stopTasks();
  // ... segue igual: lê cron_schedule, checa notifications_enabled, registra os cron
}
```

Passa a existir um único lugar que sabe quais temporizadores existem, e ele é justamente o que o
shutdown usa.

Dois pontos de atenção na aplicação:

- **Ordem de declaração.** `stopTasks` é declarada depois de `scheduleTask` no arquivo. Como as
  duas são `function` (hoisted), a chamada funciona; ainda assim vale confirmar que nenhuma delas
  vire arrow ou expressão no mesmo commit.
- **O `module.exports` não muda.** `stopTasks` já é exportada, e `scheduleTask` continua com o
  mesmo contorno externo — o comportamento observável é idêntico, o que mantém o conserto dentro do
  que a constraint do `CLAUDE.md` chama de reorganização sem mudança funcional. Ainda assim, o
  oráculo natural para confirmar é `backend/test/scheduler.resilience.test.js`, que já exercita o
  agendamento e o ciclo de parada.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN3-05.
