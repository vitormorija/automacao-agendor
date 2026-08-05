---
id: in2-03-mensagem-de-erro-interpola-id
type: todo
status: pending
priority: média
created: 2026-08-04
source: Fase 4, code review 04-REVIEW.md (rodada 2) §IN2-03 — reconhecido e deliberadamente fora do gap closure r2
resolves_phase: null
tags: [backend, seguranca, logging, agendor, phase-4-carryover]
---

# IN2-03 — a mensagem de erro de `getDealById` interpola o valor recusado

**Onde:** a guarda de tipo de `getDealById`, em `backend/src/agendor.js` (hoje por volta da linha
91 — a âncora é a função, não o número).

**O que acontece:** a guarda que o 04-09 acrescentou para fechar WR-03 recusa o id inválido
lançando um erro que **coloca o próprio valor recusado dentro da mensagem**:

```js
const dealId = Number(id);
if (!Number.isInteger(dealId) || dealId <= 0) {
  throw new Error(`[Agendor] id de negócio inválido: ${String(id)}`);
}
```

**Por que o valor é externo:** o chamador de produção lê o id da coluna
`notification_log.deal_id`. Essa coluna tem afinidade `INTEGER` mas está numa tabela **sem
`STRICT`** — texto sobrevive nela —, e um dos escritores dela é o **corpo de uma requisição
autenticada**, `POST /api/notifications/test-card`. Ou seja: o conteúdo interpolado na mensagem
pode ter sido escolhido por quem enviou a requisição, incluindo `\n`, aspas e chaves.

**Consequência hoje: nenhuma.** A rejeição é absorvida pelo `catch` por item de `resolvedHandler`
(`backend/src/routes/notifications.js`) e **não chega a log nenhum** — a mensagem morre ali.

**Consequência amanhã:** basta alguém acrescentar um `logger.warn(...)` naquele `catch` — que é
exatamente o tipo de melhoria que uma fase de observabilidade proporia — para a mensagem virar
**injeção de linha no log**. O `logger` do projeto emite **uma linha JSON por evento em produção**
(`backend/src/logger.js`), então um valor contendo
`\n{"time":"…","level":"info","message":"…"}` produz um registro forjado, indistinguível de um
real para qualquer agregador que consuma o arquivo linha a linha.

## Por que ficou fora da rodada 2

- **O vetor está reconhecido no threat model do 04-12** e não é explorável pelo caminho atual: sem
  nenhum `logger.*` naquele `catch`, o valor não sai do processo.
- **Fechá-lo exigiria mexer em `getDealById` no mesmo commit que fecha CR2-01**, o achado crítico
  da rodada — contra a regra de um comportamento por plano que a fase vem seguindo.
- A prioridade é **média** (e não baixa) porque a distância entre "não explorável" e "explorável"
  é de uma linha de log escrita por alguém que não conhece este registro.

## Correção sugerida

Sanear antes de interpolar, ou não interpolar:

```js
// opção 1 — recortar e normalizar
throw new Error(
  `[Agendor] id de negócio inválido: ${String(id).slice(0, 40).replace(/\s+/g, ' ')}`,
);

// opção 2 — omitir o valor e registrar só o tipo
throw new Error(`[Agendor] id de negócio inválido (tipo recebido: ${typeof id})`);
```

**Regra geral que acompanha a correção, e que vale a partir de agora:** qualquer `logger.*` novo
no caminho de `resolvedHandler` → `getDealById` **precisa vir depois desta correção**, nunca
antes. Se a ordem se inverter, o achado deixa de ser preventivo e passa a ser um defeito ativo.

O oráculo natural é `backend/test/dealId.validation.test.js`, que já pina o comportamento da
guarda: acrescentar um caso que injete `\n` no id e assere que a mensagem do erro sai numa linha
só.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN2-03.
