---
phase: 04-confiabilidade-das-integra-es
plan: 38
subsystem: planning
tags: [planejamento, todos, roadmap, rastreabilidade, gap-closure-r5, residuo-documental, core-value]
requires:
  - "`.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW-r5.md` — a fonte dos oito achados, com a medição de cada um"
  - "plano 04-36 (CR5-01) e plano 04-37 (WR5-01) — os dois únicos consertos da rodada, já executados"
  - "os 33 todos pendentes existentes — base da verificação de duplicidade"
provides:
  - "oito todos pendentes cobrindo WR5-02..WR5-05 e IN5-01..IN5-04, cada um com a evidência MEDIDA preservada"
  - "`wr5-05` (ALTA) — o resíduo de maior prioridade da rodada: o oráculo de quem-recebe deixou de detectar e-mail DUPLICADO nos três cenários mais novos"
  - "bloco `Gap closure r5` no ROADMAP, com o escopo travado, a mudança de perfil e o mandato estrutural (INVENTÁRIO DE IRMÃOS + direção reversa + retroatividade da justificativa)"
  - "sete pares declarados, para que nenhum dos dois itens de um par seja fechado pela metade"
affects:
  - ".planning/todos/pending/ (33 → 41 arquivos)"
  - ".planning/ROADMAP.md"
tech-stack:
  added: []
  patterns:
    - "achado fora do escopo de correção vira arquivo com a MEDIÇÃO que o sustenta, nunca com a intenção"
    - "convenção WR2-06 aplicada ao próprio artefato: zero referências por número de linha nos oito"
    - "par declarado dentro do arquivo, com o motivo — o vizinho é referenciado, nunca duplicado"
key-files:
  created:
    - ".planning/todos/pending/wr5-02-aviso-de-categoria-por-negocio-no-caminho-de-leitura.md"
    - ".planning/todos/pending/wr5-03-limiar-do-alarme-de-forma-do-funil-com-n-pequeno.md"
    - ".planning/todos/pending/wr5-04-supressao-por-funil-fora-do-log-estruturado.md"
    - ".planning/todos/pending/wr5-05-assercoes-de-envio-afrouxadas-perdem-duplicata.md"
    - ".planning/todos/pending/in5-01-results-error-com-dois-significados.md"
    - ".planning/todos/pending/in5-02-envelope-nulo-nas-tres-paginacoes.md"
    - ".planning/todos/pending/in5-03-guarda-de-nulo-larga-demais-no-oraculo-do-resumo.md"
    - ".planning/todos/pending/in5-04-lote-de-organizacoes-sem-pausa-entre-lotes.md"
  modified:
    - ".planning/ROADMAP.md"
decisions:
  - "D-04-38-a: WR5-05 é o ÚNICO alta da leva — a duplicata é a outra metade do Core Value, e o achado está justamente nos cenários que exercitam o comportamento mudado pelas rodadas 4 e 5"
  - "D-04-38-b: 04-36 e 04-37 permanecem `[x]` no ROADMAP em vez de virarem `[ ]` como o plano previa — eles JÁ estavam marcados pelos próprios executores e marcá-los pendentes registraria fato falso"
  - "D-04-38-c: a linha `**Plans**` foi corrigida por MEDIÇÃO do disco (38 planos), com a decomposição explícita incluindo o 04-35 (promoção do in3-08), que não pertence a nenhuma rodada de gap closure"
  - "D-04-38-d: os oito arquivos REFERENCIAM os vizinhos temáticos (cr-02b, in4-03, cr4-01c, wr4-04b) em vez de duplicá-los — duplicar um achado com dono é como esta fase quase fechou o cr4-01b com o defeito de pé"
metrics:
  duration: "~35 min"
  completed: 2026-08-05
  tests: "196 → 196 (nenhum caso acrescentado; suíte rodada como PROVA)"
  commits: 3
---

# Phase 4 Plan 38: Resíduo documental da rodada 5 Summary

Fechou o **resíduo documental da gap closure r5**: os oito achados que o usuário excluiu do escopo
de correção (**WR5-02..WR5-05** e **IN5-01..IN5-04**) passaram a ter arquivo próprio, cada um
carregando a **medição** que o revisor registrou — e o ROADMAP passou a registrar a rodada 5 com o
escopo travado, a mudança de perfil e o mandato estrutural acrescido de duas cláusulas. Este plano
**não conserta nada**: torna rastreável o que ficou por corrigir. Diff de código **zero**, medido
nas três tasks.

## Os oito arquivos criados

| Arquivo | Prioridade | Linhas | O que preserva |
|---|---|---|---|
| `wr5-02-aviso-de-categoria-por-negocio-no-caminho-de-leitura.md` | média | 69 | A justificativa que condena a forma foi escrita pelo **04-35 na mesma função**; o aviso por negócio é a **única** fonte que nomeia a organização (a saída é agregar, não apagar); sonda de 3 negócios → 3 avisos numa chamada; 8 invocações fora do módulo e auto-refresh de 300 s; **nenhum** caso da suíte mede a **cardinalidade** de nenhum dos dois avisos |
| `wr5-03-limiar-do-alarme-de-forma-do-funil-com-n-pequeno.md` | média | 70 | A mensagem é factualmente **falsa** com N = 1; `results.stale` é o subconjunto parado, não o total do CRM; os cenários **I e J** usam **2** negócios cada, e uma implementação com piso e outra sem piso passam nos dois; o par que falta (N = 1 exige silêncio, N = piso exige alarme); e **por que o raciocínio não vale** para o alarme de categoria |
| `wr5-04-supressao-por-funil-fora-do-log-estruturado.md` | média | 64 | Os dois contadores decidem a mesma coisa por caminhos incompatíveis; em produção o `logger` emite JSON com nível e o `console.log` não; o módulo **já importa** `logger` e o usa na **linha seguinte**; as demais ocorrências de log cru do arquivo são **legado não tocado** |
| `wr5-05-assercoes-de-envio-afrouxadas-perdem-duplicata.md` | **alta** | 76 | As **duas formas lado a lado** (`=== 1` em A/B/C, `>= 1` em H/I/J), o que **cada uma** detecta, as **10** asserções afetadas, a ausência de justificativa técnica (o valor exato é 1), a instrução operacional (**se algum ficar vermelho, o vermelho é o achado**) e o precedente dos cenários **L e M** do 04-37 |
| `in5-01-results-error-com-dois-significados.md` | média | 67 | Os dois significados incompatíveis; a medição que o classifica como **latente** (`lastRunResult` em `frontend/src` = **1** ocorrência, que lê o array de erros); as **duas** saídas possíveis; e que o **04-37 estreitou a mensagem**, o que reduz o dano de leitura humana mas **não** resolve a ambiguidade para consumidor programático |
| `in5-02-envelope-nulo-nas-tres-paginacoes.md` | média | 54 | O residual é **uniforme** às três e o conserto de WR4-05 estava correto quanto à assimetria anterior; e que o oráculo entra como **modo novo da armação** do caso `IRMÃS VERIFICADAS` de `agendor.paginacao.test.js`, não em arquivo próprio |
| `in5-03-guarda-de-nulo-larga-demais-no-oraculo-do-resumo.md` | baixa | 53 | Nomeia o helper `assertHtmlSemNuloNoNome` e os cenários 5, 6 e 7; o vermelho pelo motivo errado (dado legítimo contendo a substring); a saída (restringir ao bloco da **saudação**) e a mesma correção para o irmão que procura `undefined` |
| `in5-04-lote-de-organizacoes-sem-pausa-entre-lotes.md` | baixa | 66 | A distinção **pico x taxa** escrita por extenso (25 organizações em 3 lotes encostados); as **duas** saídas, com a barata recomendada (ajustar o comentário); e que o oráculo atual mede **exclusivamente o pico em voo**, então a distinção hoje não tem guarda-corpo |

Total: **279 + 240 = 519 linhas**, todas dentro da faixa 40-95 por arquivo exigida pelo molde da
fase.

## Verificação de duplicidade

Antes de criar cada arquivo, confirmei que o achado **não tinha dono** entre os 33 pendentes.
Nenhum dos oito estava coberto. Os vizinhos temáticos existem e foram **referenciados**, nunca
duplicados:

| Achado novo | Vizinho existente | Por que NÃO foi duplicado |
|---|---|---|
| `wr5-04` | `cr-02b` | O `cr-02b` cobre o log cru de `index.js`; o `wr5-04` cobre o par de contadores de `emailer.js`. Módulos diferentes, mesmo defeito de mecanismo — o arquivo novo declara o par e aponta a **Fase 5** como absorvedora natural dos dois |
| `wr5-05` | `in4-03` | O `in4-03` é uma asserção **decorativa** (não pode ficar vermelha); o `wr5-05` é uma asserção que **deixou de medir metade do contrato**. Direções complementares no mesmo instrumento — o arquivo novo declara o par e diz que quem revisar aquele arquivo fecha os dois na mesma passagem |
| `in5-01` | `cr4-01c` | O `cr4-01c` é o motivo por **negócio** que não chega à UI; o `in5-01` é o motivo da **rodada** que a UI não distingue. O próprio revisor registrou que andam juntos, e o arquivo novo o declara |
| `in5-03` | `in4-03` | Higiene do **mesmo tipo de instrumento**, em graus opostos (larga demais x decorativa). Referenciado, não recriado |
| `in5-04` | `wr4-04b` | Os dois são **fan-out proporcional ao dado** na borda da Agendor, por caminhos diferentes (rodada de enriquecimento x handler de resolvidos). Referenciado, não recriado |
| `in5-02` | caso `IRMÃS VERIFICADAS` de `agendor.paginacao.test.js` | O conserto entra como **modo novo** de uma armação que já existe. Criar arquivo de teste novo duplicaria armação — está escrito no arquivo |
| `wr5-02` | `wr5-03` | Par interno da leva (ruído no sinal), declarado nos dois arquivos com o mesmo motivo |

Nenhum todo existente foi editado. Medido nas três tasks:
`git status --porcelain .planning/todos/pending/ | grep -c '^ M'` = **0** — as únicas mudanças no
diretório são arquivos **não rastreados**. `sec-01` permanece **ABERTO** (decisão C8) e o valor do
`AGENDOR_TOKEN` não aparece em nenhum artefato (gate de grep = **0** nos oito).

## Números medidos

| Medida | Antes | Depois |
|---|---|---|
| Arquivos em `.planning/todos/pending/` | **33** | **41** |
| Todos de prioridade alta criados nesta leva | — | **1** (`wr5-05`) |
| `grep -cE '\.js:[0-9]\|linhas? [0-9]'` nos oito (convenção WR2-06) | — | **0** em cada |
| `git status --porcelain backend/ frontend/` | vazio | **vazio** (3 tasks) |
| Suíte backend | 196/196 | **196/196** |
| `npm run lint` (backend) | exit 0, 44 warnings | **exit 0, 44 warnings** |

Suíte e lint foram executados como **PROVA** de que nenhuma mudança de comportamento se disfarçou
de documentação — mesmo critério do 04-27 e do 04-34 —, não como gate de mudança.

## Divergências (medidas, nenhuma forçada)

### 1. O somatório da linha `**Plans**` — a décima segunda divergência de contagem da fase

- **Escrito no ROADMAP:** `= 34`
- **Previsto pelo plano:** 35 planos executados (04-01..04-35)
- **MEDIDO no disco:** `ls .planning/phases/04-confiabilidade-das-integra-es/*-PLAN.md | wc -l` =
  **38** (04-01..04-38)

A divergência confirma-se e é **maior** do que o plano previa, porque o plano foi escrito antes de
04-36, 04-37 e 04-38 existirem. A linha foi corrigida para **38** com a decomposição explícita —
7 originais + 4 (r1) + 7 (r2) + 9 (r3) + 7 (r4) + **1 (promoção do todo `in3-08` ao plano 04-35)**
+ 3 (r5). O termo do 04-35 precisou ser criado: ele não pertence a nenhuma rodada de gap closure e
era exatamente o que faltava para o somatório fechar. Nada além da linha foi reescrito.

### 2. Os checkboxes dos planos da r5 — premissa do plano superada pelos fatos

O plano mandava listar os três planos da r5 como **pendentes** (`- [ ]`) e fixava
`^- \[x\] 04-3[678]` = **0**. **MEDIDO:** 04-36 e 04-37 **já estavam** no ROADMAP marcados `[x]`,
acrescentados pelos **próprios executores** (commits `b9e377d` e `e0e8a4b`) ao **fim da lista da
r4**, porque o bloco da r5 ainda não existia.

Marcá-los `[ ]` registraria **fato falso** — os dois estão executados, com SUMMARY e commits. Foram
**mantidos `[x]`** e passaram a viver **sob o bloco da r5**, onde pertencem; apenas o **04-38** ficou
`[ ]`, para o coordenador fechar junto com a fase.

- `grep -cE '^- \[ \] 04-3[678]-PLAN.md'` = **1** (esperado 3)
- `grep -cE '^- \[x\] 04-3[678]-PLAN.md'` = **2** (esperado 0)

O gate estrutural que de fato protege o conteúdo aprovado pelo usuário **passou**:
`git diff -U0 .planning/ROADMAP.md | grep -c '^-[^-]'` = **1**, e a única linha removida é a
`**Plans**`. Isso porque inserir o bloco da r5 **antes** daquelas duas linhas é, para o git, uma
**inserção pura** — nenhuma linha das rodadas 1-4 foi tocada. As descrições de 04-36 e 04-37 foram
preservadas **byte a byte**, em vez de reescritas com a redação do plano, para que a movimentação
seja verificável como movimentação.

`Success Criteria` no diff = **0**; `| Phase` no diff = **0**; `.planning/REQUIREMENTS.md` intocado.

### 3. Armadilha de medição (NÃO é divergência)

`grep -c 'Gap closure r5' .planning/ROADMAP.md` devolve **2**, não 1. A segunda ocorrência é
**preexistente**: está na descrição de uma linha da Fase 4, que ainda diz *"Gap closure r5
pendente"*. A ocorrência que o critério pede está onde deveria — no cabeçalho do bloco novo. Mesma
classe da armadilha registrada pelo 04-27 (`indecidível` = 3, não 1). O número do plano não foi
forçado.

Observação relacionada, **fora do escopo deste plano** e deixada para o coordenador: aquela mesma
linha da Fase 4 ainda diz "35/35 planos executados" e a tabela de Progresso ainda registra `35/35`.
O `<action>` da Task 3 enumera exatamente o que muda no ROADMAP (o bloco novo e a linha `**Plans**`)
e nenhuma das duas está na lista; corrigi-las aqui acrescentaria remoções ao diff e violaria o gate
que protege as rodadas anteriores.

### 4. Dívida de ferramental — quarta execução consecutiva, ainda SEM DONO

`npm run format` **não existe na raiz do repositório** (só em `backend/` e `frontend/`), e o
`biome format --write .` do backend reformata **seis** arquivos de teste **preexistentes**, alheios a
qualquer plano (dívida de `lineWidth` 80). A divergência já apareceu em **04-26, 04-36, 04-37** e
agora no **04-38** — quatro execuções, nenhum dono.

Este plano **não invocou o formatador** (não há código no diff), então não precisou reverter nada,
mas a dívida continua de pé. **Não foi registrada como todo novo**: os `<files>` deste plano são
fechados nos oito artefatos e no ROADMAP, e criar um nono arquivo seria escopo que o usuário não
travou. O plano 04-38 **não** tinha item equivalente — portanto não houve duplicação, e o item
segue sem dono, com prioridade baixa/média, para quem planejar a próxima rodada ou a Fase 5.

## Deviations from Plan

Nenhuma regra de desvio (Rule 1-4) foi acionada: não houve bug a corrigir, funcionalidade crítica
ausente nem bloqueio. Nenhum pacote foi instalado — o portão humano de legitimidade de pacote
(T-04-38-SC) não se aplicou. As duas divergências acima são de **medição e premissa**, resolvidas
medindo e registrando, não forçando o número.

## Estado final da fase 04 — o que fica ABERTO depois da gap closure r5

1. **`cr4-01b`** — o caminho do negócio **sem organização**, que nunca recebe a marca de categoria
   indecidível. Reescrito pelo 04-37 (a causa antiga foi marcada como rejeitada, com o motivo), e
   **continua aberto**.
2. **Os oito achados desta leva** — `wr5-02`, `wr5-03`, `wr5-04`, `wr5-05` (**alta**), `in5-01`,
   `in5-02`, `in5-03`, `in5-04`. Este plano os torna **rastreáveis**, não os conserta.
3. **Os demais 33 pendentes**, entre eles `in-01` (média, C10), `rel-02b` (alta / pré-go-live, C11),
   `sec-01` (**aberto**, risco conscientemente aceito em C8), `cr4-01c`, `wr3-07b`, `wr4-03b`,
   `wr4-04b`, `wr4-07b`, `in3-01`..`in3-08b` e `in4-02`..`in4-06`. Total: **41**.

A **Fase 4 NÃO foi marcada completa** por este plano — o checkbox da fase continua `[ ]`,
`completed_phases` continua **3** e `percent` continua **38**. Quem fecha a fase é o coordenador,
por verificação ou por uma sexta rodada de review.

Para quem seguir: o item de maior valor desta leva é o **`wr5-05`**. Ele não é higiene — é a metade
do Core Value ("quem **não** recebe indevidamente") que o oráculo deixou de medir, exatamente nos
cenários que exercitam o comportamento mudado nas duas últimas rodadas.

## Commits

| Task | Commit | O que registra |
|---|---|---|
| 1 | `23e90b5` | WR5-02..WR5-05 como todos pendentes (wr5-05 ALTA) |
| 2 | `590de1a` | IN5-01..IN5-04 como todos pendentes (pendentes 33 → 41) |
| 3 | `d7834f8` | Bloco `Gap closure r5` no ROADMAP e a linha `**Plans**` corrigida por medição |
