# Phase 1: Rede de Testes (Safety-Net) - Research

**Researched:** 2026-07-22
**Domain:** Characterization/golden testing of a Node.js/Express + better-sqlite3 backend (CommonJS) with `node:test` (built-in) + c8; zero-behavior-change test seams
**Confidence:** HIGH (grounded in direct source reads + empirical verification on the installed Node 22.13.1 runtime)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Runner nativo `node:test` (embutido no Node 20+), **zero dependência nova**. Vitest e Jest rejeitados.
- **D-02:** Cobertura via `c8` (wrapper nativo), sem `nyc`/`--coverage` de framework.
- **D-03:** Script `test` no `backend/package.json` chamando `node --test` (local + CI). Nomenclatura/organização dos arquivos a critério do planner; seguir estilo do repo (CommonJS, 2-espaços, aspas simples).
- **D-04:** Abordagem "exportar puras + mock na borda HTTP". Extrair/exportar helpers puros hoje inline/não-exportados (`shouldNotifyOwner`, `getDealType`, e a lógica de exclusão por stage `EXCLUDED_STAGE_WORDS`) **sem alterar a lógica**.
- **D-05:** Para o caminho integrado (`getStaleDeals`, e onde aplicável `runCheck`), **mockar a borda**: `axios` (Agendor) e `nodemailer` (SMTP), sem tocar na lógica interna.
- **D-06:** TEST-05 (auth): expor helpers de rate-limit (`checkRateLimit`/`recordFailedAttempt` sobre o `Map` em memória) e testar verificação de senha via bcrypt. Detalhe exato do seam com o planner.
- **Restrição dura:** nenhuma extração pode mudar comportamento observável. Extração maior que "mover função + adicionar ao `module.exports`" pertence à Fase 7 e deve ser adiada.
- **D-07:** `db.js` aceita caminho SQLite via env (ex.: `DB_PATH`), **default INALTERADO** = `backend/agendor.db`. Testes usam `:memory:` (ou tempfile). Schema criado no load → auto-migra.
- **D-08:** Rejeitado mockar o módulo `db` inteiro — usar SQLite real em memória.
- **D-09:** Fixtures sintéticos por regra (um caso por regra) como base — determinísticos, sem API.
- **D-10:** Complementar com alguns deals reais gravados, **anonimizados** (PII removida), token via env, nunca commitado.

### Claude's Discretion
- Organização/nomenclatura dos arquivos de teste (não há convenção prévia).
- Estrutura interna dos helpers de fixture e dos mocks de `axios`/`nodemailer`.
- Detalhe exato do seam de auth para TEST-05.

### Deferred Ideas (OUT OF SCOPE)
- Log de debug por deal excluído (dizer *por que* um deal foi filtrado) — muda comportamento (novo output), fase posterior.
- Extrações arquiteturais maiores (`getEnrichedStaleDeals`, serviço de agregação) — Fase 7.
- Testes de frontend/componentes — fora de TEST-01..05.
- Mover rate-limit para store persistente — v2 (SECV-02).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Test runner configurado no backend com script `test` executável em CI e local | `node --test` verified on Node 22.13.1; exact `package.json` scripts + c8 wrap below (§Standard Stack, §Code Examples). No new runtime dep. |
| TEST-02 | Caracterização de `getStaleDeals()` (threshold, categoria, stage, owner, funil) | Rule split: pure helpers (`getDealType`, `isExcludedStage`) unit-tested; threshold/category/owner/status-id via integrated `getStaleDeals` with axios seam. Exact seam edits + fixtures below (§Architecture Patterns, §Per-Requirement Map). |
| TEST-03 | Dedup diário (`alreadyNotifiedToday`) | Real SQLite via `DB_PATH`. `:memory:` for positive case; **temp-file required** for date-boundary seeding (empirically confirmed `:memory:` connections are isolated). Details in §Common Pitfalls #4. |
| TEST-04 | Supressão por funil (`shouldNotifyOwner` / `NO_OWNER_NOTIFY_FUNNELS`="beefor") | Already-exported pure function → zero-mock unit test. Beefor exact-string quirk pinned as golden (§Per-Requirement Map, §Common Pitfalls #6). |
| TEST-05 | Auth: rate-limit de login + verificação de senha | Export `checkRateLimit`/`recordFailedAttempt`/`clearAttempts` + tiny `verifyPassword` helper (DRYs existing duplication). `mock.timers` for block-expiry (verified). Env `JWT_SECRET`+`DB_PATH` required to import auth.js (§Per-Requirement Map, §Common Pitfalls #5). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Não alterar comportamento funcional sem teste cobrindo o novo comportamento.** Test seams (function export, env-var path) are NOT behavior changes — permitted.
- **Não misturar refatoração estrutural com novas funcionalidades.** Keep seam edits to the minimum "move function + add to `module.exports`"; anything larger is Phase 7.
- **Não remover código sem comprovar que está inutilizado.** No deletions in this phase.
- **Manter stack atual** (Express 4, better-sqlite3 9, React 18, Vite 5) — no framework swaps. `node:test` is built-in (not a framework add), c8 is a devDependency only.
- **CommonJS backend**, `module.exports = { ... }` único no fim de cada módulo, 2-space indent, aspas simples, comentários em PT, log tags `[Tag]`.
- **All new backend code uses `require('./logger')`, not `console.*`** — but tests may use `node:assert` output; test files should avoid `console.*` for anything but intentional test diagnostics.
- **GSD workflow**: edits must go through a GSD command (planner/executor), not ad-hoc.

## Summary

This phase adds a **characterization (golden) test suite** to a working, in-production CommonJS backend that currently has **zero test tooling**. The runner (`node:test`) ships with Node — I verified `node --test` discovery, `mock.method`/`mock.fn`, and `mock.timers` Date-faking all work on the project's installed Node **22.13.1**. The only new devDependency is **c8 12.0.0** (user-locked, D-02) for coverage. No production runtime dependency is added.

The core engineering problem is **testing tightly-coupled code without changing its behavior**. `agendor.js` creates its axios instance at module-load time; `db.js` opens a single better-sqlite3 connection at module-load time; `auth.js` keeps rate-limit state in a module-level `Map` and runs `ensureDefaultUsers()` (which touches the DB) as an import side-effect and transitively requires `secret.js` (which **throws at load if `JWT_SECRET` < 16 chars**). The strategy that satisfies all constraints is a **two-lane split**: (1) extract the pure business predicates as exported functions and unit-test them with no mocks at all — this covers the highest-value, most-fragile rules (stage-exclusion substring match, beefor funnel suppression, deal-type mapping); (2) for the rules that stay inline inside `getStaleDeals` (threshold, category, owner, status-id), drive the real function with a stubbed axios instance and assert the golden output. DB tests use a **real in-memory/temp-file SQLite** via a new `DB_PATH` env seam (default unchanged), not a mocked db module.

**Primary recommendation:** Use `node:test` + `node:assert/strict` + c8. Add three minimal, behavior-preserving seams — (a) export `getDealType` and a new pure `isExcludedStage(rawStageName)` from `agendor.js`; (b) `const dbPath = process.env.DB_PATH || path.join(__dirname,'..','agendor.db')` in `db.js`; (c) export `checkRateLimit`/`recordFailedAttempt`/`clearAttempts` and a new pure `verifyPassword(storedHash, plain)` from `auth.js`. Mock axios with the built-in `mock.method(axios, 'create', …)` pattern (zero new dep) and nodemailer with `mock.method(nodemailer, 'createTransport', …)`; **do not** add nock. Write tests as golden characterizations that pin current quirks with explicit "documents current behavior" comments.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Business-rule filtering (threshold/category/stage/owner/funnel) | Domain (`agendor.js`) | — | Pure logic; belongs in the domain module, tested at that boundary — no HTTP/DB needed for the pure parts. |
| Deal fetch/pagination (Agendor API) | Domain (`agendor.js`) → External API | Test seam: axios stub | External I/O; mocked at the axios boundary so business filters run against controlled input. |
| Same-day dedup (`alreadyNotifiedToday`) | Data (`db.js`) | — | Reads `notification_log`; tested against a real in-memory/temp SQLite, not a mock. |
| Funnel suppression (`shouldNotifyOwner`) | Domain (`agendor.js`) | Orchestration (`scheduler.js` consumes it) | Pure predicate already exported; unit-test directly. |
| Login rate-limit (`checkRateLimit`/`recordFailedAttempt`) | Route/Auth (`auth.js`) | In-memory `Map` state | Pure-ish functions over module state; export + unit-test with `mock.timers` for time-based branch. |
| Password verification (bcrypt + legacy plaintext) | Route/Auth (`auth.js`) | `bcryptjs` | Extract `verifyPassword` helper (DRYs existing duplication) and unit-test both branches. |
| Email send | Domain (`emailer.js`) → SMTP | Test seam: nodemailer stub | Out of scope as logic-under-test; only mocked if an integrated `runCheck` test is written (optional). |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:test` | built-in (Node ≥20; verified on 22.13.1) | Test runner + `describe`/`it`/`test`, `before`/`after`/`beforeEach`/`afterEach`, `mock.fn`/`mock.method`/`mock.timers` | Zero-dependency, ships with the runtime the project already pins (`engines.node >=20`). User-locked D-01. [VERIFIED: node --test executed on installed runtime] |
| `node:assert/strict` | built-in | Assertions (`assert.deepStrictEqual`, `assert.equal`, `assert.throws`, etc.) | Native companion to `node:test`; strict mode avoids loose-equality foot-guns. [CITED: nodejs.org/api/assert.html] |
| `c8` | `12.0.0` | Coverage wrapper around `node --test` (V8 built-in coverage → text/lcov) | User-locked D-02; the standard native-V8 coverage tool (istanbul team). Registry-verified below. [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `better-sqlite3` | `^9.6.0` (already a dep) | Real in-memory/temp SQLite for DB tests | TEST-03/TEST-05 DB-backed tests. Point `db.js` at `:memory:` or a temp file via `DB_PATH`. No new install. |
| `nodemailer` | `^6.9.13` (already a dep) | Its `jsonTransport: true` and `mock.method` stub avoid real SMTP | Only if an integrated `runCheck` test is written (optional this phase). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:test` built-in axios stub | `nock` `14.0.16` (HTTP interceptor) | nock intercepts at the http layer with no module-order gymnastics, BUT it is a **new devDependency** — conflicts with the project's zero-dep ethos and D-01's spirit. The built-in `mock.method(axios,'create',…)` needs no new package. **Recommend built-in; do NOT add nock.** |
| c8 | Node's `--experimental-test-coverage` | Built-in coverage exists but is still marked experimental and its thresholds/reporters are less mature; D-02 explicitly chose c8. |
| Extracting a pure `getStaleDeals` filter fn | Testing `getStaleDeals` end-to-end with axios stub | Full extraction of the filter chain is a **Phase 7-sized refactor** (hard constraint). Keep threshold/category/owner/status-id inline and characterize via the integrated path. |

**Installation:**
```bash
# In backend/ — c8 as devDependency only (no runtime dep added)
npm install --save-dev c8@12
```
Note on environment: Node is not on the default PATH on this machine — binaries live at `/tmp/node-v22.13.1-darwin-arm64/bin/` with wrappers in `~/bin`. Any local test run must `export PATH="$HOME/bin:$PATH"` first (see §Environment Availability).

**Version verification (run 2026-07-22):**
```
npm view c8 version   → 12.0.0   (time.modified 2026-07-16)
npm view nock version → 14.0.16  (not recommended; listed for completeness)
node --version        → v22.13.1 (installed, PATH-dependent)
```

## Package Legitimacy Audit

> slopcheck could not be installed in this offline session (`pip install slopcheck` failed, no network). Per protocol, packages I *discovered* are tagged `[ASSUMED]` and the planner should gate any **new** install behind a `checkpoint:human-verify` task. Registry facts and postinstall checks were run directly.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `c8` | npm | mature (v12, modified 2026-07-16) | very high (istanbul-team tool) | github.com/bcoe/c8 | unavailable | **Approved (user-locked D-02)** — planner adds `checkpoint:human-verify` before `npm i -D c8@12` per protocol. No `postinstall` script (verified empty). |
| `nock` | npm | mature (v14.0.16) | very high | github.com/nock/nock | unavailable | **NOT recommended** — omitted from plan in favor of zero-dep built-in mocking. No `postinstall` (verified empty). |
| `node:test` / `node:assert` | n/a (runtime built-in) | n/a | n/a | nodejs core | n/a | Approved — no install. |
| `better-sqlite3`, `nodemailer` | npm | existing deps | — | — | n/a | Already installed; no new install. |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**New installs requiring human verification:** `c8@12` (only new devDependency). Because slopcheck was unavailable, treat `c8` as `[ASSUMED]` and gate its install behind a `checkpoint:human-verify` task, even though it is a mainstream, user-chosen tool with no postinstall script.

## Architecture Patterns

### System Architecture Diagram (test wiring)

```text
                         node --test  (c8 wraps for coverage)
                                │  discovers **/*.test.js + test/*.js
                                ▼
        ┌───────────────── TEST FILES (backend/test/…) ─────────────────┐
        │                                                               │
   PURE LANE (no mocks)                         INTEGRATED LANE (edge mocks)
        │                                                    │
        ▼                                                    ▼
  require pure exports                        mock.method(axios,'create',()=>fakeApi)
  from agendor.js:                                          │  BEFORE requiring agendor.js
   • getDealType(orgCat)                                    ▼
   • isExcludedStage(name)   ← NEW export           require('../src/agendor')
   • shouldNotifyOwner(deal) ← already exported      → api === fakeApi (get() stubbed)
        │                                                    │
        │                                          fakeApi.get returns fixture pages
        ▼                                                    ▼
   assert.deepStrictEqual                        getStaleDeals(15) runs REAL filter chain
   (golden per-rule)                             (threshold/category/owner/status-id inline)
                                                             │
   DB LANE (real SQLite):                                    ▼
   DB_PATH=':memory:' or tempfile  ──► require('../src/db')  assert golden output array
   • logNotification / alreadyNotifiedToday (TEST-03)
   • verifyPassword / checkRateLimit (TEST-05, mock.timers for block expiry)
        │  fixtures: synthetic-per-rule JSON + anonymized real-deal sample
        ▼
   env preset by test/setup: JWT_SECRET (≥16 chars), DB_PATH, AGENDOR_TOKEN(any)
```
File-to-responsibility mapping is in the layout table below, not in the diagram.

### Recommended Project Structure (Claude's discretion — D-03)
```
backend/
├── package.json          # + "test", "test:coverage" scripts; + c8 devDep
├── .c8rc.json            # coverage include/exclude config (optional but recommended)
└── test/                 # node --test discovers any *.js under a test/ dir (verified)
    ├── setup.js          # sets JWT_SECRET, DB_PATH, AGENDOR_TOKEN before requires; shared helpers
    ├── helpers/
    │   ├── fakeAxios.js  # builds a fake axios instance + install/reset via mock.method
    │   └── tmpDb.js      # creates a temp-file DB path, cleans up
    ├── fixtures/
    │   ├── synthetic/    # one JSON per rule (stage-excluded, category-excluded, owner-excluded, beefor, boundary-day)
    │   └── real-deals.sample.json   # anonymized, committed (PII stripped)
    ├── agendor.pure.test.js       # TEST-02 pure lane, TEST-04
    ├── agendor.getStaleDeals.test.js  # TEST-02 integrated lane
    ├── db.dedup.test.js           # TEST-03
    └── auth.test.js               # TEST-05
```
Rationale for a `test/` dir: `node --test` (Node 22.13.1) discovers **any `.js` file inside a `test/` directory** plus `**/*.test.{js,cjs,mjs}` anywhere — empirically confirmed. A `test/` dir keeps fixtures/helpers colocated without them being mistaken for test files only if they do NOT end in `.test.js` AND are not loose `.js` at the `test/` root. **Gotcha:** files like `test/helpers/fakeAxios.js` sit under `test/` and WILL be picked up as a (empty) test file. Put helpers/fixtures in subfolders and either (a) name them so they contain no tests (harmless empty runs) or (b) exclude via an explicit run glob. See Pitfall #2.

### Pattern 1: Pure-helper extraction (zero-behavior-change seam)
**What:** Move/expose already-pure logic so it can be unit-tested with no mocks.
**When to use:** TEST-02 (stage, deal-type), TEST-04 (funnel).
**Exact seam edits (prose, minimal):**

- `backend/src/agendor.js`
  - `getDealType` already exists as a standalone function (line 67) → **add `getDealType` to the `module.exports` object (line 198).** Zero code motion.
  - `shouldNotifyOwner` (line 57) is **already exported** (line 198) → no change; just test it.
  - Stage-exclusion is currently **inline** at lines 138–139. Extract it verbatim into a pure function placed next to `EXCLUDED_STAGE_WORDS`:
    ```js
    // Retorna true se o nome da etapa indica encerramento/congelamento.
    // Correspondência parcial (substring) sobre o nome normalizado (sem acentos, minúsculo).
    function isExcludedStage(rawStageName) {
      const stageName = (rawStageName || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return EXCLUDED_STAGE_WORDS.some(w => stageName.includes(w));
    }
    ```
    Then line 138–139 becomes:
    ```js
    if (isExcludedStage(deal.dealStage?.name)) continue;
    ```
    Add `isExcludedStage` to `module.exports`.
  - **CRITICAL behavior-preservation rule:** copy the normalization expression **byte-for-byte** from line 138, including the exact diacritic regex literal `/[̀-ͯ]/g` (U+0300–U+036F combining marks). Do NOT "rewrite" it to `/[̀-ͯ]/g` even though they are equivalent ranges — a byte-identical copy makes the "no behavior change" claim trivially auditable in the diff. See Pitfall #1.

**Example (test):**
```js
// backend/test/agendor.pure.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getDealType, isExcludedStage, shouldNotifyOwner } = require('../src/agendor');

test('isExcludedStage: pins substring-match quirk (documents CURRENT behavior)', () => {
  assert.equal(isExcludedStage('Oportunidade Perdida'), true);   // "perd"
  assert.equal(isExcludedStage('Ganho'), true);                  // "ganh"
  assert.equal(isExcludedStage('Congelado'), true);              // "congelad"
  // QUIRK (current behavior, not necessarily desired): "perd" matches "Perdão de contrato"
  assert.equal(isExcludedStage('Perdão de contrato'), true);
  assert.equal(isExcludedStage('Negociação'), false);
});
```

### Pattern 2: Built-in axios-instance stub (zero new dependency)
**What:** Replace the axios instance that `agendor.js` builds at load time by stubbing `axios.create` **before** the first `require('../src/agendor')`.
**When to use:** TEST-02 integrated lane (threshold/category/owner/status-id) — the rules that stay inline.
**Why it works:** `agendor.js` does `const api = axios.create(...)` once at module load. If `axios.create` is stubbed to return your fake instance before the module is required, `api` becomes your fake. `getStaleDeals` then calls `api.get('/deals', …)` and `api.get('/organizations/:id')` on the fake.
**Example:**
```js
// backend/test/helpers/fakeAxios.js
const { mock } = require('node:test');
const axios = require('axios');

function installFakeAxios(routeHandler) {
  // routeHandler(url, config) => { data: <agendor-shaped payload> }
  const fakeInstance = { get: mock.fn(async (url, config) => routeHandler(url, config)) };
  mock.method(axios, 'create', () => fakeInstance);
  return fakeInstance;
}
module.exports = { installFakeAxios };
```
```js
// backend/test/agendor.getStaleDeals.test.js  (order matters: stub BEFORE require)
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');

installFakeAxios((url) => {
  if (url === '/deals') return { data: { data: require('./fixtures/synthetic/deals-page.json'), meta: { totalCount: 1 }, links: {} } };
  if (url.startsWith('/organizations/')) return { data: { data: { category: { name: 'Lead' } } } };
  return { data: { data: [] } };
});
const { getStaleDeals } = require('../src/agendor'); // now uses the fake instance

test('getStaleDeals: excludes deals created before 2026-01-01 (threshold+cutoff golden)', async () => {
  const result = await getStaleDeals(15);
  assert.deepStrictEqual(result.map(d => d.id), [/* golden ids */]);
});
```
**Caveat:** `getStaleDeals` reads `Date.now()` for the cutoff and `daysSinceUpdate`. Fixtures should use dates **relative to a fixed clock** or the test should enable `mock.timers` with a pinned `now` so golden values are deterministic. See Pitfall #3.

### Pattern 3: Real SQLite via `DB_PATH` env seam
**What:** Let tests point `db.js` at `:memory:` or a temp file without changing production default.
**Exact seam edit — `backend/src/db.js` line 4:**
```js
// antes:
const db = new Database(path.join(__dirname, '..', 'agendor.db'));
// depois:
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'agendor.db');
const db = new Database(dbPath);
```
Everything else (schema DDL, migrations, defaults seeding) already runs at module load, so `:memory:` and temp files **auto-migrate** — verified conceptually against the load-time `db.exec(...)` blocks. Default path is byte-preserved when `DB_PATH` is unset → production identical.

### Pattern 4: Auth seams (TEST-05)
**What:** Export the rate-limit helpers and a new tiny password-verify helper.
**Exact seam edits — `backend/src/routes/auth.js`:**
- Extract `verifyPassword` from the **duplicated** inline comparison at lines 124–126 and 193–195 (both do the same `startsWith('$2') ? bcrypt.compare : plaintext`):
  ```js
  // Compara a senha informada com o hash armazenado.
  // Suporta hash bcrypt ($2...) e senha legada em texto puro.
  async function verifyPassword(storedHash, plain) {
    return storedHash.startsWith('$2') ? bcrypt.compare(plain, storedHash) : plain === storedHash;
  }
  ```
  Replace both call sites with `await verifyPassword(user.password, password)` / `(user.password, currentPassword)`. This is a behavior-preserving DRY extraction (the discriminator `startsWith('$2')` is preserved exactly).
- Change the bottom export from `module.exports = router;` to attach test helpers without breaking the router export:
  ```js
  module.exports = router;
  module.exports.checkRateLimit = checkRateLimit;
  module.exports.recordFailedAttempt = recordFailedAttempt;
  module.exports.clearAttempts = clearAttempts;
  module.exports.verifyPassword = verifyPassword;
  module.exports._loginAttempts = loginAttempts; // permite reset entre testes
  ```
  Express only cares that `module.exports` is the router function; extra properties on it are ignored by `app.use()`. This is the least-invasive way to keep `module.exports = router` semantics while exposing helpers. (Planner may prefer a small `test:` sub-object — either is fine per D-06.)

**Import side-effects to neutralize (see Pitfall #5):** requiring `auth.js` runs `ensureDefaultUsers()` (touches DB via `listUsers()`), requires `../secret` (throws if `JWT_SECRET` < 16 chars), requires `../emailer` and `../db`. The test `setup.js` MUST set `process.env.JWT_SECRET` (≥16 chars) and `process.env.DB_PATH` (`:memory:` or temp) **before** any `require('../src/routes/auth')`.

### Anti-Patterns to Avoid
- **Mocking the `db` module** (rejected in D-08): a hand-written db mock drifts from the real schema and hides bugs. Use real SQLite.
- **Extracting the whole `getStaleDeals` filter into a new pure pipeline function** — that is a Phase-7-sized refactor; hard-constraint violation. Keep it inline; characterize via the axios stub.
- **Asserting idealized behavior.** These are characterization tests: assert what the code does *today*, including quirks, with a comment flagging each quirk.
- **Rewriting the diacritic regex** during extraction (Pitfall #1).
- **Adding nock or any HTTP-mock dependency** — the built-in `mock.method` covers it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test runner / discovery / reporter | A custom `run-tests.js` walker | `node --test` (built-in) | Ships with Node; TAP output; parallel file execution; discovery verified. |
| Function/method spies & stubs | Manual monkey-patch + restore bookkeeping | `mock.fn` / `mock.method` (auto-restored via `mock.reset()` / `--test` teardown) | Built-in, tracks calls, restores originals. |
| Faking `Date.now()` / timers for block-expiry | Manually mutating `entry.blockedUntil` | `mock.timers.enable({ apis: ['Date'] })` + `tick()` | Verified working on 22.13.1; deterministic time control. (Experimental-warning noted — see Pitfall #7.) |
| In-memory test DB | A fake object mimicking better-sqlite3 | Real `better-sqlite3` with `:memory:` / temp file | Same engine, same SQL, same edge cases (D-08). |
| Fake SMTP transport | A stub with hand-rolled `sendMail` | `nodemailer` `jsonTransport:true` or `mock.method(nodemailer,'createTransport',…)` | Uses the real API shape; no SMTP connection. |
| Coverage instrumentation | Manual line counting | `c8` (V8 coverage) | User-locked; standard native coverage. |

**Key insight:** Node's built-in test toolchain now covers every mocking need this phase has (functions, methods, timers/Date), so the "zero new dependency" ethos is fully achievable — the only devDependency is the user-chosen c8.

## Common Pitfalls

### Pitfall 1: Regex/normalization drift during stage-exclusion extraction
**What goes wrong:** Rewriting `/[̀-ͯ]/g` as `/[̀-ͯ]/g` (or "cleaning up" the normalization chain) subtly changes matching and breaks the "no behavior change" guarantee.
**Why it happens:** The literal combining-marks regex looks like a mojibake artifact and invites "fixing".
**How to avoid:** Copy the entire normalization+`some()` expression byte-for-byte into `isExcludedStage`; the `getStaleDeals` diff should show only `const stageName = ...; if (EXCLUDED_STAGE_WORDS.some(...))` → `if (isExcludedStage(deal.dealStage?.name))`.
**Warning signs:** A golden test that previously excluded a stage name now includes it (or vice versa) after extraction.

### Pitfall 2: `test/` helpers/fixtures picked up as test files
**What goes wrong:** `node --test` runs any loose `.js` under `test/`; a `test/helpers/fakeAxios.js` runs as an (empty) test, and worse, a fixture `.js` with side-effects could error.
**Why it happens:** Discovery includes `test/**/*.js` for files directly matched, plus `**/*.test.js`. (Empirically: `test/plain.js` ran; `random.js` at root did not.)
**How to avoid:** Keep only `*.test.js` as actual tests; put helpers/fixtures in `test/helpers/` and `test/fixtures/` and use `.json` for fixtures (not executed). If a helper `.js` under `test/` gets discovered, ensure it defines no tests (harmless) — or run tests with an explicit glob `node --test test/*.test.js` to scope discovery.

### Pitfall 3: Non-deterministic golden values from `Date.now()`
**What goes wrong:** `getStaleDeals` computes `daysSinceUpdate` and the 15-day cutoff from `Date.now()`, so golden arrays change every day the suite runs.
**Why it happens:** Real clock in pure-ish logic.
**How to avoid:** Either (a) enable `mock.timers.enable({ apis: ['Date'] })` and set a fixed `now` for the integrated `getStaleDeals` tests, then compute fixture `createdAt`/`updatedAt` relative to that fixed clock; or (b) assert on stable fields (ids, exclusion outcomes) rather than exact `daysSinceUpdate`. Prefer (a) for a true golden.

### Pitfall 4: `:memory:` SQLite connections are isolated — can't seed a "yesterday" row from a second connection
**What goes wrong:** To characterize `alreadyNotifiedToday` returning **false** for a deal last notified *yesterday*, you must insert a row with a controlled `sent_at`. But `logNotification` hardcodes `sent_at = new Date().toISOString()` (today), and opening a second `new Database(':memory:')` gives a **completely separate empty DB** — empirically confirmed (`no such table: t`).
**Why it happens:** Each `:memory:` connection is a private database.
**How to avoid:** For the date-boundary case, set `DB_PATH` to a **temp file** (not `:memory:`). Then the test can open its own `new Database(process.env.DB_PATH)` connection to the same file and `INSERT` a row with `sent_at` set to yesterday, then call the db.js singleton's `alreadyNotifiedToday(deal_id)` and assert `false`. For the positive case (notified today → true), `:memory:` + `logNotification` is sufficient. Clean up the temp file in `after()`.
**Warning signs:** "no such table" from a second connection, or inability to control `sent_at`.

### Pitfall 5: Importing `auth.js` throws or writes to the real DB
**What goes wrong:** `require('../src/routes/auth')` executes `ensureDefaultUsers()` (DB writes via the db singleton) and `require('../secret')` throws `JWT_SECRET ausente ou muito curto` if `JWT_SECRET` is unset or < 16 chars — failing the whole test file at load. Without `DB_PATH`, it would also touch the real `backend/agendor.db`.
**Why it happens:** Module-load side-effects + fail-fast secret loader.
**How to avoid:** In `test/setup.js` (required first, or set before the require), set `process.env.JWT_SECRET = 'x'.repeat(32)`, `process.env.DB_PATH = ':memory:'` (or temp file), and any `process.env.AGENDOR_TOKEN = 'test'` (agendor.js reads it at load but won't call the API in unit tests). Reset the `loginAttempts` Map in `beforeEach` via the exported `_loginAttempts.clear()` or `clearAttempts(ip)`.

### Pitfall 6: Beefor funnel exact-string quirk must be pinned, not "fixed"
**What goes wrong:** A well-meaning test asserts case-insensitive/whitespace-tolerant matching that the code does not actually do beyond `.trim().toLowerCase()`.
**Why it happens:** `shouldNotifyOwner` lowercases+trims then does an exact `includes` against `['beefor']`. A funnel `'Beefor '` → trimmed+lowered `'beefor'` → suppressed; but `'beefor-vendas'` → NOT suppressed (not equal). CONCERNS.md flags this as fragile.
**How to avoid:** Write golden tests that document exactly: `'beefor'`→suppress, `'Beefor'`→suppress (lowercased), `' beefor '`→suppress (trimmed), `'beeforx'`/`'beefor vendas'`→NOT suppressed, `null`/missing funnel→NOT suppressed (notifies). Comment each as "documents current behavior".

### Pitfall 7: `mock.timers` emits an ExperimentalWarning
**What goes wrong:** Using `mock.timers` prints `ExperimentalWarning: The MockTimers API is an experimental feature` to stderr — noisy in CI, but functional (verified: `tick(900000)` advanced `Date.now` exactly).
**Why it happens:** MockTimers is still experimental in Node 22.
**How to avoid:** It works and is safe to use. If the warning must be silenced in CI, run tests with `NODE_OPTIONS=--no-warnings` or `node --no-warnings --test`. Do not block on this.

## Code Examples

### package.json scripts (TEST-01)
```jsonc
// backend/package.json — add to "scripts"
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "node --test",
    "test:coverage": "c8 --reporter=text --reporter=lcov node --test"
  }
}
```
CI (Phase 2) just calls `npm test` (and optionally `npm run test:coverage`). This phase only requires that `npm test` runs and passes locally and is CI-callable.

### .c8rc.json (recommended)
```jsonc
// backend/.c8rc.json
{
  "all": true,
  "src": ["src"],
  "include": ["src/**/*.js"],
  "exclude": ["test/**", "src/index.js"],
  "reporter": ["text", "lcov"]
}
```
`src/index.js` is excluded because it boots the server (opens ports, schedules cron) and is not the target of Phase-1 tests.

### node:test basics (CommonJS, matches repo style)
```js
// Source: nodejs.org/api/test.html + nodejs.org/api/assert.html (verified on Node 22.13.1)
const { test, describe, it, before, beforeEach, after, mock } = require('node:test');
const assert = require('node:assert/strict');

describe('shouldNotifyOwner (TEST-04)', () => {
  const { shouldNotifyOwner } = require('../src/agendor');
  it('suppresses beefor (exact, trimmed, lowercased) — CURRENT behavior', () => {
    assert.equal(shouldNotifyOwner({ funnel: 'beefor' }), false);
    assert.equal(shouldNotifyOwner({ funnel: 'Beefor' }), false);
    assert.equal(shouldNotifyOwner({ funnel: ' beefor ' }), false);
    assert.equal(shouldNotifyOwner({ funnel: 'beefor vendas' }), true); // quirk: not suppressed
    assert.equal(shouldNotifyOwner({ funnel: null }), true);
    assert.equal(shouldNotifyOwner({}), true);
  });
});
```

### Rate-limit block-expiry with mock.timers (TEST-05)
```js
// Source: verified on Node 22.13.1 (mock.timers.enable + tick advances Date.now)
const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../src/routes/auth'); // JWT_SECRET & DB_PATH must be set first (setup.js)

beforeEach(() => auth._loginAttempts.clear());

test('blocks after 5 failed attempts, then clears after block window', () => {
  const ip = '1.2.3.4';
  for (let i = 0; i < 4; i++) assert.equal(auth.recordFailedAttempt(ip).nowBlocked, false);
  assert.equal(auth.recordFailedAttempt(ip).nowBlocked, true);       // 5th → blocked
  assert.equal(auth.checkRateLimit(ip).blocked, true);

  mock.timers.enable({ apis: ['Date'] });
  mock.timers.tick(15 * 60 * 1000 + 1);                              // BLOCK_MINUTES elapse
  assert.equal(auth.checkRateLimit(ip).blocked, false);              // window cleared
  mock.timers.reset();
});
```

### Fixture capture + anonymization script (D-10, one-time, manual)
```js
// backend/scripts/capture-fixtures.js  — RUN ONCE MANUALLY, never in CI.
// Usage: AGENDOR_TOKEN=xxx node backend/scripts/capture-fixtures.js
// Writes an ANONYMIZED sample to backend/test/fixtures/real-deals.sample.json (committed).
// NEVER commit the token; NEVER commit raw (un-anonymized) output.
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.AGENDOR_TOKEN;
if (!TOKEN) { console.error('Defina AGENDOR_TOKEN no ambiente.'); process.exit(1); }
const api = axios.create({ baseURL: 'https://api.agendor.com.br/v3', headers: { Authorization: `Token ${TOKEN}` } });

function anonymize(deal, i) {
  // Mantém APENAS os campos que getStaleDeals consome; substitui PII por rótulos sintéticos.
  return {
    id: 1000 + i,
    title: `Deal ${i + 1}`,
    createdAt: deal.createdAt,      // datas são estruturais, não-PII
    updatedAt: deal.updatedAt,
    owner: { id: 10 + i, name: `Owner ${i + 1}` },
    author: { id: 20 + i, name: `Author ${i + 1}` },
    organization: { id: 30 + i, name: `Org ${i + 1}` },
    dealStatus: deal.dealStatus ? { id: deal.dealStatus.id } : undefined,
    status: deal.status ? { id: deal.status.id } : undefined,
    dealStage: { name: deal.dealStage?.name || null, funnel: { name: deal.dealStage?.funnel?.name || null } },
    _webUrl: `https://web.agendor.com.br/deal/${1000 + i}`,
  };
}

(async () => {
  const { data } = await api.get('/deals', { params: { page: 1, per_page: 10, deal_status_id: 1 } });
  const sample = (data.data || []).slice(0, 8).map(anonymize);
  const out = path.join(__dirname, '..', 'test', 'fixtures', 'real-deals.sample.json');
  fs.writeFileSync(out, JSON.stringify(sample, null, 2));
  console.log(`Gravado ${sample.length} deals anonimizados em ${out}`);
})();
```
Deal object shape consumed by `getStaleDeals` (verified from source, lines 114–157): `id`, `title`, `createdAt`, `updatedAt`, `owner.{id,name}`, `author.{id,name}`, `organization.{id,name}`, `dealStatus.id`/`status.id`, `dealStage.name`, `dealStage.funnel.name`, `_webUrl`; plus `/organizations/:id` → `data.category.name`; list envelope: `meta.totalCount`, `links.next`, `data[]`. `.gitignore` must exclude any `test/fixtures/*.raw.json` and the token; only the anonymized `*.sample.json` is committed.

## Per-Requirement Test Map (TEST-01..05)

| Req | What to test | How | Lane | Seam needed |
|-----|--------------|-----|------|-------------|
| TEST-01 | `npm test` runs `node --test`, passes local+CI-callable; coverage script exists | Add scripts + one trivial passing test to prove wiring; `c8` devDep | — | package.json scripts, c8 install |
| TEST-02 (threshold) | Deals created < 2026-01-01 excluded; `updatedAt < now - staleDays` included; boundary day | Integrated `getStaleDeals` with axios stub + `mock.timers` fixed clock; golden ids | Integrated | axios stub, `DB_PATH` not needed (no db in getStaleDeals) |
| TEST-02 (category) | `EXCLUDED_CATEGORIES` (`Inativo (sem resposta)`, `Parceiro`, `Fornecedor`) excluded | Integrated stub returns those categories from `/organizations/:id`; assert excluded | Integrated | axios stub |
| TEST-02 (owner) | `EXCLUDED_OWNERS` (`Maria Lobato`) excluded | Integrated stub deal with that owner name | Integrated | axios stub |
| TEST-02 (status-id) | `dealStatus.id`/`status.id` ≠ 1 excluded | Integrated stub | Integrated | axios stub |
| TEST-02 (stage) | `EXCLUDED_STAGE_WORDS` substring match incl. quirk (`Perdão`→excluded) | **Pure** `isExcludedStage` unit tests | Pure | export `isExcludedStage` |
| TEST-02 (deal-type mapping) | `getDealType`: Lead/Negócio classification | **Pure** unit tests | Pure | export `getDealType` |
| TEST-03 | `alreadyNotifiedToday`: same-day `status='sent'`→true; no row→false; **yesterday→false** | Real SQLite; `:memory:` for true/false-today; **temp file** for yesterday-boundary (2nd conn seeds `sent_at`) | DB | `DB_PATH` in db.js |
| TEST-04 | `shouldNotifyOwner`/`NO_OWNER_NOTIFY_FUNNELS`: beefor exact-string quirks | **Pure** unit tests | Pure | already exported |
| TEST-05 (rate-limit) | 5 attempts→block, block message/minutesLeft, block clears after window | Export helpers + `mock.timers`; reset Map per test | Auth | export `checkRateLimit`/`recordFailedAttempt`/`clearAttempts`, `_loginAttempts`; env `JWT_SECRET`+`DB_PATH` |
| TEST-05 (password) | bcrypt hash→match true/false; legacy plaintext→match true/false; `$2` discriminator | Export `verifyPassword`; unit test both branches (bcrypt hash generated in-test) | Auth | export `verifyPassword` (DRYs 2 call sites) |

**Optional (not required by TEST-01..05):** an integrated `runCheck` golden test would exercise dedup+funnel+notify together, but requires mocking axios AND nodemailer AND a real DB simultaneously — higher complexity, defer unless the planner wants one end-to-end smoke. If written: `mock.method(nodemailer, 'createTransport', () => ({ sendMail: mock.fn(async () => ({ messageId: 'x' })) }))`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest/Mocha/Vitest + config file for a small Node backend | `node:test` built-in runner | Stable since Node 20 (Apr 2023) | Zero-dep, no config; exactly the project's ethos. |
| `sinon` for spies/stubs | `mock.fn`/`mock.method` built-in | Node 20+ | No spy library needed. |
| `sinon`/`@sinonjs/fake-timers` for time | `mock.timers` (incl. `Date`) built-in | Node 20.4+ (Date support later) | Deterministic time in-runtime; still experimental (warning only). |
| `nyc`/istanbul CLI | `c8` (V8 coverage) or `--experimental-test-coverage` | c8 mature; native coverage still experimental | D-02 chose c8 — the mature native-V8 option. |

**Deprecated/outdated:** Nothing in the chosen stack is deprecated. Avoid pulling `sinon`, `nock`, `mocha`, `chai` — all superseded by built-ins for this phase's needs.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `c8@12` is the correct, legitimate coverage package (slopcheck unavailable this session) | Standard Stack / Package Audit | Low — user-locked (D-02), registry-verified, no postinstall; planner still gates install behind human-verify per protocol. |
| A2 | Attaching helper functions as properties on `module.exports = router` does not affect Express routing | Pattern 4 | Low — Express uses the router function; extra props are ignored. Planner should smoke-test the server still boots after the auth.js edit. |
| A3 | Byte-copying the `/[̀-ͯ]/g` regex during `isExcludedStage` extraction preserves behavior exactly | Pattern 1 / Pitfall 1 | Medium if rewritten — a changed range alters stage matching. Mitigation: golden tests + byte-identical copy. |
| A4 | Temp-file `DB_PATH` allows a second better-sqlite3 connection to seed `sent_at=yesterday` rows | Pitfall 4 / TEST-03 | Low — standard SQLite file multi-connection; `:memory:` isolation already empirically confirmed as the reason to use a file here. |
| A5 | `.gitignore` will be configured to exclude the Agendor token and raw fixture captures | Fixtures | Medium — if not, PII/token could leak. Planner must add a task to verify `.gitignore` before committing fixtures. |

## Open Questions

1. **Should an integrated `runCheck` golden test be in Phase 1 scope?**
   - What we know: CONTEXT says "onde aplicável (runCheck)" — optional. TEST-01..05 do not require it.
   - What's unclear: whether the team wants an end-to-end dedup+funnel+notify smoke now vs. deferring.
   - Recommendation: Defer to keep the phase focused; the constituent rules are already covered. Add only if planner wants one smoke test (needs axios+nodemailer+DB mocks together).

2. **Coverage threshold enforcement in CI?**
   - What we know: c8 supports `--check-coverage --lines N`. Phase 2 owns CI.
   - Recommendation: Do NOT set a hard threshold in Phase 1 (would fail the mostly-untested codebase). Report coverage only; let Phase 2 decide thresholds.

3. **Where do fixture `.gitignore` entries live** (root vs `backend/.gitignore`)?
   - Recommendation: planner adds explicit ignores for the token env and any `*.raw.json`, verified before the first fixture commit (ties to A5).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (runtime + `node:test`) | TEST-01..05 | ✓ (PATH-dependent) | 22.13.1 | Must `export PATH="$HOME/bin:$PATH"` — node not on default PATH (binaries in `/tmp/node-v22.13.1-darwin-arm64/bin/`) |
| npm registry (install c8) | TEST-01 coverage | ✗ this session (offline) | — | c8 install must run where network is available; slopcheck likewise |
| `better-sqlite3` | TEST-03/05 DB tests | ✓ (installed dep) | ^9.6.0 | — |
| `bcryptjs` | TEST-05 password | ✓ (installed dep) | ^3.0.3 | — |
| `axios`/`nodemailer` (stub targets) | TEST-02 (opt. runCheck) | ✓ (installed deps) | ^1.7.2 / ^6.9.13 | — |
| slopcheck (package legitimacy) | Package audit | ✗ (offline pip) | — | Registry facts + postinstall checked manually; planner gates c8 install behind human-verify |

**Missing dependencies with no fallback:** none that block writing tests. c8 install + slopcheck require network — run the install task in a networked step (Phase 2 CI already assumes network).

**Missing dependencies with fallback:** network-dependent installs — gate behind a checkpoint, run where npm is reachable.

## Validation Architecture

> nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in, Node 22.13.1) + `node:assert/strict`; coverage `c8@12` |
| Config file | none for runner; `backend/.c8rc.json` for coverage (Wave 0) |
| Quick run command | `cd backend && npm test` (i.e. `node --test`) — must `export PATH="$HOME/bin:$PATH"` first |
| Full suite command | `cd backend && npm run test:coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Runner wired, `npm test` green | smoke | `cd backend && npm test` | ❌ Wave 0 |
| TEST-02 | `getStaleDeals` rules (threshold/category/stage/owner/funnel) | unit + integration | `node --test test/agendor.pure.test.js test/agendor.getStaleDeals.test.js` | ❌ Wave 0 |
| TEST-03 | Dedup `alreadyNotifiedToday` incl. day-boundary | integration (real SQLite) | `node --test test/db.dedup.test.js` | ❌ Wave 0 |
| TEST-04 | Funnel suppression / beefor quirks | unit | `node --test test/agendor.pure.test.js` | ❌ Wave 0 |
| TEST-05 | Rate-limit + password verification | unit (mock.timers) | `node --test test/auth.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test` (fast; whole suite is unit/in-memory — sub-second to low-seconds).
- **Per wave merge:** `npm run test:coverage` (adds c8 report).
- **Phase gate:** `npm test` green + coverage report generated before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `backend/test/setup.js` — sets `JWT_SECRET` (≥16), `DB_PATH`, `AGENDOR_TOKEN`; shared before requires
- [ ] `backend/test/helpers/fakeAxios.js` — `mock.method(axios,'create',…)` installer
- [ ] `backend/test/helpers/tmpDb.js` — temp-file DB path + cleanup (for TEST-03 boundary)
- [ ] `backend/test/fixtures/synthetic/*.json` — one per rule
- [ ] `backend/test/fixtures/real-deals.sample.json` — anonymized (via capture script)
- [ ] `backend/test/*.test.js` — the four test files above
- [ ] `backend/.c8rc.json` — coverage config
- [ ] Install: `cd backend && npm install --save-dev c8@12` (gated by checkpoint:human-verify — slopcheck unavailable)
- [ ] Seam edits: `agendor.js` (export `getDealType`, add+export `isExcludedStage`), `db.js` (`DB_PATH`), `auth.js` (export helpers + `verifyPassword`)

## Security Domain

> `security_enforcement` not set to false → included. This is a test-authoring phase (no new attack surface), but TEST-05 touches auth logic and fixtures touch secrets.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (TEST-05) | Characterize existing bcrypt verification + rate-limit; do not weaken. `verifyPassword` preserves `$2` discriminator. |
| V3 Session Management | no | JWT issuance not modified this phase |
| V4 Access Control | no | `requireAdmin` not modified (Phase 6 SEC-03) |
| V5 Input Validation | no | No new inputs |
| V6 Cryptography | yes (indirect) | Never hand-roll password compare — reuse `bcryptjs`; tests must not log real hashes/passwords |
| V7 Error/Logging | yes | Fixtures/tests must not print the Agendor token, SMTP creds, or PII |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Real Agendor token committed via fixture capture | Information Disclosure | Token via env only; `.gitignore` raw captures; commit only anonymized `*.sample.json` (D-10) |
| PII (owner/author/org names, titles, emails) in committed fixtures | Information Disclosure | Anonymize before commit (capture script strips PII to synthetic labels) |
| Test weakening auth (e.g., asserting a looser password check to make a test pass) | Tampering / Elevation | Characterization only — pin CURRENT behavior; any auth *change* is Phase 6 with its own test |
| Tests writing to the real `backend/agendor.db` | Tampering | `DB_PATH=:memory:`/temp file in `setup.js`; never rely on default path in tests |
| Leaking real `JWT_SECRET` | Information Disclosure | Tests set a throwaway `JWT_SECRET` in `setup.js`; never read the production `.env` |

## Sources

### Primary (HIGH confidence)
- Direct source reads (2026-07-22): `backend/src/agendor.js`, `db.js`, `emailer.js`, `scheduler.js`, `secret.js`, `routes/auth.js`, `package.json`, `CLAUDE.md` — exact line references used throughout.
- Empirical verification on installed **Node 22.13.1**: `node --test` file-discovery glob (`*.test.js` anywhere + loose `.js` under `test/`; `random.js` at root NOT run); better-sqlite3 `:memory:` connection isolation (second connection sees no shared table); `mock.timers.enable({apis:['Date']})` + `tick()` advancing `Date.now` by exactly 900000ms; `mock.method`/`mock.fn` present.
- npm registry (2026-07-22): `c8` 12.0.0 (modified 2026-07-16, no `postinstall`), `nock` 14.0.16 (no `postinstall`).

### Secondary (MEDIUM confidence)
- Node.js official docs for `node:test`, `node:assert`, `mock`/`mock.timers` API surface (training + cross-checked against empirical runtime behavior above).

### Tertiary (LOW confidence)
- None relied upon; slopcheck could not run (offline) — c8 legitimacy corroborated via registry facts + postinstall check instead, and flagged `[ASSUMED]` per protocol.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — runner/coverage verified on the actual installed runtime; c8 registry-verified.
- Architecture (seams/mocking/DB): HIGH — grounded in exact source lines + empirical `:memory:`/glob/timers checks.
- Pitfalls: HIGH — each derived from a verified fact (isolation, glob, load-time side-effects, regex literal).
- Package legitimacy: MEDIUM — slopcheck unavailable offline; mitigated by registry + postinstall verification and human-verify gating.

**Research date:** 2026-07-22
**Valid until:** ~2026-08-21 (stable domain; built-in `node:test` and c8 are slow-moving). Re-verify c8 major version if the install is delayed weeks.
