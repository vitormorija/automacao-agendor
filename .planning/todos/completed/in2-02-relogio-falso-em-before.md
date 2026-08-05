---
id: in2-02-relogio-falso-em-before
type: todo
status: completed
priority: média
created: 2026-08-04
resolved: 2026-08-05
resolved_by: 04-26
source: Fase 4, code review 04-REVIEW.md (rodada 2) §IN2-02 — reconhecido e deliberadamente fora do gap closure r2
resolves_phase: null
tags: [backend, testes, contaminacao-de-ordem, phase-4-carryover]
---

# IN2-02 — o relógio falso é habilitado em `before`, e não em `beforeEach`

**Onde:** `backend/test/notificationStatus.partialFailure.test.js`, no bloco `before(() => { … })`
que chama `mock.timers.enable` (hoje por volta da linha 180 — a âncora é o hook, não o número).
Comparar com o `beforeEach` de `backend/test/agendor.retry429.test.js`, que faz `reset()` seguido
de `enable()`.

**O que acontece:** o arquivo habilita os temporizadores falsos **uma única vez**, antes de todos
os casos:

```js
before(() => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: FIXED_NOW });
});
```

O helper `avancarRelogioAte` (`backend/test/helpers/fakeTimers.js`) avança o relógio em passos de
`mock.timers.tick(10000)` até a promessa observada assentar. Como o relógio **nunca é rearmado
entre os casos**, cada tick deixa o relógio adiantado para o caso seguinte: o cenário A, que
exercita a espera de 3s do retry de `sendMailWithRetry`, avança cerca de 10s antes de B e C
rodarem.

**Por que isso importa — o precedente já existe neste repositório.** É exatamente a contaminação
de ordem que `agendor.retry429.test.js` descobriu e resolveu com `mock.timers.reset()` seguido de
`mock.timers.enable({ apis: ['Date','setTimeout'], now: FIXED_NOW })` no `beforeEach`. Lá, um
adiantamento de 30s movia o `cutoffDate` de 15 dias de `getStaleDeals` e trazia os deals de
fronteira 102 e 104 para **dentro** do golden — um teste vermelho que não denunciava defeito
nenhum, só o instrumento se movendo.

**Por que continua verde hoje:** `servirDeal` entrega **um** clone por caso, com `updatedAt` longe
da fronteira de 15 dias. Nenhum dos deals sintéticos está perto o bastante do corte para que 10s
de adiantamento mudem a classificação.

**Fragilidade latente, num arquivo que pertence à rede de testes do Core Value.** Este é o arquivo
que pina o sucesso parcial — quem recebeu, quem não recebeu, e o que a linha do `notification_log`
diz sobre isso. Um caso novo escrito perto da fronteira de 15 dias, ou uma reordenação dos casos,
produz um vermelho (ou pior, um verde) que não corresponde a nenhuma mudança de comportamento.

## Por que ficou fora da rodada 2

- **Decisão do usuário para a rodada 2:** os quatro achados Info viram todos pendentes, não planos.
- O arquivo é editado pelo 04-14 **apenas para acrescentar asserções** ao cenário A. Trocar o
  regime de relógio no mesmo commit misturaria dois trabalhos — e trocar o instrumento e o objeto
  medido na mesma rodada é justamente o que a constraint de processo do `CLAUDE.md` proíbe (a
  mesma razão pela qual a cópia local de `avancarRelogioAte` em `emailer.timeout.test.js` foi
  mantida durante toda a rodada).
- Não há defeito observável hoje: a suíte está verde e os oráculos medem o que dizem medir.

## Correção sugerida

Replicar o `beforeEach` de `agendor.retry429.test.js`:

```js
beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: FIXED_NOW });
});
```

O `reset()` antes do `enable()` é necessário: `enable()` sobre temporizadores já habilitados
lança. Ao mexer, confirmar que o `after`/`afterEach` existente continua coerente e que os três
cenários seguem verdes **sem edição de asserção** — se alguma asserção precisar mudar, o
adiantamento estava sendo carregado como pré-condição implícita, e isso é informação nova que
merece ficar registrada.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN2-02.

## Resolvido — 04-26, Task 1 (2026-08-05)

A correção sugerida acima foi aplicada **byte a byte**, e em **três** arquivos, não só no
`notificationStatus.partialFailure.test.js` que este registro nomeava:

- `backend/test/notificationStatus.partialFailure.test.js` (o arquivo original do achado)
- `backend/test/notificationStatus.registroResiliente.test.js`
- `backend/test/notificationStatus.canalParcial.test.js`

Os dois últimos foram criados na rodada 2 do gap closure e **copiaram** o `before` de topo do
primeiro em vez do `beforeEach` corrigido de `agendor.retry429.test.js` — que é exatamente o que
a rodada 3 do code review registrou como **WR3-04**. Consertar só os dois arquivos nomeados pelo
review, deixando aberto o terceiro de onde o defeito veio, repetiria pela quarta vez o padrão que
reabriu a fase 04. Por isso o vizinho entrou junto.

Nos três, o `before` de topo deixou de existir; a habilitação do relógio falso passou para o
`beforeEach` já existente, precedida de `mock.timers.reset()`, e o comentário que explicava por
que `'setTimeout'` entra junto de `'Date'` foi preservado e ampliado com o motivo do rearme por
caso. O `after` com `mock.timers.reset()` ficou como estava. Nenhuma asserção mudou e os três
arquivos continuam com 3 casos verdes cada — ou seja, nenhum caso carregava o adiantamento do
relógio como pré-condição implícita, que era a informação que este registro pedia para confirmar.

Medido no 04-26: nenhum outro arquivo da suíte habilita `'setTimeout'` num `before` de topo.
