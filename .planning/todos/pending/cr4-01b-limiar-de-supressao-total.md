---
id: cr4-01b-limiar-de-supressao-total
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, plano 04-28 (CR4-01) — residual declarado no inventário de irmãos; REESCRITO pela rodada 5 do code review (WR5-01) e parcialmente fechado pelo plano 04-37
resolves_phase: null
tags: [backend, scheduler, observabilidade, fail-safe, core-value, cr4-01, wr5-01, phase-4-carryover]
---

# CR4-01b — o numerador do alarme de supressão total não percorre o mesmo conjunto que o denominador

> **O nome do arquivo fala em "limiar", e isso é vestígio do enquadramento ERRADO.** O limiar
> — supressão TOTAL, e não uma proporção — é decisão do usuário e **não está em discussão**. O
> arquivo não foi renomeado de propósito: `04-28-SUMMARY.md`, `04-34-PLAN.md`, `04-34-SUMMARY.md`,
> `04-35-PLAN.md`, `04-35-SUMMARY.md`, `04-REVIEW-r5.md`, `STATE.md` e `ROADMAP.md` citam este nome,
> e renomear deixaria todas essas referências penduradas.

**Onde:** o bloco aditivo de alarme que fecha `runCheck`, em `backend/src/scheduler.js`, depois do
laço de envio. A âncora é a comparação entre o **numerador** — quantos negócios da rodada vieram
marcados com a categoria da organização indecidível — e o **denominador** `results.stale`, o total
de negócios parados da rodada. A causa que ainda sobra está na montagem da lista enriquecida, em
`getStaleDeals`, no módulo `backend/src/agendor.js`.

## O mecanismo (e não uma de suas causas)

O alarme só dispara quando o numerador **alcança** o denominador. Logo, **qualquer caminho que
impeça um negócio parado de ser contado no numerador torna a condição de supressão total
inalcançável** — e o alarme fica calado exatamente na rodada que ele existe para tornar audível.

Nomear o mecanismo importa porque a versão anterior deste arquivo nomeava **uma** causa e propunha
uma correção que fechava só ela. Quem lesse o título e executasse a proposta marcaria o item como
resolvido **com o defeito de pé**.

## A causa FECHADA pelo plano 04-37: qualquer `continue` anterior ao incremento

O contador que o alarme comparava com o denominador incrementava **dentro da guarda de categoria**,
que é a **segunda** do laço de `runCheck`. A guarda de **dedup do dia** vem antes e faz `continue`.
Logo, todo negócio já notificado hoje **subtraía do numerador sem subtrair do denominador**.

Não exige dado faltando no CRM: basta o operador disparar o envio manual depois do cron das 8h, ou
uma rodada anterior do dia ter notificado alguém.

Desfecho medido por sonda do revisor na rodada 5, com a borda `/organizations` **inteiramente fora**
e três negócios parados: **zero e-mails**, contador da guarda em 2 contra denominador 3, campo de
erro `undefined`, array de erros vazio, **alarme calado** — a rodada indistinguível de um dia calmo,
que é literalmente o enunciado de CR4-01.

**Fechado pelo plano 04-37**, movendo o incremento para o **topo do laço**, antes de todas as
guardas, onde numerador e denominador percorrem o mesmo conjunto — a mesma posição que o contador de
forma do funil já ocupava, e cuja justificativa já estava escrita ali sem nunca ter sido aplicada
de volta ao contador irmão. Pinado pelos cenários **L** (apagão com um negócio deduplicado dispara
o alarme) e **M** (o mesmo deduplicado ao lado de um notificável com borda sã mantém a rodada
silenciosa) de `scheduler.categoriaIndecidivel.test.js`. O contador da guarda foi **preservado e
desacoplado**: ele responde a outra pergunta — quantos a guarda suprimiu — e o cenário L mede os
dois valendo números **diferentes** na mesma rodada.

## A causa que SOBRA, e que mantém este todo ABERTO

Um negócio **sem organização** nunca chega a ser consultado: o conjunto de organizações únicas é
montado descartando valores falsos, então ele sai da lista enriquecida **sem a marca** de
indecidível. Numa rodada em que a borda de organizações está inteiramente fora **e** existe pelo
menos um negócio sem organização, o numerador continua estritamente menor que o denominador e o
alarme continua calado.

Essa é a única causa que resta, e é por ela que este arquivo permanece em `pending`. Ela é
**diferente** da que o 04-37 fechou: lá o negócio recebia a marca e um `continue` anterior impedia
a contagem; aqui a marca **nunca existe**.

## Por que a prioridade é média

O caminho é real e não é raro: basta um negócio sem organização cadastrada no CRM para o alarme
ficar mudo numa rodada de apagão total. O dano não é notificação errada — o comportamento por
negócio aprovado em CR3-01 continua intacto — é **perda do sinal** que o blocker existe para
produzir.

Não é alta porque a supressão continua registrada por negócio no log e no painel, e porque o campo
de erro volta a se preencher assim que a rodada for puramente indecidível. E a causa mais banal, a
que não dependia de nenhum dado ausente, já está fechada.

## A "Correção proposta" original está REJEITADA

O texto anterior deste arquivo mandava *"contar na borda, dentro de `getStaleDeals`, quantos
negócios tinham organização a consultar"* — como **a** correção do achado. Isso mexe no
**DENOMINADOR**, e o defeito que a rodada 5 mediu estava no **NUMERADOR**, impedido de crescer por
um `continue` anterior.

Executá-la naquela forma fecharia o todo, deixaria o oráculo verde — a rodada mista por falta de
organização passaria — e manteria o caminho da dedup **aberto**. Este parágrafo é o mais importante
do arquivo: ele existe para impedir que a próxima pessoa feche o item **com o defeito de pé**, que
foi exatamente o risco que o revisor apontou.

A ideia continua **válida como conserto da causa que sobra** — ver abaixo. O que está rejeitado é
enquadrá-la como o conserto do achado.

## O denominador DERIVADO da lista enriquecida foi avaliado e REJEITADO, com medição

A saída aparentemente óbvia — contar no denominador só os negócios que **têm** organização, lendo a
própria lista enriquecida — foi considerada e recusada, e a medição continua valendo:

na lista que `getStaleDeals` devolve, o campo de organização de cada negócio carrega o **nome** da
organização, não o identificador. O numerador, por sua vez, nasce da consulta feita por
**identificador**. Uma organização com identificador válido e **sem nome** produziria um negócio que
o numerador conta e o denominador não — e o alarme passaria a **falhar ABERTO por um caminho novo**,
trocando um buraco conhecido por outro, mais difícil de ver.

Registrar isto importa: quem for fechar este item e chegar sozinho ao denominador derivado precisa
saber que ele já foi medido e por que não serve.

## Correção proposta (para a causa que sobra)

Contar **na borda**, dentro de `getStaleDeals`, quantos negócios parados tinham organização **a
consultar**, e devolver esse número junto da lista. O alarme passa a comparar dois valores
produzidos pelo **mesmo critério e no mesmo lugar**, em vez de reconstruir um deles no consumidor —
e é isso que fecha o caminho do negócio **sem organização**. Não é o conserto do `continue`, que já
está fechado pelo 04-37.

O oráculo é a rodada **mista por ausência de organização**: um negócio sem organização e todos os
demais indecidíveis, exigindo que o campo de erro seja preenchido. Sem esse caso, qualquer
implementação que apenas mova a comparação continua verde com o defeito presente. E o simétrico é
obrigatório — um negócio sem organização e **nenhum** indecidível — para garantir que o denominador
novo não passe a disparar o alarme num dia normal, trocando mudez por ruído.

Vale a mesma disciplina do 04-37: o alarme é **aditivo**, mora depois do laço e não decide quem
recebe e-mail; e a mensagem não pode afirmar mais do que o contador garante.

## A lição estrutural

O inventário de irmãos do plano 04-28 classificou a guarda de dedup como `verificada-e-sã` com
**evidência correta para a pergunta errada**: perguntou *"este irmão está são?"* — e estava — em vez
de *"o que eu acabei de construir **depende** do comportamento dele?"*. É a cláusula de **direção
reversa** que a rodada 5 acrescentou ao mandato: além de listar os irmãos, listar o que pode
**neutralizar** o construto novo sem deixar nenhum teste vermelho.

---
Achado original: inventário de irmãos do plano
`.planning/phases/04-confiabilidade-das-integra-es/04-28-PLAN.md`, com a medição registrada no
SUMMARY do mesmo plano. Reescrito a partir de `04-REVIEW-r5.md` §WR5-01, pelo plano
`.planning/phases/04-confiabilidade-das-integra-es/04-37-PLAN.md`.
