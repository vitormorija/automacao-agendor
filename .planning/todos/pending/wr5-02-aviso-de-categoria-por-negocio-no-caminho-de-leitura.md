---
id: wr5-02-aviso-de-categoria-por-negocio-no-caminho-de-leitura
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, code review 04-REVIEW-r5.md (rodada 5) §WR5-02 — escopo travado pelo usuário — warning vira todo, não plano
resolves_phase: null
tags: [backend, agendor, logging, observabilidade, cr4-01, oraculo, phase-4-carryover]
---

# WR5-02 — o aviso de categoria indecidível continua sendo **um por negócio** no caminho de LEITURA do painel, e soterra o alarme agregado que a fase construiu

**Onde:** os **dois** avisos de `getStaleDeals`, em `backend/src/agendor.js`, dentro da **mesma
função** e do **mesmo laço** de enriquecimento:

- o aviso de **categoria indecidível** (dos planos 04-19/04-20) — `logger.warn` **por negócio**,
  emitido de dentro do laço;
- o aviso agregado de **funil não avaliado** (do plano 04-35) — uma linha **por chamada**, emitida
  depois do laço.

**O que acontece:** o 04-35 escreveu, no comentário que justifica a forma agregada do aviso **novo**,
que *"um aviso por negócio produziria N linhas a cada atualização de tela, e um log inundado é um log
que ninguém lê: a mitigação viraria o defeito"*. O raciocínio está correto e o plano o aplicou ao
aviso que estava criando. O aviso **irmão**, acima na mesma função, continua sendo exatamente a forma
que essa frase acabou de condenar por escrito — a justificativa nunca foi aplicada retroativamente.

A sonda do revisor mede o efeito literalmente: **3** negócios de **3** organizações inatingíveis
produzem **3** avisos numa **única** chamada de `getStaleDeals`. E `getStaleDeals` não é caminho de
escrita: é também o caminho de **leitura** do painel — o revisor mediu **8** invocações fora do
módulo (rota de negócios parados, relatórios, prévia e histórico de notificações, e a própria rodada
de envio), e `DealsList.jsx` faz auto-refresh a cada **300 s**. Com N negócios parados, o custo é N
avisos por **cada** uma dessas invocações.

## Por que a prioridade é média

Não muda **quem recebe**: nenhum negócio entra ou sai do envio por causa deste aviso. O que ele
degrada é o **sinal**. O cenário em que o ruído aparece é exatamente o cenário que o CR4-01 existe
para tornar audível — a borda de organizações fora do ar. Ali o alarme agregado (uma linha em nível
de erro, por rodada) fica **soterrado** pelo aviso do irmão, que é a única razão de o alarme ter sido
criado. Um operador que aprenda a rolar por cima do bloco de `[Agendor] Categoria indecidível…` rola
por cima do alarme junto.

**Este achado forma par com `wr5-03`, e fechar um sem o outro não resolve nada.** Os dois são sobre
**ruído no sinal**: este inunda o log no caminho de leitura, o outro dispara alarme sem massa.
Fechando só um, o operador continua treinado a ignorar vermelho — que é a condição em que o apagão
real volta a passar despercebido.

## Correção proposta

**Não apagar o aviso.** Ele é a **única** fonte que nomeia a **organização** afetada, e essa
informação não existe em nenhuma outra superfície. A saída é dar-lhe a mesma forma do irmão:
acumular os nomes num agregado dentro do laço e emitir **uma** linha por chamada, com o total e uma
amostra limitada dos nomes.

Vale aqui a mesma regra fixada pelo CR-02 no plano 04-09: **nomes e inteiros**, nunca o objeto de
erro do axios — o agregado carrega nome da organização (ou o identificador, quando o nome falta) e
contagem, nada mais.

**O oráculo que falta é de cardinalidade, não de conteúdo.** Hoje **nenhum** caso da suíte mede
quantas linhas de log cada um dos dois avisos emite: o aviso de funil está pinado apenas por
`r.errors.length`, que é outra superfície, e o de categoria não está pinado de forma nenhuma. Sem
essa medida, qualquer conserto aqui pode ser desfeito por refatoração sem nenhum vermelho. O par
natural é um caso com 3 negócios de 3 organizações inatingíveis exigindo **1** emissão por chamada
de `getStaleDeals`, e o simétrico com zero indecidíveis exigindo **0**.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW-r5.md`, seção Warnings,
§WR5-02.
