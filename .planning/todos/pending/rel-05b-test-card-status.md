---
id: rel-05b-test-card-status
type: todo
status: pending
priority: medium
created: 2026-08-04
source: 04-06 (REL-05) — inventário de escritores de `status` do notification_log
resolves_phase: null
tags: [reliability, notification-log, rel-05, desc-1, scheduler, routes]
---

# REL-05b — `POST /api/notifications/test-card` ainda grava `'sent'` antes de enviar

O plano **04-06** consertou o defeito **DESC-1** (`'sent'` otimista no `notification_log`) no
**agendador**. O inventário daquele plano mapeou **3 escritores** de `status`; dois foram corrigidos
e **um ficou de fora por decisão humana**:

| Escritor | Estado |
|---|---|
| `backend/src/scheduler.js:113` (insert do fluxo diário) | **corrigido** — nasce `'pending'` |
| `backend/src/scheduler.js:144` (insert do caminho de exceção) | **corrigido** — virou UPDATE da mesma linha |
| `backend/src/routes/notifications.js:87-99` (`POST /api/notifications/test-card`) | **pendente — este todo** |

## O defeito

`POST /api/notifications/test-card` insere a linha com `status: 'sent'` **antes** de chamar
`sendStaleNotification(...)` — exatamente o padrão que o 04-06 removeu do agendador. Consequências:

- Um envio de teste que falha deixa uma linha dizendo `'sent'`.
- Essa linha entra em `getNotificationStats` (`db.js:274,279,284` → `GET /api/notifications/status` →
  `Dashboard.jsx:48`), inflando `totalSent` e distorcendo o `clickRate`.
- Ela também aparece no histórico (`NotificationHistory.jsx:306`) com ✅ verde, afirmando um envio
  que não aconteceu.

## Por que ficou fora da Fase 4

Decisão humana de **2026-08-04**, registrada no `04-06-PLAN.md` (§"Fora de escopo, declarado por
escrito"): o contrato da fase (§11) restringe o diff do 04-06 a `scheduler.js` + o helper em `db.js`
+ testes, e **manter o rollback atômico do plano vale mais** do que corrigir um endpoint de teste
manual. Atenuantes que sustentam a espera: o `deal_id` gravado é tipicamente `0`, e o disparo é
sempre manual, com o operador vendo o resultado na hora.

## A correção (mesma receita já aplicada e testada no 04-06)

1. Trocar `status: 'sent'` por `status: 'pending'` no `logNotification` do handler.
2. Depois do `await sendStaleNotification(...)`, derivar `algumSucesso = results.some(r => r.success)`
   e chamar `updateNotificationStatus(logId, algumSucesso ? 'sent' : 'error', errosAgregados)` — o
   helper já existe em `backend/src/db.js` (criado no 04-06) e já está exportado.
3. Envolver em `try/catch` com `updateNotificationStatus(logId, 'error', err.message)`, sem inserir
   uma segunda linha.
4. Teste: o molde é `backend/test/notificationStatus.test.js` (04-06). Um cenário de sucesso e um de
   falha total bastam; o endpoint precisa de um seam de handler no padrão de
   `routes/auth.js:361-369`, como o 04-02 fez com `staleHandler` e o 04-03 com `resolvedHandler`.

## Fora do escopo deste todo

Nenhuma migração de dados. Linhas históricas com `'sent'` mentiroso são indistinguíveis das
verdadeiras — a informação que provaria a diferença nunca foi gravada — e a dedup é por data, com as
datas já passadas. Isso já foi decidido e registrado no 04-06.
