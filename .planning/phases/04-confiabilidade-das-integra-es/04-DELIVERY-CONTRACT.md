# Fase 4 — Confiabilidade das Integrações — Contrato Técnico de Entrega (v2 FINAL)

Versão final incorporando as decisões humanas Q1-Q5 + npm audit (2026-08-04). **A fase passou de 5 para 7 planos.** Duas decisões (Q1, Q2) introduzem mudanças de comportamento deliberadas — permitidas pela constraint do milestone porque entram **com teste do novo fluxo**. Elas **supersedem** dois pontos do 04-CONTEXT.md por decisão humana explícita: a cláusula "nenhuma mudança de comportamento aqui" de D-03 (apenas no que toca o registro de status no banco) e a aceitação implícita do resultado parcial de `getDealsWithFutureTasks`. Todo o restante de D-01..D-06 permanece vinculante.

## Renumeração (ordem numérica = ordem de execução)

| Novo nº | Plano | Origem |
|---|---|---|
| 04-01 | Caracterização da resiliência do scheduler | inalterado |
| 04-02 | **Fail-safe na consulta de tarefas futuras** | **NOVO — Decisão Q2** |
| 04-03 | Timeout HTTP Agendor + `getDealById` + bump axios | ex-04-02 + Decisão Q3 |
| 04-04 | Timeouts SMTP | ex-04-03 (sem o cenário de caracterização do DESC-1, substituído pelo novo fluxo do 04-06) |
| 04-05 | Atualização nodemailer 6→9 | ex-04-04 |
| 04-06 | **Consistência do status de envio em falhas** | **NOVO — Decisão Q1 (nome e número definidos pelo usuário)** |
| 04-07 | Invalidação do orgCategoryCache | ex-04-05 |

---

## 1. Resumo executivo

**Problema.** Sob lentidão externa o sistema trava: sem timeout HTTP (Agendor) e com `socketTimeout` SMTP default de 10min (~30min por destinatário com retry). O cache de categorias nunca é invalidado. `axios`/`nodemailer` têm advisories HIGH. E dois defeitos de consistência descobertos na leitura: (DESC-1) toda falha de envio deixa uma linha `'sent'` no `notification_log` — a dedup **nunca retenta** um envio que falhou; (DESC-2) falha na consulta de tarefas futuras produz proteção **parcial** — deals com tarefa futura podem ser notificados indevidamente.

**Por que agora.** Os defeitos só aparecem sob degradação — o modo de falha é "parar de notificar (ou notificar errado) em silêncio", a classe exata que o Core Value existe para impedir.

**O que muda para o usuário.** Nada no caminho feliz. Sob falha: rodadas falham rápido e ficam registradas; envio que falhou é **retentado na rodada seguinte** (novo — Q1); rodada com consulta crítica incompleta é **abortada sem notificar** (novo — Q2); recategorização no Agendor vale na execução seguinte.

**O que não muda.** Regras de seleção/exclusão; destinatários e ordem de envio; dedup de envios **realmente bem-sucedidos**; templates; agendamento; UI; semântica de retry (só 429 no Agendor; 3×/3s/6s no SMTP); "registrar e seguir para o próximo destinatário" na exaustão (núcleo de D-03).

**Comportamentos preservados (pinados):** goldens `[101,103]` + day-boundary; exclusão por categoria via leitura direta (`agendor.js:165`); retorno por destinatário `{to, success, error?}`; scheduler não relança e libera lock; só 429 retenta.

**Comportamentos que mudam (com teste do novo fluxo):** (a) status `'sent'` só após envio confirmado; falha total → `'error'` e retentável no dia seguinte (04-06); (b) falha na consulta de tarefas futuras aborta a rodada sem notificações (04-02).

**Riscos reduzidos:** travamento indefinido do cron; ~30min/destinatário; categoria obsoleta; falha de envio silenciada para sempre; notificação indevida por proteção parcial; SSRF/proto-pollution (axios); domínio não intencionado/injeção SMTP (nodemailer).

**Riscos fora do escopo:** `sec-01` (rotação do token); demais advisories do `sec-02` (`path-to-regexp`, `node-cron` 4, `vite` 8) e gate permanente de `npm audit`; rate-limit em memória; JWT localStorage; `requireAdmin` fail-open (Fase 6); retenção do `notification_log` (v2); alerta ativo de falha (adiado).

## 2. Estado de entrada da fase (baseline)

### Fatos comprovados (medidos em 2026-08-04)

| Item | Valor |
|---|---|
| Testes / cobertura | 78/78 verdes; branches 72,72% (piso 60); pisos 20/20/20 ativos |
| CI | 3 jobs (`backend`, `frontend`, `secrets`/gitleaks 8.24.3 pinado); required checks os 3, `strict`+`enforce_admins`; push direto na main recusado |
| `axios` / `nodemailer` | `^1.7.2` / `^6.9.13` |
| Instância Agendor | `axios.create({baseURL, headers})` sem timeout (`agendor.js:6-9`); consumida por `getUsers`, `getOrgCategory`, `fetchDealsPage`, `getDealsWithFutureTasks` |
| Ad-hoc | `axios.get` sem timeout e sem a instância (`routes/notifications.js:220-223`); catch por item engole |
| Retry Agendor | só 429; 3 tentativas; esperas 5s/10s; demais erros propagam |
| SMTP | `createTransporter()` sem timeouts (defaults 2min/30s/10min); **6 call-sites** (`emailer.js:197,206,383,404,409,689`) — todos via a fábrica; `sendMailWithRetry` retorna `{success:false}` na exaustão (não lança), recria transporter no retry |
| Scheduler | guard `:27`; catch `:171-173` não relança; `finally :174-177` libera lock; weekly catch `:242-244` sem lock — REL-03 já satisfeito |
| Cache | `orgCategoryCache = {}` module-level; `orgId → string\|null` (erro cacheia `null`); leituras `:36` e direta `:165`; nunca limpo |
| **DESC-1 (ampliado)** | `scheduler.js:113` grava `'sent'` ANTES de enviar (para obter `logId`). Falha-por-retorno: a linha fica `'sent'` (o catch `:142-157` não executa). Falha-por-exceção: o catch **insere uma SEGUNDA linha** `'error'` — a linha `'sent'` original permanece. Como `alreadyNotifiedToday` filtra `status='sent'`, **nenhum dos dois caminhos de falha é retentado no dia seguinte** — a premissa de recuperação de D-03 é falsa nos dois caminhos |
| **DESC-2** | catch de `getDealsWithFutureTasks` (`agendor.js:224-227`) faz `console.error` + `break` → conjunto **parcial**; `runCheck` e `runCheckOnly` consomem o parcial sem distinguir de completo |
| Advisories | backend 12 (5 high) / frontend 4 (2 high, dev-only); relevantes: nodemailer HIGH, axios HIGH (sec-02, 2026-07-29 — re-medir) |

### Decisões vinculantes
- **04-CONTEXT:** D-01 (15s), D-02 (10s/10s/30s na fábrica), D-03 (núcleo: registrar e seguir por destinatário; rejeições de resumo-ao-admin/prioridade mantidas), D-04 (REL-03 caracterização), D-05 (limpar cache, não TTL), D-06 (só axios+nodemailer).
- **Humanas (2026-08-04, supersedem onde conflitam):** Q1 (04-06 corrige DESC-1), Q2 (04-02 fail-safe para DESC-2, plano próprio), Q3 (`getDealById` em `agendor.js`; **não** exportar a instância bruta), Q4 (`auto_advance` OFF na fase; C1-C6 obrigatórios), Q5 (verificação retroativa da Fase 3 = gate de transição, após 04-VERIFICATION e antes do planejamento da Fase 5), npm audit informativo com critério restrito ao escopo corrigido.

### A verificar pelo planner
Versões-alvo exatas de axios 1.x e nodemailer 9.x (re-medir `npm audit`/`npm view`); changelog nodemailer 6→7→8→9 na superfície usada; se o teste WR-02 (`agendor.futureTasks.test.js`) pina o caminho catch→break (se sim, atualização deliberada e documentada do golden no 04-02); valores exatos de lines/statements/functions; branch de trabalho nova.

### Fora da Fase 4 (herdado)
`sec-01`; restante do `sec-02` + gate permanente de `npm audit` (decidir após correção do backlog); `ops-01` (Fase 8); `console.*` residual (Fase 5). A lacuna de VERIFICATION da Fase 3 agora tem destino decidido (Q5 — seções 18-20).

## 3. Escopo

**Dentro:** REL-01..REL-04; bumps axios+nodemailer (D-06); **REL-05 (novo, derivado de DESC-1/Q1)** — consistência do status de envio; **REL-06 (novo, derivado de DESC-2/Q2)** — fail-safe na consulta de tarefas futuras. O planner deve registrar REL-05/REL-06 em REQUIREMENTS.md mapeados à Fase 4 (invariante: nenhum plano sem requisito).

**Fora (com justificativa):** auth/autorização (Fase 6); regras de seleção/exclusão de deals (Core Value; goldens acusam); refatoração estrutural (`getEnrichedStaleDeals`, cache por execução — Fase 7; nota: `getDealById` de Q3 é **adição** de função de domínio no módulo que já detém a borda, não refatoração das existentes); UI (adiado no 04-CONTEXT); deploy/infra/permissões (Fases 6/8; sem servidor); outras dependências e `npm audit fix` amplo (D-06; lockfile rastreável); gate permanente de `npm audit` (decisão pós-backlog — npm audit section); novas features/migração/staging/escala (milestone); nova arquitetura de logging (Fase 5).

## 4. Mapa de rastreabilidade

| Req | Decisão | Plano | Arquivos prováveis | Testes | Aceite | Evidência | Risco coberto |
|---|---|---|---|---|---|---|---|
| REL-03 | D-04 | 04-01 | `test/scheduler.resilience.test.js`; `scheduler.js` só exports aditivos | falha capturada; lock liberado; concorrência recusada | verde sem mudança de lógica | diff só de teste; suíte verde | lock vazado → silêncio |
| REL-06 (novo) | **Q2** | 04-02 | `agendor.js` (catch de `getDealsWithFutureTasks`), `scheduler.js` se necessário, testes | 5 cenários da Decisão Q2 | falha da consulta → rodada aborta sem notificar; lock liberado; próxima rodada roda | testes do novo fluxo; WR-02 atualizado deliberadamente se pinava o parcial | notificação indevida por proteção parcial |
| REL-01 | D-01, **Q3** | 04-03 | `agendor.js` (timeout + `getDealById`), `routes/notifications.js`, `package.json`+lock | timeout na instância; `/resolved` via `getDealById`; goldens | `timeout:15000`; rota preserva resposta; 429 inalterado | teste inspeciona config; teste da rota | travamento do cron; ponto órfão; SSRF (axios) |
| REL-02 | D-02, D-03 | 04-04 | `emailer.js`, `test/emailer.timeout.test.js` | 3 timeouts na fábrica; exaustão sem throw; sucesso pós-retry | opções presentes; retry intocado | teste lê opções do transport | ~30min/destinatário |
| REL-02 (dep) | D-06 | 04-05 | `package.json`+lock (`emailer.js` só se exigido) | suíte do emailer sob v9 | zero testes editados; lockfile limpo | diff lockfile; `npm ls` | advisory HIGH; regressão do major |
| REL-05 (novo) | **Q1** | 04-06 | `scheduler.js` (fluxo de log), `db.js` (helper de update), testes | 5 cenários da Decisão Q1 | `'sent'` só pós-confirmação; falha total → `'error'` retentável; sucesso real deduplica | testes do novo fluxo em tmpDb | falha de envio silenciada para sempre |
| REL-04 | D-05 | 04-07 | `agendor.js` + teste novo | 2 execuções → refetch; 1 chamada/org; goldens | limpeza no início; formato inalterado | teste duplo + golden verde | categoria obsoleta; limpeza errada |

## 5. Arquitetura afetada

(Fluxos como na v1, com as mudanças decididas marcadas.)

**Agendor:** rotas + scheduler → `getStaleDeals` → `fetchDealsPage` (instância **ganha timeout 15s**; retry só 429) → filtro 2026/cutoff → `Promise.all`(orgs→`getOrgCategory`) → loop lê cache direto `:165`. `getUsers` sem retry (erro propaga). `getDealsWithFutureTasks`: **catch→break parcial é SUBSTITUÍDO por propagação da falha (Q2)** — resultado passa a ser "completo ou exceção". `/resolved`: **passa a consumir `getDealById(id)` (Q3)**, função de domínio nova em `agendor.js` usando a instância compartilhada (com timeout); catch por item da rota preservado.

**SMTP:** `runCheck` → `sendStaleNotification` → fábrica `createTransporter()` (**ganha os 3 timeouts**; 6 call-sites cobertos, incl. a recriação no retry `:197`) → `sendMailWithRetry` (3×, 3s/6s, retorna `{success:false}` na exaustão — inalterado). **Registro no banco muda (Q1/04-06):** linha obtém `logId` sem status final otimista; `'sent'` confirmado só após ≥1 envio real; falha total → `'error'` (uma linha só — o caminho de exceção deixa de inserir linha duplicada).

**Scheduler:** guard/`try-catch-finally` inalterados (04-01 pina). Com Q2, falha da consulta crítica entra pelo catch existente de `runCheck` → rodada registrada como erro, zero notificações, lock liberado pelo `finally`.

**Cache:** limpar as chaves (preservando a referência — `:36` e `:165` fecham sobre o mesmo objeto) na primeira instrução de `getStaleDeals`; não TTL (D-05 — TTL muda o formato e a `:165` passaria a incluir orgs excluídas).

## 6. Plano 04-01 — Caracterização da resiliência do scheduler (REL-03)

Inalterado da v1: somente testes (ou exports aditivos padrão `auth.js`); cenários mínimos — (1) borda lança → `runCheck` resolve com `results.error`; (2) `isRunning:false` pós-falha; (3) 2ª execução roda; (4) concorrente → `{skipped:true}`; (5) weekly resolve sem lançar. Stubs via fakeAxios/`mock.method` antes do `require`; `mock.timers` se preciso; tmpDb; arquivo = processo. Aceite: cenários verdes; diff só de teste; suíte+cobertura+lint. Rollback: revert. Commit: `test(04-01): caracteriza resiliência do scheduler (REL-03)`. Cláusula: defeito objetivo descoberto → registrar e parar (C2). **Nota:** estes testes são pré-requisito de segurança para os planos comportamentais 04-02 e 04-06, que alteram exatamente os fluxos que 04-01 pina.

## 7. Plano 04-02 — Fail-safe na consulta de tarefas futuras (REL-06, Decisão Q2) — NOVO

- **Por que plano próprio (decisão tomada, conforme preferência declarada):** é mudança de comportamento; misturá-la com timeout/config HTTP (04-03) tornaria o rollback ambíguo (reverter o quê?) e sujaria a rastreabilidade (um commit com dois requisitos de naturezas diferentes). Plano próprio, commit próprio, revert próprio.
- **Objetivo:** resultado de `getDealsWithFutureTasks` passa a ser **completo ou falha explícita** — nunca parcial silencioso. Falha (timeout/erro de rede) propaga para `runCheck`, que registra o erro e **encerra a rodada sem disparar nenhuma notificação**; `isRunning` é liberado pelo `finally` existente; a rodada seguinte executa normalmente.
- **Mudança mínima:** substituir o `catch { console.error; break }` (`agendor.js:224-227`) por propagação do erro (rethrow). O `Promise.all` de `runCheck` (`scheduler.js:54-58`) rejeita → catch existente registra → `finally` libera o lock. **Sem refatoração além disso.** Efeito colateral documentado: `runCheckOnly` (`scheduler.js:288-294`) e a rota de check manual também passam a falhar explicitamente em vez de operar com proteção parcial — coerente com o fail-safe; o handler da rota já tem try/catch.
- **Golden pré-existente:** verificar se `agendor.futureTasks.test.js` (WR-02) pina o catch→break; se pinar, atualizar **deliberadamente** o teste para o novo fluxo, documentando a troca no SUMMARY (nunca silenciosamente).
- **Testes exigidos (Decisão Q2, literal):** (1) nenhuma notificação enviada quando a consulta crítica falha (spy no emailer stub = 0 chamadas; `notification_log` sem linhas novas); (2) erro registrado (`results.error` preenchido); (3) lock liberado (`getStatus().isRunning === false`); (4) execução posterior funciona; (5) comportamento normal idêntico quando a consulta é bem-sucedida (deals com tarefa futura seguem filtrados; demais notificados).
- **Aceite:** 5 cenários verdes; diff restrito ao catch (+ teste); suíte completa verde (com eventual atualização deliberada do WR-02 documentada); REQUIREMENTS ganha REL-06.
- **Rollback:** revert do commit (volta ao parcial silencioso atual). **Commit:** `fix(04-02)!: falha na consulta de tarefas futuras aborta a rodada sem notificar (fail-safe, REL-06)`.
- **Sequência:** obrigatoriamente **antes** do 04-03 — o timeout de REL-01 tornaria o caminho parcial alcançável por lentidão; o fail-safe precisa existir primeiro (trava de uma via).

## 8. Plano 04-03 — Timeout HTTP Agendor + `getDealById` + bump axios (REL-01, Q3)

- **Instância:** `timeout: 15000` em `agendor.js:6-9` (cobre os 4 consumidores). Timeout NÃO entra no retry de 429; propaga.
- **`getDealById(id)` (Decisão Q3):** nova função de domínio em `agendor.js`, usando **internamente** a instância compartilhada (path relativo `/deals/:id`), exportada no `module.exports`. A instância bruta **não** é exportada. `routes/notifications.js` `/resolved` passa a chamar `getDealById` no lugar do `axios.get` ad-hoc (removendo o header duplicado e o `TOKEN` local); o catch por item da rota permanece.
- **Testes:** instância criada com `timeout:15000` (fakeAxios inspeciona args de `create`); `getDealById` usa o cliente configurado (fakeAxios comprova a chamada via instância, não via `axios.get` global) **e a resposta da rota `/resolved` preserva o shape atual** (`resolved`, `pending`, contagens, `resolvedRate`), incluindo o caminho de item com falha → deal mantido como não-resolvido; suíte inteira verde.
- **Bump axios:** `^1.7.2` → última 1.x re-medida; dois commits no plano — (a) timeout+`getDealById`+testes; (b) bump com suíte verde antes/depois; lockfile só com axios e transitivas (ex.: `form-data`).
- **Aceite:** timeout testável; rota preservada por teste; 429 inalterado; goldens intactos; `npm ls axios` = alvo; advisories high/critical de axios ausentes na re-medição. **Rollback:** reverts independentes (a)/(b). **Commits:** `feat(04-03): timeout 15s + getDealById na borda Agendor (REL-01)` · `chore(04-03): atualiza axios para 1.x.y`.

## 9. Plano 04-04 — Timeouts SMTP (REL-02)

Como na v1, **menos** o cenário de caracterização do DESC-1 (substituído pelo novo fluxo do 04-06): `connectionTimeout:10s` / `greetingTimeout:10s` / `socketTimeout:30s` **na fábrica** (6 call-sites cobertos); diferenças e comportamento de cada timeout conforme v1; retry existente intocado (3×, 3s/6s, recriação do transporter); pior caso por e-mail ~1min40s; retorno por destinatário inalterado; `console.warn` do retry mantido (Fase 5 migra); nunca logar `SMTP_PASS`. **Testes:** (1) transport com as 3 opções (mock de `createTransport`); (2) exaustão → `{success:false}` sem throw, esperas sob `mock.timers`; (3) sucesso após 1 falha (pina recriação). Nodemailer AINDA 6.x aqui. Aceite/comandos/rollback como v1. Commit: `feat(04-04): timeouts explícitos no transporte SMTP (REL-02)`.

## 10. Plano 04-05 — Atualização nodemailer 6→9

Como na v1 (renumerado): alvo 9.x re-medido; changelog das 3 majors revisado na superfície usada (`createTransport`, `sendMail`, `verify`, **códigos/mensagens de erro** que o retry classifica — ponto mais sensível); revisão manual de `emailer.js:12-22`, `:178-203`, `verifySmtp`, reset; **depende duramente do 04-04** (os testes de timeout/exaustão são o teste do novo fluxo do major); commit único json+lock (+ajustes mínimos documentados); teste quebrado sob v9 = informação → parar em C3, não editar teste; lockfile só nodemailer+transitivas. Aceite: versão alvo; suíte intacta; advisories high/critical de nodemailer ausentes na re-medição; changelog com achados no SUMMARY. **Checkpoint C3 obrigatório antes do merge/avanço.** Commit: `chore(04-05)!: atualiza nodemailer 6→9 — protegido pelos testes de REL-02`.

## 11. Plano 04-06 — Consistência do status de envio em falhas (REL-05, Decisão Q1) — NOVO

- **Objetivo (Decisão Q1, literal):** `'sent'` somente após envio confirmado; todas as tentativas em falha → `'error'`; execução futura pode retentar; dedup de envios realmente bem-sucedidos preservada.
- **Estado atual (DESC-1 ampliado, comprovado):** `scheduler.js:113` insere `'sent'` antes do envio (para obter o `logId` usado no link de tracking). Falha-por-retorno: linha fica `'sent'`. Falha-por-exceção: catch insere **segunda** linha `'error'` e a `'sent'` original permanece. Nos dois caminhos `alreadyNotifiedToday` (filtra `status='sent'`) bloqueia o dia seguinte.
- **Correção isolada (sem refatoração ampla — orientação ao planner):** manter o insert-first (o `logId` é necessário antes do envio para o tracking); após `emailResults`: se **nenhum** destinatário teve sucesso confirmado → **atualizar a mesma linha** para `'error'` com o erro agregado; no caminho de exceção, atualizar a linha existente em vez de inserir uma segunda. Requer um helper pequeno em `db.js` (ex.: `updateNotificationStatus(logId, status, error)`) — adição, não refatoração. **Semântica de sucesso parcial:** ≥1 envio confirmado mantém `'sent'` (houve envio real; dedup protege o destinatário que recebeu — comportamento de "seguir por destinatário" de D-03 intocado).
- **Testes exigidos (Decisão Q1, literal):** (1) sucesso confirmado mantém `'sent'`; (2) exceção após esgotar tentativas registra `'error'` (e não deixa linha `'sent'` órfã); (3) retorno `{success:false}` (todos os destinatários) também registra `'error'`; (4) `alreadyNotifiedToday` **não bloqueia** quando o registro anterior é `'error'` (nova rodada retenta); (5) envio concluído continua bloqueando duplicação no mesmo dia. Executados com tmpDb (SQLite real) + stubs do emailer, padrão da Fase 1.
- **Interações:** os testes de dedup da Fase 1 (`db.dedup.test.js`) permanecem válidos (pinam o comportamento de `'sent'` — inalterado); o cenário (4) os complementa. `getNotifiedDeals`/relatórios que leem o log: planner verifica consumidores de `status` (ex.: `routes/track.js`, histórico) e documenta que só o caminho de falha muda.
- **Aceite:** 5 cenários verdes; diff restrito a `scheduler.js` + helper em `db.js` + testes; nenhum template/destinatário/ordem alterado; REQUIREMENTS ganha REL-05; suíte completa verde.
- **Rollback:** revert do commit (volta ao registro otimista atual — estado conhecido). **Commit:** `fix(04-06)!: status de envio consistente em falhas — 'sent' só após confirmação (REL-05)`.
- **Sequência:** após 04-05 — mudança comportamental executada com a rede máxima (timeouts + v9 já testados); independente do nodemailer via stubs, mas o novo fluxo nasce validado sob a versão final.

## 12. Plano 04-07 — Invalidação do orgCategoryCache (REL-04)

Como na v1 (renumerado): limpeza das **chaves** (não reatribuir — `:36`/`:165` fecham sobre a mesma referência) na primeira instrução de `getStaleDeals`; não TTL (D-05); risco do ponto errado (pós-`Promise.all`) acusado pelo golden `[101,103]`; corrige também o `null`-de-erro que hoje contamina rodadas futuras. Testes: (1) duas execuções com categorias diferentes → 2ª usa a nova; (2) 1 chamada por org única por execução; (3) suíte inteira com goldens. Rollback: revert. Commit: `feat(04-07): invalida orgCategoryCache a cada execução (REL-04)`.

## 13. Matriz de testes (atualizada)

| Plano | Cenário | Tipo | Arquivo provável | Setup → Ação → Esperado | Regressão protegida |
|---|---|---|---|---|---|
| 04-01 | falha não relança / lock liberado / concorrência / weekly | caracterização | `scheduler.resilience.test.js` | stubs + promessa pendurada → v1 §6 | silêncio permanente; sobreposição |
| 04-02 | consulta falha → 0 notificações | novo fluxo | `scheduler.failsafe.test.js` (ou similar) | tasks rejeita → runCheck → emailer 0 chamadas; log sem linhas | notificação indevida |
| 04-02 | erro registrado / lock liberado / rodada seguinte OK | novo fluxo | idem | → `results.error`; `isRunning:false`; 2ª rodada roda | rodada morta silenciosa |
| 04-02 | caminho feliz idêntico | regressão | idem + WR-02 | tasks OK → filtragem igual | mudança acidental do filtro |
| 04-03 | instância com `timeout:15000` | unitário | novo | fakeAxios captura args de `create` | chamada sem teto |
| 04-03 | `getDealById` usa o cliente configurado | unitário | novo | fakeAxios comprova chamada via instância | ponto órfão ressurgindo |
| 04-03 | `/resolved` preserva shape (incl. item com falha) | regressão | novo/rota | resposta com `resolved/pending/contagens` | quebra da rota |
| 04-03 | timeout ∉ retry 429; goldens pós-bump | caracterização/regressão | existentes | ECONNABORTED propaga; suíte verde antes/depois | retry mascarando; quebra do client |
| 04-04 | 3 timeouts no transport / exaustão sem throw / sucesso pós-retry | unitário+caracterização | `emailer.timeout.test.js` | v1 §8 | default 10min; exceção não capturada; retry quebrado |
| 04-05 | suíte sob v9 sem editar testes | regressão | suíte | `npm ci` → verde | major quebra classificação de erro |
| 04-06 | 5 cenários da Decisão Q1 | novo fluxo | `notificationStatus.test.js` (ou similar), tmpDb | §11 | falha silenciada p/ sempre; dupla notificação |
| 04-07 | refetch entre execuções / 1 chamada por org / golden [101,103] | unitário+regressão | novo + existente | §12 | dado obsoleto; eficiência; exclusão afrouxada |
| todos | cobertura+lint+CI 3 jobs | CI | — | pisos 20/20/20/60; exit 0; PR verde | erosão da rede |
| C3/C4 | changelog + lockfiles | **manual (necessária)** | — | revisão humana dos diffs | atualização indireta inesperada |

## 14. Estratégia de execução (atualizada)

- **Ordem:** `04-01 → 04-02 → 04-03 → 04-04 → 04-05 → 04-06 → 04-07`. Sem paralelismo (config + conflitos em `agendor.js` [02/03/07], `scheduler.js` [01/02/06], `emailer.js` [04/05], lockfile [03/05]).
- **Dependências duras:** 04-05 ← 04-04 (testes de REL-02 antes do major — constraint do milestone); **04-03 ← 04-02** (o fail-safe deve existir antes do timeout tornar o caminho parcial alcançável — trava de segurança de uma via).
- **Estratégicas:** 04-01 primeiro (a caracterização do scheduler protege os dois planos comportamentais que mexem nesse fluxo); 04-06 após 04-05 (rede máxima sob a versão final); 04-07 por último.
- **Commits/testes/lint/audit/PR:** como na v1 — commits atômicos, bump em commit próprio, suíte ao fim de cada plano e antes/depois de cada bump, lint por commit; `npm audit` re-medido no início do 04-03 e re-medido ao fim do 04-05 (critério da seção npm audit); PR draft desde 04-01, ready ao fim do 04-07, **merge commit**.
- **Auto-advance (Decisão Q4):** `workflow.auto_advance` **desligado via `/gsd-config` ANTES de `/gsd-execute-phase`**; religado **somente após o 04-VERIFICATION.md aprovado** (C6). C1-C6 obrigatórios.

## 15. Estratégia de dependências + npm audit (atualizada)

Procedimento por pacote inalterado (um commit por pacote, nunca os dois juntos; versão antes/depois registrada; suíte antes → install alvo re-medido → testes focados → suíte completa → **revisão do diff do lockfile** (só o pacote e transitivas; nenhum outro top-level muda) → commit json+lock; rollback = revert).

**Critério de `npm audit` da fase (decisão humana):** evidência **informativa**, com exigência restrita: (a) re-medição ANTES (início do 04-03) e DEPOIS (fim do 04-05), saídas registradas nos SUMMARYs; (b) **ausência de high/critical atribuível às versões-alvo de axios e nodemailer** no escopo corrigido; (c) **registro explícito dos advisories restantes** no backlog de segurança (todo `sec-02` atualizado). O audit global **não** precisa zerar. Gate permanente de `npm audit` no CI: decisão adiada para depois da correção do backlog restante (candidata à Fase 6) — não ampliar esta fase.

## 16. Observabilidade e erros

Como na v1 (tabela §14): nada de nova arquitetura; falhas registradas nos pontos existentes (`logger.error [Scheduler]`, `console.warn` do retry mantido até a Fase 5, `notification_log`); nunca logar token/`SMTP_PASS`/corpo de e-mail; distinção timeout (`ECONNABORTED`/`ETIMEDOUT`) vs erro remoto (`err.response.status`/código SMTP) vs interno. Acréscimos das decisões: a falha do fail-safe (04-02) aparece em `results.error`/`lastRunResult` (já existentes); o `'error'` do 04-06 fica consultável no histórico de notificações da UI (consumidores verificados no plano).

## 17. Matriz de riscos (atualizada)

| # | Risco | Prob. | Impacto | Plano | Mitigação | Sinal | Rollback | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| R-1 | alteração do fluxo de envio (destinatários/ordem) | baixa | alto | 04-04/05/06 | timeouts na fábrica; 04-06 não toca ordem/destinatários; testes por destinatário | teste de retorno falha | revert | C3, C5 |
| R-2 | tentativas/esperas alteradas | baixa | médio | 04-03/04 | retry intocado; testes pinam contagem | testes de retry falham | revert | C5 |
| R-3 | nodemailer 9 incompatível | média | alto | 04-05 | bump isolado pós-04-04; changelog; suíte como oráculo | emailer vermelho sob v9 | revert do bump | **C3** |
| R-4 | timeout curto demais | baixa | médio | 04-03/04 | valores generosos; retentativa diária agora REAL (04-06) | ECONNABORTED/ETIMEDOUT frequentes | 1 linha | C5 |
| R-5 | `/resolved` regressão via `getDealById` | média | médio | 04-03 | teste de shape da rota incl. item com falha | teste da rota falha | revert | C1, C5 |
| R-6 | lock não liberado (futuro) | baixa | alto (silencioso) | 04-01 | caracterização do `finally` + 2ª execução | teste falha; `isRunning` preso | n/a | C2 |
| R-7 | cache limpo no ponto errado | baixa | alto | 04-07 | golden [101,103]; teste de contagem | golden vermelho | revert | C5 |
| R-8 | seleção de negócios alterada | baixa | alto | todos | goldens + day-boundary em todo plano | golden vermelho | revert do plano culpado | C5 |
| R-9 | lockfile com mudanças alheias | média | médio | 04-03/05 | commit isolado + revisão de diff | outro top-level mudou | refazer bump | C4 |
| R-10 | **(novo)** fail-safe aborta rodada por erro transitório → dia sem notificações | média | médio | 04-02 | erro registrado; cadência diária recupera; retentativa real via 04-06 | `results.error` recorrente em rodadas seguidas | revert do 04-02 (volta ao parcial) — decisão consciente | C2, C5 |
| R-11 | **(novo)** 04-06 marca `'error'` em envio de fato entregue (sucesso parcial mal classificado) → duplicata no dia seguinte | baixa | médio | 04-06 | regra explícita "≥1 sucesso confirma 'sent'"; testes 1 e 5 | destinatário recebe 2× em dias seguidos | revert do 04-06 | C5 |
| R-12 | **(novo)** golden WR-02 pinava o catch→break → conflito | média | baixo | 04-02 | planner verifica; atualização deliberada documentada no SUMMARY | suíte vermelha no 04-02 | ajuste documentado do teste | C1 |
| R-13 | **(novo)** consumidores do `status` do log (UI/track/relatórios) afetados pelo `'error'` atualizado | baixa | médio | 04-06 | inventário de consumidores no PLAN; teste de rota se algum consumir o caminho alterado | histórico/relatório exibindo estado inconsistente | revert do 04-06 | C1, C5 |

## 18. Definition of Done por plano (atualizada)

Checklist da v1 (testes focados; suíte completa sem editar testes para passar; cobertura ≥ pisos; lint; CI 3 jobs; SUMMARY; diff = escopo declarado; commits atômicos com bump isolado; rollback por revert; evidências) **mais**, para os planos comportamentais (04-02, 04-06):
- [ ] Novo fluxo integralmente coberto pelos testes literais das Decisões Q2/Q1 (5 cenários cada).
- [ ] REQUIREMENTS.md atualizado com REL-06/REL-05 mapeados à Fase 4.
- [ ] Qualquer golden antigo atualizado **deliberadamente**, com a troca documentada no SUMMARY (nunca silenciosamente).
- [ ] Inventário de consumidores do comportamento alterado registrado (04-02: `runCheckOnly`/rota de check; 04-06: leitores de `status` no log).

## 19. Gate final da Fase 4 (atualizado)

- [ ] REL-01..REL-04 + REL-05 + REL-06 comprovados por teste.
- [ ] Testes novos aprovados; goldens preservados (ou atualizados deliberadamente e documentados — só onde as Decisões Q1/Q2 exigem).
- [ ] axios e nodemailer atualizados individualmente; re-medição de `npm audit` antes/depois registrada; **zero high/critical atribuível às versões-alvo**; advisories restantes registrados no backlog (`sec-02` atualizado).
- [ ] Nenhuma mudança de regra de seleção/exclusão de deals.
- [ ] Suíte, lint, CI, cobertura verdes.
- [ ] REQUIREMENTS (incl. REL-05/06), ROADMAP, STATE atualizados.
- [ ] **04-VERIFICATION.md com `passed`.**
- [ ] PR revisado e mesclado via merge commit.
- [ ] `auto_advance` religado **somente** após aprovação do VERIFICATION (Q4).
- [ ] **Gate de transição do milestone (Q5):** verificação retroativa da Fase 3 executada **após** o 04-VERIFICATION e **antes** de iniciar o planejamento da Fase 5.

## 20. Documentação da fase

Como na v1, mais: REQUIREMENTS.md ganha REL-05/REL-06 (Fase 4); todo `sec-02` atualizado com os advisories restantes (registro explícito — critério do npm audit); STATE.md registra: decisões Q1-Q5, `auto_advance` OFF durante a fase, e o **gate de transição** (retro-verificação da Fase 3 antes do planejamento da Fase 5). `04-VERIFICATION.md` obrigatório.

## 21. Checkpoints humanos (C1-C6, obrigatórios — Decisão Q4)

| # | Momento | O revisor confere |
|---|---|---|
| C1 | após o planner gerar os 7 PLANs | fidelidade a este contrato; D-01..06 + Q1-Q5 incorporadas; REL-05/06 registrados; versões re-medidas; inventários de consumidores (04-02/04-06) presentes; destino do golden WR-02 definido |
| C2 | fim do 04-01 | caracterização reflete o esperado; zero mudança de produção; **autorizar a entrada no primeiro plano comportamental (04-02)** |
| C3 | antes do merge/avanço do 04-05 | changelog nodemailer 6→9 com achados listados; suíte verde SEM edição de testes; ajustes mínimos |
| C4 | lockfiles (fim do 04-03 e do 04-05) | diff só com o pacote do bump e transitivas dele |
| C5 | antes do merge final do PR | diff da fase vs escopo; **diffs comportamentais 04-02/04-06 revisados linha a linha**; goldens; DoD de todos os planos; CI verde; merge commit |
| C6 | após o 04-VERIFICATION.md | `passed` sem gaps; **religar `auto_advance`**; **disparar o gate Q5** (retro-verificação da Fase 3) antes de autorizar o planejamento da Fase 5; decidir rotação `sec-01` |

## 22. Comandos GSD (sequência final)

1. **`/gsd-plan-phase`** (Fase 4) com este contrato como entrada → C1 (revisão humana dos 7 PLANs).
2. **`/gsd-config`** → desligar `workflow.auto_advance` (**antes** de executar; religar só após C6 — Decisão Q4).
3. **`/gsd-execute-phase`** (Fase 4), parando em C2 e C3.
4. Verifier do fluxo produz `04-VERIFICATION.md` (config `verifier:true`); UAT adicional: `/gsd-verify-work`. Lacunas: `/gsd-validate-phase` ou novo ciclo `/gsd-plan-phase`; pontuais: `/gsd-quick`.
5. **C6** → `/gsd-config` religa `auto_advance` → **gate Q5:** `/gsd-validate-phase` (Fase 3, auditoria retroativa) — obrigatório antes do próximo passo.
6. Fechamento/estado: `/gsd-progress`; PR final: `/gsd-ship` (merge commit); reverts: `/gsd-undo`.
7. Só então: `/gsd-discuss-phase` (Fase 5 — Logging & Erros).

## 23. Perguntas ainda pendentes

1. **Versões-alvo exatas** de axios 1.x e nodemailer 9.x — resolvidas pelo planner por re-medição (`npm audit`/`npm view`); decisão fixada nos PLANs e conferida em C1.
2. **Registro formal de REL-05/REL-06** em REQUIREMENTS.md — recomendação deste contrato; confirmar redação em C1.
3. **Gate permanente de `npm audit` no CI** — deliberadamente adiado para depois da correção do backlog restante (candidato: Fase 6). Sem prazo nesta fase.
4. **Rotação do token Agendor (`sec-01`)** — ação operacional no painel, independente de código; sem camada automática que lembre. Sugerido decidir em C6, mas pode ser feita a qualquer momento.

(Q1-Q5 e o critério de npm audit estão **decididos** e incorporados.)

## 24. Resultado final esperado

| Plano | Ordem | Tamanho | Risco | Depende de |
|---|---|---|---|---|
| 04-01 caracterização scheduler | 1º | M | baixo | — |
| 04-02 fail-safe tarefas futuras | 2º | S-M | **médio-alto (comportamental)** | 04-01 (estratégica-forte) |
| 04-03 timeout HTTP + getDealById + axios | 3º | M | baixo-médio | **04-02 (dura, segurança)** |
| 04-04 timeouts SMTP | 4º | S-M | médio | — (estratégica: após 04-03) |
| 04-05 nodemailer 6→9 | 5º | S, o mais arriscado | **alto** | **04-04 (dura)** |
| 04-06 consistência de status | 6º | M | **médio-alto (comportamental)** | — (estratégica: após 04-05) |
| 04-07 cache | 7º | S | médio (semântico) | — (estratégica: último) |

- **Total: 7 planos** (era 5; +04-02 fail-safe e +04-06 consistência de status).
- **Modelo:** manter `model_profile: "quality"` para planner/executor/verifier; `code_review` ativo (standard).
- **Primeira ação após aprovação final:** disparar o planner. **Primeiro comando:** `/gsd-plan-phase` (Fase 4) com este contrato; em seguida C1.
