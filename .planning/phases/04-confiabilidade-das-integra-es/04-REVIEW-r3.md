---
phase: 04-confiabilidade-das-integra-es
reviewed: 2026-08-05T04:05:00Z
depth: standard
round: 3
files_reviewed: 16
files_reviewed_list:
  - backend/src/agendor.js
  - backend/src/config.js
  - backend/src/emailer.js
  - backend/src/routes/deals.js
  - backend/src/scheduler.js
  - backend/test/agendor.cacheConcurrency.test.js
  - backend/test/agendor.cacheInvalidation.test.js
  - backend/test/agendor.retry429.test.js
  - backend/test/deals.errorLog.test.js
  - backend/test/emailer.transporteVivo.test.js
  - backend/test/fakeTimers.helper.test.js
  - backend/test/helpers/fakeTimers.js
  - backend/test/notificationStatus.canalParcial.test.js
  - backend/test/notificationStatus.partialFailure.test.js
  - backend/test/notificationStatus.registroResiliente.test.js
  - backend/test/scheduler.resilience.test.js
findings:
  critical: 1
  warning: 7
  info: 8
  total: 16
status: issues_found
---

# Fase 04 — Code Review, Rodada 3 (gap closure r2: planos 04-12 a 04-18)

**Reviewed:** 2026-08-05T04:05:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Revisão adversarial dos 7 planos de gap closure da rodada 2 (04-12 a 04-18) e do código novo
pelo seu próprio mérito. Estado do ambiente confirmado: `node --test` sob Node 22.13.1 (o wrapper
do projeto) → **148/148 verdes**; `npm run lint` → exit 0 com 44 warnings (baseline). Quatro
provas empíricas deste relatório foram reproduzidas **fora da árvore do repositório**
(scratchpad), sem tocar em nenhum arquivo do projeto.

O método desta rodada é o que a rodada 2 estabeleceu: para cada achado dado como fechado,
**não aceitar o SUMMARY como prova** e perguntar se o cenário vizinho — aquele que o comentário
novo declara coberto — continua aberto. O resultado é o mesmo padrão pela terceira vez: os sete
consertos funcionam **no cenário que o teste novo exercita**, e quatro deles deixam aberto o
cenário imediatamente adjacente, com um comentário de produção afirmando cobertura maior do que
o código entrega.

Balanço da verificação (tabela detalhada abaixo):

- **Fechados de fato:** WR2-01, WR2-06 (nos 5 arquivos de produção).
- **Fechados com o vizinho aberto:** CR2-01 → **CR3-01**; WR2-02 → **WR3-02**; WR2-04 →
  **WR3-03**; WR2-03 → **WR3-05**; WR2-05 → **IN3-07**.

O achado bloqueante desta rodada não é um dos vizinhos "de forma", e sim o que a própria fase
deixou de perguntar: **a exclusão por categoria é o ÚNICO filtro de elegibilidade que depende de
uma segunda chamada HTTP, e ela falha ABERTA.** Um 429 transitório em `/organizations/:id` — a
única borda Agendor que não passa pela política de retry criada em WR-02 e cujo erro é engolido —
faz uma organização `'Parceiro'` (categoria excluída) **receber e-mail de verdade**, com a rodada
reportando sucesso. Reproduzido: `results.error: undefined`, `results.notified: 1`, e-mail
entregue. Isso é exatamente a invariante do Core Value do milestone ("quem recebe / quem não
recebe"), e o CR2-01 do 04-12 **aumentou a frequência de exposição** ao trocar a memoização de
processo por cache por execução, sem que nenhum plano pesasse esse lado do trade-off.

Achados já registrados como decisão humana ou como todo pendente (SEC-01 do token; C10 da linha
`'pending'` retentável; IN-01 a IN-04; IN2-01 a IN2-04; CR-02b; REL-02b; REL-05b) **não** são
reportados de novo — apenas referenciados quando um achado novo os encosta. Warnings do baseline
Biome e o `console.*` legado de `agendor.js`/`emailer.js` foram ignorados conforme CLAUDE.md.
Nenhum valor de segredo é exibido em lugar algum deste relatório.

> Nenhum bloco `<structural_findings>` foi fornecido nesta rodada — não há seção de substrato
> estrutural a preservar.

---

## Verificação cética das conclusões da rodada 2

| r2 | Veredito | Evidência (lida no código, não no SUMMARY) |
|----|----------|---------------------------------------------|
| **CR2-01** | **Fechado estruturalmente; vizinho novo aberto** | O dicionário de módulo desapareceu de fato: `getOrgCategory(orgId, cache)` (`agendor.js:55-67`) só toca o `Map` recebido, `getStaleDeals` o cria em `:245` e a função **não é exportada** (`:348-356`), então não há segundo chamador possível. `agendor.cacheConcurrency.test.js` cobre as duas direções do entrelaçamento e o cenário espelho prova o MECANISMO (`consultas205NoEspelho === 2`), não só o desfecho. **Mas** a mudança tornou o refetch de categoria obrigatório em TODA execução, e essa borda é a única sem retry e com erro engolido → **CR3-01**. |
| **WR2-01** | **Fechado** | `results.notified++` existe nos dois ramos (`scheduler.js:184` e `:262`) e o cenário A pina `r.notified === 1` **e** `r.deals[0].notified === false` com pré-condições reais (`enviosConfirmados === 1`, `transportesCriados === 2`). Vizinho verificado e **são**: se `updateNotificationStatus` do ramo de retorno (`:179`) lançar, o `catch` externo redecide o status e incrementa **exatamente uma vez** (a linha `:184` não chega a executar) — tracei os dois caminhos, não há dupla contagem. |
| **WR2-02** | **Fechado só para a GRAVAÇÃO** | O `try/catch (erroDeRegistro)` de `:235-246` funciona e está pinado por `registroResiliente`. **Mas** a *leitura* de dedup `alreadyNotifiedToday(deal.id)` (`:93`) usa a MESMA conexão e está **fora de qualquer `try` do laço**: se ela falhar, a rodada morre no primeiro deal → **WR3-02** (reproduzido). O checkpoint C10 aprovou "linha `pending` + reenvio amanhã", não "rodada inteira abortada". |
| **WR2-03** | **Fechado no helper compartilhado** | `helpers/fakeTimers.js:48-55` trata os dois ramos, `:66` relança o erro REAL e `encerrada` nunca fica órfã. O desvio de ordem é correto e o caso (3) do meta-teste é guarda-corpo legítimo (`nuncaAssenta` + `assert.rejects`). **Mas** a cópia defeituosa sobreviveu em `emailer.timeout.test.js:98-113`, cuja justificativa expirou no 04-17 → **WR3-05**. |
| **WR2-04** | **Fechado só para o TIPO DO CONTÊINER** | `Array.isArray(err?.resultadosParciais)` (`scheduler.js:214-216`) fecha o caso da string, pinado pelo cenário E com um erro congelado de verdade. **Mas** a validação é rasa: `[null]` passa pelo `Array.isArray` e `parciais.some((r) => r.success)` lança **dentro do próprio `catch`** → mesmo desfecho que WR2-04 existia para impedir → **WR3-03** (reproduzido). O comentário de `emailer.js:268-278` afirma que "ausência e corrupção passam a ser lidas do mesmo jeito"; corrupção de ELEMENTO não. |
| **WR2-05** | **Fechado dentro de UM deal** | `sendMailWithRetry` devolve `transporteEmUso` (`:211`, `:229-233`), o chamador o adota (`:301`, `:324`) e a desestruturação com rest impede o vazamento para `results` — pinado pelos casos (1), (2) e (3) de `emailer.transporteVivo.test.js`, com contagens exatas. **Mas** `sendStaleNotification` cria um transporte novo por DEAL (`emailer.js:239`), então o ganho não atravessa os deals da mesma rodada de cron → **IN3-07**. |
| **WR2-06** | **Fechado nos 5 arquivos de produção** | `grep -nE "\.js:[0-9]|linhas? [0-9]"` nos comentários de `agendor.js`, `emailer.js`, `scheduler.js`, `routes/deals.js` e `config.js` → **0 ocorrências**. Residual de 48 linhas em 10 arquivos de teste + 2 strings em `scheduler.resilience.test.js` está medido e declarado no `04-18-SUMMARY.md` → **IN3-06** (discordância parcial, registrada abaixo). |

---

## Avaliação dos desvios deliberados declarados

1. **`houveEnvioConfirmado` testado em duas construções seguidas (04-15).** *Mitigação suficiente.*
   Tracei os dois lados: o cenário A de `partialFailure` pina o ramo **verdadeiro** (status `'sent'`
   **e** `r.notified === 1`); o cenário E de `canalParcial` pina o ramo **falso** (status `'error'`
   **e** `r.notified === 1`, vindo só do segundo deal). Fazer as duas construções divergirem em
   qualquer direção deixa um dos dois vermelho. A única fragilidade é de *dependência não
   declarada*: o comentário de `scheduler.js:255-261` cita apenas `partialFailure` como oráculo,
   mas quem protege o ramo falso é `canalParcial`. Vale acrescentar a segunda âncora ao comentário.
2. **Ordem da falha explícita em `avancarRelogioAte` (04-13).** *Concordo com o desvio.* A ordem do
   snippet da rodada 2 travaria a suíte quando a promessa nunca assenta, e uma `encerrada` pendente
   para sempre é inofensiva porque tem handler de rejeição anexado. O caso (3) do meta-teste prova
   isso diretamente. Sem ressalvas.
3. **Cópia local defeituosa em `emailer.timeout.test.js` (motivo expirado).** *Registro como risco,
   com honestidade sobre o grau:* **não é risco ativo hoje** — nenhum dos 8 casos daquele arquivo
   exercita o caminho de rejeição (`sendStaleNotification` RESOLVE na exaustão, por D-03), então a
   rejeição órfã não tem como nascer. É risco **latente e barato de remover**, e o custo de mantê-lo
   passou a ser zero-benefício desde o 04-17. Ver **WR3-05**.
4. **Duas referências por linha em strings de `scheduler.resilience.test.js`.** *Discordo em parte.*
   O argumento "string é código, editar quebra a pureza do diff" vale para o **nome do caso** (que é
   citado no `04-RESEARCH.md`). Não vale para a **mensagem de asserção** da linha 247: mensagem não
   é oráculo, e o `:27` já nasceu errado (o guard está na linha 28). Ver **IN3-06**.
5. **C10 — linha `'pending'` retentável quando a gravação falha.** Aceito como trade-off aprovado;
   **não** reportado. Registro apenas que **WR3-02 não está coberto por C10**: lá o desfecho não é
   "reenvio no pior caso", é "os deals restantes da rodada nem são processados".
6. **SEC-01.** Não reportado; nenhum valor de token aparece neste relatório.

---

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR3-01 [BLOCKER]: a exclusão por categoria falha ABERTA — um 429 em `/organizations` faz uma organização `'Parceiro'` ser notificada, e a rodada reporta sucesso

**Origem:** comportamento pré-existente cuja **frequência de exposição foi multiplicada** por
REL-04/CR2-01 (04-07 e 04-12); nunca avaliado como risco em nenhum plano da fase.
**File:** `backend/src/agendor.js:55-67` (o `catch` que engole), `:245-253` (a única borda sem
`fetchWithRetry`), `:263` (a decisão de exclusão) — e `backend/test/agendor.cacheInvalidation.test.js:154-178`, que **ratifica** o comportamento em vez de sinalizá-lo.

**Issue:**
Dos cinco filtros de elegibilidade de `getStaleDeals`, quatro decidem a partir do payload do
próprio deal (data, dono, `dealStatus`, etapa) e **não podem falhar**. Só um depende de uma
segunda chamada HTTP: a categoria da organização (`EXCLUDED_CATEGORIES`, `:98-102`). E esse único
filtro falível falha **na direção insegura**:

```js
} catch {
  cache.set(orgId, null);   // agendor.js:63-65
  return null;
}
// ...
if (EXCLUDED_CATEGORIES.includes(orgCategory)) continue;   // :263 — includes(null) === false
```

Três fatos se combinam, e nenhum plano os olhou juntos:

1. `/organizations/:id` é a **única** borda Agendor que não passa por `fetchWithRetry`
   (`/deals` passa em `:177`, `/tasks` em `:305`). Um HTTP 429 — o erro que a API usa para dizer
   "tente de novo" — não é retentado aqui, nem uma vez.
2. O erro é **engolido** e o resultado vira `null`, que não está em `EXCLUDED_CATEGORIES`.
3. `runCheck` dispara `getStaleDeals` (uma chamada **por organização única**), `getUsers` e
   `getDealsWithFutureTasks` no MESMO `Promise.all` (`scheduler.js:55-59`) — o argumento de
   probabilidade de 429 que a própria fase usou para justificar WR-02 vale aqui com mais força,
   porque este é o ponto que faz N requisições, não uma.

Reproduzido deterministicamente (deal 105, organização 205 = `'Parceiro'`, um único 429 na
consulta de categoria):

```
consultas a /organizations: 1 (sem retry de 429)
results.error          : undefined
e-mails enviados para  : [ 'dono@exemplo.invalid' ]
results.notified       : 1
CONFIRMADO: organizacao "Parceiro" (categoria excluida) NOTIFICADA por causa de um 429
```

A rodada **não falhou em nada**: `results.error` é `undefined`, o log de conclusão diz
"1 notificações enviadas", a UI mostra ✅ e o `notification_log` grava `'sent'`. É a pior forma da
pior classe de falha do milestone — notificação indevida, **silenciosa**, sem vestígio nenhum.
Efeito colateral do mesmo `null`: `getDealType(null)` devolve `'Lead'` (`:144`), então o card
afetado ainda é rotulado errado no e-mail e nos relatórios.

Por que isto piorou nesta fase: antes de REL-04 a categoria era memoizada pelo tempo de vida do
processo — uma consulta bem-sucedida protegia todas as rodadas seguintes, e a janela de exposição
era o primeiro encontro com cada organização. Depois de REL-04 (e mantido pelo cache por execução
do 04-12), **toda rodada reconsulta todas as organizações**, então toda rodada está exposta. O
04-12 comprou isolamento entre execuções — que era correto e necessário — e pagou com frequência
de exposição ao fail-open, sem que o preço fosse nomeado em nenhum lugar.

E a rede de testes **documenta o fail-open como se fosse contrato**:
`agendor.cacheInvalidation.test.js:163-164` assere `idsComFalha.includes(305) === true` com o
comentário "Isto documenta o comportamento ATUAL do caminho de erro". Existe, portanto, uma
asserção que ficaria **vermelha** se alguém consertasse o defeito — o oposto do que a rede de
testes do Core Value deveria fazer.

**Fix:** a categoria é um insumo da decisão de **quem NÃO recebe**, e a fase já tem precedente
para esse caso: a Decisão Q2 de REL-06 (`getDealsWithFutureTasks`, `agendor.js:322-337`) escolheu
"Set completo ou falha explícita" exatamente porque proteção parcial notifica indevidamente. A
mesma regra aplicada aqui:

```js
// backend/src/agendor.js — a borda de categorias entra na política ÚNICA de retry...
async function getOrgCategory(orgId, cache) {
  if (!orgId) return null;
  if (cache.has(orgId)) return cache.get(orgId);
  const { data } = await fetchWithRetry(() => api.get(`/organizations/${orgId}`));
  const category = data.data?.category?.name || null;
  cache.set(orgId, category);
  return category;
}
```

...e a exaustão **propaga**, abortando a rodada com `results.error` (mesmo contrato de
`getDealsWithFutureTasks`, mesmo fail-safe: a rodada de amanhã retenta, ninguém recebe indevidamente).

Se abortar a rodada inteira por uma organização for considerado caro demais, a alternativa mínima
é marcar o deal como **indecidível** e excluí-lo do envio (mantendo-o no dashboard/relatório),
com `logger.warn` nomeando a organização — o que preserva o fail-safe sem custar a rodada:

```js
const categoria = categoriaPorOrg.get(deal.organization?.id);
if (categoria === CATEGORIA_INDECIDIVEL) continue;  // não notifica o que não sabemos classificar
```

Em qualquer das duas rotas, o cenário (3) de `agendor.cacheInvalidation.test.js` precisa ser
**reescrito** para asserir o novo contrato (hoje ele exige o fail-open), e um caso novo deve pinar
"429 em `/organizations` → nenhum e-mail para a organização excluída", com contagem de tentativas.

---

### Warnings

#### WR3-01 [WARNING]: `/users` não passa pela "política ÚNICA de retry da borda" — um 429 transitório custa 24 horas de silêncio

**Origem:** vizinho não fechado de WR-02 (04-09). O comentário do conserto afirma cobertura total.
**File:** `backend/src/agendor.js:29-47` (`getUsers`), `:80-95` (`getDealById`), `:55-67`
(`getOrgCategory`) — comparar com o comentário de `:149-160` e o consumidor `scheduler.js:55-59`

**Issue:**
O bloco de `:149-160` abre com *"Política **ÚNICA** de retry da borda Agendor (WR-02)"* e explica
que duplicar a regra criaria "um segundo lugar para ela divergir". Na prática o helper é aplicado
a **duas** das cinco chamadas do módulo: `/deals` (`:177`) e `/tasks` (`:305`). `/users`,
`/organizations/:id` e `/deals/:id` continuam fora — não por decisão registrada, mas por omissão.

`/users` é o caso mais caro, porque está no mesmo `Promise.all` que `runCheck` usa como
pré-requisito de tudo: uma rejeição ali aborta a rodada **antes do laço de envio**. Reproduzido:

```
chamadas a /users      : 1
results.error          : Request failed with status code 429
deals processados      : 0
e-mails enviados       : 0
CONFIRMADO: um 429 em /users nao e retentado e mata a rodada inteira
```

O argumento é literalmente o mesmo que o `agendor.retry429.test.js` usa no seu próprio cabeçalho
para justificar o retry em `/tasks`: "como o cron é DIÁRIO, um 429 transitório … custa 24 HORAS SEM
NENHUMA NOTIFICAÇÃO, em silêncio". Nada nesse raciocínio é específico de `/tasks`.

**Fix:**

```js
// backend/src/agendor.js — getUsers
const { data } = await fetchWithRetry(() =>
  api.get('/users', { params: { page, per_page: 100 } }),
);
```

Mesma coisa em `getDealById` (`:93`). Para `/organizations` ver **CR3-01**, que tem requisito
adicional. Corrigir também o comentário de `:149-160` para listar quais bordas a política cobre —
enquanto ele disser "única", o próximo leitor não vai procurar as que faltam. Cobrir com um caso
espelho do (1) de `agendor.retry429.test.js`: 429 em `/users`, rodada **conclui**, `chamadasUsers === 2`.

---

#### WR3-02 [WARNING]: a leitura de dedup fica fora de todo `try` do laço — uma falha dela mata a rodada, que é o desfecho que WR2-02 fechou uma construção adiante

**Origem:** vizinho não fechado de WR2-02 (04-15).
**File:** `backend/src/scheduler.js:93` (comparar com a guarda de `:235-246`)

**Issue:**
O 04-15 protegeu a **gravação** do desfecho com `try/catch` próprio, argumentando (`:219-230`) que
"a conexão SQLite pode estar indisponível — é justamente uma das origens possíveis da exceção que
trouxe o fluxo até aqui — e `updateNotificationStatus` usa a MESMA conexão". O argumento está
correto e incompleto: **`alreadyNotifiedToday(deal.id)` (`:93`) usa a mesma conexão e é a PRIMEIRA
operação de banco do laço**, executada fora de qualquer `try` interno. Se ela lançar, a exceção
sobe direto ao `catch` externo (`:278`), aborta o `for` e deixa todos os deals restantes sem
processar — o desfecho exato que WR2-02 nomeia como "silêncio total num dia de notificar".

Reproduzido com o mesmo molde do mock de `registroResiliente` (falha só na 1ª leitura, dois deals
servidos):

```
leituras de dedup      : 1
results.error          : The database connection is not open
deals processados      : 0 (esperado 2)
e-mails enviados       : 0 (esperado 2)
CONFIRMADO: a rodada morre no 1o deal — o 2o nunca e notificado
```

Isto **não** está coberto pelo checkpoint C10: lá o usuário aprovou "linha `'pending'`, retentável
amanhã" para a falha de gravação de UM deal. Aqui o custo é a rodada inteira.

**Fix:** ler a dedup com o mesmo fail-safe declarado do resto do laço — uma falha de leitura deve
significar "não sei se já notifiquei", e a escolha do milestone entre reenvio e silêncio já está
registrada (C10): reenviar.

```js
// backend/src/scheduler.js — no lugar de `if (alreadyNotifiedToday(deal.id)) {`
let jaNotificadoHoje = false;
try {
  jaNotificadoHoje = alreadyNotifiedToday(deal.id);
} catch (erroDeDedup) {
  // Mesma conexão, mesma origem de falha da gravação do desfecho (WR2-02). Não saber
  // se já notificamos é "não deduplica": reenvio no pior caso contra silêncio (C10).
  logger.error('[Scheduler] Falha ao consultar a dedup do dia:', erroDeDedup.message);
}
if (jaNotificadoHoje) { /* ... */ }
```

Cobrir estendendo `notificationStatus.registroResiliente.test.js` com um cenário gêmeo: mock de
`alreadyNotifiedToday` que lança na 1ª chamada, asserindo `r.deals.length === 2` e que o segundo
deal foi notificado de verdade.

---

#### WR3-03 [WARNING]: o endurecimento do canal parcial valida o contêiner, não os elementos — `[null]` reabre a rodada abortada

**Origem:** vizinho não fechado de WR2-04 (04-16).
**File:** `backend/src/scheduler.js:214-217`; comentário que afirma mais do que entrega em
`backend/src/emailer.js:268-278` e `backend/src/scheduler.js:198-213`

**Issue:**
A guarda nova é `Array.isArray(err?.resultadosParciais) ? … : []`, seguida de
`parciais.some((r) => r.success)`. `Array.isArray` protege contra o valor **não-array** (a string
do cenário E) e contra nada mais: um array cujos elementos não sejam objetos — `[null]`,
`[undefined]` — passa pela guarda e faz o `.some` lançar **dentro do próprio `catch`**. A exceção
sobe ao `catch` externo, aborta o `for` e deixa os deals restantes sem processar. É o mesmo
desfecho, pela mesma porta, um nível mais fundo. Reproduzido com o molde exato do
`ERRO_CONGELADO` do cenário E, trocando a string por `[null]`:

```
Array.isArray(parciais): true
results.error          : Cannot read properties of null (reading 'success')
deals processados      : 0 (esperado 2)
e-mails enviados       : 0 (esperado 2, do 2o deal)
CONFIRMADO: o guard Array.isArray nao cobre elementos nao-objeto — a rodada morre
```

O comentário de `scheduler.js:198-207` afirma: *"Ausência e corrupção passam a ser lidas do mesmo
jeito: 'nada confirmado', com desfecho fail-safe"*. Meia corrupção, na verdade. E a premissa do
próprio cenário E — um erro **congelado de biblioteca** carregando uma propriedade homônima
pré-existente "de qualquer tipo" — não dá nenhuma razão para supor que esse tipo seria
preferencialmente string e não array.

O mesmo tipo de fragilidade está uma linha adiante: `logger.error(..., erroDeRegistro.message)`
(`:242-245`) desreferencia sem guarda o que o `catch` de gravação capturar. `better-sqlite3` lança
`Error`, então é menos alcançável, mas é o mesmo padrão dentro do bloco que existe para ser
inquebrável.

**Fix:** validar o que é lido, não só o contêiner — é uma expressão:

```js
// backend/src/scheduler.js
const parciais = Array.isArray(err?.resultadosParciais) ? err.resultadosParciais : [];
if (parciais.some((r) => r && r.success === true)) houveEnvioConfirmado = true;
```

`r && r.success === true` lê elemento corrompido como "não confirmado" — o mesmo desfecho
fail-safe já escolhido para o contêiner corrompido, agora consistente. Acrescentar ao
`notificationStatus.canalParcial.test.js` um cenário F com `resultadosParciais: [null]` no erro
congelado, asserindo os mesmos invariantes do cenário E (rodada continua, 2 deals processados).
E ajustar os dois blocos de comentário para dizer o que a guarda cobre.

---

#### WR3-04 [WARNING]: os dois arquivos de teste criados nesta rodada replicaram o defeito de relógio já registrado como todo pendente

**Origem:** código novo desta rodada (04-15 e 04-16), replicando o padrão de `in2-02`.
**File:** `backend/test/notificationStatus.registroResiliente.test.js:178-183` e
`backend/test/notificationStatus.canalParcial.test.js:197-202` (comparar com
`backend/test/agendor.retry429.test.js:138-146`)

**Issue:**
O todo `in2-02-relogio-falso-em-before` registra que `notificationStatus.partialFailure.test.js`
habilita o relógio falso em `before` em vez de `beforeEach`, e que cada `mock.timers.tick(10000)`
de `avancarRelogioAte` deixa o relógio adiantado para o caso seguinte (até 20 ticks = **200 s** por
chamada). Os dois arquivos criados **depois** desse achado copiaram o `before` em vez do
`beforeEach` corrigido que `agendor.retry429.test.js` já carregava desde o 04-11 — o mesmo arquivo
que descobriu o problema e documentou a solução em 8 linhas de comentário.

A margem é estreita e mensurável: a fixture `deals-page.json` foi construída com deals de
fronteira em **0 ms** (deal 102, `updatedAt === cutoff`) e **+1 ms** (deal 104) do corte de 15
dias. Hoje esses deals não são servidos por esses arquivos (só clones do 101), o que é a única
razão de estarem verdes. Basta alguém servir a fixture completa — o padrão dos outros arquivos —
para o vermelho aparecer no caso errado, atribuído ao ator errado. Numa suíte que existe para ser
o oráculo da elegibilidade, é o mesmo custo que WR2-03 nomeou.

**Fix:** uma linha em cada arquivo, copiada do `agendor.retry429.test.js`:

```js
beforeEach(() => {
  mock.timers.reset();   // enable() lança se os timers já estiverem habilitados
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: FIXED_NOW });
  // ... resets já existentes
});
```

Aplicar também ao `partialFailure` fecha `in2-02` de graça, já que a mudança é idêntica nos três.

---

#### WR3-05 [WARNING]: a cópia defeituosa de `avancarRelogioAte` continua na suíte com a justificativa expirada

**Origem:** débito declarado do 04-13, com prazo vencido no 04-17 (registrado nos dois SUMMARYs).
**File:** `backend/test/emailer.timeout.test.js:98-113` (comparar com
`backend/test/helpers/fakeTimers.js:46-68`)

**Issue:**
A cópia local mantém exatamente o defeito que WR2-03 mediu: `promessa.then(valor => …)` com **um**
argumento, sem handler de rejeição. Quando a promessa observada rejeita, `concluida` nunca vira
verdadeira, o laço estoura, a função lança a mensagem genérica e a promessa derivada aflora como
`unhandledRejection` — que o `node:test` credita ao caso que estiver correndo no momento.

Sendo honesto sobre o grau: **hoje o risco é latente, não ativo.** Verifiquei os 8 casos daquele
arquivo — nenhum exercita o caminho de rejeição, porque `sendStaleNotification` resolve na
exaustão (D-03). A rejeição órfã não tem como nascer com os casos atuais.

O que faz disto um achado é a assimetria de custo. A razão de manter a cópia era não trocar o
instrumento e o objeto medido na mesma rodada — motivo legítimo, e **extinto** desde que o 04-17
terminou de mexer no `emailer.js`. O que resta é um instrumento sabidamente defeituoso guardado na
rede de testes do Core Value, esperando o primeiro caso que faça `createTransporter` lançar (o que
os arquivos vizinhos `partialFailure` e `canalParcial` fazem rotineiramente) para produzir um
vermelho atribuído ao caso errado.

**Fix:** substituir as 16 linhas da cópia por `const { avancarRelogioAte } = require('./helpers/fakeTimers');`
e rodar a suíte. O contrato observável é o mesmo no ramo de sucesso (único exercitado hoje), então
a mudança é de instrumento puro — e o meta-teste `fakeTimers.helper.test.js` já cobre o helper
compartilhado nos três ramos.

---

#### WR3-06 [WARNING]: as duas paginações sem teto podem prender `isRunning` para sempre — o sistema para de notificar em silêncio, permanentemente

**Origem:** pré-existente, em arquivo sob revisão; não avaliado por nenhum plano da fase apesar de
a fase inteira ter sido escrita em torno desse modo de falha.
**File:** `backend/src/agendor.js:32-45` (`getUsers`) e `:303-342` (`getDealsWithFutureTasks`) —
comparar com `getStaleDeals`, `:194-213`

**Issue:**
`getStaleDeals` deriva o número de páginas de `meta.totalCount` (`:195-196`) e é, portanto,
**limitada por construção**. As outras duas paginam por condição de parada vinda da resposta:

```js
while (true) { ... if (!data.links?.next) break; page++; }   // getUsers
while (true) { ... if (tasks.length < 100) break; page++; }  // getDealsWithFutureTasks
```

Se a API passar a ignorar o parâmetro `page` (regressão de borda plenamente plausível numa API de
terceiros), as duas condições nunca são satisfeitas e o laço não termina. Em `getUsers` o
dicionário `users` também cresce sem limite. E como o laço vive dentro do `try` de `runCheck`, o
`finally` que libera `isRunning` (`:281-284`) **nunca executa**: toda execução seguinte cai no
guard `if (isRunning)` e devolve `{ skipped: true }` — para sempre, até reiniciar o processo.

É precisamente o modo de falha que o cabeçalho do `scheduler.resilience.test.js` declara como o
pior daqui: *"Se o lock vazasse, o guard `if (isRunning)` recusaria TODA execução seguinte e o
sistema pararia de notificar EM SILÊNCIO"*. Aquele arquivo cobre o vazamento por **exceção**; o
vazamento por **não-terminação** não tem cobertura nem teto.

**Fix:** teto de páginas nas duas, com falha explícita ao estourá-lo (o contrato de
`getDealsWithFutureTasks` já é "completo ou falha", então propagar é coerente):

```js
const MAX_PAGES = 200;   // 20.000 registros — ordens de magnitude acima do uso real
let page = 1;
while (page <= MAX_PAGES) { /* ... */ }
if (page > MAX_PAGES) {
  throw new Error(`[Agendor] paginação excedeu ${MAX_PAGES} páginas — a borda pode estar ignorando o parâmetro page`);
}
```

Cobrir com um caso por função: o stub responde sempre "há mais páginas", e o teste assere que a
chamada **rejeita** em vez de nunca resolver (e que `getStatus().isRunning` volta a `false`).

---

#### WR3-07 [WARNING]: fixtures de teste mutam estado global de módulo sem restauração garantida — um vermelho cascateia em vermelhos atribuídos ao ator errado

**Origem:** código novo desta rodada (04-12) e padrão herdado (04-07).
**File:** `backend/test/agendor.cacheConcurrency.test.js:267-340` (restauração em `:339`);
`backend/test/agendor.cacheInvalidation.test.js:154-178` (restauração em `:177`) e `:180-202`
(`delete` em `:201`)

**Issue:**
Os dois arquivos ramificam por variáveis mutáveis de módulo lidas dentro do `routeHandler` — padrão
correto e deliberado, porque o stub não pode ser reinstalado depois do `require` de `agendor.js`.
O problema é onde a **restauração** mora: na última instrução do corpo do `test()`, no caminho
feliz. Qualquer asserção que falhe antes dela deixa o estado global sujo para os casos seguintes:

- `cacheConcurrency`: `cenarioAtivo = 'falha-tardia'` sobrevive, e o `routeHandler` inteiro passa a
  responder pelo cenário espelho.
- `cacheInvalidation`: `dealsServidos` continua com o deal sintético 305 e `orgQueFalha` pode
  continuar em `305`, de modo que o cenário (1) — cuja premissa é uma borda sã — roda contra uma
  borda que falha.

O dano não é o segundo vermelho; é que ele vem **com a mensagem de outro caso**, apontando para um
defeito de produção que não existe. É exatamente o custo que WR2-03 usou para justificar o conserto
do helper: *"um instrumento que atribui a falha ao ator errado corrói a confiança em toda a suíte"*.
O mesmo padrão aplicado ao instrumento, não ao helper.

**Fix:** restaurar em `try/finally` dentro do caso, ou — mais simples e uniforme — num
`afterEach`/`beforeEach` que reafirme o estado neutro, como os arquivos de `notificationStatus.*` já
fazem para `modoEnvio`/`modoRegistro`:

```js
beforeEach(() => {
  cenarioAtivo = 'limpeza-apaga-leitura';
  dealsServidos = dealsPage;
  orgQueFalha = null;
});
```

---

### Info

#### IN3-01: o ramo de exceção sobrescreve a coluna `error` só com a mensagem da exceção, descartando os erros por destinatário

**File:** `backend/src/scheduler.js:236-240` (comparar com `:179-183`)
**Issue:** o ramo de retorno agrega `errors.join('; ')`; o ramo de exceção grava apenas
`err.message`, embora `parciais` — já lido e validado duas linhas acima — carregue `{to, error}`
dos destinatários que falharam. Quando o parcial vira `'sent'`, essa coluna é o **único** vestígio
de quem não recebeu (é a premissa do todo `in2-04`), e ela perde justamente a identificação do
destinatário.
**Fix:** compor as duas fontes — `[err.message, ...parciais.filter(r => r && !r.success).map(r => `${r.to}: ${r.error}`)].join('; ')`.

#### IN3-02: `sendMailWithRetry` devolve `undefined` quando `retries <= 0`

**File:** `backend/src/emailer.js:207-236`
**Issue:** o irmão exato do todo `in2-01` (que só nomeia `fetchWithRetry`). Com `retries = 0` o
`for` não itera e a função cai no fim sem `return`; os dois call-sites desestruturam
(`const { transporteEmUso, ...resultado } = await sendMailWithRetry(...)`), então o sintoma seria um
`TypeError` de desestruturação que não aponta para a causa. Não alcançável hoje (nenhum chamador
passa o parâmetro), mas ele é público na assinatura.
**Fix:** mesma correção sugerida em `in2-01` — guarda no topo ou `do/while`. Vale fechar os dois
juntos, já que a causa é idêntica.

#### IN3-03: o `Map` por execução é somente-escrita — a memoização que o comentário descreve nunca acontece

**File:** `backend/src/agendor.js:245-253` e `:55-57`
**Issue:** `uniqueOrgIds` já é o resultado de um `new Set(...)`, então cada id é passado a
`getOrgCategory` **exatamente uma vez** e `cache.has(orgId)` é sempre `false`. O `Map` cumpre bem
o seu propósito real (ser o seam que eliminou o estado de módulo — CR2-01), mas o comentário de
`:49-54` ("memoizando no `cache` DA EXECUÇÃO") descreve um mecanismo de dedup que quem dedupa é o
`Set` de `:223-225`. Um leitor futuro pode "otimizar" o `Set` fora, confiando num cache que nunca
acerta.
**Fix:** ajustar o comentário para dizer que o `Map` existe para **escopo**, não para dedup, e que
a dedup mora no `Set` de `uniqueOrgIds`.

#### IN3-04: a convenção repo-wide de WR2-06 mora no topo de um módulo de domínio, fora de `CLAUDE.md`, e o gate não está no CI

**File:** `backend/src/agendor.js:1-2`
**Issue:** as duas linhas de convenção estão acima do primeiro `require` de `agendor.js` — um
módulo de cliente HTTP, que não é onde alguém procura uma regra de estilo do repositório. A seção
"Comments" do `CLAUDE.md` (o lugar canônico, e que o próprio agente lê antes de editar) não foi
atualizada, e o `grep` detector descrito no `04-18-SUMMARY.md` continua sendo um comando de SUMMARY,
não um step de `.github/workflows/ci.yml`. Uma convenção sem casa e sem gate volta a se degradar.
**Fix:** mover as duas linhas para a seção "Comments" do `CLAUDE.md` e acrescentar o `grep` como
step do CI (ele roda em menos de um segundo).

#### IN3-05: `stopTasks()` duplica o bloco de parada do topo de `scheduleTask()`

**File:** `backend/src/scheduler.js:354-362` e `:415-424`
**Issue:** oito linhas idênticas em dois lugares; se um terceiro temporizador for acrescentado, é o
tipo de duplicação que fica meio-atualizada e deixa um `cron` órfão rodando depois do
`graceful shutdown`.
**Fix:** `function scheduleTask() { stopTasks(); ... }`.

#### IN3-06: as duas referências `:27` de `scheduler.resilience.test.js` continuam erradas — e a da mensagem de asserção pode ser corrigida sem tocar em oráculo

**File:** `backend/test/scheduler.resilience.test.js:190` (nome do caso) e `:247` (mensagem de asserção)
**Issue:** o guard `if (isRunning)` está na linha **28**, não na 27 — as duas referências já
nasceram erradas, como o próprio `04-18-SUMMARY.md` reconhece. Concordo com a decisão de não
renomear o **caso** (o nome é citado no `04-RESEARCH.md` e renomear mexe num identificador de
oráculo). Discordo quanto à **mensagem de asserção** de `:247`: mensagem de `assert` não é oráculo,
não é citada por nenhum artefato, e trocar `'…pelo guard de scheduler.js:27'` por
`'…pelo guard `if (isRunning)` do topo de runCheck'` não altera o que o teste prova.
**Fix:** converter só a mensagem de `:247` para âncora nomeada; deixar o nome do caso como está,
com o motivo já registrado.

#### IN3-07: o ganho de WR2-05 não atravessa deals — o caso (3) chama de "rodada" o que é um deal

**File:** `backend/src/emailer.js:239`; `backend/test/emailer.transporteVivo.test.js:206`
**Issue:** `sendStaleNotification` faz `let transporter = createTransporter()` na entrada, e é
chamada **uma vez por deal** pelo laço de `runCheck`. O transporte recriado no retry sobrevive aos
destinatários daquele deal e morre com ele: numa rodada de cron com N deals e a sessão SMTP morta,
o sistema volta a pagar o ciclo de 3 s + 6 s **por deal**. O caso (3) do teste chama isso de "uma
conexão por rodada", mas "rodada" em `scheduler.js` designa a execução inteira de `runCheck` — a
mesma palavra com dois significados nos dois lados da fronteira. A asserção em si está certa
(`transportesCriados === 1` por chamada); só o vocabulário engana.
**Fix:** renomear o caso para "uma conexão por deal, não uma por destinatário" e registrar como
todo a pergunta que ficou: se vale reusar o transporte entre deals da mesma rodada, com o
`socketTimeout` de 30 s de D-02 como teto de vida.

#### IN3-08: `shouldNotifyOwner` falha ABERTA quando o funil vem ausente — caracterizado, mas nunca pesado como risco

**File:** `backend/src/agendor.js:112-115`; caracterizado em `backend/test/agendor.funnel.test.js:41-44`
**Issue:** `(deal?.funnel || '').trim().toLowerCase()` transforma funil ausente em `''`, que não
está em `NO_OWNER_NOTIFY_FUNNELS` → **notifica**. `getStaleDeals` monta esse campo a partir de
`deal.dealStage?.funnel?.name` (`:284`), então qualquer payload sem `funnel` reabilita a
notificação do funil que a regra de negócio manda suprimir. O mesmo vale para um rename ("Beefor
Comercial" deixa de casar). Os dois comportamentos **estão** pinados como quirks conhecidos em
`agendor.funnel.test.js`, o que é honesto — por isso é INFO e não WARNING. O que falta é a
avaliação de risco: dos filtros de elegibilidade, este é o segundo que falha aberto (o primeiro é
CR3-01), e nenhum plano da fase os olhou como categoria.
**Fix:** registrar como todo a decisão de direção (fail-open vs. fail-safe) para os filtros de
elegibilidade como um todo, junto do conserto de CR3-01.

---

_Reviewed: 2026-08-05T04:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard — rodada 3 (gap closure r2)_
_Suíte executada: 148/148 verdes sob Node 22.13.1; `npm run lint` exit 0 (44 warnings, baseline)_
_Provas empíricas: 4, todas reproduzidas fora da árvore do repositório_
