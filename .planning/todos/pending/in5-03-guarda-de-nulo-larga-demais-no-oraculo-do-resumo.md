---
id: in5-03-guarda-de-nulo-larga-demais-no-oraculo-do-resumo
type: todo
status: pending
priority: baixa
created: 2026-08-05
source: Fase 4, code review 04-REVIEW-r5.md (rodada 5) §IN5-03 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, testes, oraculo, emailer, resumo-semanal, phase-4-carryover]
---

# IN5-03 — a guarda de nulo do oráculo do resumo semanal varre o e-mail inteiro e ficará vermelha por conteúdo legítimo

**Onde:** o helper `assertHtmlSemNuloNoNome` de `backend/test/emailer.resumoIndecidivel.test.js`,
usado pelos cenários 5, 6 e 7 — os que cobrem o responsável sem nome chegando ao resumo individual.

**O que acontece:** o helper varre o corpo **inteiro** do e-mail procurando a substring `null`, em
vez de olhar o trecho onde o defeito medido se manifesta (o nome do responsável chegando à saudação).
Qualquer dado **legítimo** que contenha essa substring reprova o caso por motivo **sem relação** com
o que ele existe para medir — um título de negócio, um nome de organização, um nome de etapa do
funil. O irmão que procura `undefined` tem o mesmo problema, em grau menor porque a substring é mais
rara em texto de negócio.

Hoje o helper está verde porque as fixtures em uso não contêm a substring. Ele fica vermelho no dia
em que alguém acrescentar uma fixture realista — e o vermelho apontará para o lugar errado.

## Por que a prioridade é baixa

É **higiene de instrumento**: não toca em produção, não muda quem recebe e não esconde defeito
nenhum hoje. O dano é do tipo que esta fase já pagou três vezes e sabe nomear — um vermelho atribuído
ao **ator errado**, apontando para um defeito de produção que não existe. Numa suíte que existe para
ser o oráculo de quem é notificado, isso corrói a confiança em tudo o mais; mas é custo futuro e
condicional, não perda de cobertura atual.

O par é `in4-03`, por afinidade de tipo: os dois são **higiene do mesmo instrumento**, em direções
opostas — lá uma asserção **decorativa**, que não pode ficar vermelha; aqui uma asserção **larga
demais**, que pode ficar vermelha pelo motivo errado. Quem passar naquele arquivo passa neste.

## Correção proposta

Restringir o escopo da guarda ao **trecho sob medição**: capturar o bloco da **saudação** do e-mail e
exigir que o valor capturado ali não seja o texto `null` nem `undefined`. A asserção passa a falhar
exatamente quando o defeito ocorre — o nome ausente vazando para a saudação — e para de falhar quando
um dado legítimo qualquer contém a substring em outro lugar do corpo.

A mesma correção vale para o irmão que procura `undefined`: os dois devem olhar o **mesmo trecho** e
pelo **mesmo motivo**, senão a próxima edição volta a alargar um dos dois. Vale registrar no
comentário do helper **por que** o escopo é estreito, para que ninguém o "reforce" de volta para o
corpo inteiro achando que está aumentando cobertura.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW-r5.md`, seção Info,
§IN5-03.
