---
id: in-02-seams-fora-do-module-exports
type: todo
status: pending
priority: low
created: 2026-08-04
source: Fase 4, code review 04-REVIEW.md §IN-02 — convenção de módulo violada pelos seams de teste da fase
resolves_phase: null
tags: [backend, convencao, testes, phase-4-carryover]
---

# IN-02 — Seams de teste anexados fora do bloco `module.exports` único

**O que acontece:** o `CLAUDE.md` exige que todo módulo do backend termine com **um único**
`module.exports = { ... }` nomeando explicitamente cada função pública ("no wildcard/barrel
exports"). A Fase 4 criou quatro exports que ficam **fora** desse bloco, anexados depois:

- `backend/src/scheduler.js:346` — `module.exports.runWeeklySummary`
- `backend/src/routes/deals.js:50` — `module.exports.staleHandler`
- `backend/src/routes/notifications.js:275` — `module.exports.resolvedHandler`
- `backend/src/routes/notifications.js:276` — `module.exports.testCardHandler` (acrescentado
  pelo próprio plano 04-09, Task 2)

Nos três arquivos de rota o padrão é forçado pelo Express (`module.exports` **é** o router,
uma função), então anexar propriedades é a única forma — o problema ali é só de inventário: a
API pública do módulo deixa de ser legível em um lugar só.

**O caso mais delicado é `scheduler.js`**, onde não há essa desculpa: `module.exports` já é um
objeto literal, e `runWeeklySummary` foi pendurada fora dele. A função **não tem o lock
`isRunning`** (documentado em `backend/test/scheduler.resilience.test.js:262-263`) e agora é
importável por qualquer módulo de produção. Nenhum a importa hoje — mas nada sinaliza o
perigo a quem vier importar.

## Por que ficou fora da Fase 4

- É **cosmético**: nenhum comportamento observável muda, nenhum teste fica mais forte.
- Movê-lo é refatoração estrutural, e o 04-09 é uma rodada de correção de **segurança**
  (CR-02/WR-03). Misturar os dois contraria a constraint de processo do `CLAUDE.md` ("não
  misturar refatoração estrutural com outro trabalho no mesmo trabalho") e engordaria o diff
  que o checkpoint C8 precisa revisar linha a linha.

## Correção sugerida

Mover os quatro para dentro do bloco `module.exports` onde ele for um objeto, e nos routers
manter a anexação mas agrupada sob um comentário único `// seam de teste`, com uma linha
dizendo qual invariante cada seam existe para pinar. Em `scheduler.js`, aproveitar para
registrar no próprio export que `runWeeklySummary` **não** tem lock de concorrência — é a
informação que falta a quem for importá-la.

**Destino sugerido:** Fase 5 (padronização de logging/erros já mexe nesses mesmos arquivos) ou
Fase 7 (reorganização incremental de arquitetura). Não bloqueia nada.
