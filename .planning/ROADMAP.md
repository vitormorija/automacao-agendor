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
- [x] **Phase 2: Toolchain de Qualidade & CI** - Lint, formatação, scripts npm e pipeline de CI que bloqueia PRs com falha (completed 2026-07-29)
- [x] **Phase 3: Config & Segredos por Ambiente** - Segredos fora do código, `.env.example`, separação dev/prod e validação no boot (completed 2026-07-30)
- [ ] **Phase 4: Confiabilidade das Integrações** - Timeouts em Agendor/SMTP, cron resiliente a falhas e isolamento de estado por execução (35/35 planos executados em 2026-08-05, suíte 192/192; a fase foi reaberta **cinco** vezes por code review. Os cinco blockers de regra de negócio estão fechados e o `in3-08` — último filtro de elegibilidade fail-open — foi resolvido pelo 04-35. A r5 mudou de perfil: **CR5-01 BLOCKER** e WR5-01 não mudam quem recebe, quebram os **sinais** construídos para perceber falha — a chave `skipped` colide com o contrato do lock e produz toast de erro em branco; o alarme de supressão total é desarmado por qualquer `continue` anterior. Gap closure r5 pendente, escopo travado pelo usuário: CR5-01 + WR5-01 + reescrita do todo `cr4-01b`)
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
  - [x] 02-04-PLAN.md — Branch protection required checks + prova de PR falho (CI-02)

### Phase 3: Config & Segredos por Ambiente
**Goal**: Nenhum segredo vive no código; todas as variáveis vêm do ambiente, documentadas e validadas no boot, com separação clara dev vs produção.
**Depends on**: Phase 2
**Requirements**: CFG-01, CFG-02, CFG-03, CFG-04
**Success Criteria** (what must be TRUE):
  1. `grep` no repositório não encontra token Agendor, credenciais SMTP ou `JWT_SECRET` hardcoded — todos via variáveis de ambiente (CFG-01)
  2. `.env.example` lista todas as variáveis necessárias, sem valores sensíveis (CFG-02)
  3. Configuração dev vs produção está separada, sem valores sensíveis versionados (CFG-03)
  4. Boot falha rápido, com mensagem clara, quando uma variável de ambiente obrigatória está ausente (CFG-04)
**Nota de ordenação (travas de uma via, derivadas do RESEARCH)**:
  - D-13 — corrigir o path do `dotenv` e auditar o `.env` de produção (checkpoint humano) ANTES de ligar o fail-fast; inverter derruba produção no próximo `pm2 restart`
  - D-14 — mesclar o job `secrets` na `main` ANTES de adicioná-lo aos required status checks; inverter trava o merge permanentemente (`enforce_admins: true`)
**Plans**: 7 plans
  - [x] 03-01-PLAN.md — Fundação de config: `dotenv` determinístico + `validateEnv` puro e testável (CFG-03/CFG-04)
  - [x] 03-02-PLAN.md — Ligar o fail-fast no boot, após checkpoint humano do `.env` de produção (CFG-04, D-13)
  - [x] 03-03-PLAN.md — Senha SMTP sai do banco: migração defensiva em `db.js` + `emailer` lê do ambiente (CFG-01, D-01/D-02)
  - [x] 03-04-PLAN.md — Fechar a escrita da senha: allowlist do PUT + campo removido do `ConfigPanel` (CFG-01, D-03)
  - [x] 03-05-PLAN.md — `.env.example` completo + meta-teste anti-drift + README sincronizado (CFG-02/CFG-03, D-07/D-10/D-12)
  - [x] 03-06-PLAN.md — Job `secrets` (gitleaks) no CI + grep escopado como prova independente (CFG-01, D-08/D-15)
  - [x] 03-07-PLAN.md — Gate real: required status check `secrets`, Secret Scanning nativo e runbook (CFG-01, D-09/D-11/D-14)

### Phase 4: Confiabilidade das Integrações
**Goal**: Integrações de saída (Agendor HTTP, SMTP) e o agendador cron toleram lentidão e falhas sem travar ou derrubar o sistema.
**Depends on**: Phase 3
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05, REL-06
**Success Criteria** (what must be TRUE):
  1. Chamadas HTTP à API Agendor (instância axios compartilhada + chamada ad-hoc em `/resolved`) têm timeout explícito, verificável em config/teste (REL-01)
  2. Envio SMTP tem timeout e trata falha sem lançar exceção não capturada (REL-02)
  3. Falha em `runCheck`/`runWeeklySummary` é registrada e o agendador continua ativo (não derruba o processo) (REL-03)
  4. O estado de categorias de organização é **isolado por execução** de `getStaleDeals`: nenhuma execução pode ler, apagar, reutilizar ou contaminar o estado de outra, e portanto categoria obsoleta nunca atravessa rodadas; teste confirma o comportamento nas duas direções do entrelaçamento (REL-04, D-05 + CR2-01) — *redação atualizada por decisão C9 (2026-08-05): a formulação anterior descrevia o MECANISMO ("`orgCategoryCache` é invalidado a cada execução"), e esse mecanismo deixou de existir no 04-12, que eliminou o dicionário de módulo e passou o cache a nascer e morrer dentro da execução. A remoção da limpeza por execução está APROVADA pelo usuário e não é regressão de REL-04*
  5. Status `'sent'` só é gravado após envio confirmado; falha total grava `'error'` e a rodada seguinte retenta (dedup de envios bem-sucedidos preservada) (REL-05, Decisão Q1)
  6. Falha na consulta de tarefas futuras aborta a rodada sem notificar — registrada, lock liberado, rodada seguinte executa (REL-06, Decisão Q2)
  7. Quando a categoria da organização não pode ser determinada — a consulta falha mesmo depois do retry da borda —, o negócio é tratado como **indecidível**: fica **fora de todo e-mail dirigido ao responsável** (notificação diária e relatório individual semanal) e **permanece visível** no painel, no relatório consolidado do admin e no snapshot semanal; a rodada **não** é abortada por causa dele e segue processando os demais negócios (REL-06 estendido a CR3-01, decisão do usuário de 2026-08-05) — *escrito como comportamento garantido, e não como mecanismo, pelo mesmo motivo registrado no item 4 (decisão C9): um critério que nomeia identificador não sobrevive à mudança que o remove*
  8. Uma rodada em que **nenhum** negócio parado pôde ser notificado porque a categoria da organização não pôde ser consultada deixa de ser indistinguível de um dia calmo: ela registra **quantos** negócios foram suprimidos por essa causa, marca a execução como tendo erro numa superfície que o painel **de fato exibe**, e emite uma linha de log em nível de erro. Uma supressão **parcial** continua sem alarme, e o comportamento por negócio aprovado em CR3-01 (item 7) não muda; uma supressão total causada por **outro** filtro — dedup do dia, funil sem notificação ao responsável, ausência de destinatário — não dispara o alarme, de modo que o sinal discrimina a causa e não a quantidade. E a prévia do envio marca, negócio a negócio, quem **será** notificado, de modo que o número exibido antes do disparo não prometa mais do que o envio entrega (REL-03 e REL-06; CR4-01 e WR4-06, decisão do usuário de 2026-08-05) — *escrito como comportamento garantido, e não como mecanismo, pelo mesmo motivo registrado nos itens 4 e 7 (decisão C9): um critério que nomeia identificador faz o verificador procurar por um símbolo que o refactor seguinte apaga, e este item nasceu justamente de um conserto anterior cujo mecanismo mudou de forma três vezes dentro da mesma fase*
**Contrato de entrega**: `.planning/phases/04-confiabilidade-das-integra-es/04-DELIVERY-CONTRACT.md` (aprovado 2026-08-04; 7 planos, decisões Q1-Q5)
**Plans**: 7 planos originais + 4 de gap closure (r1) + 7 de gap closure (r2) + 9 de gap closure (r3) + 7 de gap closure (r4) = 34 (execução estritamente sequencial; `parallelization: false`)
- [x] 04-01-PLAN.md — Caracterização da resiliência do scheduler: falha registrada, lock liberado, concorrência recusada (REL-03) · termina em C2
- [x] 04-02-PLAN.md — Fail-safe na consulta de tarefas futuras: completo ou falha explícita, rodada abortada sem notificar (REL-06, Q2)
- [x] 04-03-PLAN.md — Timeout HTTP de 15s na instância Agendor + `getDealById` + bump `axios@^1.19.0` (REL-01, D-01, Q3) · termina em C4
- [x] 04-04-PLAN.md — Timeouts SMTP 10s/10s/30s na fábrica `createTransporter` + caracterização da exaustão (REL-02, D-02/D-03)
- [x] 04-05-PLAN.md — Atualização `nodemailer` 6→9 (`^9.0.4`), protegida pelos testes de REL-02 · termina em C3+C4
- [x] 04-06-PLAN.md — Consistência do status de envio: `'sent'` só após confirmação, falha total retentável (REL-05, Q1)
- [x] 04-07-PLAN.md — Invalidação do `orgCategoryCache` a cada execução de `getStaleDeals` (REL-04, D-05)

**Gap closure r1** (fonte: `04-REVIEW-r1.md`, status `issues_found` — 2 critical, 6 warning, 4 info; não existe `04-VERIFICATION.md`, a execução parou no gate de code review). 4 planos **aditivos**, waves 1-4, `gap_closure: true`:
- [x] 04-08-PLAN.md — Corrida do `orgCategoryCache`: categoria por organização em mapa local à execução (CR-01, WR-06) · termina em C7
- [x] 04-09-PLAN.md — `AGENDOR_TOKEN` fora do log de erro de `/api/deals/stale` + validação do id em `getDealById` (CR-02, WR-03) · registra a triagem dos demais achados como todo · termina em C8
- [x] 04-10-PLAN.md — Sucesso parcial sobrevive à exceção e `results.notified` só conta envio real (WR-01, WR-04, WR-05)
- [x] 04-11-PLAN.md — Retry de 429 também na consulta de tarefas futuras (WR-02)

**Gap closure r2** (fonte: `04-REVIEW.md`, `round: 2`, status `issues_found` — 1 critical, 6 warning, 4 info; a rodada 2 verificou ceticamente as conclusões da r1 e REABRIU a fase). 7 planos **aditivos**, waves 5-11, `gap_closure: true`. Ordem por risco: CR2-01 primeiro (bloqueante do Core Value), depois o helper de teste que é oráculo dos demais:
- [x] 04-12-PLAN.md — Cache de categorias escopado à execução: fim do estado de módulo compartilhado entre execuções (CR2-01) · termina em C9
- [x] 04-13-PLAN.md — `avancarRelogioAte` normaliza o desfecho e para de produzir `unhandledRejection` atribuído ao caso errado (WR2-03)
- [x] 04-14-PLAN.md — `results.notified` acompanha o status também no caminho de exceção (WR2-01)
- [x] 04-15-PLAN.md — A falha ao REGISTRAR o desfecho do envio para de abortar a rodada: gravação protegida e fail-safe `'pending'` declarado (WR2-02) · termina em C10
- [x] 04-16-PLAN.md — O canal `err.resultadosParciais` é validado por tipo antes de ser consumido: parcial corrompido vira "nada confirmado" em vez de derrubar a rodada (WR2-04)
- [x] 04-17-PLAN.md — O transporte recriado no retry serve o destinatário seguinte (WR2-05) · termina em C11
- [x] 04-18-PLAN.md — Âncoras estáveis nos comentários e registro de IN2-01..IN2-04 como todos pendentes (WR2-06)

**Gap closure r3** (fonte: `04-REVIEW.md`, `round: 3`, status `issues_found` — 1 critical, 7 warning, 8 info; a rodada 3 verificou ceticamente as conclusões da r2 e REABRIU a fase pela terceira vez). 9 planos **aditivos**, waves 12-20, `gap_closure: true`. Ordem por risco: o blocker primeiro, dividido em borda / consumidor diário / consumidor semanal; depois os warnings de produção; a higiene dos instrumentos de teste por último, antes do resíduo documental. **Requisito estrutural desta rodada:** todo plano de correção inclui também o teste do cenário SIMÉTRICO (a mesma falha na direção oposta, ou o vizinho imediato do caminho corrigido), porque nas três rodadas anteriores o achado seguinte foi sempre o vizinho do conserto anterior:
- [x] 04-19-PLAN.md — A consulta de categoria entra no retry da borda e falha como INDECIDÍVEL, em vez de fail-open (CR3-01, parte 1)
- [x] 04-20-PLAN.md — Negócio de categoria indecidível fica fora do envio diário, sem abortar a rodada (CR3-01, parte 2)
- [x] 04-21-PLAN.md — O resumo semanal individual também não lista negócio indecidível; o consolidado do admin mantém (CR3-01, caminho vizinho)
- [x] 04-22-PLAN.md — `/users` e `/deals/:id` entram na política única de retry, e o comentário passa a enumerar as bordas (WR3-01)
- [x] 04-23-PLAN.md — A leitura de dedup deixa de abortar a rodada quando o SQLite falha (WR3-02)
- [x] 04-24-PLAN.md — O canal do resultado parcial é validado no elemento, não só no contêiner (WR3-03)
- [x] 04-25-PLAN.md — Teto de páginas com falha explícita nas duas paginações sem limite (WR3-06)
- [x] 04-26-PLAN.md — Relógio por caso, helper único e estado neutro em `beforeEach` (WR3-04, WR3-05, WR3-07)
- [x] 04-27-PLAN.md — IN3-01..IN3-08 como todos pendentes e o critério do fail-safe de categoria no ROADMAP

**Gap closure r4** (fonte: `04-REVIEW.md`, `round: 4`, status `issues_found` — 1 critical, 7 warning, 6 info; a rodada 4 verificou ceticamente as conclusões da r3 e REABRIU a fase pela quarta vez). 7 planos **aditivos**, waves 21-27, `gap_closure: true`. Ordem por risco: o blocker primeiro, depois os warnings de produção agrupados por módulo, a higiene dos instrumentos de teste por último, e o resíduo documental no fim. **Requisito estrutural desta rodada — o INVENTÁRIO DE IRMÃOS, que SUBSTITUI o mandato do cenário simétrico da r3:** o revisor avaliou o mandato anterior e concluiu que ele funcionou mas resolveu o problema errado — o padrão que reprovou r1→r2→r3 nunca foi "faltou o input simétrico", foi **"faltou o CÓDIGO VIZINHO"** (a função irmã, o terceiro ponto de chamada, o outro arquivo que documenta o mesmo fato), e simétrico de *entrada* não detecta vizinho de *código*. Agora todo plano de correção contém, por escrito, um inventário das construções GÊMEAS do conserto, com cada item marcado como **corrigida**, **verificada-e-sã** (provada por medição ou teste, nunca presumida) ou **fora-de-escopo-com-medição e com dono**. Foi exatamente esse método que produziu WR4-01 (a terceira paginação sem teto, cuja justificativa escrita para excluí-la é factualmente falsa) e WR4-02 (dois comentários que hoje se contradizem):
- [x] 04-28-PLAN.md — A supressão TOTAL por categoria indecidível vira erro da rodada: contador próprio, campo de erro, array de erros e log em nível de erro (CR4-01, blocker)
- [x] 04-29-PLAN.md — Teto de páginas na terceira paginação e guarda de envelope em `getUsers` (WR4-01, WR4-05)
- [x] 04-30-PLAN.md — Teto de concorrência na consulta de categoria por organização, o único fan-out proporcional ao volume de dados (WR4-04)
- [x] 04-31-PLAN.md — A prévia do envio marca quem será notificado, e o botão do painel conta por ela (WR4-06)
- [x] 04-32-PLAN.md — Responsável sem nome deixa de derrubar o resumo semanal de todos os comerciais (WR4-07)
- [x] 04-33-PLAN.md — Comentários da suíte alinhados ao instrumento único e âncoras nomeadas no oráculo de REL-02 (WR4-02, WR4-03)
- [x] 04-34-PLAN.md — IN4-02..IN4-06 e os cinco residuais do inventário de irmãos como todos pendentes, e o critério de observabilidade no ROADMAP
- [x] 04-35-PLAN.md — Um funil renomeado no CRM volta a suprimir a notificação ao responsável, e um payload sem funil deixa de fazê-lo em silêncio (in3-08)

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
| 2. Toolchain de Qualidade & CI | 4/4 | Complete   | 2026-07-29 |
| 3. Config & Segredos por Ambiente | 7/7 | Complete   | 2026-07-30 |
| 4. Confiabilidade das Integrações | 35/35 | Reaberta (review r5: CR5-01 blocker) | — |
| 5. Logging & Padronização de Erros | 0/TBD | Not started | - |
| 6. Hardening de Segurança | 0/TBD | Not started | - |
| 7. Refatoração Incremental de Arquitetura | 0/TBD | Not started | - |
| 8. Documentação & Runbook | 0/TBD | Not started | - |
