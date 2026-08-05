---
phase: 04-confiabilidade-das-integra-es
plan: 35
subsystem: backend
tags: [agendor, scheduler, elegibilidade, fail-open, observabilidade, core-value, in3-08, tdd]

# Dependency graph
requires:
  - phase: 04 (plano 04-28)
    provides: o padrão do contador dedicado + alarme aditivo de supressão total, espelhado aqui
  - phase: 04 (plano 04-31)
    provides: o campo seraNotificado de runCheckOnly, que este plano exige atravessar sem edição
  - phase: 04 (plano 04-20)
    provides: a cadeia de guardas de runCheck em que o contador novo se insere sem alterá-la
provides:
  - comparação por SUBSTRING em shouldNotifyOwner — um rename no CRM não desliga mais a regra em silêncio
  - campo funilAusente por negócio, derivado no único lugar que conhece o payload cru
  - aviso agregado de funil não avaliado em getStaleDeals (uma linha por chamada)
  - contador results.funilNaoAvaliado + alarme aditivo de forma-do-payload em runCheck
  - oráculo unitário do contrato novo (8 casos, zero QUIRK, com testemunha de não-supressão)
  - cenários H, I e J do oráculo de envio/prévia
  - caso (8) do oráculo do resumo semanal individual
affects: [code review rodada 5, fechamento da fase 04, todo in3-08b]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Filtro de elegibilidade sobre texto livre do CRM compara por correspondência PARCIAL — o funil era a exceção, não a regra"
    - "Mudança deliberada de comportamento reescreve o caso que dizia 'comportamento ATUAL' — a inversão do quirk É o sinal de que a decisão foi tomada"
    - "Oráculo de supressão exige TESTEMUNHA DE NÃO-SUPRESSÃO, senão uma implementação que suprime sempre passa na maioria dos casos"
    - "Contador de sinal incrementa no TOPO do laço quando o denominador é o total da rodada, para que numerador e denominador percorram o mesmo conjunto"
    - "Aviso em caminho de LEITURA do painel é AGREGADO por chamada, nunca por item — log inundado é log que não se lê"
    - "Mensagem de alarme afirma apenas o que o instrumento garante; a redação larga vira gate de grep quando ela seria falsa em algum cenário"

key-files:
  created:
    - .planning/todos/pending/in3-08b-comparacao-exata-nos-demais-filtros.md
  modified:
    - backend/src/agendor.js
    - backend/src/scheduler.js
    - backend/test/agendor.funnel.test.js
    - backend/test/emailer.resumoIndecidivel.test.js
    - backend/test/scheduler.categoriaIndecidivel.test.js
    - .planning/STATE.md
    - .planning/ROADMAP.md

key-decisions:
  - "MODO 2 corrigido por SUBSTRING e não por limite de palavra (D-IN3-08-a): 'beeforx' também passa a ser suprimido, consequência apresentada ao usuário e escolhida por ele"
  - "Os DOIS casos QUIRK INVERTERAM (D-IN3-08-b) e a palavra QUIRK não sobrevive no arquivo — um caso que diz 'comportamento ATUAL' não pode sobreviver à decisão que muda esse comportamento"
  - "MODO 1 mantido FAIL-OPEN (D-IN3-08-c): funil ausente continua notificando, porque 15 de 15 negócios das fixtures trazem a estrutura — um fail-safe uniforme faria 'não sei o funil' virar o default de qualquer payload de forma mudada, reintroduzindo o CR4-01"
  - "O que mudou no MODO 1 foi OBSERVABILIDADE, nunca destinatário (D-IN3-08-d): a asserção principal do caso de funil ausente não mudou uma letra"
  - "O aviso de getStaleDeals é AGREGADO, uma linha por chamada (D-IN3-08-e), porque a função é também o caminho de leitura do painel, com auto-refresh"
  - "O contador incrementa no TOPO do laço (D-IN3-08-f) para não reproduzir o residual cr4-01b, em que o numerador não alcança o denominador numa rodada mista"
  - "O alarme novo vem ANTES do bloco do 04-28 (D-IN3-08-g): na colisão, o campo escalar fica com a mensagem mais grave e as duas ficam no array que a UI renderiza"
  - "Normalização sem remoção de acentos (D-IN3-08-h): igualar à irmã exigiria extrair um helper compartilhado, refatoração estrutural no caminho do Core Value que a constraint de processo proíbe misturar a uma mudança de comportamento"
  - "A mensagem do alarme é ESTREITA por gate de grep: a redação larga seria falsa numa rodada composta, e uma mitigação que mente em parte dos casos é pior que nenhuma"
  - "O conflito interno do plano (citar `isExcludedStage` no comentário vs. exigir 0 ocorrências dele no diff) foi resolvido a favor do gate, preservando a SUBSTÂNCIA da referência sem escrever o identificador"

patterns-established:
  - "Par ALARME/SILÊNCIO com construção idêntica e uma única variável trocada (I e J), no mesmo molde de D e E do 04-28"
  - "Asserções separadas em blocos rotulados COMPORTAMENTO e INSTRUMENTO, para que o vermelho do RED distinga regressão de instrumento inexistente"

requirements-completed: [REL-06, REL-03]

# Metrics
duration: 52min
completed: 2026-08-05
---

# Phase 4 Plano 35: O último filtro de elegibilidade fail-open Summary

**Um funil renomeado no CRM voltou a suprimir a notificação ao responsável nos três consumidores — a comparação deixou de ser por igualdade exata e passou a ser por substring —, e um payload sem funil continua notificando de propósito, agora contado e avisado em vez de silencioso.**

## Performance

- **Duration:** ~52 min
- **Started:** 2026-08-05T19:56:00Z
- **Completed:** 2026-08-05T20:48:00Z
- **Tasks:** 3 (TDD: RED, RED, GREEN)

## Tasks Executed

| # | Task | Commit | Arquivos |
|---|------|--------|----------|
| 1 | RED — oráculo unitário do contrato novo e o terceiro consumidor | `ceda55d` | `agendor.funnel.test.js`, `emailer.resumoIndecidivel.test.js` |
| 2 | RED — runCheck e runCheckOnly sob funil renomeado e sob funil ausente | `78be496` | `scheduler.categoriaIndecidivel.test.js` |
| 3 | GREEN — substring, sinal de funil não avaliado e o residual com dono | `42a3de5` | `agendor.js`, `scheduler.js`, `in3-08b.md` |

## O achado, e por que ele valia um plano e não um todo

O `in3-08` descrevia **dois modos de falha misturados num só achado**. As medições os separaram, e o
usuário decidiu cada um por si em 2026-08-05.

**MODO 2 — a comparação frágil.** `NO_OWNER_NOTIFY_FUNNELS = ['beefor']` comparava por igualdade
EXATA. Isso não dependia de falha nenhuma: bastava um administrador **renomear o funil dentro do
Agendor** — 'Beefor' virar 'Beefor Comercial' ou 'Beefor 2026' — para a comparação deixar de casar e
a notificação que a regra de negócio manda suprimir voltar a sair, em silêncio, para quem não é
responsável por acompanhá-la. A regra existe por um motivo escrito no próprio código: a Beefor é uma
empresa do grupo com produto próprio, e o vendedor da Cadmus pode ser dono da organização sem ser
responsável pelo funil. **Corrigido: passou a comparar por substring.**

**MODO 1 — a direção da falha com funil ausente.** `(deal?.funnel || '')` transforma funil ausente em
string vazia, que nunca casa, e o negócio é notificado. **Mantido: continua notificando.** O que
mudou foi só a observabilidade.

Este é o único plano da gap closure que **muda comportamento na lógica de quem-recebe** — o Core
Value do milestone —, e por isso as duas mudanças vieram com teste cobrindo o comportamento novo,
que é exatamente o que a constraint de processo do `PROJECT.md` exige.

## Por que o MODO 1 NÃO virou fail-safe

A razão está medida e ficou escrita no código, não só aqui: **15 de 15 negócios das fixtures do
repositório trazem `dealStage.funnel.name`** (`real-deals.sample.json`, 5 reais anonimizados;
`synthetic/deals-page.json`, 10 sintéticos; nomes `Funil 1`, `Funil 2`, `Comercial` — nenhum contém
'beefor'). Funil ausente é **caminho de exceção**, não caso comum.

Um fail-safe uniforme faria "não sei o funil" virar o **estado padrão de qualquer negócio cujo
payload mude de forma** — reintroduzindo exatamente o CR4-01, a supressão em massa invisível que o
plano 04-28 acabou de fechar. A diferença essencial em relação ao CR3-01, que o todo original
equiparava: lá o indecidível só surgia depois de esgotado o retry de uma chamada HTTP específica —
evento raro e detectável; aqui seria o default de qualquer payload sem a estrutura.

## O RED literal

### Task 1 — `agendor.funnel.test.js`

```
1..8
# pass 5
# fail 3
```

| Caso | Falhou? | Asserção / forma |
|---|---|---|
| 4 — `'beefor vendas'` SUPRIME | **sim** | `true !== false` |
| 5 — `'beeforx'` SUPRIME | **sim** | `true !== false` |
| 6 — `'Beefor Comercial'` SUPRIME | **sim** | `true !== false` |
| 1, 2, 3 (exato/case/trim), 7 (`'Comercial'` NOTIFICA), 8 (ausente NOTIFICA) | não | — |

Nenhum dos casos 4, 5 ou 6 ficou verde: a premissa do plano (a comparação era mesmo por igualdade
exata, sem caminho não medido) está confirmada por medição.

### Task 1 — `emailer.resumoIndecidivel.test.js`

```
1..8
# pass 7
# fail 1
```

O caso (8) falhou em `true !== false` — o card de `'Beefor Comercial'` estava presente no HTML do
relatório individual. Os casos (1) a (7) verdes sem alteração.

### Task 2 — `scheduler.categoriaIndecidivel.test.js`

```
1..10
# pass 7
# fail 3
```

| Cenário | Asserção em que falhou | Forma | Previsão do plano |
|---|---|---|---|
| **H** | (b) `previstoPrimeiro.seraNotificado === false` | `true !== false` | bateu |
| **I** | **(d)** `r.funilNaoAvaliado === 2` | `undefined !== 2` | bateu |
| **J** | (b) `r.funilNaoAvaliado === 0` | `undefined !== 0` | bateu |

O ponto mais importante do RED está em **I**: ele passou por (a) `r.stale === 2`, (b) `r.notified === 2`
e os quatro `envios(...) >= 1`, e (c) `seraNotificado === true` nos dois — ou seja, **o trecho verde
provou por medição que o fail-open já estava correto e continua correto**, e só então falhou no
instrumento. A condição de PARAR (falhar em (a), (b) ou (c)) **não** foi atingida. Os cenários A–G
continuaram verdes sem uma linha editada.

## Números medidos ao lado dos prescritos

### Task 1

| Critério | Prescrito | Medido | |
|---|---|---|---|
| `grep -c '^test(' agendor.funnel.test.js` | 8 | **8** | ✅ |
| `grep -c 'QUIRK' agendor.funnel.test.js` | 0 | **0** (era 2) | ✅ |
| `grep -o "'Comercial'" \| wc -l` | ≥ 1 | **3** | ✅ |
| `grep -c 'Beefor Comercial'` | ≥ 1 | **3** | ✅ |
| `git diff -U0 \| grep -c '^-.*assert'` | 2 | **2** | ✅ |
| `git diff -U0 emailer... \| grep -c '^-[^-]'` | 0 | **0** | ✅ |
| `grep -c '^test(' emailer.resumoIndecidivel.test.js` | 8 | **8** | ✅ |
| `git diff --name-only -- backend/src/` | vazio | **vazio** | ✅ |
| `git diff -U0 backend/test/ \| grep -c '\.js:[0-9]'` | 0 | **0** | ✅ |

### Task 2

| Critério | Prescrito | Medido | |
|---|---|---|---|
| runner | 3 fail (H, I, J) / 7 pass | **3 fail / 7 pass** | ✅ |
| I falha no instrumento, não no comportamento | asserção (d) | **(d), `undefined !== 2`** | ✅ |
| J falha no instrumento | contador | **`undefined !== 0`** | ✅ |
| `grep -c '^test('` | 10 | **10** | ✅ |
| `grep -o 'servirDealsDoFunilBeefor' \| wc -l` | 3 | **4** | ⚠️ divergência 1 |
| `grep -o 'servirDealsComFunil' \| wc -l` | ≥ 4 | **4** | ✅ |
| `grep -cE '^//   (H\|I\|J) '` | 3 | **3** | ✅ |
| `git diff -U0 \| grep -c '^-[^-]'` | 0 | **0** | ✅ |
| `git diff --name-only -- backend/src/` | vazio | **vazio** | ✅ |
| refs por número de linha | 0 | **0** | ✅ |

### Task 3

| Critério | Prescrito | Medido | |
|---|---|---|---|
| `npm test` | 192/192 | **192/192** | ✅ |
| `npm run test:coverage` | exit 0 | **exit 0** | ✅ |
| `agendor.js` linhas / branches | 100% / ≥ 91,72% | **100% / 92,08%** | ✅ (subiu) |
| `npm run lint` | exit 0, 44 warnings | **exit 0, 44 warnings** | ✅ |
| `NO_OWNER_NOTIFY_FUNNELS.some(` não-comentário | 1 | **1** | ✅ |
| `NO_OWNER_NOTIFY_FUNNELS.includes(` não-comentário | 0 | **0** | ✅ |
| `NO_OWNER_NOTIFY_FUNNELS` ocorrências não-comentário | 2 | **2** | ✅ |
| `funilAusente` ocorrências não-comentário em `agendor.js` | ≥ 2 | **2** | ✅ |
| `logger.warn` não-comentário em `agendor.js` | 2 | **2** | ✅ |
| `grep -c 'ninguém deixou de ser notificado' scheduler.js` | 0 | **0** | ✅ |
| irmãs de filtro no diff de `agendor.js` | 0 | **1** | ⚠️ divergência 2 |
| `skippedCategoriaIndecidivel` no diff de `scheduler.js` | 0 | **0** | ✅ |
| `funilNaoAvaliado` ocorrências não-comentário | 3 | **3** | ✅ |
| `grep -c 'continue;' scheduler.js` | 3 | **3** | ✅ |
| `results.error = ` não-comentário | 3 | **3** (era 2) | ✅ |
| `seraNotificado` no diff de `scheduler.js` | 0 | **0** | ✅ |
| `git diff --name-only -- backend/test/` | vazio | **vazio** | ✅ |
| `git status --porcelain` de package/lockfiles | vazio | **vazio** | ✅ |
| `in3-08b` existe com as 5 medições | existe | **existe** | ✅ |
| `git status --porcelain .planning/todos/` | 1 arquivo não rastreado | **1, não rastreado** | ✅ |
| refs por número de linha em `backend/src/` | 0 | **0** | ✅ |

Volume não-comentário do diff de produção: **10 linhas** em `agendor.js`, **15** em `scheduler.js`.

## Divergências de medição — registradas, nenhuma forçada

Esta é a **décima primeira** rodada da fase com divergência de contagem, e as duas são de classes já
registradas aqui.

**Divergência 1 — `servirDealsDoFunilBeefor` dá 4 e não 3.** Classe: **menção em comentário**
(precedentes: 04-29, 04-30, 04-33). A quarta ocorrência está na primeira linha do comentário do
helper irmão novo — "Irmã de `servirDealsDoFunilBeefor` para os cenários H, I e J". A conclusão que
o número existe para sustentar sobrevive intacta e por medição mais direta:

- `grep -v '^\s*//' ... | grep -o 'servirDealsDoFunilBeefor' | wc -l` = **3** — exatamente o valor prescrito;
- `git diff -U0 ... | grep -c '^-[^-]'` = **0** — nenhuma linha removida no arquivo inteiro.

O helper de E e G está byte a byte. Remover a menção seria trocar uma referência por âncora nomeada
(WR2-06) por prosa vaga, para fazer um número bater.

**Divergência 2 — o gate das irmãs de filtro dá 1 e não 0.** Classe: **cabeçalho de hunk do
`git diff -U0`** (precedentes: divergência nº 2 do 04-30 e nº 4 do 04-34). A única linha que casa é

```
@@ -174,0 +175,24 @@ const EXCLUDED_OWNERS = ['Maria Lobato'];
```

— a anotação de contexto que o git anexa ao cabeçalho do hunk, e **não** uma linha alterada.
Filtrando o diff para as linhas `+`/`-` reais (`grep '^[+-]' | grep -v '^[+-][+-]'`), o resultado é
**0**. Nenhuma das constantes irmãs foi tocada.

## Um conflito interno do plano, resolvido a favor do gate

A ação **(a)(iii)** da Task 3 pedia que o comentário novo registrasse "que a irmã `isExcludedStage`,
no mesmo módulo, já usava correspondência parcial pelo mesmo motivo". O critério de aceite da mesma
task exigia `git diff -U0 backend/src/agendor.js | grep -c '...isExcludedStage...'` = **0**. Escrever
o identificador satisfaria a ação e reprovaria o gate.

Resolvido a favor do gate, preservando a substância: o comentário diz que **"a irmã deste módulo que
exclui etapas encerradas já comparava por correspondência PARCIAL, e pelo mesmo motivo escrito no
comentário dela — um filtro de elegibilidade sobre texto livre do CRM precisa cobrir variações e
composições. O funil era a exceção, não a regra."** O leitor chega ao mesmo lugar; o gate fecha em 0
nas linhas reais. Registrado aqui para que a escolha não pareça esquecimento.

## Inventário de irmãos — classificação final

### Grupo 1 — os TRÊS consumidores de `shouldNotifyOwner`

| # | Construção | Classificação final | Evidência entregue |
|---|---|---|---|
| 1 | `runCheck` (envio diário) | **corrigida + instrumentada** | Cenário **H** (suprime o renomeado, notifica o `'Comercial'`, `funilNaoAvaliado === 0`); **I** (`funilNaoAvaliado === 2`, alarme); **J** (`=== 0`, silêncio) |
| 2 | `runCheckOnly` (prévia do painel) | **verificada-e-sã POR MEDIÇÃO** | **H**: `seraNotificado === false` para o renomeado **e** a igualdade prévia-x-envio. **I**: `previstoPrimeiro.funilAusente === true` — prova que o campo novo atravessa o spread `{ ...deal }` — e `seraNotificado === true`. `git diff -U0 scheduler.js \| grep -c 'seraNotificado'` = **0**: a função não foi editada |
| 3 | `sendOwnerWeeklySummary` (resumo individual) | **verificada-e-sã POR MEDIÇÃO** | Caso **(8)**: o card de `'Beefor Comercial'` sumiu do HTML, e o `'Beefor'` exato continua fora (não-regressão), com `NEGOCIO-NORMAL` presente. Medição estrutural: `grep -rin "beefor" scheduler.js emailer.js \| grep -cv '//'` = **0** — não existe segunda comparação de funil para divergir |

### Grupo 2 — constantes de filtro irmãs, no mesmo módulo

| Construção | Classificação final | Evidência / dono |
|---|---|---|
| `EXCLUDED_STAGE_WORDS` + a função que exclui etapas | **verificada-e-sã — PRECEDENTE LITERAL do MODO 2** | Já usava correspondência parcial, com o motivo escrito. Ausente do diff (0 nas linhas reais); o regex byte-a-byte intocado |
| `EXCLUDED_CATEGORIES` | **fora-de-escopo-com-medição** | 1 ocorrência não-comentário, mesma direção de falha. Fora porque mudá-la muda QUEM RECEBE e a decisão do usuário cobre só o funil. Dono: `in3-08b` §1. Ausente do diff |
| `EXCLUDED_OWNERS` | **fora-de-escopo-com-medição** | 1 ocorrência não-comentário, mesma forma. Dono: `in3-08b` §2, que registra a assimetria de risco (substring sobre NOME DE PESSOA é mais perigosa). Ausente do diff |
| `NEGOCIO_CATEGORIES` + `getDealType` | **verificada-e-sã — NÃO é filtro de elegibilidade** | `grep -c "dealType" scheduler.js` = 1, e é `deal_type:` no payload do `notification_log`. Erra o RÓTULO, nunca o destinatário. Ausente do diff |

### Grupo 3 — superfícies do sinal novo

| Superfície | Classificação final | Evidência / dono |
|---|---|---|
| `results.funilNaoAvaliado` + `results.errors` | **corrigida** | Par **I** (`errors.length === 1`, `error.includes('funil')`) e **J** (`errors.length === 0`, `error === undefined`) |
| Linha agregada de log em `getStaleDeals` | **corrigida** | Emitida só quando o contador é > 0; só dois inteiros e texto fixo — sem id, sem nome de negócio/organização, sem objeto de erro (T-04-35-02) |
| `sendOwnerWeeklySummary` sem contador agregado | **fora-de-escopo-com-medição** | Já tem contador próprio por causa; o mesmo sinal dispara na rodada **diária**, cinco vezes mais cedo. Dono: `in3-08b` §4 |
| `funilAusente` invisível na UI | **fora-de-escopo-com-medição** | `grep -rn "funilAusente\|skipReason" frontend/src` = **0**. Dono: `in3-08b` §5, ao lado do `cr4-01c` |
| Normalização sem remoção de acentos | **fora-de-escopo-com-medição** | D-IN3-08-h. Dono: `in3-08b` §3 |
| Alarme do 04-28 | **verificada-e-sã** | `git diff -U0 scheduler.js \| grep -c 'skippedCategoriaIndecidivel'` = **0**; A–G verdes sem edição |

## Ordem de precedência do campo escalar de erro (D-IN3-08-g)

Verificada por leitura da ordem de escrita, e é decisão e não acaso: o bloco novo roda **antes** do
bloco do 04-28. Quando as duas condições totais valem na mesma rodada, quem escreve depois vence o
campo escalar `results.error` — que fica com a mensagem **mais grave** (a do 04-28: ninguém foi
notificado) —, e as **duas** mensagens ficam em `results.errors`, o único bloco que o Dashboard
renderiza. Os cenários I e J isolam `funilAusente` como causa única e portanto não exercitam a
rodada composta.

## Por que a mensagem do alarme é ESTREITA

O contador incrementa no **topo** do laço, antes das guardas de dedup e de categoria indecidível
(D-IN3-08-f). Logo, a condição total pode valer numa rodada **composta** em que alguns desses mesmos
negócios foram pulados por **outra** causa. Nessa rodada, a frase larga — "ninguém deixou de ser
notificado" — seria **factualmente falsa**, minando justamente a ameaça que a mensagem existe para
mitigar (T-04-35-05: um operador que conclua ter perdido envios dispara a rodada de novo e gera
duplicatas).

A mensagem afirma apenas o que o instrumento garante: **"a supressão por funil não impediu nenhuma
notificação"**, e que a rodada CONCLUIU, e que este é um alarme de FORMA e não de supressão. A frase
larga é proibida por gate (`grep -c` = 0), e o comentário no código diz por quê, para que ela não
seja "melhorada" depois. Os cenários I e J **não** cobrem a rodada composta — a defesa aqui é a
redação, não um caso de teste, e isso está declarado.

## Deviations from Plan

### Rule 3 — desvio de ferramental (escopo), sem efeito em commit

**`npm run format` do backend reformatou seis arquivos de teste pré-existentes e sem relação com
este plano.** A primeira execução de `npm run format` em `backend/` reportou "Fixed 6 files" e tocou
`dealId.validation.test.js`, `deals.errorLog.test.js`, `envExample.test.js`,
`notificationStatus.canalParcial.test.js`, `notifications.resolved.test.js` e `secrets.grep.test.js`
— dívida de formatação anterior, não produzida por este plano.

- **Ação:** os seis foram **revertidos** (`git checkout --` por arquivo) e não entraram em commit
  nenhum. As execuções seguintes de formatação foram direcionadas apenas aos arquivos deste plano
  (`biome format --write <arquivos>`), e os cinco arquivos tocados aqui foram conferidos com
  `biome format` sem `--write`: "No fixes applied".
- **Fora de escopo por decisão:** corrigir a formatação dos seis misturaria ruído de diff a um plano
  que muda a lógica de quem-recebe.
- **Aviso para quem seguir:** rodar `npm run format` no backend hoje produz ruído nesses seis
  arquivos. Não existe script `format` na raiz do repositório, apesar de o `biome.json` viver lá.

Nenhuma Rule 1, 2 ou 4 foi acionada. Nenhum pacote instalado — `package.json` e os lockfiles ficaram
intocados (T-04-35-SC), e portanto o portão humano de legitimidade de pacote não se aplicou.

## O que este plano NÃO fecha

| Item | Estado |
|---|---|
| `in3-08` | **Continua pendente e INTOCADO.** O plano o resolve materialmente, mas quem fechar a fase é que arquiva o todo — nenhum todo existente foi editado |
| `in3-08b` | **Criado nesta rodada** com as 5 medições (categorias, donos, normalização sem acentos, contador no resumo semanal, invisibilidade na UI) |
| `cr4-01b` | Aberto. Este plano **não** o conserta; apenas **não o reproduz** — o contador novo tem numerador e denominador sobre o mesmo conjunto |
| `cr4-01c` | Aberto. Anda junto de `in3-08b` §5: a mesma lacuna de superfície, com dois campos |
| Os demais 30 todos pendentes | Inalterados. Total: 33 → **34** |
| Fase 04 | **PERMANECE REABERTA.** `completed_phases` continua **3** e `percent` **38** — quem fecha a fase é o coordenador, depois do code review rodada 5 |

## Self-Check: PASSED

Arquivos declarados, verificados em disco:

- `backend/src/agendor.js` — FOUND
- `backend/src/scheduler.js` — FOUND
- `backend/test/agendor.funnel.test.js` — FOUND
- `backend/test/emailer.resumoIndecidivel.test.js` — FOUND
- `backend/test/scheduler.categoriaIndecidivel.test.js` — FOUND
- `.planning/todos/pending/in3-08b-comparacao-exata-nos-demais-filtros.md` — FOUND

Commits declarados, verificados em `git log`:

- `ceda55d` — FOUND (`test(04-35): RED — oráculo do contrato novo de funil e o terceiro consumidor`)
- `78be496` — FOUND (`test(04-35): RED dos consumidores`)
- `42a3de5` — FOUND (`fix(04-35): GREEN`)

## TDD Gate Compliance

Sequência de portões verificada em `git log`:

1. **RED** — `ceda55d` e `78be496`, ambos `test(...)`, com `backend/src/` medido como vazio no diff
2. **GREEN** — `42a3de5`, `fix(...)`, posterior aos dois, com `backend/test/` medido como vazio no diff
3. **REFACTOR** — não houve; nenhuma limpeza foi necessária

Nenhum teste passou inesperadamente no RED: os sete casos vermelhos falharam exatamente nas
asserções previstas, e nenhuma das três condições de PARAR do plano foi atingida.
