---
id: rel-02b-deadline-global-smtp
type: todo
status: pending
priority: high
created: 2026-08-04
source: Fase 4, plano 04-05 (REL-02 / D-02) — checkpoint C3+C4, decisão humana Q6 de 2026-08-04
resolves_phase: null
tags: [backend, smtp, timeout, nodemailer, reliability, pre-go-live, phase-4-carryover]
---

# REL-02b — Estudar deadline global sobre a fase de conexão SMTP antes do go-live

**Gatilho de reavaliação (qualquer um basta):** o `smtp_host` configurado passar a resolver
para mais de 2 endereços A/AAAA, **ou** o tempo observado de uma rodada exceder o limite
operacional aprovado.

## O fato que originou este item

O nodemailer 8.0.0 introduziu, entre os *Bug Fixes* e sem constar como breaking change,
fallback de conexão para endereços DNS alternativos. **`connectionTimeout` deixou de ser um
teto absoluto da fase de conexão e passou a valer por endereço A/AAAA resolvido.**

Verificado no fonte de `nodemailer@9.0.4` instalado:

- `lib/smtp-connection/index.js:413-415` — `_setupConnectionHandlers()` cria um
  `setTimeout` novo com `options.connectionTimeout`.
- `lib/smtp-connection/index.js:403` — `_connectToHost()` chama `_setupConnectionHandlers()`.
- `lib/smtp-connection/index.js:427,438,468` — `_onConnectionError()` limpa o timer, tira o
  próximo endereço da fila e chama `_connectToHost()` de novo, **instalando um
  `connectionTimeout` inteiro e novo**. Não há acumulador nem deadline compartilhada.
- `lib/shared/index.js:157-172` — o resolver busca A **e** AAAA e concatena; `:83` escolhe o
  primário aleatoriamente; `smtp-connection:334` guarda o resto como fallback.

**`greetingTimeout` e `socketTimeout` NÃO são multiplicados.** Ambos são instalados dentro de
`_onConnect()` (`:847` e `:850`), que só roda após a conexão subir e marca `stage = 'connected'`
(`:829`); `canFallback` exige `stage === 'init'` (`:430`). Só a fase de conexão multiplica.

## Pior caso

Com `connectionTimeout: 10s`, `greetingTimeout: 10s`, `socketTimeout: 30s` e o retry atual
(3 tentativas, esperas de 3s + 6s), o pior caso por destinatário é:

```
30N + 69 segundos     (N = número de registros A + AAAA do smtp_host)
```

| N | Pior caso por destinatário |
|---|---|
| 1 | 99s — é exatamente o "~1min40s" escrito em D-02 |
| **2** | **129s — situação atual observada** |
| 4 | 189s |
| 8 | 309s |

**N=2 foi observado em 2026-08-04** para `smtp.gmail.com` (host padrão, `db.js:108`):
1 registro A + 1 AAAA.

A garantia quantitativa original de D-02 ("o pior caso por e-mail cai de ~30min para ~1min40s")
**não é mais invariável** — era o caso N=1, e virou uma função de N. O teto deixou de depender
da nossa configuração e passou a depender do DNS do provedor, que o operador não vê nem controla.

## Por que não foi resolvido na Fase 4

- **Não existe configuração suportada** no nodemailer 9 para impor deadline global ou desligar
  o fallback. Verificado por `grep` em todo o `lib/`:
  `totalTimeout|globalTimeout|overallTimeout|maxConnectionTime|disableFallback|noFallback`
  → zero ocorrências. O bloco de documentação das opções (`smtp-connection/index.js:44-64`)
  não menciona o fallback.
- `dnsTimeout` (default 30s, `:268`) limita só a resolução, não a conexão.
- Host como IP literal desligaria o fallback (`shared/index.js:103`), mas o mesmo ramo zera o
  `servername`, quebrando SNI e validação de certificado — e os IPs do provedor rotacionam.
- A opção `socket`/`connection` também desligaria, mas exige gerenciar o ciclo de vida do
  socket. Fora de escopo.
- Um teto externo mexeria no `sendMailWithRetry`, que o `04-DELIVERY-CONTRACT.md` §5 declara
  **inalterado**, e violaria D-06 (bump isolado) dentro do 04-05.

## ⚠ Ao implementar: `Promise.race` ingênuo é armadilha

**Não implementar um `Promise.race` sem garantir o encerramento da operação SMTP subjacente.**

Perder a corrida **não cancela** o que o nodemailer está fazendo: o socket continua aberto, o
`connectionTimeout` do endereço em curso continua armado, e a tentativa segue consumindo
descritor de arquivo e conexão no servidor. Numa rodada com muitos destinatários isso vaza
sockets em vez de limitar tempo — o remédio fica pior que a doença.

Qualquer implementação precisa, ao vencer o deadline, **encerrar explicitamente o transporte**
(`transporter.close()`) e garantir que o socket foi destruído antes de seguir para o próximo
destinatário. O comportamento de `close()` sob conexão em fase de `init` deve ser verificado no
fonte antes de confiar nele.

## Teste que comprovaria

Dois, sem rede:

1. **Caracterização barata da biblioteca:** apontar o host para `localhost` — que resolve
   naturalmente para `127.0.0.1` e `::1`, portanto N=2 — com nada escutando, e **contar
   tentativas de conexão** em vez de medir tempo. Prova "N endereços ⇒ N tentativas".
   Medir tempo exigiria um endereço que engole pacotes em vez de recusar, o que é dependente
   de firewall e não é determinístico no CI.

2. **Teste do teto externo (se implementado):** transporter falso cujo `sendMail` nunca
   resolve; asserir que o envio desiste dentro do teto declarado **e** que o transporte foi
   encerrado. Usar `mock.timers` com o helper `avancarRelogioAte`
   (`backend/test/emailer.timeout.test.js:78-101`) — **não** `mock.timers.tickAsync`, que só
   existe no Node 23 e é `undefined` no Node 20 do CI.

## Decisão registrada (Q6, 2026-08-04)

A nova semântica foi **aceita** para a Fase 4, com o upgrade mantido em 9.0.4. Justificativa:
N=2 hoje; 129s ainda é redução enorme diante dos ~30min anteriores; suíte integralmente verde;
advisory HIGH do nodemailer removido; e nenhuma configuração suportada existe para impor o
deadline global. O modo de falha é *mais lento*, não *errado* — e este é um cron diário cujo
orçamento é a janela da rodada, não uma requisição de usuário.
