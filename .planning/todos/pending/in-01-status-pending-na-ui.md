---
id: in-01-status-pending-na-ui
type: todo
status: pending
priority: medium
created: 2026-08-04
source: Fase 4, code review 04-REVIEW.md §IN-01 — consequência do 04-06 (REL-05) deixada fora de escopo
resolves_phase: null
tags: [frontend, ux, notificacoes, phase-4-carryover]
---

# IN-01 — O status `'pending'` renderiza como FALHA (✗ vermelho) no histórico

**O que acontece:** o plano 04-06 introduziu um terceiro valor para
`notification_log.status` (`backend/src/scheduler.js:136`): a linha nasce `'pending'` e só vira
`'sent'` quando pelo menos um destinatário confirma o recebimento. O consumidor da UI,
porém, decide o ícone por um ternário binário em
`frontend/src/components/NotificationHistory.jsx:306`:

```jsx
{log.status === 'sent' ? (
  <CheckCircle size={16} className="text-green-500" />
) : (
  <XCircle size={16} className="text-red-500" />
)}
```

Ou seja, `'pending'` cai no ramo `else` e aparece como **✗ vermelho — falha**. Isso acontece:

- **durante todo o envio** — que pode levar até ~100s por destinatário, com o `socketTimeout`
  de 30s do 04-04 multiplicado pelas 3 tentativas de `sendMailWithRetry`; e
- **permanentemente**, se o processo morrer no meio do envio. A linha fica `'pending'` para
  sempre e o operador lê "falhou" onde o correto é "não sabemos, e por isso amanhã tentamos de
  novo" — que é justamente o comportamento fail-safe que o REL-05 comprou.

O `04-06-SUMMARY.md:139` registra "Zero mudança de frontend foi necessária". É verdade para o
**build** (nada quebra, nada avisa), não para a **leitura humana**.

## Por que ficou fora da Fase 4

- UI está **fora do escopo da Fase 4** por decisão registrada em
  `.planning/phases/04-confiabilidade-das-integra-es/04-CONTEXT.md` §Phase Boundary — a fase
  trata de bordas externas do backend.
- O 04-09 é uma rodada de *gap closure* de segurança (CR-02/WR-03). Emendar frontend aqui
  misturaria trabalhos, contra a constraint de processo do `CLAUDE.md`.
- Não bloqueia nada: o dado gravado está correto; o defeito é só o sinal dado ao operador.

## Correção sugerida

Terceiro ramo explícito para `'pending'` — ícone de relógio em cinza, com `title` explicando
"envio em andamento ou interrompido; será retentado na próxima rodada":

```jsx
{log.status === 'sent' ? (
  <CheckCircle size={16} className="text-green-500" />
) : log.status === 'pending' ? (
  <Clock size={16} className="text-gray-400" />
) : (
  <XCircle size={16} className="text-red-500" />
)}
```

Verificar também qualquer outro consumidor que compare `status === 'sent'` — a mesma leitura
binária pode existir em outro painel.

**Destino sugerido:** fase de UI / pós-Fase 5, junto com `ui-01-toast-de-erro-no-check`
(mesmo arquivo-vizinho, mesma classe de problema: backend passou a dizer a verdade e a UI
ainda lê o mundo em dois estados).
