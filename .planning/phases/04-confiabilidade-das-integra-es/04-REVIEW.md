---
phase: 04-confiabilidade-das-integra-es
reviewed: 2026-08-04T20:12:05Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - backend/package.json
  - backend/src/agendor.js
  - backend/src/db.js
  - backend/src/emailer.js
  - backend/src/routes/deals.js
  - backend/src/routes/notifications.js
  - backend/src/scheduler.js
  - backend/test/agendor.cacheInvalidation.test.js
  - backend/test/agendor.timeout.test.js
  - backend/test/emailer.timeout.test.js
  - backend/test/helpers/fakeAxios.js
  - backend/test/notificationStatus.test.js
  - backend/test/notifications.resolved.test.js
  - backend/test/scheduler.failsafe.test.js
  - backend/test/scheduler.resilience.test.js
findings:
  critical: 2
  warning: 6
  info: 4
  total: 12
status: issues_found
---

# Fase 04: Relatório de Code Review

**Reviewed:** 2026-08-04T20:12:05Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Revisão adversarial dos 7 arquivos de produção/config e 8 arquivos de teste alterados entre
`3005ac0..HEAD` (REL-01 a REL-06). A suíte foi executada localmente sob Node 22.13.1 (o wrapper
do projeto): **121/121 verdes**, confirmando o estado declarado. Sob o Node do PATH padrão desta
máquina (v25.9.0) 5 arquivos quebram por `NODE_MODULE_VERSION` do binding nativo do
`better-sqlite3` — artefato de ambiente, não defeito de código.

O que a fase entregou está, na maior parte, correto e bem defendido por teste. Dois achados,
porém, são bloqueantes:

1. A invalidação do `orgCategoryCache` (REL-04) introduziu uma **condição de corrida real** entre
   execuções concorrentes de `getStaleDeals`. Reproduzida deterministicamente: uma organização
   de categoria `'Parceiro'` (excluída) **entra na lista de notificação**. Rodando o mesmo
   interleaving contra o `agendor.js` do commit anterior (`3005ac0`) o resultado é o golden
   correto — ou seja, o defeito foi **introduzido por esta fase** e atinge exatamente a
   invariante que o Core Value do milestone existe para proteger ("quem recebe / quem não
   recebe"). Nenhum teste da fase exercita concorrência, e o comentário-bloco de 20 linhas em
   `agendor.js:150-169` raciocina sobre aliasing (`delete` vs. reatribuir) mas nunca sobre
   interleaving.
2. O fail-safe de REL-06 fez erros de `/tasks` propagarem até o `console.error(err)` de
   `routes/deals.js:32`, que imprime o **AxiosError inteiro** — incluindo
   `config.headers.Authorization: Token <AGENDOR_TOKEN>` — no `pm2-error.log`. Verificado
   empiricamente. O sink é pré-existente, mas a própria fase reconheceu o risco em
   `agendor.js:288-289` ("Só a mensagem é logada: o objeto de erro do axios carrega
   config.headers") e corrigiu apenas um dos dois lados.

Os demais achados são regressões estreitas do REL-05, uma lacuna de robustez aberta pelo REL-06,
falta de validação de entrada numa função nova, e três pontos de qualidade de teste.

Achados já registrados como decisão humana (fallback DNS do nodemailer 9 / Q6, toast verde em
500 / ui-01, terceiro escritor de status / rel-05b, `npm audit` / sec-02) **não** foram
reportados novamente. Warnings de lint do baseline Biome e o `console.*` legado de
`agendor.js`/`emailer.js` também foram deliberadamente ignorados, conforme CLAUDE.md.

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: Corrida no `orgCategoryCache` faz organização de categoria excluída ser notificada

**Origem:** **defeito introduzido por esta fase** (REL-04, commit `dd25dbf`).
**File:** `backend/src/agendor.js:170-172` (limpeza) + `backend/src/agendor.js:211,219` (leitura)

**Issue:**
`getStaleDeals` apaga as chaves do `orgCategoryCache` de módulo como primeira instrução, popula
o dicionário via `await Promise.all(uniqueOrgIds.map(getOrgCategory))` (`:211`) e depois **lê o
mesmo dicionário compartilhado** no laço de enriquecimento (`:219`). O retorno do `Promise.all` é
descartado.

`getStaleDeals` tem **7 call-sites sem nenhum lock compartilhado**: `scheduler.js:56` (`runCheck`,
cujo `isRunning` só protege `runCheck` contra si mesmo), `scheduler.js:213` (`runWeeklySummary`,
sem lock nenhum), `scheduler.js:310` (`runCheckOnly`, sem lock), `routes/deals.js:15`,
`routes/reports.js:11` e `routes/notifications.js:119,143,179`. Duas execuções sobrepostas são
triviais de obter: o cron das 8h + qualquer request do dashboard, ou o botão "verificar agora"
durante a rodada. A janela é larga — uma execução dura segundos a minutos (paginação + `sleep` de
1s entre lotes + uma consulta por organização única).

Interleaving que quebra: A popula o cache, B chega e apaga as chaves, as consultas de B ainda
estão em voo quando A retoma → o laço síncrono de A lê `undefined` → `?? null` →
`EXCLUDED_CATEGORIES.includes(null)` é `false` → **a organização excluída passa**. É exatamente o
modo de falha que o comentário `:159-166` descreve para o caso de reatribuição; a limpeza por
`delete` sofre do mesmo problema por outro caminho.

Reprodução determinística (fixture `deals-page.json`, org 205 = `'Parceiro'`, golden `[101, 103]`):

```
golden esperado    : [ 101, 103 ]
execução A devolveu: [ 101, 103, 105 ]
FALHA: deal 105 (organização 205 = "Parceiro") entrou na lista de notificação
```

O **mesmo script** contra `git show 3005ac0:backend/src/agendor.js` devolve `[ 101, 103 ]` — a
corrida não existia antes desta fase.

Efeito colateral do mesmo bug: com `orgCategory = null`, `getDealType(null)` devolve `'Lead'`,
então os cards afetados também são rotulados errado no e-mail e nos relatórios.

**Fix:** parar de ler o estado de módulo no laço de enriquecimento; capturar o resultado da
consulta num mapa **local à execução**. A limpeza inicial continua válida (é o que garante o
refetch entre rodadas) e os testes de `agendor.cacheInvalidation.test.js` continuam passando,
porque `getOrgCategory` segue sendo o único consultante.

```js
// backend/src/agendor.js — substitui :211 e :219
const categoriaPorOrg = new Map(
  await Promise.all(
    uniqueOrgIds.map(async (id) => [id, await getOrgCategory(id)]),
  ),
);
// ...
const orgCategory = categoriaPorOrg.get(deal.organization?.id) ?? null;
```

Acrescentar um teste de interleaving (duas `getStaleDeals` sobrepostas, a 2ª iniciada enquanto a
1ª aguarda `/organizations`) asserindo o golden `[101, 103]` na execução A.

---

#### CR-02: `AGENDOR_TOKEN` escrito em disco no log de erro do PM2

**Origem:** sink **pré-existente**, mas o caminho que o alcança foi **aberto por esta fase**
(REL-06: `/tasks` deixou de engolir o erro e passou a propagar).
**File:** `backend/src/routes/deals.js:32`

**Issue:**
`console.error(err)` imprime o objeto `AxiosError` completo. `util.inspect` de um AxiosError
inclui as propriedades próprias enumeráveis — verificado:

```
own enumerable keys: [ 'message', 'name', 'isAxiosError', 'code', 'config', 'request' ]
CONTAINS TOKEN IN inspect(err): true
```

`config.headers.Authorization` carrega `Token <AGENDOR_TOKEN>`. Em produção esse stream vai para
`/opt/agendor/logs/pm2-error.log` (`ecosystem.config.js:20`), persistido em disco.

Antes do 04-02 a falha de `/tasks` era engolida em `agendor.js` (`catch { console.error; break }`)
e nunca chegava aqui; o `staleHandler` agora responde 500 justamente por essa propagação
(pinado por `scheduler.failsafe.test.js` caso B3), o que torna este caminho rotineiro sempre que
a API Agendor estiver lenta — o cenário que o timeout de 15s do REL-01 tornou alcançável.
A própria fase documentou a ameaça em `agendor.js:286-287` e corrigiu só o lado do `agendor.js`.

**Fix:**

```js
// backend/src/routes/deals.js:31-34
} catch (err) {
  // Só a mensagem: o objeto de erro do axios carrega config.headers com
  // Authorization: Token <AGENDOR_TOKEN> (mesma razão de agendor.js:286-287).
  logger.error('[Deals] Erro ao listar negócios parados:', err.message);
  res.status(500).json({ error: err.message });
}
```

(`const logger = require('../logger');` no topo, seguindo o padrão de CLAUDE.md para código novo.)
Verificar também `backend/src/index.js:107`, que tem o mesmo `console.error(err)` fora de produção.

---

### Warnings

#### WR-01: Sucesso parcial seguido de exceção passa a gravar `'error'` — e reenvia amanhã para quem já recebeu

**Origem:** **regressão introduzida por esta fase** (REL-05).
**File:** `backend/src/scheduler.js:169-176`

**Issue:**
O `catch` grava `updateNotificationStatus(logId, 'error', err.message)` **incondicionalmente**,
sem saber se algum destinatário já confirmou o envio. `sendStaleNotification` pode lançar
**depois** de o e-mail do dono ter saído: `sendMailWithRetry` chama `createTransporter()` dentro
do laço de retry (`emailer.js:211`), e `createTransporter`/`dealEmailHtml` fazem leituras
síncronas em SQLite (`getConfig`, `emailer.js:25-30,180`) que podem lançar (ex.: conexão fechada
durante o `shutdown()` do `index.js`).

Comportamento anterior nesse caminho: a linha `'sent'` otimista permanecia e o `catch` inseria uma
segunda linha `'error'` → `alreadyNotifiedToday` continuava `true` → sem duplicata.
Comportamento novo: linha única marcada `'error'` → `alreadyNotifiedToday` devolve `false` →
**a rodada de amanhã reenvia para quem já recebeu**. Isso contradiz a própria justificativa
declarada em `scheduler.js:123-126` ("≥ 1 sucesso confirma 'sent' … a dedup precisa proteger quem
já recebeu"), que só foi aplicada ao caminho de retorno, não ao de exceção. Nenhum dos 6 cenários
de `notificationStatus.test.js` cobre "exceção após sucesso parcial" (Q1-2 lança na fábrica, antes
de qualquer envio).

**Fix:** acumular o resultado por destinatário fora do `try`, e no `catch` só rebaixar para
`'error'` quando nada foi confirmado.

```js
let logId = null;
let houveEnvioConfirmado = false;
try {
  // ...
  const emailResults = await sendStaleNotification({ ... });
  houveEnvioConfirmado = emailResults.some((r) => r.success);
  // ...
} catch (err) {
  results.errors.push(err.message);
  if (logId !== null) {
    // Um destinatário já confirmado mantém 'sent': rebaixar reabriria a duplicata de amanhã.
    updateNotificationStatus(
      logId,
      houveEnvioConfirmado ? 'sent' : 'error',
      err.message,
    );
  }
}
```

Acrescentar o 7º cenário ao `notificationStatus.test.js` (dono ok → autor lança) asserindo
`status === 'sent'`.

---

#### WR-02: `/tasks` não tem retry de 429, mas agora derruba a rodada inteira

**Origem:** consequência **nova** do fail-safe de REL-06 sobre uma lacuna pré-existente.
**File:** `backend/src/agendor.js:255-296` (comparar com `fetchDealsPage`, `:130-146`)

**Issue:**
`fetchDealsPage` retenta HTTP 429 três vezes (5s/10s/15s). `getDealsWithFutureTasks` não retenta
nada: qualquer falha, inclusive 429, agora **propaga** e aborta `runCheck` antes do laço de envio
(pinado por `scheduler.failsafe.test.js` Q2-1: zero e-mails, zero linhas de log). Como o cron é
diário, **um 429 transitório = 24h sem nenhuma notificação**, sem retry e sem alerta — só uma
string em `results.error` que ninguém lê a menos que abra o dashboard.

E 429 é provável justamente aqui: `runCheck` dispara `getStaleDeals` (até 5 páginas em paralelo +
uma chamada por organização única), `getUsers` e `getDealsWithFutureTasks` no **mesmo**
`Promise.all` (`scheduler.js:55-59`), martelando a API Agendor simultaneamente.

A decisão Q2 ("completo ou falha explícita") permanece correta; o que falta é a rede de segurança
que o caminho irmão já tem antes de a falha virar explícita.

**Fix:** reusar a política de retry existente na consulta de tarefas.

```js
// backend/src/agendor.js — dentro do while, no lugar do api.get direto
const { data } = await fetchWithRetry(() =>
  api.get('/tasks', { params: { dueDateGt: yesterday, per_page: 100, page } }),
);
```
Extrair o corpo do retry de `fetchDealsPage:130-146` para um helper `fetchWithRetry(fn, retries)`
e usá-lo nos dois pontos (evita a terceira cópia da mesma lógica). Cobrir com um caso em
`scheduler.failsafe.test.js`: `/tasks` devolve 429 uma vez e a rodada **conclui** normalmente.

---

#### WR-03: `getDealById` interpola o `id` no path sem validação, e um dos escritores de `deal_id` é controlado pelo usuário

**Origem:** função **nova** desta fase (REL-01).
**File:** `backend/src/agendor.js:73-76`; escritor em `backend/src/routes/notifications.js:86-99`

**Issue:**
`api.get(\`/deals/${id}\`)` confia que `id` é inteiro. O comentário de
`routes/notifications.js:220-221` afirma que "o `id` vem só de `getNotifiedDeals()` (do banco)" —
verdade, mas o banco não garante o tipo: `notification_log.deal_id` tem afinidade `INTEGER` sem
`STRICT`, e `POST /api/notifications/test-card` grava `deal_id: req.body.dealId || 0`, valor vindo
direto do corpo da requisição. Verificado:

```
better-sqlite3 -> [ { deal_id: '../users', t: 'text' } ]
axios          -> URL final: https://api.agendor.com.br/users
```

Ou seja: um usuário autenticado pode fazer o backend consultar outro endpoint da Agendor com o
token de serviço, no próximo `GET /api/notifications/resolved`. Impacto limitado (exige auth, é
GET, e a resposta só alimenta `updatedAt`/`dealStatus`), mas a validação custa uma linha e a
função foi criada agora — é o momento certo de fechá-la.

**Fix:**

```js
async function getDealById(id) {
  const dealId = Number(id);
  if (!Number.isInteger(dealId) || dealId <= 0) {
    throw new Error(`[Agendor] id de negócio inválido: ${String(id)}`);
  }
  const { data } = await api.get(`/deals/${dealId}`);
  return data.data || null;
}
```
O `catch` por item do `Promise.all` de `resolvedHandler` já absorve a rejeição, então o shape da
rota (pinado por `notifications.resolved.test.js`) não muda. Corrigir também o escritor:
`deal_id: Number.parseInt(req.body.dealId, 10) || 0`.

---

#### WR-04: `results.notified` conta falhas totais como envio — e agora contradiz a própria linha que acabou de gravar

**Origem:** contador **pré-existente**, mas a contradição é **nova** (REL-05 passou a gravar
`'error'` no mesmo caso).
**File:** `backend/src/scheduler.js:166-168`

**Issue:**
`results.notified++` é incondicional. No cenário de falha total por retorno (Q1-3), o mesmo bloco
grava `updateNotificationStatus(logId, 'error', ...)` e em seguida incrementa `results.notified`.
O objeto devolvido por `POST /api/notifications/run` fica internamente inconsistente
(`results.deals[0].notified === false`, `results.notified === 1`) e a linha
`logger.info('[Scheduler] Concluído: … ${results.notified} notificações enviadas')` (`:187-189`)
reporta envios que não aconteceram — no dia em que o SMTP estiver fora, o log dirá que tudo saiu.
`notificationStatus.test.js` Q1-1 assere `r.notified === 1` no caminho feliz; Q1-3 não assere o
contador, então nada pina a inconsistência.

**Fix:**

```js
if (algumSucesso) {
  updateNotificationStatus(logId, 'sent', errors.length ? errors.join('; ') : null);
  results.notified++;
} else {
  updateNotificationStatus(logId, 'error', errors.join('; '));
}
```
Como isto muda um número já exibido na UI, acrescentar antes a asserção que falta em Q1-3
(`assert.equal(r.notified, 0)`), conforme a restrição de processo do CLAUDE.md.

---

#### WR-05: `scheduler.resilience.test.js` (5) não prova o que afirma provar

**File:** `backend/test/scheduler.resilience.test.js:257-270`

**Issue:**
O caso diz pinar "o catch de `scheduler.js:242`: registra o erro e NÃO relança", mas a única
asserção é `assert.doesNotReject(() => runWeeklySummary())`. `runWeeklySummary` tem um
early-return em `scheduler.js:210` (`if (!notificationsEnabled) return;`) **antes** do
`Promise.all` que falha. Qualquer mudança que faça a função sair cedo — inclusive uma regressão
real, como o seed de `notifications_enabled` mudar — mantém o teste verde sem nunca tocar o
`catch`. O teste passa por ausência de exceção, não por prova de caminho.

**Fix:** provar que o caminho de falha foi alcançado.

```js
const logger = require('../src/logger');
const erroLogado = mock.method(logger, 'error', () => {});
await assert.doesNotReject(() => runWeeklySummary());
assert.ok(
  erroLogado.mock.calls.some((c) =>
    String(c.arguments[1] ?? '').includes('timeout of 15000ms exceeded'),
  ),
  'pré-condição: a falha da borda precisa ter chegado ao catch do resumo semanal',
);
```
Alternativa mais barata: asserir `fake.get.mock.calls` contendo `/users` na execução do caso.

---

#### WR-06: A fase inteira raciocina sobre o cache como se fosse single-flight — e nenhum teste cobre concorrência

**File:** `backend/test/agendor.cacheInvalidation.test.js:13-21`; `backend/src/agendor.js:159-169`

**Issue:**
Os três cenários do arquivo executam `getStaleDeals` **sequencialmente** (`await` completo entre
execuções). O comentário de abertura (`:13-21`) e o comentário-bloco correspondente no código
(`:159-166`) constroem um argumento detalhado sobre por que `delete` é seguro e reatribuir não é —
argumento que só vale sob a premissa (nunca declarada) de que existe no máximo uma execução em
voo. Essa premissa é falsa: ver CR-01. O `04-07-SUMMARY.md` não menciona concorrência em momento
algum. O resultado é uma rede de testes que dá confiança sobre a propriedade errada.

**Fix:** junto com o conserto de CR-01, acrescentar o cenário (4) ao arquivo — duas
`getStaleDeals` sobrepostas, a segunda iniciada enquanto a primeira aguarda `/organizations` —
asserindo que **ambas** devolvem o golden `[101, 103]`. E corrigir os dois blocos de comentário,
que hoje afirmam mais do que o código garante.

---

### Info

#### IN-01: O status `'pending'` renderiza como falha (✗ vermelho) no histórico

**File:** `backend/src/scheduler.js:136` (novo valor) → `frontend/src/components/NotificationHistory.jsx:306`

**Issue:** o consumidor faz `log.status === 'sent' ? ✅ : ❌`. Uma linha `'pending'` — que existe
durante todo o envio (até ~100s por destinatário com o `socketTimeout` de 30s × 3 tentativas) e
permanentemente se o processo morrer no meio — aparece como **falha** para o operador. O
`04-06-SUMMARY.md:139` registra "Zero mudança de frontend foi necessária", o que é verdade para o
build, não para a leitura humana.
**Fix:** um terceiro ramo (relógio/cinza) para `'pending'`, ou nomear o status inicial de forma
que o significado "em andamento" fique explícito na UI. Fora do escopo desta fase — vale um todo.

#### IN-02: Seams de teste anexados a `module.exports` fogem da convenção de módulo do projeto

**File:** `backend/src/scheduler.js:346`, `backend/src/routes/deals.js:50`, `backend/src/routes/notifications.js:275`

**Issue:** CLAUDE.md exige "um único `module.exports = { ... }` nomeando toda função pública".
As três linhas adicionam exports **fora** desse bloco. O caso mais delicado é
`module.exports.runWeeklySummary`: a função não tem lock `isRunning` (documentado em
`scheduler.resilience.test.js:262-263`) e agora é importável por qualquer módulo de produção.
**Fix:** manter (o custo de alternativas é maior), mas mover as três para dentro do bloco
`module.exports` com um comentário `// seam de teste`, para que o inventário de API pública do
módulo continue sendo lido em um único lugar.

#### IN-03: Comentário de `emailer.timeout.test.js` (8) descreve um alarme que não dispara

**File:** `backend/test/emailer.timeout.test.js:310-311`

**Issue:** "se este caminho passasse a retentar, o teste gastaria 9 segundos reais — a lentidão
seria o próprio alarme". `node --test` não impõe timeout por caso, então lentidão não falha nada.
O alarme real é `assert.equal(enviosTentados, 2)` na linha 329.
**Fix:** corrigir o comentário para apontar a asserção que de fato protege o invariante.

#### IN-04: `test-card` interpola corpo da requisição sem escape no HTML do e-mail

**Origem:** **pré-existente**, em arquivo revisado, linhas não tocadas pela fase.
**File:** `backend/src/routes/notifications.js:67-83` → `backend/src/emailer.js:117,158,164`

**Issue:** `title`, `organization`, `ownerName` e `dealId` vêm de `req.body` e chegam sem escape
ao template (`${deal.title}`, `href="${deal.webUrl}"`). Um usuário autenticado pode enviar HTML
arbitrário — inclusive um `href` para domínio próprio — para qualquer endereço de e-mail, com o
remetente e a identidade visual da empresa.
**Fix:** um helper `escapeHtml()` aplicado aos campos interpolados em `dealEmailHtml`, mais
`Number.parseInt` no `dealId`. Fora do escopo desta fase (nenhuma dessas linhas foi alterada) —
registrar como todo.

---

_Reviewed: 2026-08-04T20:12:05Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
