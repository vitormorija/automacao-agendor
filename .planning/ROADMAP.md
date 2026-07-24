# Roadmap: Automação Agendor — Estabilização & Produção

## Overview

Etapa de estabilização de um sistema já em produção (monitor de deals parados no CRM Agendor + dashboard React). Não constrói produto novo — profissionaliza o que existe, preservando o comportamento atual. A jornada segue camadas horizontais montadas incrementalmente: primeiro uma **rede de testes de caracterização** sobre a lógica crítica de notificação (quem recebe / quem não recebe), que torna todo o resto seguro; depois toolchain de qualidade + CI; config/segredos por ambiente; confiabilidade das integrações; logging/erros padronizados; hardening de segurança (não-comportamental direto, comportamental somente com teste do novo fluxo); refatoração incremental de arquitetura protegida pelos testes; e por fim documentação/runbook.

**Critérios de release do milestone ("DONE"):** CI verde em cada PR, zero segredos hardcoded no repositório, e os testes críticos de notificação passando. Nenhuma mudança de comportamento funcional entra sem teste cobrindo o novo comportamento.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Rede de Testes (Safety-Net)** - Testes de caracterização fixam o comportamento atual da lógica crítica de notificação antes de qualquer mudança (completed 2026-07-24)
- [ ] **Phase 2: Toolchain de Qualidade & CI** - Lint, formatação, scripts npm e pipeline de CI que bloqueia PRs com falha
- [ ] **Phase 3: Config & Segredos por Ambiente** - Segredos fora do código, `.env.example`, separação dev/prod e validação no boot
- [ ] **Phase 4: Confiabilidade das Integrações** - Timeouts em Agendor/SMTP, cron resiliente a falhas e cache com TTL
- [ ] **Phase 5: Logging & Padronização de Erros** - `console.*` residual migrado para `logger` estruturado e resposta de erro consistente
- [ ] **Phase 6: Hardening de Segurança** - Riscos do CONCERNS.md fechados; mudanças comportamentais só com teste do novo fluxo (ou adiadas com justificativa)
- [ ] **Phase 7: Refatoração Incremental de Arquitetura** - Extrair `getEnrichedStaleDeals` e serviço de agregação, sem alterar comportamento, protegido pelos testes
- [ ] **Phase 8: Documentação & Runbook** - README por ambiente e runbook de operação (deploy PM2, backup, troubleshooting)

## Phase Details

### Phase 1: Rede de Testes (Safety-Net)
**Goal**: Existe uma rede de testes automatizados que fixa o comportamento **atual** da lógica crítica de notificação, permitindo detectar regressões antes de qualquer mudança de hardening ou refatoração.
**Depends on**: Nothing (first phase)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. `npm test` no backend executa com um runner configurado e passa, tanto local quanto em CI (TEST-01)
  2. Testes de caracterização de `getStaleDeals()` cobrem inclusão/exclusão por threshold de dias, categoria, stage, owner e funil, e passam contra o comportamento atual (TEST-02)
  3. Teste confirma que o mesmo deal não é notificado duas vezes no mesmo dia (`alreadyNotifiedToday`) (TEST-03)
  4. Teste fixa a supressão por funil (`shouldNotifyOwner` / `NO_OWNER_NOTIFY_FUNNELS` = "beefor") (TEST-04)
  5. Testes cobrem rate-limit de login e verificação de senha (TEST-05)
**Plans**: 5 plans
- [x] 01-01-PLAN.md — Test-runner foundation: node:test wiring, c8 coverage, shared setup, DB_PATH seam (TEST-01)
- [x] 01-02-PLAN.md — getStaleDeals characterization (threshold/category/stage/owner/status) + anonymized real-deal fixture (TEST-02)
- [x] 01-03-PLAN.md — Same-day dedup characterization: alreadyNotifiedToday incl. day boundary (TEST-03)
- [x] 01-04-PLAN.md — Beefor funnel suppression characterization: shouldNotifyOwner quirks (TEST-04)
- [x] 01-05-PLAN.md — Auth logic characterization: login rate-limit + verifyPassword (TEST-05)

### Phase 2: Toolchain de Qualidade & CI
**Goal**: Qualidade de código é verificada automaticamente — lint, formatação, testes e build — localmente e como gate obrigatório em cada PR.
**Depends on**: Phase 1 (o CI executa o script `test` criado na Fase 1)
**Requirements**: QUAL-01, QUAL-02, QUAL-03, CI-01, CI-02
**Success Criteria** (what must be TRUE):
  1. `npm run lint` executa em backend e frontend com regras versionadas; zero erros no código atual (ou baseline documentado) (QUAL-01)
  2. `npm run format` (ex.: Prettier) roda com config versionada em backend e frontend (QUAL-02)
  3. Scripts `lint`, `format` e `test` estão presentes em ambos os `package.json` (backend e frontend) (QUAL-03)
  4. Pipeline de CI roda lint + testes + build a cada PR e fica verde no estado atual (CI-01)
  5. Um PR com lint, teste ou build falhando é bloqueado de merge via status check obrigatório (CI-02)
**Carried from Phase 1 review** (`01-REVIEW.md`; ver `.planning/todos/pending/`):
  - WR-02 — adicionar cobertura de caracterização para `getDealsWithFutureTasks` (agendor.js:171-204), 0% coberto e usado pelo scheduler para decidir quem é notificado
  - WR-03 — impor thresholds de cobertura (c8 `check-coverage`) integrados ao CI, para a rede de segurança não erodir em silêncio
**Plans**: 4 plans
  - [x] 02-01-PLAN.md — Teste de caracterização WR-02 (`getDealsWithFutureTasks`)
  - [x] 02-02-PLAN.md — Biome: config + scripts + commit de formatação + guard + baseline lint (QUAL-01/02/03)
  - [x] 02-03-PLAN.md — CI workflow `ci.yml` (CI-01) + flip do gate de cobertura c8 (WR-03)
  - [ ] 02-04-PLAN.md — Branch protection required checks + prova de PR falho (CI-02)

### Phase 3: Config & Segredos por Ambiente
**Goal**: Nenhum segredo vive no código; todas as variáveis vêm do ambiente, documentadas e validadas no boot, com separação clara dev vs produção.
**Depends on**: Phase 2
**Requirements**: CFG-01, CFG-02, CFG-03, CFG-04
**Success Criteria** (what must be TRUE):
  1. `grep` no repositório não encontra token Agendor, credenciais SMTP ou `JWT_SECRET` hardcoded — todos via variáveis de ambiente (CFG-01)
  2. `.env.example` lista todas as variáveis necessárias, sem valores sensíveis (CFG-02)
  3. Configuração dev vs produção está separada, sem valores sensíveis versionados (CFG-03)
  4. Boot falha rápido, com mensagem clara, quando uma variável de ambiente obrigatória está ausente (CFG-04)
**Plans**: TBD

### Phase 4: Confiabilidade das Integrações
**Goal**: Integrações de saída (Agendor HTTP, SMTP) e o agendador cron toleram lentidão e falhas sem travar ou derrubar o sistema.
**Depends on**: Phase 3
**Requirements**: REL-01, REL-02, REL-03, REL-04
**Success Criteria** (what must be TRUE):
  1. Chamadas HTTP à API Agendor (instância axios compartilhada + chamada ad-hoc em `/resolved`) têm timeout explícito, verificável em config/teste (REL-01)
  2. Envio SMTP tem timeout e trata falha sem lançar exceção não capturada (REL-02)
  3. Falha em `runCheck`/`runWeeklySummary` é registrada e o agendador continua ativo (não derruba o processo) (REL-03)
  4. `orgCategoryCache` ganha TTL/invalidação; teste confirma que categoria obsoleta não é usada indefinidamente (REL-04)
**Plans**: TBD

### Phase 5: Logging & Padronização de Erros
**Goal**: Logging é estruturado e consistente em todo o backend, e o tratamento/resposta de erro nas rotas segue um padrão único.
**Depends on**: Phase 4
**Requirements**: LOG-01, LOG-02
**Success Criteria** (what must be TRUE):
  1. `grep` por `console.` em `agendor.js`, `emailer.js`, `routes/deals.js` e `routes/track.js` retorna zero ocorrências residuais (LOG-01)
  2. Logs de produção nesses módulos saem em formato estruturado (JSON) via `logger`, respeitando `LOG_LEVEL`/`NODE_ENV` (LOG-01)
  3. Rotas usam um padrão único e consistente de resposta de erro (shape/formato uniforme) (LOG-02)
**Plans**: TBD

### Phase 6: Hardening de Segurança
**Goal**: Riscos de segurança conhecidos do CONCERNS.md são fechados — os não-comportamentais diretamente; os que alteram comportamento (SEC-03/04/05) **somente** com teste cobrindo o novo fluxo, ou adiados com justificativa documentada. Protegido pela rede de testes da Fase 1.
**Depends on**: Phase 5 (e, para SEC-03/04/05, pela rede de testes da Phase 1)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05
**Success Criteria** (what must be TRUE):
  1. Login faz comparação dummy (constant-time) quando o usuário não existe, mitigando enumeração por timing — coberto por teste (SEC-01)
  2. `agendor.db` e os backups têm permissões restritivas de filesystem, documentadas nos scripts de deploy/runbook (SEC-02)
  3. `ADMIN_USERS` fail-closed: endpoints de gestão de usuário são negados quando não configurado, com teste cobrindo o novo controle de acesso (SEC-03)
  4. JWT movido para cookie httpOnly com teste do fluxo login/logout — **OU** adiado com justificativa documentada em PROJECT.md/ROADMAP (SEC-04)
  5. CSP habilitado no helmet com teste de que o frontend não quebra — **OU** adiado com justificativa documentada (SEC-05)
**Plans**: TBD
**UI hint**: yes

### Phase 7: Refatoração Incremental de Arquitetura
**Goal**: Lógica duplicada de enriquecimento de deals e regras de agregação embutidas em rotas são extraídas para módulos coesos, sem alterar comportamento — cada mudança protegida pelos testes de caracterização da Fase 1.
**Depends on**: Phase 6 (execução sequencial; corretude garantida pelos testes da Phase 1)
**Requirements**: ARCH-01, ARCH-02
**Success Criteria** (what must be TRUE):
  1. Existe um helper único `getEnrichedStaleDeals(staleDays)` usado em `routes/deals.js`, `reports.js`, `notifications.js` e `scheduler.js`, sem re-implementação duplicada (ARCH-01)
  2. A lógica de agregação de relatórios vive em um módulo de serviço (fora de `routes/`), deixando os handlers finos (ARCH-02)
  3. Todos os testes de caracterização da Fase 1 continuam verdes após a refatoração, comprovando ausência de mudança de comportamento (ARCH-01, ARCH-02)
**Plans**: TBD

### Phase 8: Documentação & Runbook
**Goal**: Operar e configurar o sistema por ambiente está documentado de forma que qualquer pessoa consiga fazer setup, deploy e troubleshooting.
**Depends on**: Phase 7
**Requirements**: DOC-01, DOC-02
**Success Criteria** (what must be TRUE):
  1. README atualizado cobre setup, execução e variáveis de ambiente por ambiente (dev vs produção) (DOC-01)
  2. Runbook de operação documenta deploy PM2, política de backup e troubleshooting de cron/e-mail (DOC-02)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Rede de Testes (Safety-Net) | 5/5 | Complete   | 2026-07-24 |
| 2. Toolchain de Qualidade & CI | 3/4 | In Progress|  |
| 3. Config & Segredos por Ambiente | 0/TBD | Not started | - |
| 4. Confiabilidade das Integrações | 0/TBD | Not started | - |
| 5. Logging & Padronização de Erros | 0/TBD | Not started | - |
| 6. Hardening de Segurança | 0/TBD | Not started | - |
| 7. Refatoração Incremental de Arquitetura | 0/TBD | Not started | - |
| 8. Documentação & Runbook | 0/TBD | Not started | - |
