# Fase 4: Confiabilidade das Integrações — Mapa de Padrões

**Mapeado:** 2026-08-04
**Arquivos analisados:** 15 (7 de produção/config + 7 de teste novos + 1 helper de teste)
**Análogos encontrados:** 14 / 15 (1 sem análogo direto: execução de handler de rota Express)

> **Como o planner usa este documento.** Cada arquivo novo/alterado tem um **análogo nomeado** no
> repositório e **trechos concretos com número de linha**. Onde a instrução for "copiar de X", o plano
> deve citar `arquivo:linhas` na ação, não a ideia abstrata. Onde não há análogo, a seção
> §Sem Análogo dá a receita mínima derivada dos padrões vizinhos.

---

## Classificação dos Arquivos

### Produção / configuração

| Arquivo | Papel | Fluxo de dados | Plano | Análogo mais próximo | Qualidade |
|---|---|---|---|---|---|
| `backend/src/agendor.js` (rethrow em `getDealsWithFutureTasks`) | client de borda HTTP | request-response paginado | 04-02 | `agendor.js:100-116` (`fetchDealsPage` — propaga o erro por padrão) | exata (mesmo arquivo, mesma borda) |
| `backend/src/agendor.js` (`timeout: 15000` na instância) | config de client HTTP | request-response | 04-03 | `agendor.js:6-9` (o próprio `axios.create` atual) | exata |
| `backend/src/agendor.js` (`getDealById`) | função de domínio (GET único) | request-response | 04-03 | `agendor.js:34-46` (`getOrgCategory` — GET por id via instância compartilhada) | exata |
| `backend/src/agendor.js` (limpeza do cache) | estado de módulo | cache/transform | 04-07 | `agendor.js:33-46` + `:154-165` (os dois caminhos de leitura) | exata |
| `backend/src/emailer.js` (3 timeouts na fábrica) | borda SMTP / factory de config | request-response com retry | 04-04 | `emailer.js:12-22` (a própria `createTransporter`) | exata |
| `backend/src/scheduler.js` (fluxo de log) | orquestrador / job | batch + event-driven | 04-06 | `scheduler.js:109-164` (o bloco try/catch atual do envio) | exata |
| `backend/src/db.js` (`updateNotificationStatus`) | camada de dados | CRUD (UPDATE por id) | 04-06 | `db.js:331-342` (`markResolved` / `recordClick`) | **exata** — mesmo formato de UPDATE posicional |
| `backend/src/routes/notifications.js` (`/resolved` via `getDealById`) | route handler | request-response com fan-out | 04-03 | `backend/src/routes/deals.js:11-35` (rota que consome módulos de domínio) | role-match forte |
| `backend/package.json` + `package-lock.json` | config de dependências | — | 04-03, 04-05 | `backend/package.json:18-30` (bloco `dependencies` atual) | exata |

### Testes novos

| Arquivo | Papel | Fluxo de dados | Plano | Análogo mais próximo | Qualidade |
|---|---|---|---|---|---|
| `backend/test/scheduler.resilience.test.js` | teste de caracterização | orquestração (3 bordas stubadas) | 04-01 | composto: `agendor.futureTasks.test.js:59-83` + `db.dedup.test.js:12-32` + `emailer.smtpPass.test.js:38-49` | role-match (nenhum teste atual atravessa `scheduler.js`) |
| `backend/test/scheduler.failsafe.test.js` | teste de novo fluxo | orquestração + falha injetada | 04-02 | idem acima + `agendor.futureTasks.test.js:61-67` (ramificação dentro do `routeHandler`) | role-match |
| `backend/test/agendor.timeout.test.js` | teste unitário de config | inspeção de argumentos | 04-03 | `emailer.smtpPass.test.js:38-45` (capturar `opts` do mock) | exata (mesmo mecanismo, outra borda) |
| `backend/test/notifications.resolved.test.js` | teste de rota | request-response | 04-03 | `config.route.smtpPass.test.js:13-52` (seam no router) — **não executa handler** | **parcial — ver §Sem Análogo** |
| `backend/test/emailer.timeout.test.js` | teste unitário + caracterização | SMTP com retry | 04-04 | `emailer.smtpPass.test.js` (arquivo inteiro) + `auth.test.js:51-63` (`mock.timers`) | **exata** |
| `backend/test/notificationStatus.test.js` | teste de novo fluxo | CRUD em SQLite real | 04-06 | `db.dedup.test.js:12-32, 54-87` (tmpDb + segunda conexão) | **exata** |
| `backend/test/agendor.cacheInvalidation.test.js` | teste unitário + regressão | cache + request-response | 04-07 | `agendor.getStaleDeals.test.js:16-51` + `agendor.futureTasks.test.js:110-118` (`callCount`) | **exata** |
| `backend/test/helpers/fakeAxios.js` (extensão aditiva) | helper de teste | — | 04-03 | `test/helpers/tmpDb.js:1-12, 45-49` (convenção de helper) | exata |

---

## Atribuições de Padrão

### `backend/src/agendor.js` — timeout na instância (04-03, REL-01)

**Análogo:** ele mesmo, `agendor.js:6-9`.

```js
// backend/src/agendor.js:1-9 — estado atual
const axios = require('axios');

const BASE_URL = 'https://api.agendor.com.br/v3';
const TOKEN = process.env.AGENDOR_TOKEN;

const api = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Token ${TOKEN}` },
});
```

**Regra de estilo herdada do arquivo (PC-9 + convenção de comentários do CLAUDE.md):** a única regra de
negócio não óbvia do módulo é comentada **em português, acima da linha, explicando o porquê** — ver
`agendor.js:57-61` (`NO_OWNER_NOTIFY_FUNNELS`) e `:68-70` (`EXCLUDED_STAGE_WORDS`). O `timeout: 15000`
deve seguir o mesmo formato: uma frase dizendo por que 15s e por que ele **não** entra no retry de 429.

**Por que a linha do timeout NÃO deve tocar o retry** (copiar o raciocínio, não o código):

```js
// backend/src/agendor.js:100-116 — o retry só reage a 429; timeout não tem err.response,
// então já propaga pelo `throw err` da linha 113. Nenhuma alteração necessária aqui.
async function fetchDealsPage(page, perPage, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { data } = await api.get('/deals', {
        params: { page, per_page: perPage, deal_status_id: 1 },
      });
      return data;
    } catch (err) {
      if (err.response?.status === 429 && attempt < retries - 1) {
        const wait = (attempt + 1) * 5000;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}
```

---

### `backend/src/agendor.js` — `getDealById` (04-03, Q3)

**Análogo:** `agendor.js:34-46` (`getOrgCategory`) — mesmo papel (GET de um recurso por id pela instância
compartilhada), mesmo fluxo, mesmo módulo.

```js
// backend/src/agendor.js:34-46 — o padrão a copiar (estrutura, não o cache)
async function getOrgCategory(orgId) {
  if (!orgId) return null;
  if (orgCategoryCache[orgId] !== undefined) return orgCategoryCache[orgId];
  try {
    const { data } = await api.get(`/organizations/${orgId}`);
    const category = data.data?.category?.name || null;
    orgCategoryCache[orgId] = category;
    return category;
  } catch {
    orgCategoryCache[orgId] = null;
    return null;
  }
}
```

**O que copiar:** template literal no path relativo; destructuring `const { data } = await api.get(...)`;
desembrulhar o envelope Agendor com `data.data`; `|| null` / `?? null` para ausência.
**O que NÃO copiar:** o `try/catch` que engole. `getDealById` **deve propagar** — quem absorve a falha é o
`catch` por item da rota (`routes/notifications.js:240-242`), que já existe e permanece.

**Export aditivo (PC-12):**

```js
// backend/src/agendor.js:234-241 — module.exports único no fim; getDealById entra na lista
module.exports = {
  getUsers,
  getStaleDeals,
  getDealsWithFutureTasks,
  shouldNotifyOwner,
  getDealType,
  isExcludedStage,
};
```

A instância `api` **não** entra neste bloco (Q3).

---

### `backend/src/agendor.js` — rethrow do fail-safe (04-02, REL-06)

**Análogo:** `agendor.js:100-116` (`fetchDealsPage`) — o padrão do repositório para "erro que não é retentável
propaga" (`throw err`, linha 113).

```js
// backend/src/agendor.js:206-232 — estado atual; o catch é o alvo do 04-02
  let page = 1;
  while (true) {
    try {
      const { data } = await api.get('/tasks', {
        params: { dueDateGt: yesterday, per_page: 100, page },
      });
      const tasks = data.data || [];
      if (!tasks.length) break;

      for (const t of tasks) {
        if (!t.finishedAt && t.deal?.id && new Date(t.dueDate) > now) {
          dealIds.add(t.deal.id);
        }
      }

      if (tasks.length < 100) break;
      page++;
    } catch (err) {
      console.error('[Agendor] Erro ao buscar tarefas futuras:', err.message);
      break;
    }
  }
```

**Nota de logging para o plano:** este `console.error` usa a tag `[Agendor]` — convenção do projeto
(PC-10). Se o rethrow mantiver um log antes de propagar, ele é **código novo** e portanto vai para
`logger.error('[Agendor] …', err)` (PC-11), no formato usado em `scheduler.js:173`. O `console.warn` do
retry SMTP (`emailer.js:192`) é o único console legado que o contrato manda **preservar**.

---

### `backend/src/agendor.js` — limpeza do cache (04-07, REL-04)

**Análogo:** os dois caminhos de leitura no próprio arquivo — é por isso que a limpeza tem de deletar
chaves, nunca reatribuir.

```js
// backend/src/agendor.js:33-36 — caminho de leitura 1 (fecha sobre a referência)
const orgCategoryCache = {};
async function getOrgCategory(orgId) {
  if (!orgId) return null;
  if (orgCategoryCache[orgId] !== undefined) return orgCategoryCache[orgId];
```

```js
// backend/src/agendor.js:154-167 — caminho de leitura 2: leitura DIRETA do dicionário,
// que é onde EXCLUDED_CATEGORIES decide a exclusão. Reatribuir o objeto quebra aqui.
  const uniqueOrgIds = [
    ...new Set(staleRaw.map((d) => d.organization?.id).filter(Boolean)),
  ];
  await Promise.all(uniqueOrgIds.map((id) => getOrgCategory(id)));

  const allDeals = [];
  for (const deal of staleRaw) {
    ...
    const orgCategory = orgCategoryCache[deal.organization?.id] ?? null;

    if (EXCLUDED_CATEGORIES.includes(orgCategory)) continue;
```

**Ponto de inserção:** primeira instrução de `getStaleDeals` (`agendor.js:119-125`), **antes** do
`fetchDealsPage(1, perPage)` da linha 125.

---

### `backend/src/emailer.js` — 3 timeouts na fábrica (04-04, REL-02)

**Análogo:** a própria `createTransporter`, `emailer.js:12-22`. É o único ponto por onde passam os 6
call-sites (`:197, :206, :383, :404, :409, :689`).

```js
// backend/src/emailer.js:5-22 — o comentário-bloco acima da fábrica é o padrão do arquivo:
// explica a DECISÃO (por que a senha vem do env), não a mecânica. O comentário de D-02
// deve entrar no mesmo bloco/estilo, dizendo por que 10s/10s/30s e qual era o default.
function createTransporter() {
  return nodemailer.createTransport({
    host: getConfig('smtp_host'),
    port: parseInt(getConfig('smtp_port')),
    secure: parseInt(getConfig('smtp_port')) === 465,
    auth: {
      user: getConfig('smtp_user'),
      pass: (process.env.SMTP_PASS || '').trim(),
    },
  });
}
```

**Retry — NÃO tocar** (D-03; é o oráculo dos testes de exaustão do 04-04):

```js
// backend/src/emailer.js:178-203 — contagem (3), esperas (3s/6s), recriação do transporter
// na linha 197 e o retorno { success:false } sem throw na 200 são todos comportamento pinado.
async function sendMailWithRetry(transporter, mailOptions, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await transporter.sendMail(mailOptions);
      return { success: true };
    } catch (err) {
      const isNetworkError =
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.message?.toLowerCase().includes('timeout') ||
        err.message?.toLowerCase().includes('econnreset');

      if (isNetworkError && attempt < retries) {
        const wait = attempt * 3000; // 3s, 6s entre tentativas
        console.warn(
          `[Emailer] Tentativa ${attempt} falhou (${err.message}). Aguardando ${wait / 1000}s antes de retentar...`,
        );
        await new Promise((r) => setTimeout(r, wait));
        transporter = createTransporter();
        continue;
      }
      return { success: false, error: err.message };
    }
  }
}
```

---

### `backend/src/db.js` — `updateNotificationStatus` (04-06, REL-05)

**Análogo:** `db.js:331-346` — **match exato**. `markResolved` e `recordClick` são exatamente o mesmo
padrão: UPDATE por chave, argumentos posicionais, `db.prepare(...).run(...)` inline, sem try/catch.

```js
// backend/src/db.js:331-346 — o padrão a copiar literalmente
function markResolved(deal_id, resolved_at) {
  db.prepare(
    `UPDATE notification_log SET resolved = 1, resolved_at = ? WHERE deal_id = ?`,
  ).run(resolved_at, deal_id);
}

function recordClick(log_id) {
  db.prepare(`UPDATE notification_log SET clicked_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    log_id,
  );
}

function getLogById(id) {
  return db.prepare(`SELECT * FROM notification_log WHERE id = ?`).get(id);
}
```

**Convenções fixadas por estes três:** `snake_case` nos parâmetros que espelham colunas
(`log_id`, `deal_id`), template literal com SQL em maiúsculas, sem retorno explícito nos UPDATEs
(`markResolved` não retorna nada; `recordClick` também não). PC-15 confirma o estilo posicional para 3
argumentos.

**Export aditivo:**

```js
// backend/src/db.js:425-452 — module.exports único no fim, uma função por linha.
// updateNotificationStatus entra perto de markResolved/recordClick, não no fim da lista.
module.exports = {
  closeDb,
  getConfig,
  ...
  getNotifiedDeals,
  markResolved,
  recordClick,
  getLogById,
  ...
};
```

**Contexto que o plano precisa citar** — a escrita e a leitura que o 04-06 reconcilia:

```js
// backend/src/db.js:176-208 — logNotification: INSERT com objeto destruturado (PC-15),
// sent_at = new Date().toISOString() gravado aqui dentro. Retorna o result do better-sqlite3,
// de onde sai o `lastInsertRowid` usado como logId.
```

```js
// backend/src/db.js:223-232 — o leitor que define o conserto: filtra status = 'sent'
function alreadyNotifiedToday(deal_id) {
  const today = new Date().toISOString().split('T')[0];
  const row = db
    .prepare(`
    SELECT id FROM notification_log
    WHERE deal_id = ? AND sent_at LIKE ? AND status = 'sent'
  `)
    .get(deal_id, `${today}%`);
  return !!row;
}
```

**Nota de schema:** a coluna `status` é `TEXT NOT NULL DEFAULT 'sent'` e **não** tem CHECK constraint —
`'pending'` (recomendação da pesquisa, Open Question 4) não exige migração. O padrão de migração defensiva
do arquivo (`db.js:89-95`, `try { db.exec(sql) } catch (_) { /* coluna já existe */ }`) **não é necessário
nesta fase** — nenhuma coluna nova é adicionada.

---

### `backend/src/scheduler.js` — fluxo de status (04-06, REL-05)

**Análogo:** o próprio bloco `scheduler.js:109-164`. O plano altera este trecho; copiar a **forma**
(estrutura do try/catch, uso de `results.errors.push`, `dealResult.notified`) e mudar só o que Q1 exige.

```js
// backend/src/scheduler.js:109-157 — estado atual (DESC-1 vive aqui)
      const hasRecipient = ownerEmail || authorEmail;
      if (notificationsEnabled && hasRecipient) {
        try {
          // Salva primeiro para obter o log_id para rastreamento
          const logEntry = logNotification({
            deal_id: deal.id,
            ...
            status: 'sent',          // ← otimista: o alvo do 04-06
            error: null,
            ...
          });
          const logId = logEntry.lastInsertRowid;

          const emailResults = await sendStaleNotification({
            deal, ownerEmail, authorEmail, logId,
          });
          const allOk = emailResults.every((r) => r.success);
          const errors = emailResults
            .filter((r) => !r.success)
            .map((r) => r.error);

          dealResult.notified = allOk;
          if (!allOk) results.errors.push(...errors);
          results.notified++;
        } catch (err) {
          results.errors.push(err.message);
          logNotification({ ... status: 'error' ... });   // ← insere SEGUNDA linha: alvo do 04-06
        }
      }
```

**Estrutura que NÃO muda (04-01 a pina; 04-02 depende dela):**

```js
// backend/src/scheduler.js:26-29 — guard de concorrência
async function runCheck() {
  if (isRunning)
    return { skipped: true, reason: 'Verificação já em andamento' };
  isRunning = true;
```

```js
// backend/src/scheduler.js:171-180 — catch que registra e NÃO relança + finally que libera o lock
  } catch (err) {
    results.error = err.message;
    logger.error('[Scheduler] Erro na verificação:', err);
  } finally {
    isRunning = false;
    lastRunResult = results;
  }

  return results;
}
```

```js
// backend/src/scheduler.js:54-58 — o Promise.all cuja rejeição o 04-02 passa a produzir
    const [staleDeals, users, futureTasks] = await Promise.all([
      getStaleDeals(staleDays),
      getUsers(),
      getDealsWithFutureTasks(),
    ]);
```

---

### `backend/src/routes/notifications.js` — `/resolved` via `getDealById` (04-03)

**Análogo:** `backend/src/routes/deals.js:11-35` — rota que consome funções de domínio de `../agendor`,
sem conhecer axios.

```js
// backend/src/routes/deals.js:1-35 — o padrão de rota "limpa": importa domínio, não borda
const express = require('express');
const router = express.Router();
const {
  getStaleDeals,
  getUsers,
  getDealsWithFutureTasks,
} = require('../agendor');
const { getConfig } = require('../db');

router.get('/stale', async (req, res) => {
  try {
    ...
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
```

**Estado atual do alvo — o `axios.get` órfão que sai:**

```js
// backend/src/routes/notifications.js:201-243 (trecho)
router.get('/resolved', async (req, res) => {
  try {
    const TOKEN = process.env.AGENDOR_TOKEN;          // ← sai (04-03)
    ...
    const results = await Promise.all(
      notifiedDeals.map(async (d) => {
        try {
          const { data } = await axios.get(          // ← vira getDealById(d.deal_id)
            `https://api.agendor.com.br/v3/deals/${d.deal_id}`,
            { headers: { Authorization: `Token ${TOKEN}` } },
          );
          const currentUpdatedAt = data.data?.updatedAt;
          ...
            dealStatus: data.data?.dealStatus?.id, // 1=em andamento, 2=ganho, 3=perdido
          };
        } catch {
          return { ...d, resolved: d.resolved === 1 };   // ← catch POR ITEM: preservar
        }
      }),
    );
```

**Dois pontos de atenção que o plano deve nomear explicitamente:**
1. `getDealById` já devolve `data.data` → a rota passa a ler `deal?.updatedAt` e `deal?.dealStatus?.id`.
   **`dealStatus` é o mais fácil de esquecer** e é o único campo que o frontend usa para o rótulo
   ganho/perdido.
2. O `require('axios')` de `notifications.js:19` só pode ser removido se **nenhum** outro uso restar no
   arquivo — conferir com grep antes (PC-4).

**Shape de erro:** este arquivo usa **as duas** formas — `{ error }` no `/resolved` (`:260`) e
`{ ok:false, error }` no `/weekly-owners` (`:191`). Regra do CLAUDE.md: **manter a forma que a rota já
usa**. `/resolved` continua com `res.status(500).json({ error: err.message })`.

---

### `backend/package.json` + `package-lock.json` (04-03, 04-05)

**Análogo:** o próprio bloco de dependências.

```json
// backend/package.json:18-30 — ordem alfabética; caret em tudo; um pacote por linha
  "dependencies": {
    "axios": "^1.7.2",
    ...
    "nodemailer": "^6.9.13"
  },
```

**Convenção do repositório para bumps:** não há precedente de bump nas Fases 1-3 — o padrão vem do
contrato (§15): `npm install <pacote>@<versão-alvo>`, **nunca** `npm audit fix`; um pacote por commit;
`npm ls <pacote>` no aceite. Formato de mensagem de commit já estabelecido nas fases anteriores:
`chore(04-03): atualiza axios para 1.x.y` (tipo + escopo com o número do plano).

---

### `backend/test/helpers/fakeAxios.js` — extensão aditiva (04-03)

**Análogo:** `test/helpers/tmpDb.js` — mesma família de helper.

```js
// backend/test/helpers/fakeAxios.js:1-17 — o helper inteiro (17 linhas)
// Helper de teste (NÃO define testes) — instala um stub da instância axios que
// agendor.js cria no load do módulo. ... Precisa ser instalado ANTES do primeiro
// require('../src/agendor'), pois agendor.js faz `const api = axios.create(...)` no load.
const { mock } = require('node:test');
const axios = require('axios');

function installFakeAxios(routeHandler) {
  const fakeInstance = {
    get: mock.fn(async (url, config) => routeHandler(url, config)),
  };
  mock.method(axios, 'create', () => fakeInstance);
  return fakeInstance;
}

module.exports = { installFakeAxios };
```

**Convenções a preservar em qualquer extensão:** (1) cabeçalho começando com
`// Helper de teste (NÃO define testes)`; (2) o comentário explica **por que** o helper existe e a
armadilha de ordem; (3) `module.exports = { ... }` nomeado no fim.
**Restrição de compatibilidade:** 3 arquivos já chamam `installFakeAxios` e usam o retorno como
`fake.get.mock` (`agendor.futureTasks.test.js:82, :117`). Qualquer extensão precisa **acrescentar** uma
propriedade ao objeto retornado, nunca trocar o formato.

---

### `backend/test/scheduler.resilience.test.js` (04-01) e `scheduler.failsafe.test.js` (04-02)

**Análogo:** composto de três arquivos — nenhum teste atual atravessa `scheduler.js`, então o padrão é a
soma dos três bootstraps existentes.

**(1) Ordem canônica de bootstrap — de `db.dedup.test.js:12-32`:**

```js
// backend/test/db.dedup.test.js:12-32
const { makeTmpDbPath, openRaw } = require('./helpers/tmpDb');

// Cria o arquivo temporário e fixa DB_PATH ANTES de qualquer require('../src/db'):
// db.js lê process.env.DB_PATH no momento do load e abre a conexão ali (seam 01-01).
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

// setup.js só define DB_PATH se ausente — como já definimos acima, o arquivo temp vence.
require('./setup');

const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/db');

after(() => {
  db.closeDb();
  cleanup();
});
```

**(2) fakeAxios ANTES do require de `src/` — de `agendor.futureTasks.test.js:59-69`:**

```js
// backend/test/agendor.futureTasks.test.js:59-69
// Instala o stub ANTES de exigir agendor.js (a instância `api` é criada no load).
// Ramifica por config.params.page para simular as duas páginas de /tasks.
const fake = installFakeAxios((url, config) => {
  if (url === '/tasks') {
    const page = config?.params?.page;
    return { data: { data: page === 1 ? PAGE_1 : PAGE_2 } };
  }
  return { data: { data: [] } };
});

const { getDealsWithFutureTasks } = require('../src/agendor');
```

**(3) Stub do nodemailer (pode vir depois do require) — de `emailer.smtpPass.test.js:35-49`:**

```js
// backend/test/emailer.smtpPass.test.js:35-49
// O stub pode ser instalado DEPOIS do require de emailer.js: o módulo requer
// nodemailer no load, mas só chama createTransport() dentro de createTransporter()
// — folga que o caso do axios em agendor.js não tinha.
let captured = null;
mock.method(nodemailer, 'createTransport', (opts) => {
  captured = opts;
  return {
    verify: async () => true,
    sendMail: async () => ({}),
  };
});

after(() => {
  mock.restoreAll();
});
```

**(4) Ramificar dentro do `routeHandler`, não reinstalar o stub** (Pitfall 4 da pesquisa) — o
`routeHandler` de `agendor.futureTasks.test.js:61` já é uma função que decide por `config`; para o 04-02 a
decisão passa a ser por uma variável mutável do arquivo (`let tarefasDevemFalhar = false`).

**(5) Isolamento de contadores entre casos — de `agendor.futureTasks.test.js:79-83`:**

```js
// Zera o contador de chamadas antes de cada teste para que a asserção de callCount do
// caso (d) reflita UMA única invocação (o mock.fn acumula).
beforeEach(() => {
  fake.get.mock.resetCalls();
});
```

**(6) Cabeçalho de arquivo — obrigatório.** Todos os 18 testes do repositório abrem com um bloco de
comentário em PT-BR que diz **o que é pinado e por quê**, nomeando o requisito. Ver
`agendor.futureTasks.test.js:1-6` e `db.dedup.test.js:1-10`. Modelo:

```js
// Caracterização (golden) de <X>: roda a função REAL contra <bordas stubadas>.
// Pina o comportamento ATUAL — não o ideal: <lista dos invariantes>.
// <REQ-ID>: fecha a lacuna de <n>% do gargalo que <consumidor> usa para decidir <o quê>.
```

---

### `backend/test/agendor.timeout.test.js` (04-03)

**Análogo:** `emailer.smtpPass.test.js:38-45` — mesmo mecanismo (capturar as opções entregues à fábrica),
aplicado à outra borda. E `agendor.getStaleDeals.test.js:73-79` para a asserção "não faz rede real".

```js
// backend/test/agendor.getStaleDeals.test.js:73-79 — o padrão de asserção "borda mockada"
test('getStaleDeals(15): não faz chamada de rede real (axios.create stubado)', async () => {
  // Se o stub não estivesse instalado, o require('../src/agendor') teria criado a
  // instância axios real e a chamada tentaria a API Agendor. O fato de o golden
  // acima passar sub-segundo comprova que a borda HTTP está mockada.
  const result = await getStaleDeals(15);
  assert.ok(Array.isArray(result));
});
```

**Asserção negativa explícita — padrão de `emailer.smtpPass.test.js:51-59`:** o arquivo prova a decisão
com uma asserção **negativa** ("não é o valor do banco"), não só com a positiva. O teste de `getDealById`
deve fazer o mesmo: provar que a chamada foi pela **instância** (`fake.get.mock.callCount()` subiu) **e**
que não foi pelo `axios.get` global.

---

### `backend/test/emailer.timeout.test.js` (04-04)

**Análogo:** `backend/test/emailer.smtpPass.test.js` — **match exato**. O arquivo inteiro é o molde:
mesma borda, mesmo mock, mesmo caminho público (`verifySmtp`) para alcançar a fábrica privada.

```js
// backend/test/emailer.smtpPass.test.js:8-19 — a justificativa do caminho público, a copiar
// Como a chamada é disparada: `createTransporter()` é privada (não exportada). Em
// vez de abrir um seam de teste no módulo, usa-se o caminho público mais barato que
// passa por ela — `verifySmtp()`, que só faz `createTransporter().verify()`. Zero
// alteração no contrato de emailer.js.
require('./setup');

// DEPOIS do setup, obrigatoriamente: setup.js:31 faz `SMTP_PASS = ''` SEM guarda.
// Se esta linha viesse antes, o setup a apagaria e o teste exercitaria o ramo errado.
process.env.SMTP_PASS = 'env-pass';
```

**Semeadura de config antes do require do emailer — `emailer.smtpPass.test.js:26-33`:**

```js
const { setConfig } = require('../src/db');
setConfig('smtp_host', 'smtp.exemplo.invalid');
setConfig('smtp_port', '587');
setConfig('smtp_user', 'usuario@exemplo.invalid');
setConfig('smtp_pass', 'db-pass');

const { verifySmtp } = require('../src/emailer');
```

**Fake timers para a exaustão do retry — de `auth.test.js:51-63`:**

```js
// backend/test/auth.test.js:51-63 — mock.timers com try/finally e reset garantido
test('rate-limit: passada a janela de 15 min, checkRateLimit reporta not blocked', () => {
  const ip = '10.0.0.3';
  mock.timers.enable({ apis: ['Date'] });
  try {
    ...
    mock.timers.tick(15 * 60 * 1000 + 1);
    ...
  } finally {
    mock.timers.reset();
  }
});
```

Diferença para o 04-04: as esperas de `sendMailWithRetry` são `setTimeout`, não `Date` — habilitar
`apis: ['setTimeout']` e avançar o relógio com o helper `avancarRelogioAte`
(`backend/test/emailer.timeout.test.js:78-101`). **Não usar `tickAsync`**: a API só existe no Node 23 e é
`undefined` no Node 20 que o `ci.yml` fixa (correção medida na onda 4, ver §Pitfall 3 da pesquisa). O
`try/finally` com `mock.timers.reset()` é a parte a copiar de `auth.test.js`.

**PC-13:** nunca imprimir o objeto de opções inteiro em mensagem de asserção — ele contém `auth.pass`.
`emailer.smtpPass.test.js` só assere campos individuais; seguir isso.

---

### `backend/test/notificationStatus.test.js` (04-06)

**Análogo:** `backend/test/db.dedup.test.js` — **match exato** para a metade de banco. É o único arquivo do
repositório que usa tmpDb + segunda conexão, e é exatamente o cenário (4) de Q1 (registro anterior
`'error'` não bloqueia).

```js
// backend/test/db.dedup.test.js:54-87 — semeadura por SEGUNDA conexão ao MESMO arquivo,
// para gravar um sent_at/status que logNotification não sabe produzir.
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const seed = openRaw(DB_PATH);
try {
  seed
    .prepare(
      `INSERT INTO notification_log
         (deal_id, deal_title, owner_name, owner_email, admin_email, sent_at, days_stale, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(dealId, 'Deal notificado ontem', 'Beltrano', 'beltrano@example.com',
         'admin@example.com', yesterday, 30, 'sent');
} finally {
  seed.close();
}

assert.equal(db.alreadyNotifiedToday(dealId), false);
```

Para o cenário (4) do 04-06 basta trocar `'sent'` por `'error'` e manter o `sent_at` **de hoje** — a
asserção esperada continua `false`, mas por outro motivo (status, não data). O plano deve dizer isso no
comentário, senão o teste parece duplicar `db.dedup.test.js`.

**Contagem de linhas (cenário 2 de Q1, "sem linha `'sent'` órfã"):** usar `db.getNotificationLogs()`
(`db.js:210-220`), que já devolve `{ logs, total }` — não abrir consulta ad-hoc.

---

### `backend/test/agendor.cacheInvalidation.test.js` (04-07)

**Análogo:** `backend/test/agendor.getStaleDeals.test.js` — **match exato**. Já stuba `/organizations/:id`
com um dicionário de categorias, que é precisamente o que o teste de invalidação precisa mutar entre as
duas execuções.

```js
// backend/test/agendor.getStaleDeals.test.js:16-51 — o molde completo
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

// Categoria por organização (resposta de /organizations/:id). Default = 'Lead'.
const ORG_CATEGORY = {
  205: 'Parceiro', // categoria excluída
};

const dealsPage = require('./fixtures/synthetic/deals-page.json');

installFakeAxios((url) => {
  if (url === '/deals') {
    return {
      data: { data: dealsPage, meta: { totalCount: dealsPage.length }, links: {} },
    };
  }
  if (url.startsWith('/organizations/')) {
    const id = Number(url.split('/').pop());
    return { data: { data: { category: { name: ORG_CATEGORY[id] || 'Lead' } } } };
  }
  return { data: { data: [] } };
});

const { getStaleDeals } = require('../src/agendor');

before(() => { mock.timers.enable({ apis: ['Date'], now: FIXED_NOW }); });
after(() => { mock.timers.reset(); });
```

`ORG_CATEGORY` é um objeto de módulo mutável — o teste de refetch muda `ORG_CATEGORY[205]` entre a 1ª e a
2ª chamada de `getStaleDeals`, sem reinstalar o stub (respeita o Pitfall 4).

**Contagem de chamadas por org — padrão de `agendor.futureTasks.test.js:117`:**

```js
assert.equal(fake.get.mock.callCount(), 2);
```

Combinar com `beforeEach(() => fake.get.mock.resetCalls())` (`:81-83`).

**Fixture existente a reusar (não recriar):** `backend/test/fixtures/synthetic/deals-page.json` — é a
fonte do golden `[101, 103]`, e a org 205 (`'Parceiro'`) já está lá.

---

## Padrões Compartilhados

### 1. Ordem canônica de bootstrap de teste

**Fonte:** `db.dedup.test.js:12-32` + `emailer.smtpPass.test.js:14-19` + `setup.js:14-40`
**Aplicar a:** todos os 7 arquivos de teste novos.

```
1. makeTmpDbPath() + process.env.DB_PATH = ...   (só se precisar de arquivo real)
2. require('./setup')
3. process.env.SMTP_PASS = ...                    (só se precisar; setup sobrescreve SEM guarda)
4. installFakeAxios(...)                          (ANTES de qualquer require de src/agendor)
5. require('../src/agendor') / require('../src/scheduler') / require('../src/emailer')
```

A assimetria está documentada no próprio código:

```js
// backend/test/setup.js:18-20 — guardado: um DB_PATH definido ANTES vence
if (!process.env.DB_PATH) {
  process.env.DB_PATH = ':memory:';
}
```

```js
// backend/test/setup.js:26-32 — SEM guarda: sempre sobrescreve
process.env.SMTP_PASS = '';
process.env.ADMIN_EMAIL = '';
```

### 2. Seam aditivo em `module.exports` de router

**Fonte:** `backend/src/routes/auth.js:359-369`
**Aplicar a:** qualquer necessidade de expor constante/função interna de rota para teste (04-03, se o
plano optar por testar `/resolved` por seam em vez de handler).

```js
// backend/src/routes/auth.js:359-369
module.exports = router;

// ── Seams de teste (não afetam o roteamento do Express) ──────────
// app.use() só precisa que module.exports seja a função router; estas props
// extras são ignoradas pelo Express e existem para caracterizar o rate-limit e
// a verificação de senha, além de permitir reset do Map em memória entre casos.
module.exports.checkRateLimit = checkRateLimit;
module.exports.recordFailedAttempt = recordFailedAttempt;
module.exports.clearAttempts = clearAttempts;
module.exports.verifyPassword = verifyPassword;
module.exports._loginAttempts = loginAttempts;
```

Precedente de uso: `backend/src/routes/config.js:101` (`module.exports.ALLOWED_KEYS = ALLOWED_KEYS;`),
consumido por `config.route.smtpPass.test.js:19-20`, que ainda assere que o seam **não quebra o contrato do
router** (`:49-52`, `assert.equal(typeof configRouter, 'function')`).

### 3. Comentário de seção com box-drawing

**Fonte:** `routes/auth.js:354, :361`, `db.js:348`, `test/auth.test.js:28, :73`
**Aplicar a:** qualquer bloco lógico novo em arquivo que já use o estilo.

```js
// ── Seams de teste (não afetam o roteamento do Express) ──────────
// ── Funções de usuários do sistema ──────────────────────────────
```

### 4. Comentário que explica a DECISÃO, não a mecânica

**Fonte:** `emailer.js:5-11` (por que a senha vem do env), `agendor.js:57-61` (por que Beefor é excluída),
`db.dedup.test.js:6-10` (por que arquivo temp em vez de `:memory:`), `tmpDb.js:1-12`.
**Aplicar a:** todos os arquivos desta fase — cada valor travado (15000, 10000/10000/30000, `'pending'`,
o rethrow, a limpeza do cache) é uma decisão que precisa da sua frase de "por quê", em PT-BR (PC-9).

### 5. Shape de resposta de erro em rota — por arquivo, não global

**Fonte:** `routes/deals.js:31-34` (`{ error }`) vs `routes/notifications.js:190-192`
(`{ ok:false, error }`) — as duas formas coexistem **no mesmo repositório e até no mesmo arquivo**.

```js
// backend/src/routes/deals.js:31-34
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
```

**Regra:** manter a forma que a rota alvo já usa. `/resolved` (`notifications.js:259-261`) e
`/check` (`:39-41`) usam `{ error }` — o 04-02 e o 04-03 não mudam nada disso.

### 6. Logger com tag entre colchetes

**Fonte:** `scheduler.js:50-52, :168-170, :173`
**Aplicar a:** todo log **novo** (PC-10 + PC-11).

```js
logger.info(`[Scheduler] Iniciando verificação — threshold: ${staleDays} dias`);
logger.error('[Scheduler] Erro na verificação:', err);
```

Exceção pinada pelo contrato: `console.warn` de `emailer.js:192` **permanece** (migra na Fase 5).

---

## Sem Análogo Direto

| Arquivo | Papel | Fluxo | Motivo |
|---|---|---|---|
| `backend/test/notifications.resolved.test.js` (04-03) | teste de rota | request-response | **Nenhum teste do repositório executa um handler Express.** `config.route.smtpPass.test.js` chega mais perto, mas testa uma **constante** exposta como seam, não o handler. Não há `supertest` nem qualquer cliente HTTP de teste nas devDependencies (`package.json:24-29`). |

**Receita mínima derivada dos padrões vizinhos** (o plano decide, é área de discricionariedade — 04-CONTEXT
"forma exata dos testes"):

- **Opção A (menor superfície, coerente com o repositório):** expor o handler de `/resolved` como seam
  aditivo, no padrão de `auth.js:361-369`, e invocá-lo com um `res` falso mínimo
  (`{ json: (b) => { corpo = b; }, status(c) { codigo = c; return this; } }`). Zero dependência nova, zero
  porta, e o `assert` incide sobre `corpo`.
- **Opção B:** alcançar o handler por `router.stack` — funciona, mas acopla o teste a um detalhe interno do
  Express, o que nenhum teste atual faz.
- **Não fazer:** introduzir `supertest`/`nock` — a pesquisa (§Don't Hand-Roll) e PC-5 excluem dependência
  nova nesta fase.

Bordas a stubar neste teste, nas duas opções: `installFakeAxios` para `/deals/:id` (a rota passa a
consumir `getDealById`) + tmpDb semeado com linhas de `notification_log` via `openRaw`, no padrão de
`db.dedup.test.js:62-82` (a lista de entrada vem de `getNotifiedDeals`, `db.js:317-329`).

---

## Fora do escopo de padrões (docs)

`.planning/REQUIREMENTS.md` ganha REL-05 e REL-06 (contrato §3 e §18). É edição de documento de
planejamento, sem análogo de código — o padrão a seguir é a formatação das linhas 38-41 e da tabela de
Traceability (linhas 121-124) do próprio arquivo.

---

## Metadata

**Escopo da busca de análogos:** `backend/src/**` (13 arquivos), `backend/test/**` (18 testes + 2 helpers +
setup), `backend/package.json`.
**Arquivos lidos integralmente:** `agendor.js`, `routes/deals.js`, `test/helpers/fakeAxios.js`,
`test/helpers/tmpDb.js`, `test/setup.js`, `test/agendor.futureTasks.test.js`,
`test/agendor.getStaleDeals.test.js`, `test/db.dedup.test.js`, `test/emailer.smtpPass.test.js`,
`test/auth.test.js`, `test/config.route.smtpPass.test.js`.
**Arquivos lidos por trecho dirigido:** `scheduler.js` (1-190, 232-319), `db.js` (78-107, 176-235, 304-353,
425-452), `emailer.js` (1-30, 175-224), `routes/notifications.js` (1-50, 180-264), `routes/auth.js`
(350-369), `test/config.bootFailFast.test.js` (1-75).
**Data da extração:** 2026-08-04
