---
id: wr-02-cover-getdealswithfuturetasks
type: todo
status: pending
created: 2026-07-24
source: 01-REVIEW.md (WR-02)
resolves_phase: 2
tags: [test-coverage, notification-eligibility, phase-2]
---

# WR-02 — Cobertura de caracterização para `getDealsWithFutureTasks`

**Origem:** Code review da Phase 1 (`.planning/phases/01-rede-de-testes-safety-net/01-REVIEW.md`, finding WR-02).

**Problema:** `scheduler.js` usa exatamente duas funções de `agendor.js` para decidir quem é
notificado: `shouldNotifyOwner` (coberto por `agendor.funnel.test.js`) e
`getDealsWithFutureTasks` (`backend/src/agendor.js:171-204`) — esta última tem **0% de cobertura**
(c8). Deals com tarefa aberta, não-finalizada e com vencimento no futuro são pulados
(`scheduler.js:31,73,232`). Uma regressão silenciosa aqui (ex.: off-by-one na comparação
`dueDate`/`now`, ou na condição de `break` da paginação) NÃO seria pega por nenhum teste —
lacuna real contra o Core Value da rede de segurança ("nunca mais uma regressão silenciosa nas
regras de quem é notificado").

**Ação (Phase 2):** Adicionar teste de caracterização (ex.: `backend/test/agendor.futureTasks.test.js`)
usando o helper `installFakeAxios` existente, pinando o comportamento ATUAL:
- (a) tarefa com `finishedAt` null e `dueDate` no futuro → deal id **incluído** no `Set` retornado;
- (b) tarefa finalizada → **excluída**;
- (c) tarefa com `dueDate` no passado → **excluída**;
- (d) condição de parada da paginação (`tasks.length < 100`).

**Restrição:** É caracterização — pinar o comportamento atual, sem "corrigir" a lógica.

Relacionado: [[wr-03-enforce-coverage-thresholds]]
