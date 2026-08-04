---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 04-10-PLAN.md — WR-01/WR-04/WR-05 fechados; sucesso parcial sobrevive a excecao ('sent' preservado) e results.notified so conta envio real. Proximo: 04-11
last_updated: "2026-08-04T22:30:18.812Z"
last_activity: 2026-08-04 -- Phase 04 gap closure: 04-10 concluido
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 27
  completed_plans: 26
  percent: 38
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-22)

**Core value:** Rede de testes automatizados sobre a lógica crítica de notificação (quem recebe / quem não recebe) — para nunca mais uma regressão silenciosa.
**Current focus:** Phase 04 — confiabilidade-das-integra-es

## Current Position

Phase: 04 (confiabilidade-das-integra-es) — EXECUTING (gap closure)
Plan: 10 of 11
Status: 04-10 concluido (WR-01/WR-04/WR-05). SEC-01 permanece ABERTO como risco conscientemente aceito (decisao C8). Proximo: 04-11
Last activity: 2026-08-04 -- Phase 04 gap closure: 04-10 concluido

Progress: [██████████] 96%

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 15 | 3 tasks | 7 files |
| Phase 01 P02 | 45 | 4 tasks | 8 files |
| Phase 01 P03 | 12 | 2 tasks | 2 files |
| Phase 01 P04 | 6 | 1 tasks | 1 files |
| Phase 01 P05 | 10 | 2 tasks | 2 files |
| Phase 02 P01 | 4 | 1 tasks | 1 files |
| Phase 02 P02 | 22 | 3 tasks | 40 files |
| Phase 02 P03 | 6 | 2 tasks | 2 files |
| Phase 03 P01 | 34 | 2 tasks | 5 files |
| Phase 03 P03 | 22min | 2 tasks | 5 files |
| Phase 03 P04 | 8min | 2 tasks | 3 files |
| Phase 3 P05 | 15min | 2 tasks | 3 files |
| Phase 03 P06 | 22min | 2 tasks tasks | 3 files files |
| Phase 03 P02 | 22min | 2 tasks | 2 files |
| Phase 04 P01 | 24min | 3 tasks | 2 files |
| Phase 04 P02 | 21 | 2 tasks | 4 files |
| Phase 04 P03 | 34min | 4 tasks tasks | 7 files files |
| Phase 04 P04 | 21min | 2 tasks | 2 files |
| Phase 04 P05 | 14min | 2 tasks | 3 files |
| Phase 04 P06 | 12min | 2 tasks | 4 files |
| Phase 04 P07 | 9min | 2 tasks | 2 files |
| Phase 04 P08 | 12min | 3 tasks tasks | 3 files files |
| Phase 04 P09 | 7min | 4 tasks tasks | 10 files files |
| Phase 04 P10 | 14min | 3 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Milestone]: Testes de caracterização antes de qualquer refatoração ou mudança de segurança (rede de segurança primeiro)
- [Milestone]: Mudanças que alteram comportamento (SEC-03/04/05) só entram com teste do novo fluxo, ou adiadas com justificativa documentada
- [Milestone]: "DONE" exige CI verde, zero segredos hardcoded e testes críticos passando
- [Phase ?]: [01-01]: Test runner nativo node:test (D-01/D-03), zero dependência de runtime nova
- [Phase ?]: [01-01]: Cobertura via c8@12 report-only (D-02); thresholds adiados para Phase 2
- [Phase ?]: [01-01]: Seam DB_PATH em db.js isola testes do backend/agendor.db; default de produção byte-idêntico (D-07)
- [Phase 01]: getStaleDeals caracterizado por two-lane (pure + integrated via stub axios); comparacao estrita do day-boundary pinada por golden — D-04/D-05/D-09: rede de seguranca contra regressao silenciosa nas regras de quem e notificado
- [Phase 01]: Fixture real-deal anonimizada commitada so apos aprovacao humana, sem reescrita de historico git — D-10: token/PII nunca entram no historico antes da revisao (checkpoint blocking-human)
- [Phase 01]: [01-03]: SQLite real em tempfile (nao :memory:) para o caso day-boundary da dedup via segunda conexao ao mesmo arquivo — D-08: viabiliza semear sent_at do passado sem tocar backend/agendor.db
- [Phase ?]: [01-04]: Quirk de match exato do funil beefor (near-miss NAO suprimido) pinado como comportamento ATUAL
- [Phase ?]: 02-01: getDealsWithFutureTasks caracterizado (a-e), comportamento atual pinado, WR-02 fechado
- [Phase ?]: [02-02]: Biome 2.5.5 como lint+format único (backend CJS + frontend ESM) via biome.json na raiz; assist off para não reordenar requires
- [Phase ?]: [02-02]: Baseline de lint warn-tolerante measure-first (D-06) — 17 regras violadas rebaixadas a warn; npm run lint exit 0 nos dois pacotes
- [Phase ?]: [02-02]: CSS fora do escopo do Biome (parser 2.5.5 aborta em @apply do Tailwind); fase é JS/JSX/CJS/ESM/JSON
- [Phase ?]: [02-03]: CI 2 jobs paralelos (backend/frontend), node 20, least-privilege (contents:read); actions pinadas @v7 (majors atuais, não @v4)
- [Phase ?]: [02-03]: gate de cobertura c8 flipado measure-first (check-coverage:true, per-file:false, pisos logo abaixo do observado) — WR-03
- [Phase 02]: [02-04]: main protegida com required status checks [backend, frontend], strict:true e enforce_admins:true — CI-01 provado por PR verde (run 30474941235) e CI-02 por PR de falha proposital com mergeStateStatus BLOCKED (run 30475739903)
- [Phase 02]: [02-04]: strict:true mantido conscientemente (exige branch atualizada com a main); custo baixo em repo single-maintainer
- [Phase ?]: [03-01]: validador de env com a regra numa FUNÇÃO PURA (validateEnv(env)) em vez do throw-no-topo de secret.js — config.js com 100% de branches; gate global subiu de 65,48% para 68,80%
- [Phase ?]: [03-01]: .env carregado por caminho absoluto derivado de __dirname (D-13/Pitfall 1) — sob PM2 (cwd /opt/agendor) o dotenv falhava em SILÊNCIO; fail-fast permanece DESLIGADO até o checkpoint humano de 03-02
- [Phase ?]: 03-03: senha SMTP vem só de process.env.SMTP_PASS; a migração de boot zera a chave do banco apenas quando o ambiente tem a senha (D-01/D-02)
- [Phase ?]: 03-03: smtp_pass removida do objeto defaults de db.js — o seeder não pode mais reintroduzir a senha no SQLite (Pitfall 3)
- [Phase 03]: [03-04]: allowlist do PUT içada para ALLOWED_KEYS sem smtp_pass e exposta como seam (padrão routes/auth.js) — fecha o caminho de escrita que desfazia a migração de 03-03 (Pitfall 4)
- [Phase 03]: [03-04]: campo de senha SMTP removido do ConfigPanel, substituído por nota citando SMTP_PASS (D-03); save() intocado — o backend ignora a chave
- [Phase 03]: [03-05]: CFG-02 fechado por meta-teste, não por revisão: backend/test/envExample.test.js compara as process.env lidas em src/ com o .env.example nas duas direções
- [Phase 03]: [03-05]: Guarda de entropia de placeholder por corrida ininterrupta de alfanuméricos (16+), não por comprimento total — separa segredo real de frase hifenizada em PT
- [Phase 03]: [03-02]: fail-fast de configuração ligado ao boot — index.js requer ./config antes de qualquer módulo local; produção não sobe sem as 5 obrigatórias (CFG-04)
- [Phase 03]: [03-02]: checkpoint humano do .env de produção declarado N/A — não existe servidor de produção; verificação transferida para o todo OPS-01 (primeiro deploy)
- [Phase 03]: [03-07]: `secrets` adicionado aos required status checks da main (agora [backend, frontend, secrets], strict + enforce_admins); provado por PR com chave sintética → mergeStateStatus BLOCKED
- [Phase 03]: [03-07]: Secret Scanning nativo habilitado só pela metade — `secret_scanning` e `push_protection` ativos; `non_provider_patterns` e `validity_checks` são recusados EM SILÊNCIO (PATCH devolve 200 e ignora). Consequência: o token do sec-01 NÃO gera alerta nativo, contrariando o que se esperava ao decidir D-11 — nenhuma camada automática vai lembrar da rotação
- [Phase 03]: [03-07]: a chave de exemplo da AWS (AKIAIOSFODNN7EXAMPLE) é allowlisted pelo gitleaks — testar um gate de segredo com exemplo canônico de documentação prova o oposto do pretendido
- [Phase 04]: 04-01: caracterização de REL-03 falha pela borda /users (getUsers propaga), não /tasks (getDealsWithFutureTasks engole) — mantém os 5 cenários válidos após o fail-safe do 04-02
- [Phase 04]: 04-01: runWeeklySummary exposta por seam aditivo (module.exports.runWeeklySummary), fora do module.exports principal — nenhum consumidor de produção a importa
- [Phase 04]: 04-01: a prova de 'rodada não recusada pelo guard' é reason === undefined; results.skipped é contagem numérica (scheduler.js:36), não flag
- [Phase 04]: 04-01: checkpoint C2 aprovado pelo usuário — entrada no plano comportamental 04-02 autorizada
- [Phase 04]: 04-02: getDealsWithFutureTasks passa a propagar a falha (Set completo ou exceção) — Set parcial notificava indevidamente deals com tarefa futura (REL-06/Q2)
- [Phase 04]: 04-02: o 500 do GET /api/deals/stale é aceito — try/catch local reintroduziria o parcial silencioso
- [Phase 04]: 04-02: seam aditivo module.exports.staleHandler + res falso mínimo — primeiro handler Express executado por teste, sem supertest/nock
- [Phase 04]: 04-03: timeout de 15s na instância axios compartilhada (D-01) — o timeout NÃO entra no retry de 429 porque um timeout não traz err.response; retentá-lo levaria o pior caso de UMA página de ~15s para ~60s
- [Phase 04]: 04-03: a instância axios NÃO é exportada (Q3) — o que sai de agendor.js é getDealById(id), função de domínio que propaga a falha; exportar a instância deixaria qualquer chamador sobrescrever o timeout por chamada
- [Phase 04]: 04-03: ponto órfão de routes/notifications.js:220 eliminado — zero ocorrências de axios em backend/src fora de agendor.js, e AGENDOR_TOKEN volta a ser lido em um único lugar (agendor.js:5)
- [Phase 04]: 04-03: prova do timeout por inspeção dos argumentos de axios.create (fakeAxios ganhou createArgs, extensão aditiva), não por espera real — o código de erro do axios num timeout é ECONNABORTED, não ETIMEDOUT
- [Phase 04]: 04-03: dealStatus pinado por asserção de VALOR no shape de /resolved — é o único campo que o frontend usa para o rótulo ganho/perdido, e a troca de envelope o perderia com a rota ainda respondendo 200
- [Phase 04]: 04-03: seam resolvedHandler criado no commit RED (estrutural, corpo idêntico) para que o vermelho isolasse o ponto órfão em vez de acusar só a ausência do seam
- [Phase 04]: 04-03: axios ^1.7.2 -> ^1.19.0 em commit isolado; npm audit do backend 12 (5 high) -> 9 (3 high); npm audit fix PROIBIDO e não usado (arrastaria 6 advisories sem-major do sec-02)
- [Phase 04]: 04-03: checkpoint C4 aprovado pelo usuário — lockfile sem contaminação; https-proxy-agent e agent-base são NOVOS e esperados (dependências diretas de axios@1.19.0)
- [Phase 04]: 04-03: desvio de processo registrado — git stash executado por engano na Task 2 e recuperado com git stash pop sem perda; refs/stash vazio e f41b56c íntegro (verificado pelo orquestrador)
- [Phase 04]: 04-04: os 3 timeouts de D-02 (10s/10s/30s) vivem na FÁBRICA createTransporter — 3 chaves cobrindo os 6 call-sites SMTP; repetir nos call-sites seriam 6 lugares para divergir
- [Phase 04]: 04-04: mock.timers.tickAsync NÃO existe no Node 20 (alvo do CI) nem no 22 — só a partir do v23; substituído pelo helper avancarRelogioAte (setImmediate real drena microtasks + tick avança o relógio). O 04-06 e o 04-07 NÃO devem copiar o tickAsync do 04-RESEARCH
- [Phase 04]: 04-04: o cenário de exaustão NÃO usa assert.rejects — sendMailWithRetry RESOLVE com { success:false } e é isso que D-03 manda preservar; erros injetados fiéis ao nodemailer (ESOCKET com mensagem read ECONNRESET, nunca code ECONNRESET)
- [Phase 04]: 04-04: emailer.js de 7,16% para 35,67% de linhas e 82,14% de branches; diff de produção com 14 adições e ZERO remoções — retry e console.warn legado intocados; nodemailer segue em 6.10.1 (bump é escopo do 04-05)
- [Phase 04]: 04-05: nodemailer ^6.9.13 (resolvido 6.10.1) -> ^9.0.4 em commit isolado de 2 arquivos e 5 linhas; lockfile com 1 entrada alterada, 0 adicionadas, 0 removidas (nodemailer tem zero dependencias); npm audit do backend 9 (3 high) -> 8 (2 high)
- [Phase 04]: 04-05: o major era OBRIGATORIO, nao opcional — GHSA-rcmh-qjqh-p98v (DoS no addressparser, HIGH) tem first_patched_version null na linha 6.x, ou seja, nao existe correcao dentro do 6.x
- [Phase 04]: 04-05: correcao ao 04-RESEARCH — a string NoAuth NAO vive so em lib/smtp-pool; em 6.10.1 esta tambem em lib/smtp-transport/index.js:390, dentro de verify(), que o projeto CHAMA. Veredito 'nao afeta' mantido por outra razao: o ramo exige options.forceAuth (nunca passado) e nenhum consumidor le err.code
- [Phase 04]: 04-05: ACHADO NOVO nao previsto pela pesquisa — o 8.0.0 introduziu fallback de conexao para enderecos DNS alternativos (_fallbackAddresses, inexistente no 6.x). connectionTimeout de 10s passa a valer POR ENDERECO resolvido na fase de conexao; nao quebra teste nem exige mudanca de codigo, mas afrouxa o teto de tempo de REL-02 — item para a Fase 5
- [Phase 04]: 04-05: as 3 opcoes de timeout de D-02 (connectionTimeout/greetingTimeout/socketTimeout) e o _formatError sao IDENTICOS entre 6.10.1 e 9.0.4 — a mudanca do 04-04 sobrevive ao major sem tocar uma linha
- [Phase 04]: 04-05: 9.0.4 confirmada e fallback ^9.0.3 NAO acionado — o delta 9.0.3->9.0.4 e todo em mime-funcs/mime-node, caminho que este projeto exercita com assuntos em emoji e acento
- [Phase 04]: 04-05: engines do nodemailer 9.0.4 verificado ANTES do install — node >=6.0.0, identico a 6.10.1 e compativel com o Node 20 do CI (D-09)
- [Phase 04]: 04-06: a linha do notification_log nasce 'pending' e so vira 'sent' com >= 1 destinatario confirmado — um crash no meio do envio deixa a linha nao-deduplicante e portanto retentavel amanha (REL-05/Q1)
- [Phase 04]: 04-06: sucesso parcial mantem 'sent' com o erro do destinatario que falhou preservado na coluna error — classificar o parcial como 'error' faria quem JA recebeu receber de novo amanha (risco R-11)
- [Phase 04]: 04-06: o caminho de excecao ATUALIZA a linha existente via updateNotificationStatus em vez de inserir uma segunda — logNotification em scheduler.js caiu de 3 para 2 ocorrencias (import + unica chamada)
- [Phase 04]: 04-06: alreadyNotifiedToday passa a refletir so envios confirmados; getNotificationStats/getNotifiedDealIds/getNotifiedDeals devolvem numeros MENORES e isso e o conserto, nao regressao — zero mudanca de frontend (o ternario ja trata status !== 'sent')
- [Phase 04]: 04-06: POST /api/notifications/test-card e o terceiro escritor de 'sent' pre-envio e ficou FORA por decisao humana (contrato §11 + rollback atomico) — registrado no todo rel-05b-test-card-status
- [Phase 04]: 04-06: nenhuma migracao de dados — a informacao que reclassificaria as linhas historicas nunca foi gravada e a dedup e por data, com as datas ja passadas
- [Phase 04]: 04-06: no teste, um id de deal por cenario em vez de limpar a tabela — a dedup do proprio SUT acopla os casos de forma ASSIMETRICA entre o estado antes e o depois da correcao, e um id unico produziria um RED ilegivel
- [Phase 04]: 04-07: orgCategoryCache limpo por delete de chave na PRIMEIRA instrucao de getStaleDeals — reatribuir bifurcaria a referencia lida por getOrgCategory e pela leitura direta de :195, e EXCLUDED_CATEGORIES.includes(undefined) devolveria organizacoes excluidas a lista de notificacao (REL-04/D-05)
- [Phase 04]: 04-07: limpeza por execucao e nao TTL — um TTL mudaria o FORMATO do valor guardado de string para objeto e quebraria a leitura direta de :195, mesmo desfecho da reatribuicao; o Map de escopo de execucao segue adiado para a Fase 7
- [Phase 04]: 04-07: o null que o catch de getOrgCategory cacheia deixou de sobreviver a execucao — um blip de rede em UMA consulta derrubava a exclusao daquela organizacao em todas as rodadas seguintes do processo
- [Phase 04]: 04-07: eficiencia provada por CONTAGEM de urls /organizations/ em fake.get.mock.calls (6 orgs unicas, sem repeticao), nao por inspecao — a limpeza por execucao nao multiplicou chamadas dentro da rodada
- [Phase 04]: 04-07: no teste, o caso que mede contagem de chamadas vem PRIMEIRO porque exige cache frio; e o cenario do null-de-erro exigiu um deal sintetico com organizacao nova, porque no estado RED uma consulta ja cacheada nem chega a ser tentada e portanto nem chega a falhar (o teste ficaria verde onde se espera vermelho)
- [Phase 04]: 04-09: CR-02 fechado — console.error(err) de routes/deals.js virou logger.error com contexto + err.message; o AxiosError carregava config.headers.Authorization e o stream do PM2 persiste em /opt/agendor/logs/pm2-error.log
- [Phase 04]: 04-09: a prova da sanitizacao de log e COMPORTAMENTAL (espiao no logger + util.inspect de todos os argumentos + token sintetico), nao estatica — os greps sao sinal auxiliar e o SUMMARY nao lhes atribui garantia que nao tem
- [Phase 04]: 04-09: WR-03 fechado nos DOIS lados — guarda Number.isInteger(dealId) && dealId > 0 em getDealById antes de qualquer requisicao HTTP, e Number.parseInt no /test-card; afinidade INTEGER sem STRICT nao e validacao
- [Phase 04]: 04-09: Number(id) e nao parseInt em getDealById — a normalizacao precisa aceitar a string numerica que o SQLite devolve e recusar '101abc'; caso 4 do teste pina getDealById('101') -> /deals/101
- [Phase 04]: 04-09 [C8, decisao vinculante do usuario, 2026-08-04]: NAO rotacionar o AGENDOR_TOKEN neste momento. SEC-01 permanece ABERTO como RISCO CONSCIENTEMENTE ACEITO — nao marcado como resolvido em nenhum artefato. O token em backend/.env nao foi alterado, lido nem exibido
- [Phase 04]: 04-09: higiene local do C8 executada (token redigido no unico arquivo de ~/.claude que o continha; logs/error.log e logs/access.log com 0 ocorrencias) — isso REDUZ copias adicionais mas NAO elimina a exposicao historica do Git no repo publico e NAO encerra SEC-01
- [Phase 04]: 04-09: checkpoint C8 aprovado pelo usuario — entrada no plano 04-10 autorizada
- [Phase 04]: 04-10: a correcao sugerida pelo 04-REVIEW (houveEnvioConfirmado atribuido DEPOIS do await) NAO resolveria WR-01 — se sendStaleNotification lanca, aquela linha nunca executa; a informacao precisa ATRAVESSAR a excecao, entao o resultado parcial viaja anexado ao proprio erro relancado
- [Phase 04]: 04-10: o try de emailer.js envolve APENAS os dois blocos de envio — createTransporter/from/subject ficam FORA para que a fabrica inicial continue lancando sem parcial e o cenario Q1-2 nao mude de significado; a excecao segue relancada sem alterar mensagem nem tipo (D-03)
- [Phase 04]: 04-10: houveEnvioConfirmado governa o status gravado nos DOIS caminhos (retorno e excecao) — uma excecao apos envio confirmado mantem 'sent' e a dedup protege quem ja recebeu, em vez de reenviar amanha (WR-01)
- [Phase 04]: 04-10: results.notified++ movido para DENTRO do ramo 'sent' — contador e status gravado viram um unico ponto de verdade; uma falha total deixa de reportar envio no logger.info e na UI (WR-04)
- [Phase 04]: 04-10: WR-05 fechado por asseracao de PRE-CONDICAO sobre fake.get.mock.calls contendo '/users' (rota do plano) e nao por espiao no logger — nao acopla o teste ao formato da mensagem de log; os dentes foram verificados por mutacao temporaria do early-return, revertida antes do commit

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

- `sec-01-rotate-agendor-token` (**alta prioridade**, → ação operacional) — token real da API Agendor exposto no histórico do repositório **público**, commit `13905d4` (`.claude/settings.local.json` e `backend/.env.example`). Rotação adiada por decisão consciente em 2026-07-29 para preservar o gate de CI-02. Reescrever histórico NÃO resolve; tornar privado quebra a branch protection (testado). Só a rotação no painel da Agendor encerra a exposição.
  **Reafirmado no C8 (2026-08-04, decisão vinculante do usuário): NÃO rotacionar por ora — SEC-01 permanece ABERTO como risco conscientemente aceito.** O 04-09 fechou o caminho **futuro** de gravação do token em disco (`console.error(err)` de `routes/deals.js` → `pm2-error.log`) e a higiene local removeu a única cópia adicional encontrada em `~/.claude`, com `logs/*.log` a 0 ocorrências. Nada disso elimina a exposição histórica do Git nem encerra este todo.

- `sec-02-dependency-vulnerabilities` (**alta prioridade**, → Phase 4, **escopo D-06 CONCLUÍDO**) — **o 04-03 fechou a metade `axios` e o 04-05 fechou a metade `nodemailer`**: `axios` ^1.7.2 → ^1.19.0 (saíram `axios`, `form-data`, `follow-redirects`) e `nodemailer` ^6.9.13 → **^9.0.4** (saiu `nodemailer` com seus 4 advisories). Backend: **12 (5 high) → 9 (3 high) → 8 (2 high)**, exatamente o previsto. **Zero high/critical restante é atribuível a `axios` ou `nodemailer`.** Os 8 remanescentes estão listados nominalmente com GHSA no próprio arquivo do todo. O restante (`path-to-regexp`, `morgan`, `qs`/`express`, `body-parser`, `brace-expansion`, `uuid`/`node-cron`, e o `vite` 5→8 do frontend) **segue pendente e fora da Fase 4** por decisão D-06. Estado original medido em 2026-07-30: 12 advisories no backend (5 high) e 4 no frontend (2 high, todas devDependencies). As três que importam: `nodemailer` (e-mail para domínio não intencionado + injeção SMTP), `axios` (SSRF + bypass de auth) e `path-to-regexp` (ReDoS nas rotas). O CI **não roda `npm audit`** — nada detecta isso hoje. Corrigir em duas levas: as sem major primeiro, depois `nodemailer` 6→9 e `node-cron` 3→4 com teste do novo fluxo.

- `ops-01-validar-env-e-pm2-no-primeiro-deploy` (**alta prioridade**, → Phase 8) — **não existe servidor de produção nem deploy em `/opt/agendor`; o projeto roda só localmente** (confirmado pelo usuário em 2026-07-30). Por isso o checkpoint da Task 1 do 03-02 foi registrado como N/A, não bloqueado. Quando houver servidor, validar as 5 variáveis obrigatórias no `.env` e o `cwd` do PM2 antes do primeiro boot com fail-fast ligado. Dois riscos herdados: `SMTP_PASS` não tem mais recuperação pela UI, e um eventual `/opt/agendor/.env` órfão deixou de valer após a correção do 03-01.

Triagem do `04-REVIEW.md` registrada no 04-09 (achados reconhecidos e deliberadamente fora da Fase 4):

- `in-04-escape-html-no-test-card` (**alta prioridade**, → Phase 5+) — `routes/notifications.js:67-83` passa `title`/`organization`/`ownerName`/`dealId` do corpo da requisição para `emailer.js:117,158,164`, que os interpola **sem escape** (inclusive dentro de um `href`). Um usuário autenticado envia HTML arbitrário para qualquer e-mail com a identidade visual da empresa. Fora da Fase 4 porque a correção mexe no template, declarado inalterado pelo contrato.
- `in-01-status-pending-na-ui` (média, → fase de UI) — o status `'pending'` do 04-06 renderiza como falha (X vermelho) em `NotificationHistory.jsx:306`.
- `in-02-seams-fora-do-module-exports` (baixa) — 4 seams de teste anexados fora do bloco `module.exports` único que o `CLAUDE.md` exige.
- `in-03-comentario-emailer-timeout` (baixa) — comentário de `emailer.timeout.test.js:310-311` afirma um alarme por lentidão que o `node --test` não dá.
- `cr-02b-console-error-objeto-completo-em-index` (baixa, → Phase 5 com LOG-01/LOG-02) — `index.js:107` despeja o objeto de erro, mas guardado por `NODE_ENV !== 'production'`; não escreve o token no `pm2-error.log`.

Resolvidos e arquivados em `.planning/todos/completed/`:

- ~~`wr-02-cover-getdealswithfuturetasks`~~ — fechado em 02-01
- ~~`wr-03-enforce-coverage-thresholds`~~ — fechado em 02-03

### Blockers/Concerns

[Issues that affect future work]

- Node.js não está instalado no sistema (binários em `/tmp`, wrappers em `~/bin`); considerar ao configurar test runner/CI localmente
- ~~Frontend e backend têm `package.json` separados (sem workspaces); toolchain (Phase 2) precisa cobrir os dois~~ — resolvido na Phase 2 (Biome na raiz + 2 jobs de CI com cache por lockfile)
- Token do `gh` precisou do escopo `workflow` para publicar `.github/workflows/` (concedido em 2026-07-29). Clone/máquina novos vão esbarrar nisso: `gh auth refresh -h github.com -s workflow`. Registrar no runbook de onboarding da Phase 8.
- ~~PR #1 (`chore/production-readiness`) aberto~~ — **mesclado na `main` em 2026-07-29** (merge commit `2d1857f`, 64 commits, merge commit e não squash para preservar os hashes citados nos SUMMARYs). Branch de origem apagada local e remotamente.
- **Push direto na `main` agora é RECUSADO** (`enforce_admins: true`). Todo trabalho exige branch + PR com `backend`/`frontend` verdes. Branch de trabalho da Phase 3: `chore/phase-03-config-segredos`.
- **O repositório PRECISA continuar público para o gate existir.** Conta pessoal free: repo privado retorna `403 Upgrade to GitHub Pro` tanto na branch protection clássica quanto em rulesets. Testado e revertido em 2026-07-29. Tornar privado = perder CI-02.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260724-lea | Fix WR-01: neutralizar SMTP_PASS/ADMIN_EMAIL no setup de testes | 2026-07-24 | cd050e1 | [260724-lea-fix-wr-01-neutralize-smtp-pass-and-admin](./quick/260724-lea-fix-wr-01-neutralize-smtp-pass-and-admin/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-04T22:29:17.400Z
Stopped at: Completed 04-09-PLAN.md — CR-02/WR-03 fechados; C8 aprovado; SEC-01 aceito em aberto (sem rotacao), entrada no 04-10 autorizada
Resume file: None
