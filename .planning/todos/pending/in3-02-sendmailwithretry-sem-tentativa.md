---
id: in3-02-sendmailwithretry-sem-tentativa
type: todo
status: pending
priority: baixa
created: 2026-08-05
source: Fase 4, code review 04-REVIEW.md (rodada 3) §IN3-02 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, emailer, robustez, phase-4-carryover]
---

# IN3-02 — `sendMailWithRetry` devolve `undefined` quando `retries <= 0`

**Onde:** `sendMailWithRetry`, em `backend/src/emailer.js` (a âncora é o nome da função). Os dois
call-sites ficam em `sendStaleNotification`, no mesmo arquivo — os que desestruturam
`const { transporteEmUso, ...resultado } = await sendMailWithRetry(...)`.

**O que acontece:** a função é um `for` de tentativas cuja condição é `attempt <= retries`, com
`attempt` começando em `1`. Com `retries = 0` (ou negativo) a condição é falsa já na primeira
avaliação: **o corpo não executa nenhuma iteração**, a execução cai no fim da função sem passar por
nenhum dos dois `return`, e a promessa resolve com `undefined`.

O sintoma seria um `TypeError` de desestruturação nos call-sites — uma mensagem que fala sobre o
formato do retorno e **não aponta para a causa**, que é um argumento de configuração. Quem a lesse
iria investigar o `nodemailer` ou a resposta do servidor SMTP, não o valor passado no terceiro
parâmetro.

**Alcançabilidade hoje:** nenhuma. Os dois call-sites de `sendStaleNotification` chamam sem o
terceiro argumento e recebem o default `3`. Mas `retries` é **parâmetro público da assinatura**, e
o primeiro consumidor que passar um valor calculado — vindo de config, por exemplo — encontra o
buraco.

**Por que isso importa:** este é o **irmão exato de `in2-01`**, que descreve o mesmo defeito em
`fetchWithRetry` (`backend/src/agendor.js`). Mesma causa (laço cuja condição pode ser falsa na
primeira avaliação, sem `return` de saída), mesmo sintoma (`TypeError` de desestruturação no
chamador), mesmo conserto. As duas funções são as **duas** políticas de retry do sistema: uma na
borda HTTP da Agendor, outra na borda SMTP.

O detalhe que faz este par valer mais junto do que separado: quem consertar só uma vai escrever a
guarda, o teste e a mensagem de erro para aquela borda, e a outra continuará sendo um segundo lugar
onde a mesma regra pode divergir — exatamente o argumento que o comentário de `fetchWithRetry` usa
para justificar existir como helper único. Um conserto pela metade aqui *cria* a divergência que
aquele comentário diz evitar.

**Correção proposta:** a mesma de `in2-01`, aplicada às duas funções na mesma passada. O conteúdo
daquele arquivo **não é duplicado aqui de propósito** — as duas opções (guarda no topo com mensagem
que aponta para a causa, ou troca do laço por `do/while` garantindo uma execução do corpo) estão
escritas em `.planning/todos/pending/in2-01-fetchwithretry-sem-tentativa.md`, com o exemplo de
código. Leia aquele arquivo antes de mexer neste.

Duas notas específicas desta borda:

- A mensagem da guarda deve levar a tag `[Emailer]`, não `[Agendor]` — a convenção de prefixo por
  subsistema do `CLAUDE.md` vale também para `Error` construído à mão.
- O oráculo natural é `backend/test/emailer.timeout.test.js`, que já é quem pina o shape do retorno
  por destinatário desta função (inclusive a garantia de que `transporteEmUso` não vaza para
  `results`).

**Fechar junto de `in2-01`.** Prioridade **baixa** pelo mesmo motivo que lá: o custo de deixar
aberto é uma mensagem de erro ruim num caminho que nenhum código de produção percorre hoje.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN3-02.
