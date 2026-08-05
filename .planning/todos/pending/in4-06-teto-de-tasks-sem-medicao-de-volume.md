---
id: in4-06-teto-de-tasks-sem-medicao-de-volume
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, code review 04-REVIEW.md (rodada 4) §IN4-06 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, agendor, paginacao, fail-safe, observabilidade, rel-06, phase-4-carryover]
---

# IN4-06 — o teto de páginas da consulta de tarefas futuras é um limiar fail-closed sobre um volume que cresce com o uso, e ninguém mediu o volume atual

**Onde:** a constante de teto de páginas do módulo, em `backend/src/agendor.js`, aplicada ao laço de
paginação de `getDealsWithFutureTasks`, e o comentário que a acompanha no topo do módulo.

**O que acontece:** o comentário afirma que o produto do teto pelo tamanho de página está "ordens de
magnitude acima do uso real". O número que sustentaria a afirmação **não existe em nenhum SUMMARY
desta fase** — nem no plano que introduziu o teto, nem nos que o herdaram. É uma estimativa escrita
com a confiança de uma medição.

O teto é **fail-closed** de propósito, e essa é a decisão certa: quando estourado, ele lança e
**aborta a rodada diária**, em vez de devolver um conjunto parcial. Mas isso significa que, no dia
em que o volume de tarefas abertas com prazo futuro alcançar o limite, a consequência é **zero
notificações** — e o sintoma, para quem opera, é uma mensagem de erro sobre paginação, indistinguível
de uma falha da borda.

E o volume **cresce com o uso do CRM**. Um limiar que depende de um número que ninguém mediu, sobre
uma grandeza que aumenta sozinha, é uma data futura sem alarme.

## Por que a prioridade é média

Não é um defeito presente — é uma **dívida de evidência** com desfecho grave e determinístico. Duas
coisas a distinguem de uma nota cosmética:

- O desfecho é a **supressão total** da rodada. É exatamente a classe de falha que o blocker desta
  rodada tornou audível para a categoria de organização; aqui o mecanismo é outro e o alarme
  correspondente não existe.
- O limite **não avisa antes de doer**. Não há degradação gradual: a rodada funciona todo dia até o
  dia em que para inteira.

## Correção proposta

Duas metades, e a segunda só faz sentido depois da primeira:

1. **Medir e registrar o volume atual.** A função já emite o tamanho do conjunto de negócios
   protegidos ao final da consulta; falta capturar esse número em execução real e escrevê-lo num
   artefato datado, junto da margem que ele deixa até o teto. Sem isso, qualquer conversa sobre o
   valor do teto continua sendo opinião.
2. **Se a margem for menor que uma ordem de magnitude**, emitir aviso em nível de alerta ao
   ultrapassar **metade** do teto, com o valor medido na mensagem — para que o limite avise antes de
   doer, e o operador tenha tempo de agir enquanto as notificações ainda saem.

Se a margem for confortável, a correção termina na primeira metade: substituir a afirmação estimada
pelo número medido, com a data. Uma afirmação datada envelhece de forma honesta; uma estimativa sem
origem, não.

**Fechar junto de `in4-05`**, que trata do tamanho de página do **mesmo laço** — e note que os dois
interagem: o teto é expresso em páginas, então mudar o tamanho da página muda o volume real que ele
representa, sem que o número do teto mude.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN4-06.
