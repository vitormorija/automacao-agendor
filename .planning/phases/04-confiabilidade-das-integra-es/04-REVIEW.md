---
phase: 04-confiabilidade-das-integra-es
reviewed: 2026-08-05T07:20:00Z
depth: standard
round: 4
files_reviewed: 15
files_reviewed_list:
  - backend/src/agendor.js
  - backend/src/emailer.js
  - backend/src/scheduler.js
  - backend/test/agendor.cacheConcurrency.test.js
  - backend/test/agendor.cacheInvalidation.test.js
  - backend/test/agendor.categoriaIndecidivel.test.js
  - backend/test/agendor.paginacao.test.js
  - backend/test/agendor.retry429.test.js
  - backend/test/emailer.resumoIndecidivel.test.js
  - backend/test/emailer.timeout.test.js
  - backend/test/helpers/fakeTimers.js
  - backend/test/notificationStatus.canalParcial.test.js
  - backend/test/notificationStatus.partialFailure.test.js
  - backend/test/notificationStatus.registroResiliente.test.js
  - backend/test/scheduler.categoriaIndecidivel.test.js
findings:
  critical: 1
  warning: 7
  info: 6
  total: 14
status: issues_found
---

# Fase 04 — Code Review, Rodada 4 (gap closure r3: planos 04-19 a 04-27)

**Reviewed:** 2026-08-05T07:20:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Revisão adversarial dos 9 planos da rodada 3 (04-19 a 04-27). Ambiente confirmado:
`npm test` → **172/172 verdes**; `npm run lint` → exit 0, 44 warnings (baseline). Duas provas
empíricas deste relatório foram reproduzidas **fora da árvore do repositório** (scratchpad),
sem tocar em nenhum arquivo do projeto. Nenhum valor de segredo aparece aqui.

### O veredito sobre a novidade estrutural da rodada (cenário simétrico obrigatório)

**Funcionou, e é a melhor coisa que a rodada produziu — mas resolveu o problema errado.**

Os simétricos entregues são majoritariamente **substantivos**, não cerimoniais:

| Plano | Simétrico | Veredito |
|-------|-----------|----------|
| 04-19 | (2) organização de categoria NÃO excluída também vira indecidível | **Substantivo.** Escreve por extenso o custo do fail-safe não seletivo — o negócio elegível também deixa de ser notificado. Sem ele, ninguém teria pesado esse preço. |
| 04-20 | B — a falha é no SEGUNDO negócio | **Fraco.** O acoplamento posicional que ele vigia é implausível para um `continue` num `for...of`. Quem faz o trabalho ali é o caso C (não-regressão), não o B. É o único que beira o cerimonial. |
| 04-21 | (2) exclusão total → nenhum e-mail, e não um e-mail vazio | **Substantivo.** Cobre um defeito de outra natureza ("Seus 0 cards parados" é notificação indevida). |
| 04-22 | (6) exaustão e (7) timeout em `/users` | **Substantivo.** (7) é o alarme contra alargar a política de retry de carona. |
| 04-23 | F — o INSERT do log (vizinho já seguro, pinado) | **Substantivo e exemplar.** É a única vez na fase em que o vizinho foi *verificado* em vez de presumido — exatamente o antídoto ao padrão das três rodadas anteriores. |
| 04-24 | G — elemento corrompido AO LADO de sucesso genuíno | **O mais forte da fase.** Prevê e fecha a armadilha do conserto "natural" de F (descartar o array inteiro), que reabriria a duplicata de WR-01. |
| 04-25 | (2) e (4) paginação legítima não é truncada | **Substantivo**, verificado por VALOR nas duas páginas. |
| 04-26 | Ausência medida (D-WR3-07-c) | **Legítimo.** Confirmei o mecanismo: `liberar210` é armado uma vez e consumido pelo caso (2); zerá-lo re-arma uma suspensão que ninguém libera. A medição está correta. |

**O problema:** o padrão que reprovou r1→r2→r3 nunca foi "faltou o input simétrico". Foi
**"faltou o código vizinho"** — a função irmã, o terceiro call-site, o outro arquivo que
documenta a mesma coisa. Simétrico de *entrada* não detecta vizinho de *código*, e esta rodada
prova isso três vezes:

- **04-25** deu teto a 2 das 3 paginações e justificou por escrito a exclusão da terceira com
  uma frase que a sonda 2 desmente (**WR4-01**);
- **04-26** removeu a cópia do helper e atualizou 2 dos 4 comentários que a declaram viva
  (**WR4-02**), deixando um deles em contradição direta com o próprio helper;
- **CR3-01** (04-19+04-20+04-21) fechou o fail-open para *uma* organização e abriu, sem que
  nenhum plano o nomeasse, uma **supressão em massa operacionalmente invisível** (**CR4-01**).

Recomendação para a rodada seguinte: trocar o mandato de "cenário simétrico" por **"inventário
de irmãos"** — para cada conserto, listar por escrito TODAS as funções/arquivos/call-sites que
compartilham a construção consertada, e marcar cada um como corrigido, verificado-e-são, ou
declarado-fora-de-escopo-com-medição.

### Avaliação dos desvios deliberados declarados

1. **Rota INDECIDÍVEL (decisão vinculante).** *Concordo com a direção.* O que a decisão do
   usuário cobriu foi "não abortar a rodada por uma organização". Ela não cobriu — e nenhum
   plano perguntou — o que acontece quando **todas** as organizações são inatingíveis. Ver
   **CR4-01**: não é a política que está errada, é a ausência total de sinal operacional.
2. **Política do resumo semanal (individual exclui, admin mantém).** *Concordo.* O precedente
   do funil Beefor é literal e está no mesmo bloco; o caso (3) de `emailer.resumoIndecidivel`
   é o guarda-corpo certo contra uma "harmonização" futura. Sem ressalvas.
3. **`D-WR3-07-c` (7 variáveis de armação).** *Concordo, e a medição confere.* Rastreei
   `liberar210` / `chamadas205` pela ordem declarada dos casos: resetá-las re-arma um ponto de
   suspensão sem liberador. O gate anti-expansão e o todo `wr3-07b` são a resposta correta.
4. **Stub cedendo via `setImmediate` (04-25).** *Concordo sem ressalva.* Um laço que só consome
   microtarefas realmente starva o loop e o `--test-timeout` nunca dispara; o motivo está
   escrito no arquivo, onde quem for "simplificar" vai lê-lo.
5. **`runCheckOnly` sem a proteção do 04-23.** *Concordo quanto à dedup* (prévia somente-leitura,
   falha vira HTTP 500 visível). *Discordo quanto ao alcance da justificativa* — ela foi
   estendida no 04-20 para cobrir a guarda de categoria, e ali "superfície de visualização" já
   não descreve o que aquela rota é. Ver **WR4-06**.
6. **Decisão C10 (linha `'pending'` retentável).** Aceito; não reportado.
7. **Decisão C8 / SEC-01.** Não reportado; nenhum valor de token exibido.
8. **IN3-01..IN3-08 pendentes por escopo travado.** Não re-descobertos. Sobre `in3-08`
   (`shouldNotifyOwner` fail-open): **concordo que merece severidade acima de Info** — ele é o
   segundo filtro de elegibilidade que falha aberto e o único ainda aberto depois de CR3-01.
   Como já tem dono e prioridade alta, não o reabro como achado; registro a concordância.

> Nenhum bloco `<structural_findings>` foi fornecido nesta rodada — não há seção de substrato
> estrutural a preservar.

---

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR4-01 [BLOCKER]: uma indisponibilidade da API de organizações suprime a rodada INTEIRA sem produzir nenhum sinal — `results.error` `undefined`, `results.errors` vazio, zero linhas de log

**Origem:** consequência direta e não avaliada do conserto de CR3-01 (04-19 + 04-20). Nenhum dos
três planos perguntou o que acontece quando a falha de categoria não é de *uma* organização.
**File:** `backend/src/scheduler.js:135-142` (a guarda), `:119`/`:139`/`:149`/`:339` (os quatro
usos indistinguíveis de `results.skipped++`), `:347-349` (o log de conclusão);
`backend/src/agendor.js:359-363` (o único vestígio, por negócio)

**Issue:**
A decisão do usuário resolveu a direção certa: negócio indecidível fica fora do envio. O que
ficou de fora é que a supressão **não é observável em nenhuma superfície operacional**.

Reproduzido (5 negócios, 5 organizações distintas, HTTP 429 persistente em `/organizations/:id`,
sonda executada fora da árvore do repositório):

```
consultas a /organizations : 15 (5 orgs x 3 tentativas — o retry do 04-19 funcionou)
results.error              : undefined
results.stale              : 5
results.notified           : 0
results.skipped            : 5
results.errors             : []
e-mails enviados           : 0
linhas em notification_log : 0
log de conclusao diria     : `Concluído: 5 negócios parados, 0 notificações enviadas`
```

Cada superfície mente ou cala:

- **`results.error` é `undefined` e `results.errors` é `[]`** — o `Dashboard.jsx` só renderiza o
  bloco de erros quando `lastRun?.errors?.length > 0` (linha 198), então a UI não mostra nada.
- **`results.skipped` vale 5, mas é o mesmo contador incrementado por dedup do dia, por funil
  Beefor e por "sem destinatário"** (`scheduler.js:119`, `:139`, `:149`, `:339`). Um dia em que
  todo mundo já tinha sido notificado às 8h produz exatamente o mesmo número.
- **Nenhuma linha entra no `notification_log`** (correto por T-04-20-03), então o histórico
  também não registra a supressão.
- **O toast do botão "Enviar notificações" diz `0 notificação(ões) enviada(s) de 5 negócio(s)
  parado(s)`** (`Dashboard.jsx:93-95`) — indistinguível de um dia calmo.
- **`skipReason` existe em `results.deals`, mas ninguém o lê**: `grep -rn "skipReason" frontend/src`
  → 0 ocorrências.

O único vestígio é `logger.warn` **por negócio** em `getStaleDeals` — que, por morar na borda,
também dispara a cada refresh do painel e a cada `/api/reports`, misturando ruído de leitura
com o evento operacional. Não há contador agregado, não há `logger.error`, não há alarme.

Por que isto é BLOCKER e não WARNING: o Core Value do milestone é "quem recebe / quem não
recebe", e a classe de falha que o próprio `notificationStatus.registroResiliente.test.js`
chama de pior ("notificação perdida em silêncio") acabou de ganhar um caminho **novo, de
alcance total e sem vestígio agregado**. Antes de 04-19 a mesma indisponibilidade notificava
todo mundo (fail-open, ruidoso). Depois, ela não notifica ninguém (fail-safe, mudo). A troca de
direção foi aprovada; a mudez não foi discutida em lugar nenhum.

**Fix:** o conserto é barato e não reabre a decisão do usuário — basta tornar a supressão
contável e audível.

```js
// backend/src/scheduler.js — no lugar de `results.skipped++` genérico da guarda de categoria
if (deal.categoriaIndecidivel) {
  dealResult.skipped = true;
  dealResult.skipReason =
    'categoria da organização não pôde ser consultada — negócio não notificado';
  results.skipped++;
  results.skippedCategoriaIndecidivel =
    (results.skippedCategoriaIndecidivel || 0) + 1;
  results.deals.push(dealResult);
  continue;
}

// ...e ao fim do laço, ANTES do logger.info de conclusão:
if (results.skippedCategoriaIndecidivel > 0) {
  const msg =
    `${results.skippedCategoriaIndecidivel} de ${results.stale} negócio(s) não foram ` +
    'notificados porque a categoria da organização não pôde ser consultada';
  logger.error(`[Scheduler] ${msg}`);
  results.errors.push(msg); // é este array que a UI já renderiza
}
```

Cobrir com um caso novo em `scheduler.categoriaIndecidivel.test.js` — o **simétrico de escala**
que falta ali: hoje A e B medem 1 de 2 suprimidos; falta **2 de 2**, asserindo
`r.skippedCategoriaIndecidivel === 2`, `r.errors.length >= 1` e `r.notified === 0`. Sem esse
caso, "supressão parcial" e "apagão total" continuam sendo o mesmo resultado observável.

---

### Warnings

#### WR4-01 [WARNING]: `getStaleDeals` é a TERCEIRA paginação sem teto, e a justificativa escrita para excluí-la é falsa — o limite do laço vem da RESPOSTA

**Origem:** vizinho não fechado de WR3-06 (04-25), com exclusão declarada por escrito.
**File:** `backend/src/agendor.js:265-284` (o laço), `:57-60` (a justificativa que o dispensa do
teto), `:33` (`MAX_PAGES`, já exportada)

**Issue:**
O comentário de `:57-60` diz: *"Por que getStaleDeals NÃO recebe teto: ela deriva `totalPages` de
`meta.totalCount` e percorre um `for` sobre um array finito de páginas — é limitada por
construção, e não existe ali condição de parada vinda da resposta a ser frustrada."*

O array é finito, mas o **seu comprimento é derivado da resposta**:

```js
const firstPage = await fetchDealsPage(1, perPage);
const totalCount = firstPage.meta?.totalCount || 0;   // <- valor da BORDA
const totalPages = Math.ceil(totalCount / perPage);
const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
```

A mesma regressão de borda que WR3-06 usou como premissa ("uma API de terceiros pode passar a
ignorar `page`") cobre igualmente "uma API de terceiros pode passar a devolver um `totalCount`
que não corresponde ao filtro". Reproduzido (sonda 2, fora da árvore do repositório,
`meta.totalCount = 100000`):

```
MAX_PAGES exportado por agendor.js : 200
totalCount servido pela borda      : 100000
páginas que getStaleDeals derivará : 1000
requisições a /deals já passaram de MAX_PAGES (200): 201
nenhuma exceção foi lançada — o laço continuaria até 1.000
```

O desfecho é exatamente o que WR3-06 existe para impedir: o laço vive dentro do `try` de
`runCheck`, o `finally` que devolve `isRunning` a `false` não executa, e toda execução seguinte
cai no guard e devolve `{ skipped: true }` — para sempre, até reiniciar o processo. Com `batchSize`
5 e a pausa de 1 s entre lotes, 1.000 páginas já são ~3,5 minutos; um `totalCount` de 10⁹ dá 10⁷
páginas (≈ 23 dias de laço) e ainda aloca de uma vez um array de 10⁷ elementos — contra o
`max_memory_restart: 300M` do `ecosystem.config.js`.

**Fix:** o teto já existe e já está exportado; falta aplicá-lo.

```js
// backend/src/agendor.js — getStaleDeals, logo após derivar totalPages
if (totalPages > MAX_PAGES) {
  throw new Error(
    `[Agendor] /deals anunciou ${totalPages} páginas (> ${MAX_PAGES}) — ` +
      'meta.totalCount não parece corresponder ao filtro enviado',
  );
}
```

Acrescentar a `agendor.paginacao.test.js` — que o próprio 04-25-SUMMARY declara ser "o oráculo da
terminação das paginações do módulo" — o par (5)/(6): `totalCount` inflado **rejeita** com
`padraoDoTeto('/deals')`, e o simétrico com `totalCount` legítimo de 2 páginas **não** trunca.
E reescrever o comentário de `:57-60`, que hoje induz o próximo leitor a não procurar.

---

#### WR4-02 [WARNING]: a remoção da cópia do helper (WR3-05) atualizou 2 dos 4 comentários que a declaram viva — dois deles ainda afirmam que ela existe

**Origem:** vizinho não fechado de WR3-05 (04-26). O commit `46cf90a` tocou apenas
`emailer.timeout.test.js` e `helpers/fakeTimers.js`.
**File:** `backend/test/agendor.retry429.test.js:172-176` e
`backend/test/agendor.cacheConcurrency.test.js:220-221` — comparar com
`backend/test/helpers/fakeTimers.js:20-22`

**Issue:**
`helpers/fakeTimers.js:20-22` afirma, corretamente: *"NÃO existe mais nenhuma. Esta é a ÚNICA
implementação de `avancarRelogioAte` em circulação na suíte"*. Confirmado por medição:
`grep -rn "function avancarRelogioAte\|const avancarRelogioAte" backend/test` → **1 ocorrência**.

Dois arquivos ainda dizem o contrário:

- `agendor.retry429.test.js:172-176`: *"Restam **duas variantes** do helper em circulação. A
  segunda, a **cópia local** de `emailer.timeout.test.js`, **continua de propósito**"* — e explica
  um motivo (não trocar instrumento e objeto medido na mesma rodada) que o 04-26 extinguiu.
- `agendor.cacheConcurrency.test.js:220-221`: *"no mesmo espírito de `avancarRelogioAte` (o
  **helper homônimo de `emailer.timeout.test.js`**)"* — aponta para um símbolo que não existe mais
  naquele arquivo.

O dano é o mesmo que WR2-06 nomeou e que WR3-05 usou como justificativa: quem for auditar o
instrumento lê que existe uma cópia sabidamente defeituosa na rede de testes do Core Value, vai
procurá-la, não acha, e fica sem saber se o problema é o comentário ou a própria auditoria. Numa
suíte cujo valor é ser oráculo confiável, comentário que mente sobre o instrumento é defeito do
instrumento.

**Fix:** duas edições de comentário, ambas só de texto:

```js
// agendor.retry429.test.js — no lugar do parágrafo "Restam duas variantes..."
// Não resta nenhuma cópia: `backend/test/helpers/fakeTimers.js` é a ÚNICA implementação
// de `avancarRelogioAte` desde o 04-26 (WR3-05). Quem precisar avançar relógio falso
// importa de lá.

// agendor.cacheConcurrency.test.js:220-221
// ...no mesmo espírito de `avancarRelogioAte` (helpers/fakeTimers.js).
```

E, para não repetir a terceira vez: o critério de "vizinho" deste conserto era
`grep -rn "cópia local\|helper homônimo" backend/test`, que devolve os 4 arquivos em menos de um
segundo.

---

#### WR4-03 [WARNING]: `emailer.timeout.test.js` mantém 4 referências por número de linha a `emailer.js`, e as 4 apontam hoje para o lugar errado

**Origem:** o arquivo foi editado no 04-26 (WR3-05) sem que a convenção de WR2-06 fosse aplicada
a ele; IN3-06 registrou apenas as duas referências de `scheduler.resilience.test.js`.
**File:** `backend/test/emailer.timeout.test.js:7` (`emailer.js:178-203`), `:178`
(`emailer.js:188`), `:237` (`emailer.js:197`), `:277` (`emailer.js:229`)

**Issue:**
Cada uma das quatro âncoras deriva de uma versão antiga de `emailer.js`. Conferido linha a linha
contra o arquivo atual:

| Referência no teste | O que o comentário afirma estar lá | O que está lá hoje |
|---------------------|------------------------------------|--------------------|
| `emailer.js:178-203` | `sendMailWithRetry` | miolo do template HTML (`sendMailWithRetry` está em `208-237`) |
| `emailer.js:188` | o ramo `isNetworkError` pela MENSAGEM | `</body>` do template (o ramo está em `217-218`) |
| `emailer.js:197` | a recriação do transporter no retry | linha de comentário (a recriação está em `227`) |
| `emailer.js:229` | a guarda `authorEmail !== ownerEmail` | `error: err.message,` dentro do retorno de falha (a guarda está em `313`) |

Este é literalmente o defeito que WR2-06 descreve — *"comentário referencia outro trecho por
âncora nomeada … nunca por número de linha, que se desloca no próprio commit que o escreve"* — e
aconteceu porque `emailer.js` foi reescrito por 04-17, 04-21 e o próprio 04-24 depois de o teste
ter sido escrito. O agravante é o alvo: este arquivo é o **oráculo de REL-02**, e um leitor que
siga `emailer.js:229` para entender por que dono-igual-a-autor rende um só e-mail cai numa linha
sem relação nenhuma.

**Fix:** substituir as quatro por âncoras nomeadas — `sendMailWithRetry`, `isNetworkError`,
"a recriação do transporte dentro do catch de `sendMailWithRetry`", "a guarda
`authorEmail !== ownerEmail` em `sendStaleNotification`". São mudanças de comentário puro,
zero linhas de código, e o mesmo `grep -nE "\.js:[0-9]+"` do 04-18 as encontra.

---

#### WR4-04 [WARNING]: o retry entrou no único ponto que faz N requisições — um 429 vira 3N requisições, inclusive no caminho de LEITURA do painel

**Origem:** consequência não avaliada de 04-19 (`getOrgCategory` dentro de `fetchWithRetry`).
**File:** `backend/src/agendor.js:93-107` (`getOrgCategory`), `:319-326` (o `Promise.all` sobre
`uniqueOrgIds`), `:232-245` (`fetchWithRetry`)

**Issue:**
O bloco de política em `:219-226` justifica o helper dizendo que as bordas *"saem no MESMO
`Promise.all` de runCheck, o que torna o 429 provável justamente ali"*. O raciocínio está certo e
foi aplicado à borda em que ele tem o efeito mais perverso: `/organizations/:id` é a única que
dispara **uma requisição por organização única**, todas simultâneas via `Promise.all`.

Consequência: sob rate limit, `N` requisições viram `3N` (sonda 1: 5 organizações → **15**
requisições), sem jitter, sem teto de concorrência e sem circuit breaker. O erro que está sendo
retentado é justamente o que a API usa para dizer "você está mandando demais" — retentar em massa
prolonga a janela em que a API rejeita, e é essa janela que produz CR4-01.

O agravante que nenhum plano olhou: **`getStaleDeals` também é o caminho de leitura da UI.**
`routes/deals.js` (`/api/deals/stale`), `routes/reports.js` e `runCheckOnly` chamam a mesma
função, e `DealsList.jsx` tem auto-refresh. Cada refresh do painel com a API rate-limitada passou
a custar `3N` requisições e ~15 s de espera dentro do handler HTTP.

**Fix:** limitar a concorrência e o custo da retentativa nesta borda específica — a única cujo
fan-out é proporcional ao volume de dados:

```js
// backend/src/agendor.js — na fase de categorias de getStaleDeals
const LOTE_DE_ORGS = 10; // mesmo espírito do batchSize de /deals
const categoriaPorOrg = new Map();
for (let i = 0; i < uniqueOrgIds.length; i += LOTE_DE_ORGS) {
  const lote = uniqueOrgIds.slice(i, i + LOTE_DE_ORGS);
  const pares = await Promise.all(
    lote.map(async (id) => [id, await getOrgCategory(id, cacheDaExecucao)]),
  );
  for (const [id, categoria] of pares) categoriaPorOrg.set(id, categoria);
}
```

O caso (2) de `agendor.cacheInvalidation.test.js` (uma consulta por organização única) continua
sendo o oráculo e não muda de valor. Acrescentar um caso que assere o **teto de concorrência**
(nº máximo de requisições a `/organizations` em voo simultaneamente) impede que a próxima
"otimização" desfaça o lote.

---

#### WR4-05 [WARNING]: `getUsers` desreferencia `data.data` sem a guarda que as duas paginações irmãs usam — uma resposta 200 sem `data` aborta a rodada inteira

**Origem:** vizinho não olhado nos dois planos que mexeram nesta função (04-22 e 04-25).
**File:** `backend/src/agendor.js:43` — comparar com `:403` (`getDealsWithFutureTasks`) e `:270`
(`getStaleDeals`)

**Issue:**
As três paginações do módulo tratam o payload de forma diferente:

```js
for (const user of data.data) { ... }                    // getUsers            (:43)
const tasks = data.data || [];                           // futureTasks         (:403)
const allRawDeals = [...(firstPage.data || [])];         // getStaleDeals       (:270)
```

`getUsers` é a única sem a guarda. Uma resposta bem formada no envelope mas sem a chave `data`
(ou com `data: null`) produz `TypeError: data.data is not iterable`, que **não é capturado em
lugar nenhum de `getUsers`** e sobe pelo `Promise.all` de `runCheck` — abortando a rodada antes
do laço de envio, com zero e-mails e zero linhas de log. É a mesma classe de falha que WR3-01
usou como argumento para levar `/users` ao retry ("uma rejeição ali aborta a rodada ANTES do laço
de envio"), pela porta ao lado.

A premissa de plausibilidade é a mesma que a fase já aceitou duas vezes (WR3-06: "a borda pode
passar a ignorar `page`"; WR3-01: "429 é provável justamente aqui"). Aplicada de forma
consistente, ela cobre "a borda pode devolver 200 com envelope diferente".

**Fix:**

```js
// backend/src/agendor.js — getUsers
for (const user of data.data || []) {
```

Cobrir em `agendor.paginacao.test.js`, que já é o oráculo desta função: um modo `'sem-data'` em
que `/users` responde `{ data: { links: {} } }` e o caso assere que `getUsers()` **resolve** com
um dicionário vazio em vez de rejeitar com `TypeError`.

---

#### WR4-06 [WARNING]: a prévia (`runCheckOnly`) promete notificar negócios que `runCheck` não vai notificar — e o botão do painel escreve esse número

**Origem:** o 04-20-SUMMARY declara a exclusão ("`runCheckOnly` … é superfície de visualização"),
mas a justificativa confunde a LISTA do painel com a PRÉVIA DO ENVIO.
**File:** `backend/src/scheduler.js:467-484`; consumidor
`backend/src/routes/notifications.js` (`POST /api/notifications/check`);
`frontend/src/components/Dashboard.jsx:245`

**Issue:**
`runCheckOnly` aplica **apenas** o filtro de tarefas futuras:

```js
return staleDeals
  .filter((deal) => !futureTasks.has(deal.id))
  .map((deal) => ({ ...deal, ownerEmail, authorEmail, alreadyNotifiedToday }));
```

Não aplica `deal.categoriaIndecidivel` (04-20) nem `shouldNotifyOwner` (funil Beefor,
pré-existente). Já `runCheck` aplica os dois. O consumidor não é uma tabela decorativa: é o botão
que o operador clica antes de enviar, e ele renderiza literalmente

```jsx
`Enviar notificações (${checkResult.total} negócios)`   // Dashboard.jsx:245
```

Ou seja, a UI promete `N` e o envio entrega `N − (indecidíveis + Beefor)`. O rótulo "superfície
de visualização" descreve corretamente `/api/deals/stale` e `/api/reports` — que **devem** manter
o negócio visível, conforme a decisão do usuário — mas `/api/notifications/check` responde a outra
pergunta ("quem vai receber?"), e nela a resposta atual está errada.

Nada aqui exige mudar quem recebe; exige marcar quem não vai receber.

**Fix:** enriquecer a prévia sem removê-la (preserva a metade "permanece no painel" da decisão):

```js
// backend/src/scheduler.js — runCheckOnly
.map((deal) => ({
  ...deal,
  ownerEmail: users[deal.ownerId]?.email || null,
  authorEmail: users[deal.authorId]?.email || null,
  alreadyNotifiedToday: alreadyNotifiedToday(deal.id),
  // MESMA decisão que runCheck toma — não uma segunda cópia da regra
  seraNotificado:
    !deal.categoriaIndecidivel &&
    shouldNotifyOwner(deal) &&
    !alreadyNotifiedToday(deal.id),
}))
```

e o botão passar a contar `deals.filter((d) => d.seraNotificado).length`. Cobrir com um caso em
`scheduler.categoriaIndecidivel.test.js` que chame `runCheckOnly()` com a mesma armação do
cenário A e assere que o negócio indecidível vem com `seraNotificado === false` — hoje não existe
nenhum caso sobre `runCheckOnly` em toda a suíte.

---

#### WR4-07 [WARNING]: `ownerWeeklyHtml` desreferencia `ownerName` sem guarda — um responsável sem nome derruba TODOS os relatórios individuais de sexta-feira

**File:** `backend/src/emailer.js:609` (`ownerName.split(' ')[0]`), alimentado por `:819`
(`byOwner[owner.email] = { name: d.ownerName, deals: [] }`) e por
`backend/src/agendor.js:369` (`ownerName: deal.owner?.name || null`)

**Issue:**
`getStaleDeals` produz explicitamente `ownerName: null` quando o payload traz `owner` sem `name`.
Esse `null` atravessa `sendOwnerWeeklySummary` intacto — o agrupamento usa `users[d.ownerId].email`
para decidir quem recebe, mas guarda `d.ownerName` como rótulo — e chega a
`ownerName.split(' ')[0]`, que lança `TypeError`.

O custo não é um e-mail perdido: `ownerWeeklyHtml` é chamada **dentro do `for` de destinatários**,
antes do `try/catch` do `sendMail`, então a exceção sai de `sendOwnerWeeklySummary`, sobe até o
`catch` de `runWeeklySummary` (`scheduler.js:421-423`) e **encerra o resumo semanal inteiro** —
todos os comerciais da lista, inclusive os que já teriam recebido, ficam sem relatório. O único
vestígio é `logger.error('[Scheduler] Erro no resumo semanal:', err.message)`.

Note a assimetria que confirma que é descuido e não decisão: a rota de teste
`routes/notifications.js` (`/test-owner-summary`) já protege o mesmo campo com
`ownerName || d.ownerName || 'Comercial Teste'`. O caminho de produção não.

**Fix:**

```js
// backend/src/emailer.js — ownerWeeklyHtml
const firstName = (ownerName || 'Colega').split(' ')[0];
```

e, no agrupamento, preferir o nome do usuário resolvido ao do negócio:
`{ name: d.ownerName || users[d.ownerId]?.name || 'Responsável', deals: [] }`. Cobrir em
`emailer.resumoIndecidivel.test.js` (que já chama `sendOwnerWeeklySummary` diretamente com
objetos sintéticos, sem banco nem axios) com um negócio de `ownerName: null` asserindo que o
envio acontece e que o HTML não contém `undefined`.

---

### Info

#### IN4-01: o comentário do laço de páginas diz "batches de 10" e o código usa 5

**File:** `backend/src/agendor.js:269` vs `:275`
**Issue:** `// Busca todas as páginas restantes em paralelo (batches de 10)` seguido de
`const batchSize = 5;`. Divergência pré-existente, mas o bloco foi lido e citado por 04-25 sem
correção. Quem calcular pior caso de tempo a partir do comentário erra por 2×.
**Fix:** trocar o número no comentário, ou remover o número e dizer "em lotes (ver `batchSize`)".

#### IN4-02: a justificativa de manter a guarda de id FORA do callback do retry descreve um mecanismo que não existe

**File:** `backend/src/agendor.js:228-231`; repetido em
`backend/test/agendor.retry429.test.js:341-344`
**Issue:** o comentário afirma que mover a guarda para dentro do callback *"faria um id hostil
sair **três vezes** pela instância compartilhada"*. Não faria: `fetchWithRetry` invoca `fn()`
dentro do `try`, um `throw` síncrono ali não tem `err.response`, logo não entra no ramo de 429 e
é relançado na **primeira** iteração — e, além disso, a guarda lançaria **antes** do `api.get`,
emitindo **zero** requisições. A asserção `chamadasDealById === 0` continua correta e útil; só o
"porquê" está errado, e um leitor que o confira conclui que o retry tem um comportamento que ele
não tem.
**Fix:** reescrever para o motivo verdadeiro (validar antes de entrar na política de retry mantém
a guarda independente de qualquer mudança futura no helper), ou remover a quantificação.

#### IN4-03: asserção decorativa em `agendor.categoriaIndecidivel.test.js` — nunca pode ficar vermelha

**File:** `backend/test/agendor.categoriaIndecidivel.test.js:265`
**Issue:** `assert.equal(consultasPorOrg.NaN, undefined)` pretende provar que nenhuma requisição
saiu para `/organizations/undefined`. Mas `getStaleDeals` monta `uniqueOrgIds` com
`.filter(Boolean)` (`agendor.js:294-296`), então uma organização ausente nunca chega a
`getOrgCategory`. A asserção é verdadeira por construção do SUT e permaneceria verde mesmo se a
guarda `!orgId` de `getOrgCategory` fosse removida.
**Fix:** ou chamar a função com o caminho realmente sob teste, ou trocar por uma asserção sobre o
total de consultas do caso (`Object.keys(consultasPorOrg).length === ORGS_ESPERADAS.length`).

#### IN4-04: o mesmo campo `success` é lido com truthiness num ramo e com igualdade estrita no outro, a 60 linhas de distância

**File:** `backend/src/scheduler.js:216-217` (`r.success`) vs `:281` (`r.success === true`)
**Issue:** o 04-24 endureceu a leitura do canal parcial para `r && r.success === true` e escreveu
por extenso por que a comparação é estrita. O ramo de retorno, que decide exatamente o mesmo
(`houveEnvioConfirmado`), continua com `emailResults.some((r) => r.success)`. Hoje é inofensivo —
o produtor é `sendMailWithRetry`, que sempre grava booleano — mas as duas leituras vão divergir se
alguém mudar o produtor, e é a mesma variável que decide `'sent'` vs `'error'`.
**Fix:** uniformizar o ramo de retorno para `r && r.success === true` e apontar, no comentário do
04-24, que a regra vale nos dois ramos.

#### IN4-05: o literal `100` de `/tasks` é a vez de `per_page` e a vez do critério de parada

**File:** `backend/src/agendor.js:400` (`per_page: 100`) vs `:413` (`if (tasks.length < 100) break;`)
**Issue:** dois usos do mesmo número sem constante comum. Trocar `per_page` para 50 sem mexer no
`break` transforma toda página cheia em "última página" e devolve um Set **parcial** — que é
exatamente o desfecho que a Decisão Q2 recusa, e silenciosamente (o contrato "completo ou falha"
não seria violado por exceção nenhuma).
**Fix:** `const TASKS_PER_PAGE = 100;` usado nos dois pontos.

#### IN4-06: o teto de `/tasks` é um limiar fail-closed sobre um volume que cresce com o uso, e nada mediu o volume atual

**File:** `backend/src/agendor.js:33` (`MAX_PAGES = 200`), `:442-446`
**Issue:** o comentário diz *"20.000 por borda, ordens de magnitude acima do uso real"*, mas o
04-25-SUMMARY não registra nenhuma medição do número atual de tarefas abertas com prazo futuro.
Se o volume alcançar 20.000, o teto passa a **abortar a rodada diária** — zero notificações — e o
sintoma (`results.error` com "excedeu 200 páginas") é indistinguível, para o operador, de uma
falha de borda. O teto é a decisão certa; o que falta é o número que a sustenta.
**Fix:** registrar a medição atual (`getDealsWithFutureTasks` já loga `dealIds.size`) e, se a
margem for menor que uma ordem de magnitude, emitir `logger.warn` ao ultrapassar metade do teto,
para que o limite avise antes de doer.

---

_Reviewed: 2026-08-05T07:20:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard — rodada 4 (gap closure r3: planos 04-19 a 04-27)_
_Suíte executada: 172/172 verdes; `npm run lint` exit 0 (44 warnings, baseline)_
_Provas empíricas: 2, ambas reproduzidas fora da árvore do repositório_
