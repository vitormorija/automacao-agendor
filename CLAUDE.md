<!-- GSD:project-start source:PROJECT.md -->
## Project

**Automação Agendor — Estabilização & Produção**

Sistema interno que monitora negócios ("deals") parados no CRM Agendor e notifica os responsáveis por e-mail. É composto por um backend Node/Express + SQLite (client da API Agendor, filtros de negócio, agendador cron, envio de e-mail) e um dashboard React (login, negócios parados, histórico, relatórios, configuração). Já está **funcional e em uso**. Esta etapa não constrói produto novo — profissionaliza e prepara o que existe para produção, preservando o comportamento atual.

**Core Value:** Antes de qualquer mudança, existir uma **rede de testes automatizados sobre a lógica crítica de notificação** (quem recebe / quem não recebe). É ela que torna todo o resto — hardening, refatoração, mudanças de segurança — seguro. Se só uma coisa desta etapa der certo, é esta: nunca mais uma regressão silenciosa nas regras de quem é notificado.

### Constraints

- **Processo**: Reorganização incremental — não reescrever o projeto inteiro
- **Processo**: Não alterar comportamento funcional sem teste cobrindo o novo comportamento
- **Processo**: Não misturar refatoração estrutural com novas funcionalidades no mesmo trabalho
- **Processo**: Não remover código sem comprovar que está realmente inutilizado
- **Deploy**: Alvo único de produção via PM2 (`ecosystem.config.js`), single-instance — sem staging, sem escala horizontal
- **Tech stack**: Manter stack atual (Express 4, better-sqlite3 9, React 18, Vite 5); sem trocar frameworks nesta etapa
- **Dados**: SQLite compartilhado para dados de negócio e auth; manter (sem migrar de banco)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

> Linguagens, runtime, frameworks, dependências com versão, configuração e requisitos de plataforma: ver `.planning/codebase/STACK.md` (fonte deste bloco) e os três `package.json`. Abaixo ficam só os fatos que **não** são deriváveis do código nem do manifesto.

- No `.nvmrc` present. Local dev machine resolves Node from custom binaries — per project memory, wrappers in `~/bin/node`/`~/bin/npm` point at `/tmp/node-v22.13.1-darwin-arm64/bin/`. In this environment `node -v` resolves to v25.9.0 (PATH-dependent, not pinned by any config file).
- `node:test` nativo (Node >= 20) + `c8` para cobertura — backend. Scripts: `npm test` (`node --test`) e `npm run test:coverage`. Gate de cobertura ativo em `backend/.c8rc.json` (`check-coverage: true`, `per-file: false`). **Use a suíte e os gates configurados no repositório como fonte de verdade** — não registrar aqui contagem de testes, de arquivos nem pisos de cobertura: são valores voláteis que envelhecem a cada fase. Cada arquivo de teste roda em **processo próprio** — é a unidade de isolamento para variações de ambiente. Frontend não tem testes: seu gate é `vite build`.
- Secrets existence noted only: `backend/.env` is present on disk (970 bytes) — contents not read per policy.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

> Naming patterns, import organization, function design e module design: ver `.planning/codebase/CONVENTIONS.md` (fonte deste bloco) — são deriváveis lendo `backend/src/` e `frontend/src/`. Abaixo ficam só as convenções cuja **razão** não está no código.

## Code Style
- Formatação via **Biome** (`biome.json` na raiz do repo, cobrindo backend CJS e frontend ESM): `npm run format` = `biome format --write .`. Não há Prettier — não introduzir um segundo formatador.
- No trailing semicolons dropped consistently — semicolons ARE used throughout backend `.js` files; frontend `.jsx` largely omits semicolons at statement ends (`frontend/src/App.jsx`, `frontend/src/components/Dashboard.jsx`). Match the existing style per file/directory rather than imposing one convention repo-wide.
- 2-space indentation throughout both backend and frontend.
- Single quotes preferred for strings; template literals used heavily for interpolation (especially HTML email bodies in `backend/src/emailer.js`).
- Lint via **Biome** (mesmo `biome.json` da raiz; não há ESLint): `npm run lint` = `biome lint .`, presente em `backend/package.json` e `frontend/package.json`.
- O lint **é** verificado automaticamente: roda no CI (`.github/workflows/ci.yml`) e é status check obrigatório para mesclar na `main`. O baseline é deliberadamente tolerante a warnings — regras que exigiriam mudança de código foram rebaixadas a `warn` para que `npm run lint` saia 0 no código atual (44 warnings no backend, 60 no frontend). Corrigir esses warnings é trabalho de fases futuras, com teste cobrindo qualquer mudança de comportamento.
- CSS está fora do escopo do Biome — o parser aborta no `@apply` do Tailwind.
## Error Handling
- Express routes wrap async work in `try/catch` and respond with `{ ok: false, message: '...' }` (Portuguese, user-facing) on failure, or `{ error: '...' }` from the global error middleware — the two response shapes coexist (`ok`/`message` in route handlers vs `error` in `backend/src/index.js`'s catch-all middleware). Follow whichever shape the specific route file already uses.
- A global error-handling middleware in `backend/src/index.js` catches uncaught route errors, logs full stack to `logs/error.log`, and returns a generic message in production (`err.status || 500`) — never leaks stack traces to the client when `NODE_ENV=production`.
- Network-flaky operations (SMTP send, Agendor API paging) use manual retry loops with exponential-ish backoff: `sendMailWithRetry()` in `backend/src/emailer.js` (3 attempts, 3s/6s wait) and `fetchDealsPage()` in `backend/src/agendor.js` (3 attempts, 5s/10s/15s wait, specifically on HTTP 429).
- Silent-catch pattern (`catch (_) {}` or `catch {}`) used deliberately for non-critical/idempotent operations: migration `ALTER TABLE` statements in `backend/src/db.js` (columns may already exist), `closeDb()` (already closed), auth token parsing in `frontend/src/App.jsx`. When adding new idempotent operations, follow this pattern rather than adding new error propagation paths.
- Auth failures never reveal whether a username exists (`backend/src/routes/auth.js` `forgot-password` handler always returns `{ ok: true }` regardless of whether the account was found) — preserve this behavior for any new auth-adjacent endpoint.
- `fetch` calls wrapped in `try/catch` with `catch {}` (silently swallow) or a `toast.error(...)` call to surface failure to the user — see `fetchStatus()` vs `checkOnly()` in `frontend/src/components/Dashboard.jsx`. Non-critical background refreshes use silent catch; user-initiated actions (buttons) surface errors via `react-hot-toast`.
- `react-hot-toast`'s `toast.loading(...)` + `{ id: toastId }` pattern is used for any async action triggered by a button click, updating the same toast to success/error on completion (`checkOnly`, `sendNow` in `Dashboard.jsx`).
## Logging
- In development, logs plain text: `${time} [${level}] ${message}`. In production (`NODE_ENV=production`), logs single-line JSON: `{ time, level, message }` — designed for log aggregation.
- Level controlled by `LOG_LEVEL` env var, defaults to `info`.
- Errors passed as `Error` objects are automatically expanded to `.stack` (or `.message` if no stack) inside `emit()`.
- Use `logger.info/warn/error/debug(...)` for all new backend code — do NOT use raw `console.log`/`console.error` in new modules. NOTE: some existing modules still use raw `console.*` directly (`agendor.js`, `emailer.js`, `routes/track.js`, `index.js`) — this is legacy and should not be replicated in new code; prefer `require('./logger')`. `logger.js` é o *sink* final e usa `console.*` por construção. Para o inventário corrente dos módulos afetados, ver `.planning/codebase/CONVENTIONS.md` §Logging e a fase corrente do `.planning/ROADMAP.md` — não fixar aqui referências por número de linha.
- HTTP access logs are handled separately via `morgan` (not the custom logger): `combined` format written to `logs/access.log` in all environments, plus `dev` format to console outside production (`backend/src/index.js`).
- Log messages prefixed with a bracketed module tag in Portuguese, e.g. `[Scheduler]`, `[Auth]`, `[Emailer]`, `[Agendor]` — follow this tagging convention for any new logger call so log lines remain greppable by subsystem.
## Comments
- Comments are written in Portuguese throughout, matching all user-facing strings and log messages.
- Section-header comments use a distinctive box-drawing style to delimit logical blocks within a file: `// ── Section Name ──────────────────────`  (see `backend/src/index.js`, `backend/src/routes/auth.js`, `backend/src/db.js`). Use this style when adding a new logical section to an existing file that already uses it.
- Business-rule rationale is documented inline immediately above the code it explains, not in a separate doc — e.g. the `NO_OWNER_NOTIFY_FUNNELS` explanation in `backend/src/agendor.js` explains *why* the Beefor funnel is excluded, not just *what* the code does. Follow this "explain the why" style for any non-obvious business rule.
- Security-sensitive code is heavily commented to explain the threat being mitigated, e.g. `backend/src/secret.js` (why no fallback for `JWT_SECRET`), `backend/src/routes/auth.js` (why rate limiting, why the `forgot-password` response is always generic).
<!-- GSD:conventions-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!--
  SEÇÃO MANTIDA À MÃO — deliberadamente FORA de qualquer par de marcadores GSD.
  Todo bloco delimitado por marcadores acima é reescrito por geradores
  (`/gsd-map-codebase`, `generate-claude-profile`). Regras humanas ficam aqui
  para sobreviver a essas regenerações. Não mover para dentro de um bloco gerado.
-->
## Regras de Trabalho e Convenções (mantidas à mão)

### Processo
- Faça commits pequenos, independentes e reversíveis. Não misture refatoração estrutural com alteração de comportamento. *(Também registrado em `.planning/PROJECT.md` §Constraints — fonte de verdade.)*

### Código
- Novas rotas devem seguir o formato de resposta adotado pelas rotas irmãs do mesmo arquivo, respeitando o contrato canônico definido para a fase.
- Módulos backend devem exportar sua API pública em um único `module.exports` ao final do arquivo.
- Funções com três ou mais parâmetros relacionados devem preferir um objeto de parâmetros desestruturado.
- Helpers internos não devem ser exportados; exponha somente a API pública necessária.
- Para elementos pequenos e exclusivos de uma única tela, prefira manter o componente próximo ao consumidor em vez de criar arquivos desnecessários.
