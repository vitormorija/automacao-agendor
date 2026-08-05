---
id: wr5-05-assercoes-de-envio-afrouxadas-perdem-duplicata
type: todo
status: pending
priority: alta
created: 2026-08-05
source: Fase 4, code review 04-REVIEW-r5.md (rodada 5) §WR5-05 — escopo travado pelo usuário — warning vira todo, não plano
resolves_phase: null
tags: [backend, testes, oraculo, core-value, scheduler, notificacoes, phase-4-carryover]
---

# WR5-05 — as asserções de envio dos cenários novos foram afrouxadas e deixaram de detectar e-mail DUPLICADO, que é a outra metade do Core Value

**Onde:** `backend/test/scheduler.categoriaIndecidivel.test.js`. As asserções de envio dos cenários
**H**, **I** e **J** — introduzidos pelo plano 04-35 — convivem, **no mesmo arquivo**, com as dos
cenários **A**, **B** e **C**, que usam outra forma:

- **A, B e C** (forma exata): `assert.equal(envios(DONO_2), 1, ...)`
- **H, I e J** (forma frouxa): `assert.equal(envios(DONO_2) >= 1, true, ...)`

São **10** asserções na forma frouxa, contadas pelo revisor.

**O que acontece:** as duas formas medem coisas **diferentes**, e essa diferença é exatamente o eixo
do Core Value do milestone:

- a igualdade exata detecta o **envio a menos** (a supressão indevida) **e** o **envio a mais** (a
  **duplicata**);
- a forma `>= 1` detecta **apenas** o envio a menos.

Ou seja: nos três cenários que exercitam o comportamento **mudado** pelas rodadas 4 e 5, o oráculo
deixou de medir metade do contrato. Uma implementação que passasse a enviar duas vezes para o mesmo
responsável atravessaria H, I e J **verde**.

E o enfraquecimento **não tem justificativa técnica**: nos três cenários a prévia somente-leitura roda
antes e a rodada de envio roda **uma única vez**, então o valor exato é 1 — a forma exata caberia sem
nenhuma adaptação. Nenhum comentário do arquivo registra o motivo da troca de forma, ao contrário de
todas as outras decisões de instrumento daquele arquivo, que são densamente justificadas.

## Por que a prioridade é alta

Porque a **duplicata** é a metade do Core Value que esta fase inteira negocia por escrito, e é
justamente ela que sumiu do instrumento. O eixo é "quem recebe / quem **não** recebe" — notificar
indevidamente é tão defeito quanto deixar de notificar, e o histórico da fase é todo em torno disso:

- o trade-off do checkpoint **C10** (o fail-safe `'pending'`, escolhido pesando reenvio contra
  silêncio);
- a semântica de sucesso parcial de **WR-01**, que existe para não reenviar a quem já recebeu;
- a razão de `houveEnvioConfirmado` existir nos **dois** ramos (**WR2-01**);
- a ameaça **T-04-35-05** — "o operador dispara a rodada de novo e gera duplicatas".

Toda essa construção depende de um oráculo capaz de acusar o envio **a mais**. Nos três cenários mais
novos, esse oráculo está cego. É o único item **alta** desta leva.

**Este achado forma par com `in4-03`.** Os dois são sobre **força do oráculo**, em direções
complementares: `in4-03` é uma asserção que **não pode ficar vermelha**, esta é uma asserção que
**deixou de medir metade do contrato**. Quem revisar o arquivo de cenários fecha os dois na mesma
passagem — separá-los é revisar o mesmo instrumento duas vezes.

## Correção proposta

Restaurar a **forma exata** dos cenários irmãos nos dez pontos — as asserções de dono e de autor de
H, I e J passam a exigir **exatamente um** envio, com a mensagem dizendo "recebe UMA vez".

**Instrução operacional, e é a parte que importa: se algum caso ficar vermelho ao restaurar a
igualdade, o vermelho É o achado.** Não é o teste que precisa ser ajustado — é a duplicata que a
forma frouxa está escondendo, e ela vira um item de correção próprio, com prioridade acima deste.

**Precedente já disponível:** os cenários **L** e **M**, criados pelo plano 04-37 no mesmo arquivo,
usam a forma exata deliberadamente (o L assere zero e-mails para os quatro destinatários por
igualdade). Não é preciso inventar convenção: basta aplicar a que os cenários mais antigos e os mais
recentes já compartilham, e deixar escrito no arquivo por que a forma exata é obrigatória neste
oráculo — para que a próxima edição não afrouxe de novo por conveniência.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW-r5.md`, seção Warnings,
§WR5-05.
