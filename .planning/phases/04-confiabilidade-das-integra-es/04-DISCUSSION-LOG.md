# Phase 4: Confiabilidade das Integrações — Discussion Log

**Date:** 2026-07-30
**Mode:** default (interativo)

> Registro para referência humana. **Não** é consumido pelos agentes downstream — estes leem
> `04-CONTEXT.md`.

---

## Scout prévio (antes de qualquer pergunta)

Medições que reformularam a fase:

| Requisito | O que o roadmap dizia | O que o código mostra |
|---|---|---|
| REL-01 | falta timeout | confirmado, nos **dois** pontos (`agendor.js:6-9`, `notifications.js:220`) |
| REL-02 | falta timeout | confirmado e **pior**: sem opções, vale o default de socket de **10 min**; com 3 tentativas, ~30 min por destinatário |
| REL-03 | falha do cron não pode derrubar o agendador | **já satisfeito** — catch sem relançar em `scheduler.js:172` e `:242`, mais `finally` liberando o lock em 175 |
| REL-04 | cache sem TTL | confirmado, **com armadilha**: dois caminhos de leitura, e o segundo (`agendor.js:165`) decide exclusão por categoria |

Verificação adicional: a rede da Fase 1 **protege** a regra de exclusão por categoria —
`agendor.getStaleDeals.test.js` mocka `/organizations/:id`, marca a org 205 como `Parceiro` e afirma
`deepStrictEqual(ids, [101, 103])`.

---

## Áreas selecionadas

O usuário selecionou **todas as quatro**.

---

## Área 1 — Valores de timeout

**Pergunta:** Qual timeout para as chamadas HTTP à API Agendor?
- Opções: 15s / 30s / 10s
- **Escolha:** 15 segundos → **D-01**

**Pergunta:** Qual timeout para o envio SMTP?
- Opções: conexão 10s + saudação 10s + socket 30s / valor único de 20s / você decide
- **Escolha:** os três separados → **D-02**

---

## Área 1b — Comportamento ao esgotar as tentativas

Antes de perguntar, foi verificado se uma notificação que falha hoje é reenviada amanhã.
`alreadyNotifiedToday` (`db.js:228`) filtra `status = 'sent'` — uma falha grava `'error'` e **não**
bloqueia o reenvio. O sistema já tem recuperação natural pela rodada diária, o que reduz o peso da
decisão.

**Pergunta:** Ao esgotar as 3 tentativas, o que acontece?
- Opções: registrar e seguir / registrar + resumo ao admin / registrar + prioridade amanhã
- **Escolha:** registrar e seguir → **D-03** (comportamento atual preservado; zero mudança)

---

## Área 2 — REL-03

**Pergunta:** O tratamento de erro já funciona. O que fazer?
- Opções: só caracterizar / caracterizar + expor no dashboard / caracterizar + alertar após N falhas
- **Escolha:** só caracterizar → **D-04**
- Nota: o teste deve cobrir o `finally` que libera `isRunning`. Um lock vazado não derruba nada —
  faz o sistema parar de notificar em silêncio, que é a classe de falha que o Core Value do milestone
  existe para impedir.

---

## Área 3 — Cache de categorias

**Pergunta:** Qual estratégia para REL-04?
- Opções: limpar no início de cada `getStaleDeals` / TTL por tempo (24h) / cache com escopo de execução
- **Escolha:** limpar no início de cada execução → **D-05**
- Nota: divergiu do texto literal do roadmap ("TTL/invalidação"), com razão estrutural. Um TTL exige
  guardar timestamp junto do valor, mudando o formato de string para objeto — e a leitura direta da
  linha 165 passaria a receber um objeto, fazendo `EXCLUDED_CATEGORIES.includes(...)` retornar `false`
  para tudo. Organizações excluídas voltariam a ser notificadas. Limpar o cache resolve o mesmo
  problema sem mudar formato algum.

---

## Área 4 — Dependências do `sec-02`

**Pergunta:** Trazer as atualizações de dependência para esta fase?
- Opções: só axios e nodemailer / nada / tudo
- **Escolha:** só axios e nodemailer → **D-06**
- Nota: o bump do nodemailer é salto de 3 majors e exige teste do novo fluxo de envio — que é
  essencialmente o teste que REL-02 já pede. Fazer junto evita abrir `emailer.js` duas vezes.

---

## Ideias adiadas

- Resumo de falhas de envio ao admin (rejeitado: depende do SMTP que pode estar fora).
- Última falha do agendador visível no dashboard (puxaria frontend para uma fase de backend).
- Alerta após N falhas consecutivas (exige estado persistente e canal que não seja e-mail).
- Cache com escopo de execução — Fase 7.
- Restante do `sec-02`: `vite` 5→8, `node-cron` 3→4, `npm audit` no CI.

## Todos revisados e não dobrados

- `sec-01-rotate-agendor-token` — ação operacional, não código.
- `ops-01-validar-env-e-pm2-no-primeiro-deploy` — depende de servidor inexistente; Fase 8.

## Discricionariedade de Claude

- Forma de expressar os timeouts (constantes, config ou literais).
- Se a chamada ad-hoc reusa a instância compartilhada.
- Forma dos testes de timeout.
- Onde a limpeza do cache é invocada dentro de `getStaleDeals`.
