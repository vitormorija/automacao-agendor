---
id: in3-08-filtros-de-elegibilidade-fail-open
type: todo
status: completed
priority: alta
created: 2026-08-05
source: Fase 4, code review 04-REVIEW.md (rodada 3) §IN3-08 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
resolved: 2026-08-05
resolved_by: 04-35-PLAN.md
tags: [backend, agendor, elegibilidade, fail-safe, core-value, candidato-a-requisito, phase-4-carryover]
---


## Desfecho (2026-08-05) — promovido a plano 04-35 e resolvido

A pergunta de direção que este todo existia para fazer foi **respondida pelo usuário**, depois de a
medição separar o achado em dois modos de falha distintos que o texto original tratava como um só.

**Medição que mudou o enquadramento:** o campo vem de `deal.dealStage?.funnel?.name`
(`agendor.js`). Nas fixtures — `real-deals.sample.json` (5 negócios reais anonimizados) e
`synthetic/deals-page.json` (10 sintéticos) — **15 de 15 têm a estrutura de funil**, com os nomes
`Funil 1`, `Funil 2` e `Comercial`. Funil ausente é caminho de exceção, não caso comum.

**Modo 2 — comparação exata (CORRIGIDO no 04-35).** `NO_OWNER_NOTIFY_FUNNELS` comparava por
igualdade exata, então qualquer renomeação no CRM ("Beefor Comercial") reabilitava silenciosamente
a notificação que a regra manda suprimir — sem depender de falha nenhuma. Passou a comparar por
substring (`.some((termo) => funnel.includes(termo))`). Consequência deliberada e aprovada pelo
usuário: `'beeforx'` também passa a ser suprimido. Os dois casos QUIRK de `agendor.funnel.test.js`
foram reescritos para o contrato novo. Precedente literal no mesmo módulo: `EXCLUDED_STAGE_WORDS`
já usava correspondência parcial.

**Modo 1 — direção da falha (DECIDIDO: mantém fail-open, com sinal).** Funil desconhecido **continua
notificando**. A razão é a assimetria que o texto original deste todo não capturava: aqui, ao
contrário do CR3-01, "não sei o funil" seria o estado padrão de qualquer payload que mude de forma
— não um evento raro após esgotar retry de uma chamada HTTP específica. Um fail-safe uniforme
reintroduziria exatamente o CR4-01 (supressão em massa invisível) que o 04-28 acabou de fechar.
O que mudou foi **observabilidade**: `funilAusente` por negócio, aviso agregado em `getStaleDeals`,
`results.funilNaoAvaliado` e alarme aditivo em `runCheck`. A asserção principal do caso
`funil null/ausente NÃO suprime` não mudou uma letra.

**Cobertura dos três consumidores** (`runCheck`, `runCheckOnly`, `sendOwnerWeeklySummary`): provada
por caso de teste, não por leitura — os três chamam a mesma função exportada. Suíte 186 → 192.

**O que ficou aberto:** [[in3-08b-comparacao-exata-nos-demais-filtros]] — a comparação exata nos
demais filtros de elegibilidade (`EXCLUDED_CATEGORIES`, `EXCLUDED_OWNERS`), classificados como
fora-de-escopo-com-medição porque mudá-los muda quem recebe e a decisão do usuário cobriu só o funil.

# IN3-08 — `shouldNotifyOwner` falha ABERTA com funil ausente, e os filtros de elegibilidade nunca foram olhados como categoria

**Onde:** `shouldNotifyOwner` e a constante `NO_OWNER_NOTIFY_FUNNELS`, em
`backend/src/agendor.js`; o campo `funnel` montado por `getStaleDeals` a partir do funil do estágio
do negócio, no mesmo arquivo. Caracterizado em `backend/test/agendor.funnel.test.js`, nos casos
nomeados `shouldNotifyOwner: funil null/ausente NÃO suprime — notifica o responsável` e
`shouldNotifyOwner: QUIRK 'beeforx' NÃO é suprimido — comportamento ATUAL`.

**O que acontece:** `shouldNotifyOwner` normaliza o funil com `(deal?.funnel || '').trim()
.toLowerCase()`. Funil ausente vira string vazia; string vazia não está em
`NO_OWNER_NOTIFY_FUNNELS`; a função devolve `true` → **notifica**. `getStaleDeals` deriva esse
campo do funil do estágio do negócio, ou seja: qualquer payload da Agendor que venha sem essa
estrutura reabilita a notificação que a regra de negócio manda suprimir. O mesmo vale para um
**rename** — "Beefor Comercial" deixa de casar com a comparação exata e volta a notificar.

A regra suprimida existe por um motivo escrito no próprio código: a Beefor é uma empresa do grupo
com produto próprio, e o vendedor da Cadmus pode ser dono da organização sem ser responsável por
acompanhar oportunidades naquele funil. Falhar aberta aqui significa mandar cobrança de negócio
parado para quem não é responsável por ele.

**Por que o review classificou como Info e não Warning:** os dois comportamentos **estão** pinados
como quirks conhecidos, por casos de teste que dizem no nome que descrevem o comportamento ATUAL.
Isso é honesto — não há surpresa escondida, há uma escolha documentada. O que **falta** não é
cobertura de teste. É a avaliação de risco.

## Por que isso é prioridade ALTA — a pergunta de direção

**Este é o segundo filtro de elegibilidade do sistema que falha aberto. O primeiro foi o bloqueante
desta rodada.**

CR3-01 era exatamente a mesma forma: a consulta de categoria da organização falhava, o `catch`
gravava um valor que a lista de exclusão não reconhecia, e o negócio de uma organização 'Parceiro'
era notificado por causa de um erro transitório de rede — com `results.error` indefinido e a linha
do log em `'sent'`. Um filtro de elegibilidade cuja falha resulta em **notificar**.

Nenhum plano desta fase olhou os filtros como **categoria**. Cada um foi tratado onde apareceu:
CR3-01 virou três planos (04-19, 04-20, 04-21) e este ficou como quirk pinado. Dois casos da mesma
forma, dois tratamentos diferentes, nenhuma regra escrita sobre qual é a direção correta.

**A pergunta que este todo existe para fazer:** para os filtros de elegibilidade do sistema —
categoria da organização, funil, estágio, tipo de negócio —, a direção padrão da falha é
**fail-open** (na dúvida, notifica) ou **fail-safe** (na dúvida, não notifica)? E ela deve ser
uniforme ou justificada caso a caso?

Os dois lados têm custo real e não são simétricos:

- **Fail-open** produz notificação INDEVIDA — cobrança a quem não é responsável, erosão da
  confiança no sistema, e o efeito de treinar o destinatário a ignorar o e-mail.
- **Fail-safe** produz notificação AUSENTE — e o Core Value do milestone nomeia notificação perdida
  em silêncio como a pior classe de falha.

**A rota "indecidível" é o precedente disponível, e ela dissolve boa parte do dilema.** A decisão
do usuário de 2026-08-05 sobre CR3-01 não escolheu entre notificar e não notificar: o negócio fica
**fora do envio** e **dentro do painel**, com a rodada seguindo normalmente. Não é fail-safe
silencioso — é fail-safe **visível**. Vale avaliar se a mesma forma serve para o funil ausente.

## Correção proposta

Não é uma linha de código. É, nesta ordem:

1. **Uma decisão registrada** sobre a direção padrão dos filtros de elegibilidade, com o custo dos
   dois lados escrito, no molde das decisões C8 a C11 desta fase.
2. **Um inventário** dos filtros existentes e da direção atual de cada um — a fase descobriu dois,
   e não há razão para supor que sejam os únicos.
3. Só então o conserto de `shouldNotifyOwner`, que muda comportamento e portanto exige caso de
   teste novo antes (constraint do `CLAUDE.md`). Os casos de quirk existentes viram os oráculos a
   serem reescritos — e reescrever um caso que diz "comportamento ATUAL" é justamente o sinal de
   que a decisão foi tomada.

**Candidato a promoção — este todo deve ser avaliado para virar requisito da fase seguinte**, e não
herdado como item de backlog. A justificativa: os dois achados da mesma forma apareceram em rodadas
de review diferentes, e o segundo só foi visto porque o primeiro tinha acabado de ser consertado.
Um terceiro filtro entra no sistema sem regra escrita para segui-lo.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN3-08.
