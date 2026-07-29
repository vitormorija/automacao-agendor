---
phase: 3
slug: config-segredos-por-ambiente
status: mapped
nyquist_compliant: true
wave_0_complete: n/a (arquivos de teste criados pelas próprias tasks)
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
| 03-01-T1 | 01 | 1 | CFG-04 | T-03-01 | `validateEnv(env)` é pura; production lança, dev avisa; mensagem lista TODAS as faltantes e não ecoa valores | unit | `cd backend && npm run test:coverage` (`test/config.validateEnv.test.js`) | ❌ criado pela task | ⬜ pending |
| 03-01-T2 | 01 | 1 | CFG-03 | T-03-03 | `dotenv` carrega o `.env` do backend independentemente do `cwd`; falha silenciosa documentada | unit | `cd backend && node --test test/config.dotenvPath.test.js` | ❌ criado pela task | ⬜ pending |
| 03-02-T1 | 02 | 2 | CFG-04 | T-03-06 | O `.env` de produção contém as 5 obrigatórias e é o arquivo realmente carregado | **manual (blocking-human)** | MISSING — não inspecionável a partir do repositório (D-13) | n/a | ⬜ pending |
| 03-02-T2 | 02 | 2 | CFG-04 | T-03-07 | Boot valida antes de abrir o SQLite; production morre, development sobe | unit + subprocesso | `cd backend && npm run test:coverage` + `NODE_ENV=production node -e "require('./src/config')"` | ❌ criado pela task | ⬜ pending |
| 03-03-T1 | 03 | 1 | CFG-01 | T-03-SMTP-01/02/03 | Migração preserva quando o env falta, zera quando presente, e o seeder não re-semeia | unit (1 arquivo por ramo) | `cd backend && node --test test/db.smtpPassMigration.keep.test.js test/db.smtpPassMigration.clear.test.js` | ❌ criado pela task | ⬜ pending |
| 03-03-T2 | 03 | 1 | CFG-01 | T-03-SMTP-01 | `emailer` monta o transporte com `process.env.SMTP_PASS`, nunca com `getConfig('smtp_pass')` | unit (mock da borda nodemailer) | `cd backend && node --test test/emailer.smtpPass.test.js` | ❌ criado pela task | ⬜ pending |
| 03-04-T1 | 04 | 1 | CFG-01 | T-03-SMTP-06 | `PUT /api/config` não aceita `smtp_pass` (fora de `ALLOWED_KEYS`) | unit (seam de router) | `cd backend && node --test test/config.route.smtpPass.test.js` | ❌ criado pela task | ⬜ pending |
| 03-04-T2 | 04 | 1 | CFG-01 | T-03-SMTP-07 | Campo de senha removido da UI, sem `showPass`/`Eye`/`EyeOff` órfãos | build + grep | `cd frontend && npm run lint && npm run build` + greps do acceptance criteria | n/a | ⬜ pending |
| 03-05-T1 | 05 | 1 | CFG-02, CFG-03 | T-03-09/10/11 | `.env.example` documenta exatamente as 18 variáveis lidas; sem fantasma; sem placeholder de alta entropia | unit (meta-teste anti-drift) | `cd backend && node --test test/envExample.test.js` | ❌ criado pela task | ⬜ pending |
| 03-05-T2 | 05 | 1 | CFG-02 | T-03-11 | README não contradiz o `.env.example` | grep | `grep -c STALE_DAYS README.md` → 0 | n/a | ⬜ pending |
| 03-06-T1 | 06 | 1 | CFG-01 | T-03-LEAK-01/03, T-03-SC | Job `secrets` escaneia o range do PR, com versão fixa e permissões mínimas; não nasce vermelho | CI | `gh pr checks` mostra `secrets` = success | n/a | ⬜ pending |
| 03-06-T2 | 06 | 1 | CFG-01 | T-03-LEAK-06 | Grep escopado não encontra token/segredo em código e configuração (prova independente do gitleaks) | unit (subprocesso `git grep`) | `cd backend && node --test test/secrets.grep.test.js` | ❌ criado pela task | ⬜ pending |
| 03-07-T1 | 07 | 2 | CFG-01 | T-03-GATE-02 | O contexto `secrets` já reportou na `main` antes de virar required check | **manual (blocking-human)** | MISSING — depende de merge fora do workflow (D-14) | n/a | ⬜ pending |
| 03-07-T2 | 07 | 2 | CFG-01 | T-03-GATE-01/03 | `main` exige `[backend, frontend, secrets]` com `strict` e `enforce_admins` preservados | CLI | `gh api .../branches/main/protection --jq .required_status_checks` | n/a | ⬜ pending |
| 03-07-T3 | 07 | 2 | CFG-01 | T-03-GATE-01/04/05 | PR com segredo fica BLOCKED; push protection e secret scanning habilitados | CI + CLI | PR de falha proposital + `gh api ... --jq .security_and_analysis` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Nenhuma instalação de framework é necessária — `node:test` + `c8` + `backend/test/setup.js` já
cobrem tudo. Os arquivos de teste abaixo são criados pelas próprias tasks (não há wave de
scaffolding separada):

- [x] Validação de env — resolvido por **função pura** (`validateEnv(env)` recebe objeto literal),
      o que dispensa um arquivo por `NODE_ENV`: um único `config.validateEnv.test.js` cobre os dois
      ramos. Entregue em 03-01 T1.
- [x] Teste do path do `dotenv` — `config.dotenvPath.test.js`, entregue em 03-01 T2.
- [x] Migração SMTP — **um arquivo por ramo** (`db.smtpPassMigration.keep.test.js` e
      `db.smtpPassMigration.clear.test.js`), obrigatório pelo efeito colateral no `require` de
      `db.js`. Entregues em 03-03 T1.
- [x] `emailer.smtpPass.test.js` (03-03 T2) e `config.route.smtpPass.test.js` (03-04 T1).
- [x] Completude do `.env.example` — `envExample.test.js`, entregue em 03-05 T1.
- [x] Prova independente de CFG-01 — `secrets.grep.test.js`, entregue em 03-06 T2.

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

- [x] Toda task tem `<automated>` verify — as duas exceções são os checkpoints humanos (03-02 T1 e
      03-07 T1), ambos marcados `MISSING` com a justificativa de por que nenhum teste os substitui
- [x] Continuidade de amostragem: sem 3 tasks consecutivas sem verify automatizado (o maior intervalo
      é 1 task — cada checkpoint é seguido por uma task com verify automatizado)
- [x] Nenhuma wave de scaffolding necessária: cada arquivo de teste é criado pela própria task que o
      exige, o que também é o que protege a folga do gate de cobertura
- [x] Nenhuma flag de watch-mode em nenhum comando
- [x] Latência de feedback < 2 s (`npm test` ~0,4 s; `npm run test:coverage` ~2 s)
- [x] Toda task que cria arquivo em `src/` roda `npm run test:coverage` no verify (03-01 T1 é a única
      que cria módulo novo — `config.js` — e entrega o teste junto)
- [x] `nyquist_compliant: true` no frontmatter

**Approval:** mapeado pelo planner em 2026-07-29 (7 planos, 15 tasks)
