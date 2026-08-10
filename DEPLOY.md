# Prontidão para produção

**Esta é a única lista válida do que falta para publicar.** `PRD.md`, `.local/reports/PRODUCTION_REQUIREMENTS.md` e `.planning/ROADMAP.md` estão superados neste assunto — foram escritos antes do hardening de agosto e não refletem o estado atual.

Atualize este arquivo sempre que um item mudar de estado. Se ele estiver desatualizado, ninguém sabe onde o projeto está.

> Última revisão: **2026-08-10**

---

## 1. Condições de aceite da Cadmus

A régua da aprovação é o parecer técnico de segurança e usabilidade de **14/07/2026** (Vitor Silva, Software Architect). São cinco condições; o sistema não sobe sem todas.

| # | Condição | Estado |
|---|---|---|
| 1 | P0 corrigidos, revisados por pares e testados | 🟡 código pronto — falta a revisão humana e o merge do **PR #9** |
| 2 | Dependências atualizadas, `npm audit --omit=dev` sem alertas alto/crítico, lockfiles versionados | ✅ de 11 alertas (4 altos) para **zero**; o CI ganhou passo de `npm audit --audit-level=high` |
| 3 | Segredos fora do Git, sem fallback, no Secrets Manager | 🟡 token rotacionado ✅, senhas expostas revogadas ✅, sem fallback ✅ — **falta migrar o `.env` para o Secrets Manager** (trabalho com a Cadmus) |
| 4 | Testes de autorização por rota administrativa e teste de recuperação de senha | ✅ `routes.adminMatrix`, `routes.authMatrix`, `auth.resetSenha`, `senha.politicaCompleta` |
| 5 | Teste integrado em homologação | ❌ não começou (trabalho com a Cadmus) |

---

## 2. Pré-requisitos de deploy — a ordem importa

Cinco itens que precisam estar prontos **no servidor, antes de o código subir**. Dois deles são armadilhas de mão única: invertidos, derrubam o boot ou trancam todo mundo fora do painel.

### 1. `JWT_SECRET` novo, publicado antes do código

`backend/src/secret.js` exige **64 caracteres** (`openssl rand -hex 32` — os 32 bytes que o parecer pediu). Com um segredo menor o boot **aborta**, e o `pm2 restart` seguinte não levanta.

Trocar o segredo invalida todas as sessões: todo mundo entra de novo. Sem downtime.

### 2. `ADMIN_USERS` definido

O `requireAdmin` passou a **falhar fechado**: sem a variável, ninguém é admin, ninguém muda configuração nem dispara e-mail. Em produção deve conter **apenas** `vitor.morija@cadmus.com.br`.

### 3. A conta admin precisa **existir** no banco

`ADMIN_USERS` diz quem *pode* ser admin; `app_users` diz quem *consegue entrar*. As duas coisas são independentes, e é fácil acertar uma e esquecer a outra.

> ⚠️ Hoje `vitor.morija@cadmus.com.br` está no `ADMIN_USERS` e **não tem conta no banco** — é admin fantasma. Localmente isso não trava porque a conta `admin` também está na lista. Num banco de produção sem essa conta, o resultado é **zero admins**, sem como se promover pelo painel.

Criar via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (só funciona com a tabela vazia — ver `backend/src/routes/auth.js`) ou pelo painel, com um admin já válido.

### 4. `ALLOWED_ORIGINS` definido

Está na lista `REQUIRED` de `backend/src/config.js`. Em desenvolvimento a ausência é só um aviso e o processo sobe assim mesmo — por isso passa despercebida. **Em produção o boot é recusado.**

### 5. TLS ligado

`deploy/nginx.conf` tem o bloco `listen 443 ssl` comentado. O código **não quebra** sem TLS (o cookie de sessão deriva `secure` de `req.secure`, não de `NODE_ENV`), mas o cookie de sessão trafega legível e o backend emite aviso no log. Decisão de infraestrutura da Cadmus.

---

## 3. Onde cada segredo mora

| Segredo | Onde vai | Onde **não** pode ir |
|---|---|---|
| `AGENDOR_TOKEN` | `backend/.env` (ignorado pelo Git) | `backend/.env.example` — esse arquivo é versionado e só tem placeholder |
| `JWT_SECRET` | `.env` do servidor, gerado lá | qualquer arquivo versionado |
| `SMTP_PASS` | `backend/.env` | o banco e o painel (foi removido de lá no hardening) |

Rotacionar um token no painel do Agendor **não** atualiza o `.env`. Enquanto os dois não baterem, a API responde `401` e o sistema fica cego — `getStaleDeals()` sem retorno e o cron das 8h falhando em silêncio. Depois de trocar, validar com uma chamada de leitura antes de dar por feito.

---

## 4. Já resolvido

Não reabrir estes itens:

- **P0 do parecer**: credenciais fora do código, `JWT_SECRET` sem fallback, papéis + middleware de autorização, trilha de auditoria.
- **P1/P2**: senha SMTP fora do banco e do painel, cookie `HttpOnly`/`Secure`/`SameSite` com sessão de 4h, CSP estrita, escape de HTML e validação de `href` nos e-mails, token de redefinição em hash, senha mínima de 12 caracteres, tentativas limitadas, validação de formato e faixa no `PUT /api/config`.
- **Três defeitos que o parecer não tinha visto**: `trust proxy` ausente (cinco senhas erradas de qualquer pessoa trancavam a equipe inteira), fluxo de "esqueci minha senha" morto, painel não carregando quando o backend o serve.
- **Rotação de credenciais (10/08/2026)**: token do Agendor rotacionado e validado; a senha `cadmus2026` — que estava no commit público `9c39c40` — revogada nas três contas que ainda a aceitavam. Nenhuma conta abre mais com ela.
- **Suíte**: 196 → 250 testes. `app.js` separado do `index.js` tornou a camada HTTP testável, o que tirou `middleware/auth.js` de 0% de cobertura.

---

## 5. Aberto, mas não bloqueia a subida

Lacunas de usabilidade apontadas no parecer (P1/P2). Valem trabalho próprio, com teste:

- **Tela de logs e auditoria no painel.** As rotas `GET /api/auth/logs` e `GET /api/auth/audit` existem e são testadas, mas **nenhuma tela do frontend as consome** — a trilha de auditoria está escrevendo para ninguém ler.
- **Estados vazios com orientação** — hoje uma lista vazia não diz se está tudo em dia ou se algo falhou.
- **Aviso de privacidade e retenção** no painel.
- **`deals_cache` no `localStorage`** guarda e-mail de responsáveis enquanto a sessão está aberta.
- **Troca de senha obrigatória no primeiro acesso** não existe: `app_users` não tem flag de senha temporária. Quando uma senha é redefinida por fora, a troca pelo usuário é combinada por fora, não garantida pelo sistema.

---

## 6. Ordem de execução

1. Revisar e **mesclar o PR #9** (`dev` → `main`) — está verde e limpo, esperando revisão humana.
2. Preparar o servidor com os cinco pré-requisitos da seção 2, **nessa ordem**.
3. Subir o código e validar: login, listagem de negócios parados, e um disparo de e-mail controlado.
4. Com a Cadmus: `.env` → Secrets Manager (condição 3) e teste integrado em homologação (condição 5).

Merge **não é deploy**: não há entrega contínua neste projeto: o PM2 sobe a partir do servidor (`ecosystem.config.js`).
