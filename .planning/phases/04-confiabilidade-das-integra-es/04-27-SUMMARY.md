---
phase: 04-confiabilidade-das-integra-es
plan: 27
subsystem: planejamento
tags: [todos, roadmap, requirements, gap-closure-r3, documental]
requires: [04-19, 04-20, 04-21, 04-22, 04-23, 04-24, 04-25, 04-26]
provides:
  - "Os 8 achados Info da rodada 3 (IN3-01..IN3-08) como todos pendentes rastreáveis"
  - "Success Criteria 7 da Fase 4: o comportamento garantido do fail-safe de categoria"
  - "Nota de CR3-01 em REL-06, estendendo 'completo ou falha explícita' à consulta de categoria"
affects: [.planning/todos/pending/, .planning/ROADMAP.md, .planning/REQUIREMENTS.md]
tech-stack:
  added: []
  patterns: ["achado de review vira arquivo de todo com origem, evidência e correção proposta", "critério de fase descreve comportamento, nunca mecanismo (C9)"]
key-files:
  created:
    - .planning/todos/pending/in3-01-coluna-error-perde-destinatario.md
    - .planning/todos/pending/in3-02-sendmailwithretry-sem-tentativa.md
    - .planning/todos/pending/in3-03-cache-somente-escrita.md
    - .planning/todos/pending/in3-04-convencao-de-comentario-sem-casa-e-sem-gate.md
    - .planning/todos/pending/in3-05-stoptasks-duplicado.md
    - .planning/todos/pending/in3-06-referencia-por-linha-em-mensagem-de-assercao.md
    - .planning/todos/pending/in3-07-transporte-por-deal.md
    - .planning/todos/pending/in3-08-filtros-de-elegibilidade-fail-open.md
  modified:
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
decisions:
  - "D-IN3-b aplicada sem alteração: in3-01 média, in3-02 baixa, in3-03 baixa, in3-04 média, in3-05 baixa, in3-06 baixa, in3-07 média, in3-08 ALTA (candidato a promoção a requisito)"
  - "D-IN3-d respeitada: o ROADMAP ganhou um item 7 NOVO; os itens 1 a 6 não foram tocados (0 remoções com orgCategoryCache no diff)"
  - "D-IN3-e respeitada: REL-06 recebeu nota entre parênteses, sem REL-07 e sem mexer na tabela de rastreabilidade"
  - "in3-02 REFERENCIA in2-01 em vez de duplicá-lo (D-IN3-c), e declara que os dois fecham juntos"
metrics:
  duration: ~25min
  tasks: 3
  files_created: 8
  files_modified: 2
  completed: 2026-08-05
---

# Phase 4 Plan 27: Resíduo Documental da Rodada 3 Summary

Os 8 achados Info da rodada 3 viraram todos pendentes rastreáveis (nenhum virou plano, nenhuma
linha de `backend/` mudou) e a Fase 4 passou a descrever, no ROADMAP e em REQUIREMENTS, o
comportamento fail-safe de categoria que a rodada entregou.

## O que foi feito

**Task 1 — os 4 Info que tocam comportamento** (commit `45a6312`):

| Todo | Prioridade | O que registra |
|---|---|---|
| `in3-01-coluna-error-perde-destinatario` | média | O ramo de EXCEÇÃO de `runCheck` grava só `err.message` na coluna `error`, enquanto os parciais — já lidos e validados nas duas camadas duas instruções acima — carregam o `{ to, error }` de quem falhou. Quando o parcial confirma e a linha vira `'sent'`, essa coluna é o único vestígio de quem não recebeu. Tratar junto de `in2-04`. |
| `in3-02-sendmailwithretry-sem-tentativa` | baixa | Irmão exato de `in2-01`: com `retries <= 0` o `for` não itera e a função cai no fim sem `return`; os dois call-sites desestruturam. Não alcançável hoje, mas público na assinatura. |
| `in3-07-transporte-por-deal` | média | O ganho de WR2-05 não atravessa negócios (`sendStaleNotification` cria transporte na entrada e é chamada uma vez por negócio) e o caso (3) chama de "rodada" o que é um negócio — a mesma palavra com dois sentidos nos dois lados da fronteira. |
| `in3-08-filtros-de-elegibilidade-fail-open` | **alta** | `shouldNotifyOwner` transforma funil ausente em string vazia → notifica. Pinado como quirk, por isso Info. O que falta é a avaliação de risco: **é o segundo filtro de elegibilidade que falha aberto, e o primeiro foi o bloqueante desta rodada**. |

**Task 2 — os 4 Info de convenção e higiene** (commit `10f146a`): `in3-03` (baixa, o `Map` por
execução existe para ESCOPO e a dedup mora no `Set`), `in3-04` (média, a convenção de WR2-06 sem
casa no `CLAUDE.md` e sem gate no CI), `in3-05` (baixa, `stopTasks` duplicado no topo de
`scheduleTask`), `in3-06` (baixa, converter só a MENSAGEM de asserção).

**Task 3 — ROADMAP e REQUIREMENTS** (commit `edd7cfb`).

## As duas decisões que este plano NÃO reabriu

**D-IN3-d — o item 4 dos Success Criteria não foi reescrito.** Ele carrega a redação aprovada pelo
usuário em C9. Substituir uma redação aprovada sem que o usuário peça é o oposto do que C9
estabeleceu. O ROADMAP ganhou um item **7 novo**, e a prova é o diff:
`git diff .planning/ROADMAP.md | grep -E "^-[^-]" | grep -c "orgCategoryCache"` = **0** — nenhuma
linha foi removida do bloco, só uma acrescentada (1 inserção, 0 remoções no arquivo inteiro).

**D-IN3-e — REL-06 recebeu nota, não um REL-07.** A regra é a mesma ("resultado completo ou falha
explícita, nunca proteção parcial silenciosa"), aplicada a uma segunda consulta. A nota registra a
diferença que importa: aqui a falha é explícita e **escopada ao negócio afetado**, em vez de custar
a rodada inteira como em `/tasks`. Tabela de rastreabilidade intacta:
`git diff .planning/REQUIREMENTS.md | grep -E "^[+-][^+-]" | grep -c "| Phase"` = **0**.

## O item 7 foi escrito como comportamento, não como mecanismo

Esta é a lição de C9 aplicada preventivamente. O critério novo não nomeia
`CATEGORIA_INDECIDIVEL`, nem `fetchWithRetry`, nem `categoriaIndecidivel` — nenhum identificador
que um refactor futuro possa apagar, deixando o verificador procurando por algo inexistente. O que
ele afirma são as quatro metades observáveis da decisão do usuário de 2026-08-05, todas medidas
pelos planos 04-19/20/21:

1. fora de **todo** e-mail dirigido ao responsável (diário e semanal individual);
2. **visível** no painel, no consolidado do admin e no snapshot;
3. a rodada **não** é abortada e segue processando os demais negócios;
4. só depois de o retry da borda se esgotar.

A frase de justificativa está no próprio item, remetendo ao item 4 — para que o próximo editor
entenda por que ele está escrito assim antes de "melhorá-lo".

## Escopo travado, e ele foi respeitado por medição

**Nenhum achado Info virou plano.** `git status --porcelain backend/` saiu **vazio** nas três
tasks, e o diff completo do plano são 8 arquivos criados em `.planning/todos/pending/` mais 2
linhas alteradas em artefatos de planejamento.

**Nenhum todo com prioridade decidida pelo usuário foi tocado.** `in-01` (média, C10), `rel-02b`
(alta / pré-go-live, C11), `sec-01` (aberto por risco conscientemente aceito, C8) e o recém-criado
`wr3-07b` continuam byte a byte — nenhum deles aparece no diff. **SEC-01 permanece ABERTO** e não
foi declarado resolvido em lugar nenhum. **O valor do `AGENDOR_TOKEN` não aparece em nenhum
artefato deste plano** (T-04-27-04 mitigada: nenhum dos 8 todos cita `sec-01`).

## A convenção de WR2-06 foi aplicada aos próprios artefatos

D-IN3-a exige âncora nomeada e proíbe número de linha **também nos artefatos de planejamento**.
Medido nos 8 arquivos: `grep -cE "\.js:[0-9]|linhas? [0-9]"` = **0 em cada um** — incluindo
`in3-06`, que fala *sobre* esse padrão sem o reproduzir (ele descreve as duas referências
residuais sem transcrever nenhuma delas). Cada todo cita função, identificador, arquivo ou nome de
caso de teste.

## Critérios numéricos — todos bateram, nenhum forçado

| Critério | Prescrito | Medido |
|---|---|---|
| `ls .planning/todos/pending/in3-0*.md \| wc -l` | 8 | **8** |
| Tamanho de cada todo | 40 a 90 linhas | **64, 64, 67, 72, 72, 72, 75, 88** |
| Referência por número de linha nos 8 | 0 | **0** |
| `grep -ci "candidato a promo"` em `in3-08` | ≥ 1 | **1** |
| `grep -c "in2-01"` em `in3-02` | ≥ 1 | **4** |
| `grep -ci "nome do caso"` em `in3-06` | ≥ 1 | **7** |
| `grep -c "indecidível"` no ROADMAP | ≥ 1 | **3** (o item 7 novo + as linhas dos planos 04-20 e 04-21, preexistentes) |
| `grep -c "CR3-01"` em REQUIREMENTS | ≥ 1 | **1**, na linha de REL-06 |
| Remoções com `orgCategoryCache` no diff do ROADMAP | 0 | **0** |
| `\| Phase` no diff de REQUIREMENTS | 0 | **0** |
| `git status --porcelain backend/` | vazio | **vazio** |
| Suíte | verde | **172/172**, 0 falhas |
| `npm run lint` | exit 0 | **exit 0**, 44 warnings (baseline) |

Nota sobre a armadilha de medição que a rodada avisou: o `grep -c "indecidível"` no ROADMAP devolve
3 e não 1, mas **não é divergência** — as outras 2 ocorrências são as descrições dos planos 04-20 e
04-21 na lista da gap closure r3, preexistentes a este plano. A ocorrência que o critério pede está
onde deveria: dentro do bloco de Success Criteria da Fase 4, como item 7. Nenhum número do plano
foi forçado.

## Deviations from Plan

**Nenhuma.** O plano foi executado exatamente como escrito; nenhuma Rule 1-4 foi acionada, nenhum
pacote foi instalado, nenhum arquivo fora de `files_modified` foi alterado.

Um ajuste de sequenciamento, não de escopo: a marcação `- [x] 04-27-PLAN.md` na lista de planos do
ROADMAP fica para o commit final de metadados, quando o SUMMARY já existe em disco — é o padrão
observado nos commits `docs(04-NN): completa…` dos planos 04-24, 04-25 e 04-26. A linha `**Plans**`
já dizia `= 27` desde o planejamento da rodada e não precisou de correção.

## Escopo que este plano NÃO fecha

Os 8 achados continuam **abertos** — este plano os torna rastreáveis, não os conserta. Dois deles
carregam pedido explícito de decisão antes de qualquer código:

- **`in3-08` é candidato a promoção a requisito da fase seguinte**, e a pergunta que ele levanta é
  de categoria, não de um filtro: para os filtros de elegibilidade do sistema, a direção padrão da
  falha é fail-open ou fail-safe? Os dois achados dessa forma apareceram em rodadas de review
  diferentes, e o segundo só foi visto porque o primeiro tinha acabado de ser consertado.
- **`in3-07` pede decisão sobre reusar o transporte SMTP entre negócios da mesma rodada**, com o
  `socketTimeout` de 30 s (D-02) como teto de vida. A metade barata dele (renomear o caso (3) para
  falar em negócio) pode ser feita a qualquer momento.

Três pares foram declarados nos arquivos para não serem fechados pela metade: `in3-01` + `in2-04`
(o dado existir no banco e aparecer para quem opera), `in3-02` + `in2-01` (as duas políticas de
retry do sistema), `in3-04` + `in3-06` (o gate de CI e o residual que ele apanharia).

## Threat Flags

Nenhuma. O plano não toca código de produção nem introduz superfície nova.
