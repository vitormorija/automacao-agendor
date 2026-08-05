---
id: in2-04-parcial-sent-invisivel
type: todo
status: pending
priority: média
created: 2026-08-04
source: Fase 4, code review 04-REVIEW.md (rodada 2) §IN2-04 — reconhecido e deliberadamente fora do gap closure r2
resolves_phase: null
tags: [backend, frontend, ux, notificacoes, core-value, phase-4-carryover]
---

# IN2-04 — quando o parcial vira `'sent'`, quem faltou nunca é retentado — e não há sinal disso

**Onde:** o bloco de envio de `runCheck`, em `backend/src/scheduler.js` (os dois ramos que gravam
o status: o de retorno e o de exceção) → `alreadyNotifiedToday`, em `backend/src/db.js` →
`frontend/src/components/NotificationHistory.jsx`, que renderiza o status.

**O que acontece:** a decisão D-03/Q1 — manter `'sent'` quando **pelo menos um** destinatário
confirmou, agora estendida também ao caminho de exceção (WR-01/WR2-01) — tem um outro lado que
nenhum comentário do código registra:

1. `alreadyNotifiedToday` filtra `status = 'sent'` e **bloqueia o negócio pelo dia inteiro**.
2. Como o card continua parado, ele volta a aparecer amanhã e uma notificação nova é disparada.
3. Mas **o destinatário que falhou hoje simplesmente não recebeu**, e o único vestígio disso é a
   coluna `error` de uma linha cujo `status` diz `'sent'`.

**Na UI, essa linha aparece como sucesso pleno.** `NotificationHistory.jsx` decide o ícone por um
ternário binário sobre `status === 'sent'` — verde para `'sent'`, vermelho para qualquer outra
coisa. A coluna `error` preenchida não muda nada no que o operador vê.

**Por que isso merece estar visível:** o Core Value deste milestone trata **notificação perdida em
silêncio** como a pior classe de falha. O trade-off escolhido (não reenviar para quem já recebeu)
é o correto e está aprovado — mas ele **compra a proteção contra duplicata pagando com um envio
perdido que ninguém enxerga**. Um trade-off consciente que só existe na cabeça de quem o decidiu
volta a ser, na prática, uma falha silenciosa.

**Relação com o 04-17:** aquele plano reduziu a *probabilidade* deste caso (o transporte recriado
no retry passa a servir o destinatário seguinte, então o segundo destinatário falha menos). Não
mudou nada do que está descrito aqui: quando o parcial acontece, ele continua invisível.

## Por que ficou fora da rodada 2

- **A correção mexe na UI**, que está fora do escopo da Fase 4 por decisão registrada em
  `.planning/phases/04-confiabilidade-das-integra-es/04-CONTEXT.md` §Phase Boundary — a fase trata
  de bordas externas do backend.
- A metade de backend da correção (`results.parciais`) mudaria o shape de uma resposta de API
  sem consumidor pronto para ela, o que é meio conserto — e meio conserto num caminho de
  notificação é pior do que nenhum, porque sugere cobertura que não existe.
- **Escopo travado pelo usuário:** IN2-01 a IN2-04 viram todos pendentes nesta rodada, não planos.

## Correção sugerida

Duas metades, que valem mais juntas:

1. **UI:** um terceiro estado no histórico — `status === 'sent'` **com `error` não nulo** →
   "parcial", com ícone e `title` próprios explicando que parte dos destinatários não recebeu e
   **não será retentada hoje**.
2. **Backend:** contabilizar `results.parciais` (ao lado de `results.notified`) e devolvê-lo na
   resposta de `POST /api/notifications/run`, para que o número apareça também no resumo da
   rodada e no `logger.info` de conclusão.

**Tratar junto com `in-01-status-pending-na-ui`.** É o mesmo arquivo de UI e a mesma classe de
problema: o backend passou a dizer a verdade em três estados (`'pending'`, `'sent'`, `'error'`,
mais o `'sent'` parcial) e a UI ainda lê o mundo em dois. Corrigir os dois numa passada evita
mexer duas vezes no mesmo ternário.

**Candidato a promoção de prioridade.** Este item toca o Core Value do milestone diretamente — é
sobre notificação que não chegou e ninguém soube. Fica em **média** aqui porque nenhum dado está
errado (a informação está gravada, só não é exibida), mas deve ser reavaliado explicitamente na
triagem do próximo milestone, e não herdado sem discussão.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN2-04.
