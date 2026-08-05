---
id: in5-04-lote-de-organizacoes-sem-pausa-entre-lotes
type: todo
status: pending
priority: baixa
created: 2026-08-05
source: Fase 4, code review 04-REVIEW-r5.md (rodada 5) §IN5-04 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, agendor, concorrencia, rate-limit, comentario, oraculo, phase-4-carryover]
---

# IN5-04 — o lote de organizações limita concorrência mas não impõe pausa entre lotes, enquanto o lote irmão de páginas impõe

**Onde:** o lote de consultas de categoria por organização de `getStaleDeals`, em
`backend/src/agendor.js` (introduzido pelo plano 04-30), comparado ao lote **irmão** de páginas do
mesmo módulo, que aguarda um segundo entre lotes.

**O que acontece:** o lote de organizações fatia as consultas em grupos e aguarda cada grupo terminar
antes de disparar o próximo, mas **não** espera nada entre um grupo e o seguinte. O irmão de páginas
espera. A justificativa escrita para o lote de organizações afirma que retentar em massa *"PROLONGA a
própria janela de rate limit"* — e é aí que a construção **não entrega o que o comentário afirma**:

- um teto de **concorrência** sem pausa reduz o **pico simultâneo** de requisições em voo;
- ele quase **não** reduz a **taxa** de requisições por unidade de tempo.

A distinção entre **pico** e **taxa** é o ponto inteiro do achado, e vale escrevê-la por extenso:
vinte e cinco organizações continuam saindo em **milissegundos**, em três lotes encostados um no
outro. Contra um limitador do lado da borda, que conta requisições por janela de tempo, isso é
praticamente indistinguível de disparar todas de uma vez. O comentário promete controle de taxa; a
construção entrega controle de pico.

## Por que a prioridade é baixa

Porque **existem duas saídas legítimas** e uma delas não muda comportamento nenhum, e porque o
sintoma é condicional ao volume de organizações distintas numa rodada. Nada aqui muda quem recebe:
uma consulta rejeitada por rate limit já tem desfecho desenhado (o negócio vira indecidível, fica
fora do envio e permanece no painel), e esse desfecho foi aprovado pelo usuário.

O que sustenta o registro é que a **justificativa está mais forte que a construção** — o mesmo
mecanismo que produziu WR5-02 e o mesmo que o plano 04-25 encontrou quando a frase escrita para
excluir a terceira paginação do teto era factualmente falsa. Comentário que afirma além do código é
como esta fase acumulou vizinhos não vistos.

**Este achado forma par com `wr4-04b`.** Os dois são sobre o **fan-out proporcional ao dado** na
borda da Agendor, por caminhos diferentes — aqui a rodada de enriquecimento, lá o handler de negócios
resolvidos, alimentado por uma consulta sem limite. Quem for calibrar pressão sobre a borda precisa
olhar os dois na mesma passagem, senão calibra metade do tráfego.

## Correção proposta

Duas saídas, e a **segunda é a recomendada**:

1. **Acrescentar a mesma pausa entre lotes do irmão — e medi-la.** É a saída que faz o código
   entregar o que o comentário afirma, mas muda comportamento (alonga a rodada proporcionalmente ao
   número de lotes) e portanto exige oráculo próprio antes de entrar.
2. **Ajustar o comentário para afirmar só o que a construção entrega** — pico simultâneo, não taxa.
   É mais barata, não muda comportamento nenhum e fecha o defeito real, que é a promessa excedente.

Em qualquer das duas, note que o oráculo atual (`agendor.loteDeOrganizacoes.test.js`) mede
**exclusivamente o pico em voo**. Ou seja: a distinção pico x taxa hoje **não tem guarda-corpo**, e
se alguém escolher a saída 1 sem acrescentar a medida da pausa, a pausa pode ser removida depois sem
nenhum vermelho.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW-r5.md`, seção Info,
§IN5-04.
