---
id: wr-03-enforce-coverage-thresholds
type: todo
status: pending
created: 2026-07-24
source: 01-REVIEW.md (WR-03)
resolves_phase: 2
tags: [coverage, ci, phase-2]
---

# WR-03 — Impor thresholds de cobertura, integrados ao CI

**Origem:** Code review da Phase 1 (`.planning/phases/01-rede-de-testes-safety-net/01-REVIEW.md`, finding WR-03).

**Problema:** `backend/.c8rc.json` não tem `check-coverage`/`lines`/`branches`/`functions`/`statements`,
e o script `test:coverage` (`backend/package.json`) apenas **reporta** — nunca falha o processo.
Uma mudança futura pode remover/enfraquecer um teste de caracterização (ou adicionar lógica nova
de elegibilidade de notificação sem golden) e nem `npm test` nem `npm run test:coverage` sinalizariam.
A rede de segurança pode erodir silenciosamente.

**Ação (Phase 2 — junto do trabalho de CI):** Adicionar thresholds mínimos e ligá-los ao pipeline:
```json
{
  "check-coverage": true,
  "lines": 60,
  "per-file": true
}
```
ou, mais preciso, usar `--include` escopado às funções de caminho crítico
(`agendor.js`/`db.js`/`auth.js`) se um threshold repo-wide for estrito demais para arquivos
intencionalmente não cobertos nesta fase. O CI (CI-01/CI-02) deve executar a checagem de
cobertura como status check obrigatório.

**Nota de sequenciamento:** faz sentido só depois de [[wr-02-cover-getdealswithfuturetasks]]
(evita threshold falhar por causa da lacuna já conhecida).

Requisitos Phase 2 relacionados: QUAL-03, CI-01, CI-02.
