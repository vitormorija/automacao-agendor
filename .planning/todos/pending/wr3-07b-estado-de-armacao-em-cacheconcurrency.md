---
id: wr3-07b-estado-de-armacao-em-cacheconcurrency
type: todo
status: pending
priority: baixa
created: 2026-08-05
source: Fase 4, plano 04-26 (WR3-07) — o que a correção de estado neutro deliberadamente NÃO alcançou
resolves_phase: null
tags: [backend, testes, contaminacao-de-ordem, estado-de-armacao, phase-4-carryover]
---

# WR3-07b — as 7 variáveis de ARMAÇÃO de `cacheConcurrency` continuam sem reafirmação entre casos

**Onde:** `backend/test/agendor.cacheConcurrency.test.js`, nas declarações `let` de topo (a âncora
são os nomes, não os números de linha) e no `beforeEach` acrescentado pelo 04-26.

**O que ficou de fora.** O 04-26 fechou WR3-07 movendo a restauração de estado do fim do corpo dos
`test()` para um `beforeEach`. Em `agendor.cacheInvalidation.test.js` o escopo foi COMPLETO: as três
variáveis mutáveis lidas pelo `routeHandler` são reafirmadas no hook. Em
`agendor.cacheConcurrency.test.js` o escopo foi deliberadamente ESTREITO — o hook reafirma **apenas**
`cenarioAtivo`. Continuam sem reafirmação:

- `liberar210`
- `liberar205DaExecucaoB`
- `chamadas205`
- `chamadasDealsNoEspelho`
- `liberarDealsDaExecucaoB`
- `falhar205DaExecucaoA`
- `consultas205NoEspelho`

**O defeito que permanece:** um caso que falhe no meio deixa contador e manipulador de suspensão em
estado consumido, e os casos seguintes passam a rodar sobre uma armação parcialmente gasta. O sintoma
é o mesmo de todo WR3-07: o vermelho seguinte vem com a mensagem de outro caso.

## Por que o `beforeEach` NÃO serve aqui — medido, não argumentado

Estas 7 variáveis não são estado de **cenário**; são estado de **armação**. Os dois pontos de
suspensão do arquivo (a organização 210 na execução A, a 205 na execução B, e os equivalentes do
cenário espelho) são armados **uma única vez** e consumidos ao longo da **ordem declarada** dos
casos. Zerá-los entre casos não devolve o arquivo ao estado inicial — ele **re-arma** uma suspensão
que ninguém, dali em diante, libera.

O planejamento do 04-26 mediu isso numa cópia do arquivo fora da árvore (Experimento A): um
`beforeEach` resetando as **8** variáveis de topo faz os casos (2) e (3) **NÃO TERMINAREM**, com a
mensagem literal:

```
Promise resolution is still pending but the event loop has already resolved
```

Ou seja: "completar" a lista do hook — o reflexo natural de quem ler o arquivo e achar a lista
incompleta — **trava a suíte** em vez de a endurecer. Por isso o hook do arquivo carrega o aviso
escrito, e por isso o plano 04-26 impôs um gate automatizado de o `beforeEach` conter EXATAMENTE uma
atribuição.

## Correção correta (fora do alcance de um plano de higiene de instrumento)

Não é um hook. É **escopar a armação por caso**: uma fábrica que devolva, para cada `test()`, o seu
próprio conjunto de manipuladores e contadores (e um `routeHandler` que leia desse conjunto em vez de
ler variáveis de módulo). Isso é redesenho do arquivo, não movimentação de instrução, e precisa vir
com a garantia de que os três casos continuam medindo o mesmo entrelaçamento determinístico — que é o
valor real daquele arquivo e a razão de ele existir (CR-01 e CR2-01, as duas direções).

Ao mexer: os três casos precisam continuar verdes **sem edição de asserção**. Se alguma asserção
precisar mudar, algum caso dependia da armação consumida pelo anterior, e essa informação é nova.

---
Origem: `.planning/phases/04-confiabilidade-das-integra-es/04-26-PLAN.md` (decisão D-WR3-07-c) e o
achado §WR3-07 de `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`.
