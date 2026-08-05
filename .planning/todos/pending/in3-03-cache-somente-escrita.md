---
id: in3-03-cache-somente-escrita
type: todo
status: pending
priority: baixa
created: 2026-08-05
source: Fase 4, code review 04-REVIEW.md (rodada 3) §IN3-03 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, agendor, comentario, cache, phase-4-carryover]
---

# IN3-03 — o `Map` por execução é somente-escrita, e o comentário descreve uma memoização que nunca acontece

**Onde:** `getStaleDeals`, em `backend/src/agendor.js` — o bloco de comentário do
`cacheDaExecucao` e a construção `uniqueOrgIds` logo acima dele; mais o `getOrgCategory`, que
recebe esse `Map` como segundo parâmetro. A âncora são os identificadores, não os números de linha.

**O que acontece:** `uniqueOrgIds` já é o resultado de um `new Set(...)` sobre os ids de
organização dos negócios parados. Cada id, portanto, é passado a `getOrgCategory` **exatamente uma
vez** — e a consulta ao cache dentro dela nunca acerta. O `Map` é escrito e nunca lido com sucesso.

Enquanto isso, o comentário acima dele fala em "memoizando no cache DA EXECUÇÃO", e fecha dizendo
que o `Promise.all` faz "uma chamada por organização única, nunca uma por negócio". As duas
afirmações são verdadeiras sobre o **resultado**, e erradas sobre o **mecanismo**: quem dedupa é o
`Set`, não o `Map`.

**Por que isso importa — e por que a prioridade é baixa:** o `Map` **cumpre bem o seu propósito
real**, que não é dedup. Ele é o seam que eliminou o estado de módulo em CR2-01: enquanto o cache
era um dicionário de módulo, uma execução em voo podia gravar sua categoria depois de a rodada
vizinha ter limpado, e a vizinha lia esse valor sem consultar a API — foi assim que uma organização
'Parceiro' foi notificada por uma rodada que não falhou em nada. O `Map` por execução é o que torna
o refetch entre rodadas estrutural em vez de uma corrida que dá para perder. Nada disso está em
risco, e é por isso que isto é Info e não Warning: **não há defeito de comportamento**.

O risco é de leitura futura. Alguém que confie no comentário pode concluir que a dedup mora no
cache e "otimizar" o `Set` fora — trocando `uniqueOrgIds` por um `map` direto sobre os negócios,
por exemplo — na expectativa de que o `Map` absorva as repetições. Ele não absorve nada hoje, mas
absorveria nesse cenário; o resultado seria correto e o custo pareceria o mesmo. O problema real
aparece um passo adiante: a partir daí a dedup passa a depender de um caminho que nenhum teste
mede, porque os testes de cache medem contagem de consultas com o `Set` no lugar.

É a mesma classe de achado de WR3-01 e WR3-03 nesta rodada: **um comentário afirmando um mecanismo
que o código não implementa**. Nos outros dois havia defeito atrás da afirmação; aqui só há a
afirmação.

## Correção proposta

Ajustar o **comentário**, não o código. Duas frases:

1. O `Map` existe para **escopo** — dar à rodada um espaço de categorias que nasce e morre com ela,
   incluindo a sentinela `CATEGORIA_INDECIDIVEL` gravada num erro transitório. É o que entrega
   REL-04 e o que fechou CR2-01.
2. A **dedup mora no `Set`** de `uniqueOrgIds`, e é ele que garante uma consulta por organização
   única. Retirá-lo passaria essa responsabilidade para o `Map`, por um caminho que os oráculos de
   cache não exercitam hoje.

Diff exclusivamente de comentário — zero linhas não-comentário. Há precedente direto: o 04-19
corrigiu, como desvio Rule 1 em commit próprio, um comentário deste mesmo bloco que ainda citava o
`null` removido pelo plano. Os oráculos que não devem mudar:
`backend/test/agendor.cacheInvalidation.test.js` e `backend/test/agendor.cacheConcurrency.test.js`.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN3-03.
