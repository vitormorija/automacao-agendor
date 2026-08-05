---
phase: 04-confiabilidade-das-integra-es
plan: 13
subsystem: testing
tags: [node-test, fake-timers, helper, unhandled-rejection, meta-teste]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "04-10 (criação do helper avancarRelogioAte) e 04-11 (o envelope local avancarRelogioAteDesfecho, que existia para compensar o ramo ausente)"
provides:
  - "avancarRelogioAte com desfecho normalizado: o erro REAL do SUT é relançado, e a promessa derivada nunca fica órfã"
  - "fakeTimers.helper.test.js — meta-teste do instrumento (rejeição, sucesso, promessa que nunca conclui)"
  - "Uma das três variantes do helper deixou de existir: agendor.retry429.test.js chama o compartilhado direto"
affects: [04-14, 04-15, 04-16, 04-17, verificacao-da-fase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Meta-teste: o helper que dirige os oráculos tem oráculo próprio, porque um instrumento que atribui falha ao caso errado corrói toda a rede"
    - "Promessa derivada com os DOIS ramos tratados (then de dois argumentos) para eliminar unhandledRejection por construção"
    - "Falha explícita ANTES de qualquer await sobre a promessa observada — falhar legível em vez de travar a suíte"

key-files:
  created:
    - backend/test/fakeTimers.helper.test.js
  modified:
    - backend/test/helpers/fakeTimers.js
    - backend/test/agendor.retry429.test.js

key-decisions:
  - "D-WR2-03-a aplicada: a normalização do desfecho mora DENTRO do helper (proposta do review)"
  - "D-WR2-03-b aplicada com DESVIO deliberado da ordem sugerida pelo review: a falha explícita vem ANTES do await encerrada, porque a ordem do snippet travaria a suíte quando a promessa nunca assenta"
  - "D-WR2-03-c aplicada: emailer.timeout.test.js NÃO editado — é oráculo de REL-02 e o emailer.js muda no 04-17"

patterns-established:
  - "RED medido pela saída literal do runner, incluindo failureType: 'unhandledRejection' — o defeito é evidência, não afirmação"
  - "Critério de ordem verificado por grep -n (número de linha do throw menor que o do await), não por leitura"

requirements-completed: [REL-05, REL-06]

# Metrics
duration: 8min
completed: 2026-08-05
---

# Phase 04 Plan 13: `avancarRelogioAte` normaliza o desfecho (WR2-03) Summary

**O helper que dirige todos os testes de relógio falso parou de transformar rejeições em `unhandledRejection`: o erro real do SUT chega ao `assert.rejects` do chamador, uma promessa que nunca conclui continua falhando com mensagem legível sem travar a suíte, e o envelope local que compensava o defeito desapareceu.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-08-05T00:16:00Z
- **Completed:** 2026-08-05T00:24:00Z
- **Tasks:** 3 de 3
- **Files:** 1 criado, 2 modificados

## Accomplishments

- **WR2-03 fechado, e fechado pela raiz.** A promessa derivada interna do helper passou a ter os dois ramos tratados: não existe mais o caminho em que uma rejeição aflora sem handler e o `node:test` a credita a um caso vizinho.
- **O defeito foi MEDIDO, não afirmado.** A saída do RED traz literalmente `failureType: 'unhandledRejection'` com `error: 'ERRO REAL DO SUT'` — a prova exata que o `04-REVIEW.md` §WR2-03 descreve.
- **O instrumento ganhou oráculo próprio.** `fakeTimers.helper.test.js` cobre os três desfechos possíveis (rejeita / resolve / nunca assenta). Os quatro planos comportamentais que vêm a seguir (04-14 a 04-17) dirigem o SUT por este helper.
- **Uma variante a menos em circulação:** de 3 para 2. `agendor.retry429.test.js` chama o compartilhado direto, com **zero asserções alteradas**.
- **Nenhuma linha de produção tocada.** `git diff --name-only backend/src/ backend/package.json backend/package-lock.json` vazio do começo ao fim.
- Suíte: **140 → 143 testes, todos verdes**; cobertura acima dos pisos; `npm run lint` exit 0.

## Task Commits

1. **Task 1: RED — meta-teste do helper** — `a6e4801` (test)
2. **Task 2: GREEN — desfecho normalizado, sem promessa derivada órfã** — `e95bd3e` (fix)
3. **Task 3: envelope local removido de `agendor.retry429.test.js`** — `e4b377f` (refactor)

## RED medido, não afirmado

Saída literal de `node --test test/fakeTimers.helper.test.js` contra o helper anterior à correção (reprodutível em `a6e4801`):

```
# Subtest: (1) uma promessa que REJEITA sob relógio falso relança o erro REAL do SUT
not ok 1 - (1) uma promessa que REJEITA sob relógio falso relança o erro REAL do SUT
  ---
  duration_ms: 2.846583
  location: '.../backend/test/fakeTimers.helper.test.js:60:1'
  failureType: 'unhandledRejection'
  error: 'ERRO REAL DO SUT'
  code: 'ERR_TEST_FAILURE'
  stack: |-
    esperaEntaoRejeita (.../backend/test/fakeTimers.helper.test.js:43:9)
  ...
ok 2 - (2) uma promessa que RESOLVE sob relógio falso devolve exatamente o valor
ok 3 - (3) uma promessa que NUNCA conclui falha com mensagem explícita, sem travar a suíte
1..3
# tests 3
# pass 2
# fail 1
```

Duas leituras que valem registrar:

1. **`failureType: 'unhandledRejection'`** é a linha que prova WR2-03. O caso está envolto num `assert.rejects` e ainda assim a falha reportada não é a asserção — é a rejeição órfã. Exatamente o que torna o defeito perigoso: o `try/catch` do autor do teste não o contém.
2. A rejeição não tratada **preemptou** a asserção. O `assert.rejects` nem chegou a reportar "recebi a mensagem genérica em vez de `ERRO REAL DO SUT`" — o runner abortou o caso antes. Numa suíte maior, essa mesma rejeição aflorando um pouco mais tarde teria sido creditada ao caso seguinte.
3. Os casos (2) e (3) já passavam. É a assimetria esperada: o helper antigo só tratava o ramo de sucesso, e a falha por não-conclusão já era explícita.

Depois da correção: `# pass 3`, e `node --test test/fakeTimers.helper.test.js 2>&1 | grep -c unhandledRejection` devolve **0**.

## Desvio deliberado do snippet do review (com a razão)

O `04-REVIEW.md` §WR2-03 propõe esta ordem:

```js
await encerrada; // nunca rejeita: os dois ramos foram tratados acima
if (!desfecho) throw new Error('a promessa não concluiu após avançar o relógio falso');
```

**Ela foi invertida neste plano.** O motivo é o caso (3): se a promessa observada NUNCA assenta, `encerrada` também nunca assenta, e `await encerrada` fica pendurado para sempre — a suíte **trava** em vez de falhar com mensagem legível. Um teste que trava não dá diagnóstico nenhum e, num runner sequencial, leva junto tudo o que viria depois. A ordem entregue é:

```js
if (!desfecho) {
  throw new Error('a promessa não concluiu após avançar o relógio falso');
}
// A esta altura já está assentada, e não pode rejeitar (os dois ramos foram tratados).
await encerrada;
if (!desfecho.ok) throw desfecho.erro;
return desfecho.valor;
```

Uma `encerrada` pendente para sempre é **inofensiva** justamente porque tem handler de rejeição anexado — não produz `unhandledRejection`. Trocar a ordem, portanto, não custa nada e evita o modo de falha pior. O desvio está documentado no comentário do próprio helper (não só aqui), e o caso (3) do meta-teste é o guarda-corpo que impede alguém de "corrigir" a ordem de volta.

Verificado por posição de linha, não por leitura: `throw new Error('a promessa não concluiu` na **linha 62**, `await encerrada;` na **linha 65**.

## Por que restam 2 variantes do helper, e não 1

| Variante | Estado | Razão |
|---|---|---|
| `backend/test/helpers/fakeTimers.js` | **canônica** | é a compartilhada; recebeu a correção |
| `backend/test/agendor.retry429.test.js` (`avancarRelogioAteDesfecho`) | **extinta** | existia só para compensar o ramo de rejeição ausente; o helper passou a fazer isso |
| `backend/test/emailer.timeout.test.js` (cópia local) | **preservada de propósito** | é o oráculo de REL-02 (04-04), e o `emailer.js` ainda muda nesta rodada (04-17). Trocar o instrumento e o objeto medido na mesma rodada é o que a constraint de processo do `CLAUDE.md` proíbe |

A deduplicação da última cópia segue registrada como trabalho futuro, agora com **uma variante a menos** para reconciliar. A nota de duplicação no cabeçalho de `helpers/fakeTimers.js` foi atualizada para dizer "duas variantes", não três, e para explicar por que a segunda continua.

## Verificação (todos os critérios do plano, medidos)

| Critério | Comando | Resultado |
|---|---|---|
| Meta-teste verde | `node --test test/fakeTimers.helper.test.js` | exit 0, `# pass 3` |
| Sem rejeição não tratada | `node --test test/fakeTimers.helper.test.js \| grep -c unhandledRejection` | `0` |
| Sucesso parcial (sem edição) | `node --test test/notificationStatus.partialFailure.test.js` + `git diff --name-only` | `# pass 3`; diff vazio |
| Retry 429 | `node --test test/agendor.retry429.test.js` | `# pass 4` |
| Timeouts SMTP (sem edição) | `node --test test/emailer.timeout.test.js` + `git diff --name-only` | `# pass 9`; diff vazio |
| `then` com dois ramos | `grep -c "promessa.then(" …/fakeTimers.js` | `1` (bloco com `ok: true` e `ok: false`) |
| Erro real relançado | `grep -c "throw desfecho.erro" …/fakeTimers.js` | `1` |
| Mensagem byte-a-byte igual | `grep -c "a promessa não concluiu após avançar o relógio falso" …/fakeTimers.js` | `1` |
| Ordem (falha antes do await) | `grep -n` | `62` (throw) < `65` (await encerrada) |
| Proibição de `tickAsync` preservada | `grep -c "tickAsync" …/fakeTimers.js` | `1` |
| Meta-teste sem `tickAsync` | `grep -c "tickAsync" …/fakeTimers.helper.test.js` | `0` |
| Relógio rearmado | `grep -c "mock.timers.reset()" …/fakeTimers.helper.test.js` | `2` (`beforeEach` + `after`) |
| Envelope extinto | `grep -c "avancarRelogioAteDesfecho" …/agendor.retry429.test.js` | `0` |
| Chamadas diretas | `grep -c "avancarRelogioAte(" …/agendor.retry429.test.js` | `4` |
| Zero asserções alteradas | diff filtrado por linhas não-comentário, contando `assert.` | `0` |
| Variantes restantes | `grep -rln "async function avancarRelogioAte" backend/test` | exatamente `helpers/fakeTimers.js` e `emailer.timeout.test.js` |
| Suíte + cobertura | `npm run test:coverage` | exit 0, **143/143** |
| Lint | `npm run lint` | exit 0 (45 warnings, baseline anterior) |
| Format | `biome format` nos 3 arquivos | exit 0, "No fixes applied" |
| Zero produção | `git diff --name-only backend/src/ backend/package.json backend/package-lock.json` | vazio |

Cobertura global: 57,77% linhas / 80,40% branches (pisos 20/60). Idêntica ao 04-12 — este plano não toca produção, então nenhuma linha nova de `src/` foi exercitada.

## Nota sobre o critério de aceitação "zero asserções alteradas"

O critério literal do plano (`git diff … | grep -c "assert\."`) imprimiu **`1`**, não `0`. A única ocorrência é uma linha de **comentário** do bloco removido, que citava `assert.rejects` em prosa:

```
-// avançar o relógio, e só então relança. Assim `assert.rejects` continua sendo o oráculo e o
```

Medindo o que o critério pretende — linhas não-comentário contendo `assert.` — o resultado é **`0`**. O diff completo de linhas não-comentário do arquivo é exatamente: a remoção das 10 linhas da função `avancarRelogioAteDesfecho` e as 4 trocas de nome de chamada. Nenhuma asserção, nenhum caso acrescentado ou removido, contagem de casos ainda 4.

## Decisions Made

1. **A normalização do desfecho mora dentro do helper** (D-WR2-03-a, proposta do review). A alternativa — manter o envelope e replicá-lo em cada consumidor — é a que produziu três variantes em primeiro lugar.
2. **A ordem do snippet do review foi invertida** (D-WR2-03-b): falha explícita antes do `await encerrada`. Ver a seção do desvio acima. A razão está no comentário do helper, não só no SUMMARY — quem for editar o arquivo lê a razão antes de mexer.
3. **`emailer.timeout.test.js` não foi editado** (D-WR2-03-c). Ele é o oráculo de REL-02 e o `emailer.js` muda no 04-17.
4. **Os handlers do `then` atribuem em bloco (`{ desfecho = ... }`) em vez de expressão de atribuição** (`(valor) => (desfecho = ...)`, como no snippet do review). A semântica é idêntica; a forma em bloco é a que o Biome do projeto aceita sem warning de atribuição em expressão.
5. **O meta-teste mocka apenas `setTimeout`, não `Date`.** Nenhum caso dele lê o relógio de parede — mockar `Date` seria escopo maior que o necessário para exercitar o laço.
6. **Só o helper tem cobertura de meta-teste; `helpers/fakeAxios.js` não ganhou um.** Este plano fecha um defeito medido, não inaugura uma política de "todo helper tem teste".

## Deviations from Plan

Nenhuma. Os três tasks foram executados como escritos, incluindo o desvio da ordem que o **próprio plano** já prescrevia em relação ao review (registrado acima como decisão 2, não como deviation — ele estava no plano).

Um único ajuste mecânico, sem efeito de comportamento: após a troca de `avancarRelogioAteDesfecho` por `avancarRelogioAte` no caso (4), a linha `const ids = (await avancarRelogioAte(getStaleDeals(15))).map((d) => d.id);` passou a caber em uma linha, e o `biome format` exigiu a colapsagem. Aplicado; `biome format` exit 0 nos três arquivos.

**Total deviations:** 0

## Issues Encountered

- **`npx` continua não funcionando nesta máquina** (mesmo achado do 04-12). O Biome foi invocado pelo caminho do pacote: `node backend/node_modules/.bin/biome …`. `npm run lint` e `npm run test:coverage` funcionam com `export PATH="$HOME/bin:$PATH"`.
- **Lint reporta 45 warnings**, os mesmos do 04-12. Os três arquivos deste plano têm **zero** warnings próprios. `npm run lint` sai 0 (o gate).

## Threat Flags

Nenhuma superfície nova — este plano não toca produção. Itens do registro do plano:

| Threat ID | Disposição | Como foi tratado | Evidência |
|---|---|---|---|
| T-04-13-01 | mitigate | `then` com os dois ramos; erro real relançado | caso (1) verde; `grep -c unhandledRejection` = 0 |
| T-04-13-02 | mitigate | Falha explícita antes do `await encerrada` | caso (3) verde; `grep -n` com linha 62 < 65 |
| T-04-13-03 | accept | `emailer.timeout.test.js` intocado, com a razão no comentário do helper | `git diff --name-only` vazio; 9 casos verdes |
| T-04-13-04 | accept | O meta-teste só manipula promessas sintéticas locais; não requer `nodemailer` nem `emailer.js` | leitura do arquivo |
| T-04-13-SC | accept | Nenhuma instalação de pacote | `package.json`/lockfile sem diff |

## Known Stubs

Nenhum. Nenhum valor fixo, placeholder ou fonte de dados não ligada.

## User Setup Required

None.

## Next Phase Readiness

- **04-14 (WR2-01) está liberado.** O plano 04-13 é autônomo, sem checkpoint — a execução não pausa aqui.
- Os quatro planos comportamentais restantes (04-14, 04-15, 04-16, 04-17) dirigem o SUT por este helper e agora o fazem com um instrumento que relança o erro real. Um `assert.rejects` deles passa a medir o que diz medir.
- **04-17 deve ficar atento à cópia local de `emailer.timeout.test.js`**: ela permanece com o defeito antigo (promessa derivada órfã). Se algum caso novo daquele arquivo precisar observar uma rejeição sob relógio falso, a dedup deixa de ser opcional.
- **SEC-01 permanece ABERTO** como risco conscientemente aceito (decisão C8) — nada neste plano o altera.

## Self-Check: PASSED

- Arquivos declarados existem: `backend/test/fakeTimers.helper.test.js` (criado), `backend/test/helpers/fakeTimers.js`, `backend/test/agendor.retry429.test.js`, `.planning/phases/04-confiabilidade-das-integra-es/04-13-SUMMARY.md`.
- Commits declarados existem: `a6e4801` (RED), `e95bd3e` (GREEN), `e4b377f` (dedup).
- Nenhum arquivo temporário criado ou deixado para trás; `git status --short` limpo após cada commit.

---
*Phase: 04-confiabilidade-das-integra-es*
*Completed: 2026-08-05*
