---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Fase concluída; pronta para Phase 04
stopped_at: Phase 4 context gathered
last_updated: "2026-07-30T18:25:00.822Z"
last_activity: 2026-07-30
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 16
  completed_plans: 16
  percent: 38
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-22)

**Core value:** Rede de testes automatizados sobre a lógica crítica de notificação (quem recebe / quem não recebe) — para nunca mais uma regressão silenciosa.
**Current focus:** Phase 04 — confiabilidade-das-integracoes (próxima; ainda não iniciada)

## Current Position

Phase: 03 (config-segredos-por-ambiente) — COMPLETE
Plan: 7 of 7 — todos concluídos
Status: Fase concluída; pronta para Phase 04
Last activity: 2026-07-30

Progress: [███░░░░░░░] 38% (3 de 8 fases)

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 15 | 3 tasks | 7 files |
| Phase 01 P02 | 45 | 4 tasks | 8 files |
| Phase 01 P03 | 12 | 2 tasks | 2 files |
| Phase 01 P04 | 6 | 1 tasks | 1 files |
| Phase 01 P05 | 10 | 2 tasks | 2 files |
| Phase 02 P01 | 4 | 1 tasks | 1 files |
| Phase 02 P02 | 22 | 3 tasks | 40 files |
| Phase 02 P03 | 6 | 2 tasks | 2 files |
| Phase 03 P01 | 34 | 2 tasks | 5 files |
| Phase 03 P03 | 22min | 2 tasks | 5 files |
| Phase 03 P04 | 8min | 2 tasks | 3 files |
| Phase 3 P05 | 15min | 2 tasks | 3 files |
| Phase 03 P06 | 22min | 2 tasks tasks | 3 files files |
| Phase 03 P02 | 22min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Milestone]: Testes de caracterização antes de qualquer refatoração ou mudança de segurança (rede de segurança primeiro)
- [Milestone]: Mudanças que alteram comportamento (SEC-03/04/05) só entram com teste do novo fluxo, ou adiadas com justificativa documentada
- [Milestone]: "DONE" exige CI verde, zero segredos hardcoded e testes críticos passando
- [Phase ?]: [01-01]: Test runner nativo node:test (D-01/D-03), zero dependência de runtime nova
- [Phase ?]: [01-01]: Cobertura via c8@12 report-only (D-02); thresholds adiados para Phase 2
- [Phase ?]: [01-01]: Seam DB_PATH em db.js isola testes do backend/agendor.db; default de produção byte-idêntico (D-07)
- [Phase 01]: getStaleDeals caracterizado por two-lane (pure + integrated via stub axios); comparacao estrita do day-boundary pinada por golden — D-04/D-05/D-09: rede de seguranca contra regressao silenciosa nas regras de quem e notificado
- [Phase 01]: Fixture real-deal anonimizada commitada so apos aprovacao humana, sem reescrita de historico git — D-10: token/PII nunca entram no historico antes da revisao (checkpoint blocking-human)
- [Phase 01]: [01-03]: SQLite real em tempfile (nao :memory:) para o caso day-boundary da dedup via segunda conexao ao mesmo arquivo — D-08: viabiliza semear sent_at do passado sem tocar backend/agendor.db
- [Phase ?]: [01-04]: Quirk de match exato do funil beefor (near-miss NAO suprimido) pinado como comportamento ATUAL
- [Phase ?]: 02-01: getDealsWithFutureTasks caracterizado (a-e), comportamento atual pinado, WR-02 fechado
- [Phase ?]: [02-02]: Biome 2.5.5 como lint+format único (backend CJS + frontend ESM) via biome.json na raiz; assist off para não reordenar requires
- [Phase ?]: [02-02]: Baseline de lint warn-tolerante measure-first (D-06) — 17 regras violadas rebaixadas a warn; npm run lint exit 0 nos dois pacotes
- [Phase ?]: [02-02]: CSS fora do escopo do Biome (parser 2.5.5 aborta em @apply do Tailwind); fase é JS/JSX/CJS/ESM/JSON
- [Phase ?]: [02-03]: CI 2 jobs paralelos (backend/frontend), node 20, least-privilege (contents:read); actions pinadas @v7 (majors atuais, não @v4)
- [Phase ?]: [02-03]: gate de cobertura c8 flipado measure-first (check-coverage:true, per-file:false, pisos logo abaixo do observado) — WR-03
- [Phase 02]: [02-04]: main protegida com required status checks [backend, frontend], strict:true e enforce_admins:true — CI-01 provado por PR verde (run 30474941235) e CI-02 por PR de falha proposital com mergeStateStatus BLOCKED (run 30475739903)
- [Phase 02]: [02-04]: strict:true mantido conscientemente (exige branch atualizada com a main); custo baixo em repo single-maintainer
- [Phase ?]: [03-01]: validador de env com a regra numa FUNÇÃO PURA (validateEnv(env)) em vez do throw-no-topo de secret.js — config.js com 100% de branches; gate global subiu de 65,48% para 68,80%
- [Phase ?]: [03-01]: .env carregado por caminho absoluto derivado de __dirname (D-13/Pitfall 1) — sob PM2 (cwd /opt/agendor) o dotenv falhava em SILÊNCIO; fail-fast permanece DESLIGADO até o checkpoint humano de 03-02
- [Phase ?]: 03-03: senha SMTP vem só de process.env.SMTP_PASS; a migração de boot zera a chave do banco apenas quando o ambiente tem a senha (D-01/D-02)
- [Phase ?]: 03-03: smtp_pass removida do objeto defaults de db.js — o seeder não pode mais reintroduzir a senha no SQLite (Pitfall 3)
- [Phase 03]: [03-04]: allowlist do PUT içada para ALLOWED_KEYS sem smtp_pass e exposta como seam (padrão routes/auth.js) — fecha o caminho de escrita que desfazia a migração de 03-03 (Pitfall 4)
- [Phase 03]: [03-04]: campo de senha SMTP removido do ConfigPanel, substituído por nota citando SMTP_PASS (D-03); save() intocado — o backend ignora a chave
- [Phase 03]: [03-05]: CFG-02 fechado por meta-teste, não por revisão: backend/test/envExample.test.js compara as process.env lidas em src/ com o .env.example nas duas direções
- [Phase 03]: [03-05]: Guarda de entropia de placeholder por corrida ininterrupta de alfanuméricos (16+), não por comprimento total — separa segredo real de frase hifenizada em PT
- [Phase 03]: [03-02]: fail-fast de configuração ligado ao boot — index.js requer ./config antes de qualquer módulo local; produção não sobe sem as 5 obrigatórias (CFG-04)
- [Phase 03]: [03-02]: checkpoint humano do .env de produção declarado N/A — não existe servidor de produção; verificação transferida para o todo OPS-01 (primeiro deploy)
- [Phase 03]: [03-07]: `secrets` adicionado aos required status checks da main (agora [backend, frontend, secrets], strict + enforce_admins); provado por PR com chave sintética → mergeStateStatus BLOCKED
- [Phase 03]: [03-07]: Secret Scanning nativo habilitado só pela metade — `secret_scanning` e `push_protection` ativos; `non_provider_patterns` e `validity_checks` são recusados EM SILÊNCIO (PATCH devolve 200 e ignora). Consequência: o token do sec-01 NÃO gera alerta nativo, contrariando o que se esperava ao decidir D-11 — nenhuma camada automática vai lembrar da rotação
- [Phase 03]: [03-07]: a chave de exemplo da AWS (AKIAIOSFODNN7EXAMPLE) é allowlisted pelo gitleaks — testar um gate de segredo com exemplo canônico de documentação prova o oposto do pretendido

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

- `sec-01-rotate-agendor-token` (**alta prioridade**, → ação operacional) — token real da API Agendor exposto no histórico do repositório **público**, commit `13905d4` (`.claude/settings.local.json` e `backend/.env.example`). Rotação adiada por decisão consciente em 2026-07-29 para preservar o gate de CI-02. Reescrever histórico NÃO resolve; tornar privado quebra a branch protection (testado). Só a rotação no painel da Agendor encerra a exposição.

- `sec-02-dependency-vulnerabilities` (**alta prioridade**, → Phase 4) — 12 advisories no backend (5 high) e 4 no frontend (2 high, todas devDependencies). As três que importam: `nodemailer` (e-mail para domínio não intencionado + injeção SMTP), `axios` (SSRF + bypass de auth) e `path-to-regexp` (ReDoS nas rotas). O CI **não roda `npm audit`** — nada detecta isso hoje. Corrigir em duas levas: as sem major primeiro, depois `nodemailer` 6→9 e `node-cron` 3→4 com teste do novo fluxo.

- `ops-01-validar-env-e-pm2-no-primeiro-deploy` (**alta prioridade**, → Phase 8) — **não existe servidor de produção nem deploy em `/opt/agendor`; o projeto roda só localmente** (confirmado pelo usuário em 2026-07-30). Por isso o checkpoint da Task 1 do 03-02 foi registrado como N/A, não bloqueado. Quando houver servidor, validar as 5 variáveis obrigatórias no `.env` e o `cwd` do PM2 antes do primeiro boot com fail-fast ligado. Dois riscos herdados: `SMTP_PASS` não tem mais recuperação pela UI, e um eventual `/opt/agendor/.env` órfão deixou de valer após a correção do 03-01.

Resolvidos e arquivados em `.planning/todos/completed/`:

- ~~`wr-02-cover-getdealswithfuturetasks`~~ — fechado em 02-01
- ~~`wr-03-enforce-coverage-thresholds`~~ — fechado em 02-03

### Blockers/Concerns

[Issues that affect future work]

- Node.js não está instalado no sistema (binários em `/tmp`, wrappers em `~/bin`); considerar ao configurar test runner/CI localmente
- ~~Frontend e backend têm `package.json` separados (sem workspaces); toolchain (Phase 2) precisa cobrir os dois~~ — resolvido na Phase 2 (Biome na raiz + 2 jobs de CI com cache por lockfile)
- Token do `gh` precisou do escopo `workflow` para publicar `.github/workflows/` (concedido em 2026-07-29). Clone/máquina novos vão esbarrar nisso: `gh auth refresh -h github.com -s workflow`. Registrar no runbook de onboarding da Phase 8.
- ~~PR #1 (`chore/production-readiness`) aberto~~ — **mesclado na `main` em 2026-07-29** (merge commit `2d1857f`, 64 commits, merge commit e não squash para preservar os hashes citados nos SUMMARYs). Branch de origem apagada local e remotamente.
- **Push direto na `main` agora é RECUSADO** (`enforce_admins: true`). Todo trabalho exige branch + PR com `backend`/`frontend` verdes. Branch de trabalho da Phase 3: `chore/phase-03-config-segredos`.
- **O repositório PRECISA continuar público para o gate existir.** Conta pessoal free: repo privado retorna `403 Upgrade to GitHub Pro` tanto na branch protection clássica quanto em rulesets. Testado e revertido em 2026-07-29. Tornar privado = perder CI-02.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260724-lea | Fix WR-01: neutralizar SMTP_PASS/ADMIN_EMAIL no setup de testes | 2026-07-24 | cd050e1 | [260724-lea-fix-wr-01-neutralize-smtp-pass-and-admin](./quick/260724-lea-fix-wr-01-neutralize-smtp-pass-and-admin/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-30T18:25:00.813Z
Stopped at: Phase 4 context gathered
Resume file: .planning/phases/04-confiabilidade-das-integra-es/04-CONTEXT.md
