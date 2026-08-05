---
id: in4-05-literal-100-em-tasks-sem-constante
type: todo
status: pending
priority: baixa
created: 2026-08-05
source: Fase 4, code review 04-REVIEW.md (rodada 4) §IN4-05 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, agendor, paginacao, rel-06, fail-safe, phase-4-carryover]
---

# IN4-05 — o literal `100` da consulta de tarefas futuras é o tamanho da página E o critério de parada, sem constante que os ligue

**Onde:** o laço de paginação de `getDealsWithFutureTasks`, em `backend/src/agendor.js`. O mesmo
número aparece em dois papéis diferentes dentro do mesmo laço:

- como valor de `per_page` no parâmetro enviado à borda de tarefas;
- como critério de parada, na comparação que encerra o laço quando a página devolvida vem com menos
  registros que o esperado.

Nada no código declara que os dois são o mesmo número por **necessidade**, e não por coincidência.

**O que acontece:** trocar o tamanho da página sem mexer no critério de parada faz **toda página
cheia parecer a última**. O laço encerra na primeira página, e a função devolve um conjunto
**parcial** de negócios protegidos por tarefa futura.

O desfecho é exatamente o que a Decisão Q2 desta fase recusa — "resultado completo ou falha
explícita" — e, o que é pior, ele acontece **silenciosamente**: nenhuma exceção é lançada, o
contrato não é violado por erro nenhum, a rodada segue normalmente e simplesmente **notifica gente
que não deveria ser notificada**, porque os negócios protegidos das páginas seguintes nunca entraram
no conjunto.

## Por que a prioridade é baixa

O defeito não existe hoje: os dois números estão iguais e a função devolve o conjunto completo. Isto
é uma **armadilha para a próxima edição**, não um erro presente. Ninguém recebe e-mail errado
enquanto o código ficar como está.

O que a mantém na lista é o custo do erro quando ele for cometido: o conjunto parcial atinge o
Core Value — quem recebe e quem não recebe — e não deixa vestígio nenhum. Uma constante única custa
uma linha e elimina a classe inteira.

## Correção proposta

Extrair uma **constante de módulo única** para o tamanho da página de tarefas e usá-la nos dois
pontos, de modo que o critério de parada não possa divergir do valor enviado. É a mesma forma que a
paginação do módulo já usa para o teto de páginas, que é constante compartilhada pelas três bordas.

Ao fazer, verificar se o mesmo padrão existe nas outras paginações do módulo: se outra borda repetir
o número literal nos dois papéis, ela entra na mesma correção — deixar uma constante numa e literal
na outra reproduz a divergência com sintaxe nova.

**Fechar junto de `in4-06`**, que trata do teto de páginas do **mesmo laço**: os dois falam do
contrato "completo ou falha explícita" da consulta de tarefas futuras, e abrir o arquivo duas vezes
para dois ajustes vizinhos é desperdício com risco.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN4-05.
