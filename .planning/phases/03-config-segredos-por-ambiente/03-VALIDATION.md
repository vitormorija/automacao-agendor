---
phase: 3
slug: config-segredos-por-ambiente
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-29
---

# Phase 3 — Validation Strategy

> Contrato de validação por fase, para amostragem de feedback durante a execução.
> Fonte: `03-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` nativo (Node >= 20), sem dependência de runtime; cobertura via `c8` ^12 |
| **Config file** | `backend/.c8rc.json` (gate ativo: `check-coverage: true`, `per-file: false`) |
| **Quick run command** | `cd backend && npm test` |
| **Full suite command** | `cd backend && npm run test:coverage` |
| **Estimated runtime** | ~0,4 s (quick) / ~2 s (full com cobertura) |
| **Baseline atual** | 35 testes verdes |

**Pré-requisito de ambiente (local):** Node não está no PATH padrão — todo comando exige
`export PATH="$HOME/bin:$PATH"` antes.

**Isolamento (crítico nesta fase):** `db.js`, `secret.js` e `agendor.js` têm efeito colateral no
`require()`. `backend/test/setup.js` neutraliza isso presetando `JWT_SECRET`, `DB_PATH=:memory:` e
`AGENDOR_TOKEN` (com guarda `if (!process.env.X)`), e forçando `SMTP_PASS=''` / `ADMIN_EMAIL=''`
(sem guarda). Como **cada arquivo de teste roda em processo próprio**, a unidade correta de
isolamento para variações de ambiente é **um arquivo de teste por variação** — indispensável para
cobrir os dois ramos da migração de D-02.

---

## Sampling Rate

- **Após cada commit de task:** `cd backend && npm test`
- **Após cada wave:** `cd backend && npm run test:coverage`
- **Antes de verificar a fase:** suíte completa verde + gate de cobertura satisfeito
- **Latência máxima de feedback:** ~2 s

**Alerta de folga do gate:** a margem de branches é de apenas ~10 (74/113 = 65,48 % contra piso de
60). Código novo não testado na mesma wave em que é escrito pode estourar o gate e travar o CI.
Toda task que cria módulo novo deve entregar teste junto.

---

## Per-Task Verification Map

> Preenchido pelo planner ao criar os PLAN.md. As linhas abaixo são o contrato mínimo derivado das
> decisões travadas no CONTEXT.md e dos achados do RESEARCH.md.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-xx | 01 | 1 | CFG-04 | — | `dotenv` carrega o `.env` correto independentemente do `cwd` do PM2 | unit | `cd backend && npm test` | ❌ W0 | ⬜ pending |
| 03-01-xx | 01 | 1 | CFG-04 | — | `validateEnv(env)` retorna as faltantes sem lançar (função pura) | unit | `cd backend && npm test` | ❌ W0 | ⬜ pending |
| 03-01-xx | 01 | 1 | CFG-04 | — | ausência de obrigatória em `production` derruba o boot; em `development` só avisa | unit | `cd backend && npm test` | ❌ W0 | ⬜ pending |
| 03-02-xx | 02 | 2 | CFG-01 | T-3-SMTP | `emailer` lê a senha de `SMTP_PASS`, nunca da tabela `config` | unit | `cd backend && npm test` | ❌ W0 | ⬜ pending |
| 03-02-xx | 02 | 2 | CFG-01 | T-3-SMTP | migração **não** apaga `smtp_pass` quando `SMTP_PASS` está ausente/vazio | unit | `cd backend && npm test` | ❌ W0 | ⬜ pending |
| 03-02-xx | 02 | 2 | CFG-01 | T-3-SMTP | migração apaga `smtp_pass` quando `SMTP_PASS` está presente | unit | `cd backend && npm test` | ❌ W0 | ⬜ pending |
| 03-02-xx | 02 | 2 | CFG-01 | T-3-SMTP | seeder de `db.js` **não** re-insere a senha no boot seguinte (regressão do bug de ordem) | unit | `cd backend && npm test` | ❌ W0 | ⬜ pending |
| 03-02-xx | 02 | 2 | CFG-01 | T-3-SMTP | `PUT /api/config` rejeita/ignora `smtp_pass` (allowlist de `routes/config.js`) | unit | `cd backend && npm test` | ❌ W0 | ⬜ pending |
| 03-03-xx | 03 | 3 | CFG-02 | — | `.env.example` contém as 18 variáveis lidas pelo código | unit | `cd backend && npm test` | ❌ W0 | ⬜ pending |
| 03-04-xx | 04 | 4 | CFG-01 | T-3-LEAK | job `secrets` barra PR que adiciona segredo | CI | PR de prova (falha proposital) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Nenhuma instalação de framework é necessária — `node:test` + `c8` + `backend/test/setup.js` já
cobrem tudo. Os arquivos de teste abaixo são criados pelas próprias tasks (não há wave de
scaffolding separada):

- [ ] Arquivo de teste da validação de env — **um arquivo por variação de `NODE_ENV`**, dado o
      isolamento por processo (`config.production.test.js`, `config.development.test.js`)
- [ ] Arquivo de teste da migração SMTP — **um arquivo por ramo** (`SMTP_PASS` presente vs ausente),
      pelo mesmo motivo
- [ ] Teste de completude do `.env.example` (compara o conjunto lido do código com o declarado)

**Restrição de design derivada:** preferir uma função pura `validateEnv(env)` a copiar o padrão
`throw`-no-topo-do-módulo de `secret.js`. Motivo medido: o caminho de erro de `secret.js` nunca é
exercitado pelos testes (50 % de branches), justamente porque um `throw` em tempo de `require()` é
difícil de testar. Uma função pura é testável sem truques e não consome a folga estreita do gate.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| O `.env` de produção existe, está completo e é de fato carregado pelo processo do PM2 | CFG-04 | Só inspecionável no servidor; não é acessível a partir do repositório. **É o único item capaz de causar indisponibilidade.** | Comando de verificação de ~30 s documentado no `03-RESEARCH.md`, a ser executado **antes** da task que liga o `throw`. Checkpoint humano bloqueante. |
| Merge do PR que adiciona o job `secrets`, **antes** de adicioná-lo aos required status checks | CFG-01 | Configuração de repositório no GitHub, não versionada | Mesclar primeiro; só então `gh api PUT .../protection` incluindo o contexto `secrets`, conforme `deploy/branch-protection.md`. **Inverter a ordem trava o merge permanentemente** (`enforce_admins: true` + contexto exigido que nunca fica verde). |
| `git grep` escopado comprovando CFG-01 | CFG-01 | O gitleaks **não** detecta a exposição em headers `Authorization: Token` — medido nos três modos | Verificação independente, documentada, executada ao fechar a fase |

---

## Validation Sign-Off

- [ ] Toda task tem `<automated>` verify ou dependência declarada de Wave 0
- [ ] Continuidade de amostragem: sem 3 tasks consecutivas sem verify automatizado
- [ ] Wave 0 cobre todas as referências MISSING
- [ ] Nenhuma flag de watch-mode
- [ ] Latência de feedback < 2 s
- [ ] Gate de cobertura continua verde após cada wave (folga de ~10 branches)
- [ ] `nyquist_compliant: true` no frontmatter

**Approval:** pending
