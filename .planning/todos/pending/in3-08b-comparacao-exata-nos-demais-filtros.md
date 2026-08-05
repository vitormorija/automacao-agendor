---
id: in3-08b-comparacao-exata-nos-demais-filtros
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, plano 04-35 (in3-08) — residual declarado no inventário de irmãos, fora-de-escopo-com-medição
resolves_phase: null
tags: [backend, agendor, elegibilidade, fail-safe, observabilidade, core-value, in3-08, phase-4-carryover]
---

# IN3-08b — as constantes de filtro irmãs continuam com comparação EXATA, e o sinal novo de funil ainda não tem superfície

**Onde:** `EXCLUDED_CATEGORIES` e `EXCLUDED_OWNERS`, em `backend/src/agendor.js`; a normalização de
`shouldNotifyOwner` no mesmo módulo; `sendOwnerWeeklySummary`, em `backend/src/emailer.js`; e o
campo `funilAusente`, produzido por `getStaleDeals` e ainda invisível no frontend.

O plano 04-35 fechou o funil (`NO_OWNER_NOTIFY_FUNNELS`), que passou a comparar por substring, e
acrescentou contagem e aviso ao caso de funil ausente. Este todo carrega os cinco itens que o
inventário de irmãos daquele plano classificou como **fora-de-escopo-com-medição** — cada um com a
medição que o excluiu, e não apenas com a intenção de olhá-lo depois.

## 1. `EXCLUDED_CATEGORIES` — igualdade exata, mesma direção de falha

**Medição:** 1 ocorrência não-comentário no módulo, na forma `EXCLUDED_CATEGORIES.includes(orgCategory)`.

Tem exatamente a MESMA direção de falha do funil antes do 04-35: renomear 'Parceiro' para
'Parceiro Comercial' dentro do CRM faz a comparação deixar de casar, e a organização volta a ser
notificada sem que nada tenha falhado.

**Por que ficou de fora:** mudar esta comparação **muda QUEM RECEBE**, e a decisão do usuário de
2026-08-05 cobre exclusivamente o funil. Com substring, uma categoria nova chamada "Ex-Parceiro"
passaria a ser excluída sem ninguém ter pedido — a supressão indevida é a classe de falha que o
Core Value do milestone nomeia como a pior. O funil pôde mudar porque o conjunto suprimido a mais
foi apresentado ao usuário e aceito; aqui esse conjunto nem foi levantado.

## 2. `EXCLUDED_OWNERS` — igualdade exata, mesma forma

**Medição:** 1 ocorrência não-comentário, na forma `EXCLUDED_OWNERS.includes(deal.owner?.name)`.

Mesma forma e mesma direção de falha do item 1, com um gatilho ainda mais banal: a pessoa muda de
sobrenome no cadastro do CRM e volta a ser notificada. Mesmo motivo para ficar de fora — a
comparação decide destinatário.

Vale registrar a assimetria de risco entre os dois: aqui a comparação é sobre NOME DE PESSOA, onde
substring é mais perigosa que nos demais (um sobrenome que seja prefixo de outro suprimiria a
pessoa errada). Quem fechar este item não deve tratá-lo como cópia do item 1.

## 3. Normalização sem remoção de acentos — assimetria com a irmã de etapas

**Medição:** `'beefor'` é ASCII puro, e nenhum dos nomes de funil das fixtures do repositório
(`Funil 1`, `Funil 2`, `Comercial`) tem acento.

`shouldNotifyOwner` normaliza com `trim().toLowerCase()`. A irmã que exclui etapas encerradas, no
mesmo módulo, normaliza também com decomposição Unicode e remoção de marcas de combinação. Igualar
as duas exigiria extrair um helper compartilhado, o que é **refatoração estrutural no caminho do
Core Value** — e a constraint de processo do `CLAUDE.md` proíbe misturá-la a uma mudança de
comportamento.

**Restrição herdada:** o regex de marcas de combinação da irmã tem escrito no código a instrução
"copiado byte-a-byte do trecho inline original — NÃO reescrever". Quem fechar este item precisa
respeitá-la: extrair sem reescrever, ou não extrair.

## 4. O resumo semanal individual não tem contador agregado de funil ausente

**Medição:** `sendOwnerWeeklySummary` já tem contador próprio POR CAUSA (o de funil, com linha de
log dedicada, separado do de categoria). O contador de funil ausente do 04-35 entrou apenas na
rodada de envio diário.

**Por que ficou de fora:** um contador de "funil ausente" ali não traria informação nova. As duas
funções leem a MESMA lista de `getStaleDeals`, e a mesma mudança de forma do payload dispara na
rodada **diária** — cinco vezes mais cedo que no relatório de sexta-feira. O sinal chegaria depois
de já ter chegado, e um segundo lugar para a mesma contagem é um segundo lugar para ela divergir.

Se um dia o resumo semanal passar a ler uma lista própria, este item deixa de ser redundante e
passa a ser lacuna.

## 5. `funilAusente` é invisível na UI

**Medição:** `grep -rn "funilAusente\|skipReason" frontend/src` = **0**. Medido também que o painel
de relatórios já agrupa os negócios por `d.funnel || 'Sem funil'` — existe um balde de gráfico
chamado "Sem funil", mas ele **não distingue** "a regra de supressão não pôde ser avaliada" de um
agrupamento legítimo, e é justamente essa distinção que o campo novo carrega.

Anda junto do residual `cr4-01c`, que cobre a invisibilidade de `skipReason` na mesma tela. Quem
fechar um deve olhar o outro: são a mesma lacuna de superfície, com dois campos diferentes.

## O que este todo NÃO reabre

A direção da falha do funil ausente. Ela foi decidida pelo usuário em 2026-08-05 — **fail-open, com
sinal** — com a medição que a sustenta (15 de 15 negócios das fixtures trazem a estrutura de funil,
então funil ausente é caminho de exceção e não caso comum) e com o risco que a alternativa
reintroduziria (a supressão em massa invisível fechada pelo plano 04-28). Este item é sobre as
IRMÃS e sobre a SUPERFÍCIE do sinal, nunca sobre reabrir aquela escolha.

---
Achado original: `in3-08-filtros-de-elegibilidade-fail-open.md`, promovido a plano em 2026-08-05.
Inventário de irmãos e medições:
`.planning/phases/04-confiabilidade-das-integra-es/04-35-PLAN.md`, com os números registrados no
SUMMARY do mesmo plano.
