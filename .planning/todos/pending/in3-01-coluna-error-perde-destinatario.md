---
id: in3-01-coluna-error-perde-destinatario
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, code review 04-REVIEW.md (rodada 3) §IN3-01 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, scheduler, notificacoes, observabilidade, core-value, phase-4-carryover]
---

# IN3-01 — o ramo de EXCEÇÃO grava só `err.message` na coluna `error` e descarta quem não recebeu

**Onde:** o bloco de envio de `runCheck`, em `backend/src/scheduler.js` — especificamente os DOIS
ramos que gravam o desfecho via `updateNotificationStatus`: o ramo de RETORNO (o que agrega
`errors.join('; ')`) e o ramo de EXCEÇÃO (o `catch (err)` que atualiza a linha já inserida). A
âncora são os dois ramos, não os números de linha.

**O que acontece:** os dois ramos gravam na mesma coluna e discordam sobre o que ela guarda.

1. O ramo de RETORNO agrega os erros por destinatário: `errors.join('; ')`, onde cada entrada já
   carrega a identificação de quem falhou.
2. O ramo de EXCEÇÃO grava apenas `err.message` — a mensagem da exceção que interrompeu a função.

E os parciais estão ali, à mão: o canal `resultadosParciais`, anexado ao erro por
`sendStaleNotification`, é lido e validado nas duas camadas (WR2-04 e WR3-03) duas instruções
acima, para decidir entre `'sent'` e `'error'`. Cada elemento é um `{ to, success, error }` — ou
seja, a identificação do destinatário que falhou está disponível no exato ponto em que a coluna é
escrita sem ela.

**Por que isso importa:** quando o parcial confirma e a linha vira `'sent'`, essa coluna passa a
ser o **único** vestígio de que alguém não recebeu — é literalmente a premissa do todo `in2-04`,
que descreve como `alreadyNotifiedToday` bloqueia o negócio pelo dia inteiro e o destinatário que
falhou nunca é retentado. O `in2-04` propõe tornar esse estado visível na UI. Este achado é o
outro lado: mesmo que a UI passasse a exibir o parcial hoje, **no caminho de exceção ela não teria
o nome de quem faltou para exibir**. Metade da informação foi jogada fora antes de chegar ao banco.

O Core Value do milestone trata notificação perdida em silêncio como a pior classe de falha. Aqui
não se perde o envio — perde-se a capacidade de saber *para quem* ele se perdeu, que é o dado de
que um operador precisa para reenviar à mão.

**Correção proposta:** compor as duas fontes no ramo de exceção, em vez de escolher uma. A forma
sugerida pelo review:

```js
[
  err.message,
  ...parciais.filter((r) => r && !r.success).map((r) => `${r.to}: ${r.error}`),
].join('; ')
```

Três cuidados na hora de aplicar:

- A leitura dos parciais **já** tem a validação de duas camadas exigida por WR3-03 (contêiner e
  elemento). A composição deve reusar o valor já validado, não voltar a desreferenciar o erro cru —
  reintroduzir a leitura ingênua aqui recria o `TypeError` dentro do `catch` que o 04-24 fechou.
- `err.message` deve continuar sendo o **primeiro** item: é ele que diz o que interrompeu a
  função, e os destinatários são o detalhamento.
- Nada de tocar no ramo de RETORNO: ele já compõe corretamente, e mexer nele mistura conserto com
  refatoração.

**Tratar junto de `in2-04`.** São as duas metades do mesmo problema — este garante que o dado
existe no banco, aquele garante que ele aparece para quem opera. Fechar só um deixa o outro com
meia utilidade.

Qualquer mudança exige caso de teste novo (constraint do `CLAUDE.md`). O oráculo natural é
`backend/test/notificationStatus.canalParcial.test.js`, que já é quem pina o comportamento das
duas camadas do canal e enumera os cenários E, F e G no cabeçalho.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN3-01.
