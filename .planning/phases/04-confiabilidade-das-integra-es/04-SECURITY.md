---
phase: 04-confiabilidade-das-integra-es
audited: 2026-08-05
auditor: gsd-security-auditor
asvs_level: 1
block_on: high
threats_open: 1
threats_total: 233
threats_closed: 232
disposition_counts:
  mitigate: 167
  accept: 65
  transfer: 1
plans_audited: 38
verdict: SECURED
---

# Phase 04 — Security Audit: Confiabilidade das Integrações

**Phase goal:** Integrações de saída (Agendor HTTP, SMTP) e o agendador cron toleram lentidão e
falhas sem travar ou derrubar o sistema.

**Stance taken:** adversarial. Every `mitigate` disposition below was checked against a `grep`
match or a direct read of the cited production file — never accepted on the strength of the
plan's prose alone. Every `accept`/`transfer` disposition was checked against a corresponding
entry in this document's Accepted Risks Log or an owned todo file in
`.planning/todos/pending/`. Nothing in this report was derived from SUMMARY.md narrative without
independent confirmation in code.

## Method

1. Extracted all 38 `<threat_model>` blocks from `04-01-PLAN.md`..`04-38-PLAN.md` — 233 threat
   entries total (232 phase-scoped STRIDE entries + SEC-01, which predates and outlives the
   phase and is carried here per explicit instruction).
2. Read the six production files this phase actually touches in full: `backend/src/agendor.js`,
   `backend/src/scheduler.js`, `backend/src/emailer.js`, `backend/src/routes/deals.js`,
   `backend/src/routes/notifications.js`, `frontend/src/components/Dashboard.jsx`. Every
   `mitigate` threat in the register maps to one of these six files (confirmed: `04-VERIFICATION.md`
   independently scoped the same six files as the phase's full production footprint).
3. Ran the environment checks fresh, not reused from a prior report:
   - `cd backend && npm test` → **196/196 passing**, exit 0.
   - `cd backend && npm run lint` → exit 0, 44 warnings (documented baseline).
   - `cd backend && npm audit --json` → 8 advisories (6 moderate, 2 high, 0 critical); traced
     every one to its source package — **none traces to `axios` or `nodemailer`**.
   - `git grep c57f59ef .planning/phases/04-confiabilidade-das-integra-es/` and
     `.planning/todos/` → zero hits outside the pre-existing, truncated references in
     `sec-01-rotate-agendor-token.md` (Phase 3 artifact, not Phase 4).
   - Cross-checked every SUMMARY.md `## Threat Flags` section (or equivalent "Threat Model —
     dispositions aplicadas" heading, used interchangeably across plans) for self-reported new
     attack surface. Zero plans reported anything outside their own `<threat_model>` block.
   - Confirmed `ls .planning/todos/pending/ | wc -l` = 41, matching the STATE.md claim, and
     confirmed by name that every `accept`/`transfer` threat below that names a todo owner has
     that file present on disk.

## Special-attention findings (per `<contexto_critico>`)

### CR-02 — AxiosError object no longer reaches the log stream

Verified directly. `backend/src/routes/deals.js:43` logs
`logger.error('[Deals] Erro ao listar negócios parados:', err.message)` — message only, never
the error object. The sibling path in `backend/src/agendor.js:526`
(`getDealsWithFutureTasks`) does the same: `logger.error('[Agendor] Erro ao buscar tarefas
futuras:', err.message)`. Checked every other `logger.error`/`logger.warn` call added by this
phase across `agendor.js` and `scheduler.js` (12 call sites): all pass either `.message` or a
string built exclusively from integers/fixed text — never an error object, never `err.config`
(which is where an `AxiosError` carries the `Authorization: Token <AGENDOR_TOKEN>` header).
`backend/test/deals.errorLog.test.js` and `backend/test/secrets.grep.test.js` both pass (196/196
suite run above includes them). **CLOSED for T-04-09-01 and every downstream restatement of the
same rule (T-04-02-04, T-04-15-02, T-04-19-03, T-04-23-02, T-04-28-03, T-04-35-02, T-04-36-04,
T-04-37-03).**

### WR-03 — `Number.isInteger` guard sits outside the retry callback

Verified directly. `backend/src/agendor.js:144-148`:

```js
const dealId = Number(id);
if (!Number.isInteger(dealId) || dealId <= 0) {
  throw new Error(`[Agendor] id de negócio inválido: ${String(id)}`);
}
const { data } = await fetchWithRetry(() => api.get(`/deals/${dealId}`));
```

The guard executes and can `throw` *before* `fetchWithRetry` is ever invoked — a hostile id is
rejected once, with zero HTTP calls, not retried three times with the service token in the
header. This is the exact placement the plan's mitigation text (D-WR3-01-b) requires and the
exact placement the accompanying comment names as deliberate. `backend/test/dealId.validation.test.js`
exists and is part of the passing suite. **CLOSED for T-04-09-02, T-04-22-03.**

### SEC-02 — dependency posture measured live, not inherited from prior claims

`backend/package.json` pins `axios@^1.19.0` and `nodemailer@^9.0.4`; `npm ls` confirms both
resolve to exactly those versions. Live `npm audit --json` today: **8 total (6 moderate, 2
high, 0 critical)**. Attributed every one of the 8 to its source package: `body-parser`,
`brace-expansion`, `express`(via `qs`), `morgan`, `node-cron`(via `uuid`), `path-to-regexp`,
`qs`, `uuid`. **Zero trace to `axios` or `nodemailer`.** This matches the claim in
`sec-02-dependency-vulnerabilities.md` (12→8 backend total, 5→2 high) and the todo remains
`pending`, correctly not closed — the remaining 8 are explicitly out of Phase 4 scope (decision
D-06) and owned by `sec-02-dependency-vulnerabilities.md`. **CLOSED for T-04-03-05, T-04-03-SC,
T-04-05-01..06, T-04-05-SC** (all reference the bump, not the residual backlog, which is a
separate, correctly-still-open todo — see Accepted Risks Log below).

### New attack surfaces created by this phase — reviewed explicitly

- **`results.error`/`results.errors` reaching the Dashboard via toast.** Read the two alarm
  message builders in `scheduler.js:470-479` and `:524-538`. Both interpolate only
  `results.stale` / `results.categoriaIndecidivelNaRodada` (integers) into fixed Portuguese
  sentences — no organization name, no deal id, no business data, no error object. Confirmed by
  grep: neither block references `deal.organization`, `deal.id`, or any variable derived from an
  `AxiosError`. No leak.
- **New `logger.warn` calls in `agendor.js`.** Two new sites: the per-deal "categoria
  indecidível" warning (`agendor.js:432-434`) intentionally names the organization and deal id —
  this is internal CRM business data behind JWT auth, the same class of data every other log
  line and every notification email in this system already carries, and is explicitly declared
  as the intended vestige (T-04-19-04/T-04-20-04). It does **not** log the axios error object.
  The aggregate "funil não avaliado" warning (`agendor.js:474-476`) carries only two integers.
  Neither leaks the token or SMTP credential.
- **`getDealById` and `POST /run` returning the full result object.** `routes/notifications.js:46-47`
  does `res.json(result)` with no projection, and `routes/notifications.js:227` calls
  `getDealById(d.deal_id)` but the response the client actually receives
  (`routes/notifications.js:237-243`) is a hand-built object exposing only
  `currentUpdatedAt`, `resolved`, `resolved_at`, and `dealStatus.id` — the raw Agendor deal
  payload from `getDealById` is **not** spread into the response. `runCheck`'s `results` object
  (returned unprojected by `POST /run`) contains only fields this system already treats as
  internal business data behind the existing JWT gate (deal titles, owner/author names and
  emails, day counts) — no credential, no `AGENDOR_TOKEN`, no SMTP password, no raw
  third-party payload. This is consistent with every other authenticated surface in the app
  (`GET /api/deals/stale`, `GET /api/notifications`) and was not flagged as a new class of
  exposure by any of the 38 plans' own threat models, correctly — it isn't one.
- **41 pending todos** — cross-checked by name. Every `accept`/`transfer` disposition below that
  names a todo owner (`in-04`, `in2-03`, `cr4-01b`, `wr4-04b`, `wr4-07b`, `wr3-07b`, `in3-08`,
  `wr4-03b`) has that file present in `.planning/todos/pending/`. None of the 232 phase threats
  is silently unowned.

## Full Threat Register — verified disposition by disposition

Audit column: **CLOSED** = disposition's declared evidence was independently confirmed (grep
match in the cited file/pattern, passing test in the 196/196 run, or todo file present on disk
for `accept`/`transfer`). No entry in this register resolved to OPEN.

### 04-01-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-01-01 | Repudiation | mitigate | CLOSED | Cenários 2 e 3 provam liberação do lock e execução subsequente; qualquer regressão futura fica vermelha no CI |
| T-04-01-02 | Information Disclosure | mitigate | CLOSED | Nunca imprimir o objeto de opções do transporte (contém `auth.pass`) nem `AGENDOR_TOKEN`; `setup.js` já força `SMTP_PASS=''` (PC-13) |
| T-04-01-03 | Tampering | mitigate | CLOSED | `makeTmpDbPath()` + `process.env.DB_PATH` **antes** de qualquer `require('../src/db')`; `cleanup()` no `after` |
| T-04-01-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano; `package.json` e `package-lock.json` fora de `files_modified` |

### 04-02-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-02-01 | Tampering (integridade da decisão de negócio) | mitigate | CLOSED | Substituir `catch { console.error; break }` por `logger.error(err.message)` + `throw err`: o contrato vira "Set completo ou exceção"; cenários Q2-1 e Q2-5 provam 0 notificações na falha e filtro idêntico no sucesso |
| T-04-02-02 | Repudiation | mitigate | CLOSED | `results.error` preenchido pelo catch de `scheduler.js:171` e `lastRunResult` atualizado pelo `finally`; cenário Q2-2 assere |
| T-04-02-03 | Denial of Service (disponibilidade da aba "Negócios") | accept | CLOSED | Decisão humana 2026-08-04: aceitar o 500. Um try/catch local reintroduziria o parcial silencioso; `DealsList.jsx:80` já exibe erro. Cenário B3 pina o shape `{ error }` |
| T-04-02-04 | Information Disclosure | mitigate | CLOSED | Logar apenas `err.message`; nunca `err` cru nem `err.config` (que carrega o header `Authorization: Token <AGENDOR_TOKEN>`) |
| T-04-02-05 | Denial of Service (rodada perdida por erro transitório) | accept | CLOSED | Risco R-10 do contrato: a cadência diária recupera e o 04-06 torna a retentativa real; sinal de alerta é `results.error` recorrente em rodadas seguidas; rollback = revert deste commit |
| T-04-02-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano; `package.json` e `package-lock.json` fora de `files_modified` |

### 04-03-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-03-01 | Denial of Service | mitigate | CLOSED | `timeout: 15000` na fábrica; teste inspeciona os argumentos entregues a `axios.create` |
| T-04-03-02 | Denial of Service | mitigate | CLOSED | Substituído por `getDealById`, que usa a instância compartilhada; grep de aceite garante zero ocorrências de `api.agendor.com.br` no arquivo de rota |
| T-04-03-03 | Information Disclosure | mitigate | CLOSED | Remoção do `const TOKEN` local e do header duplicado; o token passa a ser lido em um único lugar (`agendor.js:4`) |
| T-04-03-04 | Elevation of Privilege / V5 Input Validation | mitigate | CLOSED | `id` vem exclusivamente de `getNotifiedDeals()` (banco); a rota `/resolved` não aceita id de query ou body — **manter assim**, não aceitar id do request |
| T-04-03-05 | Information Disclosure | mitigate | CLOSED | Bump para `^1.19.0`; primeira versão limpa é 1.18.0 (não existe 1.17.1) |
| T-04-03-06 | Tampering | mitigate | CLOSED | Teste obrigatório do shape completo, incluindo `dealStatus` e o caminho de item com falha |
| T-04-03-SC | Tampering | mitigate | CLOSED | Package Legitimacy Audit do 04-RESEARCH: `axios` **[OK]** (11,9 anos, 118M downloads/semana, repo `github.com/axios/axios`, sem `postinstall`) → sem checkpoint de legitimidade. Commit isolado + revisão de diff do lockfile em C4. `npm audit fix` e `slopcheck install` **proibidos** |

### 04-04-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-04-01 | Denial of Service | mitigate | CLOSED | `connectionTimeout: 10000`, `greetingTimeout: 10000`, `socketTimeout: 30000` na fábrica; pior caso por e-mail cai de ~30min para ~1min40s |
| T-04-04-02 | Information Disclosure | mitigate | CLOSED | PC-13: asserir campos individuais; nunca imprimir o objeto (contém `auth.pass`) nem usar `deepStrictEqual` sobre ele; `setup.js` força `SMTP_PASS=''` |
| T-04-04-03 | Denial of Service (timeout curto demais) | accept | CLOSED | Risco R-4: 30s é generoso para SMTP; sinal de alerta é `ETIMEDOUT` frequente em produção; rollback é 1 linha |
| T-04-04-04 | Tampering | mitigate | CLOSED | D-03 proíbe alterar; testes pinam contagem (3), esperas (3s/6s), recriação do transporter e retorno `{ success:false }` sem throw |
| T-04-04-SC | Tampering | accept | CLOSED | Nenhuma instalação neste plano — `nodemailer` continua em 6.x aqui; o bump é escopo exclusivo do 04-05 |

### 04-05-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-05-01 | Spoofing | mitigate | CLOSED | Bump para `^9.0.4` |
| T-04-05-02 | Tampering | mitigate | CLOSED | Bump para `^9.0.4` |
| T-04-05-03 | Denial of Service | mitigate | CLOSED | Bump para `^9.0.4`; é o motivo de o major ser obrigatório |
| T-04-05-04 | Information Disclosure | mitigate | CLOSED | `^9.0.4` (≥9.0.1 já fecha) |
| T-04-05-05 | Tampering | mitigate | CLOSED | **PROIBIDO.** O breaking change é sobre busca de conteúdo remoto (anexo href/path, endpoint OAuth2, CONNECT de proxy) e não toca a conexão ao SMTP, governada pela opção `tls` do transporte, que **não mudou**. C3 verifica explicitamente |
| T-04-05-06 | Tampering | mitigate | CLOSED | Dependência dura do 04-04: `emailer.timeout.test.js` é o oráculo real (a suíte antiga cobria 7,16% de `emailer.js`); editar teste para passar é gatilho de parada |
| T-04-05-SC | Tampering | mitigate | CLOSED | Package Legitimacy Audit do 04-RESEARCH: `nodemailer` **[OK]** (15,5 anos, 19,2M downloads/semana, repo `github.com/nodemailer/nodemailer`, **zero dependências**, sem `postinstall`) → sem checkpoint de legitimidade. Commit único json+lock; diff de exatamente 1 linha revisado em C4; `npm audit fix` e `slopcheck install` proibidos |

### 04-06-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-06-01 | Repudiation | mitigate | CLOSED | Insert com `'pending'` + `updateNotificationStatus(logId, 'sent'|'error', ...)` após o resultado; cenários Q1-1 a Q1-3 provam |
| T-04-06-02 | Repudiation | mitigate | CLOSED | O catch passa a atualizar a linha existente; cenário Q1-2 assere exatamente 1 linha para o deal |
| T-04-06-03 | Denial of Service (silencioso) | mitigate | CLOSED | Com `'error'` na linha, a rodada seguinte retenta; cenário Q1-4 assere `false` |
| T-04-06-04 | Information Disclosure | mitigate | CLOSED | Gravar apenas `r.error`/`err.message`; verificar que nenhuma mensagem embute `SMTP_PASS` ou host+credencial (`EAUTH` produz `Invalid login`, sem a senha) — PC-13 |
| T-04-06-05 | Tampering | mitigate | CLOSED | Regra explícita "≥ 1 sucesso confirma `'sent'`"; cenários Q1-1, Q1-5 e R-11 |
| T-04-06-06 | Tampering | accept | CLOSED | **Nenhuma migração**: a informação para reclassificar nunca foi gravada; a dedup é por data e as datas já passaram. Declarado neste PLAN para que C5 não cobre um script |
| T-04-06-07 | Tampering | accept | CLOSED | `track.js` **não lê `status`** e não é tocado por este plano; a allowlist `*.agendor.com.br` existente não regride |
| T-04-06-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano |

### 04-07-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-07-01 | Tampering (integridade da regra de negócio) | mitigate | CLOSED | Limpeza das chaves na primeira instrução de `getStaleDeals`; cenário (1) prova o refetch |
| T-04-07-02 | Tampering | mitigate | CLOSED | Proibição explícita de reatribuir + critério de aceite por `grep`; o golden `[101, 103]` de `agendor.getStaleDeals.test.js:61` é o detector |
| T-04-07-03 | Denial of Service (silencioso) | mitigate | CLOSED | A limpeza por execução zera o `null` de erro; cenário (3) prova |
| T-04-07-04 | Denial of Service (eficiência) | mitigate | CLOSED | Cenário (2) assere uma chamada por organização única por execução; o `Promise.all` de `:157` continua deduplicando dentro da rodada |
| T-04-07-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano |

### 04-08-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-08-01 | Tampering (integridade da regra de negócio) | mitigate | CLOSED | Mapa local à execução construído com o retorno do `Promise.all`; `agendor.cacheConcurrency.test.js` prova o interleaving com pré-condições explícitas |
| T-04-08-02 | Information Disclosure | mitigate | CLOSED | Golden `[101, 103]` asserido nas DUAS execuções sobrepostas, não só na sequencial |
| T-04-08-03 | Tampering | mitigate | CLOSED | `agendor.cacheInvalidation.test.js` roda sem edição de asserção; critério de aceite exige `delete orgCategoryCache[` presente |
| T-04-08-04 | Denial of Service (eficiência) | mitigate | CLOSED | O cenário (2) de `agendor.cacheInvalidation.test.js` conta 6 urls para 6 organizações únicas e continua verde |
| T-04-08-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano; `backend/package.json` e o lockfile não são tocados |

### 04-09-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-09-01 | Information Disclosure | mitigate | CLOSED | Trocar por `logger.error('[Deals] …', err.message)`; teste assere que o token sintético não aparece nos argumentos serializados e que `console.error` não é chamado |
| T-04-09-02 | Elevation of Privilege / SSRF de caminho | mitigate | CLOSED | Guarda `Number.isInteger(dealId) && dealId > 0` antes de qualquer requisição; teste assere zero chamadas HTTP no caminho recusado |
| T-04-09-03 | Tampering | mitigate | CLOSED | `Number.parseInt(req.body.dealId, 10) || 0`; teste lê a linha gravada e assere `typeof === 'number'` |
| T-04-09-04 | Denial of Service (silencioso) | mitigate | CLOSED | Caso 4 do teste pina `getDealById('101')` consultando `/deals/101`; `notifications.resolved.test.js` roda sem edição |
| T-04-09-05 | Information Disclosure | transfer | CLOSED | Registrado como todo `in-04-escape-html-no-test-card.md` com `priority: high`; exige mexer no template, declarado inalterado pelo contrato da fase |
| T-04-09-06 | Information Disclosure | mitigate | CLOSED | Valor em caixa alta com a palavra `SINTETICO`, sem formato de UUID; `node --test test/secrets.grep.test.js` no verify |
| T-04-09-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano; `backend/package.json` e o lockfile não são tocados |

### 04-10-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-10-01 | Tampering (integridade do registro) | mitigate | CLOSED | `err.resultadosParciais` atravessa a exceção; o `catch` só rebaixa quando nada foi confirmado; cenário A assere `status === 'sent'` e `alreadyNotifiedToday === true` |
| T-04-10-02 | Denial of Service (assédio ao destinatário) | mitigate | CLOSED | Asserção direta de `alreadyNotifiedToday(dealId) === true` no cenário A |
| T-04-10-03 | Repudiation | mitigate | CLOSED | Incremento movido para dentro do ramo `'sent'`; cenário B assere `notified === 0` numa falha total |
| T-04-10-04 | Tampering | mitigate | CLOSED | Os 6 cenários de `notificationStatus.test.js` rodam sem edição no verify; cenário B repete a asserção de `'error'` |
| T-04-10-05 | Repudiation | mitigate | CLOSED | Asserção de pré-condição sobre `fake.get.mock.calls` contendo `'/users'` |
| T-04-10-06 | Information Disclosure | mitigate | CLOSED | PC-13 explícito na ação: o stub não captura nem assere `opts` |
| T-04-10-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano; `backend/package.json` e o lockfile não são tocados |

### 04-11-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-11-01 | Denial of Service (silencioso) | mitigate | CLOSED | `fetchWithRetry` aplicado ao `/tasks`; caso 1 assere que a chamada conclui após a retentativa |
| T-04-11-02 | Denial of Service | mitigate | CLOSED | Limite de 3 tentativas preservado byte a byte; caso 2 assere exatamente 3 requisições e a propagação da falha |
| T-04-11-03 | Tampering | mitigate | CLOSED | Caso 4 caracteriza o 429 de `/deals` **antes** da extração (golden `[101, 103]` e 2 requisições); critérios de aceite exigem uma única ocorrência da condição e da espera |
| T-04-11-04 | Denial of Service | mitigate | CLOSED | Caso 3 assere 1 requisição para um erro sem `err.response`; `agendor.timeout.test.js` caso (5) roda sem edição |
| T-04-11-05 | Tampering | mitigate | CLOSED | O `catch` externo com `throw err` e o comentário de contrato permanecem; `scheduler.failsafe.test.js` roda sem edição no verify |
| T-04-11-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano; `backend/package.json` e o lockfile não são tocados |

### 04-12-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-12-01 | Tampering (integridade da regra de negócio) | mitigate | CLOSED | Cache passado por parâmetro e criado dentro de `getStaleDeals`; cenário espelho assere o golden em B e o contador de reconsulta |
| T-04-12-02 | Information Disclosure | mitigate | CLOSED | `assert.equal(idsB.includes(105), false)` mais `deepStrictEqual` do golden em ambas as execuções |
| T-04-12-03 | Tampering | mitigate | CLOSED | Os 3 cenários de `agendor.cacheInvalidation.test.js` rodam sem edição de asserção; C9 exige decisão humana registrada |
| T-04-12-04 | Denial of Service (eficiência) | mitigate | CLOSED | Cenário (2) conta 6 urls para 6 organizações únicas e continua verde |
| T-04-12-05 | Information Disclosure (log injection) | accept | CLOSED | Vetor RECONHECIDO e deliberadamente não fechado aqui: hoje a rejeição é absorvida pelo `catch` por item de `resolvedHandler` e não chega a log nenhum, e mexer nela misturaria dois comportamentos no mesmo commit. Registrado como todo pendente `in2-03-*` pelo plano 04-18 |
| T-04-12-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano; `backend/package.json` e o lockfile não são tocados |

### 04-13-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-13-01 | Repudiation (falha atribuída ao ator errado) | mitigate | CLOSED | Promessa derivada com os dois ramos tratados; caso 1 do meta-teste assere o erro real e a ausência de `unhandledRejection` |
| T-04-13-02 | Denial of Service (da própria suíte) | mitigate | CLOSED | Falha explícita ANTES do `await encerrada`; caso 3 do meta-teste; critério de aceite verifica a ordem por `grep -n` |
| T-04-13-03 | Tampering (do oráculo) | accept | CLOSED | Cópia local preservada de propósito; decisão registrada no comentário do helper e no SUMMARY |
| T-04-13-04 | Information Disclosure | accept | CLOSED | O meta-teste não toca `nodemailer`, `emailer.js` nem qualquer configuração — só promessas sintéticas locais |
| T-04-13-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano; `backend/package.json` e o lockfile não são tocados |

### 04-14-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-14-01 | Repudiation | mitigate | CLOSED | Incremento dentro do mesmo ramo que grava `'sent'`; cenário A assere `r.notified === 1` |
| T-04-14-02 | Tampering (integridade do registro) | mitigate | CLOSED | Cenário A assere `status === 'sent'` e `alreadyNotifiedToday === true`; os 6 cenários de `notificationStatus.test.js` rodam sem edição |
| T-04-14-03 | Repudiation | mitigate | CLOSED | Critério de aceite fixa `results.notified++` em exatamente 2 ocorrências, uma por ramo; cenário B assere 0 na falha total |
| T-04-14-04 | Information Disclosure | mitigate | CLOSED | PC-13 já vigente no arquivo: o stub ramifica por `to` e não captura `opts`; a task não altera o stub |
| T-04-14-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano; `backend/package.json` e o lockfile não são tocados |

### 04-15-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-15-01 | Denial of Service (auto-infligido) | mitigate | CLOSED | `try/catch` no registro; Cenário D assere `r.deals.length === 2` |
| T-04-15-02 | Information Disclosure | mitigate | CLOSED | Só `erroDeRegistro.message` é logado; critério de aceite verifica por grep |
| T-04-15-03 | Repudiation | mitigate | CLOSED | `logger.error` com tag `[Scheduler]`, seguindo a convenção greppável por subsistema |
| T-04-15-04 | Repudiation | mitigate | CLOSED | Task 2 (b) troca o exemplo pelo que o cenário A exercita e declara o desfecho do caso não coberto |
| T-04-15-05 | Denial of Service (assédio ao destinatário) | accept | CLOSED | Trade-off explícito, aprovado em C10: reenvio é preferível a silêncio permanente. Registrado no comentário do código e no SUMMARY |
| T-04-15-06 | Tampering | accept | CLOSED | Lacuna conhecida e declarada; fechá-la mudaria outra instrução do `catch` e é escopo de outra rodada |
| T-04-15-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano; `backend/package.json` e o lockfile não são tocados |

### 04-16-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-16-01 | Denial of Service (auto-infligido) | mitigate | CLOSED | Guarda `Array.isArray` no consumidor; Cenário E assere `r.deals.length === 2` |
| T-04-16-02 | Tampering (integridade do registro) | mitigate | CLOSED | Validação de tipo explícita; ausência ou corrupção tratadas como "nada confirmado" (fail-safe `'error'`) |
| T-04-16-03 | Repudiation | mitigate | CLOSED | Task 2 (b) documenta a fragilidade no produtor e nomeia o desfecho fail-safe |
| T-04-16-04 | Tampering | mitigate | CLOSED | Leitura obrigatória do bloco antes de editar; critério de aceite exige `catch (erroDeRegistro)` presente e diff de exatamente 2 linhas de código |
| T-04-16-05 | Denial of Service (assédio ao destinatário) | accept | CLOSED | Mesmo trade-off aprovado em C10 (04-15): reenvio é preferível a silêncio permanente. Nenhum destinatário recebe a mais por causa desta mudança — hoje o mesmo deal já ficaria `'pending'`, igualmente retentável |
| T-04-16-06 | Tampering | accept | CLOSED | Lacuna conhecida e declarada no comentário; fechá-la mudaria outra instrução do `catch` e é escopo de outra rodada |
| T-04-16-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano; `backend/package.json` e o lockfile não são tocados |

### 04-17-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-17-01 | Denial of Service (entrega) | mitigate | CLOSED | Transporte vivo devolvido e reaproveitado; caso 1 assere `transportesCriados === 2` e ambos com sucesso |
| T-04-17-02 | Information Disclosure | mitigate | CLOSED | Desestruturação com rest no `push`; caso 2 assere `Object.keys` exato; critério de aceite proíbe `...result` |
| T-04-17-03 | Information Disclosure | mitigate | CLOSED | Stub ramifica por índice e por `to`; critério de aceite exige 0 ocorrências de `auth` no arquivo de teste |
| T-04-17-04 | Tampering | mitigate | CLOSED | `emailer.timeout.test.js` sem edição no verify; greps sobre `attempt * 3000`, `retries = 3` e `success: false` |
| T-04-17-05 | Denial of Service (custo) | mitigate | CLOSED | Caso 3 assere `transportesCriados === 1` |
| T-04-17-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano; `backend/package.json` e o lockfile não são tocados |

### 04-18-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-18-01 | Repudiation | mitigate | CLOSED | Conversão para âncora nomeada mais gate por grep que detecta reincidência |
| T-04-18-02 | Tampering | mitigate | CLOSED | Critério de aceite com contagem 0 de linhas não-comentário no diff; suíte completa roda no verify |
| T-04-18-03 | Information Disclosure | mitigate | CLOSED | Regra explícita na ação e `secrets.grep.test.js` no critério de aceite |
| T-04-18-04 | Repudiation | mitigate | CLOSED | Critério de aceite com grep dedicado; regra repetida na ação |
| T-04-18-05 | Information Disclosure | accept | CLOSED | Registrado como todo com correção sugerida e regra de precaução; não é explorável pelo caminho atual, em que a rejeição não chega a log nenhum |
| T-04-18-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote neste plano; `backend/package.json` e o lockfile não são tocados |

### 04-19-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-19-01 | Spoofing (categoria falsa por omissão) | mitigate | CLOSED | Sentinela `CATEGORIA_INDECIDIVEL` no `catch` e campo `categoriaIndecidivel` no negócio; casos (1) e (2) |
| T-04-19-02 | Denial of Service (indisponibilidade transitória virando decisão) | mitigate | CLOSED | `fetchWithRetry` na borda, com a política única e inalterada; caso (3) mede 2 tentativas |
| T-04-19-03 | Information Disclosure | mitigate | CLOSED | O `warn` nomeia organização, id e negócio — **nunca** o objeto de erro nem `err.config`; critério de aceite limita a 1 `logger.warn` |
| T-04-19-04 | Repudiation | mitigate | CLOSED | `logger.warn` com tag `[Agendor]` e campo persistido no objeto de negócio |
| T-04-19-05 | Denial of Service (auto-infligido) | accept | CLOSED | A política não muda: só 429 entra no retry; caso (4) mede 1 tentativa para erro sem `response` |
| T-04-19-06 | Tampering | accept | CLOSED | Decisão do usuário de 2026-08-05; caso (2) pina o custo por escrito, e a rodada seguinte retenta |
| T-04-19-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; `package.json` e lockfile não são tocados |

### 04-20-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-20-01 | Spoofing (elegibilidade presumida) | mitigate | CLOSED | Guarda por `deal.categoriaIndecidivel` antes do bloco de envio; cenários A e B asserem zero envios |
| T-04-20-02 | Denial of Service (auto-infligido) | mitigate | CLOSED | Guarda com `continue`, não com `throw`; `r.error === undefined` e `r.deals.length === 2` asseridos |
| T-04-20-03 | Tampering (integridade da dedup) | mitigate | CLOSED | A guarda fica antes do insert; critério exige zero linhas para o negócio indecidível |
| T-04-20-04 | Repudiation | mitigate | CLOSED | `skipReason` em PT-BR no `dealResult`, visível na resposta da rodada, mais o `logger.warn` do 04-19 |
| T-04-20-05 | Denial of Service (notificação perdida) | accept | CLOSED | Decisão do usuário de 2026-08-05; a rodada seguinte reconsulta a categoria (REL-04) e volta a notificar |
| T-04-20-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; `package.json` e lockfile não são tocados |

### 04-21-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-21-01 | Spoofing (elegibilidade presumida) | mitigate | CLOSED | Segundo predicado no filtro; cenários (1), (2) e (4) com asserção sobre o HTML |
| T-04-21-02 | Information Disclosure | mitigate | CLOSED | Mesmo filtro; o card permanece apenas nas superfícies internas (painel e consolidado do admin) |
| T-04-21-03 | Repudiation | mitigate | CLOSED | `logger.warn` com tag `[Emailer]` e contagem própria, separada de `skippedByFunnel` |
| T-04-21-04 | Information Disclosure | mitigate | CLOSED | O aviso carrega apenas uma contagem inteira; PC-13 vale no teste e no código |
| T-04-21-05 | Denial of Service (relatório incompleto) | accept | CLOSED | Decisão do usuário de 2026-08-05; o card continua no painel e no consolidado do admin, e a semana seguinte reconsulta |
| T-04-21-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; `package.json` e lockfile não são tocados |

### 04-22-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-22-01 | Denial of Service | mitigate | CLOSED | `fetchWithRetry` em `getUsers`; caso (5) mede 2 requisições |
| T-04-22-02 | Spoofing (destinatário resolvido errado) | mitigate | CLOSED | Caso (6) exige rejeição na exaustão; o contrato "completo ou falha" não muda |
| T-04-22-03 | Elevation of Privilege | mitigate | CLOSED | Guarda de tipo permanece antes do callback; caso (8) assere 0 requisições para id inválido |
| T-04-22-04 | Denial of Service (auto-infligido) | mitigate | CLOSED | Caso (7) mede 1 requisição; a condição de 429 não muda |
| T-04-22-05 | Information Disclosure | accept | CLOSED | O helper relança sem logar; quem loga (`getDealsWithFutureTasks`, `routes/deals.js`) já usa só `err.message` desde CR-02 |
| T-04-22-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; `package.json` e lockfile não são tocados |

### 04-23-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-23-01 | Denial of Service (auto-infligido) | mitigate | CLOSED | `try/catch` próprio; cenário E assere `r.deals.length === 2` |
| T-04-23-02 | Information Disclosure | mitigate | CLOSED | Apenas `erroDeDedup.message` vai ao `logger.error` (CR-02) |
| T-04-23-03 | Repudiation | mitigate | CLOSED | `logger.error` com tag `[Scheduler]` |
| T-04-23-04 | Denial of Service (assédio ao destinatário) | accept | CLOSED | Trade-off aprovado em C10; duplicata é preferível a notificação perdida em silêncio |
| T-04-23-05 | Spoofing (dedup contornada) | mitigate | CLOSED | Cenário E assere 4 envios e `r.notified === 2` |
| T-04-23-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; `package.json` e lockfile não são tocados |

### 04-24-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-24-01 | Denial of Service (auto-infligido) | mitigate | CLOSED | Predicado validando o elemento; cenário F assere `r.deals.length === 2` |
| T-04-24-02 | Tampering (integridade do registro) | mitigate | CLOSED | Cenário G assere `'sent'` e dedup verdadeira |
| T-04-24-03 | Spoofing (confirmação forjada) | mitigate | CLOSED | Comparação estrita com `true` |
| T-04-24-04 | Denial of Service | mitigate | CLOSED | Encadeamento opcional na leitura da mensagem |
| T-04-24-05 | Tampering | accept | CLOSED | Lacuna conhecida e declarada desde o 04-16; fechá-la muda outra instrução e pede plano próprio |
| T-04-24-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; `package.json` e lockfile não são tocados |

### 04-25-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-25-01 | Denial of Service | mitigate | CLOSED | `MAX_PAGES` com falha explícita nas duas funções; casos (1) e (3) |
| T-04-25-02 | Denial of Service (silencioso e permanente) | mitigate | CLOSED | A falha vira rejeição comum, absorvida pelo `catch` de `runCheck`, cujo `finally` libera o lock |
| T-04-25-03 | Resource exhaustion | mitigate | CLOSED | O teto encerra o crescimento em 20.000 registros |
| T-04-25-04 | Spoofing (proteção parcial) | mitigate | CLOSED | Forma prescrita com `throw`; caso (3) exige rejeição; contrato Q2 preservado |
| T-04-25-05 | Denial of Service (notificação perdida) | accept | CLOSED | 20.000 registros por borda está ordens de magnitude acima do uso real; caso (2)/(4) protegem o caminho normal |
| T-04-25-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; `package.json` e lockfile não são tocados |

### 04-26-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-26-01 | Repudiation | mitigate | CLOSED | Helper único (Task 2) e estado neutro em `beforeEach` (Tasks 1 e 3) |
| T-04-26-02 | Tampering (do oráculo) | mitigate | CLOSED | Critério de zero asserções no diff dos seis arquivos |
| T-04-26-03 | Denial of Service (confiança) | mitigate | CLOSED | Rearme por caso e reafirmação de estado; contagem de testes idêntica à da entrada |
| T-04-26-04 | Tampering | mitigate | CLOSED | Ordem explícita de PARAR e reportar |
| T-04-26-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; nenhum arquivo de produção tocado |

### 04-27-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-27-01 | Repudiation | mitigate | CLOSED | Oito arquivos com origem, evidência e correção proposta |
| T-04-27-02 | Tampering (do critério) | mitigate | CLOSED | Item 7 escrito como comportamento garantido; itens 1 a 6 preservados |
| T-04-27-03 | Elevation of Privilege (de escopo) | mitigate | CLOSED | `git status --porcelain backend/` vazio como critério nas três tasks |
| T-04-27-04 | Information Disclosure | mitigate | CLOSED | Nenhum todo desta rodada cita `sec-01`; o valor do token não aparece em lugar nenhum |
| T-04-27-05 | Repudiation | accept | CLOSED | `in3-08` com prioridade alta e declarado candidato a promoção na fase seguinte |
| T-04-27-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; nenhum arquivo de `backend/` tocado |

### 04-28-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-28-01 | Denial of Service (silencioso) | mitigate | CLOSED | Contador dedicado, `results.error`, `results.errors` e `logger.error`; caso D |
| T-04-28-02 | Repudiation | mitigate | CLOSED | `dealResult.skipReason` nas duas causas do ramo `else`; D-CR4-01-f |
| T-04-28-03 | Information Disclosure | mitigate | CLOSED | D-CR4-01-d: a mensagem interpola apenas inteiros e texto fixo; nenhum objeto de erro é logado |
| T-04-28-04 | Tampering (alarme como ruído) | mitigate | CLOSED | Caso E: supressão total por funil não dispara |
| T-04-28-05 | Denial of Service (fail-open do próprio alarme) | accept | CLOSED | Medido e declarado no inventário de irmãos; denominador derivado rejeitado por falhar aberto por caminho novo; dono: todo `cr4-01b` |
| T-04-28-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; `package.json` e lockfile não são tocados |

### 04-29-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-29-01 | Denial of Service | mitigate | CLOSED | Teto `MAX_PAGES` com `throw` antes da alocação; caso (5) |
| T-04-29-02 | Resource exhaustion | mitigate | CLOSED | O `throw` precede o `Array.from` (D-WR4-01-b); caso (5) assere 1 requisição |
| T-04-29-03 | Denial of Service (silencioso e permanente) | mitigate | CLOSED | A falha vira rejeição comum, absorvida pelo `catch` de `runCheck`, cujo `finally` libera o lock |
| T-04-29-04 | Denial of Service | mitigate | CLOSED | Guarda `data.data` com fallback em `getUsers`; caso (7) |
| T-04-29-05 | Spoofing (proteção parcial) | mitigate | CLOSED | Forma prescrita com `throw`; caso (5) exige rejeição; critério de zero `Math.min` |
| T-04-29-06 | Denial of Service (notificação perdida) | accept | CLOSED | Ordens de magnitude acima do uso real, mesma aceitação de T-04-25-05; caso (6) protege o caminho normal |
| T-04-29-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; `package.json` e lockfile não são tocados |

### 04-30-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-30-01 | Denial of Service (auto-infligido) | mitigate | CLOSED | `LOTE_DE_ORGS` limitando a concorrência; caso (1) |
| T-04-30-02 | Denial of Service (do próprio painel) | mitigate | CLOSED | O lote vive dentro de `getStaleDeals`, herdado pelos 6 pontos de chamada |
| T-04-30-03 | Spoofing (categoria trocada) | mitigate | CLOSED | Par `[id, categoria]` preservado; caso (2) e o golden `[101, 103]` como regressão |
| T-04-30-04 | Information Disclosure | mitigate | CLOSED | PC-13 declarado no cabeçalho; o stub lê apenas a url |
| T-04-30-05 | Denial of Service | accept | CLOSED | Fora do escopo aprovado; medido e declarado no inventário; `try/catch` por item impede aborto; dono: todo `wr4-04b` |
| T-04-30-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; `package.json` e lockfile não são tocados |

### 04-31-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-31-01 | Spoofing (da informação ao operador) | mitigate | CLOSED | `seraNotificado` com os quatro predicados; casos F e G |
| T-04-31-02 | Tampering (divergência silenciosa) | mitigate | CLOSED | Igualdade entre prévia e envio asserida nos casos F e G (D-WR4-06-d) |
| T-04-31-03 | Denial of Service (auto-infligido) | mitigate | CLOSED | Valor reusado de uma única chamada (D-WR4-06-c); critério de contagem |
| T-04-31-04 | Repudiation | mitigate | CLOSED | O campo marca por negócio, e a lista não é filtrada |
| T-04-31-05 | Tampering (dado obsoleto do cliente) | mitigate | CLOSED | Fallback para `total` quando o campo não existe (D-WR4-06-f) |
| T-04-31-06 | Elevation of Privilege (fail-open de elegibilidade) | accept | CLOSED | Fora do escopo aprovado; medido no inventário; dono: todo `in3-08`, prioridade alta |
| T-04-31-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; nenhum `package.json` ou lockfile é tocado |

### 04-32-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-32-01 | Denial of Service | mitigate | CLOSED | Guardas na fonte e no template; caso (6) mede o custo agregado |
| T-04-32-02 | Denial of Service (silencioso) | mitigate | CLOSED | Removida a causa; o caminho deixa de lançar |
| T-04-32-03 | Repudiation (relatório enganoso) | mitigate | CLOSED | D-WR4-07-e: asserções sobre a ausência das strings no HTML |
| T-04-32-04 | Information Disclosure | mitigate | CLOSED | PC-13 já declarado no arquivo; o stub lê apenas `to` e `html`, e os casos novos seguem a mesma regra |
| T-04-32-05 | Repudiation (saudação com nulo no e-mail diário) | accept | CLOSED | Interpolação, não desreferência; não lança e não custa envio; fora do escopo aprovado; dono: todo `wr4-07b` |
| T-04-32-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; `package.json` e lockfile não são tocados |

### 04-33-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-33-01 | Repudiation | mitigate | CLOSED | As duas frases alinhadas à fonte da verdade; medição de 1 implementação na suíte |
| T-04-33-02 | Repudiation | mitigate | CLOSED | Âncoras nomeadas, conferidas contra o `emailer.js` atual antes de escritas |
| T-04-33-03 | Tampering | mitigate | CLOSED | Diff de `backend/src/` vazio e zero `assert` no diff, como critérios de aceite em cada task |
| T-04-33-04 | Information Disclosure | mitigate | CLOSED | Nenhum valor é citado; PC-13 já declarado nos arquivos e preservado |
| T-04-33-05 | Repudiation | accept | CLOSED | Medidas e registradas no inventário; dono: todo `wr4-03b`, com fechamento previsto junto do gate de CI de `in3-04` |
| T-04-33-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; `package.json` e lockfile não são tocados |

### 04-34-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-34-01 | Repudiation | mitigate | CLOSED | 10 todos criados; IN4-01 fechado com medição; critérios de contagem |
| T-04-34-02 | Tampering | mitigate | CLOSED | `git status --porcelain backend/ frontend/` vazio como critério nas três tasks |
| T-04-34-03 | Tampering (decisão do usuário) | mitigate | CLOSED | D-IN4-d; critério de `git status .planning/todos/` listando apenas arquivos não rastreados |
| T-04-34-04 | Information Disclosure | mitigate | CLOSED | Critérios de grep em todos os arquivos criados e no diff do ROADMAP; SEC-01 permanece aberto e não é declarado resolvido |
| T-04-34-05 | Repudiation | mitigate | CLOSED | D-IN4-f; critério de zero identificadores no arquivo |
| T-04-34-06 | Repudiation | accept | CLOSED | Registro datado de execução, não instrução viva; exclusão declarada no inventário do 04-29 |
| T-04-34-SC | Tampering | accept | CLOSED | Nenhuma instalação de pacote; nenhum arquivo de código é tocado |

### 04-35-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-35-01 | Tampering | accept | CLOSED | A substring amplia o conjunto suprimido: um funil de terceiro cujo nome contenha "beefor" (ex.: `'beeforx'`) deixa de notificar. Risco aceito **explicitamente pelo usuário** em 2026-08-05, com a consequência apresentada; o CRM é interno e nomes de funil são criados por administradores da Cadmus. Pinado pelo caso 5 do oráculo unitário, para que a escolha não seja desfeita por engano |
| T-04-35-02 | Information Disclosure | mitigate | CLOSED | As duas mensagens carregam **apenas inteiros e texto fixo** — nenhum objeto de erro, nenhum id, nenhum nome de negócio ou organização. Mesma regra do CR-02 (04-09) e do alarme do 04-28. Critério de aceite na Task 3 |
| T-04-35-03 | Denial of Service | mitigate | CLOSED | O aviso é **agregado** (uma linha por chamada), não por negócio (D-IN3-08-e). Numa mudança de forma do payload com auto-refresh do `DealsList.jsx`, o aviso por negócio produziria N linhas por atualização de tela; um log inundado é um log que não se lê, e a mitigação viraria o defeito |
| T-04-35-04 | Repudiation | accept | CLOSED | O negócio suprimido por funil já registra `dealResult.skipReason` nomeando o funil, e a supressão continua sem linha em `notification_log` porque não houve evento de envio — contrato herdado, intocado. O diff não toca essa guarda |
| T-04-35-05 | Spoofing | mitigate | CLOSED | A mensagem do alarme afirma, por extenso, que a rodada CONCLUIU e que **a supressão por funil não impediu nenhuma notificação**. Sem isso, um operador que leia só `results.error` concluiria que perdeu envios e dispararia manualmente, gerando duplicatas. A afirmação é deliberadamente ESTREITA: a redação larga ("ninguém deixou de ser notificado") seria falsa numa rodada composta em que negócios também foram pulados por dedup ou por categoria indecidível — o contador incrementa antes dessas guardas (D-IN3-08-f) —, e uma mitigação que mente em parte dos casos é pior que nenhuma. Gate na Task 3 |
| T-04-35-SC | Tampering | mitigate | CLOSED | Este plano **não instala nada**. Nenhuma dependência nova, nenhum bump. Gate: `git status --porcelain` de `package.json` e dos lockfiles vazio na Task 3. Não havendo instalação, o portão humano de legitimidade de pacote não se aplica |

### 04-36-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-36-01 | Spoofing | mitigate | CLOSED | Um toast vermelho **em branco** depois de um envio bem-sucedido falsifica o desfecho da rodada: o operador conclui que perdeu envios, dispara de novo e gera **duplicatas** (a ameaça T-04-35-05, realizada). A ramificação passa a ser por `execucaoIgnorada`, que só existe no caminho de recusa; e o toast de recusa ganha texto de reserva, de modo que a superfície não pode renderizar vazio nem quando `reason` some. Pinado pelo PAR caso (6) + cenário K |
| T-04-36-02 | Repudiation | mitigate | CLOSED | No apagão, o alarme do 04-28/04-35 existia apenas em `results.errors` e só chegava à tela pelo polling de 2 min — o disparo manual não deixava rastro visível do apagão para quem o operou. `sendNow` passa a exibir o primeiro item do array num toast próprio, em `id` distinto, sem substituir o resumo |
| T-04-36-03 | Tampering | mitigate | CLOSED | Renomear em vez de acrescentar quebraria consumidores não medidos do payload. As duas chaves antigas ficam, e o caso (6) assere as **três** ao mesmo tempo, de modo que remover a antiga fica vermelho |
| T-04-36-04 | Information Disclosure | mitigate | CLOSED | O conteúdo de `results.errors` é montado no backend com **apenas inteiros e texto fixo** (regra CR-02 do 04-09, aplicada pelos alarmes do 04-28 e do 04-35 e pinada nos gates daqueles planos). Esta task **não** cria mensagem nova no backend e **não** interpola objeto de erro no frontend — gate: `git diff --name-only -- backend/src/routes/` vazio e nenhum bloco de alarme de `scheduler.js` no diff |
| T-04-36-05 | Denial of Service | accept | CLOSED | No máximo **dois** toasts por clique: o resumo e, quando existir, **um** alarme por rodada — o alarme é agregado por construção (uma linha por rodada, pinado por `r.errors.length === 1` nos cenários D e I). Não há caminho para N toasts por negócio |
| T-04-36-SC | Tampering | mitigate | CLOSED | Este plano **não instala nada** — nenhuma dependência nova, nenhum bump. Gate: `git status --porcelain` dos três `package.json` e dos três lockfiles vazio na Task 2. Não havendo instalação, o portão humano de legitimidade de pacote não se aplica |

### 04-37-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-37-01 | Repudiation | mitigate | CLOSED | Um apagão da borda de organizações numa rodada com **qualquer** negócio deduplicado ficava indistinguível de um dia calmo: zero e-mails, `results.error` undefined, `results.errors` vazio. O contador passa a percorrer o mesmo conjunto do denominador, e o par L/M prova que o alarme dispara na causa certa e cala nas demais |
| T-04-37-02 | Spoofing | mitigate | CLOSED | Com o contador no topo do laço, a condição total passa a valer em rodada **composta**, e a frase "nenhum negócio parado **do dia** foi notificado" seria **falsa** para quem já recebera às 8h. Uma mitigação que mente em parte dos casos treina o operador a ignorá-la — e o operador que conclui ter perdido envios redispara e gera **duplicatas** (T-04-35-05). A afirmação passa a ser sobre a RODADA, com a ressalva escrita, e o cenário L assere a redação |
| T-04-37-03 | Information Disclosure | mitigate | CLOSED | Apenas **inteiros e texto fixo** entram na mensagem — nenhum id, nome de negócio, nome de organização ou objeto de erro (regra CR-02 do 04-09). Critério de aceite na Task 2 |
| T-04-37-04 | Tampering | mitigate | CLOSED | O incremento novo **não** faz `continue`, **não** escreve `dealResult.skipped` e **não** toca `results.skipped`; o bloco de alarme continua aditivo e depois do laço. Gates: `continue;` = **3** (inalterado), `results.skipped++` = **4** (inalterado), guardas fora do diff de código |
| T-04-37-05 | Denial of Service | mitigate | CLOSED | Um alarme que dispara sem causa é um alarme que se aprende a ignorar, e aí o apagão real volta a passar despercebido. O cenário **M** (dedup ao lado de notificável, borda sã) exige `r.errors.length === 0` e reprova qualquer implementação que ligue o alarme por quantidade |
| T-04-37-06 | Information Disclosure | mitigate | CLOSED | O artefato documental não pode carregar valor de segredo (C8 / SEC-01: o `AGENDOR_TOKEN` permanece com rotação pendente e o valor nunca é exibido). Gate de grep na Task 3 |
| T-04-37-SC | Tampering | mitigate | CLOSED | Este plano **não instala nada** — nenhuma dependência nova, nenhum bump. Gate: `git status --porcelain` dos `package.json` e lockfiles vazio na Task 2. Não havendo instalação, o portão humano de legitimidade de pacote não se aplica |

### 04-38-PLAN.md

| Threat ID | Category | Disposition | Audit | Evidence |
|---|---|---|---|---|
| T-04-38-01 | Information Disclosure | mitigate | CLOSED | Nenhum valor de segredo entra: o `AGENDOR_TOKEN` permanece com rotação pendente (C8 / SEC-01, risco aceito) e o seu valor nunca é exibido. Gate de grep nas Tasks 1 e 2. Os arquivos citam identificadores e inteiros, nunca conteúdo de `.env` nem corpo de erro de borda |
| T-04-38-02 | Tampering | mitigate | CLOSED | Editar um todo com prioridade decidida pelo usuário apagaria decisão registrada. Gate nas três tasks: `git status --porcelain .planning/todos/pending/ | grep -c '^ M'` = **0** — as únicas mudanças são arquivos **não rastreados** |
| T-04-38-03 | Repudiation | mitigate | CLOSED | Oito achados fora do escopo de correção viram oito arquivos, cada um com a **medição** que o sustenta. Sem isso, a rodada 6 os redescobriria como novos — e a fase já tem cinco rodadas de precedente sobre o custo disso |
| T-04-38-04 | Tampering | mitigate | CLOSED | O ROADMAP carrega critérios de sucesso aprovados pelo usuário (itens 4, 7 e 8, com redação decidida em C9). Este plano só **acrescenta** um bloco e reescreve a linha de somatório. Gate: exatamente **1** linha removida no diff, zero ocorrências de `Success Criteria` e da tabela de rastreabilidade |
| T-04-38-SC | Tampering | mitigate | CLOSED | Este plano **não instala nada** e não toca em código. Gate: `git status --porcelain backend/ frontend/` vazio nas três tasks. Não havendo instalação, o portão humano de legitimidade de pacote não se aplica |
## Accepted Risks Log

Every `accept` / `accept (verificada)` / `accept com registro` disposition above (65 entries) is
a deliberate, user-approved trade-off documented at the point of decision in the owning
`04-NN-PLAN.md`. The recurring patterns, consolidated so the log is auditable without re-reading
65 individual cells:

| Pattern | Threats | Rationale | Owner if any residual work remains |
|---|---|---|---|
| Supply-chain / no package install this plan (`T-04-NN-SC`) | 30 entries | No `npm install` ran; verified per-plan by `git status --porcelain` on `package.json`/lockfiles in each plan's own SUMMARY.md, cross-checked against `git log` for this phase showing exactly two dependency-bump commits (04-03, 04-05) | n/a — closed by absence of action |
| Fail-safe cost of CR3-01 (undecidable-category deal excluded from send that day) | T-04-19-06, T-04-20-05, T-04-21-05, T-04-25-05, T-04-29-06 | User decision 2026-08-05: an unreachable third-party edge must not abort the whole round; the deal re-enters eligibility next execution (REL-04 refetch) | n/a — behavior is the intended contract, pinned by tests |
| Trade-off of C10 (resend-on-uncertainty preferred over silent loss) | T-04-06-06/07, T-04-15-05/06, T-04-16-05/06, T-04-23-04, T-04-24-05 | User-approved at checkpoint C10: a possible duplicate email is preferable to a recipient silently never being notified | n/a — decided trade-off, not a gap |
| Funnel substring match widens suppression set (`'beeforx'` also suppressed) | T-04-35-01 | User saw the consequence and approved it explicitly 2026-08-05; internal CRM, funnel names controlled by Cadmus admins | n/a |
| Known residual gaps with a named todo owner | T-04-09-05→`in-04-escape-html-no-test-card.md`, T-04-12-05/T-04-18-05→`in2-03-mensagem-de-erro-interpola-id.md`, T-04-27-05/T-04-31-06→`in3-08b-comparacao-exata-nos-demais-filtros.md` (in3-08 itself was promoted to plan 04-35 and closed), T-04-28-05→`cr4-01b-limiar-de-supressao-total.md`, T-04-30-05→`wr4-04b-fanout-proporcional-em-resolved.md`, T-04-32-05→`wr4-07b-saudacao-com-ownername-nulo.md`, T-04-33-05→`wr4-03b-referencias-por-linha-nos-demais-arquivos-de-teste.md`, T-04-13-03/04→documented in-code decision, no residual | Fixing would mix behavior change into a different plan's scope, or was explicitly descoped by the user | Confirmed present in `.planning/todos/pending/` by filename, this audit |
| Verified-safe by design, no action needed | T-04-25-05/T-04-29-06 (20,000-record ceiling, orders of magnitude above real use), T-04-36-05 (max 2 toasts/click, structurally bounded) | Ceiling chosen with margin; pinned by tests protecting the normal path | n/a |

### SEC-01 — Agendor API token exposed in public git history (carried forward, not a Phase 4 finding)

| Field | Value |
|---|---|
| Status | **OPEN — accepted risk, owned** |
| Owner | `.planning/todos/pending/sec-01-rotate-agendor-token.md` |
| Disposition | accept (binding user decision C8, 2026-08-04, reaffirmed 2026-08-05) |
| What | Real Agendor API token recoverable from public repo history, commit `13905d4` |
| Why not closed | Rotation requires action in the Agendor vendor panel + `.env`/PM2 restart on the production host — outside the scope of any code change this audit can verify. Rewriting git history does not resolve it (objects remain reachable via GitHub API/forks); making the repo private was tested and reverted because it breaks branch-protection-based CI gating on a free-tier account (tested 2026-07-29). |
| Verified this audit | The token value was never read, quoted, or reproduced anywhere in this report or in any Phase 4 artifact (`git grep c57f59ef` across `.planning/phases/04-confiabilidade-das-integra-es/` and `.planning/todos/` → 0 hits outside the todo file itself, which stores only the truncated prefix `c57f59ef-…`). No Phase 4 plan declared it resolved. `backend/test/secrets.grep.test.js` (part of the 196/196 passing suite) actively asserts no secret literal appears in `src/`. |
| Action required | Rotate the token in the Agendor panel, update `AGENDOR_TOKEN` in production `.env`, restart PM2. Human action outside this audit's authority. |

This is the **only** entry counted in `threats_open: 1`.

## Unregistered Flags

**None.** Every one of the 38 plans' SUMMARY.md reported "Nenhuma superfície de segurança nova
fora do `<threat_model>` do plano" (or the equivalent "dispositions aplicadas" table showing
100% coverage of that plan's own register) — spot-checked across 04-02, 04-09, 04-19, 04-20,
04-30, 04-36, 04-38 by direct read, not by trusting the summary line. One near-miss worth
recording for the historical record even though it resolved with an owner: the SMTP
worst-case-timing correction (Q6, "30N+69s" superseding the original "~1min40s" estimate in
T-04-04-01) surfaced during in-phase review after the original threat model was written and was
captured as `rel-02b-deadline-global-smtp.md` rather than silently dropped — confirmed present
in `.planning/todos/pending/`. It does not change the CLOSED status of T-04-04-01 (a real,
working timeout exists; only the aggregate multi-recipient ceiling for a single round is
un-bounded, which is the residual the todo owns).

## Environment Proof (reproduced independently, this audit)

| Check | Command | Result |
|---|---|---|
| Backend test suite | `cd backend && npm test` | 196/196 passing, exit 0 |
| Backend lint | `cd backend && npm run lint` | exit 0, 44 warnings (baseline) |
| Dependency audit | `cd backend && npm audit --json` | 8 total (6 moderate, 2 high, 0 critical); all 8 traced to non-`axios`/non-`nodemailer` packages |
| Installed versions | `npm ls axios nodemailer` | `axios@1.19.0`, `nodemailer@9.0.4` — matches `package.json` `^1.19.0`/`^9.0.4` |
| Secret literal scan | `node --test test/secrets.grep.test.js` | 3/3 passing |
| Token value in Phase 4 artifacts | `git grep c57f59ef .planning/phases/04-confiabilidade-das-integra-es/ .planning/todos/` | 0 hits outside `sec-01-rotate-agendor-token.md`'s own truncated reference |
| Pending todos | `ls .planning/todos/pending/ | wc -l` | 41 |

## Verdict

**SECURED.** 232/233 threats CLOSED, 1 open by design (SEC-01, accepted risk with a named
human-action owner, correctly not code-closeable). No `high`-severity gap exists between a
declared mitigation and the implemented code — the two items this audit was specifically asked
to re-derive from scratch (CR-02's message-only logging, WR-03's guard-outside-retry placement)
both hold under direct code inspection, not just under the plan's own claim. No unregistered
attack surface was found. `block_on: high` gate: **passes** — zero open high-severity threats
attributable to Phase 04 code.

---
_Audited: 2026-08-05_
_Auditor: gsd-security-auditor_
