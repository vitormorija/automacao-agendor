---
phase: 4
slug: confiabilidade-das-integra-es
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-04
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test nativo (Node >= 20) + c8 ^12 (gate de cobertura ativo em `backend/.c8rc.json`) |
| **Config file** | `backend/.c8rc.json` (pisos lines/statements/functions 20, branches 60) |
| **Quick run command** | `cd backend && export PATH="$HOME/bin:$PATH" && node --test test/<arquivo>.test.js` |
| **Full suite command** | `cd backend && export PATH="$HOME/bin:$PATH" && npm run test:coverage` |
| **Estimated runtime** | ~1-2 segundos (suíte completa; baseline 78/78 em ~0.5s + overhead c8) |

Baseline medido na entrada da fase (04-RESEARCH.md): 78/78 verdes; cobertura 32 / 72.72 / 33.75 / 32 (lines/branches/functions/statements); lint exit 0 (45 warnings).

---

## Sampling Rate

- **After every task commit:** Run `node --test test/<arquivo-do-plano>.test.js` (arquivo focado do plano)
- **After every plan wave:** Run `npm run test:coverage` (suíte completa + gate)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

Convenção herdada (03-VALIDATION): um arquivo de teste por variação de ambiente — `node --test` roda cada arquivo em processo próprio; é a unidade de isolamento.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *(preenchido pelo planner por task — planos 04-01..04-07 conforme 04-DELIVERY-CONTRACT.md §6-12 e matriz de testes §13)* | | | REL-01..REL-06 | | | unit/caracterização/novo-fluxo | `node --test test/<arquivo>` | ❌ criado pela task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — runner, cobertura, helpers (`test/helpers/fakeAxios.js`, `test/helpers/tmpDb.js`, `test/setup.js`) e fixtures já existem das Fases 1-3. Nenhum Wave 0 necessário.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Revisão do changelog nodemailer 6→9 e do diff do lockfile | REL-02 (dep) / D-06 | Julgamento humano sobre breaking changes e mudanças indiretas de lockfile (checkpoints C3/C4 do contrato) | Revisar achados do 04-RESEARCH.md §changelog; `git diff package-lock.json` deve conter só o pacote do bump + transitivas (axios: 5 alteradas + 6 novas incl. `https-proxy-agent`/`agent-base`; nodemailer: exatamente 1) |

Todos os demais comportamentos da fase têm verificação automatizada (ver matriz de testes do 04-DELIVERY-CONTRACT.md §13).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
