---
phase: 04-confiabilidade-das-integra-es
plan: 34
subsystem: testing
tags: [documentacao, todos, roadmap, observabilidade, gap-closure-r4, rastreabilidade]

# Dependency graph
requires:
  - phase: 04 (planos 04-28 a 04-33)
    provides: os consertos da rodada 4 e os inventários de irmãos que declararam os residuais
provides:
  - 5 todos pendentes para os achados Info IN4-02 a IN4-06
  - 5 todos pendentes para os residuais declarados nos inventários de irmãos da r4
  - IN4-01 registrado como FECHADO com medição, sem arquivo
  - Success criterion 8 da Fase 4 no ROADMAP, escrito como comportamento garantido
affects: [code review rodada 5, fechamento da fase 04, fase 05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Achado Info vira todo pendente, não plano (precedente IN2-*, IN3-*, agora IN4-*)"
    - "Achado fechado por efeito de outro plano é registrado com MEDIÇÃO em vez de virar arquivo (precedente in2-02/04-26, agora IN4-01/04-30)"
    - "Todo item classificado como fora-de-escopo-com-medição no inventário de irmãos ganha arquivo próprio, carregando a medição que o justificou"
    - "Critério de ROADMAP escrito como comportamento garantido, sem nomear identificador (lição C9)"

key-files:
  created:
    - .planning/todos/pending/in4-02-justificativa-do-retry-descreve-mecanismo-inexistente.md
    - .planning/todos/pending/in4-03-assercao-decorativa-em-categoriaindecidivel.md
    - .planning/todos/pending/in4-04-leitura-de-success-divergente-entre-ramos.md
    - .planning/todos/pending/in4-05-literal-100-em-tasks-sem-constante.md
    - .planning/todos/pending/in4-06-teto-de-tasks-sem-medicao-de-volume.md
    - .planning/todos/pending/cr4-01b-limiar-de-supressao-total.md
    - .planning/todos/pending/cr4-01c-skipreason-invisivel-na-ui.md
    - .planning/todos/pending/wr4-03b-referencias-por-linha-nos-demais-arquivos-de-teste.md
    - .planning/todos/pending/wr4-04b-fanout-proporcional-em-resolved.md
    - .planning/todos/pending/wr4-07b-saudacao-com-ownername-nulo.md
  modified:
    - .planning/ROADMAP.md

key-decisions:
  - "IN4-01 NÃO virou arquivo: fechado pelo 04-30 (D-WR4-04-e), com a medição `grep -c \"batches de 10\" backend/src/agendor.js` = 0 registrada aqui. Precedente: in2-02 fechado pelo 04-26"
  - "Os 5 achados Info foram CONFERIDOS no arquivo real antes de escritos — quatro vivem em módulos que os planos 04-28 a 04-31 editaram — e os 5 continuam válidos"
  - ".planning/REQUIREMENTS.md não foi tocado (D-IN4-e): a r4 acrescentou OBSERVABILIDADE de uma regra já coberta por REL-06, não uma regra nova; criar um REL-07 fragmentaria a rastreabilidade de uma regra única"
  - "O critério 8 do ROADMAP declara também os NÃO-GATILHOS (supressão parcial, supressão total por outro filtro), porque é isso que distingue um alarme que discrimina a CAUSA de um que reage à quantidade"
  - "Os pares foram declarados NOS ARQUIVOS NOVOS, por referência — nenhum todo com prioridade decidida pelo usuário foi editado"
  - "wr4-03b ficou com 85 linhas contra o teto de 80: encurtar exigiria cortar a tabela de medição, um dos dois pares mandatados por D-IN4-d, ou o aviso de conferência — registrado como divergência, não forçado"

patterns-established:
  - "Convenção de WR2-06 aplicada aos PRÓPRIOS artefatos: zero referências por número nos 10 todos, inclusive no wr4-03b, que fala SOBRE esse padrão"
  - "Todo que declara par nomeia o par e o motivo de fechá-los juntos, para que o achado não seja fechado pela metade"

requirements-completed: [REL-03, REL-06]

# Metrics
duration: 34min
completed: 2026-08-05
---

# Phase 4 Plano 34: Resíduo documental da rodada 4 Summary

**Os 6 Info e os 5 residuais dos inventários de irmãos da r4 saíram da fase com dono: 10 todos pendentes com a medição que os justificou, IN4-01 fechado com evidência em vez de arquivo, e o ROADMAP declarando que o apagão de categoria deixou de ser silencioso — com diff de código ZERO nas três tasks.**

## Performance

- **Duration:** ~34 min
- **Started:** 2026-08-05T19:22:00Z
- **Completed:** 2026-08-05T19:56:00Z
- **Tasks:** 3
- **Files modified:** 11 (10 criados, 1 editado)

## Accomplishments

- **Nenhum achado da rodada 4 termina a fase sem dono.** 5 Info viraram arquivo, 1 foi fechado com medição, e os 5 residuais que os inventários de irmãos dos planos 04-28 a 04-33 classificaram como "fora-de-escopo-com-medição" passaram a existir como trabalho rastreável. Sem esta task, o mandato da rodada produziria classificações sem dono — que é precisamente o defeito que ele existe para impedir.
- **Cada Info foi CONFERIDO no código real antes de escrito** (mitigação de R4-37). Quatro dos cinco vivem em módulos que os planos 04-28 a 04-31 reescreveram; nenhum perdeu objeto. IN4-01, o sexto, perdeu — e por isso não virou arquivo.
- **Cada residual carrega a medição que o excluiu do escopo**, incluindo a alternativa que foi avaliada e REJEITADA no `cr4-01b` (o denominador derivado faria o alarme falhar ABERTO por caminho novo).
- **O ROADMAP ganhou o critério 8**, escrito como comportamento garantido e sem nomear identificador, declarando também os não-gatilhos.
- **Diff de código ZERO nas três tasks**, medido: `git status --porcelain backend/ frontend/` vazio em cada uma. Suite 186/186 e lint exit 0 (44 warnings) — os mesmos valores da entrada, como exigido de um plano que não toca código.

## Task Commits

1. **Task 1: os cinco achados Info da rodada 4 viram todos pendentes** — `c17eada` (docs)
2. **Task 2: os cinco residuais dos inventários de irmãos viram todos pendentes** — `cee8b9c` (docs)
3. **Task 3: o ROADMAP ganha o critério do apagão de categoria** — `2badae0` (docs)

## Files Created/Modified

### Todos dos achados Info (Task 1)

| arquivo | prioridade | linhas | o que registra |
|---|---|---|---|
| `in4-02-justificativa-do-retry-descreve-mecanismo-inexistente.md` | baixa | 60 | a justificativa de manter a guarda de id fora do callback afirma "três vezes" e o retry não faz isso — texto repetido em DOIS arquivos |
| `in4-03-assercao-decorativa-em-categoriaindecidivel.md` | média | 63 | asserção verdadeira por construção do SUT: ficaria verde com a guarda removida |
| `in4-04-leitura-de-success-divergente-entre-ramos.md` | média | 58 | o mesmo campo lido com truthiness num ramo e igualdade estrita no outro, na mesma função |
| `in4-05-literal-100-em-tasks-sem-constante.md` | baixa | 59 | o mesmo número é tamanho de página E critério de parada, sem constante que os ligue |
| `in4-06-teto-de-tasks-sem-medicao-de-volume.md` | média | 64 | limiar fail-closed sobre volume que cresce com o uso, sem a medição que o sustente |

Prioridades conforme D-IN4-b, medidas: **2 baixa, 3 média**.

### Todos dos residuais dos inventários de irmãos (Task 2)

| arquivo | prioridade | linhas | origem |
|---|---|---|---|
| `cr4-01b-limiar-de-supressao-total.md` | média | 72 | inventário do 04-28 |
| `cr4-01c-skipreason-invisivel-na-ui.md` | média | 72 | inventário do 04-28 |
| `wr4-03b-referencias-por-linha-nos-demais-arquivos-de-teste.md` | média | 85 | inventário do 04-33 |
| `wr4-04b-fanout-proporcional-em-resolved.md` | média | 76 | inventário do 04-30 |
| `wr4-07b-saudacao-com-ownername-nulo.md` | baixa | 68 | inventário do 04-32 |

Prioridades conforme D-IN4-c, medidas: **4 média, 1 baixa**.

### ROADMAP (Task 3)

- `.planning/ROADMAP.md` — success criterion 8 da Fase 4. `git diff --numstat`: **1 adição, 0 remoções**.

## IN4-01 — FECHADO, com medição, sem arquivo

O achado dizia que o comentário do laço de páginas afirmava "batches de 10" ao lado de um
`batchSize` de 5. **Ele já não tem objeto.**

**Medição, feita antes de qualquer escrita:**

- `grep -c "batches de 10" backend/src/agendor.js` → **0**
- O comentário atual diz "em lotes de `batchSize`" — o número foi **removido**, não corrigido, de
  modo que o comentário aponte para o identificador, que não pode divergir de si mesmo.

**Justificativa do fechamento (D-WR4-04-e, plano 04-30):** aquele plano introduziu uma segunda
constante de lote cujo valor **É** 10 — o teto de concorrência da consulta de categoria. Deixar a
frase errada ao lado dela tornaria os dois lotes indistinguíveis, então a correção não foi carona:
era necessária para o próprio conserto. Fechar um Info como efeito de um conserto de warning não é
transformá-lo em plano, e o precedente está na fase: o 04-26 fechou o `in2-02` do mesmo modo.

Criar arquivo para um achado sem objeto seria criar trabalho que já não existe (R4-38).
`ls .planning/todos/pending/in4-01*` → **0**.

## Os 5 Info CONFERIDOS no código atual (mitigação de R4-37)

Quatro dos cinco vivem em arquivos que os planos 04-28 a 04-31 editaram. Todos continuam válidos:

| achado | medição no estado atual | veredito |
|---|---|---|
| IN4-02 | a frase "três vezes" está em `backend/src/agendor.js` **e** em `backend/test/agendor.retry429.test.js` (lá em caixa alta) | válido, e em dois lugares |
| IN4-03 | a asserção sobre a chave `NaN` do contador continua no arquivo; a montagem do conjunto de organizações continua filtrando valores falsos | válido |
| IN4-04 | leitura por truthiness no ramo de retorno e por igualdade estrita no canal parcial, ambos alimentando a mesma variável em `runCheck` | válido |
| IN4-05 | o literal aparece como `per_page` e no critério de parada do mesmo laço | válido |
| IN4-06 | o teto continua sendo a constante compartilhada do módulo; nenhum SUMMARY da fase registra medição de volume | válido |

## Decisões Made

- **IN4-01 fechado com medição, não convertido em arquivo** (D-IN4-a). Registrado acima.
- **`.planning/REQUIREMENTS.md` intocado** (D-IN4-e), medido: `git status --porcelain` vazio. O texto de REL-06 já cobre o **comportamento** ("resultado completo ou falha explícita", com a extensão de CR3-01 registrada pelo 04-27). O que a rodada 4 acrescentou não é regra nova — é a **observabilidade** dela. Observabilidade é critério de sucesso da fase, não requisito novo, e um REL-07 fragmentaria a rastreabilidade de uma regra única.
- **O critério 8 declara os NÃO-GATILHOS.** Além do que o alarme faz, o item diz o que ele **não** faz: supressão parcial não dispara, e supressão total causada por outro filtro (dedup, funil, ausência de destinatário) não dispara. É essa metade que distingue um alarme que discrimina a **causa** de um que reage à **quantidade** — exatamente a distinção que o par de cenários D+E do 04-28 pinou.
- **Pares declarados nos arquivos NOVOS, nunca por edição do arquivo apontado** (D-IN4-d, mitigação de R4-39): `cr4-01c` nomeia `in-01` e `in2-04`; `wr4-03b` nomeia `in3-06` e `in3-04`; `wr4-04b` nomeia `in3-02` e RETN-01 (v2); `in4-04` nomeia `in3-01`; `in4-05` e `in4-06` nomeiam um ao outro. Medido: `git status --porcelain .planning/todos/` listou **apenas** os 10 arquivos novos, todos como não rastreados.
- **`in3-08` não foi tocado.** Continua aberto, com a prioridade alta decidida pelo usuário: consertá-lo mudaria QUEM RECEBE, está pinado como quirk em `agendor.funnel.test.js`, e a pergunta é de DIREÇÃO.
- **SEC-01 permanece ABERTO** (decisão C8). Nenhum artefato deste plano o declara resolvido, e nenhum valor de segredo aparece: `grep -ric "AGENDOR_TOKEN\|smtp_pass"` → **0** nos 10 arquivos criados e no diff do ROADMAP.

## Divergências de medição — registradas, nenhuma forçada

Esta é a **décima** rodada da fase com divergência de contagem. Nenhuma foi forçada, seguindo o padrão da fase.

### 1. `wr4-03b`: 41 linhas em 10 arquivos, não 39 em 9

O plano e o `04-33-SUMMARY.md` previam 39 linhas com referência por número em 9 arquivos de teste sem dono. **Medido: 43 linhas em 12 arquivos no total**, dos quais 41 em 10 ficam sem dono.

Duas causas, ambas verificadas arquivo a arquivo:

- **`db.smtpPassMigration.keep.test.js` tem 2, não 1.** Uma ocorrência menciona um número de linha em prosa (sobre o `setup.js`) e a outra é uma referência a um módulo de rota por número. O inventário do 04-33 registrou apenas uma delas.
- **`config.bootFailFast.test.js` tem 1 e estava inteiramente FORA da lista.** É uma menção em prosa a "linha 2" de um plano — uma referência de segunda ordem, que o padrão de busca casa e que a limpeza vai ter de decidir o que fazer com ela.

Os outros oito valores bateram exatamente. A conclusão que importa — o volume sem dono é uma ordem de grandeza maior do que o `in3-06` cobre — sobrevive e fica **mais forte**. O arquivo criado carrega a tabela **medida**, não a prevista.

### 2. `wr4-03b` ficou com 85 linhas contra o teto de 80

Classe: **orçamento de prosa** — a mesma classe da divergência nº 1 do 04-33. O arquivo carrega três coisas que os outros quatro não carregam: uma tabela de 10 arquivos com contagem (que **é** a medição, e sem a qual o registro vira nota vaga), duas exclusões declaradas com o motivo de cada uma, e dois pares mandatados por D-IN4-d. Uma passada de compactação de prosa levou de 87 para 85 sem perder conteúdo; ir a 80 exigiria cortar substância mandatada pela própria ação do plano. **Não forçado.** O piso de 40 linhas do `must_haves` está satisfeito com folga.

### 3. `grep -c "skippedCategoriaIndecidivel\|seraNotificado\|results.error" .planning/ROADMAP.md` → 1, não 0

**É a armadilha de medição que o 04-27 documentou e que este plano previu.** A ocorrência é `results.error` na **linha de resumo da Fase 4 no topo do ROADMAP**, na lista de milestones — texto **pré-existente**, escrito quando a rodada 4 foi aberta para descrever o blocker CR4-01. Não está no diff desta task.

Medição refinada, que responde a pergunta que o critério de fato faz: `git diff -U0 .planning/ROADMAP.md | grep -c "..."` → **0**. O critério novo não nomeia identificador nenhum.

### 4. `git diff .planning/ROADMAP.md | grep -c "PLAN.md"` → 1, não 0

**Contexto de diff.** A linha que casa é `- [x] 04-01-PLAN.md`, que aparece como **contexto não modificado** (prefixo de espaço, não `+` nem `-`) porque o critério 8 foi inserido três linhas acima do início da lista de planos.

Medição refinada: `git diff -U0 .planning/ROADMAP.md | grep -c "PLAN.md"` → **0**. As quatro listas de planos ficaram byte a byte, como exigido.

As divergências 3 e 4 são da mesma classe — **o comando literal do plano apanha texto fora do escopo da task, e a conclusão sobrevive por medição refinada**. É a mesma classe da divergência nº 2 do 04-30.

## Números prescritos que BATERAM

- `ls .planning/todos/pending/in4-*.md | wc -l` → **5**
- `grep -h "^priority:" .planning/todos/pending/in4-*.md | sort | uniq -c` → **2 baixa, 3 média**
- `grep -cE "\.js:[0-9]|linhas? [0-9]"` → **0** em cada um dos **10** arquivos criados, inclusive no `wr4-03b`, que fala SOBRE esse padrão (D-IN4-g)
- `ls .planning/todos/pending/in4-01* | wc -l` → **0**
- `grep -c "batches de 10" backend/src/agendor.js` → **0**
- `ls .planning/todos/pending/ | wc -l` → **33** (23 de entrada + 10)
- Success Criteria da Fase 4 → **8** itens numerados
- `git diff --numstat .planning/ROADMAP.md` → **1 adição, 0 remoções**
- `git diff .planning/ROADMAP.md | grep -c "| Phase"` → **0** (tabela de rastreabilidade intocada)
- `git status --porcelain backend/ frontend/ .planning/REQUIREMENTS.md` → **vazio** nas três tasks
- `grep -ric "AGENDOR_TOKEN\|smtp_pass"` nos 10 arquivos → **0** em todos
- Suite: **186/186** verdes; lint exit **0** (44 warnings, baseline) — idênticos à entrada

## Deviations from Plan

**None — plan executed exactly as written.** Nenhuma Rule 1-4 foi acionada, nenhum pacote foi instalado, nenhum arquivo de `backend/` ou `frontend/` foi tocado.

As quatro divergências acima são de **medição**, não de escopo: em nenhuma delas o plano foi contrariado — em três, o número previsto estava errado e o medido foi registrado; na quarta, o teto de prosa foi excedido por conteúdo que o próprio plano mandatou.

## Issues Encountered

Nenhum. As duas fricções — o teto de linhas do `wr4-03b` e os dois greps que devolveram 1 — foram resolvidas por medição e registro, que é o procedimento que esta fase estabeleceu ao longo de nove rodadas anteriores.

## User Setup Required

None — nenhuma configuração de serviço externo.

## Next Phase Readiness

**A gap closure r4 está COMPLETA:** os 7 planos (04-28 a 04-34) executaram. O blocker CR4-01 e os 7 warnings foram fechados; os 6 Info e os 5 residuais têm dono.

**A fase 04 permanece REABERTA.** Quem decide fechá-la é o coordenador, depois do code review rodada 5. `completed_phases` continua **3** e `percent` **38** no STATE.

**Para o revisor da rodada 5:**

- O mandato desta rodada foi o **inventário de irmãos**, e ele produziu 5 residuais que este plano transformou em arquivo. Se o mandato for avaliado, a pergunta útil é se os itens classificados como "verificada-e-sã" foram provados por medição ou presumidos por leitura.
- O `wr4-03b` é o item com maior volume conhecido e carrega um aviso que vale repetir: **quem for fechá-lo precisa CONFERIR cada referência contra o arquivo apontado antes de convertê-la.** O 04-33 converteu quatro e as quatro estavam erradas.
- O `cr4-01b` descreve um caminho em que o alarme do blocker desta rodada **falha aberto**. Não é regressão do conserto — é o cenário misto, que o limiar decidido pelo usuário não cobria.
- **`in3-08` continua aberto por decisão do usuário** e não deve ser fechado por iniciativa de plano: a pergunta é de direção (fail-open ou fail-safe para os filtros de elegibilidade).
- **SEC-01 continua aberto como risco conscientemente aceito** (C8).

## Known Stubs

Nenhum. Este plano não cria código.

## Threat Flags

Nenhuma superfície de segurança nova. As três fronteiras do threat model deste plano foram medidas: nenhum todo com prioridade do usuário foi editado (T-04-34-03), nenhuma linha de código mudou (T-04-34-02), e nenhum segredo aparece em artefato nenhum (T-04-34-04).

---
*Phase: 04-confiabilidade-das-integra-es*
*Completed: 2026-08-05*
