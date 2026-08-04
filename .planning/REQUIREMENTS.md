# Requirements: Automação Agendor — Estabilização & Produção

**Defined:** 2026-07-22
**Core Value:** Rede de testes automatizados sobre a lógica crítica de notificação (quem recebe / quem não recebe) — para nunca mais uma regressão silenciosa.

## v1 Requirements

Requisitos desta etapa de estabilização. A ordem reflete dependência: testes primeiro, depois hardening/refatoração sobre a rede de segurança.

### Testes (Rede de Segurança)

- [x] **TEST-01**: Test runner configurado no backend com script `test` executável em CI e local
- [x] **TEST-02**: Testes de caracterização de `getStaleDeals()` fixam o comportamento atual das regras de inclusão/exclusão (threshold de dias, categoria, stage, owner, funil)
- [x] **TEST-03**: Testes de dedup fixam o "não reenviar o mesmo deal no mesmo dia" (`alreadyNotifiedToday`)
- [x] **TEST-04**: Testes de supressão por funil fixam `shouldNotifyOwner` / `NO_OWNER_NOTIFY_FUNNELS`
- [x] **TEST-05**: Testes da lógica de auth sensível: rate-limit de login e verificação de senha

### Qualidade (Toolchain)

- [x] **QUAL-01**: Linter configurado em backend e frontend, com script `lint` executável e regras versionadas
- [x] **QUAL-02**: Formatador (ex.: Prettier) configurado com script `format` e config versionada
- [x] **QUAL-03**: Scripts npm padronizados (`lint`, `format`, `test`) presentes em backend e frontend

### Integração Contínua

- [x] **CI-01**: Pipeline de CI roda lint + testes + build a cada PR
- [x] **CI-02**: CI bloqueia o merge do PR quando lint, teste ou build falham

### Config & Segredos por Ambiente

- [x] **CFG-01**: Nenhum segredo/token hardcoded no repositório (token Agendor, credenciais SMTP, JWT_SECRET) — todos via variáveis de ambiente
- [x] **CFG-02**: `.env.example` documenta todas as variáveis necessárias, sem valores sensíveis
- [x] **CFG-03**: Separação clara de configuração dev vs produção, sem valores sensíveis versionados
- [x] **CFG-04**: Boot valida a presença das variáveis de ambiente obrigatórias e falha rápido se faltarem

### Confiabilidade das Integrações

- [ ] **REL-01**: Timeout explícito nas chamadas HTTP à API Agendor (instância axios compartilhada + chamada ad-hoc em `/resolved`)
- [ ] **REL-02**: Timeout e tratamento de falha no envio SMTP (nodemailer)
- [x] **REL-03**: Falha em uma execução do cron é registrada e não derruba o agendador (tratamento de erro em `runCheck`/`runWeeklySummary`)
- [ ] **REL-04**: `orgCategoryCache` ganha TTL/invalidação para não usar categoria obsoleta indefinidamente
- [ ] **REL-05**: Status de envio consistente em falhas — `'sent'` somente após envio confirmado; falha total registra `'error'` e permite retentativa na rodada seguinte; dedup de envios realmente bem-sucedidos preservada (derivado de DESC-1 / Decisão Q1, 04-DELIVERY-CONTRACT.md, 2026-08-04)
- [x] **REL-06**: Falha na consulta de tarefas futuras aborta a rodada sem disparar notificações — resultado completo ou falha explícita, nunca proteção parcial silenciosa (derivado de DESC-2 / Decisão Q2, 04-DELIVERY-CONTRACT.md, 2026-08-04)

### Logging & Erros

- [ ] **LOG-01**: `console.*` residual substituído pelo `logger` estruturado nos módulos backend (`agendor.js`, `emailer.js`, `routes/deals.js`, `routes/track.js`)
- [ ] **LOG-02**: Padrão único e consistente de tratamento/resposta de erro nas rotas

### Segurança (não altera comportamento)

- [ ] **SEC-01**: Mitigação de enumeração de usuário por timing no login (comparação dummy quando usuário não existe)
- [ ] **SEC-02**: Permissões restritivas de filesystem no `agendor.db` e nos backups em produção

### Segurança (altera comportamento — só com teste do novo fluxo)

- [ ] **SEC-03**: `ADMIN_USERS` fail-closed — endpoints de gestão de usuário negados quando não configurado (requer teste cobrindo o novo controle de acesso)
- [ ] **SEC-04**: JWT movido para cookie httpOnly (requer teste do fluxo de login/logout) — **ou** adiado com justificativa documentada
- [ ] **SEC-05**: CSP habilitado no helmet (requer teste de que o frontend não quebra) — **ou** adiado com justificativa documentada

### Arquitetura (reorganização incremental, sem alterar comportamento)

- [ ] **ARCH-01**: Extrair helper único `getEnrichedStaleDeals(staleDays)` e usá-lo em todas as rotas + scheduler, protegido pelos testes de caracterização
- [ ] **ARCH-02**: Mover lógica de agregação de relatórios das rotas para um módulo de serviço, deixando os handlers finos

### Documentação

- [ ] **DOC-01**: README atualizado com setup, execução e variáveis de ambiente por ambiente
- [ ] **DOC-02**: Runbook de operação (deploy PM2, backup, troubleshooting de cron/e-mail)

## v2 Requirements

Reconhecidos mas adiados — fora do roadmap desta etapa.

### Confiabilidade & Performance

- **RETN-01**: Política de retenção/arquivamento para `notification_log` (crescimento ilimitado)
- **PERF-01**: Cache server-side de TTL curto em torno de `getStaleDeals()`
- **PERF-02**: Paralelizar paginação de `getDealsWithFutureTasks()`

### Resiliência de Frontend

- **UIRB-01**: React error boundary para degradar graciosamente em erro de render

### Segurança avançada

- **SECV-01**: Criptografia em repouso do `smtp_pass` no SQLite
- **SECV-02**: Rate-limit de login em store persistente (só se houver escala horizontal)

## Out of Scope

Explicitamente excluído para evitar scope creep.

| Feature | Reason |
|---------|--------|
| Novas funcionalidades de produto | Só depois da estabilização; não misturar refatoração com feature |
| Reescrita do projeto (rewrite) | Reorganização é incremental, não redesign do zero |
| Migração SQLite → Postgres/MySQL | Aceitável para escala atual (interno, single-instance PM2) |
| Escala horizontal / múltiplas instâncias | Fora do alvo; PM2 single-instance é premissa |
| Ambiente de staging | Não existe e não será criado nesta etapa (alvo é só produção) |
| Remover código sem prova de que é morto | Só remover com comprovação de que é realmente inutilizado |

## Traceability

Preenchido na criação do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-01 | Phase 1 | Complete |
| TEST-02 | Phase 1 | Complete |
| TEST-03 | Phase 1 | Complete |
| TEST-04 | Phase 1 | Complete |
| TEST-05 | Phase 1 | Complete |
| QUAL-01 | Phase 2 | Complete |
| QUAL-02 | Phase 2 | Complete |
| QUAL-03 | Phase 2 | Complete |
| CI-01 | Phase 2 | Complete |
| CI-02 | Phase 2 | Complete |
| CFG-01 | Phase 3 | Complete |
| CFG-02 | Phase 3 | Complete |
| CFG-03 | Phase 3 | Complete |
| CFG-04 | Phase 3 | Complete |
| REL-01 | Phase 4 | Pending |
| REL-02 | Phase 4 | Pending |
| REL-03 | Phase 4 | Complete |
| REL-04 | Phase 4 | Pending |
| REL-05 | Phase 4 | Pending |
| REL-06 | Phase 4 | Complete |
| LOG-01 | Phase 5 | Pending |
| LOG-02 | Phase 5 | Pending |
| SEC-01 | Phase 6 | Pending |
| SEC-02 | Phase 6 | Pending |
| SEC-03 | Phase 6 | Pending |
| SEC-04 | Phase 6 | Pending |
| SEC-05 | Phase 6 | Pending |
| ARCH-01 | Phase 7 | Pending |
| ARCH-02 | Phase 7 | Pending |
| DOC-01 | Phase 8 | Pending |
| DOC-02 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 31 total (29 originais + REL-05/REL-06 derivados na Fase 4)
- Mapped to phases: 31 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-07-22*
*Last updated: 2026-07-22 after roadmap creation (traceability mapped to 8 phases)*
