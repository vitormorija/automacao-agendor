---
phase: 04-confiabilidade-das-integra-es
plan: 37
subsystem: scheduler
tags: [backend, scheduler, observabilidade, fail-safe, core-value, wr5-01, cr4-01, gap-closure-r5]
requires:
  - "backend/src/agendor.js — o campo `categoriaIndecidivel` por negócio, derivado na borda"
  - "plano 04-36 — `results.errors` chegando ao toast do disparo manual (sem ele o alarme seria inaudível no caminho manual)"
  - "plano 04-35 — o contador `funilNaoAvaliado` no topo do laço (D-IN3-08-f), o precedente replicado aqui"
provides:
  - "`results.categoriaIndecidivelNaRodada` — o numerador do alarme de supressão total, contado no TOPO do laço de runCheck"
  - "mensagem do alarme com escopo de afirmação ESTREITO (a RODADA, não o dia), com a ressalva da dedup escrita"
  - "cenários L e M de scheduler.categoriaIndecidivel.test.js — o par dispara/cala da rodada mista por dedup"
  - "helper `marcarComoNotificadoHoje` — a armação de dedup que a suíte não tinha"
  - "todo `cr4-01b` reescrito pelo mecanismo, com a correção antiga marcada como rejeitada"
affects:
  - "backend/src/scheduler.js"
  - "backend/test/scheduler.categoriaIndecidivel.test.js"
  - ".planning/todos/pending/cr4-01b-limiar-de-supressao-total.md"
tech-stack:
  added: []
  patterns:
    - "contador agregado incrementa ANTES de qualquer guarda com `continue`, para que numerador e denominador percorram o mesmo conjunto"
    - "mensagem de alarme afirma exatamente o que o contador garante — escopo de afirmação estreito, com a ressalva escrita"
key-files:
  created: []
  modified:
    - "backend/src/scheduler.js"
    - "backend/test/scheduler.categoriaIndecidivel.test.js"
    - ".planning/todos/pending/cr4-01b-limiar-de-supressao-total.md"
decisions:
  - "D-04-37-a: o numerador do alarme passa a ser um contador NOVO no topo do laço; o contador da guarda (`skippedCategoriaIndecidivel`) FICA e é desacoplado do alarme, porque responde a outra pergunta"
  - "D-04-37-b: a mensagem do alarme deixa de afirmar sobre o DIA e passa a afirmar sobre a RODADA, com a ressalva da dedup escrita por extenso — a redação larga fica proibida e pinada por asserção (cenário L)"
  - "D-04-37-c: o todo `cr4-01b` NÃO é renomeado nem movido para completed/ — a causa residual é real e o nome do arquivo é citado por artefatos históricos imutáveis"
  - "D-04-37-d: comentário e mensagem evitam REPRODUZIR literalmente as formas que condenam (a frase larga e o operador frouxo), para que os próprios gates não acusem a justificativa"
metrics:
  duration: "~50 min"
  completed: 2026-08-05
  tests: "194 → 196"
  commits: 3
---

# Phase 4 Plan 37: O alarme de supressão total sobrevive a um `continue` anterior Summary

Fechou **WR5-01**: o alarme de supressão total por categoria indecidível comparava com o
denominador um contador que incrementa **dentro da segunda guarda** do laço de `runCheck`, então
**qualquer `continue` anterior o desarmava** — e o mais banal deles é a **dedup do dia**. O
numerador passou para o topo do laço, onde percorre o mesmo conjunto que o denominador.

## O que mudou

**O achado, em uma frase:** o conserto do CR4-01 abriu um vizinho, exatamente como o conserto do
CR3-01 tinha aberto o CR4-01. O contador do 04-28 ficou dentro da guarda que ele contava; a guarda
de dedup vem antes e faz `continue`; logo todo negócio já notificado hoje subtraía do numerador sem
subtrair do denominador, e a condição de supressão TOTAL ficava **inalcançável**.

**A regra certa já estava escrita no mesmo arquivo.** O 04-35 pôs `funilNaoAvaliado` no topo do laço
(D-IN3-08-f) justamente para não reproduzir esse modo de falha, e escreveu o motivo no comentário.
Não a aplicou de volta ao contador irmão, no mesmo arquivo. Este plano aplicou.

**Três mudanças em `backend/src/scheduler.js`:**

1. `results.categoriaIndecidivelNaRodada: 0` no literal de `results` (o campo existe sempre no
   payload — nenhum consumidor precisa distinguir `undefined` de zero).
2. `if (deal.categoriaIndecidivel) results.categoriaIndecidivelNaRodada++;` no **topo do laço**, ao
   lado do contador de funil. Não faz `continue`, não escreve `dealResult.skipped`, não toca
   `results.skipped` e não decide destinatário nenhum.
3. A condição do alarme passou a comparar o contador novo; `results.stale > 0` ficou byte a byte.

**A guarda de categoria ficou byte a byte** e `results.skippedCategoriaIndecidivel` foi
**preservada e desacoplada**: ela responde a outra pergunta — quantos a *guarda* suprimiu.

## O RED literal (Task 1) — a sonda do revisor reproduzida dentro da suíte

```
not ok 12 - L: RODADA MISTA — apagão da borda com um negócio já notificado hoje continua
             disparando o alarme de supressão total
  error: |-
    UM alarme por rodada no array que a UI renderiza — um `continue` anterior não pode calá-lo
    0 !== 1
  expected: 1 / actual: 0 / operator: strictEqual

not ok 13 - M: SIMÉTRICO — um negócio deduplicado ao lado de um notificável com sucesso não
             dispara alarme nenhum
  error: |-
    nenhum negócio ficou com a categoria indecidível numa rodada de borda sã
    undefined !== 0
  expected: 0 / operator: strictEqual

# tests 13  # pass 11  # fail 2
```

L falhou **exatamente** na asserção do achado — `r.errors.length` — depois de (a) a (f) passarem, e
M no instrumento — `categoriaIndecidivelNaRodada` — depois de (a) a (d) passarem. Nenhuma delas
falhou na armação nem no comportamento, que era a condição de PARADA-e-REPORTE do plano.

**Os valores medidos no estado defeituoso, em L** (a sonda do revisor, em escala 2 em vez de 3):

| Grandeza | Valor no RED |
|---|---|
| `r.stale` (denominador) | **2** |
| `r.notified` | **0** |
| e-mails enviados na rodada | **0** (quatro destinatários, zero cada) |
| `r.skipped` | **2** (um pela dedup, um pela categoria) |
| `r.skippedCategoriaIndecidivel` (numerador antigo) | **1** ← o `continue` da dedup comeu o outro |
| `r.errors.length` | **0** ← o alarme calado |
| `r.error` | `undefined` |
| `r.categoriaIndecidivelNaRodada` | `undefined` (símbolo ainda inexistente) |

É a rodada indistinguível de um dia calmo, com apagão total da borda e zero e-mails — literalmente o
enunciado do CR4-01, por um caminho que nenhum plano nomeou.

## O texto final da mensagem do alarme

> Em nenhum dos **N** negócio(s) parado(s) **desta rodada** a categoria da organização pôde ser
> consultada, e nenhum e-mail saiu **nesta rodada**. A borda de organizações da Agendor pode estar
> indisponível. A rodada **CONCLUIU** — este é um alarme de supressão total, não uma interrupção.
> **Alguns destes negócios podem ter sido pulados também por outra guarda (a dedup do dia), portanto
> isto NÃO afirma que ninguém foi notificado hoje.**

Só **inteiros e texto fixo** — nenhum id, nome de negócio, nome de organização ou objeto de erro
(CR-02 do 04-09, T-04-37-03).

**Por que a redação entrou no escopo (T-04-37-02):** com o numerador no topo do laço, a condição
total passa a valer também numa rodada **composta**, em que algum dos negócios contados já havia
recebido às 8h. A frase antiga seria ali **factualmente falsa** — e uma mitigação que mente em parte
dos casos treina o operador a ignorá-la; o operador que conclui ter perdido envios redispara e gera
**duplicatas**. A redação está pinada por asserção no cenário L, não por comentário.

## Números medidos vs prescritos

**Todos os gates bateram.** Zero divergências neste plano — a segunda rodada consecutiva sem
nenhuma, depois do 04-36.

| Gate | Prescrito | Medido |
|---|---|---|
| Suíte inteira | 196/196 | **196/196** |
| Cobertura | exit 0 | **exit 0** |
| Lint backend | exit 0, 44 warnings | **exit 0, 44 warnings** |
| Cenários no arquivo de teste | 13 (era 11) | **13** |
| Helper de dedup (ocorrências) | 3 | **3** |
| Ids reusados | 0 | **0** |
| Forma frouxa nas linhas novas | 0 | **0** ¹ |
| Cabeçalho declara L e M | 2 | **2** |
| Task 1 aditiva (remoções no diff de teste) | 0 | **0** |
| H/I/J intocados (`servirDealsComFunil` no diff) | 0 | **0** |
| `categoriaIndecidivelNaRodada` não-comentário | 3 | **3** |
| Incremento antes do primeiro `continue;` | ok | **ok** (164 < 212) |
| `continue;` | 3 | **3** |
| `skippedCategoriaIndecidivel` não-comentário | 2 (era 3) | **2** |
| `skippedCategoriaIndecidivel === results.stale` | 0 | **0** |
| `results.stale = dealsToNotify.length` | 1 | **1** |
| `do dia foi notificado` | 0 (era 1) | **0** ² |
| `desta rodada` | ≥ 1 | **2** |
| `funilNaoAvaliado` em linha não-comentário do diff | 0 | **0** |
| `trouxe funil` no diff | 0 | **0** |
| Ordem dos alarmes (funil antes de categoria) | ok | **ok** (470 < 525) |
| `results.skipped++` não-comentário | 4 | **4** |
| `execucaoIgnorada` não-comentário | 1 | **1** |
| `runCheckOnly`/`seraNotificado` no diff | 0 | **0** |
| Testes editados na Task 2 | vazio | **vazio** |
| Frontend tocado | vazio | **vazio** |
| Pacotes instalados | vazio | **vazio** (T-04-37-SC) |
| Referência por número de linha no diff | 0 | **0** |
| Arquivos de todo modificados | 1 | **1** |
| `rejeitad` no todo | ≥ 1 | **3** |
| `continue` no todo | ≥ 1 | **5** |
| `04-37` no todo | ≥ 1 | **7** |
| `sem nome` preservado no todo | ≥ 1 | **1** |
| WR2-06 no próprio todo | 0 | **0** |
| Segredo no todo | 0 | **0** (C8 / SEC-01) |

¹ **Armadilha de medição evitada, registrada:** a primeira redação do comentário do cenário M
**citava o operador frouxo literalmente** para explicar por que a igualdade exata é deliberada — e o
gate que proíbe a forma frouxa no diff acusou a própria justificativa (1, esperado 0). O comentário
foi reescrito para nomear a forma **por extenso** ("comparar por maior-ou-igual a um") sem
reproduzir o operador. Mesma disciplina de R3-26.

² **Mesma classe, segunda ocorrência:** o comentário do alarme citava a frase larga entre aspas para
condená-la, e o gate acusou 1 em vez de 0. Reescrito para condenar a frase **descrevendo-a** ("nunca
escrever que ninguém foi notificado NO DIA") em vez de reproduzi-la. Nos dois casos o número do
plano **não** foi forçado: a medição estava certa e o artefato é que estava errado.

**Cobertura medida de `scheduler.js`:** **88,79 %** linhas / **79,31 %** branches / 66,66 % funções
(era 87,72 / 79,06 na entrada). All files: 77,26 % linhas / 78,70 % branches. `check-coverage` exit
0. Lint do frontend também exit 0 (60 warnings, baseline), executado como prova de que nada vazou
para lá.

## Inventário de irmãos — a classificação final dos TRÊS grupos

### Grupo 1 — irmãos do construto (os contadores agregados da rodada)

| # | Construção | Classificação final | Medição |
|---|---|---|---|
| 1 | `results.skippedCategoriaIndecidivel` | **preservada e DESACOPLADA do alarme** | Não-comentário caiu de 3 para **2**; `skippedCategoriaIndecidivel === results.stale` = **0**. O cenário L a mede valendo **1** enquanto o numerador do alarme vale **2** na MESMA rodada — é essa diferença que torna o achado conferível. O cenário D continua asserindo `=== 2` sem edição |
| 2 | `results.funilNaoAvaliado` (04-35) | **verificada-e-sã — o PRECEDENTE replicado** | Nenhuma linha não-comentário dela entrou no diff (**0**). Só o comentário mudou, para registrar que a regra passa a valer nos DOIS contadores |
| 3 | `results.skipped` (4 incrementos) | **verificada-e-sã por medição** | `results.skipped ===` ou `>` = **0** — não é numerador de comparação nenhuma. `results.skipped++` não-comentário = **4**, inalterado |
| 4 | `results.notified` (2 incrementos) | **verificada-e-sã por medição** | `results.notified ===` = **0**; reportado como valor absoluto, nunca comparado a `results.stale`. Não-comentário = **2**, inalterado |
| 5 | `skippedFutureTasks` | **verificada-e-sã por construção** | Derivado por diferença ANTES do laço — nenhum `continue` pode desarmá-lo |
| 6 | `runCheckOnly` (a prévia) | **fora-de-escopo-com-medição** | `runCheckOnly`/`seraNotificado` no diff = **0**. A prévia marca por negócio; num apagão todos vêm não-notificáveis. A invisibilidade do motivo na UI já tem dono: `cr4-01c` |

### Grupo 2 — cláusula (a): DIREÇÃO REVERSA (o que pode NEUTRALIZAR o construto novo)

Os **oito** neutralizadores, tratados como trabalho e não como lista:

| # | Neutralizador | Disposição final |
|---|---|---|
| 1 | Guarda com `continue` antes do incremento | **FECHADO.** O incremento está na linha 164; o primeiro `continue;` na 212. `continue;` = 3, inalterado |
| 2 | Negócio **sem organização** — nunca recebe a marca | **NÃO FECHADO — é o residual verdadeiro.** Dono: `cr4-01b`, reescrito na Task 3, que o nomeia como a causa que SOBRA e a distingue da fechada. A marca vem de `categoriaPorOrg.get(deal.organization?.id) ?? null`, e um negócio sem organização nunca é consultado |
| 3 | Negócio filtrado na **borda** | **Não neutraliza** — também não entra em `results.stale`. `results.stale = dealsToNotify.length` = **1**, atribuído depois do filtro |
| 4 | Filtro de **tarefas futuras** | **Não neutraliza**, mesmo motivo e mesmo gate |
| 5 | `results.stale === 0` | **Deliberado.** `results.stale > 0` ficou byte a byte |
| 6 | Consumidor que lê só o campo escalar `results.error` | **Preservado.** Ordem dos alarmes intacta (funil na 470, categoria na 525) — D-IN3-08-g |
| 7 | `results.errors` não chegar à tela no disparo manual | **FECHADO pelo plano 04-36**, declarado em `depends_on`. O alarme só é audível no caminho manual PORQUE o 04-36 veio antes — sem ele este conserto produziria um sinal que ninguém veria ao disparar |
| 8 | A mensagem afirmar mais do que o contador garante | **FECHADO nesta Task 2.** Escopo de afirmação estreito, com a ressalva da dedup escrita; o cenário L assere a redação nas duas direções (presença de "desta rodada", ausência da frase larga) |

### Grupo 3 — cláusula (b): RETROATIVIDADE DA JUSTIFICATIVA

**Frase 1 condenada:** *"um contador que só incrementa depois de outra guarda ter feito `continue`
não alcança o denominador"*. Grep no mesmo arquivo, cada construção classificada:

| Construção | Classificação | Medição |
|---|---|---|
| `results.skipped++` × 4, dentro de guardas | **verificada-e-sã** | Não é numerador de comparação nenhuma (grep = 0) |
| `results.notified++` × 2, no ramo de envio | **verificada-e-sã** | Nunca comparado a `results.stale` (grep = 0) |
| `results.skippedCategoriaIndecidivel++`, dentro da guarda | **preservada e desacoplada** | Continua onde está; deixou de ser comparada com o denominador |
| `results.checked++` e `results.funilNaoAvaliado++`, no topo | **verificada-e-sã** | Já do lado certo; o segundo é o precedente literal |

**Frase 2 condenada:** *"uma mensagem de alarme não pode afirmar sobre o dia inteiro o que o contador
só garante sobre a rodada"*:

| Construção | Classificação | Medição |
|---|---|---|
| Alarme de FORMA do funil | **verificada-e-sã por medição** | A afirmação é sobre a FORMA do payload, não sobre notificação, e a própria mensagem diz que a supressão por funil não impediu nenhuma notificação. Fora do diff: `trouxe funil` = **0**. O que é discutível ali é o LIMIAR com N pequeno — **WR5-03**, dono no 04-38 |
| `logger.info('[Scheduler] Concluído: N …, M …')` | **verificada-e-sã** | Relata dois inteiros e não afirma causa nenhuma. É a linha que o CR4-01 apontou como indistinguível entre apagão e dia calmo; o alarme é a resposta a ela |
| Mensagem do alarme de **categoria** | **CORRIGIDA nesta Task 2** | `do dia foi notificado`: **1 → 0**. Nenhum teste asseria o texto antes (o cenário D mede só tipo e comprimento), então a mudança não deixou nada vermelho por acidente — e o cenário L passou a pinar a redação nova |

## Deviations from Plan

**Nenhuma.** Nenhuma Rule 1-4 acionada, nenhum pacote instalado, nenhuma divergência numérica.

Dois ajustes de **redação de comentário** foram feitos durante a execução (documentados acima nas
notas ¹ e ²) — não são desvios do plano: são o próprio gate do plano funcionando e o artefato sendo
corrigido para satisfazê-lo, exatamente como prescrito.

## Divergência de ferramental (registrada, não silenciada)

Repetição do que o 04-36 já registrou: **`npm run format` não existe na raiz do repositório** (só em
`backend/` e `frontend/`), e o `biome format --write .` do backend reformata **seis arquivos de teste
preexistentes** alheios a este plano (dívida de `lineWidth` 80 anterior). Para manter o diff
estritamente no escopo, o Biome foi invocado **por arquivo** (`./node_modules/.bin/biome format
--write <arquivo>`), tocando apenas os dois arquivos deste plano.

Segunda divergência de ferramental, nova: o wrapper `~/bin/npx` aponta para um diretório de Node que
não existe mais (`/tmp/node-v22.13.1-darwin-arm64/bin/`), enquanto `~/bin/node` aponta para
`~/node-v22/bin/node` e funciona. `npx` não é utilizável neste ambiente; `npm test`, `npm run
test:coverage` e `npm run lint` funcionam normalmente. Nada foi alterado no ambiente.

## O que este plano NÃO fecha (com dono nomeado)

- **O caminho do negócio SEM organização** — o residual verdadeiro. `cr4-01b` permanece **aberto** e
  foi **reescrito** para nomear o mecanismo, separar a causa fechada da que sobra, marcar a correção
  antiga como **rejeitada** com o motivo medido, e preservar a medição que rejeitou o denominador
  derivado (organização com id válido e **sem nome** faria o alarme falhar ABERTO por um caminho
  novo).
- **WR5-02** (aviso por negócio no caminho de leitura do painel), **WR5-03** (limiar do alarme de
  forma do funil com N pequeno), **WR5-04** (`console.log` vs `logger.warn`) e **WR5-05** (asserções
  afrouxadas nos cenários H, I e J) → plano **04-38**. As asserções de H, I e J **não** foram
  tocadas.
- **IN5-01..IN5-04** → plano **04-38**.
- O **limiar** do CR4-01 (supressão TOTAL) **não** mudou e não foi reaberto: o conserto foi sobre
  **onde o contador incrementa**.

## Atenção para quem seguir

`scheduler.categoriaIndecidivel.test.js` deixou de ser o oráculo de duas causas e passou a cobrir
também a **rodada composta**: um alarme agregado novo neste arquivo precisa do seu par
dispara/cala **e** de um caso com dedup armada, senão repete o modo de falha do WR5-01. O helper
`marcarComoNotificadoHoje` existe para isso.

## Commits

- `62d8fb1` — `test(04-37): RED da rodada mista por dedup`
- `8ef1914` — `fix(04-37): GREEN — contar onde numerador e denominador percorrem o mesmo conjunto`
- `f2bbb79` — `docs(04-37): reescreve o todo cr4-01b pelo mecanismo, nao por uma de suas causas`

## Self-Check: PASSED

Arquivos declarados, verificados em disco: `backend/src/scheduler.js`,
`backend/test/scheduler.categoriaIndecidivel.test.js`,
`.planning/todos/pending/cr4-01b-limiar-de-supressao-total.md` e este SUMMARY — todos **FOUND**.
Commits declarados, verificados em `git log`: `62d8fb1`, `8ef1914`, `f2bbb79` — todos **FOUND**.

`REQUIREMENTS.md` **não** foi tocado: REL-03 e REL-06 já constavam como `Complete` desde rodadas
anteriores desta fase, e este plano não abre nem fecha requisito. `ROADMAP.md` recebeu **uma única
inserção** (a linha do plano 04-37); o checkbox da Fase 4 continua `[ ]` — a fase permanece
**reaberta** até o 04-38.
