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

Seis itens que precisam estar prontos **no servidor, antes de o código subir**. Dois deles são armadilhas de mão única: invertidos, derrubam o boot ou trancam todo mundo fora do painel.

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

### 5. `BASE_URL_FRONTEND` apontando para o domínio real

É a base do link que vai no e-mail de redefinição de senha. Tem **default silencioso** para `http://localhost:5173` e **não** está na lista que derruba o boot — e o `.env.example` traz `localhost` como valor de exemplo, então quem copiar o arquivo e preencher só as obrigatórias deixa isso passar.

A falha é traiçoeira: o e-mail é enviado, o log diz "E-mail de redefinição enviado", e quem recebe clica num link para `localhost` que não abre nada. Ninguém percebe até alguém precisar recuperar a senha.

### 6. TLS ligado

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

## 4. Primeiro acesso em produção

O banco de produção nasce **vazio**. Nenhuma conta da máquina de desenvolvimento existe lá — não copie o `agendor.db` local para o servidor: ele carrega dados reais do CRM, a trilha de auditoria e os logs de login da sua máquina, e com a tabela cheia o seed nem dispara.

**Ninguém "visualiza" senha alguma.** O sistema nunca exibe senha — nem na tela, nem no log, que registra só o e-mail da conta criada. Quem define a senha inicial é quem escreve o `.env` do servidor, e **essa pessoa a conhece**. É inerente ao mecanismo: não existe caminho em que o admin nasça com uma senha que ninguém saiba. A proteção é trocá-la no primeiro acesso.

### Quem tem acesso

| Conta | Papel |
|---|---|
| `vitor.morija@cadmus.com.br` | admin — único no `ADMIN_USERS` de produção |
| `renato@cadmus.com.br` | leitura/operação |
| `patricia.maricato@cadmus.com.br` | leitura/operação |

### Sequência

1. `SEED_ADMIN_EMAIL=vitor.morija@cadmus.com.br` e `SEED_ADMIN_PASSWORD=<senha escolhida pelo operador>` no `.env` do servidor. Isso resolve de quebra o pré-requisito nº 3 — a conta nasce existindo, e não só listada no `ADMIN_USERS`.
2. Primeiro boot: o admin é criado. Confira no log a linha `[Auth] Usuário administrador inicial criado`.
3. Entre com essa senha e **troque-a** — o valor que passou pelo `.env` morre aí.
4. Crie as outras duas contas. **Não há tela para isso**: as rotas `POST /api/auth/users` e `DELETE /api/auth/users/:username` existem e são testadas, mas nenhum componente do frontend as consome. Só por chamada direta, autenticado como admin:

```bash
# 1) autentica e guarda o cookie de sessão
curl -c cookie.txt -X POST https://SEU-DOMINIO/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"vitor.morija@cadmus.com.br","password":"SUA-SENHA"}'

# 2) cria cada usuário (mínimo de 12 caracteres)
curl -b cookie.txt -X POST https://SEU-DOMINIO/api/auth/users \
  -H 'Content-Type: application/json' \
  -d '{"username":"renato@cadmus.com.br","password":"SENHA-DELE"}'

rm cookie.txt
```

5. Repasse cada senha por canal que você controle e peça a troca no primeiro acesso.

> ⚠️ O sistema **não obriga** a troca no primeiro acesso — `app_users` não tem flag de senha temporária. É combinado por fora, não garantido por código.

### A senha precisa passar pela política

Três regras, todas verificadas nos quatro caminhos que gravam senha (criar usuário, trocar, redefinir e o seed):

- mínimo de **12 caracteres**;
- não pode ser uma **senha comum** (`senha123`, `admin123`, `password`…);
- não pode **conter `cadmus2026`** — a senha que vazou no commit público `9c39c40`. A regra é por continência, e não por igualdade, porque `cadmus2026` sozinha já morre no piso de 12 caracteres: quem a encontra no histórico do Git tenta as *variantes*, não ela mesma.

> ⚠️ Consequência prática: **`Cadmus2026@Agendor` é recusada por esta regra.** Se ela estiver em uso, o login continua funcionando (o login não valida política), mas ela não pode ser usada como `SEED_ADMIN_PASSWORD` nem escolhida numa troca de senha — o seed aborta e avisa no log. Escolha uma senha sem relação com a que vazou.

## 5. Já resolvido

Não reabrir estes itens:

- **P0 do parecer**: credenciais fora do código, `JWT_SECRET` sem fallback, papéis + middleware de autorização, trilha de auditoria.
- **P1/P2**: senha SMTP fora do banco e do painel, cookie `HttpOnly`/`Secure`/`SameSite` com sessão de 4h, CSP estrita, escape de HTML e validação de `href` nos e-mails, token de redefinição em hash, senha mínima de 12 caracteres, tentativas limitadas, validação de formato e faixa no `PUT /api/config`.
- **Três defeitos que o parecer não tinha visto**: `trust proxy` ausente (cinco senhas erradas de qualquer pessoa trancavam a equipe inteira), fluxo de "esqueci minha senha" morto, painel não carregando quando o backend o serve.
- **Rotação de credenciais (10/08/2026)**: token do Agendor rotacionado e validado; a senha `cadmus2026` — que estava no commit público `9c39c40` — revogada nas três contas que ainda a aceitavam. Nenhuma conta abre mais com ela.
- **Bloqueio de senhas vazadas e comuns (11/08/2026)**: era a única peça que faltava da tabela de riscos do parecer. A linha P2 pedia quatro controles — hash do token, limite de tentativas, mínimo de 12 caracteres e *"bloqueio por vazamentos/senhas comuns"* — e os três primeiros já existiam. Com ele, os **10 riscos** da tabela (3 P0, 5 P1, 2 P2) estão cobertos. Ver `backend/src/senhasBloqueadas.js` e a seção 4 acima.
- **Suíte**: 196 → 258 testes. `app.js` separado do `index.js` tornou a camada HTTP testável, o que tirou `middleware/auth.js` de 0% de cobertura.

---

## 6. Aberto, mas não bloqueia a subida

Lacunas de usabilidade apontadas no parecer (P1/P2). Valem trabalho próprio, com teste:

- **Tela de logs e auditoria no painel.** As rotas `GET /api/auth/logs` e `GET /api/auth/audit` existem e são testadas, mas **nenhuma tela do frontend as consome** — a trilha de auditoria está escrevendo para ninguém ler.
- **Estados vazios com orientação** — hoje uma lista vazia não diz se está tudo em dia ou se algo falhou.
- **Aviso de privacidade e retenção** no painel.
- **`deals_cache` no `localStorage`** guarda e-mail de responsáveis enquanto a sessão está aberta.
- **Troca de senha obrigatória no primeiro acesso** não existe: `app_users` não tem flag de senha temporária. Quando uma senha é redefinida por fora, a troca pelo usuário é combinada por fora, não garantida pelo sistema.

---

## 7. Ordem de execução

1. Revisar e **mesclar o PR #9** (`dev` → `main`) — está verde e limpo, esperando revisão humana.
2. Preparar o servidor com os cinco pré-requisitos da seção 2, **nessa ordem**.
3. Subir o código e validar: login, listagem de negócios parados, e um disparo de e-mail controlado.
4. Com a Cadmus: `.env` → Secrets Manager (condição 3) e teste integrado em homologação (condição 5).

Merge **não é deploy**: não há entrega contínua neste projeto: o PM2 sobe a partir do servidor (`ecosystem.config.js`).
