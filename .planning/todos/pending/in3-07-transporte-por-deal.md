---
id: in3-07-transporte-por-deal
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, code review 04-REVIEW.md (rodada 3) §IN3-07 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, emailer, smtp, desempenho, vocabulario, phase-4-carryover]
---

# IN3-07 — o ganho de WR2-05 não atravessa negócios, e o teste chama de "rodada" o que é um negócio

**Onde:** `sendStaleNotification`, em `backend/src/emailer.js` (o `let transporter =
createTransporter()` da entrada da função) e o caso (3) de
`backend/test/emailer.transporteVivo.test.js`, cujo nome é `(3) caminho feliz: uma conexão por
rodada, não uma por destinatário`. O chamador é o laço de envio de `runCheck`, em
`backend/src/scheduler.js`.

**O que acontece — a metade técnica.** O 04-17 fechou WR2-05 fazendo `sendMailWithRetry` devolver
`transporteEmUso`, de modo que o transporte recriado dentro do retry sirva o **destinatário
seguinte** em vez de morrer com a tentativa que o criou. O ganho é real e está pinado com contagens
exatas pelos casos (1), (2) e (3) daquele arquivo.

Mas o transporte nasce na **entrada de `sendStaleNotification`**, e essa função é chamada **uma vez
por negócio** pelo laço de `runCheck`. O transporte sobrevive aos destinatários daquele negócio e
morre com ele. Numa rodada de cron com N negócios parados e a sessão SMTP morta, o sistema volta a
pagar o ciclo de 3 s + 6 s **por negócio** — o custo que WR2-05 removeu de dentro do negócio
continua inteiro entre negócios.

**O que acontece — a metade do vocabulário.** O nome do caso (3) diz "uma conexão por rodada". Em
`backend/src/scheduler.js`, "rodada" designa a **execução inteira de `runCheck`** — é o termo usado
nos comentários da dedup, da guarda de categoria e do cache por execução. O que o caso (3) mede é
uma conexão por **negócio**. A mesma palavra com dois significados nos dois lados da fronteira
entre os módulos.

**Por que isso importa:** a asserção em si está **correta** (`transportesCriados === 1` por
chamada) — o problema não é o teste provar a coisa errada, é o nome afirmar uma garantia mais forte
do que a que existe. Alguém lendo a lista de casos conclui que o transporte é reusado ao longo da
rodada de cron e não vai procurar o custo que ainda está lá. É o mesmo mecanismo que produziu
WR3-01 (o comentário dizia "política ÚNICA" cobrindo duas das cinco bordas) e WR3-03 (o comentário
dizia que ausência e corrupção eram lidas do mesmo jeito, e a validação só olhava o contêiner):
**um artefato afirmando mais do que o código entrega**. Nesta fase, esse padrão já reabriu três
rodadas de review.

## Correção proposta — duas ações, independentes

**1. Renomear o caso (3) para falar em negócio.** Algo como "uma conexão por negócio, não uma por
destinatário". É mudança de string de nome de caso, sem tocar em asserção. Nota de precedente: a
fase decidiu no 04-18 **não** renomear nomes de caso citados por outros artefatos (nome de caso é
identificador de oráculo). Antes de renomear, verificar se este é citado — o `04-REVIEW.md` o
menciona pelo número dentro de `emailer.transporteVivo.test.js`, então a citação sobrevive.

**2. Decidir se vale reusar o transporte entre negócios da mesma rodada.** É a pergunta em aberto,
e ela **não** tem resposta óbvia:

- A favor: elimina o custo de reconexão multiplicado por N negócios, no exato cenário em que o
  sistema está degradado (sessão SMTP morta) e a janela do cron das 8h é o recurso escasso.
- Contra: uma sessão SMTP mantida viva ao longo de uma rodada inteira é um recurso de vida longa
  segurado por um processo single-instance, e servidores derrubam sessões ociosas sem avisar — o
  reuso pode trocar "reconectar previsivelmente" por "descobrir a queda no meio do próximo envio".
- O teto de vida já existe e deve ser o parâmetro da decisão: o `socketTimeout` de 30 s fixado pela
  decisão **D-02**. Um transporte reusado além dele não é reuso, é um handle morto.

Se a decisão for reusar, o transporte passa a ser um parâmetro de `sendStaleNotification` (o
chamador o cria e o repassa), não uma variável da entrada — e o caso (3) deixa de ser o oráculo
correto, porque a garantia passa a ser sobre o laço de `runCheck`. Isso exige caso novo em
`backend/test/emailer.transporteVivo.test.js`, medindo `transportesCriados` ao longo de N negócios,
antes de qualquer mudança de comportamento (constraint do `CLAUDE.md`).

A ação **1** pode ser feita sozinha e a qualquer momento; a **2** é a que precisa de decisão.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN3-07.
