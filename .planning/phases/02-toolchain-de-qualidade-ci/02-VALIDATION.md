---
phase: 2
slug: toolchain-de-qualidade-ci
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-24
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (nativo, Node ≥20) + `c8` 12 para cobertura |
| **Config file** | `backend/.c8rc.json` (cobertura); sem config de runner (node:test auto-descobre `backend/test/`) |
| **Quick run command** | `cd backend && npm test` |
| **Full suite command** | `cd backend && npm run test:coverage` |
| **Estimated runtime** | ~2 segundos (backend); `vite build` frontend ~5–15s |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npm test` (sub-segundo, guard de comportamento)
- **After every plan wave:** Run `cd backend && npm run test:coverage` + `cd frontend && npm run build` + `biome lint .` nos dois pacotes
- **Before `/gsd:verify-work`:** Suíte backend verde (28/28+), CI verde no PR (jobs backend + frontend), e PR de falha proposital confirmando bloqueio (CI-02)
- **Max feedback latency:** ~15 segundos (build do frontend é o passo mais lento localmente)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| WR-02 test | 01 | 0 | WR-02 | — | N/A | unit (characterization) | `cd backend && node --test test/agendor.futureTasks.test.js` | ❌ W0 | ⬜ pending |
| Biome config | 02 | 0 | QUAL-01, QUAL-02 | T-2-V14 | Versão pinada (`-E`), sem postinstall | tooling | `biome format --check .` | ❌ W0 | ⬜ pending |
| Lint scripts | 02 | 1 | QUAL-03 | — | N/A | tooling | `cd backend && npm run lint` / `cd frontend && npm run lint` | ❌ W0 | ⬜ pending |
| Format guard | 02 | 1 | QUAL-01 (D-05) | — | Reformatação preserva comportamento | regression | `cd backend && npm test` → 28/28 | ✅ | ⬜ pending |
| CI workflow | 03 | 2 | CI-01 | T-2-V14 | `permissions: contents:read`, tags pinadas | integration | `gh pr checks` (PR real) | ❌ W0 | ⬜ pending |
| Branch protection | 03 | 3 | CI-02 | T-2-bypass | Required checks + enforce_admins | integration | PR de falha proposital barrado | ❌ W0 | ⬜ pending |
| Coverage gate | 01 | 3 | WR-03 | — | Cobertura não erode sob threshold | coverage gate | `cd backend && npm run test:coverage` (`check-coverage:true`) | ⚠️ config edit | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Nota: Task IDs finais serão atribuídos pelo planner; a coluna acima mapeia comportamentos → verificação.*

---

## Wave 0 Requirements

- [ ] `backend/test/agendor.futureTasks.test.js` — cobre WR-02 (casos: tarefa futura não-finalizada → incluído; finalizada → excluído; vencimento no passado → excluído; parada de paginação em `tasks.length < 100`), reutilizando `installFakeAxios`
- [ ] `biome.json` (raiz) — habilita `npm run lint` / `npm run format`
- [ ] Scripts `lint`/`format` em ambos os `package.json`
- [ ] `.github/workflows/ci.yml`
- [ ] `.c8rc.json` `check-coverage` (flip para blocking **APÓS** WR-02 fechar a lacuna e o threshold ser medido)
- [ ] devDep `@biomejs/biome@2.5.5` (`-E`) em backend e frontend, lockfiles atualizados para `npm ci` reprodutível no CI

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Merge barrado quando CI falha | CI-02 | Branch protection é config de repositório no GitHub, não versionada em código | Abrir PR com teste quebrado proposital; confirmar que o botão de merge fica bloqueado por status check obrigatório; reverter |
| Required status checks configurados | CI-02 | Estado do repo no GitHub (via `gh api`), não observável por comando de build local | `gh api repos/:owner/:repo/branches/main/protection` retorna `backend`/`frontend` em `required_status_checks.contexts` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
