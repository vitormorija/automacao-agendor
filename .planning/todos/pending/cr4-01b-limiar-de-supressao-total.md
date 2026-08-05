---
id: cr4-01b-limiar-de-supressao-total
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, plano 04-28 (CR4-01) — residual declarado no inventário de irmãos, fora-de-escopo-com-medição
resolves_phase: null
tags: [backend, scheduler, observabilidade, fail-safe, core-value, cr4-01, phase-4-carryover]
---

# CR4-01b — o alarme de supressão total não cobre a rodada MISTA: um negócio sem organização desarma o alarme

**Onde:** o bloco aditivo de alarme que fecha `runCheck`, em `backend/src/scheduler.js`, logo depois
do laço de envio. A âncora é a comparação entre o contador de suprimidos por categoria indecidível e
o total de negócios parados da rodada. A causa do desalinhamento está na montagem da lista
enriquecida, em `getStaleDeals`, no módulo `backend/src/agendor.js`.

**O que acontece:** o alarme dispara quando **todos** os negócios parados do dia foram suprimidos por
categoria indecidível. O denominador é o total de negócios parados; o numerador conta só os que
receberam a marca de indecidível.

**Medição que justificou a exclusão do escopo do 04-28:** um negócio **sem organização** não passa
pela consulta de categoria — o conjunto de organizações únicas é montado filtrando valores falsos,
então ele nunca é consultado e sai da lista **sem a marca**. Numa rodada em que a borda de
organizações está inteiramente fora, mas existe pelo menos um negócio sem organização, o numerador
fica estritamente menor que o denominador, o alarme **não dispara**, e o apagão volta a ser
indistinguível de um dia calmo — que é exatamente o achado que o blocker fechou.

O limiar "todos" está correto para o cenário puro e foi decidido pelo usuário. O que falta é o
cenário **misto**.

## Por que a prioridade é média

O caminho é real e não é raro: basta um negócio sem organização cadastrada no CRM para o alarme ficar
mudo numa rodada de apagão total. O dano não é notificação errada — o comportamento por negócio
aprovado em CR3-01 continua intacto — é **perda do sinal** que o blocker existe para produzir.

Não é alta porque a supressão continua sendo registrada por negócio no log, e porque o campo de erro
volta a se preencher assim que a rodada for puramente indecidível.

## O denominador derivado foi avaliado e REJEITADO, com medição

A saída aparentemente óbvia — contar no denominador só os negócios que **têm** organização — foi
considerada e recusada:

Na lista enriquecida que `getStaleDeals` devolve, o campo de organização de cada negócio carrega o
**nome** da organização, não o identificador. O numerador, por sua vez, nasce da consulta feita por
**identificador**. Uma organização com identificador válido e **sem nome** produziria um negócio que
o numerador conta e o denominador não — e o alarme passaria a **falhar ABERTO por um caminho novo**,
trocando um buraco conhecido por outro, mais difícil de ver.

Registrar isto importa: quem for fechar este item e chegar sozinho ao denominador derivado precisa
saber que ele já foi medido e por que não serve.

## Correção proposta

Fazer numerador e denominador virem da **mesma fonte**: contar na borda, dentro de `getStaleDeals`,
quantos negócios tinham organização **a consultar**, e devolver esse número junto da lista. O alarme
passa a comparar dois valores produzidos pelo mesmo critério, no mesmo lugar, e deixa de depender de
uma reconstrução feita no consumidor.

O oráculo é a rodada **mista**: um negócio sem organização e todos os demais indecidíveis, exigindo
que o campo de erro seja preenchido. Sem esse caso, qualquer implementação que apenas mova a
comparação continua verde com o defeito presente. Vale acrescentar o simétrico — um negócio sem
organização e nenhum indecidível — para garantir que o novo denominador não passe a disparar o alarme
num dia normal.

---
Achado original: inventário de irmãos do plano
`.planning/phases/04-confiabilidade-das-integra-es/04-28-PLAN.md`, com a medição registrada no
SUMMARY do mesmo plano.
