# PRD — Automação Agendor

**Documento de Requisitos de Produto**
Versão 1.0 · Status: pronto para revisão do time de engenharia

| | |
|---|---|
| **Produto** | Automação Agendor — monitoramento de negócios parados no CRM |
| **Objetivo deste doc** | Alinhar o time interno para subir o projeto em produção |
| **Stack** | Node.js/Express · React/Vite · SQLite · PM2 + Nginx |
| **Referências** | [`README.md`](./README.md) (setup) · [`DOCUMENTACAO.md`](./DOCUMENTACAO.md) (técnico) |

---

## 1. Sumário executivo

Negócios (deals) em andamento no Agendor frequentemente ficam **parados sem
atualização**, sem que ninguém perceba a tempo — o que significa oportunidades
esfriando e receita escorrendo. Hoje esse acompanhamento depende de inspeção
manual do CRM, que não escala e não é consistente.

A **Automação Agendor** resolve isso monitorando o CRM diariamente, detectando
negócios sem movimentação além de um limite configurável e **alertando
automaticamente os responsáveis por e-mail**, com link rastreável de volta ao
card. Um painel web dá visibilidade do funil parado, histórico de alertas e
relatórios gerenciais.

O sistema **já está construído e funcional**. Este documento consolida o que ele
faz, sua arquitetura, o estado de prontidão para produção (incluindo o hardening
de segurança já aplicado) e o roadmap para a subida.

## 2. Problema e contexto

- **Quem sente a dor:** gestão comercial e os próprios comerciais (donos dos
  negócios).
- **Dor:** não há gatilho automático quando um negócio "esfria". A descoberta é
  tardia, manual e reativa.
- **Impacto:** perda de oportunidades, follow-up inconsistente, falta de
  visibilidade gerencial sobre o funil parado.
- **Por que agora:** o volume de negócios no Agendor tornou o acompanhamento
  manual inviável; é preciso um processo automático e auditável.

## 3. Objetivos e métricas de sucesso

| Objetivo | Métrica | Como medimos |
|----------|---------|--------------|
| Reduzir negócios parados | Nº de deals parados > limite, semana a semana | Snapshots semanais no banco |
| Garantir follow-up | Taxa de cliques nos alertas | Tracking de cliques (`clicked_at`) |
| Acelerar reação | Tempo médio até a 1ª atualização após o alerta | Histórico de notificações vs. `updatedAt` do deal |
| Confiabilidade | % de execuções diárias bem-sucedidas | Logs do scheduler |

## 4. Usuários

- **Comercial (responsável pelo negócio):** recebe o e-mail de alerta e age no
  card. Acessa o painel para ver seus negócios parados.
- **Gestor / administrador:** recebe o resumo semanal consolidado, acompanha o
  funil parado por responsável/categoria/funil e gerencia configurações e
  usuários do sistema.

## 5. Escopo

### 5.1 Dentro do escopo (já implementado)

- **Verificação diária automática** dos negócios em andamento (configurável via
  cron; padrão 8h, fuso America/Sao_Paulo).
- **Detecção de negócios parados** acima de um limite de dias configurável
  (padrão 15), monitorando apenas deals a partir de 2026-01-01.
- **Notificação por e-mail** ao responsável (e opcionalmente ao autor), com link
  rastreável (tracking de cliques) de volta ao card no Agendor.
- **Anti-ruído:** não notifica duas vezes no mesmo dia, ignora deals com tarefa
  futura agendada, e exclui deals ganhos/perdidos. Funis específicos podem não
  notificar o responsável.
- **Resumo semanal:** consolidado para administradores + relatório individual
  por comercial (sextas às 11h).
- **Painel web autenticado:** dashboard, lista de negócios parados, histórico de
  notificações, relatórios com gráficos, configurações e gestão de usuários.
- **Autenticação:** login com JWT, hash bcrypt, rate-limit por IP, fluxo de
  redefinição de senha por e-mail, log de acessos.

### 5.2 Fora do escopo (por ora)

- Integração com canais além de e-mail (Slack, WhatsApp).
- Escrita de volta no Agendor (o sistema só lê o CRM).
- Multi-tenant / múltiplas organizações.
- App mobile nativo.

## 6. Arquitetura

```
        ┌──────────────┐      HTTPS        ┌───────────────────────┐
        │   Navegador  │ ───────────────▶  │  Nginx (proxy + TLS)  │
        │  (React SPA) │                   └───────────┬───────────┘
        └──────────────┘                               │ /api → :3001
                                                        ▼
                                          ┌──────────────────────────┐
                                          │  Backend Node/Express     │
                                          │  (PM2)                    │
                                          │  ├─ Auth (JWT, bcrypt)    │
                                          │  ├─ Rotas REST            │
                                          │  ├─ Scheduler (node-cron) │
                                          │  ├─ Emailer (nodemailer)  │
                                          │  └─ Logger estruturado    │
                                          └─────┬───────────────┬─────┘
                                                │               │
                                   ┌────────────▼───┐    ┌──────▼────────────┐
                                   │  SQLite        │    │  API Agendor (v3) │
                                   │  (agendor.db)  │    │  + SMTP           │
                                   └────────────────┘    └───────────────────┘
```

- **Frontend:** SPA React/Vite. Em produção é buildado e servido pelo próprio
  backend (ou pelo Nginx). Em dev, proxy `/api` → `:3001`.
- **Backend:** Express com camadas de auth, rotas REST, scheduler e emailer.
- **Persistência:** SQLite (config, histórico de notificações, snapshots
  semanais, usuários, tokens de reset, logs de acesso).
- **Integrações:** API Agendor v3 (leitura) e SMTP (envio).

## 7. Regras de negócio (resumo)

- Monitora deals **em andamento** criados a partir de **2026-01-01**.
- "Parado" = sem atualização há mais de `STALE_DAYS` dias (padrão 15).
- Exclui deals **ganhos/perdidos** e os com **tarefa futura agendada**.
- **Não reenvia** alerta para o mesmo deal no mesmo dia.
- E-mail vai ao **responsável** e, se configurado, ao **autor**; resumo semanal
  vai aos **administradores**.

> Detalhamento completo em [`DOCUMENTACAO.md`](./DOCUMENTACAO.md).

## 8. Prontidão para produção

### 8.1 Já endereçado (hardening aplicado nesta entrega)

| Área | O que era | O que foi feito |
|------|-----------|-----------------|
| 🔴 Segurança | Endpoint `/api/save-screenshot` com path traversal | **Removido** |
| 🔴 Segurança | `JWT_SECRET` com fallback previsível | **Obrigatório, sem fallback** (falha no boot se ausente) |
| 🔴 Segurança | Usuários/senhas hardcoded no código | **Removidos**; admin inicial via env (`SEED_ADMIN_*`) |
| 🔴 Segurança | Gestão de usuários sem autorização | **`ADMIN_USERS`** restringe criação/exclusão |
| 🟠 Segurança | Erros 500 vazavam stack/mensagem | **Mensagem genérica** em produção |
| 🟠 Dados | Exports de cliente fora do `.gitignore` | **Protegidos** (`.csv/.xlsx/.txt/html`, `/data/`) |
| 🟡 Robustez | `console.*` espalhado | **Logger estruturado** (JSON em prod) |
| 🟡 Robustez | Restart bruto perdia escritas | **Graceful shutdown** (cron + HTTP + SQLite) |
| 🟡 Robustez | Leak de file descriptors no error handler | **Stream único** reaproveitado |
| 🟡 Performance | Sem índices no banco | **Índices** em `notification_log` |
| 🟡 Qualidade | Config gravava qualquer valor | **Validação** de cron, porta, e-mails, booleanos |
| 🟡 Portabilidade | Caminho de máquina no `start.sh`; dep morta | **Corrigidos**; `engines: node >=20` |

### 8.2 Recomendado antes/logo após a subida

| Prioridade | Item | Por quê |
|:---:|------|---------|
| Alta | **Rotacionar o `AGENDOR_TOKEN`** | O token apareceu em arquivos/apresentações locais |
| Alta | Definir `NODE_ENV=production`, `ALLOWED_ORIGINS`, `JWT_SECRET` forte no servidor | CORS, modo prod e segurança |
| Alta | Habilitar HTTPS no Nginx | Tráfego e tokens em trânsito |
| Média | Testes automatizados (scheduler, auth, regras de negócio) | Hoje não há testes — risco em mudanças |
| Média | CI (lint + testes + build) | Garantir qualidade a cada PR |
| Média | Backup automatizado do `agendor.db` + monitoramento do cron | Recuperação e visibilidade |
| Baixa | CSP no helmet (hoje desativada) | Defesa adicional no frontend |

### 8.3 Dívida técnica conhecida (roadmap de qualidade)

- **`emailer.js` (645 linhas)** com 3 templates HTML inline → extrair templates
  e dar escaping nas variáveis.
- **Frontend:** componentes monolíticos (300–400 linhas), `fetch` espalhado e
  monkey-patch global de `window.fetch` → centralizar em uma camada de serviço
  e avaliar `react-router`.
- **Migrations** por `try/catch` silencioso → adotar versionamento de schema.
- **Rate-limit/cache em memória** → mover para store compartilhado se escalar
  para múltiplas instâncias.

> Estes itens **não bloqueiam** a subida — o sistema funciona — mas devem entrar
> no backlog de evolução.

## 9. Plano de rollout

1. **Provisionar servidor** (Node 20+, Nginx, PM2) — ver [`deploy/instalar.sh`](./deploy).
2. **Configurar `.env`** de produção (token rotacionado, `JWT_SECRET` forte,
   SMTP, `ALLOWED_ORIGINS`, `BASE_URL`, `NODE_ENV=production`).
3. **Build do frontend** e start do backend via PM2 (`ecosystem.config.js`).
4. **Configurar HTTPS** no Nginx e o domínio (`agendor.<empresa>.com.br`).
5. **Criar admin inicial** (`SEED_ADMIN_*`) e validar login.
6. **Smoke test:** health check, verificação manual (`/api/notifications/run`),
   envio de e-mail de teste (`/api/config/test-smtp`).
7. **Ativar agendamento** e monitorar a primeira execução automática.
8. **Backup** do `agendor.db` agendado (`deploy/backup.sh`).

## 10. Requisitos não-funcionais

- **Segurança:** segredos só em variáveis de ambiente; senhas com bcrypt; CORS
  restrito; HTTPS em produção.
- **Confiabilidade:** graceful shutdown; healthcheck; logs estruturados;
  idempotência nas notificações.
- **Manutenibilidade:** logger central, validação de input, README + docs.
- **Performance:** índices no banco; chamadas à API Agendor paralelizadas.
- **Observabilidade:** logs de acesso (morgan), de erro e de aplicação;
  histórico e snapshots persistidos.

## 11. Riscos e mitigação

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Token Agendor exposto localmente | Acesso indevido ao CRM | Rotacionar antes da subida |
| Falha no envio SMTP | Alertas não chegam | `test-smtp`, logs de erro, retry manual via painel |
| SQLite em arquivo único | Perda de dados | Backup agendado + graceful shutdown |
| Ausência de testes | Regressões em mudanças | Priorizar suíte mínima no backlog |
| Mudança na API Agendor | Quebra da verificação | Centralizar no cliente `agendor.js`; monitorar erros |

---

### Apêndice — Decisão de escopo desta entrega

O hardening priorizou o que é **alto valor e baixo risco** para a subida:
segurança, robustez operacional, validação, documentação. Refatorações
estruturais maiores (quebrar o `emailer.js`, reorganizar o frontend) foram
**deliberadamente adiadas** para não introduzir risco em um sistema que já
funciona — e estão registradas no roadmap (§8.3).
