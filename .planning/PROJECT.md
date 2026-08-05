# Automação Agendor — Estabilização & Produção

## What This Is

Sistema interno que monitora negócios ("deals") parados no CRM Agendor e notifica os responsáveis por e-mail. É composto por um backend Node/Express + SQLite (client da API Agendor, filtros de negócio, agendador cron, envio de e-mail) e um dashboard React (login, negócios parados, histórico, relatórios, configuração). Já está **funcional e em uso**. Esta etapa não constrói produto novo — profissionaliza e prepara o que existe para produção, preservando o comportamento atual.

## Core Value

Antes de qualquer mudança, existir uma **rede de testes automatizados sobre a lógica crítica de notificação** (quem recebe / quem não recebe). É ela que torna todo o resto — hardening, refatoração, mudanças de segurança — seguro. Se só uma coisa desta etapa der certo, é esta: nunca mais uma regressão silenciosa nas regras de quem é notificado.

## Requirements

### Validated

<!-- Inferido do código existente (.planning/codebase/*) — já em produção. -->

- ✓ Puxa deals "Em andamento" da API Agendor com paginação e retry em 429 — existing (`backend/src/agendor.js`)
- ✓ Filtra deals parados por threshold de dias + exclusões (categoria, stage, owner, funil) — existing (`getStaleDeals`)
- ✓ Envia e-mail de notificação ao owner + admin, sem reenviar o mesmo deal no mesmo dia — existing (`emailer.js`, `alreadyNotifiedToday`)
- ✓ Agendador cron: check diário (8h America/Sao_Paulo) + resumo semanal — existing (`scheduler.js`)
- ✓ Rastreamento de cliques em links de e-mail (rota pública guarded) — existing (`routes/track.js`)
- ✓ Dashboard React autenticado por JWT: Dashboard, Negócios, Histórico, Relatórios, Config — existing (`frontend/src/`)
- ✓ Auth: login com bcrypt, rate-limit por IP, reset de senha, CRUD de usuários — existing (`routes/auth.js`)
- ✓ Config runtime como key-value em SQLite, editável pela UI (SMTP, cron, threshold) — existing (`db.js`, `routes/config.js`)
- ✓ Boot falha rápido se `JWT_SECRET` ausente/fraco — existing (`secret.js`)
- ✓ Rede de testes de caracterização sobre a lógica crítica de notificação (getStaleDeals, dedup, supressão por funil, auth) — Validado na Phase 1 (`backend/test/`, 28 testes via `node:test`); ampliada para **196 testes** até a Phase 4
- ✓ Toolchain de qualidade (Biome) + CI bloqueando PR com falha — Validado na Phase 2
- ✓ Segredos fora do código, `.env.example` e validação no boot — Validado na Phase 3 (a exposição histórica do token permanece aberta como SEC-01, risco aceito)
- ✓ Timeouts e tratamento de falha nas integrações de saída (Agendor HTTP, SMTP) e no cron — Validado na Phase 4 (REL-01..REL-06, 8/8 Success Criteria conferidos contra o código; 38 planos e 5 rodadas de code review)

### Active

<!-- Metas desta etapa de estabilização. Ordem reflete dependência: testes primeiro. -->

- [ ] Padronizar logging (eliminar `console.*` residual em favor do `logger` estruturado) e tratamento de erros
- [ ] Fechar riscos de segurança do CONCERNS.md que **não** alteram comportamento (ex.: timeouts, permissões de arquivo do DB/backup)
- [ ] Reorganização incremental de arquitetura/responsabilidades (ex.: extrair `getEnrichedStaleDeals`, tirar lógica de agregação das rotas) — sem alterar comportamento
- [ ] Documentação e config por ambiente atualizadas (README, `.env.example`, runbook de operação)
- [ ] Mudanças de segurança que **alteram comportamento** (JWT→cookie httpOnly, ADMIN_USERS fail-closed, ligar CSP) — **somente** quando cobertas por teste do novo fluxo

### Out of Scope

<!-- Limites explícitos com justificativa. -->

- Novas funcionalidades de produto — só depois da estabilização; não misturar refatoração com feature
- Reescrita do projeto (rewrite) — a reorganização é incremental, não um redesign do zero
- Migração de SQLite para Postgres/MySQL — aceitável para escala atual (ferramenta interna, single-instance PM2); só se a escala crescer
- Escala horizontal / múltiplas instâncias — fora do alvo (PM2 single-instance é premissa)
- Ambiente de staging — não existe e não será criado nesta etapa (alvo é só produção)
- Remoção de código sem prova de que está morto — só remover com comprovação de que é realmente inutilizado
- Mudança de comportamento funcional sem teste cobrindo o novo comportamento

## Context

- **Brownfield:** codebase mapeado em `.planning/codebase/` (ARCHITECTURE, STACK, CONVENTIONS, INTEGRATIONS, TESTING, CONCERNS, STRUCTURE). Usar como fonte de verdade do estado atual.
- **Stack:** Backend Node.js + Express + better-sqlite3 + nodemailer + node-cron + axios; Frontend React + Vite + Tailwind. DB SQLite (`backend/agendor.db`).
- **Trabalho em andamento:** branch atual `chore/production-readiness` (JWT_SECRET já tornado obrigatório no boot). Esta etapa dá continuidade a esse esforço.
- **Dívida técnica conhecida (CONCERNS.md):** nenhum teste automatizado (0% cobertura), `console.*` inconsistente vs `logger`, `orgCategoryCache` sem TTL, sem timeout HTTP nas chamadas Agendor, rate-limit de login em memória, `notification_log` sem retenção, sem CI, sem React error boundary.
- **Riscos de segurança conhecidos:** JWT em `localStorage` (XSS), `ADMIN_USERS` vazio = qualquer usuário vira admin (fail-open), `smtp_pass` em texto plano no SQLite, possível enumeração de usuário por timing no login, CSP desativado.
- **Áreas frágeis (alta prioridade de teste):** cadeia de regras de `getStaleDeals()`, supressão por funil (`shouldNotifyOwner`/`NO_OWNER_NOTIFY_FUNNELS` hardcoded "beefor"), crescimento ilimitado de `notification_log`.

## Constraints

- **Processo**: Reorganização incremental — não reescrever o projeto inteiro
- **Processo**: Não alterar comportamento funcional sem teste cobrindo o novo comportamento
- **Processo**: Não misturar refatoração estrutural com novas funcionalidades no mesmo trabalho
- **Processo**: Não remover código sem comprovar que está realmente inutilizado
- **Deploy**: Alvo único de produção via PM2 (`ecosystem.config.js`), single-instance — sem staging, sem escala horizontal
- **Tech stack**: Manter stack atual (Express 4, better-sqlite3 9, React 18, Vite 5); sem trocar frameworks nesta etapa
- **Dados**: SQLite compartilhado para dados de negócio e auth; manter (sem migrar de banco)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Testes de caracterização antes de qualquer refatoração | Rede de segurança para não regredir regras de notificação | ✓ Validada (Fases 1–4) — a rede saiu de 0 para 196 testes e foi ela que sustentou 38 planos e 5 rodadas de review sem regressão silenciosa |
| Mudanças que alteram comportamento só com teste do novo fluxo | Preservar comportamento observável; evitar surpresas em produção | ✓ Validada (Fase 4) — toda mudança de "quem recebe" entrou com RED medido antes do GREEN; os casos que pinavam o comportamento antigo foram reescritos explicitamente, nunca apagados |
| Config por ambiente para 1 alvo (produção PM2), sem staging | Realidade do deploy atual; não inventar infra que não existe | ✓ Validada (Fase 3) |
| Segredos fora do git, via env por ambiente | Fechar vazamento de token Agendor/SMTP do repositório | ◐ Parcial — o código não tem mais segredo hardcoded (Fase 3) e a Fase 4 fechou a gravação do token em disco pelo log de erro (CR-02). **SEC-01 segue aberto**: o token continua exposto no histórico do repo público, e só a rotação no painel da Agendor encerra isso (risco aceito, decisão C8) |
| Adiar novas features até estabilização concluída | Não misturar refatoração com feature; base segura primeiro | ✓ Sustentada — 4 fases sem feature nova |
| Achado de code review vira plano com RED medido, não correção direta | Cinco rodadas na Fase 4 mostraram que o conserto "óbvio" abre o vizinho: CR3-01 gerou CR4-01, que gerou CR5-01 | ✓ Validada (Fase 4) — cada blocker foi reproduzido por sonda antes de corrigido |
| Todo conserto lista suas construções gêmeas ("inventário de irmãos") | O padrão que reabriu a Fase 4 quatro vezes foi sempre código vizinho não olhado, não input não testado | ✓ Validada (Fase 4, r4–r5) — produziu achados que 4 rodadas de review não tinham encontrado; ampliado com direção reversa e retroatividade da justificativa |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-05 — Fase 4 (Confiabilidade das Integrações) completa*
