---
phase: 04-confiabilidade-das-integra-es
plan: 18
subsystem: documentacao-e-comentarios
tags: [wr2-06, ancora-nomeada, comentarios, todos, in2-01, in2-02, in2-03, in2-04, checkpoint-c9]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "04-12 a 04-17 (os comentarios que este plano varre nasceram ou foram reescritos por eles); 04-09 (o molde de arquivo de todo, criado com in-01 e in-04); a DECISAO C9 do 04-12"
provides:
  - "Zero referencias por numero de linha em backend/src/** — 12 antes, 0 depois"
  - "Zero referencias por numero de linha EM COMENTARIO nos arquivos de teste do gap closure — 41 antes, 2 depois (as 2 restantes vivem em string, nao em comentario)"
  - "Convencao de uma linha no topo de agendor.js: referencia por ancora nomeada, nunca por numero de linha"
  - "IN2-01..IN2-04 registrados como todo pendente, com o achado na integra e o link de volta ao 04-REVIEW.md"
  - "Decisao C9 aplicada: Success Criteria 4 da Fase 4 (ROADMAP) e REL-04 (REQUIREMENTS) descrevem o comportamento garantido, nao o mecanismo removido"
affects: [verificacao-da-fase-04, fase-05, fase-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Referencia entre trechos por ancora nomeada (funcao, identificador, arquivo, caso de teste) — e um gate por grep que detecta a reincidencia"
    - "Varredura measure-first: contar ANTES, converter ocorrencia por ocorrencia, contar DEPOIS, e registrar o residual deliberado com a razao"

key-files:
  created:
    - .planning/todos/pending/in2-01-fetchwithretry-sem-tentativa.md
    - .planning/todos/pending/in2-02-relogio-falso-em-before.md
    - .planning/todos/pending/in2-03-mensagem-de-erro-interpola-id.md
    - .planning/todos/pending/in2-04-parcial-sent-invisivel.md
  modified:
    - backend/src/agendor.js
    - backend/src/scheduler.js
    - backend/src/emailer.js
    - backend/src/config.js
    - backend/src/routes/deals.js
    - backend/test/agendor.cacheConcurrency.test.js
    - backend/test/agendor.cacheInvalidation.test.js
    - backend/test/agendor.retry429.test.js
    - backend/test/deals.errorLog.test.js
    - backend/test/helpers/fakeTimers.js
    - backend/test/notificationStatus.partialFailure.test.js
    - backend/test/scheduler.resilience.test.js
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "D-WR2-06-a aplicada: referencia dentro do arquivo ou entre arquivos de producao usa nome de funcao ou identificador; referencia a teste usa nome do arquivo"
  - "As 2 ocorrencias que restam no escopo obrigatorio vivem em STRING (nome de caso e mensagem de asseracao), nao em comentario — mantidas por respeito ao criterio ABSOLUTO de diff exclusivamente de comentario, que o plano nao da escape, enquanto o criterio de contagem 0 da"
  - "O escopo real da varredura foi MAIOR do que os 7 pontos da tabela do review: 53 linhas medidas contra 7 conferidas, e 2 arquivos de producao que a tabela nao citava (config.js e o segundo ponteiro de routes/deals.js)"
  - "[C9, decisao vinculante do usuario, 2026-08-05] REL-04 / Success Criteria 4 reescritos para descrever o COMPORTAMENTO (isolamento por execucao), nao o mecanismo de invalidacao removido pelo 04-12"

patterns-established:
  - "Um gate executavel (grep) acompanha a convencao — a regra escrita sem detector volta a ser violada no proximo commit longo"

requirements-completed: [REL-01, REL-03, REL-04, REL-05, REL-06]

# Metrics
duration: 26min
completed: 2026-08-05
---

# Phase 04 Plan 18: âncoras estáveis nos comentários e registro de IN2-01..IN2-04 (WR2-06) Summary

**As 7 referências por número de linha que o review conferiu eram a ponta de 53: a varredura medida encontrou 12 em `backend/src` e 41 nos arquivos de teste do gap closure, todas nascidas erradas porque os próprios blocos de 15 a 25 linhas empurraram o código para baixo dentro do commit que as escreveu; agora são 0 em produção e 2 nos testes — as duas que sobraram vivem em string, não em comentário —, existe uma convenção de uma linha com gate executável por grep, e os 4 achados Info da rodada 2 deixaram de depender da memória de quem leu o relatório.**

## Performance

- **Duration:** ~26 min
- **Tasks:** 2 de 2 (plano autônomo, sem checkpoint)
- **Files:** 4 criados (todos), 12 `.js` modificados, 2 artefatos de planejamento atualizados por C9
- **Diff de código:** **0 linhas não-comentário**, verificado por contagem

## Accomplishments

### WR2-06 fechado — e o escopo real era 7,5× o conferido

O review conferiu 7 referências linha a linha. A varredura por grep, obrigatória pelo plano antes de qualquer edição, mediu **53 linhas** no escopo obrigatório. A diferença não é erro do review — ele conferiu o **código novo da rodada r1** (04-08 a 04-11); a varredura cobre `backend/src/**` inteiro mais os 12 arquivos de teste das duas rodadas de gap closure.

**Dois arquivos de produção que a tabela do review não citava** apareceram na medição:

- `backend/src/config.js` — "quem carrega o `.env` é o boot (`src/index.js:1`)". Virou "a chamada de dotenv no topo de `src/index.js`".
- `backend/src/routes/deals.js` tinha **dois** ponteiros, não um: além do `agendor.js:291-292` que o review pegou, havia `` `ecosystem.config.js:20` ``. Virou "a chave `error_file` de `ecosystem.config.js`" — e essa é a conversão mais valiosa do lote, porque uma chave nomeada num arquivo de config de 25 linhas é uma âncora que sobrevive a qualquer reordenação.

**Contagem por escopo:**

| Escopo | Antes | Depois |
|---|---|---|
| `backend/src/**` | **12** | **0** |
| Arquivos de teste do gap closure (12 arquivos) | **41** | **2** |
| **Total do escopo obrigatório** | **53** | **2** |
| Restante de `backend/test` (10 arquivos, fora do escopo) | 48 | 48 (intocado, deliberado) |

Detalhe do antes, por arquivo:

| Arquivo | Antes | Depois |
|---|---|---|
| `backend/src/agendor.js` | 5 | 0 |
| `backend/src/scheduler.js` | 3 | 0 |
| `backend/src/routes/deals.js` | 2 | 0 |
| `backend/src/emailer.js` | 1 | 0 |
| `backend/src/config.js` | 1 | 0 |
| `backend/test/scheduler.resilience.test.js` | 17 | **2** (ambas em string) |
| `backend/test/notificationStatus.partialFailure.test.js` | 13 | 0 |
| `backend/test/agendor.cacheConcurrency.test.js` | 3 | 0 |
| `backend/test/agendor.retry429.test.js` | 3 | 0 |
| `backend/test/agendor.cacheInvalidation.test.js` | 2 | 0 |
| `backend/test/deals.errorLog.test.js` | 2 | 0 |
| `backend/test/helpers/fakeTimers.js` | 1 | 0 |
| `dealId.validation.test.js`, `notificationStatus.registroResiliente.test.js`, `notificationStatus.canalParcial.test.js`, `fakeTimers.helper.test.js`, `emailer.transporteVivo.test.js` | 0 | 0 |

Os 5 arquivos que já estavam em 0 **não entraram no diff** — a inferência do plano de que "parte das 7 já terá desaparecido por reescrita nos planos 04-12 a 04-17" bateu: `emailer.transporteVivo.test.js` (04-17), `notificationStatus.canalParcial.test.js` (04-16) e `notificationStatus.registroResiliente.test.js` (04-15) nasceram já com âncora nomeada.

### As 2 ocorrências que ficaram — e por que ficar foi a decisão certa

Ambas em `backend/test/scheduler.resilience.test.js`, e **nenhuma das duas é comentário**:

| Linha | Conteúdo | Natureza |
|---|---|---|
| 190 | `test('(3) a execução seguinte a uma falha roda normalmente (o guard de :27 não recusa)', …)` | **nome do caso de teste** |
| 247 | `'a segunda chamada deve ser recusada pelo guard de scheduler.js:27'` | **mensagem de asserção** |

Os dois critérios de aceite do plano são **incompatíveis** sobre elas:

- *"o comando com a lista de arquivos da seção `interfaces` imprime 0"* — exigiria editá-las;
- *"o diff de TODOS os arquivos `.js` é exclusivamente de comentário: … imprime `0`"* — proíbe editá-las, porque string é linha de código.

**Prevaleceu o segundo**, por três razões:

1. **O plano dá escape explícito ao primeiro e nenhum ao segundo.** O critério da contagem termina com "(falsos positivos, se houver, documentados nominalmente no SUMMARY)"; o do diff não tem cláusula de saída, e é ele que materializa a mitigação de **R2-28** ("a varredura tocar código junto com o comentário", impacto **alto**) e de **T-04-18-02** ("mudança de código disfarçada de ajuste de comentário").
2. **Renomear um caso é mexer num oráculo.** O plano proíbe em prosa: "Nenhum teste é acrescentado, removido ou **alterado**". O nome do caso `(3)` é citado em `04-RESEARCH.md`; trocá-lo quebraria a rastreabilidade de um artefato de planejamento por um ganho cosmético.
3. **O dano de WR2-06 é menor aqui.** O que manda o leitor ao lugar errado durante um incidente é o **comentário de racional** — o artefato de 15 a 25 linhas que o `CLAUDE.md` pede. Um nome de caso é lido junto do próprio corpo do teste, a poucas linhas do código que ele exercita.

Registrado como **desvio de medição declarado**, na tradição já estabelecida por 04-15, 04-16 e 04-17 nesta rodada. **Não é falso positivo do padrão** — são referências por linha de verdade, e continuam erradas (o guard não está na linha 27). São dívida conhecida, nomeada e localizada.

### O residual, medido e deliberado

**48 linhas em 10 arquivos** de `backend/test` que **não** pertencem às duas rodadas de gap closure:

| Arquivo | Ocorrências |
|---|---|
| `scheduler.failsafe.test.js` | 13 |
| `notificationStatus.test.js` | 11 |
| `agendor.timeout.test.js` | 9 |
| `emailer.timeout.test.js` | 5 |
| `notifications.resolved.test.js` | 5 |
| `config.route.smtpPass.test.js` | 1 |
| `db.smtpPassMigration.clear.test.js` | 1 |
| `db.smtpPassMigration.keep.test.js` | 1 |
| `emailer.smtpPass.test.js` | 1 |
| `setup.js` | 1 |

**A razão de não tocar:** são oráculos estáveis das ondas 1 a 7. Editá-los para embelezar comentário mexeria em arquivos que ninguém está mudando, sem nenhum ganho de comportamento — e cada arquivo tocado é uma chance de alterar sem querer uma asserção que hoje protege o Core Value. `emailer.timeout.test.js`, em particular, é o oráculo de REL-02 que quatro planos seguidos desta rodada se recusaram a editar de propósito.

### A convenção, com detector

Duas linhas no topo de `backend/src/agendor.js`, acima do primeiro `require`:

```js
// Convenção (WR2-06): comentário referencia outro trecho por âncora nomeada — função, identificador,
// arquivo ou caso de teste —, nunca por número de linha, que se desloca no próprio commit que o escreve.
```

O que a torna diferente de uma regra escrita e esquecida é o **gate executável** que a acompanha:

```bash
grep -rnE '(\.js:[0-9]|\(:[0-9]|`:[0-9]| :[0-9])' backend/src --include='*.js' | wc -l   # deve imprimir 0
```

O padrão tem 4 alternativas porque o repositório usava 4 formas (`agendor.js:35-47`, `(:211)`, `` `:187-189` ``, ` :242`). Ele roda em menos de um segundo e é candidato natural a virar step de CI numa fase futura.

### Os 4 todos de IN2-01..IN2-04

Quatro arquivos em `.planning/todos/pending/`, 74 a 82 linhas cada, no molde de `in-01-status-pending-na-ui.md`: frontmatter completo, o achado **na íntegra** (sintoma, trecho, consequência, alcançabilidade), "Por que ficou fora da rodada 2", "Correção sugerida" e link de volta ao `04-REVIEW.md`.

| Todo | Prioridade | O que preserva que um resumo perderia |
|---|---|---|
| `in2-01-fetchwithretry-sem-tentativa` | baixa | Que o sintoma seria `TypeError: Cannot destructure property 'data' of 'undefined'` — uma mensagem que aponta para a API Agendor, não para o argumento errado |
| `in2-02-relogio-falso-em-before` | média | O **precedente medido** de `agendor.retry429.test.js`: 30s de adiantamento moveram o `cutoffDate` e trouxeram os deals de fronteira 102 e 104 para dentro do golden |
| `in2-03-mensagem-de-erro-interpola-id` | média | Que a distância entre "não explorável" e "explorável" é **uma linha de `logger.warn`** — e a regra de precaução que decorre disso |
| `in2-04-parcial-sent-invisivel` | média | Que o 04-17 reduziu a *probabilidade* mas não a *invisibilidade*; e o vínculo com `in-01-status-pending-na-ui` (mesmo ternário binário, mesmo arquivo) |

Nos quatro, as referências ao código usam **âncora nomeada** — o próprio WR2-06 aplicado à documentação. Onde há número de linha, ele vem entre parênteses como pista ("hoje por volta da linha 161 — a âncora é o nome da função, não o número"), nunca sozinho.

**`in2-04` registra explicitamente que é candidato a promoção de prioridade** na triagem do próximo milestone, por tocar o Core Value, e que deve ser tratado **junto** com `in-01-status-pending-na-ui`.

### Decisão C9 aplicada

**`.planning/ROADMAP.md`, Success Criteria 4 da Fase 4** — antes:

> `orgCategoryCache` é invalidado a cada execução de `getStaleDeals`; teste confirma que categoria obsoleta não é usada entre execuções (REL-04, D-05: limpeza por execução, não TTL)

Depois: o estado de categorias é **isolado por execução**, e nenhuma execução pode **ler, apagar, reutilizar ou contaminar** o estado de outra — com a nota de que a redação anterior descrevia o **mecanismo**, que o 04-12 eliminou junto com o dicionário de módulo, e que a remoção da limpeza **está aprovada pelo usuário e não é regressão de REL-04**.

**`.planning/REQUIREMENTS.md`, REL-04** recebeu o espelho da mesma reescrita (antes: "ganha TTL/invalidação para não usar categoria obsoleta indefinidamente").

**Por que a mudança de redação importa e não é burocracia:** um critério de sucesso que nomeia um mecanismo inexistente falha da pior forma possível numa verificação de fase — o verificador procura `orgCategoryCache`, não encontra, e o registro correto ("removido de propósito, aprovado, provado pelos mesmos 3 cenários sem edição de asserção") mora num SUMMARY que ele pode não abrir. Descrever o comportamento garantido torna o critério verificável contra o código que existe.

**Nada de código mudou por causa de C9** — é atualização documental, exatamente como a decisão determina. Nenhuma asserção foi tocada; `agendor.cacheInvalidation.test.js` e `agendor.cacheConcurrency.test.js` continuam verdes sem edição.

## Task Commits

1. **Task 1: varredura — toda referência por número de linha vira âncora estável** — `5f6ece8` (docs)
2. **Task 2: registrar IN2-01 a IN2-04 como todos pendentes + decisão C9** — `af4e3ca` (docs)

## Verificação (todos os critérios do plano, medidos)

| Critério | Comando | Resultado |
|---|---|---|
| Zero refs em produção | `grep -rnE '(\.js:[0-9]\|\(:[0-9]\|` + "`" + `:[0-9]\| :[0-9])' backend/src --include='*.js' \| wc -l` | **0** (era 12) |
| Refs nos testes do gap closure | mesmo padrão sobre os 12 arquivos | **2** (era 41) — ambas em string, documentadas nominalmente acima |
| Diff exclusivamente de comentário | `git diff -- 'backend/**/*.js' \| grep -E "^[+-][^+-]" \| grep -vE "^[+-][[:space:]]*//" \| wc -l` | **0** |
| Suíte + cobertura | `npm run test:coverage` | exit 0, **148/148**, `# fail 0` |
| Cobertura global | idem | 59,43% linhas / 80,85% branches (pisos 20/60) |
| Lint | `npm run lint` | exit 0 (44 warnings, baseline inalterado) |
| Formatador não reclama dos comentários | `biome format` nos 12 arquivos alterados | **0** diagnósticos sobre linha de comentário (o único diagnóstico é um literal de objeto pré-existente em `deals.errorLog.test.js`, fora do diff) |
| Dependências intocadas | `git diff --name-only backend/package.json backend/package-lock.json frontend/` | vazio |
| 4 todos existem | `ls .planning/todos/pending/in2-0*.md \| wc -l` | **4** |
| Frontmatter completo | 8 chaves exigidas por arquivo | **8/8** nos 4 |
| `status: pending` | `grep -l "status: pending" … \| wc -l` | **4** |
| Link de volta ao review | `grep -c "04-REVIEW.md"` | **2** em cada um dos 4 |
| Seção do motivo | `grep -c "Por que ficou fora"` | **1** em cada um dos 4 |
| Seção da correção | `grep -c "Correção sugerida"` | **1** em cada um dos 4 |
| Nenhum declara `sec-01` resolvido | `grep -ci "sec-01.*resolvid"` | **0** em cada um dos 4 |
| Tamanho mínimo (25 linhas) | `wc -l` | 82 / 79 / 76 / 74 |
| Sem segredo nos artefatos novos | `node --test test/secrets.grep.test.js` | exit 0, `# pass 3` |
| Task 2 sem tocar código | `git diff --name-only backend/ frontend/` | vazio |

## Decisions Made

1. **As 2 ocorrências em string ficam.** Critério absoluto (diff comment-only, mitigação de R2-28 e T-04-18-02) prevalece sobre critério com escape explícito (contagem 0). Renomear um caso de teste é mexer num oráculo, e o nome `(3)` é citado em `04-RESEARCH.md`.
2. **`config.js` e o segundo ponteiro de `routes/deals.js` entraram no diff** mesmo não estando na tabela do review nem na lista `files` do plano — o plano manda derivar a lista da **medição**, não da lista.
3. **`ecosystem.config.js:20` virou "a chave `error_file`"**, não "linha 20 do ecosystem". Referência a arquivo de config também é ponteiro que envelhece.
4. **Nenhuma âncora foi inventada para bloco anônimo** (mitigação de R2-30). Onde não havia nome próprio, a descrição cita um identificador real: "o `setTimeout` entre batches de `getStaleDeals`", "o guard `if (isRunning)` do topo de runCheck", "o catch que fecha o corpo de `runWeeklySummary`, logando `'[Scheduler] Erro no resumo semanal:'`". Nenhuma referência foi simplesmente apagada.
5. **A convenção ficou em `agendor.js` e não no `CLAUDE.md`.** O plano nomeia `agendor.js` como alvo primário, e a seção Conventions do `CLAUDE.md` é gerada — uma regra escrita lá corre risco de ser sobrescrita, e uma convenção que some é pior do que nenhuma.
6. **[C9, decisão vinculante do usuário, 2026-08-05]** REL-04 / Success Criteria 4 reescritos para descrever o comportamento garantido. A remoção da limpeza por execução está **aprovada**; não é regressão.
7. **Decisões dos checkpoints anteriores preservadas, sem edição dos arquivos:** `in-01-status-pending-na-ui` mantém **média** (C10); `rel-02b-deadline-global-smtp` mantém **alta / pré-go-live** (C11); **SEC-01 permanece ABERTO** como risco conscientemente aceito (C8).

## Deviations from Plan

Nenhuma deviation de execução das Regras 1-4 (nenhum bug, funcionalidade crítica faltante ou bloqueio encontrado). **Dois desvios de medição declarados**, ambos por critério de aceite do plano contado sobre escopo diferente do que o plano descreve em prosa — a **quarta e quinta ocorrência** do mesmo achado estrutural nesta rodada (04-15, 04-16, 04-17 e agora):

| # | Critério do plano | Valor real medido | Razão |
|---|---|---|---|
| 1 | Grep nos arquivos de teste do gap closure = **0** | **2** | As 2 restantes vivem em **string** (nome de caso e mensagem de asserção), não em comentário. Zerá-las violaria o critério **absoluto** de diff exclusivamente de comentário do mesmo plano. Documentadas nominalmente com arquivo, linha e conteúdo |
| 2 | Lista `files` do plano: 5 arquivos `.js` | **12** arquivos `.js` | O próprio plano manda derivar a lista da medição ("A lista de arquivos efetivamente alterados nesta task sai da MEDIÇÃO, não desta lista de `files`"). A medição achou 53 linhas, não as 7 da tabela do review — e 2 arquivos de produção que a tabela não citava |

**Também previsto e observado:** os 5 arquivos de teste do gap closure que já estavam em 0 não entraram no diff, exatamente como a seção `baseline` inferiu.

**Total deviations:** 0 (Regras 1-4); 2 desvios de medição declarados.

## Issues Encountered

- **`npx` continua não funcionando nesta máquina** (mesmo achado do 04-12 ao 04-17). O Biome foi invocado por caminho de pacote: `node backend/node_modules/.bin/biome …`.
- **`grep` desta máquina é `ugrep`** e recusa lista de arquivos passada por variável não-expandida — a medição por arquivo foi feita em laço `for`, não em invocação única. Sem efeito sobre o resultado; registrado para quem repetir a medição.
- **`biome format` reporta diagnósticos pré-existentes** em `dealId.validation.test.js` e `deals.errorLog.test.js` (literais de objeto acima de 80 colunas). **Nenhum deles é linha de comentário** e nenhum está no diff deste plano — o Biome não reflui comentário. O gate do projeto é `npm run lint`, que sai 0.
- **Lint reporta 44 warnings**, mesmo baseline das ondas anteriores; os 12 arquivos deste plano não acrescentam nenhum.

## Threat Flags

Nenhuma superfície nova. Itens do registro do plano:

| Threat ID | Disposição | Como foi tratado | Evidência |
|---|---|---|---|
| T-04-18-01 | mitigate | Conversão para âncora nomeada mais gate por grep que detecta reincidência | `backend/src` de 12 para 0; convenção de 2 linhas no topo de `agendor.js` com o comando do gate |
| T-04-18-02 | mitigate | Diff comment-only verificado por contagem; suíte completa no verify | `git diff … \| wc -l` = **0**; 148/148 verdes; `git diff --name-only backend/package*.json frontend/` vazio |
| T-04-18-03 | mitigate | Nenhum valor real copiado do review para os todos; regra explícita seguida | `node --test test/secrets.grep.test.js` exit 0, `# pass 3`. Os 4 todos citam nomes de variável (`AGENDOR_TOKEN`, `SMTP_PASS`) mas nenhum valor |
| T-04-18-04 | mitigate | Nenhum artefato novo toca `sec-01` | `grep -ci "sec-01.*resolvid"` = **0** nos 4; o todo `sec-01-rotate-agendor-token` não foi editado |
| T-04-18-05 | accept | IN2-03 registrado como todo, com correção sugerida e a regra de precaução ("qualquer `logger.*` novo nesse caminho precisa vir DEPOIS desta correção") | `.planning/todos/pending/in2-03-mensagem-de-erro-interpola-id.md` |
| T-04-18-SC | accept | Nenhuma instalação de pacote | `backend/package.json` e lockfile sem diff |

## Known Stubs

Nenhum. Este plano não produz código executável — o diff dos `.js` é 100% comentário.

## User Setup Required

None.

## Next Phase Readiness

- **Este é o último plano da Fase 4.** Os 18 planos estão completos: 7 originais, 4 de gap closure r1, 7 de gap closure r2. A fase está pronta para verificação.
- **Para quem verificar a fase, três pontos que exigem leitura e não só grep:**
  1. **REL-04 mudou de redação, não de garantia** (decisão C9). Não procurar `orgCategoryCache` — ele não existe mais desde o 04-12, por decisão aprovada. A propriedade é isolamento por execução, provada por `agendor.cacheConcurrency.test.js` (as duas direções do entrelaçamento) e `agendor.cacheInvalidation.test.js` (refetch entre rodadas), ambos verdes sem edição de asserção.
  2. **SEC-01 permanece ABERTO** como risco conscientemente aceito (decisão C8). Nenhum artefato desta fase o marca resolvido, e isso é intencional.
  3. **Duas referências por linha permanecem** em `scheduler.resilience.test.js` (linhas 190 e 247), em string. São dívida conhecida, não descuido — a razão está na seção "As 2 ocorrências que ficaram", acima.
- **Dívida registrada e rastreável:** `in2-01` a `in2-04` em `.planning/todos/pending/`, mais os pendentes anteriores (`sec-01`, `sec-02`, `ops-01`, `in-01` a `in-04`, `cr-02b`, `rel-02b`, `rel-05b`).
- **Disponível para a Fase 5/7, sem bloqueio:** a deduplicação da cópia local de `avancarRelogioAte` em `emailer.timeout.test.js` — o motivo de mantê-la expirou com o 04-17 e este plano não a alterou (só o helper compartilhado teve um ponteiro convertido). Aquele arquivo é também o segundo maior residual de referências por linha (5).
- **Candidato natural a step de CI numa fase futura:** o grep do gate de WR2-06, que roda em menos de um segundo e detecta a reincidência do padrão em qualquer PR.

## Self-Check: PASSED

- Arquivos declarados existem: os 4 todos em `.planning/todos/pending/` (82/79/76/74 linhas), os 12 `.js` modificados, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` e este SUMMARY.
- Commits declarados existem: `5f6ece8` (Task 1, 12 arquivos), `af4e3ca` (Task 2, 6 arquivos).
- Nenhum arquivo temporário deixado para trás; `git status --short` limpo após cada commit.

---
*Phase: 04-confiabilidade-das-integra-es*
*Completed: 2026-08-05*
