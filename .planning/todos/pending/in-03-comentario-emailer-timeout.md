---
id: in-03-comentario-emailer-timeout
type: todo
status: pending
priority: low
created: 2026-08-04
source: Fase 4, code review 04-REVIEW.md §IN-03 — comentário de teste do 04-04 descreve um alarme inexistente
resolves_phase: null
tags: [backend, testes, comentario, phase-4-carryover]
---

# IN-03 — Comentário de `emailer.timeout.test.js` descreve um alarme que não dispara

**O que acontece:** `backend/test/emailer.timeout.test.js:310-311` afirma:

```js
// Sem mock.timers de propósito: se este caminho passasse a retentar, o teste
// gastaria 9 segundos reais — a lentidão seria o próprio alarme.
```

`node --test` **não impõe timeout por caso** (só o timeout global do runner, que não está
configurado neste projeto). Um teste que passe a gastar 9 segundos continua **verde**: a
lentidão não falha nada, ela só é lida por um humano que por acaso repare no `duration_ms`.
O comentário promete uma garantia que o mecanismo não dá.

O alarme **real** desse arquivo está na linha 329:

```js
// 1 tentativa para o dono (sem retry) + 1 para o autor.
assert.equal(enviosTentados, 2);
```

Essa asserção sim quebra se o caminho passar a retentar. É ela que protege o invariante.

Por que isso importa mais do que parece: a Fase 4 inteira vendeu a ideia de que "não afirmar
garantia que o mecanismo não dá" é regra de disciplina (é o mesmo princípio que o 04-08
aplicou aos comentários de `agendor.js` em WR-06, e que o 04-09 aplicou aos greps estáticos de
CR-02). Um comentário que promete um alarme inexistente convida o próximo leitor a **remover a
asserção de linha 329** achando que a lentidão cobre o caso.

## Por que ficou fora da Fase 4

- É **só um comentário**, sem nenhuma consequência funcional: nenhum teste muda de resultado.
- Está em arquivo de teste das ondas 1-7 desta fase, que a rodada de gap closure (04-08..04-11)
  não altera — abrir esse arquivo por um comentário poluiria o diff do checkpoint.

## Correção sugerida

Reescrever o comentário para apontar a asserção que de fato protege o invariante:

```js
// Sem mock.timers de propósito: o relógio real mantém o caso simples, e a espera não
// acontece porque este caminho não retenta. O que PROTEGE o invariante é a asserção
// `enviosTentados === 2` no fim deste caso — `node --test` não impõe timeout por caso,
// então lentidão sozinha não falharia nada.
```

**Destino sugerido:** Fase 5, junto com qualquer outro trabalho que já toque
`emailer.timeout.test.js`. Não bloqueia nada.
