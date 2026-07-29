# Phase 3: Config & Segredos por Ambiente - Context

**Gathered:** 2026-07-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase define **de onde vêm os valores de configuração, quais são obrigatórios, e como o sistema
se recusa a subir mal configurado**. Entrega CFG-01 a CFG-04: nenhum segredo no código, `.env.example`
completo, separação dev/prod formalizada, e boot que falha rápido com mensagem clara.

**Estado de partida (levantado no scout, importante para o planner):** o código **já** lê tudo de
`process.env` — não há segredo hardcoded em `HEAD`. `JWT_SECRET` já falha rápido sem fallback
(`backend/src/secret.js`). `.env` e `*.db` já estão no `.gitignore`. Ou seja, boa parte de CFG-01 já
está satisfeita; o trabalho real desta fase está em (a) tirar a senha SMTP do banco, (b) estender o
fail-fast para além do JWT, (c) completar o `.env.example`, e (d) automatizar a varredura de segredos.

**Fora do escopo (fronteiras explícitas):**
- Alterar `requireAdmin()` para falhar fechado — é Fase 6 (hardening). Esta fase só torna
  `ADMIN_USERS` obrigatória no boot.
- Mover o JWT de `localStorage` para cookie httpOnly, CSP — Fase 6.
- Timeouts de HTTP/SMTP e TTL de cache — Fase 4.
- Migrar `console.*` para `logger` — Fase 5.

</domain>

<decisions>
## Implementation Decisions

### Fonte de verdade das credenciais SMTP (CFG-01)
- **D-01:** **Híbrido.** Apenas `smtp_pass` sai da tabela `config` e passa a vir **exclusivamente** de
  `process.env.SMTP_PASS`. Host, porta, usuário, remetente e demais ajustes continuam no banco e
  editáveis pela UI. Racional: preserva a autonomia operacional (trocar servidor de e-mail sem
  redeploy) e remove do banco — e portanto de todo backup diário em `/opt/agendor/backups` — a única
  chave que é de fato um segredo. Rejeitado "tudo no ambiente" (perderia a edição pela UI, tornando
  qualquer ajuste de SMTP um deploy) e "manter tudo no banco" (deixaria CFG-01 com ressalva permanente).
- **D-02:** **Migração defensiva e idempotente no boot.** A coluna `smtp_pass` da tabela `config` só é
  zerada **se** `process.env.SMTP_PASS` estiver presente e não-vazio. Se não estiver, o valor antigo é
  preservado e um aviso é logado. Racional: evita o cenário de derrubar o envio de e-mail em produção
  por um `.env` esquecido no deploy, ao custo de poucas linhas.
- **D-03:** **UI:** o campo de senha SMTP é **removido** do formulário em `ConfigPanel.jsx`, substituído
  por uma nota curta indicando que o valor vem de `SMTP_PASS`. Rejeitado campo desabilitado (ocuparia
  espaço com um controle que nunca faz nada).
- **⚠ D-01/D-02/D-03 mudam comportamento.** Pela constraint do projeto, **exigem teste cobrindo o novo
  fluxo** antes de entrar: no mínimo (a) `emailer` lê a senha do env e não do banco, (b) a migração não
  apaga quando o env está ausente, (c) a migração apaga quando o env está presente.

### Escopo do fail-fast no boot (CFG-04)
- **D-04:** Obrigatórias = **funcionamento + segurança**: `AGENDOR_TOKEN`, `JWT_SECRET`, `SMTP_PASS`,
  `ALLOWED_ORIGINS`, `ADMIN_USERS`. As demais (`PORT`, `LOG_LEVEL`, `DB_PATH`, `STALE_DAYS`,
  `BASE_URL`, …) mantêm default sensato e fallback. Rejeitado exigir todas as 18 (burocracia sem ganho).
- **D-05:** **Rigor escalonado por ambiente.** Em `NODE_ENV=production` a ausência **derruba o boot**;
  em desenvolvimento vira **aviso no log** e o processo sobe. Racional: permite rodar o dashboard
  localmente para mexer no frontend sem credenciais reais. A Fase 1 já neutraliza `SMTP_PASS`/
  `ADMIN_EMAIL` no setup de testes, então a suíte não é afetada.
- **D-06:** A validação deve seguir o padrão já estabelecido em `backend/src/secret.js` — falha no
  carregamento do módulo, com mensagem em PT explicando **qual** variável falta e **como** gerar/obter
  o valor. Centralizar num único módulo de config em vez de espalhar checagens.
- **⚠ Fronteira com a Fase 6:** exigir `ADMIN_USERS` no boot fecha por *configuração* o buraco descrito
  em `.planning/codebase/CONCERNS.md` (hoje `ADMIN_USERS` vazio faz `requireAdmin()` liberar geral).
  Mas o `requireAdmin()` continua **falhando aberto** no código — corrigir isso é Fase 6, não aqui.

### Separação dev vs produção (CFG-03)
- **D-07:** **Um `.env` único por máquina, `NODE_ENV` decide.** Formaliza o mecanismo que o código já
  usa (rigor do boot, formato de log, CSP, serving estático do frontend). O `.env.example` ganha
  comentários marcando explicitamente o que muda entre dev e prod. Rejeitados arquivos `.env.development`
  /`.env.production` versionados — exigiriam mudar o carregamento do dotenv e criariam risco novo de
  alguém colocar segredo real em arquivo versionado. Alvo é single-instance, sem staging.

### Prova de "zero segredos" (CFG-01)
- **D-08:** **`gitleaks` como action no CI**, não script próprio. Regras mantidas pela comunidade,
  cobrem muito mais formatos do que uma regex caseira. Aceita-se a dependência externa no pipeline e
  algum falso-positivo a calibrar. Rejeitada verificação manual — foi exatamente assim que o token
  atual entrou sem ninguém perceber.
- **D-09:** Como CI-02 já está ativo (Fase 2), o check do gitleaks deve virar **gate real**: PR com
  segredo detectado é barrado antes do merge. O planner deve decidir se entra como job novo em
  `ci.yml` ou step dentro de um job existente — e, se for job novo, lembrar que o **contexto precisa
  ser adicionado aos required status checks** da branch protection (ver `deploy/branch-protection.md`).

### `.env.example` (CFG-02)
- **D-10:** O arquivo já existe e está bem estruturado, mas **incompleto**: o código lê 18 variáveis e
  faltam três — `DB_PATH`, `LOG_LEVEL` e `BASE_URL_FRONTEND`. Completar, sem valores sensíveis, e
  marcar quais são obrigatórias (D-04) e quais mudam entre dev e prod (D-07).

### Decisões adicionais pós-pesquisa (2026-07-29)
- **D-11:** **Habilitar o GitHub Secret Scanning nativo, incluindo push protection.** Os 4 toggles
  estão desabilitados hoje (verificado via `gh api`) e são gratuitos em repositório público. É camada
  **complementar**, não substituta: o Secret Scanning age *antes* (recusa o push), o gitleaks age
  *depois* (barra o merge) — e só o gitleaks vira status check, que é o que a branch protection exige.
  Contrapartida aceita: abrirá alerta permanente sobre o token não rotacionado do `sec-01`.
- **D-12:** **Remover `STALE_DAYS` do `.env.example`.** Nenhum código lê essa variável — o valor real
  de `stale_days` vem da tabela `config` (default `'15'`). Manter a linha é documentação que mente.
  Rejeitado fazer o código passar a lê-la: seria mudança de comportamento e ampliaria o escopo.
- **D-13 (ordenação, derivada do RESEARCH — NÃO É OPCIONAL):** corrigir o carregamento do `dotenv`
  e **verificar o `.env` de produção via checkpoint humano bloqueante** ANTES da task que liga o
  fail-fast. `backend/src/index.js:1` faz `require('dotenv').config()` sem `path`, resolvendo a partir
  do `process.cwd()`; `ecosystem.config.js:6` define `cwd: '/opt/agendor'` mas o arquivo está em
  `/opt/agendor/backend/.env`. O dotenv **falha em silêncio** (`{ error: ENOENT }`, não lança).
  Ligar o `throw` antes de corrigir isso derruba produção no próximo `pm2 restart`. Confirmado
  também que o `.env` local não tem `ALLOWED_ORIGINS` nem `ADMIN_USERS`.
- **D-14 (ordenação, derivada do RESEARCH — NÃO É OPCIONAL):** o job `secrets` do gitleaks precisa
  ser **mesclado na `main` antes** de ser adicionado aos required status checks. Inverter trava o
  merge permanentemente: com `enforce_admins: true`, um contexto exigido que ainda não existe nunca
  fica verde e não há como destravar.
- **D-15:** CFG-01 **não** é provado só pelo gitleaks — ele não detecta a exposição do token em
  headers `Authorization: Token` (medido nos três modos de scan). A prova de CFG-01 exige também um
  `git grep` escopado, documentado, como verificação independente.

### Claude's Discretion
- Formato exato da mensagem de erro de boot (desde que diga qual variável e como obter o valor).
- Se o gitleaks entra como job próprio ou step de job existente em `ci.yml`.
- Onde mora o módulo centralizado de validação de config (novo `backend/src/config.js` vs estender
  `backend/src/secret.js`).
- Texto exato da nota que substitui o campo de senha no `ConfigPanel.jsx`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requisitos
- `.planning/ROADMAP.md` §"Phase 3: Config & Segredos por Ambiente" — goal e os 4 success criteria.
- `.planning/REQUIREMENTS.md` — CFG-01 a CFG-04 (linhas 29-34; tabela de rastreabilidade linhas 117-120).

### Segurança — achado desta fase (LER PRIMEIRO)
- `.planning/todos/pending/sec-01-rotate-agendor-token.md` — **token real da API Agendor exposto no
  histórico de um repositório público.** Contém o que resolve, o que não resolve (reescrita de
  histórico; tornar privado) e a decisão registrada de adiar a rotação. Contexto obrigatório para
  qualquer trabalho de segredos nesta fase.

### Estado atual do código (o que a fase precisa mudar)
- `backend/src/secret.js` — padrão de fail-fast já estabelecido; D-06 manda seguir este modelo.
- `backend/src/db.js:103-115` — `defaults` da tabela `config`, onde `smtp_pass` é semeado a partir do
  env. Ponto exato da mudança de D-01/D-02.
- `backend/src/emailer.js` — consome a config SMTP do banco; precisa passar a ler `SMTP_PASS` do env.
- `frontend/src/components/ConfigPanel.jsx` — formulário com o campo de senha a ser removido (D-03).
- `backend/.env.example` — já existe, faltam 3 variáveis (D-10).
- `.gitignore` linhas 5-6, 9-10 — `.env`, `.env.*`, `*.db` já ignorados (nada a fazer).

### Riscos e restrições herdadas
- `.planning/codebase/CONCERNS.md` §"Security Considerations" — o fail-open de `ADMIN_USERS` em
  `requireAdmin()` (fronteira com Fase 6) e o JWT em `localStorage`.
- `.planning/PROJECT.md` §Constraints — "não alterar comportamento funcional sem teste cobrindo o novo
  comportamento"; aplica-se diretamente a D-01/D-02/D-03.
- `deploy/branch-protection.md` — runbook dos required status checks; relevante se D-09 criar um job novo.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/secret.js`: padrão de validação fail-fast no carregamento do módulo, com mensagem em PT
  e instrução de como gerar o valor. É o molde para o módulo de config de D-06.
- Rede de testes da Fase 1 (`backend/test/`, 35 testes): a proteção que torna seguras as mudanças
  comportamentais de D-01/D-02/D-03. `backend/test/setup.js` já neutraliza `SMTP_PASS`/`ADMIN_EMAIL`.
- Gate de CI da Fase 2: `ci.yml` + branch protection ativa — a infraestrutura onde D-08/D-09 se encaixam
  sem precisar construir nada novo.

### Established Patterns
- Config runtime vive na tabela `config` do SQLite (chave-valor string), semeada do env no primeiro boot
  e editável pela UI. D-01 abre a **primeira exceção deliberada** a esse padrão — o planner deve
  documentar a exceção no código, não deixá-la implícita.
- Módulos backend exportam um único `module.exports = { ... }` no fim; comentários em PT; seções
  demarcadas por `// ── Nome ──`.
- `catch {}` silencioso é usado deliberadamente para operações idempotentes (migrações `ALTER TABLE`
  em `db.js`) — a migração de D-02 deve seguir esse padrão.

### Integration Points
- **Boot** (`backend/src/index.js`): onde a validação centralizada de D-04/D-05 precisa rodar, antes de
  o servidor começar a escutar.
- **Seed da config** (`backend/src/db.js`): onde a migração de D-02 roda, junto das migrações existentes.
- **Envio de e-mail** (`backend/src/emailer.js`): onde a senha passa a ser lida do env.
- **CI** (`.github/workflows/ci.yml`): onde o gitleaks de D-08 entra.

</code_context>

<specifics>
## Specific Ideas

- A migração de D-02 deve ser **condicional e reversível na prática**: só apaga se o env estiver
  presente. A intenção declarada é que um `.env` incompleto no deploy nunca derrube o envio de e-mail.
- A mensagem de erro de boot precisa dizer **qual** variável falta e **como** obter o valor — seguindo
  o exemplo de `secret.js`, que sugere `openssl rand -hex 32` para o `JWT_SECRET`.

</specifics>

<deferred>
## Deferred Ideas

- **Rotação do token da API Agendor** — decisão consciente de adiar, mantendo o repositório público
  para preservar o gate de CI-02. Rastreado em `.planning/todos/pending/sec-01-rotate-agendor-token.md`.
  Não é trabalho de código; é ação operacional no painel da Agendor.
- **`requireAdmin()` falhar fechado** — Fase 6. Esta fase só torna `ADMIN_USERS` obrigatória no boot.
- **JWT em `localStorage` → cookie httpOnly; habilitar CSP** — Fase 6.
- **GitHub Pro para ter repositório privado com gate de merge** — avaliado e descartado nesta sessão;
  registrado caso a política de visibilidade do repositório mude no futuro.

</deferred>

---

*Phase: 3-Config & Segredos por Ambiente*
*Context gathered: 2026-07-29*
