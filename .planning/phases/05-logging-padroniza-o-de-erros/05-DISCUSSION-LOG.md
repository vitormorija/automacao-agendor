# Phase 5: Logging & Padronização de Erros - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-05
**Phase:** 5-logging-padroniza-o-de-erros
**Areas discussed:** Alcance do LOG-01, Qual shape de erro vence, Trava da mudança de shape, Destino dos logs de erro
**Mode:** `discuss` (default, interativo) — sem `--auto`, `--all`, `--batch`; sem advisor mode (não há `USER-PROFILE.md`)

---

## Seleção de áreas

Quatro áreas cinzentas foram apresentadas. O usuário selecionou **todas as quatro**.

| Área | Selecionada |
|---|---|
| Alcance do LOG-01 | ✓ |
| Qual shape de erro vence | ✓ |
| Trava da mudança de shape | ✓ |
| Destino dos logs de erro | ✓ |

---

## Alcance do LOG-01

### Pergunta 1 — Quais sinks entram na migração `console.*` → `logger`?

| Opção | Descrição | Selected |
|--------|-------------|----------|
| Os 6 + `index.js` (Recomendado) | Os 6 residuais reais (`agendor.js:542`, `emailer.js` 222/792/857/867, `routes/track.js:31`) mais o `console.error(err)` do `index.js:107` (todo `cr-02b`, prioridade low). Fecha a categoria inteira em vez de deixar um sink órfão. Custo: 1 arquivo a mais no diff | ✓ |
| Só os 6 do LOG-01 | Exatamente a letra do requisito; `index.js:107` fica como todo para a Fase 6. Diff mínimo, mas deixa vivo um `console.error` de objeto de erro completo — o mesmo tipo de sink que a Fase 4 fechou por CR-02 | |
| Os 6 + `index.js` + `logger.js` | Inclui reescrever os 4 `console.*` do próprio `logger.js`. Não recomendado: ali são o sink final; substituí-los por `process.stdout.write` seria troca cosmética | |

**User's choice:** Os 6 + `index.js`
**Notes:** Vira D-01 e D-02 no CONTEXT. Fecha o todo `cr-02b`. O racional decisivo foi o padrão medido na Fase 4 — o conserto que fecha o achado e deixa o vizinho reabriu a fase quatro vezes.

### Pergunta 2 — O que impede o próximo `console.*` de voltar a entrar no backend?

| Opção | Descrição | Selected |
|--------|-------------|----------|
| Meta-teste com allowlist (Recomendado) | Molde de `backend/test/secrets.grep.test.js`: grep sobre `backend/src/**`, allowlist explícita de `logger.js` com justificativa escrita, falha em qualquer outro lugar. Entra na suíte, roda no CI (já status check obrigatório), e a mensagem de falha pode dizer por que a regra existe | ✓ |
| Regra do Biome como erro | `suspicious/noConsole` como `error` com override para `logger.js`. Mais barato. Risco medido: o baseline de lint é deliberadamente tolerante (44/60 warnings, `CLAUDE.md`) e promover uma regra a `error` inverte esse baseline | |
| Meta-teste + regra do Biome | Defesa em profundidade. Custo: duas fontes de verdade e duas listas de exceção para manter em sincronia — a classe de duplicação que produziu WR4-02 | |
| Nenhuma trava | Só migrar e confiar na revisão. É como está hoje, e foi assim que os 6 residuais sobreviveram a 4 fases | |

**User's choice:** Meta-teste com allowlist
**Notes:** Vira D-03. O precedente e o molde já existem no repositório.

### Pergunta 3 — Texto idêntico ou aproveitar para estruturar?

| Opção | Descrição | Selected |
|--------|-------------|----------|
| 1:1 literal, exceto o par do `wr5-04` (Recomendado) | Mesma mensagem, mesma tag, só troca o sink e escolhe o nível natural. Única exceção: `emailer.js:792` ganha a mesma forma do irmão de `:800` (`logger.warn`), porque ali a assimetria é o defeito que `wr5-04` registra | ✓ |
| 1:1 literal em todos, sem exceção | Puramente mecânica. `wr5-04` continuaria aberto e sumiria da tela justamente na fase que tocou aquela linha | |
| Estruturar campos onde faz sentido | Passar objeto com campos nas chamadas que interpolam número em string. Custo: o `logger` serializa objeto dentro da string `message`, então exigiria mudar o logger — vira mudança de contrato | |

**User's choice:** 1:1 literal, exceto o par do `wr5-04`
**Notes:** Vira D-04. Fecha `wr5-04` dentro do LOG-01.

---

## Qual shape de erro vence

**Fatos apresentados antes das perguntas:** as mesmas duas mensagens (`'Não autenticado.'`,
`'Sessão expirada.'`) saem em shapes diferentes conforme quem responde (`middleware/auth.js:20` vs
`routes/auth.js:207/214`), e `App.jsx:55` sobrevive aos dois só porque testa `!d.ok` e `undefined` é
falsy — funciona por acidente. A família `{ok:false}` na verdade são duas (`message` vs `error`). E os
handlers devolvem `err.message` cru enquanto o middleware global redige em produção.

### Pergunta 1 — Qual shape vence como padrão único?

| Opção | Descrição | Selected |
|--------|-------------|----------|
| `{ ok:false, message }` (Recomendado) | 24 dos 35 sites já usam `ok:false`, e `ok:true`/`ok:false` já é o contrato do caminho feliz — o cliente passa a ter um discriminador uniforme. `message` é o campo para humano, que os 6 consumidores de toast já leem. Custo: 11 sites mudam e `DealsList`/`ReportPanel` acompanham | ✓ |
| `{ error }` | Convenção Express, um campo só. Custo maior: 24 sites mudam e 6 pontos do frontend que testam `data.ok` quebram, incluindo o `App.jsx:55` que decide logout | |
| `{ ok:false, error, message }` | Superconjunto; nenhum consumidor quebra. Custo: padroniza a forma sem padronizar o uso — "qual dos dois eu mostro?" volta para cada consumidor novo | |

**User's choice:** `{ ok:false, message }`
**Notes:** Vira D-05.

### Pergunta 2 — O middleware global de erro entra no padrão?

| Opção | Descrição | Selected |
|--------|-------------|----------|
| Sim, emite o shape canônico (Recomendado) | É onde o padrão mais importa — responde por erros não tratados. Mantém intacta a redação em produção: muda o invólucro, não o que é revelado | ✓ |
| Não, fica como está | Contrato próprio para a camada. Diff menor. Custo: LOG-02 satisfeito na letra e falso no espírito — o cliente continua vendo dois shapes | |

**User's choice:** Sim, emite o shape canônico
**Notes:** Vira D-06.

### Pergunta 3 — A redação de `err.message` em produção entra?

| Opção | Descrição | Selected |
|--------|-------------|----------|
| Sim, redigir em produção (Recomendado) | Estende aos handlers a política que `index.js:109-114` já tem. Continuidade do CR-02: o `AxiosError` carrega o header `Authorization` com o token, e hoje `err.message` de falha de borda vai para a tela. É mudança de comportamento → exige teste do novo fluxo e plano próprio | ✓ |
| Não, só o shape | LOG-02 fica estritamente sobre a forma; o que a resposta revela vira Fase 6. Custo: a fase que "padronizou o erro" passaria ao lado do vazamento | |
| Sim, mas como plano separado e opcional | Plano e commit próprios, executado por último, cortável se a fase esticar | |

**User's choice:** Sim, redigir em produção
**Notes:** Vira D-07. Registrado no CONTEXT que, por ser mudança de comportamento, sai em plano próprio, commit próprio, executado por último — o que preserva também a propriedade de "cortável" da terceira opção.

---

## Trava da mudança de shape

**Fatos apresentados antes das perguntas:** `NotificationHistory.jsx:350` e `Dashboard.jsx:495` leem
`log.error`, que é a **coluna do `notification_log`**, não o shape — armadilha de grep, fronteira
fixada antes de perguntar. Os únicos consumidores de shape que quebram são `DealsList.jsx:80` e
`ReportPanel.jsx:68`, e quebram **em silêncio** (param de lançar, seguem com `undefined`, `vite build`
passa verde). O projeto já tem a convenção de seam nomeado no router; o `index.js` não exporta nada e
chama `app.listen()` no load.

### Pergunta 1 — O que prova que os 35 sites adotaram o shape e que nenhum regride?

| Opção | Descrição | Selected |
|--------|-------------|----------|
| Meta-teste grep + seams nos críticos (Recomendado) | Perna 1: grep sobre `routes/**` e `middleware/auth.js` afirmando `ok:false` em toda resposta de erro. Perna 2: teste de runtime pelos seams nas rotas cujo consumidor quebra em silêncio. Grep prova alcance, seam prova comportamento | ✓ |
| Só teste de runtime por seam | Prova mais forte por site, mas exige ~15 seams novos — refatoração estrutural em arquivos que a fase não precisaria tocar; o todo `in-02` já registra dívida na convenção de seam | |
| Só meta-teste grep | Barato e cobre 100% dos sites. Custo: prova texto, não comportamento — não pega rota que monte o objeto numa variável, nem o middleware global | |

**User's choice:** Meta-teste grep + seams nos críticos
**Notes:** Vira D-08. Mesmo raciocínio que fez `secrets.grep.test.js` existir: uma ferramenta verde não era prova.

### Pergunta 2 — O frontend migra junto ou depois?

| Opção | Descrição | Selected |
|--------|-------------|----------|
| Junto, no mesmo plano e commit (Recomendado) | Backend e os 2 sites do frontend mudam juntos, com inventário de irmãos escrito listando todos os sites de leitura. Rollback é um commit único; a árvore nunca fica num estado em que a UI lê campo que o backend parou de mandar | ✓ |
| Backend primeiro, aditivo; frontend depois | Zero janela de quebra. Custo medido contra a história do projeto: a fase entregaria dois shapes e a remoção viraria mais um item numa pilha de 41 — LOG-02 verde sem estar cumprido | |
| Só backend; frontend fica como está | Rejeitada na própria apresentação — regressão de UI silenciosa introduzida de propósito | |

**User's choice:** Junto, no mesmo plano e commit
**Notes:** Vira D-09. A armadilha de grep do `log.error` virou D-10, registrada como obrigação explícita do planner.

### Pergunta 3 — O middleware global precisa virar testável?

| Opção | Descrição | Selected |
|--------|-------------|----------|
| Extrair o middleware para módulo próprio (Recomendado) | Mover para `backend/src/middleware/error.js`; o `index.js` apenas registra, como já faz com `middleware/auth.js`. Testável por chamada direta, sem tocar em `app.listen`, no shutdown ou na ordem de boot, e sem dependência nova | ✓ |
| Separar `app` de `server` no `index.js` | Padrão Express comum e habilita E2E de qualquer rota. Mexe no caminho de boot que a Fase 3 endureceu e no shutdown do PM2 — cheira a Fase 7 | |
| Não testar o middleware global | Diff mínimo. Custo: as duas mudanças mais sensíveis da fase ficam sem oráculo, e a redação é mudança de comportamento | |

**User's choice:** Extrair o middleware para módulo próprio
**Notes:** Vira D-11. É o que torna D-06 e D-07 cobertos por oráculo.

---

## Destino dos logs de erro

**Fatos apresentados antes das perguntas:** em produção o mesmo processo escreve em **quatro**
arquivos, todos em `/opt/agendor/logs/` (porque `__dirname/../../logs` resolve para lá sob o `cwd` do
PM2): `access.log` (morgan, texto), `error.log` (middleware global, texto + stack), `pm2-out.log` e
`pm2-error.log` (logger, JSON). Um erro **não tratado** aparece em `error.log` como texto; o erro
**tratado** da mesma rota aparece em `pm2-error.log` como JSON. Nada no código diz qual olhar.

### Pergunta 1 — O que acontece com a escrita direta em `logs/error.log`?

| Opção | Descrição | Selected |
|--------|-------------|----------|
| Aposentar; só o logger (Recomendado) | O middleware global registra por `logger.error(...)` e o `errorLogStream` sai. Um formato, um lugar: `pm2-error.log`, que já recebe todo `logger.error`. Nada se perde — o logger expande `Error` para `.stack`. Efeito colateral: mata o crescimento ilimitado de um arquivo sem rotação. Custo: quem faz `tail logs/error.log` precisa saber → runbook da Fase 8 | ✓ |
| Manter os dois, com papéis escritos | Zero risco operacional. Custo: o mesmo evento segue em dois formatos e dois arquivos — a inconsistência que a fase existe para fechar, agora documentada em vez de resolvida | |
| Manter os dois, formato único | Um formato, dois destinos. Custo: toda linha de erro gravada duas vezes, e o logger passaria a precisar de um segundo sink — muda o contrato do logger | |

**User's choice:** Aposentar; só o logger
**Notes:** Vira D-12. Consequências registradas no CONTEXT: item obrigatório do runbook da Fase 8, e `CLAUDE.md` + `.planning/codebase/{CONVENTIONS,ARCHITECTURE,INTEGRATIONS}.md` ficam desatualizados — atualizá-los entra no escopo.

### Pergunta 2 — `morgan` e `access.log` entram nesta fase?

| Opção | Descrição | Selected |
|--------|-------------|----------|
| Não, ficam fora (Recomendado) | Log de acesso HTTP não é log de aplicação; `combined` é padrão de indústria e LOG-01 nomeia módulos de aplicação. A fronteira fica escrita para o planner não inventar escopo | ✓ |
| Sim, unificar também | Consistência total de formato. Custo: perde o `combined`, aumenta o volume no stdout do PM2, e amplia a fase para área que nenhum requisito nem todo pendente pede | |

**User's choice:** Não, ficam fora
**Notes:** Vira D-13.

---

## Cruzamento de todos pendentes

O matcher do SDK (`gsd-sdk query todo.match-phase 5`) devolveu ruído — score 0.6 uniforme para tudo
que contém a palavra "todo" ou "phase", sem `title` nem `area` reais. O cruzamento foi refeito à mão
sobre os 41 pendentes.

Dois todos ficaram **automaticamente dobrados** pelas decisões anteriores, sem pergunta: `cr-02b`
(pela escolha de sinks, D-01) e `wr5-04` (pela exceção de forma, D-04).

### Pergunta — Quais destes entram no escopo da Fase 5? (multiSelect)

| Opção | Descrição | Selected |
|--------|-------------|----------|
| `in2-03` — id interpolado (Recomendado) | `getDealById` interpola o valor recusado na mensagem, e esse valor é escolhível por quem envia `POST /api/notifications/test-card` (coluna sem `STRICT`), incluindo `\n`, aspas e chaves. Injeção em linha de log. D-07 fecha o lado do cliente; o lado do log só fecha aqui | ✓ |
| `wr5-02` — N avisos por leitura | `logger.warn` por negócio dentro de `getStaleDeals`, que é caminho de leitura do painel (8 invocações fora do módulo; auto-refresh de 300s). O irmão logo abaixo já é agregado e seu comentário condena por escrito a forma que o de cima usa. Custo: agregar muda volume e forma → exige teste do novo comportamento | ✓ |
| `in5-01` — campo de erro ambíguo | `results.error` significa "a rodada morreu" e "concluiu com alarme" com a mesma forma; nenhum consumidor programático separa. É LOG-02 aplicado ao contrato do scheduler. Custo: mexe em contrato que a Fase 4 estabilizou em três planos | ✓ |
| `wr5-03` — alarme mente com N=1 | O alarme dispara com 100% dos parados sem funil; com N=1 isso é rotina e a mensagem é factualmente falsa. Custo: exige decidir um piso mínimo, e os cenários I/J do oráculo usam N=2 → não discriminam | ✓ |

**User's choice:** os quatro
**Notes:** Total de 6 todos dobrados (os 4 escolhidos + `cr-02b` e `wr5-04` já dobrados por decisão). Dobrar é escopo, não fechamento — cada arquivo só se move para `completed/` quando o plano que o fecha terminar.

---

## Fechamento

**Pergunta:** Alguma área cinzenta ainda em aberto antes de fechar o contexto?
**User's choice:** Pronto para o contexto.

## Claude's Discretion

Nenhuma. As 11 decisões foram escolhidas explicitamente pelo usuário — em todas ele selecionou uma
opção apresentada, e não houve pergunta respondida com "você decide" nem com texto livre.

## Deferred Ideas

- Rotação/retenção de `logs/access.log` — Fase 8 ou `pm2-logrotate`.
- Separar `app` de `server` no `index.js` para E2E de rota — Fase 7.
- Campos estruturados de verdade no `logger` (objeto no JSON em vez de `JSON.stringify` dentro de `message`).
- Dívida de ferramental sem dono: `npm run format` na raiz, e a dívida de `lineWidth` nos seis arquivos
  de teste que o `biome format` do backend reformata sozinho.
- Todos revisados e não dobrados: lista completa com motivo em `05-CONTEXT.md` §`<deferred>`.
