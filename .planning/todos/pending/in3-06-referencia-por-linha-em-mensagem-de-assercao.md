---
id: in3-06-referencia-por-linha-em-mensagem-de-assercao
type: todo
status: pending
priority: baixa
created: 2026-08-05
source: Fase 4, code review 04-REVIEW.md (rodada 3) §IN3-06 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, testes, convencao, wr2-06, phase-4-carryover]
---

# IN3-06 — as duas referências por número em `scheduler.resilience.test.js` apontam para o lugar errado, e a da mensagem de asserção pode ser corrigida

**Onde:** `backend/test/scheduler.resilience.test.js`, em dois pontos: o **nome do caso** (3), que
fala de "o guard" por número, e a **mensagem de asserção** do caso que verifica a recusa da segunda
chamada concorrente. O alvo das duas é o guard `if (isRunning)` do topo de `runCheck`, em
`backend/src/scheduler.js`.

**O que acontece:** as duas referências foram escritas com um número que aponta para a instrução
anterior ao guard — ou seja, **já nasceram erradas**, e o próprio `04-18-SUMMARY.md` reconhece isso
ao declarar o residual. É o modo de falha exato que a convenção de WR2-06 existe para impedir: o
número se desloca no próprio commit que o escreve, e aqui nem chegou a estar certo em nenhum
momento.

Este é o residual conhecido da limpeza do 04-18. Os cinco arquivos de produção ficaram com zero
ocorrências; o que sobrou foi medido e declarado, não esquecido.

## A decisão que FICA como está: o nome do caso

**O nome do caso não deve ser renomeado**, e isso é decisão registrada no 04-18, mantida aqui. O
motivo:

- **Nome de caso é identificador de oráculo.** É a string por onde `--test-name-pattern` seleciona
  a execução e por onde um relatório de falha identifica o que quebrou.
- Ele é **citado por outro artefato** — o `04-RESEARCH.md` o referencia pelo nome. Renomear
  quebraria a citação, que é o mesmo tipo de dano que a convenção quer evitar, só que em outro
  eixo.

O precedente é consistente dentro da fase: o 04-19 deixou o nome do caso (3) de
`agendor.cacheInvalidation.test.js` dizendo `null` mesmo depois de o contrato ter mudado, pela
mesma razão, e corrigiu o **corpo** do caso em vez do nome.

## O que MUDA: a mensagem de asserção

Aqui o review discordou em parte do 04-18, e tem razão. O argumento que protege o nome do caso —
"string é código, e editá-la mexe num identificador" — **não se aplica à mensagem de `assert`**:

- Mensagem de asserção **não é oráculo**. Ela não seleciona execução, não é comparada com nada, não
  participa do veredito. Só aparece quando o teste já falhou.
- Ela **não é citada por nenhum artefato** — nem pelo `04-RESEARCH.md`, nem por SUMMARY, nem pelo
  review.
- Convertê-la para âncora nomeada **não altera o que o teste prova**. O diff é de texto puro, e o
  resultado da suíte é idêntico antes e depois.

E o ganho é justamente onde dói: a mensagem é o texto que alguém lê no momento em que a suíte
quebrou. Hoje ela manda o leitor para um lugar onde o guard não está.

## Correção proposta

Converter **apenas** a mensagem de asserção, trocando a referência numérica por âncora nomeada —
algo como "recusada pelo guard `if (isRunning)` do topo de `runCheck`". Deixar o nome do caso
exatamente como está, com o motivo registrado acima escrito no arquivo, para que o próximo leitor
não trate a assimetria como esquecimento.

**Fechar junto de `in3-04`**, que propõe o gate de CI para esta convenção: este é o residual que
aquele gate teria apanhado, e serve de caso de aceitação para ele. Se o gate entrar antes desta
correção, a mensagem é a primeira coisa que ele acusa — e o nome do caso precisará estar
explicitamente excluído, com a justificativa apontando para este arquivo.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN3-06, e item 4 da seção "Avaliação dos desvios deliberados".
