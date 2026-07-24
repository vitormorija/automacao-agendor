# Phase 2: Toolchain de Qualidade & CI - Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 6 (1 new test, 4 config new/modified, 2 package.json modified)
**Analogs found:** 3 / 6 (3 are pure-config files with no code analog — mirror conventions)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/test/agendor.futureTasks.test.js` | test (characterization) | request-response (HTTP edge mocked) | `backend/test/agendor.getStaleDeals.test.js` | exact (same SUT module, same helper, same clock pattern) |
| `backend/.c8rc.json` | config (coverage) | batch (test run gate) | itself (current report-only state) | self-modify (add keys) |
| `backend/package.json` | config (scripts) | — | current `scripts` block + `frontend/package.json` | self-modify |
| `frontend/package.json` | config (scripts) | — | `backend/package.json` scripts block | role-match |
| `biome.json` | config (lint/format) | — | none — mirror repo conventions | no analog |
| `.github/workflows/ci.yml` | config (CI pipeline) | — | none — no existing workflow | no analog |

## Pattern Assignments

### `backend/test/agendor.futureTasks.test.js` (test, characterization) — PRIMARY

**Analog:** `backend/test/agendor.getStaleDeals.test.js` (exact match — same module `../src/agendor`, same `installFakeAxios` helper, same `mock.timers` clock).

This is the one file in the phase with a strong reusable code analog. Copy its structure exactly; only the routeHandler payloads, the fixture shape (`/tasks` instead of `/deals`), and the assertions change.

**Header + imports pattern** (`agendor.getStaleDeals.test.js` lines 1-9): a characterization-intent comment block in Portuguese, then `require('./setup')` FIRST, then node:test destructure.
```javascript
// Caracterização (golden)... DOCUMENTA O COMPORTAMENTO ATUAL — não o ideal.
require('./setup');

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');
```
`require('./setup')` MUST be first — it seeds `JWT_SECRET`/`DB_PATH=:memory:`/`AGENDOR_TOKEN` before any backend module loads (see `backend/test/setup.js` lines 14-24). Omitting it makes `secret.js` throw at boot.

**Fixed-clock pattern** (analog lines 11-14, 37-43): declare a `FIXED_NOW`, enable in `before`, reset in `after`. This is the mandated defense against Pitfall 5 (real timers → flaky). `getDealsWithFutureTasks` calls `new Date()` (SUT line 174) and compares `new Date(t.dueDate) > now` (SUT line 189), so the fixture `dueDate` values must be ISO literals relative to `FIXED_NOW`.
```javascript
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();
// ...
before(() => {
  mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
});
after(() => {
  mock.timers.reset();
});
```

**Install-before-require pattern** (analog lines 23-35): install the fake axios BEFORE `require('../src/agendor')` because `agendor.js` builds `const api = axios.create(...)` at load. The routeHandler receives `(url, config)` and returns `{ data: <Agendor envelope> }`. For WR-02 the SUT reads `data.data || []` (SUT line 184), so the envelope is `{ data: { data: <tasksArray> } }`. Branch on `config.params.page` to simulate pagination (case d).
```javascript
installFakeAxios((url, config) => {
  if (url === '/tasks') {
    const page = config?.params?.page;
    return { data: { data: page === 1 ? PAGE_1 : PAGE_2 } };
  }
  return { data: { data: [] } };
});

const { getDealsWithFutureTasks } = require('../src/agendor');
```
Note: the analog's routeHandler takes only `(url)`; here you also need `config` to read `config.params.page` for the pagination case. The helper (`fakeAxios.js` line 10) already passes both args: `mock.fn(async (url, config) => routeHandler(url, config))`.

**Call-count assertion pattern** — the helper returns `fakeInstance` whose `.get` is a `mock.fn`. Capture it to assert pagination stops correctly (case d):
```javascript
const fake = installFakeAxios(/* ... */);
// ...
assert.equal(fake.get.mock.callCount(), 2); // paginou exatamente 2×, parou no page 2 (<100)
```

**Assertion style** (analog lines 53, 60-61): `node:assert/strict`, one focused assertion per behavior with an inline Portuguese comment explaining WHY, plus a "blindagem" comment noting which operator flip the test guards against. The SUT's `>` is strict (line 189) — mirror the getStaleDeals strict-`<` boundary treatment (analog lines 56-63) for the optional case c2 (`dueDate === FIXED_NOW` → excluded).
```javascript
assert.equal(result.has(X), true);   // futuro não-finalizado -> INCLUÍDO
assert.equal(result.has(Y), false);  // finalizada -> EXCLUÍDA
```

**SUT behavior to pin** (`backend/src/agendor.js` lines 173-204, already read — do NOT re-read):
- `now = new Date()`; `yesterday = now - 24h` sent as `dueDateGt` param.
- Paginates `GET /tasks` with `{ dueDateGt, per_page: 100, page }`; reads `data.data || []`.
- Adds `t.deal.id` to the Set iff `!t.finishedAt && t.deal?.id && new Date(t.dueDate) > now` (strict `>`).
- Breaks when `tasks.length === 0` OR `tasks.length < 100`; `page++` only when exactly 100.
- Inner `catch` → `console.error` + `break` (does not propagate).
- Returns a `Set` of deal ids.

**Fixture pattern** (analog line 21 requires `./fixtures/synthetic/deals-page.json`; sample read confirms per-object shape with inline `title` describing the case). For WR-02, either inline the task arrays or add `test/fixtures/synthetic/tasks-page.json` following the same self-documenting-title convention. Task objects need at minimum: `finishedAt`, `dueDate` (ISO relative to FIXED_NOW), `deal: { id }`.

**Cases to implement** (from RESEARCH WR-02 table): (a) future+open→included; (b) finished→excluded; (c) past→excluded; (c2 opt) `dueDate===FIXED_NOW`→excluded (strict `>`); (d) page1=100 incl P1, page2<100 incl P2 → both present + `callCount()===2`; (e opt) task without `deal.id` → guard `t.deal?.id` adds nothing.

---

### `backend/.c8rc.json` (config, coverage) — MODIFIED (WR-03)

**Analog:** itself — current report-only state (already read, lines 1-14):
```json
{ "all": true, "include": ["src/**/*.js"], "exclude": ["test/**", "src/index.js"], "reporter": ["text", "lcov"] }
```
WR-03 adds `check-coverage: true` + `lines`/`branches`/`functions`/`statements` thresholds. **Sequencing constraint (Anti-Pattern in RESEARCH):** flip `check-coverage: true` ONLY after the WR-02 test lands and coverage is measured — otherwise the gate fails on the already-mapped `getDealsWithFutureTasks` gap. The CI command (`npm run test:coverage`) does not change between report and gate phases; only this file changes. c8 cannot express per-path thresholds in one config — use a modest global `lines: <N>` with `per-file: false`, N chosen just below the measured post-WR-02 value.

---

### `backend/package.json` (config, scripts) — MODIFIED

**Analog:** current `scripts` block (already read, lines 8-13). Add `lint` and `format`, keep `test`/`test:coverage` untouched:
```jsonc
"lint":   "biome lint .",
"format": "biome format --write .",
```
Add `@biomejs/biome` (pinned `2.5.5`, installed `-E`) to `devDependencies` alongside existing `c8`/`nodemon`/`pptxgenjs`. `engines.node >=20` already satisfies the CI Node 20.

### `frontend/package.json` (config, scripts) — MODIFIED

**Analog:** `backend/package.json` scripts block (mirror the same `lint`/`format` script names for QUAL-03 cross-package consistency). Add to existing `dev`/`build`/`preview` (lines 5-9):
```jsonc
"lint":   "biome lint .",
"format": "biome format --write .",
"test":   "echo \"(frontend sem testes nesta fase — gate é vite build)\" && exit 0"
```
Add `@biomejs/biome@2.5.5` (`-E`) to `devDependencies`. Frontend `test` no-op is Claude's discretion (D-03 / A5). Note this package is `"type": "module"` (ESM) vs backend CJS — Biome infers per-folder from each `package.json` `type`, so no override needed.

---

## No Analog Found (pure-config — mirror conventions, use RESEARCH)

| File | Role | Reason | What to mirror instead |
|------|------|--------|------------------------|
| `biome.json` | lint/format config | No existing lint/format config anywhere in repo (confirmed: no `.eslintrc*`, no `.prettierrc*`, no prior `biome.json`) | Repo style conventions from CLAUDE.md: `indentStyle: space`, `indentWidth: 2`, `javascript.formatter.quoteStyle: single`. Use RESEARCH "Code Examples → biome.json" baseline verbatim (schema, `root:true`, `files.includes` with `!` negation for node_modules/dist/coverage/`backend/test/fixtures/**`, `assist:false`). Baseline D-06: run `biome lint .` once, downgrade each offending recommended rule to `"warn"`. |
| `.github/workflows/ci.yml` | CI pipeline | No `.github/workflows/` directory exists (confirmed) | Use RESEARCH "Code Examples → ci.yml" skeleton: 2 parallel jobs `backend`/`frontend`, `defaults.run.working-directory`, `setup-node@v4` Node 20, `permissions: contents:read`. Job ids MUST equal the required-check contexts `backend`/`frontend` (Pitfall 3). Use `biome lint .` NOT `biome ci` and NOT `--error-on-warnings` (Pitfall 2 — warns must not fail baseline). |

## Shared Patterns

### Characterization test discipline (repo-wide convention)
**Source:** `backend/test/agendor.getStaleDeals.test.js` (header lines 1-4) + `backend/test/setup.js`
**Apply to:** the WR-02 test
- Intent comment says "DOCUMENTA O COMPORTAMENTO ATUAL — não o ideal": pin quirks (strict `>`), never "fix" them.
- `require('./setup')` is always the first line of every backend test (seeds env, forces `DB_PATH=:memory:`, blanks `SMTP_PASS`/`ADMIN_EMAIL`).
- HTTP edge mocked via `installFakeAxios` installed before `require('../src/agendor')`; no real network.

### Portuguese comments + box-drawing sections
**Source:** CLAUDE.md conventions, visible in all analog files
**Apply to:** test file comments, biome.json inline notes, ci.yml comments where present
- All comments in Portuguese, matching existing code.
- Business-rule / "explain the why" style inline above the code.

### Version pinning (supply-chain, ASVS V14)
**Source:** RESEARCH Security Domain + existing `engines.node`
**Apply to:** both package.json (Biome `-E` exact `2.5.5`), ci.yml (`node-version:'20'`, action major tags `@v4`)

## Metadata

**Analog search scope:** `backend/test/` (test analogs), `backend/` + `frontend/` roots (config/package.json), repo root + `.github/` (workflow/biome — confirmed absent).
**Files scanned:** 9 (2 context, 5 code analogs read, 2 existence checks).
**Pattern extraction date:** 2026-07-24
