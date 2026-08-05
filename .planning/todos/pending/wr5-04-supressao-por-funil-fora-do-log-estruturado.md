---
id: wr5-04-supressao-por-funil-fora-do-log-estruturado
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, code review 04-REVIEW-r5.md (rodada 5) §WR5-04 — escopo travado pelo usuário — warning vira todo, não plano
resolves_phase: null
tags: [backend, emailer, logging, observabilidade, resumo-semanal, phase-4-carryover]
---

# WR5-04 — os dois contadores de supressão irmãos do resumo semanal individual saem por mecanismos de log incompatíveis, e o de funil não entra no log estruturado de produção

**Onde:** os **dois** contadores de supressão de `sendOwnerWeeklySummary`, em
`backend/src/emailer.js`:

- `skippedByFunnel` — a supressão por **funil sem notificação ao responsável** — é reportada por
  `console.log`;
- o contador de cards fora do relatório por **categoria não consultada** é reportado por
  `logger.warn`.

**O que acontece:** as duas supressões vivem na **mesma função**, decidem a **mesma coisa** — quem
sai do relatório individual do comercial — e são reportadas por caminhos que não se encontram. Em
produção o `logger` emite **JSON de uma linha** com `time`, `level` e `message`, formato projetado
para agregação; `console.log` emite texto cru, **sem nível**.

O resultado é que, numa agregação por nível ou por campo, a supressão por **funil** fica
**invisível** enquanto a irmã aparece. Quem investigar *"por que este comercial não recebeu o
relatório de sexta?"* encontra **metade** das causas — e justamente a metade que o plano 04-35 acabou
de **alargar**, ao trocar a comparação de funil por substring e portanto aumentar o conjunto
suprimido.

## Por que a prioridade é média

Não muda **quem recebe**: o e-mail sai (ou não sai) exatamente como hoje, e nenhum destinatário entra
ou desaparece por causa disto. O que some é a **explicação** de uma decisão que já foi tomada — e a
decisão em questão é de destinatário, que é o eixo do Core Value.

O `CLAUDE.md` é explícito quanto à política: usar `logger` para todo código novo do backend, e não
replicar `console.*` cru. O ponto aqui **não** é a dívida legada em si — é que o módulo **já importa**
`logger`, **já o usa na linha seguinte**, e a linha de cima ficou para trás **na mesma edição**. As
demais ocorrências de log cru do mesmo arquivo (envio e erro por comercial, e o aviso do retry) são
**legado não tocado** por esta rodada e não fazem parte deste item: o que este todo cobre é o **par
de contadores de supressão**, que é o que a rodada editou e o que decide destinatário.

**Este achado forma par com `cr-02b`.** Os dois são sobre **log cru fora do logger estruturado**, em
módulos diferentes — e os dois são candidatos naturais a serem absorvidos pela **Fase 5 (Logging &
Padronização de Erros)**, cujo critério de sucesso já exige zero `console.` residual em `emailer.js`.
Se a Fase 5 os absorver, o par fecha junto; se alguém quiser antecipar, antecipa os dois.

## Correção proposta

Uma linha: trocar o `console.log` do contador de funil por `logger.warn`, preservando o texto e a
tag `[Emailer]` que já existem — o mesmo nível da irmã, porque as duas reportam supressão e não
progresso.

O oráculo natural é o mesmo instrumento que já cobre o resumo individual: um caso que exercite uma
rodada com pelo menos um card suprimido por funil e exija que a emissão tenha saído pelo `logger`
(nível e mensagem), e não por escrita crua. Sem essa medida a correção não fica pinada e pode ser
desfeita pela próxima edição do arquivo — que foi exatamente como ela nasceu.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW-r5.md`, seção Warnings,
§WR5-04.
