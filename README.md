# Automação Agendor

Monitoramento automático do CRM **Agendor**: identifica negócios parados há mais
de N dias sem atualização e alerta os responsáveis por e-mail, com painel web de
acompanhamento, histórico e relatórios.

> Documentação técnica detalhada (regras de negócio, endpoints, banco): veja
> [`DOCUMENTACAO.md`](./DOCUMENTACAO.md).
> Visão de produto e plano para produção: veja [`PRD.md`](./PRD.md).

---

## Visão geral

- **Verificação diária** (cron) busca os negócios em andamento no Agendor e
  detecta os que estão sem atualização além do limite configurado.
- **Notificação por e-mail** para o responsável (e, opcionalmente, o autor),
  com link rastreável de volta ao card no Agendor.
- **Resumo semanal** consolidado para administradores e individual por comercial.
- **Painel web** (login protegido) com dashboard, lista de negócios parados,
  histórico de notificações, relatórios com gráficos e configurações.

## Stack

| Camada    | Tecnologias |
|-----------|-------------|
| Backend   | Node.js, Express, better-sqlite3, nodemailer, node-cron, axios, JWT, helmet |
| Frontend  | React, Vite, Tailwind CSS, Recharts, lucide-react |
| Banco     | SQLite (`backend/agendor.db`) |
| Deploy    | PM2 + Nginx (ver [`deploy/`](./deploy)) |

## Estrutura

```
.
├── backend/
│   ├── src/
│   │   ├── index.js        # bootstrap Express, CORS, helmet, logs, shutdown
│   │   ├── secret.js       # resolução do JWT_SECRET (fail-fast)
│   │   ├── logger.js       # logger estruturado
│   │   ├── db.js           # SQLite: schema, migrations, índices, acesso
│   │   ├── agendor.js      # cliente da API Agendor
│   │   ├── scheduler.js    # cron: verificação diária + resumo semanal
│   │   ├── emailer.js      # nodemailer + templates de e-mail
│   │   ├── middleware/auth.js
│   │   └── routes/         # auth, deals, notifications, config, reports, track
│   ├── .env.example
│   └── package.json
├── frontend/
│   └── src/                # App.jsx + components/
├── deploy/                 # instalar.sh, backup.sh, nginx.conf
├── ecosystem.config.js     # PM2
├── DOCUMENTACAO.md         # documentação técnica
└── PRD.md                  # documento de produto
```

## Pré-requisitos

- **Node.js >= 20**
- Token da API do Agendor
- Conta SMTP para envio de e-mails (ex.: Gmail com senha de app)

## Configuração

1. Copie o exemplo de variáveis de ambiente e preencha:

   ```bash
   cp backend/.env.example backend/.env
   ```

2. Gere um segredo forte para o JWT e cole em `JWT_SECRET`:

   ```bash
   openssl rand -hex 32
   ```

3. Variáveis principais (`backend/.env`):

   | Variável | Obrigatória | Descrição |
   |----------|:-----------:|-----------|
   | `NODE_ENV` | — | `production` em produção (padrão `development`) |
   | `AGENDOR_TOKEN` | ✅ | Token da API do Agendor |
   | `JWT_SECRET` | ✅ | Segredo de assinatura dos tokens (mín. 16 caracteres) |
   | `SMTP_PASS` | ✅ | Senha de app do SMTP — lida só do ambiente, nunca do banco |
   | `ALLOWED_ORIGINS` | ✅ | Origens liberadas no CORS (vírgula); em branco, aceita localhost |
   | `ADMIN_USERS` | ✅ | E-mails que podem gerenciar usuários (vírgula) |
   | `PORT` | — | Porta do backend (padrão `3001`) |
   | `LOG_LEVEL` | — | `error`/`warn`/`info`/`debug` (padrão `info`) |
   | `DB_PATH` | — | Caminho do SQLite (padrão `backend/agendor.db`) |
   | `BASE_URL` | — | URL pública do backend, para links rastreáveis nos e-mails |
   | `BASE_URL_FRONTEND` | — | Base do link de redefinição de senha (padrão `http://localhost:5173`) |
   | `ADMIN_EMAIL` | — | Destinatário(s) do resumo semanal |
   | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_FROM` | — | Ajustes de envio; editáveis pela aba Configurações |
   | `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | recomendado | Admin inicial, criado só no 1º boot sem usuários |

   Com `NODE_ENV=production`, a ausência de qualquer variável obrigatória **aborta o boot**
   com uma mensagem dizendo qual falta e como obter o valor; em desenvolvimento vira apenas
   um aviso no log. A senha SMTP **não** é mais editável pelo painel — ela vem exclusivamente
   de `SMTP_PASS` no ambiente do servidor. A lista completa, com os defaults e as diferenças
   entre dev e produção, está em `backend/.env.example`.

## Rodando em desenvolvimento

```bash
# Backend (porta 3001)
cd backend
npm install
npm run dev

# Frontend (porta 5173, proxy /api → backend)
cd frontend
npm install
npm run dev
```

Acesse `http://localhost:5173`.

## Build e produção

```bash
# Frontend: gera os estáticos em frontend/dist
cd frontend && npm install && npm run build

# Backend: com NODE_ENV=production serve o frontend buildado e expõe a API
cd backend && npm install && NODE_ENV=production npm start
```

Em produção, use o **PM2** (`ecosystem.config.js`) e **Nginx** (`deploy/nginx.conf`).
Os scripts em [`deploy/`](./deploy) automatizam instalação e backup. Detalhes em
[`DOCUMENTACAO.md`](./DOCUMENTACAO.md).

## Health check

```bash
curl http://localhost:3001/api/health
# { "ok": true, "time": "...", "env": "production" }
```

## Segurança

- `JWT_SECRET` é obrigatório — o backend **não inicia** sem ele (sem fallback).
- Senhas dos usuários são armazenadas com hash bcrypt.
- O admin inicial vem de variáveis de ambiente; **não há credenciais no código**.
- Defina `ADMIN_USERS` para restringir a gestão de usuários.
- Nunca versione `backend/.env` nem exports de dados do CRM (`.gitignore` já cobre).
