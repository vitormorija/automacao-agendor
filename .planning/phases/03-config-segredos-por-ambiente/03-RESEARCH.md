# Phase 3: Config & Segredos por Ambiente - Research

**Researched:** 2026-07-29
**Domain:** Gestão de segredos, validação de configuração no boot (Node/CommonJS), varredura de segredos em CI (gitleaks + GitHub Secret Scanning)
**Confidence:** HIGH (quase tudo verificado empiricamente contra este repositório e contra o código-fonte da action)

## Summary

O trabalho desta fase é menor do que o título sugere e o risco está concentrado num único ponto que
o CONTEXT.md não previu. O código **já** lê tudo de `process.env`; a varredura confirmou que `HEAD`
não tem segredo hardcoded. O que falta é: (a) tirar `smtp_pass` do SQLite, (b) estender o fail-fast
para além do JWT, (c) completar o `.env.example`, (d) colocar o gitleaks no CI como gate.

**O achado mais importante desta pesquisa não está em nenhuma das cinco perguntas do brief:**
`ecosystem.config.js` define `cwd: '/opt/agendor'`, mas o `.env` de produção mora em
`/opt/agendor/backend/.env`. `require('dotenv').config()` (sem `path`) resolve
`process.cwd() + '/.env'` = `/opt/agendor/.env` — que não existe — e o dotenv **falha em silêncio**
(retorna `{ error: ENOENT }`, não lança). Ou seja: hoje, sob PM2, provavelmente **nenhuma** variável
do `.env` é carregada, só o `NODE_ENV`/`PORT` que o PM2 injeta. Ligar o fail-fast de D-04/D-05 em
produção sem corrigir isso primeiro **derruba o backend no próximo `pm2 restart`**. Reforçando o
sinal: o `backend/.env` local tem 12 chaves e **não tem `ALLOWED_ORIGINS` nem `ADMIN_USERS`** — duas
das cinco que D-04 torna obrigatórias. O `.env` de produção provavelmente tem a mesma lacuna.

Sobre o gitleaks: a boa notícia é que o token histórico **não** deixa o CI vermelho. A action, em
evento `pull_request`, escaneia **apenas o range de commits do PR** (`--log-opts=--no-merges
--first-parent base^..head`), e o gitleaks só reporta segredos em **linhas adicionadas** dentro
desse range — o commit `13905d4` (2026-03) nunca entra. Isso foi verificado rodando o gitleaks 8.24.3
(versão default da action) e 8.30.1 contra este repositório. A má notícia: numa varredura de
histórico completo aparecem **2** achados (o token real em `backend/.env.example@13905d4` e um
**falso-positivo** no `backend/test/setup.js:15`, o JWT de teste), e o gitleaks **não detecta** a
segunda exposição histórica do token (em `.claude/settings.local.json@13905d4`) — logo, gitleaks é
uma rede útil, **não** é prova de "zero segredos".

**Primary recommendation:** Corrigir o carregamento do dotenv (`config({ path: path.join(__dirname,
'..', '.env') })`) e auditar o `.env` de produção **antes** de ligar o fail-fast; centralizar a
validação num `backend/src/config.js` que exporta uma **função pura testável** (`validateEnv(env)`)
além do efeito colateral de boot; e adicionar o gitleaks como **job novo `secrets`** no `ci.yml`,
escopado ao PR (sem `.gitleaksignore`), com `GITHUB_TOKEN` explícito e comentários desligados.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` nativo (Node >= 20), sem dependência de runtime; cobertura via `c8` ^12 |
| Config file | `backend/.c8rc.json` (gate ativo: `check-coverage: true`, `per-file: false`) |
| Quick run command | `cd backend && npm test` (= `node --test`) |
| Full suite command | `cd backend && npm run test:coverage` (= `c8 --reporter=text --reporter=lcov node --test`) |
| Baseline atual | 35 testes, todos verdes; 396 ms |
| Descoberta | `node --test` sem path descobre `backend/test/**`; **cada arquivo roda em processo próprio** |
| Preset de ambiente | `backend/test/setup.js` — cada arquivo de teste faz `require('./setup')` na primeira linha |

**Isolamento (crítico para esta fase):** `db.js`, `secret.js` e `agendor.js` têm efeito colateral no
`require`. `setup.js` neutraliza isso presetando `JWT_SECRET`, `DB_PATH=:memory:`, `AGENDOR_TOKEN`
(com guarda `if (!process.env.X)`) e forçando `SMTP_PASS=''` / `ADMIN_EMAIL=''` (sem guarda).
Como cada arquivo de teste é um processo, **um arquivo por variação de ambiente** é a unidade de
isolamento correta para testar a migração de D-02.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CFG-01 | Nenhum segredo em linhas novas de um PR | CI gate | job `secrets` no `ci.yml` (gitleaks) | ❌ Wave 0 |
| CFG-01 | `git grep` escopado não acha token/segredo em `backend/src`, `frontend/src`, `deploy/`, `*.example` | unit (meta-teste) | `node --test test/secrets.grep.test.js` | ❌ Wave 0 |
| CFG-01 | `emailer.createTransporter()` usa `process.env.SMTP_PASS`, **não** `getConfig('smtp_pass')` | unit | `node --test test/emailer.smtpPass.test.js` | ❌ Wave 0 |
| CFG-01 | `routes/config.js` PUT **não** aceita mais `smtp_pass` (fora da allowlist) | unit | `node --test test/config.route.smtpPass.test.js` | ❌ Wave 0 |
| CFG-02 | Toda `process.env.X` lida em `backend/src/**` existe em `backend/.env.example` | unit (meta-teste anti-drift) | `node --test test/envExample.test.js` | ❌ Wave 0 |
| CFG-02 | `.env.example` não contém valor de alta entropia (não vira segredo por descuido) | unit | mesmo arquivo acima | ❌ Wave 0 |
| CFG-03 | `NODE_ENV=production` ausente → validador **lança**; ausente em dev → **só avisa** | unit (função pura) | `node --test test/config.validateEnv.test.js` | ❌ Wave 0 |
| CFG-03 | dotenv carrega `backend/.env` independentemente do `cwd` | unit | `node --test test/config.dotenvPath.test.js` | ❌ Wave 0 |
| CFG-04 | `validateEnv()` lista **todas** as faltantes numa mensagem só (não para na primeira) | unit | `node --test test/config.validateEnv.test.js` | ❌ Wave 0 |
| CFG-04 | Mensagem de erro nomeia a variável e diz como obter o valor | unit (asserção de substring) | `node --test test/config.validateEnv.test.js` | ❌ Wave 0 |
| D-02 ⚠ | Migração **preserva** `smtp_pass` do banco quando `SMTP_PASS` do env está ausente/vazio | unit (arquivo próprio, tmp DB) | `node --test test/db.smtpPassMigration.keep.test.js` | ❌ Wave 0 |
| D-02 ⚠ | Migração **zera** `smtp_pass` no banco quando `SMTP_PASS` do env está presente | unit (arquivo próprio, tmp DB) | `node --test test/db.smtpPassMigration.clear.test.js` | ❌ Wave 0 |
| D-02 ⚠ | Após zerar, o próximo boot **não re-semeia** `smtp_pass` a partir do env | unit | mesmo arquivo `.clear.` (segunda conexão / re-require) | ❌ Wave 0 |
| D-03 | UI não envia mais `smtp_pass` / campo removido | manual-only | inspeção visual do painel Config | — |

**Manual-only justificado:** não há test runner no frontend (Phase 2 decidiu conscientemente: job
`frontend` do CI roda só `lint` + `build`). Introduzir Vitest aqui violaria "não misturar refatoração
estrutural com novas funcionalidades". A remoção do campo é coberta indiretamente pelo teste de
`routes/config.js` (backend rejeita o campo mesmo se algo o enviar) — que é a garantia que importa.

### Sampling Rate

- **Per task commit:** `cd backend && npm test` (~0,4 s — barato o suficiente para rodar sempre)
- **Per wave merge:** `cd backend && npm run test:coverage` (valida o gate do `.c8rc.json`)
- **Phase gate:** suíte completa verde + job `secrets` verde no PR, antes de `/gsd:verify-work`

### ⚠️ Gate de cobertura: folga real medida (blocking constraint)

Medido nesta sessão com `c8 --reporter=json-summary`:

| Métrica | Coberto/Total | % atual | Piso `.c8rc.json` | Folga em itens **novos e não cobertos** |
|---------|---------------|---------|-------------------|------------------------------------------|
| branches | 74 / 113 | 65,48 % | **60** | **≤ 10 branches** |
| functions | 16 / 65 | 24,61 % | 20 | ≤ 15 funções |
| lines/statements | 631 / 2705 | 23,32 % | 20 | ≤ 450 linhas |

`branches` é a restrição amarrante: `74 / (113 + N) ≥ 0,60 ⟹ N ≤ 10`. Um validador de config com 5
variáveis obrigatórias e lógica condicional por ambiente passa de 10 branches com facilidade.
**Consequência para o planner:** o novo `backend/src/config.js` **precisa** vir com testes na mesma
wave — não é opcional, é o que impede o gate de quebrar. Alternativa de escape (pior): pôr a
validação em `src/index.js`, que o `.c8rc.json` exclui da cobertura — mas isso contraria D-06
("centralizar num único módulo").

**Evidência de que o padrão atual não se testa sozinho:** `secret.js` está em 68,75 % de linhas e
50 % de branches — o caminho do `throw` (linhas 10-14) **nunca é exercitado**, porque um módulo que
lança no `require` só é testável via subprocesso. Ver Pitfall 2 para o padrão que resolve isso.

### Wave 0 Gaps

- [ ] `backend/test/config.validateEnv.test.js` — CFG-03, CFG-04 (função pura, dev vs prod)
- [ ] `backend/test/db.smtpPassMigration.keep.test.js` — D-02 (env ausente → preserva)
- [ ] `backend/test/db.smtpPassMigration.clear.test.js` — D-02 (env presente → zera, não re-semeia)
- [ ] `backend/test/emailer.smtpPass.test.js` — D-01/CFG-01 (senha vem do env)
- [ ] `backend/test/config.route.smtpPass.test.js` — D-01 (PUT rejeita `smtp_pass`)
- [ ] `backend/test/envExample.test.js` — CFG-02 (meta-teste anti-drift `src/` ↔ `.env.example`)
- [ ] `backend/test/secrets.grep.test.js` — CFG-01 (grep escopado; ver Pitfall 8 sobre o escopo)
- [ ] Nenhuma instalação de framework necessária — `node:test` + `c8` já estão configurados

**Fixtures/helpers reaproveitáveis:** `backend/test/helpers/tmpDb.js` (`makeTmpDbPath`, `openRaw`) —
exatamente o que os dois testes de migração precisam, pelo mesmo motivo documentado lá (o singleton
do `db.js` abre uma conexão no load; `:memory:` não permite uma segunda conexão ao mesmo banco).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

> Nota de ordenação: `## Validation Architecture` foi escrita antes desta seção por exigência do
> orquestrador (Nyquist habilitado). O conteúdo abaixo é o contrato que o planner deve honrar.

### Locked Decisions

**Fonte de verdade das credenciais SMTP (CFG-01)**
- **D-01:** **Híbrido.** Apenas `smtp_pass` sai da tabela `config` e passa a vir **exclusivamente** de
  `process.env.SMTP_PASS`. Host, porta, usuário, remetente e demais ajustes continuam no banco e
  editáveis pela UI. Racional: preserva a autonomia operacional (trocar servidor de e-mail sem
  redeploy) e remove do banco — e portanto de todo backup diário em `/opt/agendor/backups` — a única
  chave que é de fato um segredo. Rejeitado "tudo no ambiente" e "manter tudo no banco".
- **D-02:** **Migração defensiva e idempotente no boot.** A chave `smtp_pass` da tabela `config` só é
  zerada **se** `process.env.SMTP_PASS` estiver presente e não-vazio. Se não estiver, o valor antigo é
  preservado e um aviso é logado. Racional: evita derrubar o envio de e-mail em produção por um `.env`
  esquecido no deploy, ao custo de poucas linhas.
- **D-03:** **UI:** o campo de senha SMTP é **removido** do formulário em `ConfigPanel.jsx`, substituído
  por uma nota curta indicando que o valor vem de `SMTP_PASS`. Rejeitado campo desabilitado.
- **⚠ D-01/D-02/D-03 mudam comportamento.** Pela constraint do projeto, **exigem teste cobrindo o novo
  fluxo** antes de entrar: no mínimo (a) `emailer` lê a senha do env e não do banco, (b) a migração não
  apaga quando o env está ausente, (c) a migração apaga quando o env está presente.

**Escopo do fail-fast no boot (CFG-04)**
- **D-04:** Obrigatórias = **funcionamento + segurança**: `AGENDOR_TOKEN`, `JWT_SECRET`, `SMTP_PASS`,
  `ALLOWED_ORIGINS`, `ADMIN_USERS`. As demais (`PORT`, `LOG_LEVEL`, `DB_PATH`, `STALE_DAYS`,
  `BASE_URL`, …) mantêm default sensato e fallback. Rejeitado exigir todas as 18.
- **D-05:** **Rigor escalonado por ambiente.** Em `NODE_ENV=production` a ausência **derruba o boot**;
  em desenvolvimento vira **aviso no log** e o processo sobe. A Fase 1 já neutraliza `SMTP_PASS`/
  `ADMIN_EMAIL` no setup de testes, então a suíte não é afetada.
- **D-06:** A validação deve seguir o padrão já estabelecido em `backend/src/secret.js` — falha no
  carregamento do módulo, com mensagem em PT explicando **qual** variável falta e **como** gerar/obter
  o valor. Centralizar num único módulo de config em vez de espalhar checagens.
- **⚠ Fronteira com a Fase 6:** exigir `ADMIN_USERS` no boot fecha por *configuração* o buraco descrito
  em `.planning/codebase/CONCERNS.md`. Mas o `requireAdmin()` continua **falhando aberto** no código —
  corrigir isso é Fase 6, não aqui.

**Separação dev vs produção (CFG-03)**
- **D-07:** **Um `.env` único por máquina, `NODE_ENV` decide.** Formaliza o mecanismo que o código já
  usa. O `.env.example` ganha comentários marcando explicitamente o que muda entre dev e prod.
  Rejeitados arquivos `.env.development`/`.env.production` versionados. Alvo é single-instance,
  sem staging.

**Prova de "zero segredos" (CFG-01)**
- **D-08:** **`gitleaks` como action no CI**, não script próprio. Aceita-se a dependência externa no
  pipeline e algum falso-positivo a calibrar. Rejeitada verificação manual.
- **D-09:** O check do gitleaks deve virar **gate real**: PR com segredo detectado é barrado antes do
  merge. Se for job novo, o **contexto precisa ser adicionado aos required status checks** da branch
  protection (ver `deploy/branch-protection.md`).

**`.env.example` (CFG-02)**
- **D-10:** Arquivo já existe mas **incompleto**: o código lê 18 variáveis e faltam três — `DB_PATH`,
  `LOG_LEVEL` e `BASE_URL_FRONTEND`. Completar, sem valores sensíveis, e marcar quais são obrigatórias
  (D-04) e quais mudam entre dev e prod (D-07).

### Claude's Discretion

- Formato exato da mensagem de erro de boot (desde que diga qual variável e como obter o valor).
- Se o gitleaks entra como job próprio ou step de job existente em `ci.yml`.
- Onde mora o módulo centralizado de validação de config (novo `backend/src/config.js` vs estender
  `backend/src/secret.js`).
- Texto exato da nota que substitui o campo de senha no `ConfigPanel.jsx`.

### Deferred Ideas (OUT OF SCOPE)

- **Rotação do token da API Agendor** — adiada conscientemente para manter o repositório público e
  preservar o gate de CI-02. Rastreado em `.planning/todos/pending/sec-01-rotate-agendor-token.md`.
  Não é trabalho de código; é ação operacional no painel da Agendor.
- **`requireAdmin()` falhar fechado** — Fase 6. Esta fase só torna `ADMIN_USERS` obrigatória no boot.
- **JWT em `localStorage` → cookie httpOnly; habilitar CSP** — Fase 6.
- **GitHub Pro para repositório privado com gate de merge** — avaliado e descartado.
- **Timeouts HTTP/SMTP e TTL de cache** — Fase 4. **`console.*` → `logger`** — Fase 5.
- **SECV-01 (criptografia em repouso do `smtp_pass`)** — v2. D-01 resolve por remoção, não por cripto.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CFG-01 | Nenhum segredo/token hardcoded no repositório — todos via variáveis de ambiente | §Runtime State Inventory (são **3** pontos de `smtp_pass` no backend, não 2); §Pitfall 3 (ordem da migração vs seeder); §Standard Stack + §Code Examples (job `secrets` escopado ao PR); §Pitfall 8 (o grep de CFG-01 precisa ser escopado, senão o critério nunca passa) |
| CFG-02 | `.env.example` documenta todas as variáveis necessárias, sem valores sensíveis | §Inventário das 18 variáveis com arquivo:linha; 3 faltantes + 1 fantasma (`STALE_DAYS`); meta-teste anti-drift em §Validation Architecture; placeholders validados empiricamente contra o gitleaks em §Code Examples |
| CFG-03 | Separação clara de configuração dev vs produção, sem valores sensíveis versionados | §Pitfall 1 (dotenv + PM2 `cwd` — **bloqueante**); §Pattern 2 (rigor escalonado por `NODE_ENV`); verificado que `npm run` **não** define `NODE_ENV` → CI e testes caem no ramo "dev" (warn) automaticamente |
| CFG-04 | Boot valida a presença das obrigatórias e falha rápido se faltarem | §Pattern 1 (função pura + efeito de boot); §Pitfall 2 (ordem `dotenv` → `config` → `db`); §Pitfall 5 (gate de cobertura exige que o módulo venha testado na mesma wave) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Carregar `.env` do disco | Node bootstrap (`backend/src/index.js:1`) | — | Único `require('dotenv')` do repo; qualquer módulo requerido fora do `index.js` (testes, scripts) **não** vê o `.env` |
| Validar variáveis obrigatórias | Backend — novo `backend/src/config.js` | Boot (`index.js`) dispara o efeito | D-06 manda centralizar; a função pura mora no módulo, a decisão de derrubar o processo é do boot |
| Guardar a senha SMTP | OS / Environment (`process.env.SMTP_PASS`) | — | D-01: sai do SQLite justamente para sair dos backups diários (`deploy/backup.sh` copia o `.db` inteiro) |
| Guardar config operacional (host, porta, cron, threshold) | Database (tabela `config`) | UI (`ConfigPanel.jsx`) edita | Mantido de propósito: trocar servidor de e-mail sem redeploy |
| Montar o transporte SMTP | Backend — `emailer.createTransporter()` | DB (host/porta/user) + env (pass) | Ponto onde as duas fontes se juntam; é a **exceção deliberada** ao padrão "config vem do banco" e precisa de comentário explicando o porquê |
| Barrar segredo antes do merge | CI (GitHub Actions, job `secrets`) | Branch protection (required status check) | Só um check de CI vira gate de merge; alerta de Secret Scanning **não** bloqueia PR |
| Barrar segredo antes do push | Plataforma GitHub (push protection) | — | Controle mais cedo que o CI, gratuito em repo público, zero manutenção — complementa, não substitui |
| Documentar o contrato de config | Repo (`backend/.env.example`) | Teste anti-drift (`test/envExample.test.js`) | Documentação sem teste apodrece; o meta-teste é o que mantém CFG-02 verdadeiro depois da fase |
| Aplicar `.env` em produção | Deploy (`ecosystem.config.js`, `deploy/instalar.sh`) | Runbook | O bug de `cwd` mora aqui, não no código de aplicação |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dotenv` | **16.6.1** (já instalado) | Carrega `backend/.env` em `process.env` | Já é a dependência do projeto; **não atualizar** nesta fase (v17 mudou o output de boot). `[VERIFIED: node -e require('dotenv/package.json').version]` |
| `node:test` + `node:assert/strict` | nativo (Node 20/22) | Testes do validador e da migração | Decisão 01-01 do projeto: zero dependência de runtime nova `[VERIFIED: backend/package.json]` |
| `c8` | ^12.0.0 (já instalado) | Gate de cobertura | Já ativo com `check-coverage: true` `[VERIFIED: backend/.c8rc.json]` |
| `gitleaks/gitleaks-action` | **v3** (`v3.0.0`, publicada 2026-05-30) | Varredura de segredos no CI (D-08) | Única action oficial do gitleaks; runtime `node24` `[VERIFIED: gh api repos/gitleaks/gitleaks-action/releases + action.yml]` |
| `gitleaks` (CLI, baixado pela action) | **8.24.3** é o default embutido na v3 | Motor de detecção | Fixado no código da action (`process.env.GITLEAKS_VERSION \|\| "8.24.3"`) `[VERIFIED: src/index.js@v3 linha ~139]` |

**Nenhum pacote npm novo é instalado nesta fase.** Não há `## Package Legitimacy Audit` a fazer —
o único componente externo novo é uma GitHub Action, auditada abaixo pela leitura do código-fonte.

### Auditoria da GitHub Action (equivalente ao package legitimacy gate)

| Item | Achado | Fonte |
|------|--------|-------|
| Repo | `gitleaks/gitleaks-action` — mesmo org do projeto `gitleaks` | `[VERIFIED: gh api]` |
| Versão atual | `v3.0.0`, 2026-05-30. Anterior: `v2.3.9`, 2025-04-17 | `[VERIFIED: gh api releases]` |
| SHA da tag `v3` | `e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` | `[VERIFIED: gh api git/ref/tags/v3]` |
| SHA da tag `v2` | `dcedce43c6f43de0b836d1fe38946645c9c638dc` | `[VERIFIED: gh api git/ref/tags/v2]` |
| Runtime | `using: "node24"` — exige runner recente; `ubuntu-latest` atende | `[VERIFIED: action.yml]` |
| **Licença** | ⚠️ **NÃO é open source.** `action.yml` abre com `Copyright © 2022 Gitleaks LLC - All Rights Reserved` e aponta para a EULA comercial. **O CLI `gitleaks` em si é MIT** — só a action é proprietária. | `[VERIFIED: action.yml + gitleaks/gitleaks README]` |
| Licença exigida em runtime? | **Não** para este repo. A action chama `GET /users/{username}`; se `type === "User"` → `shouldValidate = false`, nenhuma `GITLEAKS_LICENSE` é pedida. `vitormorija` é `type: "User"`. | `[VERIFIED: src/index.js@v3 + gh api repos/... .owner.type]` |
| Risco residual | Se a chamada `GET /users/…` falhar (rate limit/rede), o `catch` **volta a exigir licença** e o job faz `process.exit(1)` com "missing gitleaks license". Flakiness possível, não determinística. | `[VERIFIED: src/index.js@v3, bloco .catch()]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gitleaks-action@v3` | `run:` baixando o CLI MIT direto do release (`gitleaks_8.30.1_linux_x64.tar.gz`) | Elimina a EULA proprietária e o risco de "missing license" por flakiness; mas **contraria D-08** ("action, não script próprio") e transfere para nós a lógica de range de PR. **Não recomendado** — registrado só como saída de emergência se a action falhar. |
| `gitleaks-action@v3` | `@v2` (SHA `dcedce4…`) | v2 usa runtime `node20`; útil só se o runner não suportar `node24`. `ubuntu-latest` suporta. |
| Pinar por tag (`@v3`) | Pinar por SHA (`@e0c47f4f…`) | SHA é a prática correta para supply-chain, ainda mais numa action que baixa binário. Mas o `ci.yml` da Fase 2 pinou tudo por major (`@v7`) — misturar estilos confunde. **Recomendação: pinar `@v3` por consistência e registrar o SHA num comentário na mesma linha** (auditável sem quebrar o padrão). |
| gitleaks | GitHub Secret Scanning nativo sozinho | Ver §"GitHub Secret Scanning" — **não bloqueia merge**, logo não satisfaz D-09. Complementa, não substitui. |
| gitleaks | `trufflehog` | Verifica segredos ativamente contra o provedor (menos falso-positivo), mas contraria D-08 e não tem o formato de fingerprint que o `.gitleaksignore` do gitleaks usa. |

**Installation:** nenhuma. A action é referenciada no workflow; o binário é baixado no runner.

---

## Q1 — gitleaks no CI: configuração verificada

### Como a action decide o que escanear (lido do código-fonte da v3)

| Evento | Range escaneado | Consequência aqui |
|--------|-----------------|-------------------|
| `pull_request` | `GET /repos/{o}/{r}/pulls/{n}/commits` → `baseRef = commits[0].sha`, `headRef = commits[last].sha`, depois `--log-opts=--no-merges --first-parent {baseRef}^..{headRef}` | ✅ **O commit `13905d4` nunca entra.** O CI não fica vermelho pelo token histórico. |
| `push` | `baseRef = eventJSON.commits[0].id`, `headRef = commits[last].id`; se iguais → `--log-opts=-1` | ✅ Mesma coisa; só os commits do push. |
| `workflow_dispatch` / `schedule` | **Nenhum `--log-opts`** → varredura de **histórico completo** | ⚠️ Aqui sim os 2 achados históricos aparecem. Só usar com `.gitleaksignore`. |

`[VERIFIED: src/gitleaks.js@v3 função Scan(), src/index.js@v3 dispatch por eventType]`

### Achados reais deste repositório (medidos, não estimados)

Rodei o CLI `gitleaks` **8.24.3** (default da action) e **8.30.1** (mais recente) contra
`/Users/vitormorija/Automacao_agendor`. Resultado **idêntico** nas duas versões:

**`gitleaks git .` (histórico completo, 72 commits) → 2 achados:**

| # | Fingerprint | Natureza |
|---|-------------|----------|
| 1 | `08840aa0c46a2301498c34bbacf308594b174852:backend/test/setup.js:generic-api-key:15` | **FALSO-POSITIVO.** É `process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdef'` (entropia 4,23). Está em `HEAD`. |
| 2 | `13905d4ee95897b6af722529ea40ebe2592db8d9:backend/.env.example:generic-api-key:1` | **VERDADEIRO-POSITIVO** — o token real da Agendor. Já rastreado em `sec-01`. |

**`gitleaks dir .` (árvore de trabalho, inclui não-rastreados/ignorados) → 33 achados** — 30 de
`curl-auth-header` nos `.claude/settings.local.json` locais (gitignored) e 2 em `backend/.env` (o
`.env` **real**, com segredos reais). **Nunca usar `dir` mode neste repo:** ele lê o `.env` de
produção e o despeja no log do CI. `[VERIFIED: execução local]`

### ⚠️ Achado que muda a leitura de CFG-01: gitleaks NÃO é prova de "zero segredos"

A exposição do token no commit `13905d4` acontece em **dois** arquivos (ver `sec-01`):
`backend/.env.example` **e** `.claude/settings.local.json` (2 ocorrências em headers
`Authorization: Token c57f59ef-…`). A varredura de histórico completo detecta **só o primeiro**.
Reproduzi o blob histórico isoladamente e o gitleaks (`git`, `dir` e `stdin`) reporta *no leaks*.
`[VERIFIED: git show 13905d4:.claude/settings.local.json + 3 modos de scan]`

> **Para o planner:** o critério de sucesso 1 de CFG-01 ("`grep` no repositório não encontra token")
> **não** pode ser delegado ao gitleaks. Manter um `git grep` escopado como verificação
> independente (ver Pitfall 8 para o escopo correto).

### Como impedir que o token histórico deixe o CI permanentemente vermelho

Três estratégias; **a recomendada é a primeira e ela não exige arquivo nenhum**:

1. **✅ RECOMENDADA — não fazer nada.** Rodar a action só em `pull_request` e `push`. O escopo por
   range já exclui `13905d4` estruturalmente. Verificado: um commit que edita `backend/test/setup.js`
   **fora** da linha 15 escaneia limpo (o gitleaks só reporta linhas *adicionadas* no range).
   `[VERIFIED: commit de simulação criado e revertido nesta sessão]`
2. **`.gitleaksignore` na raiz** — necessário **apenas** se o planner quiser um scan de histórico
   completo (`workflow_dispatch`/`schedule`). Formato `commit:filepath:ruleID:startline`, uma por
   linha. Testado num repo sandbox: com os fingerprints, o scan passa de "leaks found: 1" para
   "no leaks found". `[VERIFIED: teste sandbox]`
   ```
   # Falso-positivo: JWT descartável do preset de testes (Fase 1). Não é credencial.
   08840aa0c46a2301498c34bbacf308594b174852:backend/test/setup.js:generic-api-key:15
   # Token real da Agendor exposto em 2026-03. Rotação rastreada em
   # .planning/todos/pending/sec-01-rotate-agendor-token.md — o histórico não pode ser desfeito.
   13905d4ee95897b6af722529ea40ebe2592db8d9:backend/.env.example:generic-api-key:1
   ```
   ⚠️ Ignorar o #2 sem a rotação **silencia o único aviso automático da exposição ativa**. Se optar
   por isso, o comentário acima (apontando para o TODO) é obrigatório.
3. **`BASE_REF`** — a action aceita `env: BASE_REF` para sobrescrever o `baseRef`. Existe, mas é
   frágil (precisa resolver o merge-base à mão). Não recomendado. `[VERIFIED: src/gitleaks.js@v3]`

### `permissions:` e `fetch-depth` — os dois detalhes que quebram o job

| Item | Exigência | Por quê |
|------|-----------|---------|
| `fetch-depth: 0` no `actions/checkout` | **Obrigatório** | O `--log-opts=base^..head` precisa dos commits **e do pai do primeiro** presentes localmente. O default (`depth: 1`) não os tem. `[CITED: README oficial da action]` |
| `env: GITHUB_TOKEN` | **Obrigatório** | `ScanPullRequest()` faz `if (!process.env.GITHUB_TOKEN) { core.error(...); process.exit(1) }`. **Não** é o `permissions:` do workflow — é a variável de ambiente, que precisa ser passada explicitamente. `[VERIFIED: src/gitleaks.js@v3 linha ~153]` |
| `permissions: pull-requests: read` | **Recomendado** | A action chama `GET /repos/{o}/{r}/pulls/{n}/commits`. O `ci.yml` atual declara `permissions: contents: read` no topo, o que zera todos os outros escopos. Em repo **público** esse endpoint costuma ser legível mesmo com escopo reduzido, mas declarar é grátis e remove a dúvida. `[ASSUMED — comportamento de token restrito em repo público não foi testado]` |
| `GITLEAKS_ENABLE_COMMENTS: false` | **Recomendado** | Default é `true` → chama `octokit.rest.pulls.createReviewComment`, que exige `pull-requests: **write**`. Manter em `false` preserva o least-privilege da Fase 2 e evita ruído num repo single-maintainer. `[VERIFIED: src/gitleaks.js@v3]` |
| `GITLEAKS_ENABLE_UPLOAD_ARTIFACT: false` | Recomendado | Default `true` → sobe `results.sarif`. O scan roda com `--redact`, então não vaza valor, mas o artefato é inútil aqui e o `continueOnError: true` esconde falhas. `[VERIFIED: src/gitleaks.js@v3]` |
| `GITLEAKS_VERSION` | Fixar explicitamente | Default embutido é `8.24.3`. **Nunca usar `latest`** — regras novas viram falso-positivo e o gate quebra sem ninguém ter mudado código. `8.24.3` e `8.30.1` foram medidas aqui e dão resultado idêntico. `[VERIFIED]` |

### Job novo vs step em job existente (decisão de D-09 — Claude's Discretion)

**Recomendação: job novo com id `secrets`.**

- Um JS action **não** respeita `defaults.run.working-directory` (isso só vale para steps `run:`) —
  ele roda sempre em `GITHUB_WORKSPACE`. Então colocá-lo dentro do job `backend` funcionaria, mas
  forçaria `fetch-depth: 0` no checkout do `backend`, atrasando o job de teste sem necessidade.
- Job separado roda em paralelo, isola a falha ("o gate de segredo quebrou", não "o backend quebrou")
  e mantém o `ci.yml` legível.
- Custo: **um novo required status check**. Ver a sequência obrigatória em Pitfall 6 — a ordem
  importa e inverter trava o merge permanentemente.

---

## Q2 — GitHub Secret Scanning nativo: sobreposição e recomendação

### Estado atual do repositório (medido)

```
$ gh api repos/vitormorija/automacao-agendor --jq '{visibility, owner_type: .owner.type, sec: .security_and_analysis}'
{"owner_type":"User","private":false,"visibility":"public",
 "sec":{"secret_scanning":{"status":"disabled"},
        "secret_scanning_non_provider_patterns":{"status":"disabled"},
        "secret_scanning_push_protection":{"status":"disabled"},
        "secret_scanning_validity_checks":{"status":"disabled"},
        "dependabot_security_updates":{"status":"disabled"}}}

$ gh api repos/vitormorija/automacao-agendor/secret-scanning/alerts
404 — "Secret scanning is disabled on this repository."
```
`[VERIFIED: gh api, 2026-07-29]` — **os quatro recursos estão desligados hoje.**

### Sobreposição com o gitleaks: complementam, não competem

| Dimensão | gitleaks no CI (D-08) | GitHub Secret Scanning |
|----------|----------------------|------------------------|
| **Bloqueia merge?** | ✅ Sim — vira required status check | ❌ **Não.** Alerta aparece na aba Security; o PR continua mergeável |
| Bloqueia push? | ❌ Não | ✅ Sim, com push protection ligada (rejeita o `git push`) |
| Escopo | Range de commits do PR/push | Histórico inteiro + todo push futuro |
| Padrões | ~200 regras da comunidade + `generic-api-key` por entropia | Padrões de parceiros (alta confiança, baixo FP) + padrões genéricos se `non_provider_patterns` ligado |
| Custo | Minutos de Actions | **Grátis em repo público** |
| Manutenção | Calibrar FPs (`.gitleaksignore`) | Zero |
| Detectaria o token Agendor? | ✅ Sim (`generic-api-key`, medido) — em `.env.example`; ❌ não em `.claude/settings.local.json` | ⚠️ Improvável: é um UUID nu, não é padrão de parceiro. `secret_scanning_non_provider_patterns` **talvez** pegue `AGENDOR_TOKEN=<uuid>`. `[ASSUMED — não testável sem ligar]` |

**Resposta direta ao brief:** **não**, o Secret Scanning **não torna o gitleaks redundante**, e a
razão é única e decisiva — *ele não é um gate de merge*. D-09 exige barrar o PR antes do merge, e
só um status check de CI faz isso. A escolha do usuário por gitleaks está tecnicamente correta.

**Mas a recíproca também vale:** o gitleaks escopado ao PR não olha o histórico nem pushes diretos,
e é gratuito ligar os três toggles. **Recomendação: ligar os dois.** Push protection é o controle
mais barato do projeto inteiro — impede a próxima ocorrência de `13905d4` *antes* do push, algo que
nem o gitleaks nem o CI conseguem.

**Como ligar (API — preferível ao clique, porque é auditável no runbook):**
```bash
gh api --method PATCH /repos/vitormorija/automacao-agendor \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning":                       { "status": "enabled" },
    "secret_scanning_push_protection":       { "status": "enabled" },
    "secret_scanning_non_provider_patterns": { "status": "enabled" }
  }
}
JSON
```
Nomes de campo **verificados** — são exatamente as chaves que o `GET` devolveu acima.
`[VERIFIED: gh api GET security_and_analysis]`

⚠️ **Efeito colateral esperado e desejável:** ao ligar `secret_scanning`, o GitHub varre o histórico
e provavelmente **abre um alerta** para o token em `13905d4`. Isso é *feature*, não bug — é a
exposição do `sec-01` ficando visível. Não dispensar o alerta antes da rotação. Como é fora do
código, **não afeta o CI nem o gate de merge**.

⚠️ **Push protection e a branch de trabalho:** com push protection ligada, se algum commit desta
fase contiver um segredo de alta confiança, o `git push` é **rejeitado** — não o PR. Bom, mas o
executor precisa saber, senão vai debugar o lugar errado. Registrar no runbook.

---

## Q5 — Inventário completo das variáveis de ambiente (CFG-02 / D-10)

Levantado com `grep -rn "process\.env\." backend/src/`. São **exatamente 18** chaves distintas.
`[VERIFIED: grep no repositório]`

| # | Variável | Lida em | Default no código | D-04 obrigatória? | Em `.env.example`? |
|---|----------|---------|-------------------|:-----------------:|:------------------:|
| 1 | `AGENDOR_TOKEN` | `agendor.js:4`, `routes/notifications.js:203` | nenhum | ✅ | ✅ |
| 2 | `JWT_SECRET` | `secret.js:7` | nenhum (já fail-fast) | ✅ | ✅ |
| 3 | `SMTP_PASS` | `db.js:110` (seed) → passa a `emailer.js` (D-01) | `''` | ✅ | ✅ |
| 4 | `ALLOWED_ORIGINS` | `index.js:21-22` | `localhost:5173`,`localhost:3001` | ✅ | ✅ |
| 5 | `ADMIN_USERS` | `routes/auth.js:30` | `''` → **fail-open** | ✅ | ✅ |
| 6 | `NODE_ENV` | `index.js:51,68,80,93,98,140`; `logger.js:9` | `development` | — | ✅ |
| 7 | `PORT` | `index.js:137` | `3001` | — | ✅ |
| 8 | `LOG_LEVEL` | `logger.js:8` | `info` | — | ❌ **FALTA** |
| 9 | `DB_PATH` | `db.js:4` | `backend/agendor.db` | — | ❌ **FALTA** |
| 10 | `BASE_URL` | `index.js:106`, `emailer.js:28` | `''` (sem tracking de cliques) | — | ✅ |
| 11 | `BASE_URL_FRONTEND` | `routes/auth.js:262` | `http://localhost:5173` | — | ❌ **FALTA** |
| 12 | `ADMIN_EMAIL` | `db.js:106` (seed) | `''` | — | ✅ |
| 13 | `SMTP_HOST` | `db.js:107` (seed) | `smtp.gmail.com` | — | ✅ |
| 14 | `SMTP_PORT` | `db.js:108` (seed) | `587` | — | ✅ |
| 15 | `SMTP_USER` | `db.js:109` (seed) | `''` | — | ✅ |
| 16 | `SMTP_FROM` | `db.js:111` (seed) | `''` | — | ✅ |
| 17 | `SEED_ADMIN_EMAIL` | `routes/auth.js:97` | `''` | — | ✅ |
| 18 | `SEED_ADMIN_PASSWORD` | `routes/auth.js:98` | `''` | — | ✅ |

**Confirmado: as três faltantes de D-10 estão corretas** — `DB_PATH`, `LOG_LEVEL`, `BASE_URL_FRONTEND`.

### Achados adicionais no `.env.example` que D-10 não menciona

| Achado | Detalhe | Ação sugerida |
|--------|---------|---------------|
| **`STALE_DAYS` é fantasma** | Está no `.env.example:41` mas **nenhum código lê `process.env.STALE_DAYS`**. O valor real vem de `getConfig('stale_days')`, cujo default `'15'` é literal em `db.js:105`. `[VERIFIED: grep]` | Remover do `.env.example`, ou manter com comentário explícito "só documental — o valor efetivo mora na tabela `config`, editável pela UI". Documentar variável inexistente **contraria CFG-02** ("documenta todas as variáveis necessárias" — esta não é necessária). |
| **`README.md:77-95` repete o erro** | A tabela de variáveis do README lista `STALE_DAYS` e omite `DB_PATH` e `BASE_URL_FRONTEND`. | DOC-01 é Fase 8, mas deixar o README contradizendo o `.env.example` recém-corrigido é dívida imediata. Corrigir a tabela é barato. |
| **`backend/.env` local tem 2 chaves mortas** | `APP_USERNAME` e `APP_PASSWORD` — não lidas em lugar nenhum (provável resquício do auth pré-JWT). `[VERIFIED: dotenv.config() local, 12 chaves]` | Fora do escopo de código (é arquivo local, não versionado), mas vale mencionar no runbook de limpeza do `.env` de produção. |
| **`backend/.env` local NÃO tem `ALLOWED_ORIGINS` nem `ADMIN_USERS`** | Duas das cinco de D-04. Em dev isso vira aviso (D-05), mas é o sinal de alerta para o `.env` de produção. `[VERIFIED]` | Ver Pitfall 1. |

**Chaves presentes no `backend/.env` local (12):** `ADMIN_EMAIL`, `AGENDOR_TOKEN`, `APP_PASSWORD`,
`APP_USERNAME`, `JWT_SECRET`, `PORT`, `SMTP_FROM`, `SMTP_HOST`, `SMTP_PASS`, `SMTP_PORT`,
`SMTP_USER`, `STALE_DAYS`. (Só nomes — nenhum valor lido.)

---

## Runtime State Inventory

Fase de migração de config: o grep acha arquivos, não acha estado em execução. Todas as categorias
respondidas explicitamente.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `backend/agendor.db` → tabela `config`, chave `smtp_pass`, **valor real em texto puro**. É exatamente o alvo de D-01/D-02. Também presente em até 30 cópias diárias em `/opt/agendor/backups` (`deploy/backup.sh:20` faz `cp` do `.db` inteiro). | **Migração de dados** (zerar a chave, condicionalmente — D-02) **+ edição de código** (parar de ler/escrever a chave). São duas tarefas distintas. Os backups antigos **continuam com a senha** — só a rotação da senha SMTP resolve; registrar como decisão consciente ou novo TODO. |
| **Live service config** | Nenhuma. Não há n8n, Datadog, Cloudflare, Tailscale ou equivalente. O único serviço externo é a API Agendor (só leitura, autenticada por token) e o SMTP. Verificado: nenhum arquivo em `deploy/` referencia serviço de terceiros com config fora do git. | Nenhuma. |
| **OS-registered state** | (a) **PM2**: processo `agendor-backend` salvo via `pm2 save` + `pm2 startup`. O `env: { NODE_ENV, PORT }` do `ecosystem.config.js` fica **congelado no dump do PM2** — mudanças no ecosystem só valem após `pm2 delete && pm2 start`, não com `pm2 restart`. (b) **crontab** com `deploy/backup.sh` às 3h. (c) **Nginx** em `/etc/nginx/sites-enabled/agendor`. | Se o `ecosystem.config.js` for alterado (opção B do Pitfall 1), o deploy exige `pm2 delete agendor-backend && pm2 start ecosystem.config.js && pm2 save` — **não** basta `pm2 restart`. Registrar no runbook. |
| **Secrets/env vars** | `/opt/agendor/backend/.env` — **não versionado, não inspecionável daqui.** Conteúdo desconhecido. O `.env` local (proxy razoável) não tem `ALLOWED_ORIGINS` nem `ADMIN_USERS`. Nenhum nome de chave muda nesta fase (só `SMTP_PASS` muda de *consumidor*, não de nome). | **Checkpoint humano obrigatório** antes de mesclar o fail-fast: rodar no servidor uma verificação das 5 obrigatórias (comando pronto em §Code Examples). Nenhum rename de chave necessário. |
| **Build artifacts** | `frontend/dist/` — servido estaticamente pelo Express em produção (`index.js:80`). A remoção do campo de senha (D-03) só chega ao usuário depois de `npm run build` no frontend. Não há `.egg-info`/binário compilado. | O deploy precisa rebuildar o frontend (`deploy/instalar.sh:87` já faz). Se o deploy for feito por `git pull` manual sem rebuild, o painel continua mostrando o campo antigo. Registrar no runbook. |

---

## Q3 — Padrão de validação no boot (CommonJS) e ordem de carregamento

### Pattern 1: função pura + efeito de boot no mesmo módulo

**What:** `backend/src/config.js` exporta `validateEnv(env)` (pura, testável, sem I/O) e executa o
efeito colateral no load, do mesmo jeito que `secret.js`.

**When to use:** sempre que a validação precisa (a) derrubar o processo em produção e (b) ser
testada. É o que resolve simultaneamente D-06 e o gate de cobertura (§Pitfall 5).

**Why not just copy `secret.js`:** `secret.js` só tem o `throw` no topo do módulo. Consequência
medida: cobertura de 68,75 % de linhas e **50 % de branches**, com as linhas 10-14 (o `throw`)
**nunca exercitadas** — porque testar um módulo que lança no `require` exige subprocesso. Repetir
esse padrão puro para 5 variáveis adicionaria ~10+ branches não cobertos e **estouraria o piso de 60 %
de branches** (folga real: 10). A função pura resolve: o teste chama `validateEnv({...})` direto.

```javascript
// backend/src/config.js
//
// Validação centralizada das variáveis de ambiente obrigatórias (CFG-04, D-04/D-05/D-06).
//
// Segue o modelo de secret.js — falha no carregamento do módulo — mas com uma diferença
// deliberada: a regra mora numa função PURA (validateEnv) que recebe o ambiente como
// argumento. Isso a torna testável sem subprocesso e sem variável global, e é o que permite
// cobrir os dois ramos (produção derruba / desenvolvimento avisa) na suíte de testes.

const logger = require('./logger');

// ── Contrato das variáveis obrigatórias ──────────────────────────
// D-04: só o que é "funcionamento + segurança". As demais têm default sensato no código.
// A dica de cada uma é o que a mensagem de erro mostra — precisa dizer COMO obter o valor.
const REQUIRED = [
  { name: 'AGENDOR_TOKEN',   hint: 'token da API Agendor — painel Agendor › Configurações › API' },
  { name: 'JWT_SECRET',      hint: 'mín. 16 caracteres — gere com `openssl rand -hex 32`' },
  { name: 'SMTP_PASS',       hint: 'senha de app do provedor SMTP (Gmail: Conta › Segurança › Senhas de app)' },
  { name: 'ALLOWED_ORIGINS', hint: 'origens liberadas no CORS, separadas por vírgula (ex.: http://agendor.cadmus.com.br)' },
  { name: 'ADMIN_USERS',     hint: 'e-mails que podem gerenciar usuários, separados por vírgula' },
];

// Retorna a lista de variáveis obrigatórias ausentes ou vazias. FUNÇÃO PURA:
// não lê process.env, não loga, não lança — só olha o objeto recebido. É o que a
// suíte de testes exercita diretamente.
function findMissing(env) {
  return REQUIRED.filter(({ name }) => !String(env[name] ?? '').trim());
}

// Monta a mensagem em PT listando TODAS as faltantes de uma vez (não para na primeira:
// um deploy mal configurado deve descobrir tudo o que falta num único boot, não um por vez).
function buildMessage(missing) {
  const linhas = missing.map(({ name, hint }) => `  - ${name}: ${hint}`).join('\n');
  return (
    `Configuração incompleta — ${missing.length} variável(is) de ambiente obrigatória(s) ausente(s):\n` +
    `${linhas}\n` +
    `Defina-as em backend/.env (use backend/.env.example como referência).`
  );
}

// Aplica o rigor escalonado de D-05: em produção a ausência derruba o boot; em
// desenvolvimento vira aviso e o processo sobe (permite mexer no frontend sem credenciais reais).
// Também é pura em relação a process.env — recebe env, devolve/lança.
function validateEnv(env) {
  const missing = findMissing(env);
  if (missing.length === 0) return { ok: true, missing: [] };

  const message = buildMessage(missing);
  if (env.NODE_ENV === 'production') throw new Error(message);

  logger.warn(`[Config] ${message}`);
  return { ok: false, missing: missing.map((m) => m.name) };
}

// ── Efeito de boot ───────────────────────────────────────────────
// Executado no require, seguindo o padrão de secret.js: quem importar este módulo
// já garante que o ambiente foi validado. Em produção, lança e o processo morre aqui.
validateEnv(process.env);

module.exports = { validateEnv, findMissing, buildMessage, REQUIRED };
```

### Ordem de carregamento — onde exatamente o `require` entra

Sequência atual do boot `[VERIFIED: leitura de backend/src/index.js]`:

```
index.js:1   require('dotenv').config()          ← única carga do .env em todo o repo
index.js:8   require('./logger')                  ← só lê LOG_LEVEL/NODE_ENV, sem efeito destrutivo
index.js:56  require('./middleware/auth')         ← puxa secret.js (JWT_SECRET fail-fast HOJE)
index.js:60  require('./routes/auth')             ← puxa db.js  ← ABRE O SQLITE + SEMEIA config
index.js:73+ require('./routes/deals|…')
index.js:138 app.listen()
index.js:143 require('./scheduler'); scheduleTask()
```

**Posição correta do novo `require('./config')`: `index.js` linha 2**, imediatamente depois do
`dotenv` e **antes de tudo o mais**. Razões concretas, não estéticas:

1. **Depois do `dotenv`** — óbvio, senão `process.env` ainda está vazio.
2. **Antes de `require('./db')`** — `db.js` **abre a conexão SQLite e semeia a tabela `config` no
   load** (`db.js:5` e `db.js:117-124`). Se a validação rodar depois, um boot mal configurado em
   produção já criou/tocou o arquivo do banco antes de morrer. Falhar antes de qualquer efeito
   colateral é a definição de fail-fast.
3. **Antes de `require('./middleware/auth')`** — hoje o `JWT_SECRET` ausente estoura dentro do
   `secret.js`, com uma mensagem que fala só do JWT. Validando antes, o operador recebe **a lista
   completa** do que falta num único boot, em vez de descobrir uma variável por vez.
4. **`secret.js` continua como está.** Ele valida algo que `config.js` não valida (o **comprimento
   mínimo** de 16 caracteres) e é requerido por `middleware/auth` e `routes/auth` diretamente.
   Removê-lo seria refatoração sem ganho — e `config.js` rodando antes torna o `throw` dele
   inalcançável no caminho normal, que é o resultado desejado.

**Não fazer `require('./config')` dentro de `db.js`, `emailer.js` ou `agendor.js`.** Esses módulos
são requeridos pelos testes sem `dotenv`; acoplar a validação a eles faz a suíte carregar o
validador em todo arquivo de teste sem necessidade. Em dev/teste o resultado seria só ruído de
warning (`NODE_ENV` indefinido → ramo de aviso), mas é acoplamento gratuito.

### Pattern 2: `NODE_ENV` como único discriminador dev/prod (D-07)

O código já usa `NODE_ENV` em 6 lugares (`index.js:51,68,80,93,98` e `logger.js:9`). D-07 formaliza
esse mecanismo em vez de criar arquivos `.env.<ambiente>`. Fato verificado que sustenta a decisão:

```
$ npm run env | grep NODE_ENV   → (vazio)
$ node -e "console.log(process.env.NODE_ENV)"  → undefined
```
**`npm run` não define `NODE_ENV`.** `[VERIFIED: execução local]` Logo, em CI e na suíte de testes
`NODE_ENV` é `undefined` → o validador cai no ramo "desenvolvimento" (avisa) automaticamente,
**sem precisar de nenhum código especial para testes**. D-05 funciona de graça. O único lugar que
define `production` é o `env:` do `ecosystem.config.js` (e o `sed` do `deploy/instalar.sh:75-77`).

### Anti-Patterns to Avoid

- **Validar dentro de cada consumidor** (`agendor.js` checa o token, `emailer.js` checa a senha…) —
  contraria D-06 e dá 5 mensagens de erro diferentes para o mesmo problema de deploy.
- **`process.exit(1)` no validador** — impede o teste de capturar o erro e mata o processo antes de
  o logger drenar. `throw` deixa o Node encerrar com stack e exit code 1 naturalmente, que é o que
  `secret.js` já faz.
- **Parar na primeira variável faltante** — um `.env` de deploy costuma ter várias lacunas; o
  operador faria 5 restarts. Listar todas de uma vez.
- **Ler `process.env` dentro da função pura** — mata a testabilidade e traz de volta o problema de
  cobertura do `secret.js`.
- **Usar `dir` mode do gitleaks** — lê `backend/.env` e `.claude/` reais (33 achados medidos).
- **`console.*` no novo código** — CLAUDE.md é explícito: usar `require('./logger')` com tag
  `[Config]` entre colchetes, no padrão `[Scheduler]`/`[Auth]`/`[Emailer]` já existente.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detectar segredo em commit | Regex caseira num script de CI | `gitleaks-action@v3` (D-08) | ~200 regras mantidas + cálculo de entropia + formato de fingerprint estável. Uma regex caseira não pegaria `curl-auth-header`, que este repo tem 30 ocorrências localmente. |
| Barrar segredo antes do push | Hook `pre-commit` próprio | GitHub push protection (grátis, repo público) | Hook local não roda no CI, é pulável com `--no-verify` e não existe em clone novo. |
| Parsear `.env` | Split manual por `=` | `dotenv` 16.6.1 (já instalado) | Aspas, multilinha, `export`, comentários, escapes. |
| Descobrir se o `.env.example` está completo | Revisão manual em PR | Meta-teste que faz grep de `process.env.X` em `src/` e compara com o `.env.example` | Foi revisão manual que deixou 3 variáveis de fora e 1 fantasma dentro. O teste torna CFG-02 permanente em vez de pontual. |
| Mascarar segredo em log/relatório | Substring própria | `--redact` do gitleaks (a action já passa) | Sem isso o CI imprime o valor detectado no log público. |
| Comparar valor sensível | `===` | Fora de escopo desta fase | (Fase 6, SEC-01.) |

**Key insight:** o modo de falha desta fase não é "a ferramenta de detecção é fraca" — é
"a configuração de produção não é observável a partir do repositório". O `.env` de produção não é
versionado, o `cwd` do PM2 está errado, e nada disso aparece em nenhum teste ou lint. Por isso os
dois investimentos de maior retorno aqui são o **meta-teste do `.env.example`** e o **checkpoint
humano de verificação do `.env` de produção** — não a escolha do scanner.

---

## Q4 — Migração da senha SMTP (D-01/D-02/D-03): pontos de toque e testes

### São 4 pontos de toque, não 2 (o CONTEXT.md lista 3)

| # | Arquivo:linha | O que faz hoje | O que precisa virar |
|---|---------------|----------------|---------------------|
| 1 | `backend/src/db.js:110` | `smtp_pass: process.env.SMTP_PASS \|\| ''` dentro do objeto `defaults`, semeado no load | **Remover a chave do `defaults`.** Se ficar, um `DELETE` da linha faz o seeder **re-inserir a senha do env no banco** no próximo boot — desfazendo a migração em silêncio. |
| 2 | `backend/src/db.js` (após a linha 124) | — | **Nova migração de D-02**, depois do loop de seed. Ver o código abaixo. |
| 3 | `backend/src/emailer.js:12` | `pass: getConfig('smtp_pass')` | `pass: process.env.SMTP_PASS` — com comentário explicando a exceção deliberada ao padrão "config vem do banco". |
| 4 | **`backend/src/routes/config.js:51`** | `'smtp_pass'` está na **allowlist do PUT** | **Remover da allowlist.** Não estava listado no CONTEXT.md. Se ficar, a API continua aceitando gravar a senha no banco — e a migração se desfaz na primeira vez que alguém salvar o formulário. |
| 4b | `backend/src/routes/config.js:38` | `const safe = { ...config, smtp_pass: config.smtp_pass ? '••••••••' : '' }` | **Pode ficar como está.** Com o valor zerado, o ternário devolve `''` naturalmente. Mexer aqui é risco sem ganho. |
| 5 | `frontend/src/components/ConfigPanel.jsx:241-258` | `<Field label="Senha / App Password">` com toggle de olho | Remover o `<Field>` inteiro + a nota de D-03. **Também remover** o state `showPass` (linha 18) e os imports `Eye`/`EyeOff` (linha 2), que ficam órfãos. |

**Sobre o `save()` do frontend:** ele envia `{...config}` inteiro (linha 48), incluindo o
`smtp_pass` que veio do GET. Com o campo fora da allowlist do PUT, o backend simplesmente ignora —
nenhuma mudança adicional necessária no frontend além da remoção visual.
`[VERIFIED: leitura de ConfigPanel.jsx:44-58]`

**Sobre `verifySmtp()` / `POST /api/config/test-smtp`:** passam por `createTransporter()`, então
herdam a mudança automaticamente. Nada a fazer. `[VERIFIED: emailer.js:397]`

### A migração idempotente, no estilo do `db.js`

Posição obrigatória: **depois** do loop de seed (`db.js:117-124`). Antes, o seeder ainda não rodou e
a chave pode nem existir.

```javascript
// ── Migração: a senha SMTP sai do banco (D-01/D-02, CFG-01) ──────
//
// EXCEÇÃO DELIBERADA ao padrão "toda config runtime mora na tabela config":
// smtp_pass é o único valor aqui que é de fato um segredo, e o backup diário
// (deploy/backup.sh) copia o .db inteiro — ou seja, a senha ia parar em até 30
// cópias em disco. A partir daqui ela vem só de process.env.SMTP_PASS (emailer.js).
//
// A migração é DEFENSIVA (D-02): só zera o valor antigo se o ambiente realmente
// tiver a senha. Um .env incompleto no deploy nunca deve derrubar o envio de e-mail —
// nesse caso o valor do banco é preservado e um aviso é logado.
// É idempotente: rodar N vezes tem o mesmo efeito de rodar uma.
try {
  const envPass = (process.env.SMTP_PASS || '').trim();
  const dbPass = getConfig('smtp_pass');

  if (envPass && dbPass) {
    setConfig('smtp_pass', '');
    logger.info(
      '[DB] smtp_pass removida da tabela config — a senha SMTP agora vem de SMTP_PASS (D-01).',
    );
  } else if (!envPass && dbPass) {
    logger.warn(
      '[DB] SMTP_PASS ausente no ambiente — a senha antiga foi PRESERVADA no banco para não ' +
        'interromper o envio de e-mail. Defina SMTP_PASS em backend/.env e reinicie para concluir a migração.',
    );
  }
} catch (_) {
  /* banco recém-criado ou chave inexistente — nada a migrar */
}
```

Notas de implementação verificadas:
- **`getConfig`/`setConfig` já estão definidos** em `db.js:126-136`, acima deste ponto. Sem problema
  de ordem. `[VERIFIED]`
- **`db.js` não requer `logger.js` hoje.** Adicionar `require('./logger')` no topo é seguro:
  `logger.js` só depende de `process.env`, não há ciclo. `[VERIFIED: leitura de logger.js]`
- **Zerar (`setConfig(k,'')`) é melhor que `DELETE`**: a linha continua existindo, então o seeder
  (`if (!existing)`) não a recria mesmo se alguém esquecer de tirar do `defaults`. Defesa em
  profundidade barata. `getAllConfig()` continua devolvendo a chave e o mascaramento do GET
  continua correto.
- **`catch (_) {}` silencioso** é exatamente o padrão que `db.js` já usa nas migrações de
  `ALTER TABLE` (linhas 88-94) e que o CONTEXT.md manda seguir.

### Os testes que a constraint do projeto exige (D-01/D-02/D-03 mudam comportamento)

Cada variação de ambiente precisa de **arquivo próprio**, porque (a) `node --test` roda cada arquivo
num processo separado e (b) `db.js` abre a conexão e roda a migração **no `require`** — não dá para
reconfigurar depois.

| Arquivo | Preparação | Asserção |
|---------|-----------|----------|
| `test/db.smtpPassMigration.keep.test.js` | `makeTmpDbPath()` → `DB_PATH`; abrir `openRaw()` e semear `config.smtp_pass = 'senha-antiga'`; deixar `SMTP_PASS=''` (o `setup.js` já força isso); **então** `require('../src/db')` | `getConfig('smtp_pass') === 'senha-antiga'` (preservado, D-02) |
| `test/db.smtpPassMigration.clear.test.js` | Igual, mas `process.env.SMTP_PASS = 'senha-do-env'` **depois** do `require('./setup')` (que zera sem guarda) e **antes** do `require('../src/db')` | `getConfig('smtp_pass') === ''` (zerado, D-02) |
| idem, 2º caso no mesmo arquivo | Fechar a conexão, `delete require.cache[...]`, re-`require('../src/db')` no mesmo arquivo de banco | `getConfig('smtp_pass') === ''` — o seeder **não** re-semeou (guarda o bug do ponto #1) |
| `test/emailer.smtpPass.test.js` | `SMTP_PASS='env-pass'`; semear `config.smtp_pass='db-pass'`; `mock` de `nodemailer.createTransport` para capturar o objeto de opções | `opts.auth.pass === 'env-pass'` — e explicitamente `!== 'db-pass'` (D-01) |
| `test/config.route.smtpPass.test.js` | Chamar o handler do PUT com `{ smtp_pass: 'nova' }` | `getConfig('smtp_pass')` inalterado — a chave saiu da allowlist |

⚠️ **Ordem crítica dentro de `db.smtpPassMigration.clear.test.js`:** `test/setup.js` faz
`process.env.SMTP_PASS = ''` **sem guarda** (é intencional — comentado no próprio arquivo, para que
um segredo do shell/CI nunca vaze para o SQLite de teste). Então a atribuição do teste tem que vir
**depois** do `require('./setup')`, ao contrário de `DB_PATH`, que tem guarda e por isso é setado
**antes**. Inverter isso faz o teste passar por acidente no ramo errado.
`[VERIFIED: leitura de backend/test/setup.js:14-32 e backend/test/db.dedup.test.js:15-20]`

---

## Common Pitfalls

### Pitfall 1: 🔴 BLOQUEANTE — dotenv não carrega o `.env` sob PM2 (o fail-fast derruba produção)

**What goes wrong:** ligar D-04/D-05 e, no próximo `pm2 restart agendor-backend`, o backend morre no
boot com "Configuração incompleta" — em produção, sem aviso prévio.

**Why it happens:** três fatos que só juntos revelam o problema, todos verificados:
1. `require('dotenv').config()` sem `path` resolve `process.cwd() + '/.env'`.
2. `ecosystem.config.js:6` define `cwd: '/opt/agendor'` — a **raiz** do repo.
3. O `.env` mora em `/opt/agendor/backend/.env` (`deploy/instalar.sh:61-63`).

→ o dotenv procura `/opt/agendor/.env`, não acha, e **retorna `{ error: ENOENT }` sem lançar**;
o código nunca olha o retorno. Confirmado localmente:
`d.config({path:'/caminho/inexistente/.env'})` → `error: ENOENT`, sem exceção.
`[VERIFIED: node -e com dotenv 16.6.1]`

Reforço independente: o `backend/.env` **local** tem 12 chaves e **não tem `ALLOWED_ORIGINS` nem
`ADMIN_USERS`**. Mesmo que o dotenv carregasse certo em produção, duas das cinco obrigatórias de
D-04 provavelmente faltariam. `[VERIFIED]`

**How to avoid:** três correções; a primeira é a certa.
- **✅ A — tornar o caminho determinístico (recomendada).** Uma linha, independente de `cwd`, não
  exige mudança de deploy nem de PM2:
  ```javascript
  // Caminho explícito: o .env mora ao lado do package.json do backend. Sem isto, o
  // carregamento depende do cwd — e sob PM2 (ecosystem.config.js: cwd '/opt/agendor')
  // o dotenv procuraria /opt/agendor/.env, que não existe, e falharia em SILÊNCIO.
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
  ```
- **B — mudar `cwd` do ecosystem para `/opt/agendor/backend`.** Muda o `script` relativo, os
  `error_file`/`out_file` e exige `pm2 delete && pm2 start && pm2 save` (o `pm2 restart` reusa o
  dump antigo). Mais superfície de erro do que A.
- **C — logar quando o dotenv falha.** Complementa A, não substitui:
  `const r = require('dotenv').config({path}); if (r.error) logger.warn(...)`.

**Warning signs:** `pm2 logs agendor-backend` mostrando o boot OK **mas** e-mails não saindo, ou
`/api/health` respondendo `env: "production"` enquanto `ALLOWED_ORIGINS` cai no default de localhost.

**Ordem obrigatória de tarefas no plano:** corrigir o dotenv **e** verificar o `.env` de produção
**antes** de ligar o `throw`. Ligar o fail-fast primeiro transforma esta fase num incidente.

### Pitfall 2: validação depois do `require('./db')` deixa efeito colateral antes de morrer

**What goes wrong:** o boot falha, mas o SQLite já foi aberto e a tabela `config` já foi semeada.

**Why it happens:** `db.js` executa `new Database(dbPath)` (linha 5), cria tabelas, roda migrações e
semeia defaults **no load do módulo** — e é puxado por `require('./routes/auth')` na linha 60 do
`index.js`. `[VERIFIED]`

**How to avoid:** `require('./config')` na **linha 2** do `index.js`, logo após o `dotenv`. Ver a
justificativa de ordenação completa em §Pattern 1.

**Warning signs:** arquivo `agendor.db` sendo criado numa máquina onde o boot "falhou".

### Pitfall 3: 🔴 o seeder de `defaults` desfaz a migração no boot seguinte

**What goes wrong:** a migração zera `smtp_pass`, alguém deleta a linha (ou o banco é recriado), e o
próximo boot **re-insere `process.env.SMTP_PASS` no banco** — a senha volta para dentro dos backups.

**Why it happens:** `db.js:110` tem `smtp_pass: process.env.SMTP_PASS || ''` no objeto `defaults`, e
o loop de seed (`db.js:117-124`) insere qualquer chave ausente.

**How to avoid:** **remover `smtp_pass` do objeto `defaults`** (ponto #1 da tabela de Q4) **e** zerar
em vez de deletar. As duas coisas, não uma. É o teste "após zerar, o próximo boot não re-semeia" que
prova isso.

**Warning signs:** `SELECT value FROM config WHERE key='smtp_pass'` voltando não-vazio depois de um
deploy limpo.

### Pitfall 4: `smtp_pass` continua gravável pela API mesmo com o campo fora da UI

**What goes wrong:** remove-se o campo do `ConfigPanel.jsx`, mas `PUT /api/config` continua aceitando
`smtp_pass` (`routes/config.js:51`). Qualquer cliente — ou o próprio `save()` do frontend com estado
residual — regrava a senha no banco e CFG-01 volta a ser falso.

**How to avoid:** remover `'smtp_pass'` da allowlist do PUT. É a linha 51. O teste
`config.route.smtpPass.test.js` fixa isso.

**Warning signs:** o valor voltando ao banco depois que alguém salva a aba Configurações.

### Pitfall 5: 🟠 o gate de cobertura quebra com o módulo novo (folga real: 10 branches)

**What goes wrong:** `npm run test:coverage` falha com "ERROR: Coverage for branches (…) does not meet
global threshold (60)" — e o job `backend` do CI fica vermelho, bloqueando o merge.

**Why it happens:** `.c8rc.json` tem `all: true`, `include: ["src/**/*.js"]`, `exclude: ["test/**",
"src/index.js"]`. **Todo arquivo novo em `src/` entra na conta.** Baseline medido: branches
74/113 = 65,48 % contra piso de 60 → `74/(113+N) ≥ 0,60` ⟹ **N ≤ 10 branches novos não cobertos**.

**How to avoid:** o `config.js` entra **na mesma wave** que `config.validateEnv.test.js`. Não é
"testar depois". Rodar `npm run test:coverage` (não só `npm test`) antes de considerar a tarefa
pronta. O padrão de função pura de §Pattern 1 torna os branches baratos de cobrir.

**Warning signs:** `npm test` verde e `npm run test:coverage` vermelho — sinal clássico de código
novo sem teste.

### Pitfall 6: 🔴 ordem errada ao adicionar o required status check trava o merge para sempre

**What goes wrong:** adiciona-se `secrets` aos `contexts` da branch protection antes de o contexto
existir. O GitHub fica esperando um check que nunca reporta, e **todo PR fica bloqueado** —
inclusive o que traria a correção. Com `enforce_admins: true`, nem admin faz bypass.

**Why it happens:** o GitHub só conhece um contexto depois que ele reporta pelo menos uma vez. É
exatamente o "Pitfall 3" já documentado em `deploy/branch-protection.md`.

**How to avoid — sequência obrigatória, nesta ordem:**
1. PR que adiciona o job `secrets` ao `ci.yml`. Requeridos ainda são só `backend` e `frontend`.
2. Merge (o job roda no PR e no push da `main` — o contexto passa a existir).
3. **Só então** re-aplicar a proteção incluindo o novo contexto:
   ```bash
   gh api --method PUT -H "Accept: application/vnd.github+json" \
     /repos/vitormorija/automacao-agendor/branches/main/protection --input - <<'JSON'
   { "required_status_checks": { "strict": true, "contexts": ["backend", "frontend", "secrets"] },
     "enforce_admins": true, "required_pull_request_reviews": null, "restrictions": null }
   JSON
   ```
4. Provar o gate com um PR de falha proposital (mesmo método da Fase 2: `mergeStateStatus` = `BLOCKED`).
5. Atualizar `deploy/branch-protection.md` — o runbook cita `backend` e `frontend` em 3 lugares.

⚠️ O endpoint exige **as 4 chaves de topo** e substitui a configuração inteira — omitir `backend`
ou `frontend` do array os **remove**. `[CITED: deploy/branch-protection.md §2]`

⚠️ O id do job **é** o nome do contexto. Não pôr `name:` custom no job `secrets` — o `ci.yml` já
tem comentários avisando disso em duas linhas.

### Pitfall 7: PR com mais de 30 commits é escaneado só parcialmente

**What goes wrong:** o gate passa verde mesmo com segredo, porque o commit que o introduziu ficou
fora do range escaneado.

**Why it happens:** `ScanPullRequest()` chama
`octokit.request("GET /repos/{o}/{r}/pulls/{n}/commits")` **sem `per_page`** → a API pagina em **30**
e a action **não** pagina. Com 40 commits, `headRef` vira o 30º e os 10 últimos nunca são olhados.
No evento `push` o problema é análogo e pior: o payload do webhook do GitHub trunca `commits` em 20.
`[VERIFIED: src/gitleaks.js@v3 linha ~160, sem paginação]`

**Relevância direta:** o PR #1 desta milestone teve **64 commits**. `[VERIFIED: STATE.md]`

**How to avoid:** manter o PR desta fase **abaixo de 30 commits** (factível — são ~4 planos), ou
adicionar um job `workflow_dispatch`/`schedule` de histórico completo como rede complementar (que
aí exige o `.gitleaksignore` da §Q1).

**Warning signs:** no log do job, a linha `gitleaks cmd: gitleaks … --log-opts=…` mostra o range
efetivamente escaneado — comparar com o número de commits do PR.

### Pitfall 8: 🟠 o critério de sucesso de CFG-01 falha contra os próprios documentos de planejamento

**What goes wrong:** o critério diz "`grep` no repositório não encontra token Agendor". Um
`git grep c57f59ef` **acha 6 ocorrências** — todas em `.planning/`:
`03-DISCUSSION-LOG.md` (2) e `sec-01-rotate-agendor-token.md` (4). O critério nunca passaria.
`[VERIFIED: git grep]`

**Why it happens:** os documentos citam o prefixo do token de propósito, para rastrear a exposição.
São referências **truncadas** (`c57f59ef-…`), não o token completo — não constituem vazamento novo,
já que o valor íntegro já está no histórico público.

**How to avoid:** escopar a verificação a código e configuração — que é o que CFG-01 realmente quer:
```bash
git grep -nI -e "c57f59ef" -- backend/src frontend/src deploy '*.example' '*.json' '*.sh' \
  ':!.planning' && echo "FALHOU" || echo "OK"
```
Resultado hoje: **OK**. Confirmado também que o `HEAD` não tem nenhum literal casando com
`(password|secret|token|api_key)\s*[:=]\s*['\"][A-Za-z0-9/+_-]{16,}['\"]` em `backend/src` ou
`frontend/src`. `[VERIFIED]`

**Warning signs:** o plano especificar `grep -r` na raiz como passo de verificação — vai falhar e o
executor vai "consertar" apagando documentação de segurança legítima.

### Pitfall 9: placeholders de alta entropia no `.env.example` disparam o gitleaks

**What goes wrong:** ao completar o `.env.example` (D-10), alguém escreve um placeholder realista
(ex.: uma app password de 16 caracteres) e o `generic-api-key` dispara — no próprio PR desta fase,
porque a linha é **adicionada** no range escaneado.

**Why it happens:** `generic-api-key` casa `key|api|token|secret|passwd|password|auth` perto de uma
string de entropia alta. Foi exatamente assim que o token real entrou (`.env.example@13905d4`).

**How to avoid:** placeholders em português, óbvios e de baixa entropia. **Testado**: o bloco abaixo
foi commitado num repo sandbox e escaneado pelo gitleaks 8.30.1 → **no leaks found**.
`[VERIFIED: teste sandbox]`
```
JWT_SECRET=troque-por-um-segredo-forte-e-aleatorio
SMTP_PASS=sua-senha-de-app-aqui
AGENDOR_TOKEN=seu-token-aqui
DB_PATH=./agendor.db
LOG_LEVEL=info
BASE_URL_FRONTEND=http://localhost:5173
```
Escape de emergência (também verificado): sufixo `# gitleaks:allow` na linha específica.
Preferir sempre o placeholder ruim ao `allow`.

### Pitfall 10: falso-positivo do `test/setup.js` volta se o arquivo for reescrito

**What goes wrong:** o plano precisa acrescentar `ALLOWED_ORIGINS`/`ADMIN_USERS` ao `test/setup.js`
(para os testes do validador), o arquivo é reformatado/movido, a **linha 15 é re-adicionada** no
diff, e o gitleaks flagra `test-jwt-secret-0123456789abcdef` — barrando o próprio PR da fase.

**How to avoid:** editar `setup.js` por **acréscimo**, sem tocar a linha 15. Verificado: um commit
que anexa linhas ao fim de `setup.js` escaneia limpo (`no leaks found`), porque o gitleaks só olha
linhas adicionadas. Se a reescrita for inevitável, ou trocar o literal por
`'x'.repeat(20)` / `crypto.randomBytes` (mata a entropia), ou anexar `// gitleaks:allow`.
`[VERIFIED: commit de simulação criado e revertido nesta sessão]`

### Pitfall 11: a action pode falhar por "missing gitleaks license" sem nada ter mudado

**What goes wrong:** o job `secrets` fica vermelho com `🛑 missing gitleaks license` e trava o merge,
mesmo sem segredo nenhum.

**Why it happens:** a action chama `GET /users/{username}` para decidir se exige licença. No `.catch`,
`core.warning("… License key validation will be enforced 🤷")` e depois `process.exit(1)`. Ou seja,
**qualquer falha transitória dessa chamada** (rate limit, rede) vira falha de licença.
`[VERIFIED: src/index.js@v3]`

**How to avoid:** saber diagnosticar (é re-run, não é código). Registrar no runbook. Se recorrer, a
saída é o CLI MIT direto (ver Alternatives Considered) — ao custo de contrariar D-08.

---

## Code Examples

### Job `secrets` no `.github/workflows/ci.yml` (D-08/D-09)

```yaml
  # id do job = contexto do required status check (Pitfall 3 do runbook) — NÃO adicionar name: custom.
  # Gate de segredos (CFG-01, D-08/D-09). Escaneia apenas o range de commits do PR/push:
  # o token histórico do commit 13905d4 fica FORA do range, então este job não nasce vermelho.
  secrets:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read # a action lista os commits do PR via API para calcular o range
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # OBRIGATÓRIO: --log-opts=base^..head precisa do histórico local
      - uses: gitleaks/gitleaks-action@v3 # SHA da tag em 2026-07-29: e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # a action aborta sem esta variável
          GITLEAKS_VERSION: '8.24.3' # fixo: 'latest' faria regra nova quebrar o gate sem mudança de código
          GITLEAKS_ENABLE_COMMENTS: 'false' # comentar em PR exigiria pull-requests: write
          GITLEAKS_ENABLE_UPLOAD_ARTIFACT: 'false' # artefato SARIF sem uso aqui
```
Nenhuma `GITLEAKS_LICENSE`: `vitormorija` é conta pessoal (`type: "User"`), a action detecta e
dispensa. `[VERIFIED: gh api + src/index.js@v3]`

### Verificação do `.env` de produção — rodar ANTES de mesclar o fail-fast

```bash
# No servidor, como o usuário que roda o PM2. Só imprime nomes, nunca valores.
cd /opt/agendor
for v in AGENDOR_TOKEN JWT_SECRET SMTP_PASS ALLOWED_ORIGINS ADMIN_USERS; do
  if grep -qE "^${v}=.+" backend/.env; then echo "OK      $v"; else echo "FALTA   $v"; fi
done
# Confirma qual .env o processo realmente enxerga (Pitfall 1):
pm2 describe agendor-backend | grep -E "cwd|exec cwd"
ls -l /opt/agendor/.env /opt/agendor/backend/.env 2>&1
```
**Toda linha `FALTA` é um boot que vai morrer** depois que D-04/D-05 entrar.
Este comando merece um `checkpoint:human-verify` no plano.

### Meta-teste anti-drift do `.env.example` (CFG-02, torna o requisito permanente)

```javascript
// backend/test/envExample.test.js
// Garante que .env.example continue documentando TODAS as variáveis lidas pelo código (CFG-02).
// Foi revisão manual que deixou 3 variáveis de fora e 1 fantasma dentro — este teste substitui
// a revisão manual por uma verificação que roda em todo commit.
require('./setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const EXAMPLE = path.join(__dirname, '..', '.env.example');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('.env.example documenta todas as process.env lidas em src/', () => {
  const lidas = new Set();
  for (const file of walk(SRC)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) lidas.add(m[1]);
  }
  const exemplo = fs.readFileSync(EXAMPLE, 'utf8');
  const documentadas = new Set(
    exemplo
      .split('\n')
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=/))
      .filter(Boolean)
      .map((m) => m[1]),
  );
  const faltando = [...lidas].filter((k) => !documentadas.has(k)).sort();
  assert.deepEqual(faltando, [], `Variáveis lidas em src/ e ausentes no .env.example: ${faltando}`);
});
```
Opcional no mesmo arquivo: a asserção inversa (documentada mas nunca lida) pega o fantasma
`STALE_DAYS` — usar allowlist explícita se decidirem mantê-lo por razões documentais.

### `.env.example` — comentários dev vs prod (D-07/D-10)

```bash
# ── Ambiente ─────────────────────────────────────────────────────
# development (padrão) = fail-fast vira aviso, logs em texto, sem CSP, sem serving do dist.
# production           = boot ABORTA se faltar obrigatória, logs em JSON, serve frontend/dist.
NODE_ENV=production                    # [dev: deixe em branco ou 'development']

# ── OBRIGATÓRIAS (o boot aborta em produção se faltar) ───────────
AGENDOR_TOKEN=seu-token-aqui           # painel Agendor › Configurações › API
JWT_SECRET=troque-por-um-segredo-forte-e-aleatorio   # gere com: openssl rand -hex 32
SMTP_PASS=sua-senha-de-app-aqui        # único segredo SMTP no ambiente — os demais ficam na UI
ALLOWED_ORIGINS=http://agendor.cadmus.com.br         # [dev: em branco aceita localhost]
ADMIN_USERS=admin@cadmus.com.br        # e-mails que podem gerenciar usuários (vírgula)

# ── OPCIONAIS (têm default sensato no código) ────────────────────
PORT=3001                              # default 3001
LOG_LEVEL=info                         # error|warn|info|debug — default info    [NOVO — D-10]
DB_PATH=./agendor.db                   # default backend/agendor.db              [NOVO — D-10]
BASE_URL=http://agendor.cadmus.com.br  # links rastreáveis nos e-mails [dev: deixe em branco]
BASE_URL_FRONTEND=http://localhost:5173 # link de redefinição de senha            [NOVO — D-10]
                                        # [prod: http://agendor.cadmus.com.br]
```
Verificado: nenhuma dessas linhas dispara o gitleaks. `[VERIFIED: teste sandwich em repo sandbox]`

### Nota que substitui o campo de senha no `ConfigPanel.jsx` (D-03)

```jsx
{/* D-01: a senha SMTP saiu do banco e vem só de SMTP_PASS no ambiente do servidor.
    O campo foi removido de propósito — não é um bug de UI. */}
<div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
  A senha SMTP é lida da variável de ambiente <code className="font-mono">SMTP_PASS</code> no
  servidor e não pode ser alterada por aqui. Para trocá-la, edite o{' '}
  <code className="font-mono">.env</code> e reinicie o serviço.
</div>
```
Lembrar de remover o state `showPass` e os imports `Eye`/`EyeOff`, que ficam órfãos. Biome tem
`noUnusedImports`/`noUnusedVariables` em `warn` (não quebra o lint), mas deixar sujeira é dívida.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Segredos em tabela de config editável pela UI | Segredo no ambiente; config não-sensível no banco | — | É exatamente o D-01 híbrido. Padrão bem estabelecido. |
| `gitleaks protect` para pré-commit / `--no-git` | `gitleaks git` / `gitleaks dir` (`protect` foi descontinuado) | 8.x | A action v3 usa `detect` com `--log-opts`. Documentação antiga citando `protect` está obsoleta. |
| `gitleaks-action@v2` (node20) | `@v3` (node24) | v3.0.0, 2026-05-30 | "one-line change" segundo o README. |
| Secret scanning só com GitHub Advanced Security | Alertas + push protection **grátis em repositório público** | push protection GA 2023-05 | Muda a análise custo/benefício: ligar é grátis e sem manutenção. |
| `dotenv` 16 | `dotenv` 17 (banner de tips no boot, opção `quiet`) | 2025 | **Não atualizar nesta fase.** 16.6.1 funciona e o upgrade muda o output de boot — mudança sem relação com CFG-01..04. |

**Deprecated/outdated:**
- `gitleaks protect` — removido em favor de `git`/`dir`.
- Exemplos com `actions/checkout@v3/v4` — o repo padronizou `@v7` (v7.0.1, 2026-07-20). `[VERIFIED: gh api]`

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (wrapper `~/bin/node`) | Rodar testes localmente | ✓ | v22.13.1 | `export PATH="$HOME/bin:$PATH"` obrigatório antes de qualquer comando |
| npm (wrapper `~/bin/npm`) | `npm test`, `npm run test:coverage` | ✓ | funciona | — |
| **npx** (wrapper `~/bin/npx`) | — | ✗ | **quebrado** — aponta para `/tmp/node-v22.13.1-darwin-arm64/bin/node`, que não existe mais | Usar `./node_modules/.bin/<bin>` diretamente. **O plano não deve conter nenhum comando `npx`.** |
| `gh` CLI | Branch protection, toggles de secret scanning | ✓ | autenticado como `vitormorija` | — |
| Escopo `workflow` no token do `gh` | Publicar mudanças em `.github/workflows/` | ✓ | concedido em 2026-07-29 | `gh auth refresh -h github.com -s workflow` |
| `git` | Tudo | ✓ | — | — |
| Docker / colima | Rodar gitleaks localmente | ✗ | binário existe, **daemon não está rodando** (`.colima/default/docker.sock` ausente) | Baixar o binário do release — foi o que usei nesta pesquisa |
| gitleaks CLI local | Verificação local antes do push | ✗ (não instalado) | — | `curl -sSL .../gitleaks_8.30.1_darwin_arm64.tar.gz \| tar xz` — funciona, testado |
| Acesso ao servidor de produção | Verificar `/opt/agendor/backend/.env` | **?** | — | **Sem fallback.** Ver Open Question 1. |

**Missing dependencies with no fallback:**
- Acesso ao servidor de produção para auditar o `.env` real. Sem isso, D-04/D-05 não pode ser
  mesclado com segurança — é o gatilho do Pitfall 1.

**Missing dependencies with fallback:**
- Docker → baixar o binário do gitleaks direto (validado nesta sessão).
- `npx` → `./node_modules/.bin/<bin>`.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | parcial | Fora do escopo (Fase 6). Esta fase só torna `ADMIN_USERS` obrigatória por configuração. |
| V3 Session Management | não | JWT em `localStorage` → Fase 6 (SEC-04). |
| V4 Access Control | parcial | `requireAdmin()` continua **fail-open** no código (`routes/auth.js:36`). D-04 fecha por configuração; SEC-03/Fase 6 fecha no código. **Não confundir os dois** no plano. |
| V5 Input Validation | sim | `routes/config.js` já tem `VALIDATORS` por chave + limite de 500 chars. Remover `smtp_pass` da allowlist **estreita** a superfície — nenhum validador novo é necessário. |
| V6 Cryptography | sim | `JWT_SECRET` ≥16 chars via `secret.js`; `bcryptjs` para senhas. **Nada de cripto novo nesta fase** — SECV-01 (cripto em repouso do `smtp_pass`) é v2, e D-01 resolve por remoção, que é estritamente melhor. |
| **V14 Configuration** | **sim — é a categoria central da fase** | Segredos fora do código e fora do VCS; validação no boot; separação dev/prod; varredura automatizada em CI. |
| V7 Error Handling / Logging | sim | Mensagem de erro do boot **não pode ecoar valores**, só nomes de variáveis. O gitleaks roda com `--redact`. |

### Known Threat Patterns for Node/Express + SQLite + GitHub Actions

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Segredo commitado em repositório público | Information Disclosure | gitleaks no CI (D-08) + push protection; **já materializado** — ver `sec-01` |
| Segredo em backup de banco não criptografado | Information Disclosure | D-01: tirar `smtp_pass` do SQLite (`deploy/backup.sh` copia o `.db` inteiro, 30 cópias) |
| Segredo ecoado em log de CI público | Information Disclosure | `--redact` (a action já passa); nunca usar `dir` mode neste repo (lê o `.env` real) |
| Config ausente vira permissão aberta | Elevation of Privilege | `ADMIN_USERS` vazio = todo autenticado é admin. D-04 mitiga por configuração; SEC-03 corrige no código |
| CORS permissivo por default de dev em produção | Spoofing | `ALLOWED_ORIGINS` ausente → cai em `localhost`. D-04 torna obrigatória |
| Supply chain via GitHub Action | Tampering | Pinar `@v3` + registrar o SHA em comentário; `permissions:` mínimas; sem `GITLEAKS_LICENSE` em secret |
| Action baixa binário de versão flutuante | Tampering | `GITLEAKS_VERSION` fixo, nunca `latest` |
| Segredo revogado que continua "válido" no histórico | Repudiation | Só a rotação encerra (`sec-01`). Nem gitleaks nem reescrita de histórico resolvem |

⚠️ **Limite honesto de CFG-01 nesta fase:** o token da Agendor **continua ativo e publicamente
recuperável**. CFG-01 é satisfeito no sentido de "nenhum segredo no código versionado em `HEAD`", e
o gate previne novas ocorrências — mas a exposição atual só termina com a rotação, que foi
conscientemente adiada. O `SUMMARY` da fase deve dizer isso com todas as letras, sem eufemismo.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | O `.env` de produção em `/opt/agendor/backend/.env` tem a mesma lacuna do local (sem `ALLOWED_ORIGINS`/`ADMIN_USERS`) | Pitfall 1 | Se estiver completo, o risco de outage é bem menor. Se estiver incompleto (provável), o fail-fast derruba produção. **Verificável em 30 s** com o comando de §Code Examples — não deixar como suposição. |
| A2 | Em repo público, `GITHUB_TOKEN` com `contents: read` consegue ler `GET /pulls/{n}/commits` sem `pull-requests: read` | Q1, tabela de permissions | Se errado, o job falha na primeira execução com 403. Mitigado declarando `pull-requests: read` — custo zero. |
| A3 | `secret_scanning_non_provider_patterns` detectaria `AGENDOR_TOKEN=<uuid>` | Q2 | Só afeta a expectativa sobre alertas. Não afeta o gate de merge. |
| A4 | Runner `ubuntu-latest` suporta o runtime `node24` da action | Standard Stack | Se não suportar, erro imediato "unsupported runtime"; fallback é `@v2` (node20). Detectável na primeira execução. |
| A5 | Produção nunca reiniciou desde que `secret.js` (fail-fast do JWT) entrou | Pitfall 1 | Se já reiniciou com sucesso, então o `.env` **está** sendo carregado por algum mecanismo não visível daqui (ex.: `/opt/agendor/.env` também existe) e o risco do Pitfall 1 cai muito. Resolvido pela mesma verificação de A1. |
| A6 | A licença gratuita da `gitleaks-action` para contas pessoais continuará gratuita | Standard Stack | Mudança de política quebraria o gate. Saída documentada: CLI MIT direto. |
| A7 | O executor manterá o PR desta fase abaixo de 30 commits | Pitfall 7 | Acima disso, o scan é parcial e o gate dá falsa segurança. |

---

## Open Questions

1. **O `.env` de produção está completo e é realmente carregado?**
   - What we know: o `.env` local tem 12 chaves e não tem 2 das 5 obrigatórias; o `cwd` do PM2 não
     bate com o caminho do `.env`; o dotenv falha em silêncio.
   - What's unclear: o conteúdo real de `/opt/agendor/backend/.env` e se existe também um
     `/opt/agendor/.env`.
   - Recommendation: **`checkpoint:human-verify` bloqueante** no plano, com o comando de §Code
     Examples, **antes** da tarefa que liga o `throw` em produção. É o único item desta fase capaz
     de causar indisponibilidade.

2. **Ligar o GitHub Secret Scanning agora ou depois da rotação do token?**
   - What we know: ligar é grátis, complementa o gitleaks, e vai abrir um alerta para `13905d4`.
   - What's unclear: se o usuário quer um alerta permanente aberto sobre uma exposição cuja
     remediação foi adiada.
   - Recommendation: ligar mesmo assim. O alerta é o registro honesto de um risco real e ativo.
     Push protection sozinha já paga o custo. Confirmar com o usuário — é decisão dele, não minha.

3. **Manter `STALE_DAYS` no `.env.example`?**
   - What we know: nenhum código lê essa variável; o valor efetivo vem da tabela `config`.
   - What's unclear: se foi lido em algum momento (não há evidência no `HEAD`).
   - Recommendation: remover, ou manter com um comentário explícito de "não é lido pelo código".
     Manter sem ressalva contraria CFG-02.

4. **Scan de histórico completo agendado, como rede complementar?**
   - What we know: `workflow_dispatch`/`schedule` escaneiam tudo; exigiria `.gitleaksignore` com os
     2 fingerprints; ignorar o #2 silencia o único aviso automático da exposição do `sec-01`.
   - Recommendation: **não** nesta fase. Push protection cobre o vetor "novo segredo" com custo zero
     e sem silenciar nada. Reavaliar depois da rotação.

5. **Corrigir o `cwd` do PM2 ou o caminho do dotenv?**
   - Recommendation: corrigir o **dotenv** (opção A do Pitfall 1). Uma linha, sem mudança de deploy,
     robusta a qualquer `cwd`. Mexer no `ecosystem.config.js` exigiria `pm2 delete && pm2 start &&
     pm2 save` — `pm2 restart` reusa o dump salvo e não pegaria a mudança.

---

## Sources

### Primary (HIGH confidence)

- **Execução local do `gitleaks` 8.24.3 e 8.30.1** contra `/Users/vitormorija/Automacao_agendor` —
  histórico completo (72 commits, 2 achados), `dir` mode (33 achados), scan por commit, teste de
  `.gitleaksignore` e de `# gitleaks:allow` em repo sandbox, commit de simulação em `test/setup.js`.
- **Código-fonte da `gitleaks-action@v3`** — `src/index.js`, `src/gitleaks.js`, `action.yml`
  (baixados de `raw.githubusercontent.com/gitleaks/gitleaks-action/v3/`): lógica de range por evento,
  exigência de `GITHUB_TOKEN`, detecção de tipo de conta, versão default `8.24.3`, ausência de
  paginação em `listCommits`, `process.exit(1)` em leak.
- **`gh api`** — `repos/vitormorija/automacao-agendor` (visibilidade, `owner.type`,
  `security_and_analysis`), `secret-scanning/alerts` (404), releases e SHAs de tags de
  `gitleaks/gitleaks-action` e `actions/checkout`.
- **Código do repositório** — `backend/src/{index,db,emailer,secret,logger,agendor}.js`,
  `backend/src/routes/{config,auth}.js`, `backend/src/middleware/auth.js`,
  `frontend/src/components/ConfigPanel.jsx`, `backend/test/{setup.js,helpers/tmpDb.js,*.test.js}`,
  `backend/.c8rc.json`, `backend/package.json`, `biome.json`, `ecosystem.config.js`,
  `deploy/{instalar.sh,backup.sh,branch-protection.md}`, `.github/workflows/ci.yml`, `.gitignore`,
  `README.md`.
- **Medições de runtime** — `npm run test:coverage` (35 testes, baseline de cobertura),
  `c8 --reporter=json-summary` (74/113 branches), `dotenv.config()` com path inexistente e com
  `backend/.env`, `npm run` não define `NODE_ENV`.
- **Documentos de planejamento** — `03-CONTEXT.md`, `REQUIREMENTS.md`, `STATE.md`,
  `todos/pending/sec-01-rotate-agendor-token.md`, `codebase/CONCERNS.md`, `CLAUDE.md`.

### Secondary (MEDIUM confidence)

- README oficial da `gitleaks-action` (via WebFetch) — `fetch-depth: 0`, inputs/env suportados,
  migração v2→v3. Corroborado pela leitura do código-fonte.
- README do `gitleaks` CLI — licença MIT, modos `git`/`dir`/`stdin`, `--baseline-path`, formato de
  fingerprint do `.gitleaksignore`, allowlists no `gitleaks.toml`. Fingerprint e `.gitleaksignore`
  corroborados por teste local.
- GitHub Docs — secret scanning grátis em repositório público; push protection GA e grátis para
  repositórios públicos (changelog 2023-05-09 + blog "Push protection is generally available").
- DeepWiki `gitleaks/gitleaks-action` §Legal & Licensing — licença exigida só para contas de
  organização. Corroborado pelo código (`shouldValidate = false` para `type: "User"`).

### Tertiary (LOW confidence)

- Issues do `gitleaks` sobre falsos-positivos de `generic-api-key` (#1052, #1321, #1578) — contexto
  qualitativo sobre o comportamento da regra; não sustenta nenhuma afirmação específica deste
  documento (as afirmações vieram de medição direta).

---

## Metadata

**Confidence breakdown:**

- **Standard stack:** HIGH — nenhum pacote novo; a action foi auditada pelo código-fonte, não pelo
  README; versões e SHAs vieram da API do GitHub.
- **Comportamento do gitleaks neste repositório:** HIGH — medido em duas versões, com scan de
  histórico completo, scan por commit, `dir` mode, `.gitleaksignore` e `gitleaks:allow`, mais um
  commit de simulação criado e revertido.
- **Inventário de variáveis de ambiente:** HIGH — grep exaustivo em `backend/src/`, cruzado com o
  `.env.example` e com as chaves reais do `.env` local (só nomes).
- **Ordem de boot / padrão de validação:** HIGH — derivada da leitura direta de `index.js`, `db.js`,
  `secret.js`; `npm run` não definir `NODE_ENV` foi verificado por execução.
- **Migração da senha SMTP:** HIGH nos pontos de toque (4, não 2 — o `routes/config.js:51` estava
  faltando no CONTEXT.md) e na ordem obrigatória; MEDIUM no código exato, que ainda não foi executado.
- **Pitfall 1 (dotenv/PM2):** HIGH no mecanismo (`cwd` ≠ caminho do `.env`; dotenv silencioso — ambos
  verificados); **MEDIUM no impacto real**, porque depende do conteúdo do `.env` de produção, que não
  é inspecionável daqui. É por isso que existe o checkpoint humano.
- **GitHub Secret Scanning:** HIGH no estado atual (`gh api`) e na conclusão central (não bloqueia
  merge, logo não substitui o gitleaks); MEDIUM na capacidade de detectar este token específico.
- **Gate de cobertura:** HIGH — os números vêm de `c8 --reporter=json-summary`, e a aritmética do
  limite (`N ≤ 10`) é direta.

**Research date:** 2026-07-29
**Valid until:** 2026-08-28 (30 dias). Reverificar antes se: a `gitleaks-action` publicar uma v4,
a política de licença para contas pessoais mudar, o token da Agendor for rotacionado (fecha o
`sec-01` e muda a leitura de CFG-01), ou o `.env` de produção for auditado (resolve A1 e A5).
