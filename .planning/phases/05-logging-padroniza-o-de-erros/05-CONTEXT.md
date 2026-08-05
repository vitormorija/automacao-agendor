# Phase 5: Logging & Padronização de Erros - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase define **o que o backend escreve quando algo acontece** (log) e **o que ele devolve quando
algo falha** (resposta de erro). Entrega **LOG-01** e **LOG-02**.

**Não muda quem é notificado.** Nenhuma decisão abaixo toca a cadeia de elegibilidade
(`getStaleDeals`, `shouldNotifyOwner`, `alreadyNotifiedToday`, `categoriaIndecidivel`). O Core Value do
milestone — "nunca mais uma regressão silenciosa nas regras de quem é notificado" — não é o objeto
desta fase, e qualquer plano que se aproxime dele está fora do escopo.

**Estado de partida medido no scouting (2026-08-05).** O texto do requisito LOG-01 diverge do código
em dois pontos; as decisões abaixo partem do estado real, não do texto:

| Fato | Medição |
|---|---|
| `console.*` residual | **6 chamadas / 3 arquivos**: `agendor.js:542`, `emailer.js` 222·792·857·867, `routes/track.js:31` |
| `routes/deals.js` | **já migrado** — 0 `console.*`, 2 `logger.*`. LOG-01 o nomeia por desatualização do requisito |
| `logger.js` | 4 `console.*` — é o *sink* final, permanecem |
| `index.js:107` | 1 `console.error(err)` guardado por `NODE_ENV !== 'production'` — hoje é o todo `cr-02b` |
| Frontend | **0** `console.*` — nada a fazer |
| Shape `{ error }` | **11 sites**: `routes/deals.js`, `routes/reports.js`, GETs de `routes/notifications.js`, `middleware/auth.js`, middleware global |
| Shape `{ ok:false, ... }` | **24 sites**: `routes/auth.js`, `routes/config.js`, POSTs de `routes/notifications.js`. `notifications.js` usa **os dois** |
| Contradição direta | `'Não autenticado.'` e `'Sessão expirada.'` saem como `{error}` em `middleware/auth.js:20` e como `{ok:false,message}` em `routes/auth.js:207/214` — mesma mensagem, dois contratos |
| Vazamento | handlers de rota devolvem `err.message` **cru**; `index.js:111-114` **redige** em produção — políticas opostas no mesmo processo |
| Consumidores no frontend | `DealsList.jsx:80` e `ReportPanel.jsx:68` leem `d.error`; `LoginPage`, `ConfigPanel`, `ChangePasswordModal` e `App.jsx:55` leem `data.ok` / `data.message` |
| Teste que fixe algum shape | **nenhum**. Frontend não tem testes — o gate é só `vite build`, que não detecta leitura de campo que sumiu |
| Destinos de log em produção | **4**, todos em `/opt/agendor/logs/`: `access.log` (morgan, texto), `error.log` (middleware global, texto + stack), `pm2-out.log` e `pm2-error.log` (logger, JSON) |
| Biome | **sem** regra contra `console.*` — `recommended: true` não inclui `noConsole` |
| Boot | `index.js` não tem `module.exports` e chama `app.listen()` no load — o middleware global é hoje **intestável** |

**Fora do escopo (fronteiras explícitas):**
- `morgan` / `access.log` — log de acesso HTTP, não de aplicação; formato `combined` fica como está (D-13).
- Rotação/retenção de `logs/*` — runbook, Fase 8.
- Separar `app` de `server` no `index.js` — refatoração de arquitetura, Fase 7.
- Riscos do CONCERNS.md (`ADMIN_USERS` fail-open, JWT em `localStorage`, CSP) — Fase 6.
- `getEnrichedStaleDeals` / duplicação da lógica de enriquecimento — Fase 7.
- Mudar o contrato do `logger.js` (campos estruturados de verdade em vez de `JSON.stringify` dentro de `message`) — sem requisito que peça.

</domain>

<decisions>
## Implementation Decisions

### Alcance da migração `console.*` (LOG-01)

- **D-01:** Migram os **6 residuais reais + o `console.error(err)` do `index.js:107`** — 7 sinks em 4
  arquivos (`agendor.js`, `emailer.js`, `routes/track.js`, `index.js`). Fecha a **categoria inteira**
  em vez de deixar um sink órfão para a próxima auditoria reencontrar: o padrão que reabriu a Fase 4
  quatro vezes foi sempre "o conserto fecha o achado e deixa o vizinho". **Fecha o todo `cr-02b`.**

- **D-02:** Os 4 `console.*` de `logger.js` **permanecem** — ali eles são o sink final, e o logger
  precisa de algo que escreva em stdout/stderr. Trocá-los por `process.stdout.write` seria mudança
  cosmética sem ganho. Qualquer trava anti-regressão precisa de **exceção explícita e justificada**
  para esse arquivo.

- **D-03:** A trava anti-regressão é um **meta-teste no molde de `backend/test/secrets.grep.test.js`**:
  grep sobre `backend/src/**`, allowlist explícita de `logger.js` com a justificativa escrita no próprio
  arquivo de teste, falha se `console.*` aparecer em qualquer outro lugar.
  **Por que não a regra do Biome:** (a) o meta-teste entra na suíte e roda no CI, que já é status check
  obrigatório para mesclar na `main`; (b) o baseline de lint do projeto é **deliberadamente tolerante**
  (44 warnings backend / 60 frontend, registrado no `CLAUDE.md`, com regras rebaixadas a `warn` de
  propósito) — promover uma regra a `error` inverteria esse baseline; (c) a mensagem de falha de um
  teste pode dizer **por que** a regra existe, o que uma regra de lint não faz.
  **Rejeitado meta-teste + Biome juntos:** duas fontes de verdade para a mesma regra e duas listas de
  exceção para manter em sincronia — exatamente a classe de duplicação que produziu WR4-02 na Fase 4
  (dois comentários que passaram a se contradizer).

- **D-04:** Migração **1:1 literal** — mesma mensagem, mesma tag `[Módulo]`, só troca o sink e escolhe
  o nível natural (`info` / `warn` / `error`). Isso torna o diff auditavelmente inerte e revisável
  linha a linha.
  **Única exceção:** `emailer.js:792` adota a **mesma forma do irmão de `emailer.js:800`**
  (`logger.warn`). Ali a assimetria **é** o defeito registrado em `wr5-04`: os dois contadores de
  supressão do resumo semanal individual são irmãos, um sai por `console.log` e o outro por
  `logger.warn`, então o de funil nunca entra no log estruturado de produção. **Isso fecha `wr5-04`
  dentro do LOG-01.**
  **Rejeitado estruturar campos** (`{ modulo, contagem, motivo }`): o `logger` atual serializa objeto
  com `JSON.stringify` **dentro** da string `message`, então extrair campos de verdade exigiria mudar
  o logger — vira mudança de contrato de log, não migração.

### Shape único de resposta de erro (LOG-02)

- **D-05:** O shape canônico é **`{ ok: false, message }`**.
  **Racional:** 24 dos 35 sites já usam `ok:false`; `ok:true`/`ok:false` **já é o contrato do caminho
  feliz** em `config`, `auth` e `notifications`, então o cliente passa a ter **um** discriminador
  uniforme para sucesso e falha em toda a API, em vez de inferir pelo status HTTP ou pela presença de
  um campo; e `message` é o campo destinado a humano, que é o que os 6 consumidores de toast do
  frontend já leem.
  **Rejeitado `{ error }`:** 24 sites mudariam e 6 pontos do frontend que testam `data.ok` quebrariam —
  incluindo `App.jsx:55`, que decide **logout** por esse campo.
  **Rejeitado `{ ok:false, error, message }`:** padroniza a **forma** sem padronizar o **uso**; a
  pergunta "qual dos dois eu mostro?" voltaria para cada consumidor novo, que é o que LOG-02 existe
  para eliminar.

- **D-06:** O **middleware global de erro entra no padrão** — passa a emitir `{ ok:false, message }`.
  É justamente onde o padrão mais importa: ele responde por erros **não tratados**, quando o cliente
  tem menos informação. Se emitisse shape diferente do resto, o frontend precisaria de dois caminhos
  de leitura para sempre.
  A **política de redação em produção** de `index.js:111-114` fica **intacta**: muda o invólucro, não
  o que é revelado.

- **D-07:** A **redação em produção é estendida aos handlers de rota**. Hoje eles devolvem
  `err.message` cru enquanto o middleware global redige — duas políticas opostas no mesmo processo.
  É continuidade direta do **CR-02 da Fase 4**: o `AxiosError` carrega `config.headers.Authorization`
  com o token de serviço da Agendor, e hoje o `err.message` de uma falha de borda vai para a **tela**.
  **É mudança de comportamento observável** → **plano próprio, commit próprio, rollback próprio**,
  executado **por último** na fase, de modo que possa ser cortado sem afetar LOG-01/LOG-02 se a fase
  esticar. Exige teste do novo fluxo nos dois valores de `NODE_ENV`.

### Como a mudança de shape é provada e protegida

- **D-08:** Prova em **duas pernas**, mesmo raciocínio que fez `secrets.grep.test.js` existir (o
  gitleaks verde **não** era prova):
  - **Perna 1 — alcance:** meta-teste grep sobre `backend/src/routes/**` e `backend/src/middleware/auth.js`
    afirmando que toda resposta de erro carrega `ok: false`. Cobre os 35 sites de uma vez e trava a
    regressão futura.
  - **Perna 2 — comportamento:** teste de runtime pelos **seams** nas rotas cujo consumidor quebra em
    silêncio — `staleHandler` (já exportado em `routes/deals.js:61`) e um seam novo em
    `routes/reports.js` — asserindo o objeto de fato entregue ao `res`.
  Grep prova **alcance**; seam prova **comportamento**. Nenhuma das duas sozinha basta.
  **Rejeitado "só seams":** exigiria ~15 seams novos em `auth`/`config`/`notifications`/`reports` —
  refatoração estrutural em arquivos que a fase não precisaria tocar, e o todo `in-02` já registra que
  a convenção de seam tem dívida própria.
  **Rejeitado "só grep":** prova texto, não comportamento — não pega uma rota que monte o objeto numa
  variável antes de responder, nem o middleware global, e não exercita nenhum caminho de erro real.

- **D-09:** **Backend e frontend migram no mesmo plano e no mesmo commit.** Os 2 sites que quebram
  (`DealsList.jsx:80`, `ReportPanel.jsx:68` — `if (d.error) throw new Error(d.error)`) mudam junto,
  com **inventário de irmãos escrito** listando **todos** os sites de leitura do frontend, cada um
  marcado como *migrado* / *verificada-e-sã* / *fora-de-escopo-com-medição*. Rollback é um commit
  único, e a árvore nunca fica num estado em que a UI lê um campo que o backend parou de mandar.
  **A quebra é silenciosa:** esses dois sites param de lançar, o componente segue com dados
  `undefined`, e `vite build` passa verde — por isso a trava não pode ser o build.
  **Rejeitado "aditivo em duas etapas":** o backend emitiria os dois campos por uma fase e a remoção do
  antigo viraria todo. Entregaria **dois shapes** em vez de padrão único, e a remoção seria mais um
  item numa pilha que já tem 41 — LOG-02 ficaria verde sem estar cumprido.

- **D-10 — ARMADILHA DE GREP, obrigatória para o planner:** `NotificationHistory.jsx:350` e
  `Dashboard.jsx:495` leem `log.error`. Isso é a **coluna `error` do `notification_log`**, não o shape
  de resposta HTTP. **Não entram na migração.** Um grep ingênuo por `.error` no frontend acusa 6
  sites; **só 2 são de shape**. Confundi-los apagaria a exibição do motivo da falha no histórico —
  que é dado de produção, não contrato de transporte.

- **D-11:** O middleware global de erro é **extraído para `backend/src/middleware/error.js`**, e o
  `index.js` passa a apenas registrá-lo — mesma relação que já tem com `middleware/auth.js`. Fica
  testável por chamada direta `(err, req, res, next)`, **sem** tocar em `app.listen`, no shutdown
  gracioso ou na ordem de boot que a Fase 3 endureceu (`dotenv` → `require('./config')` → fail-fast),
  e **sem dependência nova**. É o que torna D-06 e D-07 cobertos por oráculo — as duas mudanças mais
  sensíveis da fase (o que o cliente vê quando algo **não** tratado explode, em produção).
  **Rejeitado separar `app` de `server`:** mexe no caminho de boot e no shutdown do PM2 — é Fase 7.

### Destino dos logs

- **D-12:** `logs/error.log` é **aposentado**. O middleware global passa a registrar por
  `logger.error(...)` e o `errorLogStream` sai. Um único formato (JSON em produção) e um único lugar
  para procurar erro: `pm2-error.log`, que **já** recebe todo `logger.error` do sistema.
  **Nada de informação se perde:** o `logger` expande `Error` para `.stack`, e método/rota entram como
  contexto. Efeito colateral bom: mata o crescimento ilimitado de um arquivo que ninguém rotaciona.
  **Consequência operacional a registrar:** quem tiver o hábito de `tail logs/error.log` no servidor
  precisa saber — vira **item obrigatório do runbook da Fase 8**. O `accessLogStream` continua
  (morgan não é tocado). `CLAUDE.md` e
  `.planning/codebase/{CONVENTIONS,ARCHITECTURE,INTEGRATIONS}.md` descrevem `error.log` e ficarão
  desatualizados — **atualizá-los faz parte do escopo desta fase.**

- **D-13:** `morgan` e `access.log` **ficam fora**. Log de acesso HTTP não é log de aplicação; o
  formato `combined` é padrão de indústria e consumível por ferramenta pronta, e LOG-01 nomeia módulos
  de aplicação, não o pipeline de acesso. Trocá-lo por JSON via `logger` seria mudança de formato de
  dado operacional sem nenhum requisito pedindo.

### Claude's Discretion

Nenhuma. As quatro áreas cinzentas foram apresentadas e **todas as 11 decisões foram escolhidas
explicitamente pelo usuário** — não há espaço deixado à discrição do agente nesta fase.

### Folded Todos

Dobrados de `.planning/todos/pending/` para o escopo da Fase 5. **Dobrar é escopo, não fechamento:**
o arquivo só se move para `.planning/todos/completed/` com o desfecho anotado quando o plano que o
fecha terminar, no precedente do `in2-02` no plano 04-26.

| Todo | Prioridade | Como se encaixa |
|---|---|---|
| `cr-02b-console-error-objeto-completo-em-index` | baixa | **Fechado por D-01** — o sink do `index.js:107` entra na migração |
| `wr5-04-supressao-por-funil-fora-do-log-estruturado` | média | **Fechado por D-04** — `emailer.js:792` adota a forma do irmão de `:800` |
| `in2-03-mensagem-de-erro-interpola-id` | média | `getDealById` interpola o valor recusado na mensagem de erro; o valor é **escolhível por quem envia** `POST /api/notifications/test-card` (a coluna `notification_log.deal_id` aceita texto — tabela sem `STRICT`), incluindo `\n`, aspas e chaves. É injeção em linha de log. **D-07 fecha o lado do cliente; o lado do LOG só fecha aqui.** |
| `wr5-02-aviso-de-categoria-por-negocio-no-caminho-de-leitura` | média | `logger.warn` **por negócio** dentro de `getStaleDeals`, que é caminho de **leitura** do painel (8 invocações fora do módulo; `DealsList` faz auto-refresh a cada 300s). O irmão logo abaixo já é agregado, e o comentário dele **condena por escrito** a forma que o de cima usa — mesma cláusula de **retroatividade da justificativa** (r5) que produziu `wr5-04`. Agregar muda volume e forma → **exige teste do novo comportamento** |
| `in5-01-results-error-com-dois-significados` | média | `results.error` do `runCheck` significa "a rodada MORREU" (catch externo) **e** "a rodada CONCLUIU com alarme" (04-28/04-37) com a **mesma forma**; nenhum consumidor programático separa. É LOG-02 — *um campo, um significado* — aplicado ao contrato do scheduler em vez da resposta HTTP. Mexe em contrato que a Fase 4 estabilizou em três planos e que o `Dashboard` consome → **plano próprio** |
| `wr5-03-limiar-do-alarme-de-forma-do-funil-com-n-pequeno` | média | O alarme dispara quando 100% dos negócios parados vieram sem funil; com N=1 isso é **rotina**, e a mensagem afirma que "a forma do payload da Agendor pode ter mudado" — **factualmente falso** nesse caso. Alarme diário que mente é alarme que se aprende a ignorar. Exige decidir um **piso mínimo**, e os cenários I/J do oráculo usam N=2 → **não discriminam** implementação com e sem piso; **o oráculo precisa mudar junto** |

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisito e critérios de aceite
- `.planning/ROADMAP.md` §"Phase 5: Logging & Padronização de Erros" — os 3 Success Criteria
- `.planning/REQUIREMENTS.md` §"Logging & Erros" — LOG-01, LOG-02

### Herança da Fase 4 — não reabrir, não contradizer
- `.planning/phases/04-confiabilidade-das-integra-es/04-VERIFICATION.md` — 8/8 Success Criteria e 6/6 requisitos verificados contra o código; §"Anti-Patterns Scan" declara os `console.*` de `emailer.js` **explicitamente diferidos para a Fase 5**
- `.planning/phases/04-confiabilidade-das-integra-es/04-CONTEXT.md` §"Fora do escopo" — "Migrar `console.*` residual para o `logger` — Fase 5"
- `.planning/phases/04-confiabilidade-das-integra-es/04-DELIVERY-CONTRACT.md` — o nível de profundidade de plano esperado neste projeto (baseline medida separando fato/inferência/decisão, rastreabilidade requisito→plano→teste→evidência, DoD objetivo por plano, rollback por commit)
- `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW-r5.md` §WR5-02, §WR5-03, §WR5-04, §IN5-01 — texto original dos quatro achados dobrados
- `.planning/STATE.md` §"EVOLUÇÃO DO PROCESSO" — o **inventário de irmãos** com as duas cláusulas da r5 (**(a) direção reversa**: listar de que comportamento alheio o conserto novo depende, o que pode neutralizá-lo; **(b) retroatividade da justificativa**: toda justificativa escrita num comentário novo vira grep obrigatório no mesmo arquivo por construções que ela condena) é **mandato herdado** e vale nesta fase

### Todos dobrados (texto integral de cada achado)
- `.planning/todos/pending/cr-02b-console-error-objeto-completo-em-index.md`
- `.planning/todos/pending/wr5-04-supressao-por-funil-fora-do-log-estruturado.md`
- `.planning/todos/pending/in2-03-mensagem-de-erro-interpola-id.md`
- `.planning/todos/pending/wr5-02-aviso-de-categoria-por-negocio-no-caminho-de-leitura.md`
- `.planning/todos/pending/in5-01-results-error-com-dois-significados.md`
- `.planning/todos/pending/wr5-03-limiar-do-alarme-de-forma-do-funil-com-n-pequeno.md`

### Convenções do projeto
- `CLAUDE.md` §Logging, §Error Handling, §Comments — tag `[Módulo]` em português, `logger` sobre `console.*` em código novo, comentário explica o *porquê* e não o *quê*
- `.planning/codebase/CONVENTIONS.md` — §Error Handling e §Logging; **descrevem `logs/error.log` e ficam desatualizados por D-12**
- `.planning/codebase/ARCHITECTURE.md` §Error Handling / §Logging — descreve as duas famílias de shape como coexistentes; **fica desatualizado por D-05**
- `.planning/codebase/INTEGRATIONS.md` §logs — **fica desatualizado por D-12**

### Moldes a copiar
- `backend/test/secrets.grep.test.js` — molde do meta-teste de **D-03** e da **perna 1 de D-08**: escopo por pathspec, allowlist justificada por escrito, e o cabeçalho que declara o que o teste **não** prova
- `backend/test/deals.errorLog.test.js` — molde do teste por **seam** com `res` falso (**perna 2 de D-08**); e o comentário de `backend/src/routes/deals.js:32-43` é o precedente escrito de por que só `err.message` vai ao log, nunca o objeto de erro

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`backend/src/logger.js`** — alvo da migração. Níveis `error`/`warn`/`info`/`debug`, JSON por linha
  em produção e texto legível em dev, respeita `LOG_LEVEL`, e **expande `Error` para `.stack`
  automaticamente** dentro de `emit()`. **Não muda nesta fase** — mudá-lo é exatamente o que D-04
  rejeitou.
- **Seam nomeado no router** — `module.exports.staleHandler` (`routes/deals.js:61`),
  `module.exports.resolvedHandler` e `module.exports.testCardHandler` (`routes/notifications.js:286-287`),
  `module.exports.ALLOWED_KEYS` (`routes/config.js:101`). Convenção já estabelecida para testar rota
  **sem subir servidor**: o handler é chamado direto com um `res` falso mínimo.
- **`require('./logger')`** já presente em `emailer.js:4` e `agendor.js:4`. **`routes/track.js` ainda
  não importa** — precisa do `require`.
- **`backend/test/helpers/`** e `backend/test/setup.js` — infraestrutura de teste existente
  (`tmpDb`, `fakeAxios`, `fakeTimers`).

### Established Patterns
- **Meta-teste como gate independente** — `secrets.grep.test.js` existe porque uma ferramenta verde
  não era prova. Mesmo padrão em D-03 e na perna 1 de D-08.
- **Comentário explica a ameaça, não o mecanismo** — `routes/deals.js:32-43` e `backend/src/secret.js`
  são o molde: o que o código impede, medido, com o oráculo nomeado.
- **Critério escrito como comportamento garantido, nunca como identificador** — decisão C9 da Fase 4;
  um critério que nomeia mecanismo faz o verificador procurar por um símbolo que o refactor seguinte
  apaga.

### Integration Points
- `index.js` ↔ **`middleware/error.js`** (novo, D-11) — o `index.js` passa a apenas registrar, como já
  faz com `middleware/auth.js`.
- `index.js` perde o `errorLogStream` (D-12) e **mantém** o `accessLogStream` (D-13).
- Backend `routes/**` ↔ frontend `DealsList.jsx` / `ReportPanel.jsx` — o contrato que D-09 move num
  commit só.

### Constraints
- **`index.js` chama `app.listen()` no load e não exporta nada** → é por isso que D-11 existe.
- **Sem `supertest`** nem qualquer dependência de teste HTTP, e a stack não muda nesta fase (constraint
  do PROJECT.md). Testes de rota vão por **seam**.
- **`backend/.c8rc.json` tem gate de cobertura ativo** (`check-coverage: true`, `per-file: false`;
  pisos lines/statements/functions 20, branches 60) — o arquivo novo `middleware/error.js` precisa
  nascer coberto.
- **Cada arquivo de teste roda em processo próprio** — é a unidade de isolamento para variação de
  `NODE_ENV`, que D-07 e D-12 exigem exercitar nos **dois** valores.
- **`npm run format` não existe na raiz** (só em `backend/` e `frontend/`), e o `biome format` do
  backend reformata **seis arquivos de teste preexistentes** alheios a qualquer plano (dívida de
  `lineWidth` 80). Todo executor da Fase 4 precisou reverter à mão. Dívida de ferramental conhecida,
  ainda sem dono.

</code_context>

<specifics>
## Specific Ideas

- **Baseline inicial da fase, a preservar e medir contra:** `npm test` **196/196**, cobertura exit 0,
  lint exit 0 (44 warnings backend / 60 frontend — baseline documentado), `vite build` exit 0.
- **`SEC-01` permanece ABERTO** como risco conscientemente aceito (decisão C8). Não declarar resolvido
  em lugar nenhum, e nunca exibir o valor do `AGENDOR_TOKEN` em nenhum artefato. Relevante aqui porque
  D-07 toca justamente o caminho por onde o token poderia vazar (`err.message` de `AxiosError`).
- **`rel-02b` (deadline global de SMTP)** segue como pendência **pré-go-live**, prioridade alta, e
  **não** é logging — não entra nesta fase e não deve ser fechado por ela.
- **`wr5-05`** (asserções de envio afrouxadas de `=== 1` para `>= 1`, perdendo a detecção de e-mail
  duplicado) tem prioridade **alta** e é o único ponto fino declarado pela verificação da Fase 4 — mas
  é rede de testes do Core Value, não logging. Fica fora, com o registro de que continua aberto.
- **Estrutura sugerida de planos** (derivada de D-04/D-07/D-09/D-11 e da regra de nunca misturar
  mudança de comportamento com padronização): cinco unidades revertíveis independentes —
  (1) migração `console.*` 1:1 + meta-teste da trava;
  (2) extração do `middleware/error.js` + aposentadoria do `error.log`;
  (3) shape canônico backend + frontend no mesmo commit + as duas pernas de prova;
  (4) redação de `err.message` em produção, **por último e cortável**;
  (5) os quatro todos de conteúdo de log — `in2-03`, `wr5-02`, `wr5-03`, `in5-01` —, sendo `in5-01` e
  `wr5-03` com plano próprio por mexerem em contrato/oráculo que a Fase 4 acabou de estabilizar.

</specifics>

<deferred>
## Deferred Ideas

- **Rotação/retenção de `logs/access.log`** — `error.log` desaparece por D-12, mas `access.log`
  continua crescendo sem rotação. Fase 8 (runbook) ou `pm2-logrotate`.
- **Separar `app` de `server` no `index.js`** para habilitar teste end-to-end de qualquer rota —
  Fase 7 (mexe no caminho de boot que a Fase 3 endureceu e no shutdown gracioso do PM2).
- **Campos estruturados de verdade no `logger`** — objeto no JSON em vez de `JSON.stringify` dentro da
  string `message`. Mudança de contrato de log; nenhum requisito pede.
- **Dívida de ferramental sem dono:** `npm run format` na raiz do repo, e a dívida de `lineWidth` nos
  seis arquivos de teste que o `biome format` do backend reformata sozinho.

### Reviewed Todos (not folded)
Considerados no cruzamento e **deixados fora**, com o motivo:

- `in-01-status-pending-na-ui` — o status `'pending'` renderiza como falha (✗ vermelho) no histórico.
  UX de frontend, não logging.
- `ui-01-toast-de-erro-no-check` — frontend.
- `in-02-seams-fora-do-module-exports` — refatoração da convenção de seam; Fase 7. (Relevante como
  **contexto** para D-08, que deliberadamente evita criar 15 seams novos.)
- `in-03-comentario-emailer-timeout`, `in-04-escape-html-no-test-card`,
  `in3-06-referencia-por-linha-em-mensagem-de-assercao`,
  `wr4-03b-referencias-por-linha-nos-demais-arquivos-de-teste` — higiene de instrumento de teste
  (comentários e âncoras), sem casa temática nesta fase.
- `rel-02b-deadline-global-smtp` — prioridade **alta** e **pré-go-live**, mas é confiabilidade de
  integração, não logging.
- `sec-01-rotate-agendor-token`, `sec-02-dependency-vulnerabilities` — Fase 6. `sec-01` permanece
  aberto por decisão C8.
- `wr5-05-assercoes-de-envio-afrouxadas-perdem-duplicata` — prioridade **alta**, Core Value; é rede de
  testes de envio, não logging.
- Os demais (`in3-0*`, `in4-0*`, `in5-02`, `in5-03`, `in5-04`, `wr3-07b`, `wr4-04b`, `wr4-07b`,
  `ops-01`, `rel-05b`, `cr4-01b`, `cr4-01c`, `in3-08b`, `in2-01`, `in2-04`, `in3-01`) — nenhum é sobre
  o que o backend escreve ou devolve; permanecem pendentes com seus donos e prioridades.

</deferred>

---

*Phase: 5-Logging & Padronização de Erros*
*Context gathered: 2026-08-05*
