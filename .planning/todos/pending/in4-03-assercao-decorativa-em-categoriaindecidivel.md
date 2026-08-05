---
id: in4-03-assercao-decorativa-em-categoriaindecidivel
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, code review 04-REVIEW.md (rodada 4) §IN4-03 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, testes, oraculo, core-value, agendor, phase-4-carryover]
---

# IN4-03 — a asserção que "prova" que nenhuma consulta saiu para organização indefinida nunca pode ficar vermelha

**Onde:** `backend/test/agendor.categoriaIndecidivel.test.js`, na asserção que lê o contador de
consultas sob a chave `NaN` e exige que ela seja indefinida. A âncora é o identificador
`consultasPorOrg` e a chave `NaN`; o alvo declarado é a guarda de id ausente dentro de
`getOrgCategory`, em `backend/src/agendor.js`.

**O que acontece:** a asserção pretende provar que nenhuma requisição saiu para uma organização
indefinida. Ela é verdadeira **por construção do sistema sob teste**, e não por causa da guarda que
diz verificar:

- `getStaleDeals` monta o conjunto de organizações únicas filtrando valores falsos antes de montar a
  fase de categorias. Uma organização ausente **nunca chega** a `getOrgCategory`.
- Portanto o contador jamais recebe a chave em questão, e a asserção permaneceria **verde mesmo se a
  guarda de id de `getOrgCategory` fosse inteiramente removida**.

O que o caso realmente exercita é o filtro de valores falsos da montagem do conjunto — um
comportamento diferente, num ponto diferente do módulo, que ninguém escolheu medir ali.

## Por que a prioridade é média, e por que isto é pior que uma asserção ausente

O Core Value desta etapa é uma rede de testes **confiável** sobre quem recebe e quem não recebe. Um
oráculo que não pode ficar vermelho não é neutro: ele é pior que a ausência de oráculo, porque
produz **falsa confiança** exatamente no instrumento cujo valor inteiro depende de ser confiável.

- Uma asserção ausente é visível: quem procurar cobertura para a guarda não encontra nada e escreve
  o caso.
- Uma asserção decorativa é **invisível**: quem procurar encontra uma linha verde com o nome certo,
  conclui que a guarda está coberta, e a remove ou refatora sem que nada acuse.

A guarda protegida por esta asserção é o que impede uma requisição malformada de sair pela instância
compartilhada, com o token no header — a mesma superfície que o CR-02 desta fase tratou.

## Correção proposta

Duas saídas, e a primeira é a que fecha o achado:

1. **Chamar o caminho realmente sob teste.** Invocar `getOrgCategory` diretamente com identificador
   ausente e exigir que ela devolva sem emitir requisição. Assim a asserção fica vermelha se a
   guarda sumir, que é a única forma de ela valer alguma coisa.
2. **Trocar por uma asserção sobre o total de consultas do caso** — comparar a quantidade de chaves
   do contador com o conjunto de organizações esperado. Isso mede o fan-out do caso, é uma afirmação
   verdadeira e falseável, e passa a proteger também o teto de concorrência introduzido nesta
   rodada.

Ao corrigir, varrer o mesmo arquivo atrás de outras asserções verdadeiras por construção: a que
originou este achado não foi escrita sozinha, e o padrão "assere a ausência de um efeito que o
sistema não tem como produzir" costuma aparecer em série.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN4-03.
