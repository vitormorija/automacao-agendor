# Phase 3: Config & Segredos por Ambiente - Pattern Map

**Mapped:** 2026-07-29
**Files analyzed:** 18 (9 novos, 9 modificados)
**Analogs found:** 16 / 18

> Todos os caminhos são relativos à raiz do repositório (`/Users/vitormorija/Automacao_agendor`).
> Números de linha conferidos contra `HEAD` (branch `chore/production-readiness`, commit `a50eb6d`).

---

## File Classification

### Arquivos NOVOS

| Novo arquivo | Role | Data Flow | Analog mais próximo | Match |
|--------------|------|-----------|---------------------|-------|
| `backend/src/config.js` | config / validator | transform (função pura) + boot side-effect | `backend/src/secret.js` + shape de `backend/src/logger.js` | role-match (desvio deliberado — ver nota) |
| `backend/test/config.validateEnv.test.js` | test | pure-function | `backend/test/agendor.pure.test.js` | exact |
| `backend/test/config.dotenvPath.test.js` | test | file-I/O | `backend/test/smoke.test.js` + `helpers/tmpDb.js` | partial |
| `backend/test/db.smtpPassMigration.keep.test.js` | test | CRUD (SQLite em arquivo temp) | `backend/test/db.dedup.test.js` | exact |
| `backend/test/db.smtpPassMigration.clear.test.js` | test | CRUD (SQLite em arquivo temp) | `backend/test/db.dedup.test.js` | exact |
| `backend/test/emailer.smtpPass.test.js` | test | module-edge mock | `backend/test/agendor.getStaleDeals.test.js` + `backend/test/helpers/fakeAxios.js` | exact |
| `backend/test/config.route.smtpPass.test.js` | test | request-response (via seam, não HTTP) | `backend/test/auth.test.js` (seam-export de `routes/auth.js:359-369`) | role-match (exige criar o seam) |
| `backend/test/envExample.test.js` | test (meta) | file-I/O | — | **sem analog** |
| `backend/test/secrets.grep.test.js` | test (meta) | file-I/O / subprocess | — | **sem analog** |

### Arquivos MODIFICADOS

| Arquivo modificado | Role | Data Flow | Ponto exato | Padrão a seguir |
|--------------------|------|-----------|-------------|-----------------|
| `backend/src/index.js` | bootstrap | boot sequence | linha 1 (dotenv path) + nova linha 2 (`require('./config')`) | seção `// ── Nome ──` já usada nas linhas 12/20/38/55/59 |
| `backend/src/db.js` | model / data-access | CRUD + migration | linha 110 (remover do `defaults`) e após a linha 124 (nova migração) | migrações idempotentes `db.js:79-94` com `catch (_) {}` |
| `backend/src/emailer.js` | service | request-response (SMTP) | linha 12 (`pass:`) | função privada não exportada; comentário PT explicando o *porquê* |
| `backend/src/routes/config.js` | route | request-response | linha 51 (allowlist do PUT) | allowlist declarativa `const allowed = [...]` já existente |
| `frontend/src/components/ConfigPanel.jsx` | component | request-response | linha 2 (imports `Eye`/`EyeOff`), 18 (`showPass`), 241-258 (`<Field>`) | `<Field>` / `<Section>` locais (linhas 299-319) |
| `backend/.env.example` | config | — | 41 linhas atuais | seções `# ── Nome ───` já usadas |
| `.github/workflows/ci.yml` | CI config | — | após a linha 48 (novo job `secrets`) | estrutura dos jobs `backend`/`frontend` |
| `backend/test/setup.js` | test fixture | — | **apenas append após a linha 32** (Pitfall 10) | guarda `if (!process.env.X)` das linhas 14-24 |
| `deploy/branch-protection.md` | doc / runbook | — | linhas 43, 71 e §3/§4 citam `["backend", "frontend"]` | runbook numerado com blocos `gh api` |
| `README.md` (opcional, D-12) | doc | — | linhas 77-95 (tabela de variáveis) | tabela markdown existente |

---

## Pattern Assignments

### `backend/src/config.js` (config/validator, transform + boot side-effect)

**Analog:** `backend/src/secret.js` (16 linhas — arquivo inteiro lido)

Este é o único caso da fase em que o analog deve ser **seguido em espírito e desviado em forma**.
D-06 manda "seguir o padrão de `secret.js`"; o RESEARCH mediu que o `throw`-no-topo desse padrão tem
50 % de cobertura de branches e a folga do gate é de ~10 branches. A solução é manter o **efeito de
boot** de `secret.js` e mover a **regra** para uma função pura.

**Padrão de comentário + fail-fast a copiar** (`backend/src/secret.js:1-14`, arquivo completo):

```javascript
// Segredo de assinatura dos tokens JWT.
//
// Resolvido uma única vez no carregamento do módulo. NÃO há fallback: se a
// variável de ambiente estiver ausente ou for muito curta, o processo falha no
// boot. Isso evita o risco de rodar em produção com um segredo previsível
// (que permitiria forjar tokens de autenticação).
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error(
    'JWT_SECRET ausente ou muito curto. Defina a variável de ambiente JWT_SECRET ' +
      'com pelo menos 16 caracteres (ex.: gere com `openssl rand -hex 32`).',
  );
}

module.exports = { JWT_SECRET };
```

O que copiar literalmente:
- Cabeçalho em PT explicando **por que não há fallback** (o *porquê*, não o *quê*).
- `throw new Error(...)` — **nunca** `process.exit(1)` (mata o teste e o drain do logger).
- Mensagem que nomeia a variável **e** diz como obter o valor (`openssl rand -hex 32`).
- `module.exports = { ... }` único no fim.

O que **não** copiar: o `if` no escopo de topo do módulo como única sede da regra. Mover para
`validateEnv(env)` / `findMissing(env)` e chamar `validateEnv(process.env)` no fim, antes do
`module.exports`.

**Shape de módulo "sem dependências, lê env, exporta objeto"** — analog `backend/src/logger.js:1-9,35-40`:

```javascript
// Logger estruturado mínimo (sem dependências).
//
// Em produção emite uma linha JSON por evento (fácil de coletar/parsear).
// Em desenvolvimento emite texto legível com timestamp e nível.
// Substitui o uso ad-hoc de console.* espalhado pelo código.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;
const isProd = process.env.NODE_ENV === 'production';
...
module.exports = {
  error: (...a) => emit('error', a),
  ...
};
```

Note o uso de `??` e de constantes em `SCREAMING_SNAKE_CASE` no topo — mesmo estilo para o array
`REQUIRED` do `config.js`.

**Logging:** `logger.warn` com tag entre colchetes. Padrão em uso: `[Scheduler]`, `[Auth]`,
`[Emailer]`, `[Agendor]`. Usar `[Config]`. `console.*` é proibido em código novo (CLAUDE.md).

---

### `backend/src/index.js` (bootstrap, boot sequence) — MODIFICAR

**Analog:** ele mesmo (o padrão de ordenação já está no arquivo).

**Estado atual, linhas 1-10** (o ponto de inserção):

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const app = express();
```

Duas mudanças, ambas nesse bloco:
1. Linha 1 → `require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })`
   (Pitfall 1 — o `path` já é requerido na linha 7, mas o `require` inline é necessário porque a
   linha 1 vem antes).
2. Nova linha 2 → `require('./config');` — **antes** de `./middleware/auth` (linha 56) e de
   `./routes/auth` (linha 60, que puxa `db.js` e abre o SQLite no load).

**Padrão de comentário de seção do arquivo** (linhas 12, 20, 38, 55, 59) — usar o mesmo se o bloco
crescer:

```javascript
// ── Segurança: cabeçalhos HTTP ───────────────────────────────────
```

**Padrão de default-com-fallback para variável não-obrigatória** (linhas 20-23) — é o contraste que
`config.js` **não** deve replicar para as 5 obrigatórias de D-04:

```javascript
// ── CORS: em produção, aceita só a origin do servidor ───────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:3001'];
```

⚠️ `src/index.js` está em `exclude` do `.c8rc.json` — **nada de lógica nova aqui**, só o `require`.

---

### `backend/src/db.js` (model, CRUD + migration) — MODIFICAR

**Analog:** o próprio `db.js`, linhas 79-94 — o padrão de migração idempotente que o CONTEXT.md
(§Established Patterns) manda seguir.

**Padrão de migração idempotente com `catch (_) {}` deliberado** (`backend/src/db.js:79-94`):

```javascript
// Migrations: adiciona colunas ao notification_log se ainda não existirem
const migrations = [
  `ALTER TABLE notification_log ADD COLUMN deal_updated_at TEXT`,
  `ALTER TABLE notification_log ADD COLUMN deal_type TEXT`,
  ...
];
for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch (_) {
    /* coluna já existe */
  }
}
```

O comentário dentro do `catch` explicando **por que** o silêncio é intencional é parte do padrão —
ver também as linhas 40-49, 52-63 e 66-77 (`} catch (_) {}` para `CREATE TABLE IF NOT EXISTS`).

**Ponto de remoção — objeto `defaults`** (`backend/src/db.js:103-115`):

```javascript
// Valores padrão de configuração
const defaults = {
  stale_days: '15',
  admin_email: process.env.ADMIN_EMAIL || '',
  smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtp_port: process.env.SMTP_PORT || '587',
  smtp_user: process.env.SMTP_USER || '',
  smtp_pass: process.env.SMTP_PASS || '',   // ← linha 110: REMOVER (Pitfall 3)
  smtp_from: process.env.SMTP_FROM || '',
  cron_schedule: '0 8 * * *', // 8h todo dia
  notifications_enabled: 'true',
  notify_author: 'false',
};
```

**Loop de seed — a nova migração vai imediatamente DEPOIS deste bloco** (`backend/src/db.js:117-124`):

```javascript
for (const [key, value] of Object.entries(defaults)) {
  const existing = db
    .prepare('SELECT value FROM config WHERE key = ?')
    .get(key);
  if (!existing) {
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(key, value);
  }
}
```

**Helpers disponíveis logo abaixo** (`backend/src/db.js:126-136`) — a migração pode usá-los porque
`function` declarations sofrem hoisting:

```javascript
function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(
    key,
    String(value),
  );
}
```

⚠️ `db.js` **não** requer `logger.js` hoje (linhas 1-2 só têm `better-sqlite3` e `path`). Adicionar
`const logger = require('./logger');` no topo — sem ciclo, `logger.js` só depende de `process.env`.
Import solto no topo, sem separação por grupos, como manda o padrão do projeto.

---

### `backend/src/emailer.js` (service, request-response SMTP) — MODIFICAR

**Analog:** o próprio arquivo — `getPublicBaseUrl()` (linhas 23-40) é o exemplo de "helper privado que
lê `process.env` com comentário explicando o *porquê*", que é exatamente o que a exceção de D-01 pede.

**Ponto de mudança** (`backend/src/emailer.js:1-15`):

```javascript
const nodemailer = require('nodemailer');
const { getConfig } = require('./db');
const { shouldNotifyOwner } = require('./agendor');

function createTransporter() {
  return nodemailer.createTransport({
    host: getConfig('smtp_host'),
    port: parseInt(getConfig('smtp_port')),
    secure: parseInt(getConfig('smtp_port')) === 465,
    auth: {
      user: getConfig('smtp_user'),
      pass: getConfig('smtp_pass'),   // ← linha 12: → process.env.SMTP_PASS
    },
  });
}
```

**Padrão de comentário "explique o porquê" a copiar** (`backend/src/emailer.js:23-27`) — é o molde
para o comentário que documenta a exceção deliberada ao padrão "config vem do banco":

```javascript
// Retorna a BASE_URL pública do backend quando configurada e acessível externamente.
// Se não houver BASE_URL ou ela apontar para localhost/127.0.0.1, retorna null —
// nesse caso os emails usam o link direto do Agendor (sem tracking de cliques),
// para não enviar URLs quebradas para usuários em outras máquinas/celulares.
function getPublicBaseUrl() {
  const raw = (process.env.BASE_URL || '').trim();
```

Note o `(process.env.X || '').trim()` — mesma normalização a usar em `SMTP_PASS`.

`verifySmtp()` e `POST /api/config/test-smtp` passam por `createTransporter()` e herdam a mudança:
nada a fazer neles.

---

### `backend/src/routes/config.js` (route, request-response) — MODIFICAR

**Analog:** o próprio arquivo (allowlist declarativa) + `backend/src/routes/auth.js:359-369` (seam de
teste).

**Ponto de remoção — allowlist do PUT** (`backend/src/routes/config.js:43-55`):

```javascript
// PUT /api/config
router.put('/', (req, res) => {
  const allowed = [
    'stale_days',
    'admin_email',
    'notify_author',
    'smtp_host',
    'smtp_port',
    'smtp_user',
    'smtp_pass',        // ← linha 51: REMOVER (Pitfall 4)
    'smtp_from',
    'cron_schedule',
    'notifications_enabled',
  ];
```

**NÃO mexer** no mascaramento do GET (`routes/config.js:34-40`) — com o valor zerado o ternário já
devolve `''`:

```javascript
// GET /api/config
router.get('/', (req, res) => {
  const config = getAllConfig();
  // Nunca expor a senha SMTP no GET
  const safe = { ...config, smtp_pass: config.smtp_pass ? '••••••••' : '' };
  res.json(safe);
});
```

**Padrão de seam para tornar a allowlist testável** — `backend/src/routes/auth.js:359-369` é o único
precedente no repo de "router exportado + internals anexados como props":

```javascript
module.exports = router;

// Seams de teste (TEST-05): expostos sem alterar o contrato HTTP —
// app.use() só precisa que module.exports seja a função router; estas props
// são ignoradas pelo Express e permitem testar a lógica pura sem subir servidor.
module.exports.checkRateLimit = checkRateLimit;
module.exports.recordFailedAttempt = recordFailedAttempt;
module.exports.clearAttempts = clearAttempts;
module.exports.verifyPassword = verifyPassword;
module.exports._loginAttempts = loginAttempts;
```

**Recomendação concreta para o planner:** içar o array `allowed` para uma constante de módulo
(`const ALLOWED_KEYS = [...]`, acima do handler) e anexá-la como seam
(`module.exports.ALLOWED_KEYS = ALLOWED_KEYS;`). Isso torna
`test/config.route.smtpPass.test.js` uma asserção de uma linha
(`assert.equal(ALLOWED_KEYS.includes('smtp_pass'), false)`) — sem HTTP, sem supertest (que não é
dependência do projeto), e sem consumir branches do gate.

---

### `frontend/src/components/ConfigPanel.jsx` (component, request-response) — MODIFICAR

**Analog:** o próprio arquivo — os sub-componentes locais `Section`/`Field` (linhas 299-319) e o
bloco SMTP existente.

**Imports a limpar** (`frontend/src/components/ConfigPanel.jsx:1-3`):

```jsx
import { useState, useEffect } from 'react';
import { Save, TestTube, Eye, EyeOff } from 'lucide-react';   // ← Eye/EyeOff ficam órfãos
import toast from 'react-hot-toast';
```

**State a remover** (linha 18, no meio do bloco 14-20):

```jsx
  const [showPass, setShowPass] = useState(false);
```

**Bloco a remover na íntegra** (`frontend/src/components/ConfigPanel.jsx:241-258`):

```jsx
        <Field label="Senha / App Password">
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={config.smtp_pass || ''}
              onChange={(e) => handleChange('smtp_pass', e.target.value)}
              placeholder="••••••••"
              className="input w-full pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>
```

**Padrão de sub-componente/estilo local** (`frontend/src/components/ConfigPanel.jsx:310-319`) — a nota
substituta deve usar as mesmas classes Tailwind desta família (`text-sm`, `text-gray-*`,
`rounded-lg`, `border-gray-200`):

```jsx
function Field({ label, help, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      {help && <p className="text-xs text-gray-400 mb-1.5">{help}</p>}
      {children}
    </div>
  );
}
```

**Não mexer no `save()`** (linhas 45-63): envia `{...config}` inteiro, e o backend passa a ignorar
`smtp_pass` pela allowlist. Sem `;` no fim das statements — este arquivo é ESM/JSX e segue o estilo
do diretório `frontend/`.

---

### `backend/test/db.smtpPassMigration.keep.test.js` e `.clear.test.js` (test, CRUD)

**Analog:** `backend/test/db.dedup.test.js` — **match exato**. É o único teste do repo que usa banco
em arquivo temporário e ordena `DB_PATH` antes do `require('./setup')`.

**Preâmbulo a copiar quase literalmente** (`backend/test/db.dedup.test.js:12-32`):

```javascript
const { makeTmpDbPath, openRaw } = require('./helpers/tmpDb');

// Cria o arquivo temporário e fixa DB_PATH ANTES de qualquer require('../src/db'):
// db.js lê process.env.DB_PATH no momento do load e abre a conexão ali (seam 01-01).
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

// setup.js só define DB_PATH se ausente — como já definimos acima, o arquivo temp vence.
require('./setup');

const { test, after } = require('node:test');
const assert = require('node:assert/strict');

// require do db DEPOIS de setar DB_PATH: a conexão singleton abre no arquivo temp.
const db = require('../src/db');

after(() => {
  // Fecha a conexão do singleton e remove o arquivo temp; backend/agendor.db intocado.
  db.closeDb();
  cleanup();
});
```

**Seed por segunda conexão** (`backend/test/db.dedup.test.js:62-82`) — é como semear
`config.smtp_pass = 'senha-antiga'` antes do `require('../src/db')`:

```javascript
  const seed = openRaw(DB_PATH);
  try {
    seed
      .prepare(
        `INSERT INTO notification_log
           (deal_id, deal_title, owner_name, owner_email, admin_email, sent_at, days_stale, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(dealId, 'Deal notificado ontem', /* … */);
  } finally {
    seed.close();
  }
```

⚠️ **Ordenação que diverge do analog** — `SMTP_PASS` é sobrescrito **sem guarda** em
`backend/test/setup.js:31`:

```javascript
// DIFERENTEMENTE dos presets guardados acima, estas duas variáveis são SEMPRE
// sobrescritas (sem guarda). ...
process.env.SMTP_PASS = '';
process.env.ADMIN_EMAIL = '';
```

Logo, em `.clear.test.js` a atribuição `process.env.SMTP_PASS = 'senha-do-env'` tem de vir **DEPOIS**
do `require('./setup')` e **ANTES** do `require('../src/db')` — o inverso da ordem usada para
`DB_PATH`. Inverter faz o teste passar no ramo errado.

**Helper reaproveitado** (`backend/test/helpers/tmpDb.js:22-49`, arquivo completo lido) — `makeTmpDbPath()`
e `openRaw()` já existem e cobrem exatamente esse caso. Nada novo a criar.

---

### `backend/test/config.validateEnv.test.js` (test, pure-function)

**Analog:** `backend/test/agendor.pure.test.js` — **match exato** (teste de função pura, sem mocks,
sem DB).

**Estrutura completa a copiar** (`backend/test/agendor.pure.test.js:1-18`):

```javascript
// Caracterização (golden) do "pure lane" de agendor.js: helpers puros sem mocks.
// Estes testes DOCUMENTAM O COMPORTAMENTO ATUAL (inclusive quirks), não o ideal.
// Qualquer alteração futura na lógica de exclusão por etapa ou na classificação
// Lead/Negócio deve falhar aqui antes de chegar em produção (TEST-02 / D-04).
require('./setup');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getDealType, isExcludedStage } = require('../src/agendor');

test('isExcludedStage: correspondência parcial (substring) — documenta comportamento ATUAL', () => {
  // "perd" casa "Perdida"
  assert.equal(isExcludedStage('Oportunidade Perdida'), true);
  ...
});
```

Convenções do repo visíveis aqui:
- `require('./setup')` **sempre na primeira linha executável**.
- `const { test } = require('node:test')` + `require('node:assert/strict')`.
- Nome do teste em PT, no formato `função: cenário — nota`.
- Cabeçalho de arquivo em PT explicando **o que o teste protege** e citando o requisito/decisão.
- Comentários inline justificando cada asserção.

Para o ramo `production`, chamar `validateEnv({ NODE_ENV: 'production', ... })` com objeto literal —
sem tocar em `process.env`, o que dispensa arquivo separado para *esse* caso (a separação por arquivo
só é obrigatória onde há efeito colateral no `require`, i.e. os testes de migração de `db.js`).

Para o ramo `development`, capturar o `logger.warn` com `mock.method` — analog do uso de `mock` em
`backend/test/auth.test.js:14,53-62`:

```javascript
const { test, beforeEach, mock } = require('node:test');
...
  mock.timers.enable({ apis: ['Date'] });
  try {
    ...
  } finally {
    mock.timers.reset();
  }
```

---

### `backend/test/emailer.smtpPass.test.js` (test, module-edge mock)

**Analog:** `backend/test/helpers/fakeAxios.js` + `backend/test/agendor.getStaleDeals.test.js` —
**match exato** no padrão "stubar a borda externa antes do primeiro `require` do módulo sob teste".

**Padrão de stub de borda** (`backend/test/helpers/fakeAxios.js:1-17`, arquivo completo):

```javascript
// Helper de teste (NÃO define testes) — instala um stub da instância axios que
// agendor.js cria no load do módulo. Padrão D-05: mockar a borda HTTP (axios) sem
// tocar na lógica interna de getStaleDeals. Precisa ser instalado ANTES do primeiro
// require('../src/agendor'), pois agendor.js faz `const api = axios.create(...)` no load.
const { mock } = require('node:test');
const axios = require('axios');

// routeHandler(url, config) => payload no formato do axios: { data: <envelope Agendor> }
function installFakeAxios(routeHandler) {
  const fakeInstance = {
    get: mock.fn(async (url, config) => routeHandler(url, config)),
  };
  mock.method(axios, 'create', () => fakeInstance);
  return fakeInstance;
}

module.exports = { installFakeAxios };
```

Transposição direta: `mock.method(nodemailer, 'createTransport', (opts) => { captured = opts; return fake; })`.
`emailer.js` requer `nodemailer` no load (linha 1) mas só chama `createTransport()` dentro de
`createTransporter()` (linha 6) — então o stub pode ser instalado depois do `require`, o que é mais
folgado que o caso do axios.

**Ordem de instalação e comentário** (`backend/test/agendor.getStaleDeals.test.js:23-43`):

```javascript
// Instala o stub ANTES de exigir agendor.js (a instância `api` é criada no load).
installFakeAxios((url) => { /* … */ });

const { getStaleDeals } = require('../src/agendor');
```

Se o stub do nodemailer for reusado por mais de um teste, criar
`backend/test/helpers/fakeMailer.js` no mesmo formato de `fakeAxios.js` (cabeçalho "Helper de teste
(NÃO define testes) — …", `module.exports = { installX }`).

---

### `backend/test/config.route.smtpPass.test.js` (test, seam de rota)

**Analog:** `backend/test/auth.test.js` — único teste do repo que exercita um módulo de rota.
Match de role, mas exige criar o seam em `routes/config.js` (ver acima).

**Padrão de import do router + destructuring dos seams** (`backend/test/auth.test.js:9-26`):

```javascript
// setup PRIMEIRO: preseta JWT_SECRET/DB_PATH(:memory:)/AGENDOR_TOKEN antes de
// requerer auth.js, cujo import roda ensureDefaultUsers() (DB) e exige secret.js.
// Sem isso o require lançaria ou tocaria o backend/agendor.db de produção.
require('./setup');

const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

// auth.js exporta o router (function) com os seams anexados como props.
const auth = require('../src/routes/auth');
const { checkRateLimit, recordFailedAttempt, clearAttempts, verifyPassword } =
  auth;
```

⚠️ `routes/config.js:4-6` requer `../db`, `../scheduler` e `../emailer` no load — `require('./setup')`
antes é obrigatório (senão abre `backend/agendor.db` de produção).

---

### `backend/test/envExample.test.js` e `backend/test/secrets.grep.test.js` — SEM ANALOG

Ver §"No Analog Found". Usar o código do `03-RESEARCH.md` §Code Examples como base, adaptando ao
cabeçalho/convenções descritos em `agendor.pure.test.js` acima.

---

### `backend/.env.example` (config) — MODIFICAR

**Analog:** o próprio arquivo (41 linhas, lido na íntegra).

**Padrão de seção + comentário dev/prod já presente** (`backend/.env.example:8-11` e `22-25`):

```bash
# ── Segurança / Autenticação ─────────────────────────────────────
# OBRIGATÓRIO: segredo de assinatura dos tokens JWT (mín. 16 caracteres).
# Gere um valor forte com: openssl rand -hex 32
JWT_SECRET=troque-por-um-segredo-forte-e-aleatorio

# ── CORS: origens permitidas (separe por vírgula) ─────────────────
# Em desenvolvimento deixe em branco (aceita localhost)
# Em produção coloque o domínio/IP do servidor
ALLOWED_ORIGINS=http://agendor.cadmus.com.br
```

O arquivo já tem exatamente a convenção que D-07/D-10 pedem (marcador `# OBRIGATÓRIO:`, instrução de
como gerar, nota dev vs prod). Reorganizar em blocos "OBRIGATÓRIAS" / "OPCIONAIS" preservando esse
estilo. Linhas a alterar: adicionar `DB_PATH`, `LOG_LEVEL`, `BASE_URL_FRONTEND`; remover
`STALE_DAYS` (linhas 40-41, D-12).

⚠️ Pitfall 9: placeholders de baixa entropia em PT. `JWT_SECRET=troque-por-um-segredo-forte-e-aleatorio`
(linha 11 atual) é o modelo — não gerar valores realistas.

---

### `.github/workflows/ci.yml` (CI config) — MODIFICAR

**Analog:** os jobs `backend` e `frontend` do próprio arquivo (48 linhas, lido na íntegra).

**Estrutura de job + convenção de comentário a copiar** (`.github/workflows/ci.yml:16-31`):

```yaml
jobs:
  # id do job = contexto do required status check (Pitfall 3) — NÃO adicionar name: custom.
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '20' # D-09 — alinhado ao alvo de produção
          cache: npm
          cache-dependency-path: backend/package-lock.json # lockfile por pacote (sem workspaces)
      - run: npm ci
      - run: npm run lint # biome lint . (warn-tolerante, D-06 — warnings não falham)
      - run: npm run test:coverage # node --test sob c8 (gate WR-03 via .c8rc.json)
```

Convenções obrigatórias que o job `secrets` precisa herdar:
- Comentário `# id do job = contexto do required status check (Pitfall 3) — NÃO adicionar name: custom.`
  imediatamente acima do id do job (aparece 2× no arquivo, linhas 16 e 33).
- Actions pinadas por **major** com `@v7` (`actions/checkout@v7`, `actions/setup-node@v7`).
  → `gitleaks/gitleaks-action@v3` mantém o estilo; registrar o SHA em comentário na mesma linha.
- Comentário de fim de linha justificando cada valor não-óbvio (`# D-09`, `# lockfile por pacote…`).

**`permissions:` least-privilege no topo** (`.github/workflows/ci.yml:11-13`):

```yaml
# Least-privilege: o workflow não precisa escrever nada (lint/test/build são públicos).
permissions:
  contents: read
```

⚠️ Esse `permissions:` de topo **zera** os demais escopos. O job `secrets` precisa do seu próprio
bloco `permissions:` com `contents: read` + `pull-requests: read` (a action lista os commits do PR).

**`on:` gatilhos** (linhas 6-9) — não alterar; `pull_request` + `push: branches: [main]` é
exatamente o escopo que mantém o token histórico fora do range escaneado.

---

### `backend/test/setup.js` (test fixture) — MODIFICAR POR APPEND

**Analog:** o próprio arquivo (32 linhas, lido na íntegra).

**Padrão de preset guardado** (`backend/test/setup.js:14-24`):

```javascript
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdef';
}

if (!process.env.DB_PATH) {
  process.env.DB_PATH = ':memory:';
}

if (!process.env.AGENDOR_TOKEN) {
  process.env.AGENDOR_TOKEN = 'test';
}
```

Novos presets (`ALLOWED_ORIGINS`, `ADMIN_USERS`, se necessários) seguem essa forma **guardada** e
entram **anexados após a linha 32**.

🔴 **Pitfall 10 — restrição de edição:** a linha 15 (`test-jwt-secret-0123456789abcdef`) é um
falso-positivo conhecido do gitleaks. Se ela for **re-adicionada** no diff (reformatação, mover o
arquivo, reescrever o bloco), o job `secrets` barra o próprio PR da fase. **Editar apenas por
acréscimo no fim do arquivo; não tocar nas linhas 1-32.**

---

### `deploy/branch-protection.md` (doc/runbook) — MODIFICAR

**Analog:** o próprio arquivo. Estrutura numerada existente:

```
## 1. Pré-requisitos
## 2. Aplicar a proteção (via `gh api`)      ← linha 43: "contexts": ["backend", "frontend"]
## 3. Verificar que ficou ativo              ← linha 71: mesma lista
## 4. Provar o gate — PR de falha proposital (CI-02 / D-11)
## Referência
```

Três lugares citam `["backend", "frontend"]` (linhas 23, 43, 71) e precisam virar
`["backend", "frontend", "secrets"]`. O aviso já existente na linha 23 é o padrão de callout a
reusar:

```
> ⚠️ **Pitfall 3 (crítico):** os nomes em `contexts` DEVEM casar exatamente com os **ids dos
```

O runbook já documenta o mesmo pitfall que D-14 descreve — a atualização é incremento, não invenção
de formato novo.

---

## Shared Patterns

### 1. Fail-fast em PT com instrução de remediação
**Source:** `backend/src/secret.js:9-14`
**Apply to:** `backend/src/config.js`

```javascript
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error(
    'JWT_SECRET ausente ou muito curto. Defina a variável de ambiente JWT_SECRET ' +
      'com pelo menos 16 caracteres (ex.: gere com `openssl rand -hex 32`).',
  );
}
```
Regra: `throw new Error`, nunca `process.exit`. A mensagem nomeia a variável **e** ensina a obter o
valor. Nunca ecoar valores — só nomes (ASVS V7).

### 2. `catch (_) {}` deliberado para operação idempotente
**Source:** `backend/src/db.js:88-94` (e 40-49, 52-63, 66-77)
**Apply to:** a migração de D-02 em `backend/src/db.js`, o cleanup em testes

```javascript
  try {
    db.exec(sql);
  } catch (_) {
    /* coluna já existe */
  }
```
O comentário dentro do `catch` é parte do padrão — silêncio sem justificativa é bug, silêncio
justificado é a convenção do projeto.

### 3. Tag de subsistema em log
**Source:** `backend/src/logger.js` (consumo) + convenção `[Scheduler]`/`[Auth]`/`[Emailer]`/`[Agendor]`
**Apply to:** `backend/src/config.js` (`[Config]`), migração em `db.js` (`[DB]`)

```javascript
logger.warn('[Config] ...');
```
`console.*` é proibido em código novo (CLAUDE.md). `db.js` ainda não requer o logger — adicionar.

### 4. `module.exports = { ... }` único no fim
**Source:** `backend/src/secret.js:16`, `backend/src/logger.js:35-40`, `backend/src/db.js` (fim)
**Apply to:** `backend/src/config.js`, `backend/test/helpers/*.js` novos

Nunca `exports.foo = ...`. Exceção documentada: routers, que fazem `module.exports = router` e
anexam seams como props (`backend/src/routes/auth.js:359-369`).

### 5. Preâmbulo de arquivo de teste
**Source:** `backend/test/agendor.pure.test.js:1-9`, `backend/test/db.dedup.test.js:1-22`
**Apply to:** todos os 7 arquivos de teste novos

```javascript
// <O que este teste protege, em PT, citando o requisito/decisão (CFG-01, D-02…)>
require('./setup');

const { test } = require('node:test');
const assert = require('node:assert/strict');
```
`require('./setup')` sempre primeiro — exceto quando o teste precisa vencer um preset guardado
(`DB_PATH`), caso em que a atribuição vem antes e o `setup` depois, com comentário explicando
(`db.dedup.test.js:14-20`).

### 6. Comentário de seção em box-drawing
**Source:** `backend/src/index.js:12,20,38,55,59`; `backend/.env.example:1,4,8,22`
**Apply to:** `backend/src/config.js`, migração em `db.js`, `.env.example`

```javascript
// ── Segurança: cabeçalhos HTTP ───────────────────────────────────
```

### 7. Constantes de módulo em `SCREAMING_SNAKE_CASE`
**Source:** `backend/src/logger.js:7-9`, `backend/src/routes/auth.js:30`, `backend/src/routes/config.js:13`
**Apply to:** `REQUIRED` em `config.js`, `ALLOWED_KEYS` em `routes/config.js`

```javascript
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const ADMIN_USERS = (process.env.ADMIN_USERS || '').split(',').map((u) => u.trim().toLowerCase()).filter(Boolean);
```

### 8. Normalização de env: `(process.env.X || '').trim()`
**Source:** `backend/src/emailer.js:28`, `backend/src/routes/auth.js:30-33`
**Apply to:** `findMissing()` em `config.js`, migração de `smtp_pass` em `db.js`

Variável presente-mas-vazia conta como ausente — é o comportamento já assumido em todo o backend.

---

## No Analog Found

| Arquivo | Role | Data Flow | Motivo |
|---------|------|-----------|--------|
| `backend/test/envExample.test.js` | test (meta) | file-I/O | Nenhum teste do repo lê arquivos-fonte do disco. `agendor.realsample.test.js:13` usa `require()` de um JSON de fixture, não `fs.readFileSync` + walk de diretório. Usar o código pronto do `03-RESEARCH.md` §Code Examples (linhas 1010-1047), adaptando o cabeçalho ao padrão de `agendor.pure.test.js`. |
| `backend/test/secrets.grep.test.js` | test (meta) | file-I/O / subprocess | Nenhum precedente de teste que roda `git grep` ou varre a árvore. Escopo obrigatório em `03-RESEARCH.md` §Pitfall 8 — um grep na raiz **falha** contra os próprios docs de `.planning/`. |
| `backend/test/config.dotenvPath.test.js` | test | file-I/O | Nenhum teste toca `dotenv` (o `.env` nunca é carregado na suíte, por design de `setup.js`). Padrão de arquivo temporário reaproveitável de `helpers/tmpDb.js:22-40` (`makeTmpDbPath` + `cleanup`) para criar um `.env` descartável. |

**Nota adicional (não é arquivo, é gap de dependência):** não existe `supertest` nem qualquer teste
que suba um servidor HTTP. Qualquer plano que assuma teste de rota "de verdade" está fora do stack
atual — usar o padrão de seam de `routes/auth.js:359-369`.

---

## Riscos de padrão que o planner deve carregar para os PLAN.md

1. **Gate de cobertura (`backend/.c8rc.json`: `branches: 60`, `all: true`, `include: src/**/*.js`,
   `exclude: [test/**, src/index.js]`).** Todo arquivo novo em `src/` entra na conta. Folga medida:
   ≤ 10 branches novos não cobertos. `config.js` **precisa** entrar na mesma wave que
   `config.validateEnv.test.js`. Verificar com `npm run test:coverage`, não só `npm test`.
2. **`src/index.js` está excluído da cobertura** — é tentador pôr lógica lá; contraria D-06 e o
   analog. Só o `require`.
3. **`backend/test/setup.js` só pode ser editado por append** (Pitfall 10).
4. **Ordem de `SMTP_PASS` vs `DB_PATH` nos testes de migração** é invertida entre si (guarda vs
   sem-guarda em `setup.js:18-31`) — errar faz o teste passar no ramo errado.
5. **PR da fase abaixo de 30 commits** (Pitfall 7: a action não pagina a listagem de commits).
6. **Nenhum comando `npx`** nos planos — o wrapper local está quebrado. Usar
   `./node_modules/.bin/<bin>` e `export PATH="$HOME/bin:$PATH"` antes de qualquer node/npm.

---

## Metadata

**Analog search scope:** `backend/src/`, `backend/src/routes/`, `backend/test/`,
`backend/test/helpers/`, `frontend/src/components/`, `.github/workflows/`, `deploy/`, `backend/*.json`,
`backend/.env.example`, `README.md`

**Files scanned:** 24 (todos < 750 linhas; leitura integral ou por range único, sem re-leitura)

**Analogs read in full:** `backend/src/secret.js`, `backend/src/logger.js`,
`backend/src/routes/config.js`, `backend/test/setup.js`, `backend/test/helpers/tmpDb.js`,
`backend/test/helpers/fakeAxios.js`, `backend/test/db.dedup.test.js`, `backend/test/auth.test.js`,
`backend/test/agendor.pure.test.js`, `backend/test/agendor.getStaleDeals.test.js`,
`.github/workflows/ci.yml`, `backend/.env.example`

**Analogs read by range:** `backend/src/db.js:1-145`, `backend/src/index.js:1-60`,
`backend/src/emailer.js:1-40`, `frontend/src/components/ConfigPanel.jsx:1-70,210-319`,
`backend/src/routes/auth.js` (grep-targeted: 27-42, 359-369), `README.md:70-100`,
`deploy/branch-protection.md` (grep-targeted)

**Pattern extraction date:** 2026-07-29
