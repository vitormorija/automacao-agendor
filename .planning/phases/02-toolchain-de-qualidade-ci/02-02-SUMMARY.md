---
phase: 02-toolchain-de-qualidade-ci
plan: 02
subsystem: testing
tags: [biome, lint, format, toolchain, quality, ci-prep]

# Dependency graph
requires:
  - phase: 01-rede-de-testes
    provides: "suíte node:test (35 testes) — guard de comportamento para o passe de formatação"
  - phase: 02-01
    provides: "caracterização getDealsWithFutureTasks (WR-02) — parte dos 35 testes"
provides:
  - "Biome 2.5.5 como ferramenta ÚNICA de lint+format em backend (CJS) e frontend (ESM)"
  - "biome.json na raiz (root:true, assist off) resolvido por CWD de cada pacote"
  - "scripts lint/format nos dois package.json + test no-op no frontend (QUAL-03)"
  - "commit de formatação isolado (whitespace-only) guardado pela suíte da Fase 1"
  - "baseline de lint warn-tolerante measure-first (npm run lint exit 0 nos dois pacotes)"
affects: [02-03, ci-workflow, coverage-gating]

# Tech tracking
tech-stack:
  added: ["@biomejs/biome@2.5.5 (devDep pinada -E em backend e frontend)"]
  patterns:
    - "Config única na raiz, escopo por CWD (biome sobe a árvore a partir do package)"
    - "Format-then-guard: passe único isolado + suíte Fase 1 verde + vite build"
    - "Baseline warn measure-first: rebaixar só as regras recomendadas realmente violadas"

key-files:
  created: ["biome.json"]
  modified:
    - "backend/package.json / frontend/package.json (scripts lint/format/test + devDep)"
    - "backend/package-lock.json / frontend/package-lock.json"
    - "35 arquivos JS/JSX/JSON reformatados (whitespace-only)"

key-decisions:
  - "assist.enabled=false: Biome NÃO reordena require/import (imports ungrouped + inline anti-circular preservados)"
  - "CSS fora do escopo do Biome (!**/*.css): parser 2.5.5 aborta em diretivas Tailwind @apply"
  - "17 regras recomendadas violadas rebaixadas a warn (nenhuma exige mudança de código nesta fase)"
  - "biome.json mantido como JSON estrito (sem comentário) p/ compatibilidade require(); baseline D-06 documentado neste SUMMARY"

patterns-established:
  - "Format-then-guard (D-04/D-05): commit de formatação isolado validado pela suíte da Fase 1"
  - "Lint baseline warn-tolerante (D-06): npm run lint verde no estado atual, dívida documentada"

requirements-completed: [QUAL-01, QUAL-02, QUAL-03]

# Metrics
duration: 22min
completed: 2026-07-24
---

# Phase 2 Plan 02: Toolchain de Qualidade (Biome) Summary

**Biome 2.5.5 adotado como lint+format único (backend CJS + frontend ESM) via biome.json na raiz, com passe de formatação isolado guardado pela suíte da Fase 1 (35/35 verde) e baseline de lint warn-tolerante deixando `npm run lint` exit 0 nos dois pacotes.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-24
- **Completed:** 2026-07-24
- **Tasks:** 3 (executadas em 4 commits — o passe de formatação é isolado, + 1 fix de config CSS)
- **Files modified:** 40 (5 de config/deps + 35 reformatados; +biome.json criado)

## Accomplishments
- `@biomejs/biome@2.5.5` pinado (`-E`) em devDependencies de backend e frontend + ambos lockfiles (npm ci reprodutível no CI).
- `biome.json` na raiz: `root:true`, `assist.enabled:false` (não reordena requires — Pitfall 4), `indentStyle:space`/`indentWidth:2`, `javascript.formatter.quoteStyle:single`, ignore de node_modules/dist/coverage/agendor.db/fixtures/CSS.
- Scripts `lint`/`format` nos dois `package.json`; `test` no-op documentado no frontend (gate = vite build).
- Passe de formatação isolado (35 arquivos, whitespace/estilo only) com **ordem de require/import preservada** — guardado por backend `npm test` 35/35 e `vite build` verde (D-05).
- Baseline de lint warn-tolerante (D-06): 17 regras recomendadas violadas rebaixadas a `warn` → `npm run lint` exit 0 (backend 44 warns, frontend 60 warns, 0 erros).

## Task Commits

1. **Task 1: Instalar Biome + biome.json raiz + scripts** - `6e63022` (chore)
2. **Task 1.5 (Rule 3 fix): excluir CSS do escopo** - `ba43dd5` (chore)
3. **Task 2: passe único de formatação isolado** - `210dd26` (style)
4. **Task 3: baseline de lint warn-tolerante (D-06)** - `37339d1` (chore)

**Plan metadata:** (final docs commit — este SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `biome.json` - **criado.** Config única lint+format (root:true, assist off, single quote, space 2, ignores incl. CSS).
- `backend/package.json` - scripts `lint`/`format` + devDep `@biomejs/biome@2.5.5`.
- `frontend/package.json` - scripts `lint`/`format`/`test`(no-op) + devDep `@biomejs/biome@2.5.5`.
- `backend/package-lock.json`, `frontend/package-lock.json` - Biome + binário por plataforma (optionalDependencies).
- 35 arquivos `backend/**`, `frontend/**` (JS/JSX/JSON/config) - reformatados (whitespace/estilo only, sem mudança semântica).

## Baseline D-06 — regras rebaixadas a `warn`

> Documentado aqui (não em comentário no biome.json) para manter `biome.json` como JSON estrito, compatível com `require()`. Todas exigiriam mudança de código para satisfazer → adiadas para fase futura COM teste do novo comportamento. Regras que o código já satisfaz permanecem em `error` via `recommended:true`.

| Grupo | Regras (violadas hoje) |
|-------|------------------------|
| a11y | useButtonType, noLabelWithoutControl, noAutofocus, useKeyWithClickEvents, noStaticElementInteractions |
| complexity | useOptionalChain, useArrowFunction |
| correctness | noUnusedFunctionParameters, useParseIntRadix, noUnusedVariables, useExhaustiveDependencies, noUnusedImports |
| style | useNodejsImportProtocol, useTemplate, useConst |
| suspicious | useIterableCallbackReturn, noArrayIndexKey |

Resultado: `npm run lint` exit 0 nos dois pacotes (warns permitidos; 0 erros).

## Decisions Made
- **assist off (T-2-02-02):** desliga organize-imports do Biome; imports ungrouped e requires inline anti-circular do repo ficam intactos. Verificado no diff: alvos de `require` balanceados (0 net change), só quebra de linha.
- **CSS fora do escopo:** `!**/*.css` em `files.includes` — o parser CSS do Biome 2.5.5 aborta em diretivas Tailwind (`@apply`), o que faria `biome format`/`biome lint` saírem não-zero. Fase é lint+format de JS/JSX/CJS/ESM/JSON.
- **biome.json JSON estrito:** baseline D-06 documentado neste SUMMARY em vez de comentário JSONC, preservando compatibilidade com `require('./biome.json')`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Excluir CSS do escopo do Biome**
- **Found during:** Task 2 (passe de formatação)
- **Issue:** `biome format --write .` abortou com parse error em `frontend/src/index.css` (diretivas Tailwind `@apply` não parseáveis pelo Biome 2.5.5). Isso deixaria `biome format` (check) e o `biome lint .` do CI com exit não-zero.
- **Fix:** Adicionado `!**/*.css` a `files.includes` no biome.json. CSS nunca é tocado pelo Biome; fase é JS/JSX/CJS/ESM/JSON.
- **Files modified:** biome.json
- **Verification:** `biome format .` (check) exit 0; ambos os lints exit 0.
- **Committed in:** `ba43dd5` (commit isolado, antes do passe de formatação)

**2. [Rule 3 - Blocking] Flag de check de formatação: `biome format .` (não `--check`)**
- **Found during:** Task 2 (verificação)
- **Issue:** O plano/RESEARCH assumiu `biome format --check .`, mas `--check` não é flag válida no Biome 2.5.5 (`Error: --check is not expected in this context`).
- **Fix:** Usado o modo check nativo do Biome 2.x: `biome format .` (sem `--write`, `--write=false` é o default) — reporta e sai não-zero se algo estiver desformatado; exit 0 quando limpo.
- **Files modified:** nenhum (apenas comando de verificação)
- **Verification:** `biome format .` exit 0 com repo formatado.
- **Committed in:** n/a (ajuste de comando de verificação)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Ambas necessárias para atingir `format check` e `lint` exit 0 sem sair do escopo JS. Sem scope creep — CSS/Tailwind ficam para fase de UI se necessário.

## Issues Encountered
- Wrapper `npx` do projeto (`~/bin/npx`) aponta para caminho `/tmp` inexistente e falha. Resolvido usando o binário local `./node_modules/.bin/biome` diretamente (o wrapper `~/bin/node` funciona normalmente). Não afeta os scripts npm (`npm run lint`/`format`), que usam o `.bin` local do pacote.
- Semicolons adicionados aos `.jsx` do frontend pelo formatter (o estilo anterior omitia): é mudança de estilo esperada da adoção do formatter único (D-04), behavior-neutral (ASI). CLAUDE.md pede "match existing style", mas a adoção de Biome é a decisão que supersede essa orientação para esta tarefa de toolchain.

## Threat Flags

Nenhuma nova superfície de segurança introduzida. Mitigações do threat model aplicadas:
- **T-2-02-01/T-2-SC:** `@biomejs/biome@2.5.5` pinado `-E`, sem postinstall, binário por plataforma via optionalDependencies (RESEARCH § Package Legitimacy Audit = Approved).
- **T-2-02-02:** `assist.enabled:false` + diff revisado (requires não reordenados).
- **T-2-02-03:** commit de formatação isolado whitespace-only + guard suíte Fase 1 (35/35) + vite build.

## Next Phase Readiness
- `npm run lint`/`npm run format`/`npm test`/`npm run build` prontos para o CI (02-03): comandos estáveis, exit codes previsíveis.
- Baseline warn documentado — CI usará `biome lint .` (NÃO `biome ci` nem `--error-on-warnings`, Pitfall 2) para permanecer warn-tolerante.
- Nenhum blocker para o workflow de CI e o gate de cobertura (WR-03).

## Self-Check: PASSED

- FOUND: biome.json
- FOUND: 02-02-SUMMARY.md
- FOUND commits: 6e63022, ba43dd5, 210dd26, 37339d1
