# Phase 2: Toolchain de Qualidade & CI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-24
**Phase:** 2-toolchain-de-qualidade-ci
**Areas discussed:** Ferramenta lint+format, Rigor inicial (baseline), Formato do pipeline CI, Bloqueio de merge (CI-02)

---

## Ferramenta de Lint + Format

| Option | Description | Selected |
|--------|-------------|----------|
| Biome | Um tool para lint+format, ~10x mais rápido, 1 devDependency, `biome.json` único na raiz | ✓ |
| ESLint + Prettier | Padrão do ecossistema, mais plugins React, porém 2 tools e config por pacote | |

**User's choice:** Biome (recomendado)
**Notes:** Alinhado ao ethos minimalista/zero-dep do projeto. Config única na raiz cobrindo backend (CJS) e frontend (ESM). Split por-pacote só se comprovadamente necessário.

---

## Rigor Inicial (Baseline)

| Option | Description | Selected |
|--------|-------------|----------|
| Format agora, lint em warn | `biome format --write` uma vez (commit isolado) + baseline documentado; só `error` no que já passa | ✓ |
| Zero erros já (corrigir tudo) | Auto-fix de todas as violações com regras em `error`; risco de alterar comportamento sem teste | |
| Só formatação, sem regras de lint | Ligar apenas o formatter; entrega parcial de QUAL-01 | |

**User's choice:** Format agora, lint em warn (recomendado)
**Notes:** Guard adicionado — rodar a suíte da Fase 1 (28/28) após o commit de formatação para provar comportamento inalterado. Fixes de lint que alterem comportamento ficam para fases futuras com teste.

---

## Formato do Pipeline de CI

| Option | Description | Selected |
|--------|-------------|----------|
| 2 jobs paralelos + Node 20 | Workflow único, jobs `backend` e `frontend` paralelos, Node 20 fixo | ✓ |
| 1 job sequencial | Um job instala/roda os dois em sequência; mais lento, logs misturados | |
| Matrix Node 20 + 22 | Rodar nas duas versões; ~2x custo, exagero para ferramenta interna | |

**User's choice:** 2 jobs paralelos + Node 20 (recomendado)
**Notes:** Backend: install→lint→test(+coverage). Frontend: install→lint→build. Node 20 LTS fixo (determinístico vs Node de /tmp local).

---

## Bloqueio de Merge (CI-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Branch protection + runbook | Required status checks (`backend`,`frontend`) na `main`, passo-a-passo documentado no runbook | ✓ |
| Ruleset via gh api (as-code) | Regra por script versionado; ainda depende de admin, regra vive no GitHub | |
| Só CI + documentar (sem enforce) | Entrega CI-01 mas não impõe bloqueio; não satisfaz CI-02 | |

**User's choice:** Branch protection + runbook (recomendado)
**Notes:** Verificar com um PR de falha proposital que o merge é barrado. Config de repo (não versionada) documentada para reprodutibilidade.

---

## Claude's Discretion

- Cache de npm no `setup-node`.
- Conjunto exato de regras de lint em `error` vs `warn` (desde que CI fique verde no estado atual).
- Escopo/ignore do Biome (`frontend/dist/`, `coverage/`, `node_modules/`, fixtures).
- Scripts agregadores na raiz vs CI chamando cada pacote direto.
- Forma do script `test` no frontend (no-op documentado vs ausente).

## Deferred Ideas

- Testes automatizados de frontend — fora do escopo; gate do frontend é `vite build`.
- Matrix multi-Node (20+22) — adiado.
- Fixes de lint que alterem comportamento — só com teste do novo fluxo, em fase apropriada.

## Folded Todos

- WR-02 (cobertura de `getDealsWithFutureTasks`) e WR-03 (thresholds de cobertura no CI) — ambos incorporados ao escopo da Fase 2.
