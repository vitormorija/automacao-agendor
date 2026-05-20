# Automação Agendor — Documentação Técnica

> Sistema de monitoramento e notificação automática de negócios parados no CRM Agendor.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Tecnologias utilizadas](#3-tecnologias-utilizadas)
4. [Estrutura de pastas](#4-estrutura-de-pastas)
5. [Banco de dados](#5-banco-de-dados)
6. [Regras de negócio](#6-regras-de-negócio)
7. [Funcionalidades do sistema](#7-funcionalidades-do-sistema)
8. [API — Endpoints disponíveis](#8-api--endpoints-disponíveis)
9. [Agendamento automático](#9-agendamento-automático)
10. [Rastreamento de cliques](#10-rastreamento-de-cliques)
11. [Configurações](#11-configurações)
12. [Como executar localmente](#12-como-executar-localmente)
13. [Variáveis de ambiente](#13-variáveis-de-ambiente)
14. [Considerações para produção](#14-considerações-para-produção)

---

## 1. Visão geral

O **Automação Agendor** é um sistema interno criado para monitorar o CRM Agendor e identificar negócios ou leads que estão sem atualização há mais de um determinado número de dias (padrão: 15 dias). Quando detectados, o sistema envia automaticamente um e-mail de alerta para o responsável pelo card, incentivando a retomada do contato.

### Problema que resolve

Equipes comerciais frequentemente deixam cards no Agendor sem atualização por períodos prolongados, o que compromete o acompanhamento das oportunidades. Este sistema age como um fiscal automático, garantindo que nenhum negócio fique esquecido.

### Fluxo resumido

```
Agendor API → Detecta cards parados → Filtra regras → Envia e-mail → Registra no banco → Rastreia cliques
```

---

## 2. Arquitetura

O sistema é dividido em duas partes principais:

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                         │
│         React + Vite + Tailwind CSS                 │
│              http://localhost:5173                  │
│                                                     │
│  Dashboard │ Negócios │ Histórico │ Configurações   │
└─────────────────┬───────────────────────────────────┘
                  │ HTTP (proxy /api → backend)
┌─────────────────▼───────────────────────────────────┐
│                    BACKEND                          │
│         Node.js + Express                           │
│              http://localhost:3001                  │
│                                                     │
│  Scheduler (node-cron) │ Emailer │ DB (SQLite)      │
└────────────┬────────────────────────┬───────────────┘
             │                        │
    ┌────────▼────────┐      ┌────────▼────────┐
    │   Agendor API   │      │   SQLite DB     │
    │  api.agendor.   │      │  agendor.db     │
    │  com.br/v3      │      │  (local)        │
    └─────────────────┘      └─────────────────┘
```

### Comunicação

- O **frontend** se comunica exclusivamente com o **backend** via REST API (`/api/*`)
- O **backend** consome a **API do Agendor** para buscar deals e tarefas
- O **backend** usa **SQLite** para persistir configurações, logs de notificações e rastreamento de cliques
- O envio de e-mails é feito via **SMTP** (configurado com Gmail App Password)

---

## 3. Tecnologias utilizadas

### Backend
| Tecnologia | Versão | Uso |
|---|---|---|
| Node.js | v22 | Runtime |
| Express | ^4 | Servidor HTTP / API REST |
| better-sqlite3 | ^9 | Banco de dados SQLite |
| nodemailer | ^6 | Envio de e-mails SMTP |
| node-cron | ^3 | Agendamento de tarefas |
| axios | ^1 | Consumo da API do Agendor |
| dotenv | ^16 | Variáveis de ambiente |

### Frontend
| Tecnologia | Versão | Uso |
|---|---|---|
| React | ^18 | Interface |
| Vite | ^5 | Build e dev server |
| Tailwind CSS | ^3 | Estilização |
| lucide-react | latest | Ícones |
| react-hot-toast | latest | Notificações visuais |

### Integrações externas
| Serviço | Uso |
|---|---|
| Agendor API v3 | Busca de deals, usuários e tarefas |
| Gmail SMTP | Envio de e-mails de notificação |

---

## 4. Estrutura de pastas

```
Automacao_agendor/
├── backend/
│   ├── src/
│   │   ├── index.js              # Entrada do servidor Express
│   │   ├── agendor.js            # Integração com API do Agendor
│   │   ├── emailer.js            # Templates e envio de e-mails
│   │   ├── scheduler.js          # Lógica de agendamento e verificação
│   │   ├── db.js                 # Banco de dados SQLite
│   │   └── routes/
│   │       ├── deals.js          # GET /api/deals/stale
│   │       ├── notifications.js  # GET/POST /api/notifications/*
│   │       ├── config.js         # GET/PUT /api/config
│   │       ├── reports.js        # GET /api/reports/*
│   │       └── track.js          # GET /api/track/click
│   ├── agendor.db                # Banco SQLite (gerado automaticamente)
│   ├── .env                      # Variáveis de ambiente (não versionar)
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # Componente raiz com as 4 abas
│   │   └── components/
│   │       ├── Dashboard.jsx     # Cards resumo + controle manual
│   │       ├── DealsList.jsx     # Tabela de negócios parados
│   │       ├── NotificationHistory.jsx  # Histórico paginado
│   │       └── ConfigPanel.jsx   # Configurações SMTP e agendamento
│   ├── start.sh                  # Script de inicialização (define PATH)
│   └── package.json
│
├── iniciar.sh                    # Script para subir backend + frontend
└── DOCUMENTACAO.md               # Este arquivo
```

---

## 5. Banco de dados

O sistema usa **SQLite** (arquivo `backend/agendor.db`), criado automaticamente na primeira execução.

### Tabela: `config`

Armazena todas as configurações do sistema.

| Coluna | Tipo | Descrição |
|---|---|---|
| key | TEXT (PK) | Nome da configuração |
| value | TEXT | Valor da configuração |

**Configurações disponíveis:**

| Chave | Padrão | Descrição |
|---|---|---|
| `stale_days` | `15` | Dias sem atualização para considerar parado |
| `admin_email` | — | E-mail(s) do admin (separados por vírgula) |
| `smtp_host` | `smtp.gmail.com` | Servidor SMTP |
| `smtp_port` | `587` | Porta SMTP |
| `smtp_user` | — | Usuário SMTP |
| `smtp_pass` | — | Senha SMTP (App Password) |
| `smtp_from` | — | E-mail remetente |
| `cron_schedule` | `0 8 * * *` | Cron de execução automática |
| `notifications_enabled` | `true` | Liga/desliga o envio automático |
| `notify_author` | `true` | Notifica também o criador do card |

---

### Tabela: `notification_log`

Histórico completo de todas as notificações enviadas.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | INTEGER PK | Identificador único |
| deal_id | INTEGER | ID do deal no Agendor |
| deal_title | TEXT | Título do negócio |
| owner_name | TEXT | Nome do responsável |
| owner_email | TEXT | E-mail do responsável |
| admin_email | TEXT | E-mail(s) do admin notificado |
| sent_at | TEXT | Data/hora do envio (ISO 8601) |
| days_stale | INTEGER | Dias parado no momento do envio |
| status | TEXT | `sent` ou `error` |
| error | TEXT | Mensagem de erro (se houver) |
| deal_updated_at | TEXT | Data da última atualização do deal |
| deal_type | TEXT | `Lead` ou `Negócio` |
| web_url | TEXT | URL do deal no Agendor |
| resolved | INTEGER | `1` se o deal foi atualizado após notificação |
| resolved_at | TEXT | Data em que foi resolvido |
| clicked_at | TEXT | Data/hora do clique no link do e-mail |

---

### Tabela: `weekly_snapshots`

Snapshots semanais do estado dos negócios parados (usados nos relatórios de tendência).

| Coluna | Tipo | Descrição |
|---|---|---|
| id | INTEGER PK | Identificador |
| week_label | TEXT | Ex: `Semana 30/04/2026` |
| snapshot_at | TEXT | Timestamp do snapshot |
| total_stale | INTEGER | Total de cards parados |
| avg_days | REAL | Média de dias parado |
| max_days | INTEGER | Máximo de dias parado |
| by_owner | TEXT | JSON: contagem por responsável |
| by_category | TEXT | JSON: contagem por categoria |
| by_funnel | TEXT | JSON: contagem por funil |

---

## 6. Regras de negócio

### Quais cards são monitorados

O sistema monitora apenas deals que atendam **todos** os critérios:

- ✅ Criados a partir de **01/01/2026**
- ✅ Status **"Em andamento"** (`deal_status_id = 1`)
- ✅ Sem atualização há mais de **`stale_days`** dias (padrão: 15)
- ✅ Organização **não** pertence às categorias excluídas

### Categorias excluídas (nunca notificadas)

- `Inativo (sem resposta)`
- `Parceiro`
- `Fornecedor`

### Responsável excluído

- `Maria Lobato` — cards sob responsabilidade desta pessoa são completamente ignorados

### Classificação Lead vs. Negócio

A classificação do card no e-mail é definida pela **categoria da organização**:

| Categoria da org. | Tipo no e-mail |
|---|---|
| `Cliente`, `Cliente Ouro`, `Cliente Bronze` | **Negócio** |
| Qualquer outra (Lead, Concorrente, etc.) | **Lead** |

### Proteção por tarefa futura

Se um card possui uma **tarefa aberta com prazo no futuro**, ele **não recebe notificação** enquanto o prazo não chegar. Quando o prazo passa (e a tarefa continua em aberto), o card volta a entrar no ciclo normal de notificações.

Exemplo: card com tarefa agendada para 06/jul → sem notificação até 07/jul.

### Prevenção de reenvio no mesmo dia

O sistema verifica se já enviou notificação para o mesmo deal no dia atual. Se sim, pula o envio para evitar duplicatas.

### Para quem é enviado o e-mail

Para cada deal parado, são notificados:
1. **Responsável** (`owner`) — sempre
2. **Criador** (`author`) — se diferente do responsável e se `notify_author = true`

---

## 7. Funcionalidades do sistema

### Dashboard
- Cards com totais: negócios parados / notificações enviadas / links clicados / último envio
- Status do agendador (ativo/pausado, próxima execução)
- **Controle manual**: botão para verificar sem enviar + botão para enviar após verificar
- Lista das últimas 5 notificações com indicador de clique

### Negócios parados (aba)
- Tabela completa com todos os deals parados em tempo real
- Filtros: busca por texto, tipo (Lead/Negócio), responsável
- Indicadores por linha: dias parado (cor por urgência), status de notificação, tarefa agendada
- Cache local para carregamento instantâneo entre sessões

### Histórico de notificações
- Paginação com 20 registros por página
- Colunas: status, negócio, responsável, e-mail, dias parado, link clicado, data/hora
- Seção "Resolução": verifica quais deals notificados foram atualizados no Agendor (taxa de resolução)

### Configurações
- Todos os parâmetros editáveis via interface: SMTP, threshold de dias, cron, admin e-mail
- Botão "Testar SMTP" para validar a conexão antes de salvar
- Toggle para pausar/ativar o agendamento

---

## 8. API — Endpoints disponíveis

### Deals

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/deals/stale` | Lista deals parados com flag `hasFutureTask` |

### Notificações

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/notifications` | Histórico paginado (`?limit=&offset=`) |
| GET | `/api/notifications/status` | Status do scheduler + estatísticas |
| POST | `/api/notifications/check` | Verifica deals parados **sem enviar** e-mail |
| POST | `/api/notifications/run` | Verifica **e envia** notificações |
| GET | `/api/notifications/notified-deals` | Mapa `deal_id → {clicked, clicked_at}` |
| GET | `/api/notifications/resolved` | Verifica quais deals foram atualizados pós-notificação |
| POST | `/api/notifications/test-card` | Envia e-mail de card de teste para um endereço |
| POST | `/api/notifications/test-summary` | Envia resumo semanal de teste |

### Rastreamento

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/track/click?log_id=X` | Registra clique e redireciona para o Agendor |

### Configuração

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/config` | Retorna todas as configs (senha mascarada) |
| PUT | `/api/config` | Atualiza configurações |
| POST | `/api/config/test-smtp` | Testa conexão SMTP |

### Relatórios

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/reports/weekly-snapshots` | Histórico semanal para gráficos de tendência |

---

## 9. Agendamento automático

O sistema usa **node-cron** para dois agendamentos automáticos:

### 1. Verificação diária — `0 8 * * *`

Roda todos os dias às **8h00 (fuso: America/Sao_Paulo)**:
1. Busca todos os deals parados na API do Agendor
2. Busca tarefas abertas com prazo futuro (proteção)
3. Filtra deals já notificados hoje
4. Envia e-mail para cada responsável elegível
5. Registra tudo no banco de dados

### 2. Resumo semanal — `0 11 * * 5`

Roda toda **sexta-feira às 11h**:
1. Busca todos os deals parados
2. Gera e salva um snapshot semanal no banco
3. Envia e-mail de resumo consolidado para o(s) admin(s)

> **Importante:** O agendamento funciona enquanto o processo Node.js estiver ativo. Para ambientes de produção, ver seção 14.

---

## 10. Rastreamento de cliques

Cada e-mail enviado contém um botão com um link de rastreamento único:

```
http://servidor:3001/api/track/click?log_id=123
```

Quando o destinatário clica:
1. O backend registra `clicked_at` no `notification_log`
2. O backend redireciona automaticamente para a URL real do deal no Agendor
3. O clique aparece no Dashboard, no Histórico e na lista de Negócios

O usuário **não percebe o redirecionamento** — é transparente.

---

## 11. Configurações

Todas as configurações são editáveis pela interface web na aba **Configurações**. Não é necessário editar arquivos manualmente.

### SMTP (Gmail recomendado)

Para usar Gmail, é necessário criar uma **App Password** (não usar a senha da conta):
1. Acesse [myaccount.google.com](https://myaccount.google.com)
2. Segurança → Verificação em duas etapas → Senhas de app
3. Gere uma senha para "Mail" e use no campo `smtp_pass`

### Expressão cron

O campo `cron_schedule` aceita expressões cron padrão:

| Expressão | Significado |
|---|---|
| `0 8 * * *` | Todo dia às 8h (padrão) |
| `0 9 * * 1-5` | Dias úteis às 9h |
| `0 8,14 * * *` | Todo dia às 8h e 14h |

---

## 12. Como executar localmente

### Pré-requisitos

- Node.js v18+ instalado
- Conta no Agendor com token de API
- Conta Gmail com App Password configurada

### 1. Configurar variáveis de ambiente

Crie o arquivo `backend/.env`:

```env
AGENDOR_TOKEN=seu_token_aqui
ADMIN_EMAIL=admin@suaempresa.com.br
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seuemail@gmail.com
SMTP_PASS=sua_app_password
SMTP_FROM=seuemail@gmail.com
BASE_URL=http://localhost:3001
PORT=3001
```

### 2. Instalar dependências

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3. Iniciar o backend

```bash
cd backend
node src/index.js
# Servidor disponível em http://localhost:3001
```

### 4. Iniciar o frontend

```bash
cd frontend
npm run dev
# Interface disponível em http://localhost:5173
```

### Script de inicialização rápida

Na raiz do projeto existe o arquivo `iniciar.sh` que sobe os dois serviços de uma vez:

```bash
bash iniciar.sh
```

---

## 13. Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `AGENDOR_TOKEN` | ✅ Sim | Token de autenticação da API do Agendor |
| `BASE_URL` | ✅ Sim | URL pública do backend (usada nos links de rastreamento) |
| `PORT` | Não | Porta do backend (padrão: 3001) |
| `ADMIN_EMAIL` | Não | E-mail padrão do admin (pode ser definido via interface) |
| `SMTP_HOST` | Não | Pode ser definido via interface |
| `SMTP_PORT` | Não | Pode ser definido via interface |
| `SMTP_USER` | Não | Pode ser definido via interface |
| `SMTP_PASS` | Não | Pode ser definido via interface |
| `SMTP_FROM` | Não | Pode ser definido via interface |

> As configurações SMTP têm prioridade da interface web sobre as variáveis de ambiente.

---

## 14. Considerações para produção

### Problema atual

O sistema foi desenvolvido para rodar **localmente** na máquina do operador. Isso significa:
- As notificações automáticas só são enviadas se o computador estiver ligado
- O link de rastreamento nos e-mails aponta para `localhost` (não acessível pelo destinatário)

### Opções para ambiente de produção

#### Opção A — VPS / Servidor dedicado (recomendado)

Hospedar o backend em um servidor Linux (ex: Ubuntu na AWS, DigitalOcean, Oracle Cloud Free Tier):

```bash
# Instalar dependências no servidor
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PM2 para manter o processo vivo
npm install -g pm2
pm2 start src/index.js --name agendor-backend
pm2 save
pm2 startup

# Configurar Nginx como proxy reverso (opcional)
```

Configurar `BASE_URL=https://seudominio.com.br` no `.env` para que os links de rastreamento funcionem.

#### Opção B — Plataformas serverless / PaaS

Serviços como **Railway**, **Render** ou **Fly.io** permitem hospedar o backend facilmente com deploy via Git. Atenção: SQLite pode precisar de volume persistente ou ser substituído por PostgreSQL.

#### Opção C — Cron do sistema operacional

Manter o servidor local e usar **cron do SO** para chamar o endpoint de notificação diariamente, eliminando a dependência do processo Node.js ficar ativo:

```bash
# Crontab: todo dia às 8h
0 8 * * * curl -s -X POST http://localhost:3001/api/notifications/run
```

---

## Informações da API do Agendor

| Item | Valor |
|---|---|
| Base URL | `https://api.agendor.com.br/v3` |
| Autenticação | `Authorization: Token {token}` |
| Endpoint de deals | `GET /deals?deal_status_id=1&per_page=100` |
| Endpoint de usuários | `GET /users` |
| Endpoint de tarefas | `GET /tasks?dueDateGt={date}` |
| Endpoint de deal | `GET /deals/{id}` |
| URL do deal (web) | `https://web.agendor.com.br/sistema/negocios/historico.php?id={id}` |

---

*Documentação gerada em 30/04/2026.*
