---
id: in3-04-convencao-de-comentario-sem-casa-e-sem-gate
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, code review 04-REVIEW.md (rodada 3) §IN3-04 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [processo, convencao, ci, documentacao, phase-4-carryover]
---

# IN3-04 — a convenção de WR2-06 mora no topo de um módulo de domínio, fora do `CLAUDE.md`, e o gate não está no CI

**Onde:** o bloco de convenção nas duas primeiras linhas de `backend/src/agendor.js`, acima do
primeiro `require`; a seção "Comments" do `./CLAUDE.md`; e `.github/workflows/ci.yml`, job
`backend`.

**O que acontece:** o 04-18 fechou WR2-06 estabelecendo uma convenção **repo-wide** — comentário
referencia outro trecho por âncora nomeada (função, identificador, arquivo, caso de teste), nunca
por número de linha, que se desloca no próprio commit que o escreve. A regra está escrita, é boa, e
foi aplicada nos cinco arquivos de produção com resultado medido (zero ocorrências).

Ela mora, porém, no cabeçalho de **um cliente HTTP**. `agendor.js` não é onde alguém procura uma
regra de estilo do repositório — quem for editar `emailer.js`, `db.js` ou um componente do frontend
não passa por lá. E a seção "Comments" do `CLAUDE.md`, que é o lugar canônico e que o próprio
agente lê antes de qualquer edição, **não foi atualizada**: ela continua listando as convenções
anteriores (comentário em português, cabeçalho em caixa, "explicar o porquê", comentário denso em
código sensível a segurança) sem mencionar esta.

O `grep` detector também ficou órfão. Ele existe e funciona — está descrito no `04-18-SUMMARY.md`
como o comando que mede a conformidade —, mas é um **comando de SUMMARY**, executado uma vez por
quem escreveu o plano. O workflow de CI roda lint, testes com cobertura, build e o gate de segredos;
nenhum step verifica esta convenção.

**Por que isso importa:** convenção sem casa e sem gate volta a se degradar no próximo commit
longo, e a evidência já existe **dentro desta mesma fase**: IN3-06, um achado da rodada 3, é
justamente uma referência por número de linha que sobreviveu à limpeza do 04-18 — e as duas
referências dele apontam para a linha errada desde que nasceram, que é exatamente o modo de falha
que a convenção existe para impedir.

A ironia é o argumento: a própria fase que criou a regra já produziu a primeira violação
sobrevivente dela. Sem gate automatizado, a distância entre "está escrito" e "está valendo" é o
tempo até o próximo arquivo novo.

Prioridade **média** e não baixa por um motivo de custo assimétrico: o conserto é barato (mover
duas linhas de texto e acrescentar um step que roda em menos de um segundo), e o que ele protege é
a legibilidade de todos os comentários densos que esta fase escreveu — que são hoje a principal
documentação viva do sistema.

## Correção proposta

**1. Dar casa à regra.** Mover — ou replicar, com a canônica no `CLAUDE.md` — as duas linhas para a
seção "Comments" do `./CLAUDE.md`, no mesmo formato de bullet das convenções vizinhas. Manter no
topo de `agendor.js` só o que for específico daquele módulo, ou uma remissão curta.

**2. Dar gate à regra.** Acrescentar o `grep` detector como step do job `backend` de
`.github/workflows/ci.yml`. Três cuidados no desenho do step:

- O escopo inicial deve ser o mesmo já medido como limpo (os arquivos de produção). O residual
  conhecido em arquivos de teste está medido e declarado no `04-18-SUMMARY.md` — incluí-lo de saída
  faz o gate nascer vermelho, que é a forma mais rápida de ele ser desativado.
- Deve casar apenas em **comentário**. Esta fase mediu três divergências da mesma classe (grep de
  contagem pegando menção dentro de comentário preexistente); aqui o risco é o inverso, um `grep`
  cru batendo em string de código legítima.
- Falha do step deve trazer a regra na mensagem, não só o número da linha — senão o próprio gate
  vira um ponteiro sem contexto.

**3. Fechar junto de IN3-06,** que é o residual que este gate teria pego.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN3-04.
