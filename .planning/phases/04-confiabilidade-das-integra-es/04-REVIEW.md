---
phase: 04-confiabilidade-das-integra-es
reviewed: 2026-08-05T21:40:00Z
depth: standard
round: 5
files_reviewed: 13
files_reviewed_list:
  - backend/src/agendor.js
  - backend/src/emailer.js
  - backend/src/scheduler.js
  - backend/src/routes/notifications.js
  - backend/test/agendor.funnel.test.js
  - backend/test/agendor.loteDeOrganizacoes.test.js
  - backend/test/agendor.paginacao.test.js
  - backend/test/agendor.cacheConcurrency.test.js
  - backend/test/emailer.resumoIndecidivel.test.js
  - backend/test/emailer.timeout.test.js
  - backend/test/scheduler.categoriaIndecidivel.test.js
  - frontend/src/components/Dashboard.jsx
  - frontend/src/components/DealsList.jsx
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Fase 04 — Code Review, Rodada 5 (gap closure r4: planos 04-28 a 04-34, mais o 04-35)

**Reviewed:** 2026-08-05T21:40:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Ambiente confirmado: `npm test` → **192/192 verdes**; `npm run lint` → exit 0, **44 warnings**
(baseline). Duas provas empíricas deste relatório foram reproduzidas por sonda **fora da árvore do
repositório** (scratchpad), sem tocar em nenhum arquivo do projeto; a saída literal está citada nos
achados. Nenhum valor de segredo aparece aqui.

A rodada 4 fechou o que prometeu: o alarme de supressão total existe, `getStaleDeals` ganhou teto,
`getUsers` ganhou guarda de envelope, a prévia deixou de mentir e o resumo semanal deixou de morrer
por um `ownerName` nulo. O 04-35 mudou comportamento de quem-recebe (funil por substring) com
oráculo cobrindo o comportamento novo nos **três** consumidores, e o fez sem reproduzir o modo de
falha do `cr4-01b` — o contador novo tem numerador e denominador sobre o mesmo conjunto, e isso está
medido nos cenários I e J.

O padrão da fase, porém, **repetiu-se pela quinta vez**, e desta vez em duas direções novas:

1. **O conserto do CR4-01 abriu vizinho, sim** — e não o que o `cr4-01b` documenta. O alarme é
   desarmado por **qualquer guarda anterior que faça `continue`**, e a mais banal delas é a **dedup
   do dia**, que ninguém registrou. Sonda: apagão TOTAL da borda `/organizations`, 3 negócios, zero
   e-mails, e o alarme **calado** (**CR/WR5-01**). Pior: a "Correção proposta" escrita dentro do
   próprio `cr4-01b` (derivar o denominador na borda) **não fecha** este caminho, porque o problema
   é o numerador, não o denominador. Quem fechar aquele todo vai marcá-lo como resolvido com o
   defeito presente.
2. **O 04-35 escreveu a justificativa que condena o irmão e não olhou 40 linhas acima.** O aviso
   agregado de funil existe porque "um aviso por negócio produziria N linhas a cada atualização de
   tela, e um log inundado é um log que ninguém lê: a mitigação viraria o defeito". O aviso de
   categoria indecidível, na **mesma função**, continua sendo exatamente isso (**WR5-02**), e a
   sonda o exibe: 3 negócios, 3 linhas, numa única chamada de um caminho com auto-refresh de 5 min.

E há um defeito **na única superfície de feedback do disparo manual** que atravessou cinco rodadas
sem ser visto, e que anula na prática a metade "audível" do conserto do CR4-01: `results.skipped`
(contador) colide com o contrato `{ skipped: true, reason }` do lock de concorrência, e o Dashboard
mostra um **toast de erro em branco** em toda rodada com ao menos um negócio pulado — inclusive no
apagão (**CR5-01**). Isto foi medido, não deduzido.

---

## Avaliação pedida: o mandato "INVENTÁRIO DE IRMÃOS" funcionou?

**Veredito: funcionou, é substancialmente melhor que o mandato do "cenário simétrico" que ele
substituiu, e não virou cerimônia — mas tem um ponto cego estrutural que esta rodada mede três
vezes.**

### O que ele entregou de substantivo (verificado, não aceito do SUMMARY)

| Plano | Inventário | Veredito |
|---|---|---|
| 04-29 | envelope nas 3 paginações | **Substantivo e exemplar.** O caso (8) de `agendor.paginacao.test.js` (`IRMÃS VERIFICADAS`) *executa* as duas irmãs contra `sem-data` em vez de lê-las. É verificação, não asserção de leitura. |
| 04-30 | fan-out proporcional ao dado | **Substantivo.** O caso (3) de `agendor.loteDeOrganizacoes.test.js` mede o `batchSize` do irmão (`maxEmVooDeals === 5`) em vez de presumi-lo, e o residual virou `wr4-04b`. |
| 04-31 | superfícies que anunciam quem será notificado | **Substantivo.** Os cenários F, G e H asserem **igualdade de conjuntos** entre prévia e envio — oráculo certo para uma duplicação declarada e deliberada. |
| 04-32 | campo de nome nulo chegando a e-mail | **Substantivo.** O cenário (6) mede o custo AGREGADO (o vizinho sem defeito que perdia o relatório), que é o dano real; um caso de "não lança" teria passado sem medir nada. |
| 04-33 | 45 referências por número de linha | **Substantivo e honesto.** Entregou o residual medido (39 linhas em 9 arquivos) a `wr4-03b` em vez de declarar a limpeza completa. |
| 04-35 | 3 consumidores de `shouldNotifyOwner` + constantes irmãs | **O melhor da rodada.** Os três consumidores foram classificados **por medição** — cenário H para a prévia, caso (8) para o resumo individual —, e `EXCLUDED_CATEGORIES`/`EXCLUDED_OWNERS` saíram com a assimetria de risco escrita (substring sobre nome de pessoa é mais perigosa). |
| 04-28 | os 4 `results.skipped++` | **Parcialmente cerimonial — e é onde o ponto cego aparece.** Ver abaixo. |

Nenhum item marcado `verificada-e-sã` que eu conferi estava sem grep ou sem caso de teste. Isso é
uma melhora real sobre as rodadas 1-3, em que "o vizinho está são" era afirmação de leitura.

### O ponto cego, medido três vezes nesta rodada

O inventário pergunta **"este irmão está são?"**. Ele não pergunta **"o que eu acabei de construir
depende do comportamento deste irmão?"**. As duas perguntas têm respostas diferentes:

- O 04-28 classificou o ramo de **dedup** como `verificada-e-sã` com a evidência certa para a
  pergunta errada ("a supressão por dedup deixa vestígio por construção" — verdade). O que ficou
  sem perguntar é que o `continue` daquele ramo **desarma o alarme que o próprio 04-28 estava
  criando**. Ver **WR5-01**, com sonda.
- O 04-35 escreveu no código a **regra geral** desse mecanismo ("um contador que só incrementa
  depois de outra guarda ter feito `continue` não consegue alcançar o denominador") e aplicou-a ao
  contador NOVO — corretamente — sem aplicá-la de volta ao contador do 04-28, que fica 60 linhas
  abaixo no mesmo arquivo, nem corrigir a descrição de `cr4-01b`.
- O 04-35 escreveu a **justificativa** do aviso agregado e não a aplicou ao aviso irmão que fica na
  mesma função, 40 linhas acima. Ver **WR5-02**.

### Recomendação para o fechamento da fase (ou para a r6)

Manter o inventário de irmãos e acrescentar duas cláusulas baratas e conferíveis:

1. **Cláusula de direção inversa.** Além de "quem é irmão do que eu consertei", listar **de que
   comportamento alheio o meu conserto depende** — para um contador agregado, quais guardas
   anteriores podem impedi-lo de alcançar o denominador; para um alarme, o que pode calá-lo.
2. **Cláusula da justificativa retroativa.** Toda justificativa escrita num comentário novo vira um
   grep obrigatório no mesmo arquivo/função por construções que ela condena. Nesta rodada essa
   cláusula sozinha teria pego WR5-02 em menos de um minuto.

E, para os residuais: `cr4-01b` deve ser **reescrito antes de ser fechado** — hoje ele documenta uma
causa (negócio sem organização) e propõe uma correção que não fecha a outra (dedup).

---

## Avaliação dos desvios deliberados declarados

1. **CR4-01, limiar = supressão TOTAL (decisão do usuário).** *Concordo com o limiar, e a
   construção aditiva confere:* o bloco fica depois do laço, não condiciona `continue` nenhum, e os
   cenários A/B fixam o piso. **Discordo do enquadramento do residual**: a lacuna não é "a rodada
   MISTA por negócio sem organização", é "qualquer guarda anterior desarma o alarme". Ver WR5-01.
2. **04-35 modo 2 — substring.** *Sem ressalva.* Consequência apresentada e escolhida; os dois
   QUIRK foram invertidos e o caso 7 (`'Comercial'` NOTIFICA) é a testemunha de não-supressão que
   impede uma implementação que suprima sempre. Não reportado.
3. **04-35 modo 1 — fail-open mantido com sinal.** *Concordo, e o argumento é o certo:* um
   fail-safe uniforme faria "não sei o funil" virar o default de qualquer payload de forma mudada,
   reintroduzindo o CR4-01. A asserção (b) do cenário I é o guarda-corpo certo. Não reportado.
4. **D-IN3-08-f (contador no topo do laço).** *Concordo, e verifiquei:* numerador e denominador
   percorrem `dealsToNotify` inteiro. É a única das duas construções de contador da fase que está
   correta — e é justamente o contraste que torna WR5-01 conferível.
5. **D-IN3-08-g (ordem dos alarmes).** *Concordo.* Precedência por ordem de escrita, com as duas
   mensagens no array que a UI renderiza. Não reportado.
6. **Mensagem estreita do alarme do 04-35.** *Concordo com a redação e com o gate.* A ressalva que
   registro não é sobre a redação, é sobre o **limiar** — ver WR5-03, que o desvio declarado não
   cobre.
7. **`sendWeeklySummary` não filtra de propósito.** *Concordo.* Caso (3) de
   `emailer.resumoIndecidivel.test.js` é o guarda-corpo certo. Não reportado.
8. **`runCheckOnly` sem a proteção de dedup.** *Concordo.* Prévia somente-leitura, falha vira HTTP
   500 visível. Não reportado.
9. **`D-WR3-07-c` (7 variáveis de armação).** *Concordo, e a medição confere* — os pontos de
   suspensão são armados uma vez e consumidos na ordem declarada; zerá-los re-arma uma suspensão sem
   liberador. `wr3-07b` é a resposta certa. Não reportado.
10. **C8 / SEC-01.** Não reportado; nenhum valor de token exibido.
11. **33 todos pendentes.** Conferidos antes de registrar Info. `in4-01`..`in4-06`, `in3-01`..
    `in3-08b`, `cr4-01b`, `cr4-01c`, `wr3-07b`, `wr4-03b`, `wr4-04b`, `wr4-07b`, `ui-01` e
    `rel-02b` não foram re-descobertos.

> Nenhum bloco `<structural_findings>` foi fornecido nesta rodada — não há seção de substrato
> estrutural a preservar.

---

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR5-01 [BLOCKER]: `results.skipped` (contador) colide com o contrato `{ skipped: true, reason }` — o botão "Enviar notificações" mostra um toast de ERRO em branco em toda rodada com ao menos um negócio pulado, inclusive no apagão do CR4-01

**Origem:** colisão de nome pré-existente, mas **é ela que anula a metade audível do conserto do
CR4-01** e nenhuma das cinco rodadas a mediu — a r4 chegou a afirmar o contrário
(`04-REVIEW-r4.md`: *"O toast do botão 'Enviar notificações' diz `0 notificação(ões) enviada(s) de 5
negócio(s) parado(s)`"*), e o 04-28 herdou essa afirmação errada no seu enquadramento.

**File:** `frontend/src/components/Dashboard.jsx:88-101` (o consumidor);
`backend/src/scheduler.js:28-29` (`return { skipped: true, reason }`), `:37` (`skipped: 0`, o
contador), `:143`/`:163`/`:174`/`:371` (os quatro incrementos);
`backend/src/routes/notifications.js:43-49` (`res.json(result)`, que devolve o objeto inteiro)

**Issue:**
`runCheck` usa a chave `skipped` para **duas coisas incompatíveis**:

- `{ skipped: true, reason: 'Verificação já em andamento' }` — o retorno do lock de concorrência;
- `results.skipped` — o **contador** de negócios pulados na rodada, incrementado por dedup,
  categoria indecidível, funil e "sem destinatário".

O consumidor não distingue:

```jsx
const result = await r.json();
if (result.skipped) {                        // Dashboard.jsx:90
  toast.error(result.reason, { id: toastId }); // result.reason é undefined
} else {
  toast.success(`${result.notified} notificação(ões) enviada(s) de ${result.stale} ...`);
}
```

Medido pela sonda (fora da árvore do repositório), no cenário exato do CR4-01 — apagão total de
`/organizations`, 3 negócios parados, zero e-mails:

```
results.stale                       : 3
results.notified                    : 0
results.skipped                     : 3
typeof results.skipped              : number
`if (result.skipped)` avalia para   : true
ramo tomado                         : toast.error(result.reason)
result.reason                       : undefined
```

Consequências, em ordem de gravidade:

1. **A rodada mais comum do uso manual reporta erro.** Basta **um** negócio deduplicado — o caso
   normal de clicar "Enviar notificações" depois de o cron das 8h já ter rodado — para o operador
   receber um **toast vermelho vazio** em vez do resumo. `react-hot-toast` renderiza `undefined`
   como conteúdo vazio: erro sem mensagem.
2. **A ameaça que a fase nomeia se realiza.** O comentário do alarme do 04-35 (`scheduler.js:386-389`)
   diz por extenso que a mitigação existe para impedir que *"um operador que conclua ter perdido
   envios dispare a rodada de novo e gere duplicatas"*. Um erro vermelho sem texto depois de um
   envio bem-sucedido produz exatamente essa conclusão.
3. **Anula a metade audível do CR4-01 justamente no disparo manual.** No apagão, o operador não vê
   `results.errors` (que só é renderizado no bloco "Erros na última execução", alimentado por
   `status.lastRunResult` do polling de 2 min) — vê primeiro um toast vermelho vazio, que não
   distingue apagão de dia normal com dedup.
4. O caminho legítimo (`{ skipped: true }` do lock) fica **inalcançável de forma distinguível**: os
   dois produzem a mesma renderização.

**Fix:** desambiguar no produtor, não no consumidor — o consumidor não tem informação para separar
os dois. Renomear o retorno do lock, preservando compatibilidade:

```js
// backend/src/scheduler.js — o guard do topo de runCheck
if (isRunning)
  return {
    skipped: true,                       // mantido por compatibilidade
    execucaoIgnorada: true,              // a chave que o consumidor passa a ler
    reason: 'Verificação já em andamento',
  };
```

```jsx
// frontend/src/components/Dashboard.jsx — sendNow
if (result.execucaoIgnorada) {
  toast.error(result.reason || 'Verificação já em andamento', { id: toastId });
} else {
  toast.success(
    `${result.notified} notificação(ões) enviada(s) de ${result.stale} negócio(s) parado(s)`,
    { id: toastId, duration: 5000 },
  );
  if (result.errors?.length) {
    toast.error(result.errors[0], { id: `${toastId}-alarme`, duration: 8000 });
  }
}
```

Cobrir com: (a) um caso em `scheduler.categoriaIndecidivel.test.js` asserindo que uma rodada que
CONCLUIU **não** traz `execucaoIgnorada` mesmo com `results.skipped > 0` (o cenário E já tem
`skipped === 2` e serve de armação); e (b) o simétrico — a segunda chamada concorrente traz
`execucaoIgnorada === true` **e** `reason` string não vazia. Sem o par, um conserto que apenas troque
o nome no consumidor deixa o lock silencioso.

---

### Warnings

#### WR5-01 [WARNING]: o alarme de supressão total é desarmado por **qualquer** guarda anterior — a dedup do dia inclusive —, e `cr4-01b` documenta a causa errada e propõe uma correção que não a fecha

**Origem:** vizinho aberto pelo conserto do CR4-01 (04-28), exatamente como o conserto do CR3-01
abriu o CR4-01. O mecanismo geral foi escrito no código pelo 04-35 (`scheduler.js:88-97`) e **não**
foi aplicado de volta ao contador do 04-28, 60 linhas abaixo.
**File:** `backend/src/scheduler.js:132-146` (a guarda de dedup, com `continue`), `:159-167` (a
guarda de categoria, onde o contador incrementa), `:430-442` (a condição do alarme);
`.planning/todos/pending/cr4-01b-limiar-de-supressao-total.md` (o artefato dono)

**Issue:**
`results.skippedCategoriaIndecidivel` incrementa **dentro** da guarda de categoria, que é a
**segunda** do laço. A dedup do dia vem antes e faz `continue`. Logo, todo negócio deduplicado
**subtrai do numerador sem subtrair do denominador** (`results.stale`), e a condição
`skippedCategoriaIndecidivel === results.stale` fica inalcançável.

Reproduzido por sonda (fora da árvore do repositório): rodada 1 com a borda sã notifica o negócio
9001; rodada 2, com a borda `/organizations` **inteiramente fora** e três negócios parados:

```
── RODADA 2: apagão TOTAL da borda /organizations ──
results.stale                       : 3
results.notified                    : 0
e-mails enviados na rodada          : 0
results.skippedCategoriaIndecidivel : 2      <- numerador
results.skipped                     : 3      <- denominador de fato
results.error                       : undefined
results.errors                      : []
ALARME DISPAROU?                    : NÃO
```

Dois negócios elegíveis foram suprimidos por indisponibilidade de borda, zero e-mails saíram, e a
rodada é **indistinguível de um dia calmo** — que é literalmente o enunciado do CR4-01, reaberto por
um caminho que nenhum plano nomeou.

Por que isto não é o `cr4-01b` já registrado:

- `cr4-01b` descreve **uma** causa — "um negócio **sem organização** escapa da contagem" — e a
  medição registrada nele é só sobre `deal.organization?.id` falso.
- A causa medida aqui é **outra e mais banal**: um negócio já notificado hoje. Não exige dado
  faltando no CRM; exige apenas que o operador dispare o envio manual depois do cron, ou que uma
  rodada anterior do dia tenha notificado alguém.
- Pior: a **"Correção proposta"** escrita dentro de `cr4-01b` — *"contar na borda, dentro de
  `getStaleDeals`, quantos negócios tinham organização a consultar"* — mexe no **denominador**. O
  defeito medido aqui está no **numerador**, gated por um `continue` anterior. Quem executar aquela
  correção fecha o todo, deixa o oráculo verde (a rodada mista por falta de organização passa) e
  **este caminho continua aberto**.

O contraste que torna o achado conferível: o contador irmão do 04-35 (`funilNaoAvaliado`) incrementa
no **topo** do laço, antes de qualquer guarda, e o comentário `scheduler.js:88-97` diz que a posição
é decisão **justamente para não reproduzir este modo de falha**. A regra existe escrita; só não foi
aplicada onde nasceu.

**Fix:** mover a contagem para onde numerador e denominador percorrem o mesmo conjunto, como já foi
feito para o funil — e não mexer no denominador:

```js
// backend/src/scheduler.js — no TOPO do laço, ao lado de `if (deal.funilAusente) ...`
if (deal.categoriaIndecidivel) results.categoriaIndecidivelNaRodada++;
```

mantendo `results.skippedCategoriaIndecidivel` (que responde a outra pergunta: quantos a *guarda*
suprimiu) e passando o alarme a comparar `results.categoriaIndecidivelNaRodada === results.stale`.

Cobrir com o cenário que hoje não existe: **rodada MISTA por dedup** — três negócios, um já com
linha `'sent'` de hoje, os três com a organização inatingível, asserindo `r.errors.length === 1`,
`r.notified === 0` e os seis destinatários com zero envios. E o simétrico obrigatório: um negócio
deduplicado ao lado de dois **notificáveis com sucesso** exige `r.errors.length === 0`, senão o
conserto troca a mudez por ruído diário.

E **reescrever `cr4-01b` antes de fechá-lo**, para que ele nomeie o mecanismo (qualquer `continue`
anterior) em vez de uma de suas causas.

---

#### WR5-02 [WARNING]: o aviso de categoria indecidível continua sendo **um por negócio** no caminho de LEITURA do painel — exatamente a forma que a justificativa escrita pelo 04-35, 40 linhas abaixo na mesma função, declara ser "a mitigação virando o defeito"

**Origem:** justificativa nova não aplicada retroativamente ao irmão. Os dois avisos moram na
**mesma função**.
**File:** `backend/src/agendor.js:431-435` (o aviso por negócio, do 04-19/04-20) vs `:462-477` (o
aviso agregado, do 04-35); consumidores em `backend/src/routes/deals.js:16`,
`backend/src/routes/reports.js:11`, `backend/src/routes/notifications.js:124`/`:148`/`:184`,
`backend/src/scheduler.js:68`/`:472`/`:575`; auto-refresh em
`frontend/src/components/DealsList.jsx:14` (`AUTO_REFRESH_SECONDS = 300`)

**Issue:**
O 04-35 escreveu, para justificar a forma agregada do aviso novo (`agendor.js:462-469`):

> *"Uma linha por CHAMADA, e não uma por negócio como faz o aviso de categoria acima, e a diferença
> é decisão: `getStaleDeals` é também o caminho de LEITURA do painel — oito invocações fora deste
> módulo, com auto-refresh na tela de negócios parados. (…) um aviso por negócio produziria N linhas
> a cada atualização de tela, e um log inundado é um log que ninguém lê: a mitigação viraria o
> defeito."*

O raciocínio está certo e o plano o aplicou ao aviso **novo**. O aviso **irmão**, 40 linhas acima na
mesma função e no mesmo laço, continua sendo `logger.warn` **por negócio** — a forma que a frase
acabou de condenar por escrito. A sonda o exibe literalmente numa única chamada de `runCheck`:

```
[WARN] [Agendor] Categoria indecidível: a organização "Org 9101" (id 9101) ... O negócio 9001 ...
[WARN] [Agendor] Categoria indecidível: a organização "Org 9102" (id 9102) ... O negócio 9002 ...
[WARN] [Agendor] Categoria indecidível: a organização "Org 9103" (id 9103) ... O negócio 9003 ...
```

Sob o cenário que o CR4-01 existe para tornar audível — a borda de organizações fora —, com `N`
negócios parados o custo é `N` linhas por **cada** uma das 8 invocações: a cada `GET
/api/deals/stale` (auto-refresh de 5 min), a cada `/api/reports`, a cada
`POST /api/notifications/check`, e mais uma vez na rodada de envio. O sinal agregado que a fase
construiu (`logger.error` do alarme, uma linha por rodada) fica **soterrado** pelo ruído do irmão,
que é a única razão de o alarme ter sido criado.

O aviso por negócio também é a única fonte que nomeia a **organização** — informação que não deve
ser perdida. A saída não é apagá-lo: é agregar por chamada e degradar o detalhe.

**Fix:** dar ao aviso de categoria a mesma forma do aviso de funil — acumular no laço e emitir uma
linha por chamada, mantendo os nomes num único agregado limitado:

```js
// backend/src/agendor.js — dentro do laço, no lugar do logger.warn por negócio
if (categoriaIndecidivel) {
  orgsIndecidiveis.add(deal.organization?.name || `id ${deal.organization?.id}`);
}

// ...depois do laço, ao lado do aviso agregado de funil
if (orgsIndecidiveis.size > 0) {
  logger.warn(
    `[Agendor] ${orgsIndecidiveis.size} organização(ões) não puderam ser consultadas — ` +
      `os negócios delas ficam FORA do envio e permanecem no painel: ` +
      `${[...orgsIndecidiveis].slice(0, 10).join(', ')}`,
  );
}
```

(Mesma regra de CR-02 do 04-09: nomes e inteiros, nunca o objeto de erro do axios.)

Cobrir contando **linhas de log** e não conteúdo: um caso com 3 negócios de 3 organizações
inatingíveis exigindo **1** emissão de `logger.warn` por chamada de `getStaleDeals`, e o simétrico
com 0 indecidíveis exigindo **0**. Hoje nenhum caso da suíte mede a *cardinalidade* de nenhum dos
dois avisos — o do funil está pinado só por `r.errors.length`, que é outra superfície.

---

#### WR5-03 [WARNING]: o alarme de forma do funil dispara com N = 1 e afirma que "a forma do payload da Agendor pode ter mudado" — num dia de um único negócio parado sem funil, a afirmação é falsa e o alarme é diário

**Origem:** limiar do alarme novo do 04-35. Os desvios declarados cobrem posição do contador
(D-IN3-08-f), ordem (D-IN3-08-g) e redação da mensagem, mas **não** o limiar.
**File:** `backend/src/scheduler.js:403-412`; oráculo `backend/test/scheduler.categoriaIndecidivel.test.js`
cenários I e J (ambos com N = 2)

**Issue:**
A condição é `results.stale > 0 && results.funilNaoAvaliado === results.stale`. Quando a rodada tem
**um** negócio parado e esse negócio veio sem funil, a condição vale trivialmente, e a mensagem
emitida afirma:

> *"Nenhum dos 1 negócio(s) parado(s) do dia trouxe funil: (…) e a forma do payload da Agendor pode
> ter mudado."*

Isto tem três problemas somados:

1. **A afirmação é factualmente errada** no caso mais provável de N = 1: um negócio isolado sem
   funil cadastrado no CRM não é mudança de forma do payload. O 04-35 foi cuidadoso ao proibir por
   gate a frase larga sobre supressão — a frase sobre *forma* tem o mesmo problema e não recebeu o
   mesmo cuidado.
2. **O volume diário torna N pequeno o caso normal, não a exceção.** `results.stale` não é o total
   de negócios do CRM: é o subconjunto parado além do threshold e sem tarefa futura. Um dia com 1-3
   negócios é rotina, e nesse regime "100% da rodada" é um limiar quase sem força discriminante.
3. **O oráculo não cobre N pequeno.** I e J usam exatamente 2 negócios cada. Uma implementação com
   piso mínimo continuaria verde nos dois, e uma sem piso também — o par não distingue as duas.

O dano é o que os cenários E e J foram escritos para evitar: `logger.error` + bloco vermelho no
Dashboard num dia normal treina o operador a ignorar o bloco, e aí o apagão real (WR5-01, CR4-01)
volta a passar despercebido.

**Fix:** exigir massa antes de afirmar mudança de forma, e separar as duas afirmações:

```js
// backend/src/scheduler.js
const PISO_DE_FORMA = 3; // abaixo disto "100% da rodada" não é evidência de forma
if (
  results.stale >= PISO_DE_FORMA &&
  results.funilNaoAvaliado === results.stale
) { /* alarme de FORMA, como hoje */ }
else if (results.funilNaoAvaliado > 0) {
  logger.warn(
    `[Scheduler] ${results.funilNaoAvaliado} de ${results.stale} negócio(s) sem funil: a regra ` +
      'de supressão por funil não pôde ser avaliada neles. Todos seguem elegíveis.',
  );
}
```

O ramo baixo fica em `logger.warn` e **fora** de `results.error`/`results.errors` — informação, não
alarme. Cobrir com o par que falta: N = 1 sem funil exige `r.errors.length === 0`; N = `PISO_DE_FORMA`
sem funil exige `r.errors.length === 1`. Sem esse par, qualquer piso escolhido fica sem oráculo.

O mesmo raciocínio de N pequeno vale para o alarme de categoria (`:430-442`), mas ali a mensagem
continua **verdadeira** com N = 1 ("nenhum negócio foi notificado, a categoria não pôde ser
consultada") — por isso não o reporto: o limiar é decisão registrada do usuário e a mensagem não
mente.

---

#### WR5-04 [WARNING]: os dois contadores de supressão irmãos de `sendOwnerWeeklySummary` usam mecanismos de log diferentes — o de funil sai por `console.log` e **não** entra no log estruturado de produção

**Origem:** o inventário do 04-28 classificou `sendOwnerWeeklySummary` como `verificada-e-sã` com a
evidência *"já tem contador PRÓPRIO (…) com linha de log dedicada (…) separado do contador de funil
(`skippedByFunnel`, com a sua própria linha `[Emailer]`)"*. A medição olhou a **existência** das
duas linhas e não o **mecanismo** de cada uma.
**File:** `backend/src/emailer.js:791-795` (`console.log`, funil) vs `:799-803` (`logger.warn`,
categoria); política em `CLAUDE.md` (seção Logging)

**Issue:**
As duas supressões acontecem na mesma função, decidem a mesma coisa (quem sai do relatório
individual do comercial) e são reportadas por caminhos incompatíveis:

```js
if (skippedByFunnel > 0) {
  console.log(`[Emailer] Relatório semanal: ${skippedByFunnel} card(s) ignorado(s) por funil ...`);
}
...
if (ignoradosPorCategoriaNaoConsultada > 0) {
  logger.warn(`[Emailer] Relatório semanal: ${...} card(s) fora do relatório individual ...`);
}
```

Em produção (`NODE_ENV=production`) o `logger` emite **JSON de uma linha** com `time`/`level`/
`message`, projetado para agregação; `console.log` emite texto cru sem nível. Resultado: numa
agregação por nível ou por campo, a supressão por **funil** — que é justamente o que o 04-35 acabou
de alargar para substring, aumentando o conjunto suprimido — fica **invisível**, enquanto a irmã
aparece. Quem investigar "por que este comercial não recebeu o relatório de sexta" encontra metade
das causas.

`CLAUDE.md` é explícito: *"Use `logger.info/warn/error/debug(...)` para todo código novo do backend
— NÃO usar `console.log`/`console.error` cru em módulos novos"*, e nomeia `emailer.js` como legado a
**não** replicar. O ponto aqui não é a dívida legada em si: é que o módulo **já importa** `logger`
(`emailer.js:4`), já o usa na linha de baixo, e a linha de cima ficou para trás na mesma edição.

**Fix:** uma linha.

```js
// backend/src/emailer.js
if (skippedByFunnel > 0) {
  logger.warn(
    `[Emailer] Relatório semanal: ${skippedByFunnel} card(s) ignorado(s) por funil sem ` +
      'notificação ao responsável',
  );
}
```

O mesmo vale para `:857` e `:867` (envio/erro por comercial) e para `:222` (`console.warn` do retry),
mas essas três são legado não tocado por esta rodada — o par de contadores de supressão é o que a
rodada editou e o que decide destinatário.

---

#### WR5-05 [WARNING]: os cenários novos do oráculo de quem-recebe trocaram igualdade exata por `>= 1` nas asserções de envio — deixaram de detectar **e-mail duplicado**, que é a outra metade do Core Value

**Origem:** cenários H, I e J, introduzidos pelo 04-35, no mesmo arquivo em que A, B e C usam
igualdade exata.
**File:** `backend/test/scheduler.categoriaIndecidivel.test.js:886`, `:888`, `:940-943`, `:996-999`
— comparar com `:419-420` (cenário A), `:474-475` (B), `:529-532` (C)

**Issue:**
A, B e C asserem `assert.equal(envios(DONO_2), 1)`. H, I e J asserem `assert.equal(envios(DONO_2) >= 1, true)`
— 10 asserções ao todo. As duas formas medem coisas diferentes:

- `=== 1` detecta **envio a menos** (a supressão indevida) **e envio a mais** (a duplicata);
- `>= 1` detecta apenas o envio a menos.

O Core Value do milestone é "quem recebe / quem **não** recebe", e a duplicata é a metade que a
fase inteira negocia explicitamente: o trade-off do checkpoint C10, a semântica de sucesso parcial
de WR-01, a razão de `houveEnvioConfirmado` existir em dois ramos (WR2-01), e a ameaça T-04-35-05
("o operador dispara a rodada de novo e gera duplicatas"). Nos três cenários mais novos — os que
exercitam o comportamento **mudado** por esta rodada — essa metade deixou de ser medida.

E o enfraquecimento não tem justificativa técnica: nos três cenários `runCheckOnly` (somente
leitura) roda antes e `runCheck` roda uma única vez, então o valor exato é 1. Nenhum comentário do
arquivo registra o motivo da troca de forma, ao contrário de todas as outras decisões de instrumento
daquele arquivo, que são densamente justificadas.

**Fix:** restaurar a forma dos cenários irmãos.

```js
assert.equal(envios(DONO_2), 1, 'o dono do negócio elegível recebe UMA vez');
assert.equal(envios(AUTOR_2), 1, 'o autor do negócio elegível recebe UMA vez');
```

nos seis pontos de I e J e nos dois de H. Se algum ficar vermelho, o vermelho é o achado — e é
exatamente o achado que a forma `>=` está escondendo.

---

### Info

#### IN5-01: `results.error` passou a significar duas coisas incompatíveis e nenhum consumidor pode separá-las

**File:** `backend/src/scheduler.js:409` e `:439` (rodada que **concluiu**) vs `:450` (rodada
**abortada**, dentro do `catch`)
**Issue:** até o 04-28, `results.error` só era preenchido pelo `catch` — significava "a rodada
morreu". Agora significa também "a rodada concluiu, mas houve supressão/forma anômala". Um consumidor
que queira responder "o cron das 8h rodou até o fim?" não consegue mais: as duas situações têm a mesma
forma. Hoje nenhum consumidor lê o campo (medido: `grep -rn "lastRunResult" frontend/src` devolve só
`Dashboard.jsx:108`, que lê `errors` e não `error`), então o dano é latente.
**Fix:** acrescentar `results.concluiu = true` antes de `results.duration`, ou mover os alarmes para
um campo próprio (`results.alarmes`) mantendo `results.errors` como superfície de UI. Anda junto de
`cr4-01c`.

#### IN5-02: as três paginações guardam a chave `data` mas nenhuma guarda o **envelope** nulo

**File:** `backend/src/agendor.js:56` (`data.data || []`), `:310` (`firstPage.meta?.totalCount`),
`:342` (`r.data || []`), `:495` (`data.data || []`)
**Issue:** o conserto de WR4-05 e o comentário `:51-55` estão corretos quanto à assimetria que
existia (a chave `data` ausente). O residual é **uniforme**: se a borda responder 200 com corpo
`null` ou string vazia, `data.data` / `firstPage.meta` lançam `TypeError` nas três, e o caso (8) de
`agendor.paginacao.test.js` não cobre esse formato (ele serve `{ data: {...} }`, sempre objeto).
Registro como Info porque é uniforme e não é vizinho aberto por conserto nenhum.
**Fix:** `const envelope = data || {};` no topo de cada desestruturação, e acrescentar ao caso (8) um
modo `'envelope-nulo'`.

#### IN5-03: a guarda `html.includes('null') === false` do oráculo do resumo semanal é larga demais e ficará vermelha por conteúdo legítimo

**File:** `backend/test/emailer.resumoIndecidivel.test.js:235-246` (`assertHtmlSemNuloNoNome`), usada
nos cenários 5, 6 e 7
**Issue:** a asserção varre o corpo **inteiro** do e-mail. Qualquer dado legítimo que contenha a
substring `null` — um título de negócio, um nome de organização, um nome de etapa — reprova o caso
por motivo sem relação com o defeito medido (`ownerName` nulo chegando à saudação). O irmão
`includes('undefined')` tem o mesmo problema em menor grau.
**Fix:** restringir o escopo ao trecho sob medição, p. ex. asserir sobre o bloco da saudação
(`/Olá, <strong>([^<]+)<\/strong>/`) e exigir que o grupo capturado não seja `'null'`/`'undefined'`.

#### IN5-04: o lote de organizações limita concorrência mas não impõe pausa entre lotes, enquanto o lote irmão de páginas impõe

**File:** `backend/src/agendor.js:392-398` (sem pausa) vs `:337-345` (`await new Promise(r => setTimeout(r, 1000))`)
**Issue:** a justificativa escrita para `LOTE_DE_ORGS` (`:381-390`) é que retentar em massa
*"PROLONGA a própria janela de rate limit"*. Um teto de concorrência sem pausa reduz o **pico
simultâneo** mas quase não reduz a **taxa** de requisições — 25 organizações continuam saindo em
milissegundos, em 3 lotes encostados. O oráculo (`agendor.loteDeOrganizacoes.test.js`) mede
exclusivamente `maxEmVoo`, então essa distinção não tem guarda-corpo.
**Fix:** ou acrescentar a mesma pausa entre lotes do irmão (e medi-la), ou ajustar o comentário para
afirmar só o que a construção entrega (pico, não taxa). A segunda opção é mais barata e não muda
comportamento.

---

_Reviewed: 2026-08-05T21:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard — rodada 5 (gap closure r4: planos 04-28 a 04-34, mais o 04-35)_
_Suíte executada: 192/192 verdes; `npm run lint` exit 0 (44 warnings, baseline)_
_Provas empíricas: 1 sonda, reproduzida fora da árvore do repositório, cobrindo CR5-01, WR5-01 e WR5-02_
