# Phase 2: Toolchain de Qualidade & CI - Context

**Gathered:** 2026-07-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Qualidade de código verificada **automaticamente** — lint, formatação, testes e build — localmente (scripts npm padronizados) e como **gate obrigatório em cada PR** (CI + branch protection). Cobre backend (Node/CommonJS) e frontend (React/Vite/ESM).

Requisitos: QUAL-01, QUAL-02, QUAL-03, CI-01, CI-02.

**Dentro do escopo:** configurar linter + formatter nos dois pacotes; padronizar scripts `lint`/`format`/`test`; pipeline de CI (lint + testes + build) por PR; bloqueio de merge quando o CI falha; fechar WR-02 e WR-03 do review da Fase 1.

**Fora do escopo (outras fases):** correções de segurança que alteram comportamento (Fases 3/5), remoção de segredos/config por ambiente (Fase 3), refatoração estrutural (Fase 7), timeouts/hardening de integrações (fase própria). Ligar regras de lint que exijam **mudança de comportamento** em código sem teste NÃO entra aqui.
</domain>

<decisions>
## Implementation Decisions

### Ferramenta de Lint + Format (QUAL-01, QUAL-02)
- **D-01:** Adotar **Biome** como ferramenta única de lint **e** format (rejeitados ESLint+Prettier). Racional: alinha ao ethos minimalista/zero-dep do projeto (uma devDependency vs várias), config única cobrindo os dois módulos, muito mais rápido. Cobre JS/JSX/CJS/ESM — suficiente para o essencial deste projeto interno; a menor cobertura de plugins React que o ESLint é aceitável aqui.
- **D-02:** Config única `biome.json` na **raiz** do repo, cobrindo backend + frontend. Ajustar ao estilo já existente do repo: `indentStyle: space`, `indentWidth: 2`, `quoteStyle: single`. (Split por-pacote só se o planner comprovar necessidade real — default é raiz única.)
- **D-03:** Scripts padronizados presentes em **ambos** os `package.json` (backend e frontend) — QUAL-03: `"lint": "biome lint ."` e `"format": "biome format --write ."`. O script `test` já existe no backend (Fase 1: `node --test`); o frontend não tem testes nesta fase (build é o gate do frontend), então `test` no frontend fica como no-op documentado ou ausente conforme o planner decidir — não inventar testes de frontend aqui.

### Rigor Inicial / Baseline (QUAL-01)
- **D-04:** **Formatar agora, lint em warn.** Rodar `biome format --write` uma única vez sobre o código existente num **commit de formatação isolado** (apenas whitespace/estilo — mudança de comportamento zero).
- **D-05:** **Guard obrigatório:** logo após o commit de formatação, rodar a suíte da Fase 1 (`cd backend && npm test`) e confirmar **28/28 verde** — é a prova de que a reformatação não alterou comportamento (a rede de segurança da Fase 1 existe exatamente para isso). Se algo quebrar, investigar antes de prosseguir.
- **D-06:** Regras de **lint** que exigiriam mudança de código para passar entram como **`warn`** num baseline documentado (não falham o CI). Só sobem para **`error`** (bloqueante) as regras que o código atual **já** satisfaz. Resultado: `npm run lint` fica **verde no estado atual** (QUAL-01 "zero erros no código atual, ou baseline documentado"). Fixes de lint que alterem comportamento ficam para fases futuras, com teste cobrindo o novo fluxo.

### Pipeline de CI (CI-01)
- **D-07:** **GitHub Actions**, um workflow `.github/workflows/ci.yml`, disparado em `pull_request` e `push`.
- **D-08:** **Dois jobs paralelos** — `backend` e `frontend` — para falha rápida e logs separados por pacote.
  - `backend`: checkout → setup-node (Node **20**) → `npm ci` → `biome lint` (escopo backend) → `npm test` (+ coverage report).
  - `frontend`: checkout → setup-node (Node **20**) → `npm ci` → `biome lint` (escopo frontend) → `npm run build` (`vite build`).
- **D-09:** Fixar **Node 20 LTS** no CI (satisfaz `engines.node >=20` do backend; determinístico, independente do Node de `/tmp` da máquina local). Rejeitada matrix 20+22 (exagero para ferramenta interna single-instance). Usar cache de npm do `setup-node` fica a critério do planner.

### Bloqueio de Merge (CI-02)
- **D-10:** Tornar os checks `backend` e `frontend` **required status checks** na **branch protection** da `main` (via GitHub UI ou `gh api`). Como é configuração de repositório (não versionada no código), **documentar o passo-a-passo exato** no runbook/deploy docs para ser reproduzível e auditável.
- **D-11:** **Verificação de CI-02:** abrir um PR com falha proposital (ex.: teste quebrado) e confirmar que o merge é **barrado** — evidência concreta de que o gate funciona, não só de que o workflow existe.

### Claude's Discretion
- Cache de npm no `setup-node` (ligar ou não).
- Conjunto exato de regras de lint em `error` vs `warn` no baseline (desde que o resultado seja CI verde no estado atual).
- Escopo/ignore do Biome (ex.: `frontend/dist/`, `coverage/`, `node_modules/`, arquivos de fixture).
- Se scripts agregadores na raiz (`package.json` da raiz) valem a pena para rodar os dois pacotes de uma vez, ou se o CI chama cada pacote diretamente.
- Presença/forma do script `test` no frontend (no-op documentado vs ausente).

### Folded Todos
Do review da Fase 1 (`.planning/phases/01-rede-de-testes-safety-net/01-REVIEW.md`), incorporados a esta fase pelo usuário:
- **WR-02 — Cobertura de `getDealsWithFutureTasks`** (`.planning/todos/pending/wr-02-cover-getdealswithfuturetasks.md`): adicionar teste de caracterização (via `installFakeAxios`) para a segunda função que o `scheduler.js` usa para decidir quem é notificado (hoje 0% coberta). Casos: tarefa futura não-finalizada → incluído; finalizada → excluído; vencimento no passado → excluído; parada da paginação (`tasks.length < 100`). É **caracterização** — pinar comportamento atual, sem "corrigir".
- **WR-03 — Thresholds de cobertura no CI** (`.planning/todos/pending/wr-03-enforce-coverage-thresholds.md`): habilitar `check-coverage` no `.c8rc.json` com thresholds mínimos, escopados ao caminho crítico (`agendor.js`/`db.js`/`auth.js`) se um limite repo-wide for estrito demais, e ligá-los ao CI. **Sequenciamento:** cobertura roda no CI como **report primeiro**; o threshold **bloqueante** é ligado **depois** que WR-02 fecha a lacuna conhecida (senão o gate falharia pela lacuna já mapeada).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requisitos
- `.planning/ROADMAP.md` §"Phase 2: Toolchain de Qualidade & CI" — goal, success criteria e nota "Carried from Phase 1 review".
- `.planning/REQUIREMENTS.md` — QUAL-01, QUAL-02, QUAL-03, CI-01, CI-02 (linhas 20-27, tabela 112-116).

### Review da Fase 1 (origem de WR-02/WR-03)
- `.planning/phases/01-rede-de-testes-safety-net/01-REVIEW.md` — findings WR-02 e WR-03 (contexto completo).
- `.planning/todos/pending/wr-02-cover-getdealswithfuturetasks.md`
- `.planning/todos/pending/wr-03-enforce-coverage-thresholds.md`

### Estado atual do código (o que o CI/lint precisa cobrir)
- `backend/package.json` — scripts atuais (`test`, `test:coverage`), `engines.node >=20`.
- `frontend/package.json` — scripts (`dev`, `build`, `preview`); sem `engines`.
- `backend/.c8rc.json` — config de cobertura atual (report-only; WR-03 adiciona threshold).
- `backend/src/agendor.js` §`getDealsWithFutureTasks` (linhas ~171-204) — alvo do WR-02.
- `.planning/codebase/TESTING.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/STACK.md` — convenções (CommonJS backend / ESM frontend, 2-espaços, aspas simples) que o Biome deve refletir.

### Decisões da Fase 1 que restringem esta fase
- `.planning/phases/01-rede-de-testes-safety-net/01-CONTEXT.md` — ethos zero-dep, seams comportamento-preservantes, `DB_PATH`; o script `test` que o CI executa nasceu ali.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Suíte `node:test` da Fase 1 (28 testes em `backend/test/`) — é o `test` que o CI roda; serve também como guard do commit de formatação (D-05).
- `backend/.c8rc.json` + script `test:coverage` (c8) — base para o gate de cobertura do WR-03.
- Helper `installFakeAxios` (`backend/test/helpers/fakeAxios.js`) — reutilizado para o teste de WR-02.

### Established Patterns
- Dois `package.json` separados, **sem workspaces** — o toolchain precisa cobrir backend e frontend explicitamente (concern já registrado em STATE.md).
- Estilo do repo: CommonJS no backend, ESM no frontend, 2-espaços, aspas simples, sem ponto-e-vírgula consistente no frontend — o Biome deve ser configurado para não brigar com o estilo existente (por isso "format agora" num commit isolado, não regras que reescrevam semântica).
- `gh` CLI disponível + remote GitHub (`github.com/vitormorija/automacao-agendor`) — viabiliza CI Actions e branch protection.

### Integration Points
- Novo `.github/workflows/ci.yml` (não existe hoje).
- Novo `biome.json` na raiz (não existe hoje).
- Novos scripts `lint`/`format` em `backend/package.json` e `frontend/package.json`.
- Branch protection na `main` (config de repo no GitHub) + documentação no runbook/deploy.
</code_context>

<specifics>
## Specific Ideas

- Node 20 LTS fixo no CI (não usar o Node de `/tmp` da máquina local como referência).
- CI-02 deve ser **verificado** com um PR de falha proposital, não apenas configurado.
- Commit de formatação do Biome deve ser **isolado** (só whitespace/estilo) e seguido do run da suíte da Fase 1.
</specifics>

<deferred>
## Deferred Ideas

- Testes automatizados de frontend (unit/component) — fora do escopo desta fase; o gate do frontend aqui é `vite build`. Candidato a fase futura se o frontend crescer.
- Matrix multi-Node (20+22) no CI — adiado; reconsiderar só se surgir divergência de versão.
- Fixes de lint que alterem comportamento (promover regras `warn`→`error` que exigem mudança de código) — só com teste do novo fluxo, em fase apropriada (não nesta).

### Reviewed Todos (not folded)
None — os dois todos que casaram com a fase (WR-02, WR-03) foram ambos incorporados ao escopo.
</deferred>

---

*Phase: 2-toolchain-de-qualidade-ci*
*Context gathered: 2026-07-24*
