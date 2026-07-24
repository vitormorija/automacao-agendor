# Phase 2: Toolchain de Qualidade & CI - Research

**Researched:** 2026-07-24
**Domain:** Dev toolchain (lint/format via Biome), GitHub Actions CI, branch protection, c8 coverage gating, characterization testing (node:test)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 … D-11)
- **D-01:** Biome como ferramenta ÚNICA de lint **e** format (ESLint+Prettier rejeitados). Uma devDependency, config única, mais rápido. Cobertura menor de plugins React é aceitável.
- **D-02:** Config única `biome.json` na **raiz**, cobrindo backend + frontend. Estilo: `indentStyle: space`, `indentWidth: 2`, `quoteStyle: single`. Split por-pacote só se o planner comprovar necessidade real (default = raiz única).
- **D-03:** Scripts `"lint"` e `"format"` presentes em **ambos** `package.json`. `test` já existe no backend; frontend sem testes nesta fase (gate = build) — `test` no frontend fica no-op documentado ou ausente (planner decide).
- **D-04:** **Formatar agora, lint em warn.** Rodar `biome format --write` UMA vez sobre o código existente num **commit de formatação isolado** (só whitespace/estilo — comportamento zero).
- **D-05:** **Guard obrigatório:** logo após o commit de formatação, rodar `cd backend && npm test` e confirmar **28/28 verde**. Se quebrar, investigar antes de prosseguir.
- **D-06:** Regras de lint que exigiriam mudança de código entram como **`warn`** (baseline documentado, não falham CI). Só sobem para **`error`** as regras que o código atual **já** satisfaz. `npm run lint` fica **verde no estado atual**.
- **D-07:** **GitHub Actions**, um `.github/workflows/ci.yml`, disparado em `pull_request` e `push`.
- **D-08:** **Dois jobs paralelos** — `backend` e `frontend`.
  - `backend`: checkout → setup-node (Node **20**) → `npm ci` → `biome lint` (escopo backend) → `npm test` (+ coverage report).
  - `frontend`: checkout → setup-node (Node **20**) → `npm ci` → `biome lint` (escopo frontend) → `npm run build`.
- **D-09:** Fixar **Node 20 LTS** no CI. Matrix 20+22 rejeitada. Cache npm do setup-node fica a critério do planner.
- **D-10:** Checks `backend` e `frontend` como **required status checks** na branch protection da `main` (UI ou `gh api`). Como é config de repo (não versionada), **documentar passo-a-passo exato** no runbook.
- **D-11:** **Verificar CI-02** com um PR de falha proposital — confirmar merge **barrado**.

### Claude's Discretion
- Cache de npm no `setup-node` (ligar ou não).
- Conjunto exato de regras `error` vs `warn` no baseline (desde que CI verde no estado atual).
- Escopo/ignore do Biome (`frontend/dist/`, `coverage/`, `node_modules/`, fixtures).
- Scripts agregadores na raiz vs CI chamar cada pacote diretamente.
- Presença/forma do script `test` no frontend (no-op documentado vs ausente).

### Deferred Ideas (OUT OF SCOPE)
- Testes automatizados de frontend (unit/component) — gate do frontend aqui é `vite build`.
- Matrix multi-Node (20+22).
- Fixes de lint que alterem comportamento (promover `warn`→`error` que exige mudança de código) — só com teste do novo fluxo, em fase apropriada.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUAL-01 | Linter em backend e frontend, script `lint` executável, regras versionadas; zero erros no estado atual (ou baseline documentado) | Biome 2.5.5 `biome.json` na raiz + `linter.rules.recommended` com overrides para `warn`; ver Standard Stack + Code Examples |
| QUAL-02 | Formatador com script `format` e config versionada | Mesmo `biome.json` (`formatter` + `javascript.formatter`); `biome format --write`; commit de formatação isolado (D-04/D-05) |
| QUAL-03 | Scripts npm padronizados (`lint`, `format`, `test`) em backend e frontend | Editar os dois `package.json`; ver "Scripts padronizados" abaixo |
| CI-01 | CI roda lint + testes + build a cada PR | `.github/workflows/ci.yml`, 2 jobs paralelos (skeleton em Code Examples) |
| CI-02 | CI bloqueia merge quando lint/teste/build falham | Required status checks via `gh api` (branch protection) + PR de falha proposital |
| WR-02 (folded) | Caracterização de `getDealsWithFutureTasks` (0% coberto) | Casos + padrão de teste em "WR-02 Characterization Test" |
| WR-03 (folded) | Thresholds de cobertura c8 no CI (report-first → blocking após WR-02) | `.c8rc.json` `check-coverage`; ver "Coverage Gating (WR-03)" |
</phase_requirements>

## Summary

Esta fase é puramente de **toolchain e automação** — não muda comportamento de runtime do produto. O trabalho concreto é: (1) adicionar Biome 2.5.5 como devDependency e uma única `biome.json` na raiz; (2) rodar um passe de formatação isolado, guardado pela suíte da Fase 1; (3) padronizar scripts nos dois `package.json`; (4) escrever um workflow de CI com dois jobs paralelos; (5) travar merge na `main` via required status checks; (6) fechar as duas dívidas da revisão da Fase 1 (WR-02 teste de caracterização, WR-03 gate de cobertura).

O ambiente coopera bem: `gh` CLI 2.92 autenticado, remote GitHub presente, Node 22.13.1 local (wrappers em `~/bin`), c8 12 já instalado, e um helper `installFakeAxios` reutilizável já existe. Biome distribui binários pré-compilados por plataforma via `optionalDependencies` (macOS-arm64 local e linux-x64 no CI ambos cobertos por `npm ci`), sem postinstall script — instalação limpa e determinística nos dois ambientes.

O único ponto de sequenciamento delicado é WR-03: o threshold **bloqueante** de cobertura só deve ser ligado **depois** que WR-02 fecha a lacuna de `getDealsWithFutureTasks` (0% hoje) — senão o gate falharia pela lacuna já mapeada. Até lá, cobertura roda como **report**.

**Primary recommendation:** Instalar `@biomejs/biome@2.5.5` (pinado, `-D -E`) como devDependency em **ambos** os `package.json`, com **uma** `biome.json` na raiz (`root: true`); scripts `biome lint .` / `biome format --write .` em cada pacote resolvem a config subindo a árvore. CI com 2 jobs (`working-directory: backend|frontend`, `npm ci`, `biome lint .`, e `npm run test:coverage`/`npm run build`). Required checks `backend` e `frontend` via `gh api PUT .../branches/main/protection`. WR-02 antes de flipar o threshold do WR-03 para `check-coverage: true`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Lint + format (JS/JSX/CJS/ESM) | Dev toolchain (Biome CLI) | — | Roda local (scripts npm) e no CI; não é código de runtime |
| Config de estilo versionada | Repo root (`biome.json`) | — | D-02: fonte única de verdade para os dois pacotes |
| Execução de testes | CI runner + node:test | Local (`npm test`) | Reusa a suíte da Fase 1; sem runner novo |
| Gate de cobertura | CI runner + c8 | `.c8rc.json` (config) | WR-03: c8 já instalado; threshold declarativo |
| Build do frontend | CI runner + Vite | — | Gate do frontend (sem testes nesta fase) |
| Bloqueio de merge | GitHub (branch protection) | Runbook (doc) | Config de repo, não versionada — precisa doc reproduzível (D-10) |
| Caracterização de notificação | node:test + `installFakeAxios` | `agendor.js` (SUT) | WR-02: pina comportamento atual, não altera lógica |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@biomejs/biome` | 2.5.5 | Lint + format único (JS/JSX/CJS/ESM/JSON) | [VERIFIED: npm registry — 11.4M downloads/semana, publicado 2026-07-21, repo oficial github.com/biomejs/biome]. Alinha ao ethos zero-dep (D-01): 1 binário, 1 config |
| `c8` | 12.0.0 | Cobertura V8 sobre `node --test` | [VERIFIED: npm registry] Já é devDependency do backend (Fase 1); WR-03 só ativa `check-coverage` |

### Supporting (GitHub Actions — não são pacotes npm)
| Action | Version | Purpose | When to Use |
|--------|---------|---------|-------------|
| `actions/checkout` | v4 | Clona o repo no runner | Primeiro step de cada job [ASSUMED — confirmar tag major atual] |
| `actions/setup-node` | v4 | Instala Node 20 + cache npm opcional | Fixar `node-version: '20'` (D-09) [ASSUMED — confirmar tag] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Biome (D-01, LOCKED) | ESLint + Prettier | Rejeitado em CONTEXT.md — mais deps, mais lento, config dupla. NÃO re-litigar |
| Biome único root config (D-02) | Config aninhada por-pacote (`extends: "//"`, `root: false`) | Biome 2.x suporta config aninhada monorepo, mas D-02 fixa raiz única. Só usar aninhada se o planner comprovar conflito real CJS vs ESM |
| `npm run test:coverage` no CI | `npm test` + step separado de coverage | Rodar tudo sob c8 numa chamada é mais simples e já habilita o gate WR-03 no mesmo comando |

**Installation (em cada pacote — backend e frontend):**
```bash
export PATH="$HOME/bin:$PATH"        # wrappers Node do projeto (memória)
cd backend  && npm i -D -E @biomejs/biome@2.5.5
cd ../frontend && npm i -D -E @biomejs/biome@2.5.5
```
`-E` pina a versão exata (recomendado pela doc oficial para consistência local↔CI). Instalar nos DOIS pacotes (não na raiz) porque não há workspaces e o CI faz `npm ci` com `working-directory` por pacote — cada job precisa do binário no seu próprio `node_modules`. Isso também satisfaz D-03 (scripts nos dois `package.json`) e faz `cd frontend && npm run lint` funcionar sem instalação na raiz.

**Version verification (executado nesta sessão):**
- `npm view @biomejs/biome version` → `2.5.5` (dist-tag `latest`), `time.modified` = 2026-07-21. [VERIFIED: npm registry]
- `optionalDependencies` inclui `@biomejs/cli-darwin-arm64` (macOS local) e `@biomejs/cli-linux-x64` (CI). [VERIFIED: npm registry]
- Sem `scripts.postinstall`. [VERIFIED: npm view scripts → vazio]
- `c8` latest = `12.0.0` (já pinado no backend). [VERIFIED]

## Package Legitimacy Audit

> slopcheck não estava instalado no ambiente e a instalação foi best-effort. Veredito abaixo baseado em verificação manual de registry + downloads + repo oficial.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@biomejs/biome` | npm | ~2 anos (2023-08-17) | 11.4M/semana | github.com/biomejs/biome | n/a (manual OK) | Approved |
| `c8` | npm | maduro | (já em uso) | github.com/bcoe/c8 | n/a (manual OK) | Approved (pré-existente) |

**Packages removidos por [SLOP]:** none.
**Packages sinalizados [SUS]:** none.
**Postinstall check (Node):** `@biomejs/biome` não tem `postinstall` — sem execução de script no install. Binário resolvido via `optionalDependencies` por plataforma.
**Nota:** o nome `@biomejs/biome` foi confirmado no registry E corresponde ao repo oficial linkado na doc (biomejs.dev). Downloads (11.4M/sem) e idade (2 anos) descartam slopsquat. Ainda assim, o planner pode manter um `checkpoint:human-verify` antes do primeiro `npm i` se quiser rigor máximo — não é bloqueante.

## Architecture Patterns

### System Architecture Diagram

```text
  Desenvolvedor (local)                         GitHub (nuvem)
  ─────────────────────                         ──────────────
  cd backend && npm run lint  ──┐
  cd backend && npm run format  │   git push /
  cd backend && npm test        │   abrir PR          ┌─────────────────────────────┐
  cd frontend && npm run lint ──┘  ───────────────▶   │  Trigger: pull_request+push │
        (mesma biome.json raiz)                        │        ci.yml               │
                                                       └──────────────┬──────────────┘
                                                                      │ (2 jobs paralelos)
                                                    ┌─────────────────┴─────────────────┐
                                                    ▼                                     ▼
                                        ┌───────────────────────┐         ┌───────────────────────┐
                                        │ job: backend          │         │ job: frontend         │
                                        │ working-dir: backend  │         │ working-dir: frontend │
                                        │ setup-node 20         │         │ setup-node 20         │
                                        │ npm ci                │         │ npm ci                │
                                        │ biome lint .          │         │ biome lint .          │
                                        │ npm run test:coverage │         │ npm run build         │
                                        │  (node --test + c8)   │         │  (vite build)         │
                                        └───────────┬───────────┘         └───────────┬───────────┘
                                                    │ status: backend                 │ status: frontend
                                                    └─────────────────┬───────────────┘
                                                                      ▼
                                                    ┌─────────────────────────────────┐
                                                    │ Branch protection (main)         │
                                                    │ required checks: backend+frontend│
                                                    │ falha em qualquer um → merge BLOQ│
                                                    └─────────────────────────────────┘
```

### Recommended Project Structure (arquivos novos/tocados)
```
./
├── biome.json                    # NOVO — config única de lint+format (root: true)
├── .github/
│   └── workflows/
│       └── ci.yml                # NOVO — 2 jobs paralelos
├── backend/
│   ├── package.json              # +scripts lint/format, +devDep biome
│   ├── .c8rc.json                # WR-03: +check-coverage (flip após WR-02)
│   └── test/
│       └── agendor.futureTasks.test.js   # NOVO — WR-02
└── frontend/
    └── package.json              # +scripts lint/format(/test no-op), +devDep biome
```

### Pattern 1: Config Biome única na raiz, escopo por CWD
**What:** Uma `biome.json` na raiz com `root: true`. Cada pacote roda `biome lint .` / `biome format --write .` — o `.` restringe os arquivos ao diretório atual (backend ou frontend), e Biome sobe a árvore para achar a config raiz. Globs de `files.includes` são resolvidos relativos à config (raiz).
**When to use:** Sempre nesta fase (D-02).
**Example:** ver Code Examples → `biome.json`.

### Pattern 2: Format-then-guard (D-04/D-05)
**What:** Um commit isolado que só reformata, imediatamente validado pela suíte da Fase 1.
**Sequência exata:**
1. `biome format --write .` sobre o repo inteiro (a partir da raiz, usando o binário de qualquer um dos pacotes: `backend/node_modules/.bin/biome format --write .`).
2. `git add -A && git commit` — commit SÓ de formatação (nenhuma outra mudança junto).
3. `cd backend && npm test` → confirmar **28/28 verde** (prova de comportamento preservado no backend).
4. Frontend não tem testes → seu guard é `cd frontend && npm run build` passar.
**When to use:** Uma vez, na introdução do Biome.

### Pattern 3: Baseline warn vs error (D-06)
**What:** `linter.rules.recommended: true`, e qualquer regra recomendada que hoje falharia no código é **rebaixada** para `"warn"` em `linter.rules.<grupo>.<regra>`. Resultado: `biome lint` sai com exit 0 (warns não falham por padrão; ver Pitfall 2 sobre `--error-on-warnings` no CI). Regras que o código já satisfaz permanecem em `error` (via `recommended`).
**How:** Rodar `biome lint .` uma vez, coletar os diagnostics que aparecem, e para cada regra ofensora adicionar override `"warn"`. Documentar a lista no PLAN como "baseline".

### Anti-Patterns to Avoid
- **Instalar Biome só na raiz:** quebra o `npm ci` por-pacote do CI (binário ausente em `backend/node_modules`). Instalar nos dois pacotes.
- **Misturar mudança de comportamento no commit de formatação:** viola D-04. O commit de format é whitespace-only.
- **Ligar `check-coverage: true` antes do WR-02:** o gate falharia pela lacuna de `getDealsWithFutureTasks` já mapeada. Ordem: WR-02 → depois WR-03.
- **`biome check` no lugar de `lint`+`format` separados:** `biome check` também aplica organize-imports e pode reordenar `require()`s; o repo tem imports deliberadamente ungrouped e requires inline anti-circular (CLAUDE.md). Preferir `biome lint` (sem fixes automáticos no CI) + `biome format` separados, e considerar desligar `organizeImports`/`assist` no baseline.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Lint + format JS/JSX/CJS/ESM | Config ESLint+Prettier custom | Biome (D-01) | Uma dep, uma config, binário nativo |
| Seleção de binário por plataforma | Scripts de download/detecção de arch | `optionalDependencies` do Biome | npm resolve darwin-arm64 / linux-x64 automaticamente |
| Medição de cobertura | Instrumentação manual | c8 (`check-coverage`) | Já instalado; suporta thresholds declarativos |
| Mock da borda HTTP nos testes | Novo mock framework | `installFakeAxios` existente | Padrão da Fase 1, já reutilizado |
| Bloqueio de merge | Bot/hook custom | GitHub required status checks | Nativo, auditável via `gh api` |

**Key insight:** Todo o valor desta fase vem de **compor ferramentas existentes** (Biome, c8, GitHub Actions, node:test) — não há nada legítimo para escrever à mão aqui além de config declarativa e um arquivo de teste.

## Coverage Gating (WR-03) — detalhe concreto

**Estado atual (`backend/.c8rc.json`):**
```json
{ "all": true, "include": ["src/**/*.js"], "exclude": ["test/**", "src/index.js"], "reporter": ["text", "lcov"] }
```
Report-only — nunca falha o processo. Script `test:coverage` = `c8 --reporter=text --reporter=lcov node --test`.

**Chaves c8 relevantes** [CITED: github.com/bcoe/c8 README]: `check-coverage` (bool), `lines`/`branches`/`functions`/`statements` (número %), `per-file` (bool — aplica o mesmo threshold a CADA arquivo), `--include`/`--exclude` (escopo de medição).

**Limitação a comunicar ao planner:** c8 **não** suporta thresholds diferentes por caminho numa única config. Duas estratégias válidas:
1. **Threshold global modesto (recomendado p/ começar):** `check-coverage: true`, `lines: <N>`, `per-file: false`. Medir a cobertura real DEPOIS do WR-02, escolher N logo abaixo do valor observado nos arquivos de caminho crítico (margem contra flutuação). Mantém `all:true`/`include:src/**` para reporte completo.
2. **Escopo por `--include` aos críticos:** rodar um segundo comando c8 com `--include src/agendor.js --include src/db.js --include src/routes/auth.js` e threshold mais alto — só se o global for estrito demais para arquivos intencionalmente descobertos nesta fase.

**Sequenciamento (report-first → blocking):**
- CI backend job roda `npm run test:coverage` desde o início → **reporta** cobertura (não bloqueia enquanto `.c8rc.json` não tiver `check-coverage`).
- Depois que WR-02 fecha a lacuna de `getDealsWithFutureTasks`, adicionar `check-coverage: true` + threshold ao `.c8rc.json` → o mesmo comando passa a **bloquear** (exit ≠ 0 abaixo do threshold), e o CI vira gate.
- Não precisa mudar o CI entre as duas etapas: o comando é o mesmo; só o `.c8rc.json` muda.

## WR-02 Characterization Test — detalhe concreto

**SUT:** `getDealsWithFutureTasks()` em `backend/src/agendor.js:173-204`. Comportamento ATUAL a pinar (ler o código):
- Usa `now = new Date()` e `yesterday = now - 24h` como `dueDateGt`.
- Pagina `GET /tasks` com `per_page: 100, page`; lê `data.data || []`.
- Para cada task: inclui `t.deal.id` no `Set` **sse** `!t.finishedAt` **E** `t.deal?.id` presente **E** `new Date(t.dueDate) > now` (comparação **estrita** `>`).
- **Break** quando `tasks.length === 0` OU `tasks.length < 100` (fim da paginação). Incrementa `page++` só quando exatamente 100.
- `catch` interno → `console.error` + `break` (não propaga).
- Retorna um `Set` de deal ids.

**Padrão a espelhar (idêntico a `agendor.getStaleDeals.test.js`):**
- `require('./setup')` no topo.
- `installFakeAxios(routeHandler)` **antes** de `require('../src/agendor')` (a instância `api` é criada no load).
- routeHandler para `/tasks` retorna `{ data: { data: <arrayDeTasks> } }` (envelope Agendor). Ramificar por `config.params.page` para simular páginas.
- `mock.timers.enable({ apis: ['Date'], now: FIXED_NOW })` em `before`, `mock.timers.reset()` em `after` — relógio fixo para tornar `dueDate` futuro/passado determinístico (mesmo padrão do golden de getStaleDeals).
- Fixture: pode ser inline no teste ou em `test/fixtures/synthetic/tasks-page.json` (segue `deals-page.json`).

**Casos exatos (caracterização — pinar, não corrigir):**
| # | Setup da task | Esperado |
|---|---------------|----------|
| a | `finishedAt: null`, `dueDate` no FUTURO (> FIXED_NOW), `deal.id: X` | `Set` contém `X` |
| b | `finishedAt: <data>` (finalizada), `dueDate` futuro, `deal.id: Y` | `Y` **ausente** (excluída) |
| c | `finishedAt: null`, `dueDate` no PASSADO (< FIXED_NOW), `deal.id: Z` | `Z` **ausente** (excluída) |
| c2 (opcional, blindagem `>` estrito) | `finishedAt: null`, `dueDate === FIXED_NOW` exato, `deal.id: W` | `W` **ausente** (`>` estrito exclui igualdade) |
| d | Página 1 = **100** tasks (incl. deal `P1`), página 2 = **<100** tasks (incl. deal `P2`) | Ambos `P1` e `P2` no `Set`; `api.get` chamado **2×**; para na página 2 |
| e (opcional) | Task sem `deal.id` | não adiciona nada (guard `t.deal?.id`) |

Asserções via `node:assert/strict`: `assert.equal(result.has(X), true)`, `assert.equal(result.has(Y), false)`, e para o caso (d) `assert.equal(fakeInstance.get.mock.callCount(), 2)` (o helper retorna a `fakeInstance` com `get` sendo um `mock.fn`).

**Restrição:** é caracterização — se algum caso revelar comportamento "estranho" (ex.: `>` estrito), **pinar como está**, não corrigir (mesma disciplina do quirk beefor da Fase 1).

## Common Pitfalls

### Pitfall 1: Binário do Biome ausente no job do CI
**What goes wrong:** Biome instalado só na raiz → `npm ci` em `working-directory: backend` não o traz → `biome: command not found`.
**Why:** Sem workspaces; cada pacote tem seu `node_modules`.
**How to avoid:** devDep de Biome em backend E frontend (§Installation).
**Warning signs:** CI falha no step de lint com "command not found" mesmo com biome.json presente.

### Pitfall 2: Warnings do baseline não devem falhar o CI — mas exit code pode surpreender
**What goes wrong:** Espera-se que warns (D-06) não falhem, mas se o CI usar `biome ci` ou passar `--error-on-warnings`, warns viram falha.
**Why:** `biome ci` é otimizado para CI e pode ter severidade mais estrita; flags de "error on warnings" existem.
**How to avoid:** No CI usar `biome lint .` (não `biome ci`) para o baseline warn-tolerante; NÃO passar `--error-on-warnings`. Confirmar exit 0 com warns presentes antes de fechar a fase.
**Warning signs:** CI vermelho no primeiro run apesar de "só warnings" localmente.

### Pitfall 3: Nome do status check ≠ id do job
**What goes wrong:** Required check configurado como `backend` mas o job tem `name:` diferente → o check nunca "casa" e a proteção não trava (ou trava pendente pra sempre).
**Why:** O contexto do status check do Actions = display name do job (o `name:` se definido, senão o id).
**How to avoid:** Deixar os jobs SEM `name:` custom (id = `backend`/`frontend` vira o contexto) OU definir `name: backend`/`name: frontend` explicitamente igual ao required check. Validar com o PR de falha proposital (D-11).
**Warning signs:** Merge liberado mesmo com CI vermelho, ou PR preso em "Expected — waiting for status".

### Pitfall 4: `biome format` reordenando imports / mexendo em semântica
**What goes wrong:** `biome check` (ou `organizeImports`/`assist` ligado) reordena `require()`s — o repo tem imports ungrouped deliberados e requires inline anti-circular (CLAUDE.md).
**Why:** Organize-imports é opinativo.
**How to avoid:** Usar `biome format` (não `check`) e desligar `assist`/organize-imports no baseline. O commit de format deve ser whitespace/estilo only (D-04).
**Warning signs:** `git diff` do commit de formatação mostra linhas de `require` movidas — parar e reconfigurar.

### Pitfall 5: Timers reais tornam o teste WR-02 flaky
**What goes wrong:** Sem `mock.timers`, `new Date()` real faz `dueDate` "futuro/passado" depender do relógio de execução.
**How to avoid:** Fixar o relógio com `mock.timers.enable({ apis: ['Date'], now: FIXED_NOW })` (padrão do getStaleDeals test).

## Code Examples

### `biome.json` (raiz) — proposta de baseline
```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "root": true,
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "includes": [
      "**",
      "!**/node_modules",
      "!**/dist",
      "!**/coverage",
      "!backend/agendor.db",
      "!backend/test/fixtures/**"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": { "quoteStyle": "single" }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
      // baseline D-06: para CADA regra recomendada que o código atual viola,
      // adicionar override "warn" aqui, ex.:
      // "suspicious": { "noDoubleEquals": "warn" },
      // "style":      { "noParameterAssign": "warn" }
    }
  },
  "assist": { "enabled": false }
}
```
> Fontes: schema `$schema` via node_modules e URL versionada `https://biomejs.dev/schemas/2.5.5/schema.json`; chaves `formatter.indentStyle/indentWidth`, `javascript.formatter.quoteStyle`, `linter.rules.<grupo>.<regra>` com severidades `off|info|warn|error`; `files.includes` com negação `!` (e `!!` force-ignore para dirs grandes). [CITED: biomejs.dev/reference/configuration]. `assist:false` desliga organize-imports (Pitfall 4). O bloco `overrides` do Biome permite escopo por-path se o planner precisar diferenciar backend (CJS) de frontend (ESM) — mas Biome infere CJS/ESM pelo `package.json type` de cada pasta, então em geral **não é necessário**.

### Scripts padronizados (`package.json`)
Backend `scripts` (acrescentar a lint/format, manter test):
```jsonc
{
  "lint":   "biome lint .",
  "format": "biome format --write .",
  "test":   "node --test",
  "test:coverage": "c8 --reporter=text --reporter=lcov node --test"
}
```
Frontend `scripts` (acrescentar lint/format; `test` no-op documentado — Claude's discretion D):
```jsonc
{
  "lint":   "biome lint .",
  "format": "biome format --write .",
  "test":   "echo \"(frontend sem testes nesta fase — gate é vite build)\" && exit 0"
}
```

### `.github/workflows/ci.yml` (skeleton)
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read          # least-privilege (supply-chain)

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'          # D-09
          cache: npm                   # Claude's discretion — cache por lockfile
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npm run lint              # biome lint . (warn-tolerant, D-06)
      - run: npm run test:coverage     # node --test sob c8 (report → gate após WR-03)

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run build             # vite build
```
> `permissions: contents:read` = least-privilege. `cache-dependency-path` aponta o lockfile de cada pacote (dois lockfiles, sem workspaces). Tags `@v4` de checkout/setup-node marcadas [ASSUMED] — planner deve confirmar a major tag atual antes de commitar.

### Branch protection — required status checks (runbook D-10)
```bash
# Requer: gh CLI autenticado (já OK: vitormorija) e permissão admin no repo.
# owner/repo = vitormorija/automacao-agendor ; branch = main
gh api --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/vitormorija/automacao-agendor/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["backend", "frontend"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```
> O endpoint `PUT .../branches/{branch}/protection` exige as 4 chaves de topo presentes (nulláveis): `required_status_checks`, `enforce_admins`, `required_pull_request_reviews`, `restrictions`. `strict:true` = "branch deve estar atualizada antes do merge". `contexts` DEVE casar com os display names dos jobs (`backend`, `frontend`) — ver Pitfall 3. [CITED: docs.github.com REST branch protection — confirmar shape exato ao executar]. Verificar depois com:
```bash
gh api /repos/vitormorija/automacao-agendor/branches/main/protection/required_status_checks
```

### Verificação CI-02 (D-11) — PR de falha proposital
```bash
git checkout -b test/ci-gate-proof
# introduzir uma falha barata e reversível (ex.: um teste que quebra, ou erro de lint promovido a error)
git commit -am "test: prova de gate CI (falha proposital)"
gh pr create --fill --base main
# Confirmar no PR: check backend (ou frontend) VERMELHO e botão de merge BLOQUEADO.
# Depois: fechar o PR / reverter — NÃO mergear.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ESLint + Prettier (2 ferramentas + plugins) | Biome (1 binário Rust) | Biome 1.0 (2023), 2.x (2025) | Menos deps, mais rápido — decisão D-01 |
| Biome 1.x `files.include`/`files.ignore` | Biome 2.x `files.includes` com `!`/`!!` negação | Biome 2.0 | Config nova; usar sintaxe 2.x (este projeto é greenfield de config) |
| c8 report-only | c8 `check-coverage` como gate no CI | — | WR-03 ativa o gate após WR-02 |

**Deprecated/outdated:**
- Sintaxe Biome 1.x (`organizeImports` top-level, `files.ignore`) — em 2.x virou `assist`/`files.includes`. Não copiar exemplos 1.x da web sem checar a versão.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `actions/checkout@v4` e `actions/setup-node@v4` são as major tags atuais | ci.yml | Baixo — CI falha cedo com erro claro; planner confirma tag |
| A2 | Contexto do required check = id/nome do job (`backend`/`frontend`) | Branch protection, Pitfall 3 | Médio — se errado, gate não trava; mitigado pela verificação D-11 |
| A3 | Shape do body do endpoint de branch protection (4 chaves nulláveis) | Code Examples | Médio — `gh api` retorna erro 422 claro se faltar chave; ajustar no runbook |
| A4 | `biome lint` (sem `--error-on-warnings`) sai exit 0 com warns | Pitfall 2 | Baixo — verificável localmente antes de commitar |
| A5 | Frontend `test` no-op é aceitável para QUAL-03 | Scripts | Baixo — CONTEXT.md marca como discretion do planner |

**Nota:** A maioria das assumptions é auto-verificável em segundos durante a execução (exit codes, respostas de API). Nenhuma envolve comportamento de produto.

## Open Questions

1. **Valor do threshold de cobertura (WR-03)**
   - What we know: c8 já reporta; `check-coverage` + `lines` são as chaves.
   - What's unclear: o número exato só pode ser escolhido DEPOIS de rodar cobertura com o teste WR-02 já presente.
   - Recommendation: o PLAN deve ter uma task "medir cobertura pós-WR-02, escolher threshold logo abaixo do observado" antes de flipar `check-coverage: true`.

2. **Escopo do baseline warn (D-06) — quais regras**
   - What we know: `recommended: true` e rebaixar as ofensoras para `warn`.
   - What's unclear: o conjunto exato de regras que o código atual viola só se conhece rodando `biome lint` uma vez.
   - Recommendation: task "rodar `biome lint .`, listar diagnostics, gerar overrides `warn`" antes de fechar QUAL-01.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (local) | rodar scripts/format | ✓ | 22.13.1 (wrapper `~/bin`) | — |
| npm | instalar Biome, `npm ci` | ✓ | 10.9.2 | — |
| `gh` CLI | branch protection, PR de prova | ✓ | 2.92.0 (autenticado: vitormorija) | UI do GitHub |
| Git remote GitHub | Actions + proteção | ✓ | github.com/vitormorija/automacao-agendor | — |
| Biome binário (macOS-arm64) | lint/format local | via npm | `@biomejs/cli-darwin-arm64@2.5.5` | — |
| Biome binário (linux-x64) | lint/format CI | via npm | `@biomejs/cli-linux-x64@2.5.5` | — |
| c8 | cobertura backend | ✓ (devDep) | 12.0.0 | — |
| Node 20 (CI) | jobs do CI | provisionado por `setup-node` | 20 LTS | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** branch protection pode ser feita pela UI do GitHub se `gh api` der problema de permissão (ambos exigem admin no repo).

**Nota de ambiente:** Node local resolve para 22.13.1 via wrappers em `~/bin` (`export PATH="$HOME/bin:$PATH"`) — não é o Node 20 do CI. Isso é intencional (D-09 fixa Node 20 no CI para determinismo, independente da máquina local). Biome/format rodam igual nos dois; nenhuma feature de Node 22 é usada.

## Validation Architecture

> nyquist_validation = true (config.json) → seção incluída.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (nativo, Node ≥20) + `c8` 12 p/ cobertura |
| Config file | `backend/.c8rc.json` (cobertura); sem config de runner (node:test auto-descobre `test/`) |
| Quick run command | `cd backend && npm test` |
| Full suite command | `cd backend && npm run test:coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WR-02 | `getDealsWithFutureTasks` inclui/exclui + paginação | unit (characterization) | `cd backend && node --test test/agendor.futureTasks.test.js` | ❌ Wave 0 |
| WR-03 | cobertura não erode abaixo do threshold | coverage gate | `cd backend && npm run test:coverage` (com `check-coverage:true`) | ⚠️ config edit |
| QUAL-01 | lint verde no estado atual | tooling | `cd backend && npm run lint` / `cd frontend && npm run lint` | ❌ (script novo) |
| QUAL-02 | format idempotente | tooling | `biome format --check .` (verifica sem escrever) | ❌ (config nova) |
| CI-01/CI-02 | pipeline roda e bloqueia | integration | PR real + `gh pr checks` | ❌ Wave 0 (ci.yml novo) |
| Guard D-05 | reformatação preserva comportamento | regression | `cd backend && npm test` → 28/28 | ✅ (suíte Fase 1) |

### Sampling Rate
- **Per task commit:** `cd backend && npm test` (quick, sub-segundo)
- **Per wave merge:** `cd backend && npm run test:coverage` + `cd frontend && npm run build` + `biome lint .` nos dois
- **Phase gate:** CI verde no PR (backend + frontend) antes de `/gsd:verify-work`; e PR de falha proposital confirmando bloqueio (CI-02).

### Wave 0 Gaps
- [ ] `backend/test/agendor.futureTasks.test.js` — cobre WR-02 (casos a–e)
- [ ] `biome.json` (raiz) — habilita `npm run lint`/`format`
- [ ] scripts `lint`/`format` nos dois `package.json`
- [ ] `.github/workflows/ci.yml`
- [ ] `.c8rc.json` `check-coverage` (flip APÓS WR-02)
- [ ] devDep `@biomejs/biome@2.5.5` em backend e frontend (`npm ci` reprodutível no CI exige lockfiles atualizados)

## Security Domain

> `security_enforcement` não está em config.json; esta é uma fase de toolchain/CI (não constrói auth/crypto/input-validation de produto). Aplicabilidade abaixo é majoritariamente N/A, com foco em **supply-chain do próprio pipeline**.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (nenhum código de auth muda nesta fase) |
| V5 Input Validation | no | — |
| V6 Cryptography | no | — |
| V14 Config / Supply-chain | yes | Pinar versões (`-E` no Biome, `node-version:'20'`, tags de action), `permissions: contents:read`, `npm ci` (lockfile) |

### Known Threat Patterns for CI/toolchain
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Dependency/binário malicioso (slopsquat) | Tampering | Biome pinado + verificado (§Package Legitimacy Audit); sem postinstall |
| Workflow com permissões excessivas | Elevation of Privilege | `permissions: contents: read` no ci.yml |
| Action de terceiro comprometida | Tampering | Pinar tag major (ou SHA) de `checkout`/`setup-node` |
| Merge de código não-verificado | Bypass | Required status checks (CI-02) + `enforce_admins: true` |
| Secret exposto no workflow | Information Disclosure | Nenhum secret é necessário no ci.yml desta fase (lint/test/build públicos) |

## Sources

### Primary (HIGH confidence)
- npm registry (via `npm view`) — `@biomejs/biome@2.5.5`, `optionalDependencies`, ausência de postinstall, `c8@12.0.0`. Verificado nesta sessão.
- npm downloads API — 11.4M downloads/semana p/ Biome (2026-07-17..23).
- biomejs.dev/reference/configuration — schema `biome.json` 2.x (`files.includes`, `formatter`, `javascript.formatter`, `linter.rules`, `overrides`, `root`).
- biomejs.dev/guides/getting-started — install `npm i -D -E @biomejs/biome`, comandos `lint`/`format`/`check`/`ci`, `--write`.
- Código do projeto lido diretamente: `backend/src/agendor.js` (getDealsWithFutureTasks), `backend/test/helpers/fakeAxios.js`, `backend/test/agendor.getStaleDeals.test.js`, `backend/.c8rc.json`, ambos `package.json`.
- `gh --version`/`gh auth status`/`git remote` — ambiente verificado nesta sessão.

### Secondary (MEDIUM confidence)
- github.com/bcoe/c8 (README) — chaves `check-coverage`/`per-file`/`--include` [conhecimento + doc].

### Tertiary (LOW confidence — validar na execução)
- Shape exato do body de branch protection e major tags de `actions/checkout`/`setup-node` — [ASSUMED], auto-verificáveis via erro do `gh api` / run do CI.

## Metadata

**Confidence breakdown:**
- Standard stack (Biome 2.5.5, c8): HIGH — versões e binários verificados no registry nesta sessão.
- Config Biome / schema: HIGH — doc oficial 2.x consultada; chaves confirmadas.
- CI skeleton: MEDIUM-HIGH — estrutura padrão; tags de action marcadas [ASSUMED].
- Branch protection: MEDIUM — endpoint conhecido, shape a confirmar no `gh api`.
- WR-02 test cases: HIGH — derivados da leitura direta do SUT e do padrão da Fase 1.
- Coverage gating: HIGH — c8 já em uso; só ativa flags.

**Research date:** 2026-07-24
**Valid until:** 2026-08-23 (Biome move rápido — reconfirmar `latest` se a fase demorar; config 2.x estável)
