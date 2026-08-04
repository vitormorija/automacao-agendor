---
phase: 04-confiabilidade-das-integra-es
reviewed: 2026-08-04T21:45:00Z
depth: standard
round: 2
files_reviewed: 13
files_reviewed_list:
  - backend/src/agendor.js
  - backend/src/emailer.js
  - backend/src/routes/deals.js
  - backend/src/routes/notifications.js
  - backend/src/scheduler.js
  - backend/test/agendor.cacheConcurrency.test.js
  - backend/test/agendor.cacheInvalidation.test.js
  - backend/test/agendor.retry429.test.js
  - backend/test/dealId.validation.test.js
  - backend/test/deals.errorLog.test.js
  - backend/test/helpers/fakeTimers.js
  - backend/test/notificationStatus.partialFailure.test.js
  - backend/test/scheduler.resilience.test.js
findings:
  critical: 1
  warning: 6
  info: 4
  total: 11
status: issues_found
---

# Fase 04 — Code Review, Rodada 2 (gap closure `15ad948..HEAD`)

**Reviewed:** 2026-08-04T21:45:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Revisão adversarial dos 4 planos de gap closure (04-08 a 04-11) que fecharam CR-01, CR-02 e
WR-01..WR-06 da rodada 1, mais revisão do código novo pelo seu próprio mérito.

A suíte foi executada localmente sob Node 22.13.1 (o wrapper do projeto): **139/139 verdes**,
confirmando o estado declarado. As três provas empíricas deste relatório foram reproduzidas
fora da árvore do repositório (scratchpad), sem tocar em nenhum arquivo do projeto.

Balanço da verificação (detalhe em "Verificação das conclusões da rodada 1", abaixo):

- **Fechados de fato e bem pinados:** CR-02, WR-02, WR-03, WR-05.
- **Fechados apenas em parte:** CR-01, WR-01, WR-04 — cada um resolveu o cenário exercitado
  pelo teste novo e deixou aberto um cenário vizinho que o comentário de produção declara
  resolvido. É essa classe que este relatório trata como mais perigosa: um achado que se
  acredita fechado deixa de ser procurado.
- **WR-06** ganhou um teste de concorrência real e determinístico (`agendor.cacheConcurrency`),
  mas ele mede apenas UMA das duas direções do entrelaçamento.

O achado bloqueante desta rodada é o residual do CR-01: o `orgCategoryCache` continua sendo
estado de módulo compartilhado entre execuções e ainda decide exclusão por categoria. Um erro
transitório numa execução grava `null` DEPOIS da limpeza de uma execução sobreposta, e a
execução sobreposta — que não falhou em nada — lê esse `null` e **notifica uma organização
`'Parceiro'`**. Reproduzido deterministicamente. É exatamente a invariante do Core Value do
milestone ("quem recebe / quem não recebe"), e tanto `agendor.js:196-202` quanto o cenário (3)
de `agendor.cacheInvalidation.test.js` afirmam hoje que isso está resolvido.

Achados já registrados como decisão humana ou como todo pendente (SEC-01 do token; IN-01 status
`'pending'` na UI; IN-02 seams fora do `module.exports`; IN-03 comentário do `emailer.timeout`;
IN-04 escape de HTML no `/test-card`; CR-02b `console.error(err)` em `index.js:107`) **não** são
reportados de novo. Warnings do baseline Biome e o `console.*` legado também foram ignorados,
conforme CLAUDE.md.

> Nenhum bloco `<structural_findings>` foi fornecido nesta rodada — não há seção de substrato
> estrutural a preservar.

---

## Verificação das conclusões da rodada 1

| r1 | Veredito | Evidência |
|----|----------|-----------|
| CR-01 | **Fechado em parte** | O laço de enriquecimento passou a consumir `categoriaPorOrg` local (`agendor.js:244-256`) — o entrelaçamento "B apaga antes de A ler" está pinado por `agendor.cacheConcurrency.test.js`. Mas o dicionário de módulo continua sendo lido/escrito por `getOrgCategory` e ainda cruza execuções na direção oposta → **CR2-01**. |
| CR-02 | **Fechado** | `routes/deals.js:42` entrega só `err.message`. Verificado que os demais sinks do caminho são seguros: `logger.js:16-17` serializa `Error` por `.stack` (que não carrega `config.headers`), então `scheduler.js:214` (`logger.error(..., err)`) não vaza; `index.js:107` é o único resto e está guardado por `NODE_ENV !== 'production'` e registrado como todo `cr-02b`. `deals.errorLog.test.js` é uma prova comportamental legítima (conta `console.error` E inspeciona os argumentos entregues ao logger com `depth: null`). |
| WR-01 | **Fechado em parte** | O canal `err.resultadosParciais` funciona para a exceção vinda da recriação do transporte (cenário A, e reproduzido por sonda própria: linha `'sent'`, `alreadyNotifiedToday === true`). Porém o cenário que o PRÓPRIO comentário de `emailer.js:230-232` e `scheduler.js:128-134` usa como justificativa — SQLite fechado pelo `shutdown()` — continua aberto → **WR2-02**. |
| WR-02 | **Fechado** | `fetchWithRetry` extraído sem mudar a política (comparado com `git show 15ad948:backend/src/agendor.js`: mesma condição `err.response?.status === 429`, mesmo backoff `(attempt+1)*5000`, mesmas 3 tentativas) e aplicado a `/tasks` (`agendor.js:300-304`). `agendor.retry429.test.js` cobre retry, exaustão com contagem exata, timeout fora do retry, e caracterização do lado `/deals`. |
| WR-03 | **Fechado** | Guarda antes da borda (`agendor.js:83-86`) com prova por **contagem de requisições zero**, não por resposta — que é a prova certa. Escritor corrigido (`notifications.js:90`). Não-regressão de string numérica coberta. |
| WR-04 | **Fechado em parte** | `results.notified++` foi para dentro do ramo `'sent'` (`scheduler.js:177`), fechando a super-contagem. Mas o caminho de EXCEÇÃO grava `'sent'` sem incrementar → sub-contagem → **WR2-01**. |
| WR-05 | **Fechado** | `scheduler.resilience.test.js:275-278` agora prova que `/users` foi alcançado, o que descarta o falso-verde pelo early-return de `notificationsEnabled`. |
| WR-06 | **Fechado em parte** | `agendor.cacheConcurrency.test.js` é determinístico de verdade (dois pontos de suspensão explícitos, pré-condições asseridas) e cobre AMBAS as execuções. Mas cobre só a direção "limpeza apaga leitura futura". A direção "escrita tardia contamina execução seguinte" ficou sem teste e sem menção → **CR2-01**. |

---

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR2-01: o `orgCategoryCache` ainda cruza execuções — um erro transitório numa rodada faz OUTRA rodada notificar organização `'Parceiro'`

**Origem:** residual do CR-01 — não fechado pelo 04-08.
**File:** `backend/src/agendor.js:48-61` (cache de módulo) + `:203-205` (limpeza) + `:244-248` (mapa local)

**Issue:**
O 04-08 fechou a direção certa do problema (o laço de enriquecimento não relê mais estado de
módulo), mas `getOrgCategory` continua sendo leitor **e escritor** de um dicionário de módulo
que sobrevive entre execuções. A limpeza de `getStaleDeals` (`:203-205`) acontece na entrada de
cada execução; nada impede que uma execução **já em voo** escreva no dicionário **depois** dessa
limpeza. A execução que limpou então lê o valor da outra.

O caminho mais provável é o do erro transitório, porque `getOrgCategory` engole qualquer falha e
cacheia `null` (`:57-60`) — e `null` não está em `EXCLUDED_CATEGORIES`:

1. Execução A consulta `/organizations/205` (categoria `'Parceiro'`) e a consulta fica em voo.
2. Execução B começa (basta o cron das 8h coincidir com um `GET /api/deals/stale` do dashboard —
   `getStaleDeals` tem 8 call-sites e só `runCheck` tem lock, contra si mesmo) e **apaga as
   chaves**.
3. A consulta de A falha (timeout — exatamente o cenário que a fase 04 tornou frequente com o
   teto de 15s). `getOrgCategory` grava `orgCategoryCache[205] = null`.
4. B chama `getOrgCategory(205)`, encontra `null` **em cache** e nem consulta a API.
   `EXCLUDED_CATEGORIES.includes(null)` é `false` → o deal 105 entra na lista de B.

Reproduzido deterministicamente (mesma fixture `deals-page.json`, org 205 = `'Parceiro'`,
golden `[101, 103]`), com pré-condições asseridas em cada passo:

```
A -> [ 101, 103, 105 ]
B -> [ 101, 103, 105 ]
pré-condição verde: chamadas205 === 1  (B NÃO reconsultou — leu o null cacheado por A)
FALHA: idsB.includes(105) === true — org 205 = "Parceiro" notificada numa execução que não falhou em nada
```

A execução A incluir 105 é o comportamento documentado do caminho de erro (cenário (3) de
`agendor.cacheInvalidation.test.js`). O que é novo e não documentado é **B**: uma execução sem
falha alguma herda o efeito do erro de outra. E se B for `runCheck`, isso é um e-mail real para
uma organização que a regra de negócio exclui.

Isso contradiz diretamente duas afirmações vigentes:

- `agendor.js:196-202`: "O que impede duas execuções SOBREPOSTAS de apagarem o dado uma da outra
  … é o mapa `categoriaPorOrg` local à execução". O mapa local impede **uma** direção; a outra
  continua aberta.
- `agendor.cacheInvalidation.test.js:9-11` e cenário (3): "o `null` que o catch grava não
  contamina as rodadas seguintes". Sob sobreposição, contamina.

A mesma mecânica vale sem nenhum erro: se o operador recategoriza uma organização durante a
janela de sobreposição, a escrita tardia de A serve a categoria obsoleta a B — anulando o
cenário (1) do mesmo arquivo.

**Fix:** o cache de categorias precisa ser escopado à execução, não ao módulo. A forma mínima que
preserva a dedup dentro da rodada e elimina o estado compartilhado:

```js
// backend/src/agendor.js — getOrgCategory passa a receber o cache da execução
async function getOrgCategory(orgId, cache) {
  if (!orgId) return null;
  if (cache.has(orgId)) return cache.get(orgId);
  try {
    const { data } = await api.get(`/organizations/${orgId}`);
    const category = data.data?.category?.name || null;
    cache.set(orgId, category);
    return category;
  } catch {
    cache.set(orgId, null);
    return null;
  }
}

// em getStaleDeals: some a limpeza de :203-205 (não há mais o que limpar)
const cacheDaExecucao = new Map();
const categoriaPorOrg = new Map(
  await Promise.all(
    uniqueOrgIds.map(async (id) => [id, await getOrgCategory(id, cacheDaExecucao)]),
  ),
);
```

Isso mantém verdes os três cenários de `agendor.cacheInvalidation.test.js` (o refetch entre
execuções passa a ser estrutural, não uma limpeza que pode ser vencida por corrida) e o cenário
de `agendor.cacheConcurrency.test.js`. Acrescentar a esse arquivo o cenário espelho — falha
transitória em A **depois** do início de B, asserindo o golden `[101, 103]` em B — e corrigir os
dois blocos de comentário que hoje afirmam mais do que o código garante.

Alternativa (se escopar o cache for considerado grande demais agora): serializar `getStaleDeals`
com um lock/single-flight de módulo. Mas isso muda o comportamento de 8 call-sites e precisa de
teste próprio; o cache por execução é a mudança menor e mais local.

---

### Warnings

#### WR2-01: no caminho de exceção a linha vira `'sent'` mas `results.notified` fica em 0

**Origem:** lacuna deixada pelo fechamento de WR-01/WR-04 (04-10).
**File:** `backend/src/scheduler.js:184-198` (comparar com `:171-177`)

**Issue:**
O ramo de retorno incrementa `results.notified` junto com o `updateNotificationStatus(logId,
'sent', …)` (`:172-177`). O ramo de **exceção** grava `'sent'` quando há parcial confirmado
(`:192-196`) mas **não** incrementa o contador, e `dealResult.notified` também permanece `false`.
Resultado: um e-mail realmente saiu, a linha do `notification_log` diz `'sent'`, e o número que o
`logger.info('[Scheduler] Concluído: …')` (`:209-211`) e a UI exibem diz que nada saiu.

Sonda executada sobre o cenário A do próprio arquivo de teste da fase:

```
PROBE status da linha = sent | results.notified = 0 | dealResult.notified = false | enviosConfirmados = 1
```

É o mesmo defeito que WR-04 nomeou ("o contador não pode discordar da linha"), apenas na direção
oposta — sub-contagem em vez de super-contagem. O cenário B do
`notificationStatus.partialFailure.test.js` chega a asserir explicitamente que "o objeto do deal e
o contador da rodada precisam concordar" (`:271-275`), mas o cenário A, onde eles discordam, não
assere nem `r.notified` nem `r.deals[0].notified`. A inconsistência ficou sem oráculo.

**Fix:**

```js
// backend/src/scheduler.js:188-197
if (logId !== null) {
  const parciais = err.resultadosParciais ?? [];
  if (parciais.some((r) => r.success)) houveEnvioConfirmado = true;
  updateNotificationStatus(logId, houveEnvioConfirmado ? 'sent' : 'error', err.message);
  if (houveEnvioConfirmado) {
    // Mesma razão de :177: o contador tem de refletir o que a linha registra.
    results.notified++;
    dealResult.notified = false; // explícito: nem todos os destinatários confirmaram
  }
}
```

Acrescentar ao cenário A as duas asserções que faltam (`r.notified === 1` e
`r.deals[0].notified === false`), para que a relação linha↔contador fique pinada nos dois ramos.

---

#### WR2-02: o cenário que justifica WR-01 no comentário (SQLite fechado) continua reabrindo a duplicata

**Origem:** limite não declarado do fechamento de WR-01 (04-10).
**File:** `backend/src/emailer.js:230-232` e `backend/src/scheduler.js:128-134` → `backend/src/scheduler.js:192-196`

**Issue:**
O comentário de `emailer.js:230-232` nomeia o gatilho do defeito: "`createTransporter` e
`dealEmailHtml` fazem leituras síncronas em SQLite (`getConfig`) que podem falhar — **por exemplo
com a conexão já fechada pelo `shutdown()` do index.js**". Nesse cenário específico o conserto
não protege nada: `updateNotificationStatus` (`db.js:340-344`) usa **a mesma conexão fechada**,
então a chamada de `:192-196` lança dentro do `catch`, a exceção sobe para o `catch` externo de
`:212`, a linha permanece `'pending'`, `alreadyNotifiedToday` (`db.js:223-232`, que filtra
`status = 'sent'`) devolve `false` — e **a rodada de amanhã reenvia para quem já recebeu**, que é
exatamente o desfecho que WR-01 existia para impedir.

Efeito colateral do mesmo caminho: a exceção escapando do `catch` interno aborta o `for` de
`:73`, então os deals restantes da rodada nem chegam a ser processados.

O conserto **é** eficaz para as outras origens de exceção (falha de
`nodemailer.createTransport`, erro na montagem do HTML com o banco vivo) — foi essa que o cenário
A exercita. O problema é que a documentação declara resolvido o caso que não está.

**Fix:** duas coisas, ambas baratas:

```js
// backend/src/scheduler.js — a atualização de status não pode derrubar a rodada
if (logId !== null) {
  const parciais = Array.isArray(err.resultadosParciais) ? err.resultadosParciais : [];
  if (parciais.some((r) => r.success)) houveEnvioConfirmado = true;
  try {
    updateNotificationStatus(logId, houveEnvioConfirmado ? 'sent' : 'error', err.message);
  } catch (erroDeRegistro) {
    // O banco pode estar fechado — é justamente uma das origens da exceção acima.
    // Registrar e seguir: a linha fica 'pending' e a rodada de amanhã retenta (fail-safe).
    logger.error('[Scheduler] Falha ao registrar o desfecho do envio:', erroDeRegistro.message);
  }
}
```

E corrigir o comentário de `emailer.js:230-232` para não citar como exemplo um cenário que o
mecanismo não cobre — trocar pelo que ele de fato cobre (falha da fábrica do transporte durante o
retry, com o banco vivo).

---

#### WR2-03: `avancarRelogioAte` transforma qualquer rejeição em `unhandledRejection` e pode reprovar um teste alheio

**Origem:** código novo desta rodada (04-10). Registrado como débito, mas **pior do que descrito**.
**File:** `backend/test/helpers/fakeTimers.js:27-42`

**Issue:**
O débito registrado diz que "na rejeição o helper substitui o erro real". Além disso — e não
documentado — a promessa derivada `encerrada` (`:29-32`) fica **sem handler de rejeição**: quando
`promessa` rejeita, o `for` estoura as 20 iterações, a função lança "a promessa não concluiu", e
`encerrada` vira uma rejeição não tratada. Verificado:

```
not ok 1 - rejeicao no helper
  failureType: 'unhandledRejection'
  error: 'ERRO REAL DO SUT'
# capturado: a promessa não concluiu após avançar o relógio falso
```

Ou seja: o caso falha por `unhandledRejection` mesmo quando o autor do teste envolveu a chamada
num `try/catch` ou num `assert.rejects`. Como `node:test` atribui a rejeição não tratada ao teste
que estiver correndo no momento, uma rejeição que aflore tarde pode reprovar um **caso vizinho**,
com a mensagem de outro caso. Numa suíte que existe para ser o oráculo da elegibilidade de
notificação, um helper que produz falha atribuída ao teste errado é caro.

`agendor.retry429.test.js:122-131` já paga esse custo com um envelope local
(`avancarRelogioAteDesfecho`); `emailer.timeout.test.js` mantém uma terceira cópia. São três
variantes do mesmo helper em circulação.

**Fix:** normalizar o desfecho **dentro** do helper — resolve o débito e apaga o envelope local:

```js
async function avancarRelogioAte(promessa) {
  let desfecho = null;
  const encerrada = promessa.then(
    (valor) => (desfecho = { ok: true, valor }),
    (erro) => (desfecho = { ok: false, erro }),
  );
  for (let i = 0; i < 20 && !desfecho; i++) {
    await new Promise((r) => setImmediate(r));
    if (!desfecho) mock.timers.tick(10000);
  }
  await encerrada; // nunca rejeita: os dois ramos foram tratados acima
  if (!desfecho) throw new Error('a promessa não concluiu após avançar o relógio falso');
  if (!desfecho.ok) throw desfecho.erro; // o erro REAL do SUT chega ao assert.rejects
  return desfecho.valor;
}
```

Com isso `agendor.retry429.test.js` pode chamar o helper direto, e a dedup da cópia de
`emailer.timeout.test.js` deixa de exigir mudança de semântica.

---

#### WR2-04: o canal do resultado parcial é uma propriedade improvisada no erro, sem validação no consumidor

**Origem:** código novo desta rodada (04-10).
**File:** `backend/src/emailer.js:272-275` (produtor) → `backend/src/scheduler.js:190-191` (consumidor)

**Issue:**
Três fragilidades no mesmo canal:

1. `if (err && typeof err === 'object') err.resultadosParciais = results;` — um `throw` de string
   (ou de qualquer primitivo) perde o parcial em silêncio, e o `catch` do agendador rebaixa a
   linha para `'error'`. É o caminho da duplicata de novo, sem nenhum sinal.
2. Módulos CommonJS rodam em sloppy mode: se o erro for congelado (`Object.freeze`, ou um erro
   singleton de biblioteca), a atribuição **falha em silêncio** — sem `TypeError`, sem log — e o
   desfecho é o mesmo do item 1.
3. O consumidor faz `const parciais = err.resultadosParciais ?? []; parciais.some(...)`. `??` só
   protege contra `null`/`undefined`: se algum erro de terceiro trouxer uma propriedade com esse
   nome que não seja array, `.some` lança **dentro do `catch`**, a exceção sobe para o `catch`
   externo de `:212` e derruba o restante da rodada.

Nada disso está pinado por teste: o cenário A usa um `Error` comum e o caminho feliz do canal.

**Fix:** endurecer o consumidor (uma linha) e tornar o produtor explícito sobre o que não
consegue anexar:

```js
// scheduler.js
const parciais = Array.isArray(err?.resultadosParciais) ? err.resultadosParciais : [];

// emailer.js
} catch (err) {
  if (err && typeof err === 'object') {
    // Anexar pode falhar em silêncio num erro congelado; por isso o consumidor
    // trata a ausência como "nada confirmado" (fail-safe: linha 'error', retenta amanhã).
    err.resultadosParciais = results;
  }
  throw err;
}
```

Se a duplicata for considerada pior que o reenvio (é o que WR-01 argumenta), a alternativa
robusta é `sendStaleNotification` **não lançar** e devolver sempre
`{ results, erro }` — mas isso muda o contrato pinado por `notificationStatus.test.js` (Q1-2) e
exige plano próprio.

---

#### WR2-05: `sendMailWithRetry` recria o transporte só para si — o segundo destinatário reusa o transporte que já falhou

**Origem:** pré-existente, mas o comentário novo de `emailer.js:229-230` passou a apoiar-se nele.
**File:** `backend/src/emailer.js:211` e `backend/src/emailer.js:220`

**Issue:**
`transporter = createTransporter()` (`:211`) reatribui o **parâmetro** da função, não a variável
do chamador. Em `sendStaleNotification`, `let transporter = createTransporter()` (`:220`) nunca é
reatribuído: se o envio ao dono só teve sucesso após recriar o transporte, o envio ao **autor**
recomeça com o transporte antigo — o mesmo que já se provou quebrado — e paga de novo os 3s+6s
de retry antes de conseguir. Em SMTP com sessão morta isso é o caso comum, não o raro.

O sintoma é degradação de tempo e de taxa de entrega ao segundo destinatário, e é justamente o
segundo destinatário o elo mais frágil do fluxo (o autor é quem "some" quando o parcial vira
`'sent'` — ver IN2-04). O `let` em `:220` também é morto hoje, o que esconde a intenção original
de reaproveitar o transporte recriado.

**Fix:** devolver o transporte vivo junto com o resultado, ou (mais simples e sem mudar assinatura)
criar o transporte por destinatário:

```js
// emailer.js — sendMailWithRetry devolve também o transporte em uso
return { success: true, transporter };
// ...
const result = await sendMailWithRetry(transporter, { ... });
if (result.transporter) transporter = result.transporter;
results.push({ to: ownerEmail, success: result.success, error: result.error });
```

Cobrir com um caso: dono precisa de 2 tentativas, autor deve enviar na 1ª (asserindo
`transportesCriados === 2`, e não 3).

---

#### WR2-06: as referências de linha dos comentários novos apontam para os lugares errados

**Origem:** código novo desta rodada (04-08 a 04-11).
**File:** `backend/src/agendor.js:68,149,188,197`; `backend/src/routes/deals.js:39`; `backend/src/scheduler.js:137`; cabeçalho de `backend/test/notificationStatus.partialFailure.test.js:5-16`

**Issue:**
Neste projeto o comentário É o artefato de racional — CLAUDE.md pede explicitamente "explicar o
porquê" e os comentários desta fase têm 15-25 linhas cada. Ponteiros errados nesse regime não são
cosméticos: mandam o próximo leitor para o trecho errado ao investigar um incidente. Conferido
linha a linha:

| Comentário | Aponta para | Está em |
|---|---|---|
| `agendor.js:68` — "Diferente de getOrgCategory (`:35-47`)" | 35-47 | 49-61 |
| `agendor.js:149` — "a consulta de tarefas futuras (`:281`)" | 281 | 300-304 |
| `agendor.js:188` — "o Promise.all de `:211`" | 211 (um comentário) | 245 |
| `agendor.js:197` — "o mapa `categoriaPorOrg` local à execução (`:211`)" | 211 | 244 |
| `routes/deals.js:39` — "Mesma razão já registrada em `agendor.js:291-292`" | 291-292 | 325-326 / 333 |
| `scheduler.js:137` — "o `logger.info(...)` de `:187-189`" | 187-189 | 209-211 |
| `scheduler.js:366` (pré-existente) — "catch de `:242`" | 242 | 283-285 |

Todos já nasceram errados: as linhas se deslocaram dentro do mesmo commit que escreveu o
comentário (os próprios blocos de 15-25 linhas empurraram o código para baixo).

**Fix:** substituir número de linha por âncora estável — nome de função e/ou identificador —
em qualquer referência dentro do mesmo arquivo ou entre arquivos de produção. Ex.: "o
`Promise.all` que popula `categoriaPorOrg`" em vez de "o `Promise.all` de `:211`". Referências a
arquivos de teste podem citar o nome do caso. É a única forma que sobrevive a edição.

---

### Info

#### IN2-01: `fetchWithRetry` devolve `undefined` quando `retries <= 0`

**File:** `backend/src/agendor.js:154-167`

**Issue:** o `for` não executa nenhuma iteração e a função cai no fim sem `return`. Os dois call-sites
desestruturam (`const { data } = await fetchWithRetry(...)`), então o sintoma seria um
`TypeError: Cannot destructure property 'data' of 'undefined'` — mensagem que não aponta para a
causa. Não é alcançável hoje (`fetchDealsPage` é interno e sempre recebe o default 3), mas
`retries` é parâmetro público da função e o helper existe para ser reusado por um terceiro
consumidor.
**Fix:** `if (retries < 1) throw new Error('[Agendor] fetchWithRetry exige ao menos 1 tentativa')`
no topo, ou trocar o `for` por `do/while` para garantir pelo menos uma execução.

#### IN2-02: `notificationStatus.partialFailure.test.js` habilita o relógio falso em `before`, não em `beforeEach`

**File:** `backend/test/notificationStatus.partialFailure.test.js:170-177` (comparar com `agendor.retry429.test.js:139-153`)

**Issue:** cada `mock.timers.tick(10000)` de `avancarRelogioAte` deixa o relógio adiantado para o
caso seguinte — o cenário A avança ~10s antes de B e C rodarem. É exatamente a contaminação de
ordem que `agendor.retry429.test.js:139-145` descobriu e resolveu com `reset()` + `enable()` no
`beforeEach` (lá, um adiantamento de 30s movia o `cutoffDate` e trazia os deals de fronteira 102 e
104 para dentro do golden). O arquivo do 04-10 só continua verde porque `servirDeal` serve **um**
clone por caso, longe da fronteira de 15 dias. Fragilidade latente num arquivo que pertence à rede
de testes do Core Value.
**Fix:** replicar o `beforeEach` do `agendor.retry429.test.js` (`mock.timers.reset()` seguido de
`mock.timers.enable({ apis: ['Date','setTimeout'], now: FIXED_NOW })`).

#### IN2-03: a mensagem de erro de `getDealById` interpola o valor recusado

**File:** `backend/src/agendor.js:85`

**Issue:** `` throw new Error(`[Agendor] id de negócio inválido: ${String(id)}`) `` coloca um valor
de origem externa (coluna gravada a partir do corpo de uma requisição) numa string de erro. Hoje
essa rejeição é absorvida pelo `catch` por item de `resolvedHandler` e não chega a log nenhum —
mas basta alguém acrescentar um `logger.warn` ali para virar injeção de linha no log
(`\n{"level":"info",…}` num logger que emite JSON por linha em produção).
**Fix:** recortar e sanear — `${String(id).slice(0, 40).replace(/\s+/g, ' ')}` — ou omitir o valor
e registrar só o tipo.

#### IN2-04: quando o parcial vira `'sent'`, o destinatário que faltou não é retentado nunca mais — e não há sinal disso

**File:** `backend/src/scheduler.js:171-177` e `:192-196` → `backend/src/db.js:223-232`

**Issue:** a decisão de manter `'sent'` com ≥ 1 sucesso (D-03/Q1, agora estendida ao caminho de
exceção) tem um outro lado que nenhum comentário registra: `alreadyNotifiedToday` bloqueia o deal
para o dia inteiro, e como o card continua parado ele voltará amanhã — mas o destinatário que
falhou hoje simplesmente **não recebeu**, e o único vestígio é a coluna `error` de uma linha cujo
`status` é `'sent'`. Na UI (`NotificationHistory.jsx`, que renderiza `status === 'sent' ? ✅ : ❌`)
essa linha aparece como sucesso pleno. Dado que o Core Value do milestone trata notificação
perdida em silêncio como a pior classe de falha, o trade-off merece estar visível.
**Fix:** fora do escopo desta rodada — registrar como todo: exibir no histórico um terceiro estado
(`'sent'` com `error` não nulo → "parcial") e/ou contabilizar `results.parciais` na resposta de
`POST /api/notifications/run`.

---

_Reviewed: 2026-08-04T21:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard — rodada 2 (gap closure)_
_Suíte executada: 139/139 verdes sob Node 22.13.1_
