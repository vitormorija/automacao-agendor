---
id: in4-04-leitura-de-success-divergente-entre-ramos
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, code review 04-REVIEW.md (rodada 4) §IN4-04 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, scheduler, notificacoes, core-value, consistencia, phase-4-carryover]
---

# IN4-04 — o mesmo campo `success` é lido com truthiness num ramo e com igualdade estrita no outro, dentro da mesma função

**Onde:** o bloco de envio de `runCheck`, em `backend/src/scheduler.js`. Dois pontos da **mesma
função** decidem o **mesmo fato** — se houve envio confirmado — a partir do **mesmo campo**:

- o ramo de **retorno normal**, que atribui `houveEnvioConfirmado` a partir dos resultados de envio,
  lê o campo por **truthiness**;
- o ramo do **canal parcial**, dentro do tratamento de exceção, lê o campo por **igualdade estrita
  com `true`**.

**O que acontece:** o plano 04-24 endureceu deliberadamente a leitura do canal parcial e escreveu
por extenso, no comentário ao lado, por que a comparação precisa ser estrita — um elemento vindo de
um canal que atravessa uma exceção não pode ser presumido bem formado. O ramo de retorno, que decide
exatamente a mesma coisa e alimenta exatamente a mesma variável, **ficou com a leitura frouxa**.

Hoje o desfecho é idêntico: o produtor é o helper de envio com retry, que sempre grava booleano.
O problema é o **acoplamento invisível** — a correção do 04-24 vale só onde alguém lembrou de
aplicá-la, e nada no código diz que existe um segundo lugar com a mesma regra.

## Por que a prioridade é média

Não é cosmético, e não é urgente. É a variável que decide `'sent'` contra `'error'` no
`notification_log` — o caminho do Core Value, e o mesmo desfecho que o requisito REL-05 fixa. Se
alguém trocar o produtor por algo que devolva uma string, um número ou um objeto, as **duas leituras
divergem**: uma passa a considerar confirmado o que a outra recusa, dentro da mesma execução, e a
consequência é um status gravado que não corresponde ao que aconteceu.

O sintoma seria silencioso: nenhuma exceção, nenhuma linha de log, apenas um desfecho errado no
histórico. É o mesmo perfil de falha que esta fase já encontrou três vezes.

## Correção proposta

Uniformizar o ramo de retorno para a **mesma leitura estrita** já aplicada no canal parcial, e
**apontar no comentário do 04-24 que a regra vale nos dois ramos** — sem essa segunda metade, a
próxima pessoa a endurecer uma leitura repete a assimetria por não saber que ela existe.

O oráculo natural é uma armação em que o produtor devolve um valor verdadeiro que não é `true` (uma
string, por exemplo) e a asserção exige que os dois ramos concordem sobre o status gravado. Sem esse
caso, a uniformização não fica pinada e pode ser desfeita por qualquer refatoração.

**Fechar junto de `in3-01`**, que trata da coluna de erro perdendo o destinatário: os dois vivem no
mesmo bloco de gravação de desfecho de `runCheck` e mexer num sem olhar o outro é como esta fase
acumulou vizinhos não vistos.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN4-04.
