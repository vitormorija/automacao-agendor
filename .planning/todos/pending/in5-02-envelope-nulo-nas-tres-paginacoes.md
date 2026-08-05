---
id: in5-02-envelope-nulo-nas-tres-paginacoes
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, code review 04-REVIEW-r5.md (rodada 5) §IN5-02 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, agendor, paginacao, resiliencia, oraculo, phase-4-carryover]
---

# IN5-02 — as três paginações guardam a chave de dados, mas nenhuma guarda o ENVELOPE nulo

**Onde:** as três paginações de `backend/src/agendor.js` — a de negócios (que também lê o total de
registros do bloco de metadados da primeira página), a de responsáveis e a de tarefas futuras. Todas
desestruturam o corpo da resposta antes de qualquer verificação sobre o **próprio corpo**.

**O que acontece:** o conserto de WR4-05 e o comentário que o acompanha estão **corretos** quanto à
assimetria que existia — a chave de dados ausente, que uma das irmãs tratava e as outras não. O
residual é de outra natureza e é **uniforme às três**: se a borda responder **200 com corpo `null`**
(ou com string vazia, que o cliente HTTP entrega como corpo vazio), a desestruturação lança
`TypeError` nas três, antes de qualquer guarda.

O efeito depende de onde acontece: na paginação de tarefas futuras a rejeição sobe e **aborta a
rodada sem notificar ninguém**, que é o contrato aprovado na decisão Q2 e portanto o desfecho
correto; nas outras duas o `TypeError` não é o modo de falha que ninguém escolheu — é um
`TypeError` cru num caminho que já tem tratamento desenhado para falha de borda.

## Por que a prioridade é média

Porque exige uma condição incomum — a borda responder **sucesso** com corpo nulo, e não um erro HTTP
— e porque **não é vizinho aberto por conserto nenhum**: nenhum plano desta fase editou essa linha de
desestruturação de forma a introduzir o problema. É residual uniforme, não regressão.

O que impede de rebaixar para baixa é que a falha é **capaz de derrubar a rodada inteira** por uma
resposta malformada da borda, e a fase inteira foi construída sobre o princípio oposto: falha de
borda vira desfecho **explícito e escopado**, não exceção crua. Uniforme às três também significa que
o conserto é uniforme e barato.

## Correção proposta

Normalizar o envelope **antes** de desestruturar, nas três — uma variável local que substitui o corpo
nulo por objeto vazio no topo de cada leitura. É uma linha por paginação e não altera nenhum caminho
de sucesso: com corpo bem formado, o comportamento é byte a byte o de hoje.

**O oráculo NÃO entra em arquivo próprio.** O conserto entra como **modo novo da armação** do caso
`IRMÃS VERIFICADAS` de `agendor.paginacao.test.js` — o caso que já **executa** as três irmãs contra
um formato degradado em vez de apenas afirmar sobre elas. Hoje aquela armação serve sempre um objeto,
então o formato "envelope nulo" simplesmente não é exercido; acrescentar o modo faz o mesmo caso
cobrir a lacuna sem duplicar armação, e é a razão de este item **não** merecer arquivo de teste novo.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW-r5.md`, seção Info,
§IN5-02.
