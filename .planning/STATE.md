---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: 04-22 COMPLETO — WR3-01 FECHADO (as cinco bordas do modulo sob a mesma politica de retry)
stopped_at: Completed 04-22-PLAN.md
last_updated: "2026-08-05T06:05:00.000Z"
last_activity: 2026-08-05 -- 04-22 completo (WR3-01: /users e /deals/:id no fetchWithRetry); suite 160 -> 164
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 43
  completed_plans: 38
  percent: 38
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-22)

**Core value:** Rede de testes automatizados sobre a lógica crítica de notificação (quem recebe / quem não recebe) — para nunca mais uma regressão silenciosa.
**Current focus:** Phase 04 — confiabilidade-das-integra-es

## Current Position

Phase: 04 (confiabilidade-das-integra-es) — gap closure r3 EM EXECUCAO
Plan: 22 de 27 executados (04-01..04-22). Faltam 04-23..04-27 (gap closure r3).
Status: 04-22 COMPLETO — WR3-01 FECHADO (as cinco bordas do modulo sob a mesma politica de retry)

  O 04-22 fechou WR3-01, o primeiro achado INDEPENDENTE da rodada 3 (CR3-01 ja estava
  fechado nos tres caminhos pelos 04-19/20/21). O comentario da politica em agendor.js abria
  com "Politica UNICA de retry da borda Agendor" e explicava que duplicar a regra criaria "um
  segundo lugar para ela divergir" — enquanto o helper cobria DUAS das CINCO chamadas do
  modulo. /users e /deals/:id ficavam de fora nao por decisao registrada, mas por OMISSAO.
  AGORA: `await api.get(` em linhas nao-comentario de agendor.js = ZERO. As cinco bordas
  (/deals em fetchDealsPage, /tasks em getDealsWithFutureTasks, /organizations/:id em
  getOrgCategory, /users em getUsers, /deals/:id em getDealById) passam pelo MESMO
  fetchWithRetry — medido: `fetchWithRetry(` = 6 (a definicao mais as cinco), `api.get(` = 5
  (nenhuma borda nova nem removida).
  O COMENTARIO PASSOU A ENUMERAR AS BORDAS, com o ponto de chamada de cada uma. Isso e o
  conserto do achado tanto quanto as duas linhas de codigo: enquanto o bloco dizia apenas
  "unica", o proximo leitor nao ia procurar as que faltavam — foi assim que WR3-01 nasceu.
  Quem acrescentar uma sexta borda acrescenta uma linha na lista, ou deixa a lista mentindo
  de forma VISIVEL. `grep -c organizations` em agendor.js foi de 1 para 2.
  /users e o caso MAIS CARO das tres que faltavam: esta no mesmo Promise.all que runCheck usa
  como pre-requisito de tudo, entao a rejeicao aborta a rodada ANTES do laco de envio — zero
  negocios processados, zero e-mails, vestigio so em results.error. Com o cron diario, 24h de
  silencio por um rate limit de segundos.
  A GUARDA DE TIPO DO ID (WR-03) CONTINUA FORA DO CALLBACK, de proposito (D-WR3-01-b):
  passar pelo helper da RETENTATIVA, nao da PERMISSAO. Dentro do callback, `'../users'` sairia
  TRES vezes pela instancia compartilhada, com o AGENDOR_TOKEN no header, em vez de nenhuma.
  Medido: Number.isInteger(dealId) = 1 e dealId.validation.test.js verde SEM edicao.
  OS DOIS CENARIOS SIMETRICOS EXIGIDOS PELA RODADA EXISTEM E ESTAO NOMEADOS, e cobrem
  direcoes OPOSTAS da mesma borda: caso (6) — a exaustao ainda PROPAGA com 3 requisicoes, de
  modo que estender a politica nao virou "engolir o erro" e produzir dicionario parcial (a
  classe de falha que a Decisao Q2 recusou para as tarefas futuras); caso (7) — o timeout
  ainda rejeita na PRIMEIRA requisicao, de modo que estender a politica a uma borda nova nao
  alargou, de carona, a politica em si (retentar timeout levaria o pior caso de ~15s para
  ~60s, comendo a janela do cron que D-01 protege).
  DIVERGENCIA MEDIDA E REGISTRADA (o unico numero que nao bateu ate aqui na rodada): o plano
  previa RED de `1 !== 2` nos casos (5) e (8); o medido e uma falha ANTERIOR — a promessa
  REJEITA com o 429 cru (testCodeFailure, stack em getUsers/getDealById) e a asseracao de
  contagem nunca e alcancada. `1 !== 2` seria o desfecho de um fail-OPEN (dicionario parcial),
  que e o defeito de CR3-01, ja fechado. O defeito de WR3-01 nunca foi protecao parcial: era
  AUSENCIA DE REDE antes de a falha virar explicita. Valor medido registrado, numero do plano
  NAO forcado.
  TODOS os demais criterios numericos bateram. Diff de codigo em agendor.js = EXATAMENTE os 2
  pontos de chamada (todo o resto do diff e comentario); 0 asseracoes removidas ou alteradas
  no diff do arquivo de teste; `simetrico` = 4 ocorrencias; `^test(` = 8. Suite 160 -> 164,
  cobertura de agendor.js em 89,53% linhas / 86,72% branches, lint exit 0 (44 warnings).
  ZERO DESVIOS: nenhuma Rule 1-4 acionada, nenhum pacote instalado.
  ESCOPO QUE O 04-22 NAO FECHA: a paginacao NAO ganhou teto de paginas — getUsers continua
  com while(true) dependendo de data.links?.next. Isso e WR3-06, do 04-25, e antecipa-lo aqui
  misturaria duas correcoes num commit. getStaleDeals, getOrgCategory,
  getDealsWithFutureTasks, shouldNotifyOwner, isExcludedStage, getDealType e o module.exports
  ficaram byte a byte; o arquivo nao foi reordenado. O console.log legado de
  getDealsWithFutureTasks continua la (LOG-01, Fase 5).
  ATENCAO para quem seguir: as cinco bordas agora dependem do MESMO helper, entao qualquer
  mudanca em fetchWithRetry passa a ter cinco consumidores — e o caso (7) de
  agendor.retry429.test.js e o alarme que dispara se a condicao de 429 for alargada.

  O 04-21 fechou o CAMINHO VIZINHO de CR3-01, e com ele o achado inteiro. O 04-20 fechou o
  envio DIARIO e o negocio indecidivel voltava pela SEXTA-FEIRA: sendOwnerWeeklySummary e o
  SEGUNDO (e ultimo) produtor de e-mail dirigido ao responsavel e le a mesma lista de
  getStaleDeals. O RED registrou a prova operacional em tres linhas do proprio SUT —
  "[Emailer] Relatorio semanal enviado para Fulana Silva — 2 card(s)" numa lista de dois
  negocios em que UM e indecidivel (o card que runCheck se recusa a enviar desde o 04-20 saia
  pela sexta com o mesmo peso de um card legitimo), e "1 card(s) ignorado(s) por funil"
  ao lado, mostrando que o precedente ja anunciava a sua propria supressao em voz alta.
  AGORA: o filtro de sendOwnerWeeklySummary tem DOIS PASSOS separados. O primeiro
  (shouldNotifyOwner) devolve doFunilNotificavel e alimenta skippedByFunnel — que continua
  significando exatamente o que o nome diz, medido em 3 linhas nao-comentario antes E depois.
  O segundo remove !d.categoriaIndecidivel, tem contagem propria
  (ignoradosPorCategoriaNaoConsultada, com C maiusculo DE PROPOSITO para que o criterio
  grep -c "categoriaIndecidivel" meca so o predicado) e emite logger.warn com tag [Emailer]
  carregando APENAS um inteiro — nenhum objeto de erro, nenhuma credencial.
  AS DUAS METADES DA DECISAO DO USUARIO ESTAO MEDIDAS: fora do e-mail INDIVIDUAL (cenarios 1,
  2 e 4, com asseracao sobre o HTML enviado, nao so sobre a contagem) E dentro do CONSOLIDADO
  DO ADMIN (cenario 3, que chama sendWeeklySummary e assere o titulo no HTML do admin). Se
  alguem "harmonizar" as duas funcoes aplicando o filtro nas duas, e o cenario 3 que fica
  vermelho. sendWeeklySummary, weeklySummaryHtml, buildOwnerBlocks e ownerWeeklyHtml ficaram
  BYTE A BYTE (grep weeklySummaryHtml no diff = 0).
  O CENARIO SIMETRICO EXIGIDO PELA RODADA EXISTE E ESTA NOMEADO: cenario (2) de
  emailer.resumoIndecidivel.test.js — exclusao TOTAL. O (1) prova que o filtro tira o card
  certo; o (2) prova que ele nao produz o defeito do lado oposto, um e-mail "Seus 0 cards
  parados". Quem impede isso e a saida antecipada JA EXISTENTE, que nao foi tocada
  (D-CR3-01-o). O cenario (4) impede o filtro novo de SUBSTITUIR o antigo: normal + Beefor +
  indecidivel entram, so o normal sai.
  TODOS os criterios de aceite numericos BATERAM: categoriaIndecidivel nao-comentario = 1,
  skippedByFunnel = 3 antes e 3 depois, require('./logger') = 1, logger.warn = 1.
  LOG-01 NAO FOI ANTECIPADO: console.* nao-comentario em emailer.js = 4 ANTES e 4 DEPOIS. As
  linhas legadas continuam la; migra-las e a Fase 5.
  Diff de 25 insercoes e 2 remocoes — e as 2 remocoes sao exatamente as duas linhas
  reescritas. Suite 156 -> 160, cobertura de emailer.js em 89,42% linhas / 63,63% branches.
  ZERO DESVIOS: nenhuma Rule 1-4 acionada.
  ESCOPO QUE O 04-21 NAO FECHA: as rotas test-owner-summary e send-owner-summaries herdaram o
  filtro DE GRACA (chamam a mesma funcao) e nao foram editadas. runCheckOnly, routes/deals.js
  e routes/reports.js seguem sem filtrar por categoria, de proposito. getUsers e getDealById
  seguem fora do retry da borda: escopo do 04-22 (WR3-01).

  O 04-20 fechou a SEGUNDA metade de CR3-01. O 04-19 produziu a informacao na borda e
  NINGUEM a lia: com a borda ja corrigida, runCheck continuava enviando e-mail para um
  negocio cuja categoria de organizacao nao pode ser consultada. O RED registrou a prova
  operacional em DUAS linhas do proprio SUT — o logger.warn do 04-19 dizendo que o negocio
  "fica FORA do envio" e, quatro linhas depois, "Concluido: 2 negocios parados, 2
  notificacoes enviadas" numa rodada de 2 negocios.
  AGORA: uma guarda no laco de runCheck, DEPOIS da dedup e ANTES da guarda de funil, com a
  mesma forma das vizinhas (skipped, skipReason em PT-BR, results.skipped++, push, continue).
  Diff de 20 insercoes e ZERO remocoes — nenhuma linha existente foi tocada.
  AS DUAS METADES DA DECISAO DO USUARIO ESTAO MEDIDAS: fora do envio (zero sendMail e zero
  linhas no notification_log para o indecidivel) E dentro do painel (r.deals.length === 2,
  com skipped: true e skipReason nao vazio). A rota REJEITADA (abortar a rodada) nao foi
  implementada: r.error === undefined asserido nas duas ordens.
  O CENARIO SIMETRICO EXIGIDO PELA RODADA EXISTE E ESTA NOMEADO: cenario B de
  scheduler.categoriaIndecidivel.test.js — a mesma falha na ORDEM INVERSA (2o negocio em vez
  do 1o). E ele que separa "a guarda funciona" de "a guarda funciona porque o negocio afetado
  calhava de ser o primeiro da lista". O cenario C (rodada sa, 2 notificados, 4 envios)
  impede a guarda de virar filtro largo demais.
  TODOS os criterios de aceite numericos BATERAM: categoriaIndecidivel nao-comentario = 1,
  results.notified++ = 2, catch (erroDeRegistro) = 1, Array.isArray(err?.resultadosParciais)
  = 1, skipReason = 2, logNotification( = 1. Os 6 arquivos vizinhos verdes SEM edicao.
  NUMERO QUE MUDOU e NAO e regressao: `continue;` nao-comentario em scheduler.js foi de 2
  para 3. A proibicao de continue novo (D-CR3-01-e) valia para agendor.js no 04-19, onde
  acrescentar um significaria REMOVER o negocio da lista. Aqui o continue pula o bloco de
  ENVIO e o push da propria guarda mantem o negocio no resultado.
  ZERO DESVIOS: o plano foi executado exatamente como escrito; nenhuma Rule 1-4 acionada.
  ESCOPO QUE O 04-20 NAO FECHA: emailer.js intocado. sendOwnerWeeklySummary e o SEGUNDO (e
  ultimo) produtor de e-mail dirigido ao responsavel e le a mesma lista de getStaleDeals —
  sem o 04-21 o negocio indecidivel volta pela sexta-feira e CR3-01 NAO esta fechado.
  runCheckOnly, routes/deals.js e routes/reports.js seguem sem filtrar por categoria, de
  proposito (superficie de visualizacao). getUsers e getDealById seguem fora do retry: 04-22.

  O 04-19 fechou a primeira metade de CR3-01, o BLOCKER da rodada 3. O unico filtro de
  elegibilidade que dependia de uma segunda chamada HTTP falhava na direcao INSEGURA:
  `catch { cache.set(orgId, null); return null }` mais `EXCLUDED_CATEGORIES.includes(null)
  === false` fazia uma organizacao 'Parceiro' ser notificada por um 429 transitorio, com
  results.error undefined e notification_log em 'sent'.
  AGORA: /organizations/:id esta dentro da politica UNICA de retry (medido: 3 tentativas no
  429 persistente, 2 no transitorio, 1 no erro sem response — a politica de D-01 nao mudou),
  e a exaustao grava a sentinela CATEGORIA_INDECIDIVEL, que getStaleDeals traduz em
  categoriaIndecidivel: true + orgCategory: null.
  DECISAO DO USUARIO RESPEITADA POR MEDICAO: o negocio PERMANECE na lista — `continue;` em
  linhas nao-comentario de agendor.js e 5 antes e 5 depois. A rota rejeitada (abortar a
  rodada) NAO foi implementada.
  O CENARIO SIMETRICO EXIGIDO PELA RODADA EXISTE E ESTA NOMEADO: caso (2) de
  agendor.categoriaIndecidivel.test.js — a organizacao 201 ('Lead', ELEGIVEL) sofre a mesma
  falha e tambem fica indecidivel. O fail-safe NAO e seletivo, e o custo (um negocio elegivel
  fora do envio no dia da falha, de volta na rodada seguinte) esta pinado por asseracao.
  A ASSERCAO QUE RATIFICAVA O FAIL-OPEN morreu: `idsComFalha.includes(305), true` em
  agendor.cacheInvalidation.test.js virou presenca + categoriaIndecidivel === true. A prova de
  isolamento de REL-04 da 2a execucao ficou intacta.
  INFERENCIA DO PLANO CONFIRMADA POR MEDICAO: a entrada do retry NAO mudou a contagem de
  consultas dos dois arquivos de cache (as falhas injetadas la sao Error sem response,
  portanto fora do ramo de 429) — `urlsDeOrganizacao.length === 6` e
  `consultas205NoEspelho === 2` seguem verdes sem edicao.
  TODOS os criterios de aceite numericos deste plano BATERAM — diferente de 04-15/16/17, onde
  varios eram aritmeticamente impossiveis por medirem o arquivo inteiro.
  DESVIO Rule 1 (commit proprio, 806b83a): o comentario do cacheDaExecucao em getStaleDeals
  ainda citava o `null` que o proprio plano acabara de remover — corrigido, diff exclusivamente
  de comentario (0 linhas nao-comentario).
  DIVIDA NOMEADA: o NOME do caso (3) de cacheInvalidation continua dizendo `null`. NAO
  renomeado de proposito (precedente do 04-18: nome de caso e string e oraculo citado por
  outros artefatos). O corpo do caso ja descreve o contrato novo.
  ESCOPO QUE O 04-19 NAO FECHA: scheduler.js e emailer.js intocados — quem deixa de ENVIAR e o
  04-20 (runCheck) e o 04-21 (sendOwnerWeeklySummary). Ate o 04-20 entrar, o comportamento
  observavel de envio e o de hoje, EXCETO pelo retry, que sozinho ja elimina o caso dominante.
  getUsers e getDealById seguem FORA do retry: escopo do 04-22 (WR3-01).

  --- contexto do planejamento da rodada 3 ---
Status do planejamento: 9 PLANOS DA R3 CRIADOS E VERIFICADOS (2026-08-05)

  Planos 04-19..04-27, waves 12-20, cadeia estritamente sequencial, TODOS autonomous:true —
  nenhum checkpoint bloqueante nesta rodada, porque os trade-offs ja foram decididos em
  C8, C9, C10, C11 e nas decisoes de 2026-08-05.
  04-19 CR3-01 (1/3: retry em /organizations + sentinela CATEGORIA_INDECIDIVEL)
  04-20 CR3-01 (2/3: runCheck nao envia para indecidivel, sem abortar a rodada)
  04-21 CR3-01 (3/3: resumo semanal individual — caminho que NENHUMA das 3 rodadas de review nomeou)
  04-22 WR3-01 | 04-23 WR3-02 | 04-24 WR3-03 | 04-25 WR3-06
  04-26 WR3-04+WR3-05+WR3-07 | 04-27 IN3-01..IN3-08 como todos + Success Criteria 7
  Plan-checker: VERIFICATION PASSED apos 2 revisoes. Cobertura REL-01..06 = 6/6.

  REQUISITO ESTRUTURAL DESTA RODADA: todo plano de correcao inclui teste do cenario SIMETRICO,
  nomeado por escrito, ou justificativa medida da ausencia. Foi criado para quebrar o padrao
  que reabriu esta fase tres vezes (o achado fecha, o vizinho fica aberto).

  ACHADO DE MEDICAO DO PLANEJADOR (04-26, D-WR3-07-c): as 7 variaveis restantes de
  agendor.cacheConcurrency.test.js (liberar210, liberar205DaExecucaoB, chamadas205,
  chamadasDealsNoEspelho, liberarDealsDaExecucaoB, falhar205DaExecucaoA, consultas205NoEspelho)
  NAO sao estado de cenario — sao estado de ARMACAO: armam pontos de suspensao UMA vez e sao
  consumidos ao longo da ordem declarada dos casos. Um beforeEach que as reseta faz os casos
  (2) e (3) NAO TERMINAREM ("Promise resolution is still pending but the event loop has already
  resolved"). Medido, nao argumentado. Por isso o escopo do 04-26 em cacheConcurrency e
  deliberadamente estreito (so cenarioAtivo), com gate anti-expansao, e o resto virou o todo
  wr3-07b-estado-de-armacao-em-cacheconcurrency (conserto correto: escopar a armacao por caso,
  o que e redesenho do arquivo).

  CORRECAO DE FATO: a linha 169 de agendor.cacheInvalidation.test.js (orgQueFalha = null;) NAO e
  restauracao de fim de cenario — e o passo do MEIO do cenario (3), onde a API volta a responder
  antes da segunda execucao. Um relatorio de verificacao anterior errou nisso; a acao do 04-26
  agora PROIBE remove-la e o gate de valor 3 detecta se alguem o fizer.

  --- contexto da reabertura ---
Origem: CODE REVIEW RODADA 3 (2026-08-05)

  O 04-REVIEW.md (round: 3, 16 arquivos, standard) achou 1 BLOCKER, 7 warnings e 8 info
  sobre o codigo do gap closure r2. As rodadas 1 e 2 estao preservadas em 04-REVIEW-r1.md
  e 04-REVIEW-r2.md. Suite em 148/148 e lint exit 0 — os testes NAO acusam o blocker.

  PADRAO PELA TERCEIRA VEZ: dos 7 achados da r2, so 2 fecharam limpos (WR2-01, WR2-06).
  CINCO fecharam o cenario que o teste novo exercita e deixaram o VIZINHO aberto:
  CR2-01 -> CR3-01 | WR2-02 -> WR3-02 | WR2-04 -> WR3-03 | WR2-03 -> WR3-05 | WR2-05 -> IN3-07

  CR3-01 (BLOCKER): a exclusao por categoria falha ABERTA. getOrgCategory engole o erro e
  devolve null; EXCLUDED_CATEGORIES.includes(null) e false. /organizations/:id e a UNICA
  borda Agendor fora do fetchWithRetry — e a que faz N requisicoes por rodada. Um unico 429
  transitorio faz uma organizacao 'Parceiro' (categoria EXCLUIDA) receber e-mail, com
  results.error undefined, log dizendo "1 notificacoes enviadas", UI em ✅ e notification_log
  em 'sent'. Notificacao indevida, SILENCIOSA, sem vestigio. Reproduzido deterministicamente.
  O comportamento e pre-existente, mas a FREQUENCIA DE EXPOSICAO foi multiplicada por
  REL-04/CR2-01: antes a categoria era memoizada pelo tempo de vida do processo; depois do
  04-07 e do 04-12 toda rodada reconsulta todas as organizacoes. O preco do isolamento entre
  execucoes — que era correto e necessario — nunca foi nomeado em nenhum plano.
  AGRAVANTE: agendor.cacheInvalidation.test.js:163-164 assere o fail-open COMO CONTRATO
  (idsComFalha.includes(305) === true). Existe uma asseracao que fica VERMELHA quando alguem
  conserta o defeito. Ela precisa ser reescrita junto com a correcao.

  DECISAO DO USUARIO sobre CR3-01 (vinculante, 2026-08-05) — ROTA "INDECIDIVEL":

  1. Colocar /organizations/:id na politica UNICA de retry da borda (fetchWithRetry), como
     ja fazem /deals e /tasks.

  2. Se ainda assim falhar, o deal e marcado INDECIDIVEL: fica FORA do envio, mas PERMANECE
     no dashboard e nos relatorios, com logger.warn nomeando a organizacao.
  NAO abortar a rodada inteira por uma organizacao inatingivel — preserva o fail-safe sem
  custar a rodada. O cenario (3) de agendor.cacheInvalidation.test.js deve ser reescrito para
  asserir o novo contrato, e um caso novo deve pinar "429 em /organizations -> nenhum e-mail
  para a organizacao excluida", com contagem de tentativas.

  DECISAO DO USUARIO sobre o escopo (2026-08-05): planejar a gap closure r3 COMPLETA
  (blocker + warnings), nao apenas o blocker.

  DECISAO DO USUARIO sobre o RESUMO SEMANAL INDIVIDUAL (vinculante, 2026-08-05) — plano 04-21:
  o planejador achou um caminho que NENHUMA das tres rodadas de review nomeou:
  sendOwnerWeeklySummary e o SEGUNDO (e ultimo) produtor de e-mail dirigido ao responsavel e le
  a mesma lista de getStaleDeals — fechar so o runCheck deixaria o negocio 'Parceiro' voltar pela
  sexta-feira. POLITICA APROVADA: o negocio INDECIDIVEL sai do e-mail INDIVIDUAL do responsavel,
  mas PERMANECE no consolidado do admin e no snapshot. Mesmo tratamento que o filtro do funil
  Beefor ja recebe no mesmo bloco de codigo. O plano 04-21 fica como esta.

  RESSALVA DO REVISOR: WR3-02 NAO esta coberto pela decisao C10 — o custo dele e a rodada
  INTEIRA, nao uma linha reenviavel.

  Desvios que o revisor CONFIRMOU como aceitaveis: o duplo teste de houveEnvioConfirmado
  (cenario A pina o ramo verdadeiro, E pina o falso — so o comentario cita o oraculo errado)
  e a ordem de avancarRelogioAte (o snippet do review travaria a suite). Discordou em parte
  do desvio 4: a mensagem de asseracao da linha 247 nao e oraculo e PODE ser corrigida.

  --- historico da execucao dos 18 planos abaixo ---
  O 04-18, ULTIMO da fase, fechou WR2-06 e registrou os 4 achados Info da rodada 2.
  WR2-06: o review conferiu 7 referencias por numero de linha; a VARREDURA MEDIDA achou
  53 no escopo obrigatorio — 12 em backend/src e 41 nos arquivos de teste do gap closure.
  Todas nasceram erradas: os proprios blocos de 15 a 25 linhas empurraram o codigo para
  baixo dentro do commit que escreveu o comentario.
  Depois: backend/src = 0; testes do gap closure = 2. Diff de TODOS os .js verificado por
  contagem: 0 linhas nao-comentario. Suite 148/148, lint exit 0.
  DOIS ARQUIVOS DE PRODUCAO que a tabela do review NAO citava entraram no diff: config.js
  ("src/index.js:1") e um SEGUNDO ponteiro em routes/deals.js ("ecosystem.config.js:20",
  que virou "a chave error_file"). A lista de arquivos saiu da MEDICAO, nao da lista files
  do plano (5 previstos, 12 reais).
  AS 2 QUE FICARAM, e por que: scheduler.resilience.test.js linhas 190 e 247 — um NOME DE
  CASO e uma MENSAGEM DE ASSERCAO, ambos STRING, nao comentario. Os dois criterios do plano
  eram incompativeis: zerar o grep exigiria edita-las; o criterio ABSOLUTO de diff
  exclusivamente de comentario proibe. Prevaleceu o absoluto — ele materializa a mitigacao
  de R2-28 e T-04-18-02, e o plano so da escape ao criterio da contagem. Renomear um caso e
  mexer num oraculo, e o nome do caso (3) e citado no 04-RESEARCH.md. Divida conhecida,
  nomeada e localizada, NAO falso positivo do padrao.
  RESIDUAL DELIBERADO: 48 linhas em 10 arquivos de backend/test fora das duas rodadas de gap
  closure (scheduler.failsafe 13, notificationStatus 11, agendor.timeout 9, emailer.timeout 5,
  notifications.resolved 5, e 5 arquivos com 1 cada). Sao oraculos estaveis das ondas 1-7;
  edita-los para embelezar comentario e chance de mexer sem querer numa asseracao que hoje
  protege o Core Value.
  CONVENCAO COM DETECTOR: 2 linhas no topo de agendor.js dizendo que referencia usa ancora
  nomeada e nunca numero de linha, mais o grep que detecta a reincidencia em menos de 1s —
  candidato natural a step de CI. Regra escrita sem detector volta a ser violada no proximo
  commit longo.
  DECISAO C9 APLICADA (vinculante, usuario, 2026-08-05): o Success Criteria 4 da Fase 4 no
  ROADMAP e o REL-04 em REQUIREMENTS deixaram de descrever o MECANISMO ("orgCategoryCache e
  invalidado a cada execucao" / "ganha TTL/invalidacao") e passaram a descrever o
  COMPORTAMENTO GARANTIDO: o estado de categorias e ISOLADO POR EXECUCAO e nenhuma execucao
  pode ler, apagar, reutilizar ou contaminar o estado de outra. A remocao da limpeza por
  execucao (04-12) esta APROVADA e NAO e regressao. Zero mudanca de codigo por causa de C9.
  POR QUE ISSO IMPORTA para quem verificar a fase: um criterio que nomeia mecanismo
  inexistente falha da pior forma — o verificador procura orgCategoryCache, nao encontra, e
  o registro correto mora num SUMMARY que ele pode nao abrir.
  4 TODOS CRIADOS em .planning/todos/pending/ (74 a 82 linhas cada, molde do in-01):
  in2-01-fetchwithretry-sem-tentativa (baixa) — retries <= 0 devolve undefined e o sintoma e
  um TypeError de desestruturacao que aponta para a API, nao para o argumento errado;
  in2-02-relogio-falso-em-before (media) — relogio falso em before, nao beforeEach, com o
  precedente MEDIDO de agendor.retry429 (30s moveram o cutoff e trouxeram os deals 102 e 104
  para dentro do golden); in2-03-mensagem-de-erro-interpola-id (media) — a guarda de
  getDealById interpola o valor externo recusado, hoje inalcancavel porque nada loga ali, e a
  distancia ate explorável e UMA linha de logger.warn (regra de precaucao registrada);
  in2-04-parcial-sent-invisivel (media, CANDIDATO A PROMOCAO por tocar o Core Value) — o
  destinatario que faltou num parcial 'sent' nao e retentado e a UI mostra sucesso pleno;
  tratar junto com in-01-status-pending-na-ui, mesmo ternario binario.
  DECISOES ANTERIORES PRESERVADAS, sem editar os arquivos dos todos: in-01 mantem media (C10),
  rel-02b mantem alta / pre-go-live (C11), SEC-01 permanece ABERTO (C8).
  DIVIDA DISPONIVEL sem bloqueio: dedup da copia local de avancarRelogioAte em
  emailer.timeout.test.js — o motivo de mante-la expirou com o 04-17 e este plano nao a
  alterou (so um ponteiro do helper compartilhado foi convertido).

  O 04-17 fechou WR2-05: sendMailWithRetry recria o transporte SO PARA SI —
  `transporter = createTransporter()` dentro do laco de retry reatribui o PARAMETRO da
  funcao, nao a variavel do chamador. Em sendStaleNotification o `let transporter`
  nunca era reatribuido (variavel morta), entao, se o envio ao dono so teve sucesso
  DEPOIS de recriar a conexao, o envio ao autor recomecava com a conexao que ja se
  provou quebrada: pagava outro ciclo de 3s+6s e tinha chance maior de falhar. E o
  segundo destinatario e o elo fragil — com a semantica de sucesso parcial (>= 1
  confirmacao mantem 'sent'), quem NAO recebeu SOME, porque a dedup bloqueia o negocio
  pelo dia e o unico vestigio e a coluna error de uma linha 'sent'.
  RED MEDIDO pela saida literal (3 !== 2) e desta vez a previsao do plano BATEU — sem
  correcao por medicao, diferente do 04-15 e do 04-16. A prova operacional veio no log
  do proprio SUT: DUAS linhas "[Emailer] Tentativa 1 falhou ... Aguardando 3s", a
  segunda sendo o autor pagando o ciclo evitavel.
  Agora sendMailWithRetry devolve o transporte em uso nos DOIS retornos (sucesso e
  falha — apos uma exaustao com recriacoes, o transporte mais novo ainda e a melhor
  aposta) e o chamador o reaproveita com desestruturacao com REST, que preserva os
  conjuntos de chaves de results: {to, success} no sucesso e {to, success, error} na
  falha. Listar as chaves introduziria error: undefined e quebraria
  emailer.timeout.test.js, oraculo de REL-02 que o plano proibe editar.
  D-03 sobreviveu byte a byte: nenhuma linha do for, do isNetworkError, do console.warn,
  da espera ou da recriacao aparece no diff; a exaustao continua RESOLVENDO sem lancar.
  Suite 145 -> 148.
  TRES DESVIOS DE MEDICAO declarados e ACEITOS pelo usuario no C11: dois greps do plano
  foram contados sobre o ARQUIVO INTEIRO com numero calculado so para
  sendMailWithRetry/sendStaleNotification ("transporter =" previsto 3, medido 6 antes e
  8 depois, porque os resumos semanais tem 4 fabricas e a reatribuicao acontece nos DOIS
  blocos; "success: false" previsto 1, medido 3 antes e depois, sem mudanca). O terceiro:
  grep "auth" = 0 no teste era inatingivel (authorName do negocio sintetico e authorEmail,
  o parametro publico do SUT) — PC-13 foi satisfeito POR CONSTRUCAO: o stub de
  createTransport nao recebe sequer o objeto de opcoes, entao o objeto com a senha nunca
  e ligado a um nome no teste.
  DECISAO C11 (2): o todo rel-02b-deadline-global-smtp MANTEM prioridade alta /
  pre-go-live. Este plano reduz o pior caso de tempo por rodada mas nao toca a causa
  (connectionTimeout por endereco A/AAAA resolvido desde o nodemailer 8, sem deadline
  acumulada). O arquivo do todo NAO foi editado.
  ATENCAO para o 04-18 (o ULTIMO da fase): alem de WR2-06 e dos todos IN2-01..IN2-04,
  ele carrega a DECISAO C9 — atualizar a redacao do Success Criteria 4 do ROADMAP sobre
  REL-04. A entrada no 04-18 foi autorizada no C11, mas quem despacha e o coordenador.
  A duplicacao de avancarRelogioAte em emailer.timeout.test.js pode enfim ser desfeita:
  o motivo de mante-la (nao trocar instrumento e objeto medido na mesma rodada) EXPIROU
  com este plano, e agora ha um segundo consumidor do helper compartilhado como rede.
  O 04-16 fechou WR2-04: o consumidor do canal parcial fazia
  `const parciais = err.resultadosParciais ?? []` e chamava `.some`. O `??` so protege
  contra ausencia (null/undefined) — um valor de OUTRO TIPO fazia o `.some` lancar de
  DENTRO do proprio catch do bloco de envio, a excecao subia para o catch externo de
  runCheck e o `for` dos deals morria ali. A origem plausivel do valor errado foi
  REPRODUZIDA, nao suposta: com um erro CONGELADO (Object.freeze) a anexacao do produtor
  em emailer.js falha EM SILENCIO (sloppy mode do CommonJS, sem TypeError e sem log) e um
  valor pre-existente com esse nome sobrevive intacto ate o consumidor.
  RED MEDIDO pela saida literal: TypeError 'parciais.some is not a function' com stack em
  scheduler.js:197, sobre o codigo JA COM o 04-15 aplicado — confirmando por medicao a
  pre-condicao do plano de que as duas correcoes sao independentes.
  A previsao do plano foi CORRIGIDA pela medicao de novo (mesmo achado estrutural do
  04-15): r.deals.length medido e 0, nao 1, porque results.deals.push fica DEPOIS do
  try/catch do bloco de envio.
  Agora a leitura e validada por tipo (Array.isArray) e ausencia E corrupcao viram "nada
  confirmado", com desfecho fail-safe: linha 'error' (que nao deduplica, retenta amanha) e
  a rodada CONTINUA. Nenhum destinatario recebe a mais nem a menos por causa disso — o que
  muda e que os OUTROS deals da rodada deixam de ser perdidos. Trade-off ja aprovado no C10.
  DESVIO DE FORMA declarado: o criterio de aceite exigia 2 linhas de codigo no diff de
  scheduler.js; sao 4. A expressao prescrita por D-WR2-04-a ocupa 98 colunas e o Biome
  (lineWidth 80, obrigatorio pelo CLAUDE.md) a quebra em ternario de 3 linhas. E UM
  statement removido e UM acrescentado — o intento do criterio ("nada alem do consumidor
  mudou") esta verificado diretamente no diff.
  emailer.js mudou SO EM COMENTARIO (contagem de linhas de codigo = 0): o produtor passa a
  declarar que anexar o parcial pode falhar em silencio (erro congelado ou throw de
  primitivo) e que o consumidor le a ausencia OU a corrupcao como "nada confirmado".
  O trabalho do 04-15 e do 04-14 sobreviveu ao diff: catch (erroDeRegistro) = 1 e
  results.notified++ = 2. Suite 144 -> 145.
  LACUNA DECLARADA, nao fechada: o `?.` da guarda nova NAO protege contra throw null —
  results.errors.push(err.message), primeira instrucao do catch, ja teria estourado antes.
  Esta escrito no comentario e nao deve ser vendido como protecao.
  ATENCAO para o 04-17: ele mexe em sendMailWithRetry, que este plano deixou INTOCADA de
  proposito, e termina no checkpoint BLOQUEANTE C11 — auto_advance deve continuar OFF.
  O 04-15 fechou WR2-02: updateNotificationStatus e chamada de DENTRO do catch do bloco
  de envio e usa a MESMA conexao SQLite que pode ter causado a excecao original. Quando
  ela lancava, nada segurava — a falha subia para o catch externo de runCheck, abortava
  o for dos deals e a rodada terminava sem processar os negocios restantes.
  RED MEDIDO, e a previsao do plano CORRIGIDA pela medicao: o plano previa
  r.deals.length === 1; o valor medido e 0, porque results.deals.push(dealResult) fica
  DEPOIS do try/catch do bloco de envio — a rodada perde tambem o registro do deal que
  disparou a falha, nao so os seguintes. O defeito e um passo pior do que o estimado.
  Agora um try/catch proprio envolve o if/else do status; catch (erroDeRegistro) loga
  SO A MENSAGEM (CR-02 do 04-09: um erro de borda carrega config.headers com o
  AGENDOR_TOKEN) e a rodada segue.
  DESVIO DE FORMA declarado: as duas exigencias do plano eram incompativeis entre si
  ("exatamente 1 catch (erroDeRegistro)" vs "incremento dentro do mesmo ramo"). Prevaleceu
  o criterio de aceite verificavel: UM try envolve o if/else, e results.notified++ virou
  um if proprio abaixo do catch. O custo e o que o 04-14 quis evitar — houveEnvioConfirmado
  testado em duas construcoes seguidas — e a mitigacao esta em comentario E nos oraculos:
  quem as fizer divergir deixa vermelho o cenario A ou o B de partialFailure.
  DECISAO C10 (vinculante, usuario, 2026-08-05): o TRADE-OFF DO FAIL-SAFE esta APROVADO.
  Quando a gravacao falha a linha fica 'pending', nao deduplica, e a rodada seguinte PODE
  reenviar para quem ja recebeu. Palavras do usuario: duplicata incomoda e aceitavel;
  deixar alguem sem notificacao nao e. Isso e decisao do USUARIO, nao escolha do executor.
  DECISAO C10 (2): o todo in-01-status-pending-na-ui MANTEM prioridade media, mesmo com
  este plano aumentando a frequencia do 'pending' (X vermelho em NotificationHistory.jsx).
  O arquivo do todo NAO foi editado.
  emailer.js mudou SO EM COMENTARIO (verificado por contagem = 0 linhas de codigo): parou
  de citar como coberto o cenario da conexao SQLite fechada e passou a citar o que o canal
  err.resultadosParciais de fato cobre (cenario A), declarando o desfecho do caso que ele
  nao cobre. Suite 143 -> 144.
  ATENCAO para o 04-16: o consumidor do canal parcial (err.resultadosParciais ?? []) NAO
  foi tocado aqui de proposito — Array.isArray continua ausente. O Cenario D nao exercita
  aquele caminho (o erro nasce da fabrica INICIAL, sem parcial anexado), entao os dois
  planos sao revertiveis de forma independente. Nao entrar no 04-16 sem despacho.

  O 04-14 fechou WR2-01: o ramo de EXCECAO de scheduler.js gravava a linha do
  notification_log como 'sent' quando err.resultadosParciais trazia sucesso, mas NAO
  incrementava results.notified — sub-contagem, o espelho exato de WR-04 (que o 04-10
  fechou so no caminho de RETORNO). O numero que o logger.info de conclusao e a UI
  exibem dizia "0 notificacoes enviadas" num dia em que um e-mail saiu de verdade.
  RED medido pela saida literal (0 !== 1 com a linha ja em 'sent' e enviosConfirmados
  em 1), nao afirmado. O ternario do status virou if/else para que status e contador
  fiquem FISICAMENTE no mesmo ramo — a assimetria nascera justamente de o ternario nao
  deixar lugar natural para o incremento.
  DECISAO D-WR2-01-b: NAO foi escrito dealResult.notified = false (o review sugeria).
  O campo ja nasce false; reatribuir o mesmo valor e codigo morto que o proximo leitor
  le como "aqui algo muda". A assimetria intencional (contador 1, dealResult false) esta
  em comentario E pinada por asseracao no cenario A. Quem "harmonizar" deixa o caso
  vermelho. Suite 143/143 (mesma contagem — o plano acrescenta asseracoes a um caso
  existente, nao casos novos); zero asseracao alterada nos cenarios B e C e em
  notificationStatus.test.js.
  ATENCAO para o 04-15: ele mexe no MESMO catch. O incremento entregue aqui vive dentro
  daquele bloco — a protecao da gravacao precisa preserva-lo, e o cenario A e o oraculo
  que acusa se ele sumir.

  O 04-13 fechou WR2-03: avancarRelogioAte (test/helpers/fakeTimers.js) tratava so o ramo
  de SUCESSO da promessa observada, entao numa rejeicao a promessa derivada ficava ORFA e
  aflorava como unhandledRejection — que o node:test credita ao caso que estiver correndo,
  podendo reprovar um caso VIZINHO com a mensagem de outro. RED medido com a saida literal
  (failureType: 'unhandledRejection', error: 'ERRO REAL DO SUT'), nao afirmado. Agora o then
  tem os DOIS ramos e o erro real e relancado sem embrulho.
  DESVIO DELIBERADO do snippet do 04-REVIEW: a falha explicita por nao-conclusao vem ANTES
  do await encerrada (o review propunha o inverso, o que TRAVARIA a suite quando a promessa
  nunca assenta). Coberto pelo caso (3) do meta-teste novo, fakeTimers.helper.test.js.
  Uma das 3 variantes do helper deixou de existir: o envelope local de agendor.retry429.test.js
  sumiu, com ZERO asseracoes alteradas. A cópia de emailer.timeout.test.js FICA de proposito —
  e oraculo de REL-02 e o emailer.js muda no 04-17. Suite 140 -> 143, todos verdes; nenhuma
  linha de producao tocada.

  O 04-12 fechou CR2-01, o achado CRITICO da rodada 2: getOrgCategory passou a receber o
  cache da execucao por parametro, getStaleDeals passou a cria-lo, e o dicionario de modulo
  orgCategoryCache mais a limpeza por execucao deixaram de existir. O refetch entre execucoes
  virou ESTRUTURAL. RED medido e registrado (A e B -> [101, 103, 105], contador em 1);
  GREEN medido (B -> [101, 103], contador 1 -> 2). Suite 139 -> 140, todos verdes.
  ATENCAO para quem verificar a fase: a remocao do delete/limpeza NAO e regressao de REL-04 —
  os 3 cenarios de agendor.cacheInvalidation.test.js seguem verdes SEM edicao de asseracao.

  DECISAO C9 (vinculante, usuario, 2026-08-05) — REL-04 / Success Criteria 4 do ROADMAP:
  a remocao da limpeza por execucao esta APROVADA, porque o cache global deixou de existir
  nesse caminho. A redacao do Success Criteria 4 DEVE ser atualizada para descrever o
  COMPORTAMENTO GARANTIDO, nao o mecanismo antigo de "invalidar o cache a cada execucao":
  afirmar que o estado de categorias e ISOLADO POR EXECUCAO e que nenhuma execucao pode ler,
  apagar, reutilizar ou contaminar o estado de outra. Aplicar essa atualizacao documental
  no plano 04-18.

  A 2a rodada de code review (04-REVIEW.md, round: 2) verificou as conclusoes da r1 CETICAMENTE
  e reabriu a fase:

  - Fechados de fato: CR-02, WR-02, WR-03, WR-05
  - Fechados so em parte: CR-01, WR-01, WR-04 — cada um deixou aberto o cenario vizinho que o
    comentario novo no codigo declara resolvido

  - CR2-01 (CRITICAL): orgCategoryCache continua sendo estado de modulo compartilhado. O 04-08
    fechou "B apaga antes de A ler"; a direcao oposta segue aberta — A grava null apos a limpeza
    de B, e B le esse null cacheado sem consultar a API. Reproduzido deterministicamente: deal 105
    (org 205, categoria 'Parceiro', EXCLUIDA) entra nas duas listas. Notifica quem nao devia.

  Planos da r2 (fonte: 04-REVIEW.md; nao existe 04-VERIFICATION.md):
  04-12 CR2-01 (C9) | 04-13 WR2-03 | 04-14 WR2-01 | 04-15 WR2-02 (C10) | 04-16 WR2-04
  | 04-17 WR2-05 (C11) | 04-18 WR2-06 + todos IN2-01..IN2-04
  Escopo travado pelo usuario: IN2-01..IN2-04 viram todos pendentes, nao planos. WR2-04 endurece
  o canal atual — o contrato de sendStaleNotification NAO muda.
  Execucao estritamente sequencial (parallelization: false); auto_advance deve ficar OFF (3
  checkpoints bloqueantes: C9, C10, C11).
  A rodada 1 esta preservada em 04-REVIEW-r1.md (origem dos planos 04-08..04-11).
  SEC-01 permanece ABERTO como risco conscientemente aceito (decisao C8) — nao marcar resolvido.
Last activity: 2026-08-05 -- 04-21 completo (CR3-01 3/3 no resumo semanal individual); suite 156 -> 160

Progress: [█████████░] 88%

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
| Phase 04 P11 | 22min | 2 tasks tasks | 2 files files |
| Phase 04 P12 | 26min | 2 tasks (+C9 pendente) | 3 files |
| Phase 04 P13 | 8min | 3 tasks tasks | 3 files files |
| Phase 04 P14 | 11min | 2 tasks | 2 files |
| Phase 04 P15 | 21min | 3 tasks (C10 aprovado) | 3 files |
| Phase 04 P16 | 16min | 2 tasks | 3 files |
| Phase 04 P17 | 22min | 3 tasks (C11 aprovado) | 2 files |
| Phase 04 P18 | 26min | 2 tasks tasks | 16 files files |
| Phase 04 P19 | 21min | 3 tasks tasks | 4 files files |
| Phase 04 P20 | 16min | 2 tasks tasks | 2 files files |
| Phase 04 P21 | 12 | 2 tasks | 2 files |
| Phase 04 P22 | 14min | 2 tasks | 2 files |

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
- [Phase ?]: 04-11: a politica de retry de 429 da borda Agendor virou UM helper (fetchWithRetry) compartilhado por fetchDealsPage e getDealsWithFutureTasks — uma terceira copia do laco dentro do mesmo modulo seria um segundo lugar para a regra divergir (WR-02)
- [Phase ?]: 04-11: o laco foi copiado byte a byte (so 429, 3 tentativas, esperas de 5s e 10s) e a caracterizacao do 429 em /deals (golden [101, 103] com 2 requisicoes) foi escrita ANTES da extracao — e ela o oraculo que impede a refatoracao de mudar a politica sem querer
- [Phase ?]: 04-11: retentar nao e engolir — esgotadas as 3 tentativas a falha continua propagando e o contrato Q2 do 04-02 (Set completo ou excecao) permanece; scheduler.failsafe.test.js rodou sem edicao
- [Phase ?]: 04-11: timeout continua FORA do retry (D-01) e agora esta pinado nos DOIS consumidores — e a ausencia de err.response que o mantem fora; retenta-lo levaria o pior caso de uma requisicao de ~15s para ~60s
- [Phase ?]: 04-11: o relogio falso precisa ser rearmado em beforeEach quando o proprio SUT avanca o tempo — o avanco do retry de um caso adiantava o cutoff de 15 dias do caso seguinte e fazia os deals 102 e 104 entrarem no golden (contaminacao de ordem, nao defeito)
- [Phase 04]: 04-12: o cache de categorias deixou de ser dicionario de MODULO e passou a ser um Map criado dentro de getStaleDeals e entregue a getOrgCategory por parametro (D-CR2-01-a) — CR2-01, o achado critico da rodada 2
- [Phase 04]: 04-12: a limpeza por delete de chave do 04-07 foi REMOVIDA (D-CR2-01-c) porque nao ha mais o que limpar. Isso NAO e regressao de REL-04: a propriedade observavel continua provada pelos MESMOS 3 cenarios de agendor.cacheInvalidation.test.js, sem edicao de asseracao — o diff daquele arquivo e 100% comentario
- [Phase 04]: 04-12: a limpeza era uma corrida que dava para PERDER — uma execucao em voo gravava (ou gravava o null do seu erro) DEPOIS da limpeza da vizinha, e a vizinha lia esse valor sem consultar a API; EXCLUDED_CATEGORIES.includes(null) e false, entao uma organizacao 'Parceiro' era notificada por uma rodada que nao falhou em nada
- [Phase 04]: 04-12: o caso espelho assere o CONTADOR de consultas (1 -> 2) alem do golden — prova o MECANISMO (B reconsultou) e nao so o desfecho, que poderia coincidir por acaso
- [Phase 04]: 04-12: o Map e declarado junto ao seu unico consumidor (acima do Promise.all das organizacoes) e nao no topo de getStaleDeals — declarar no topo exigiria um comentario apontando para codigo dezenas de linhas abaixo, exatamente o ponteiro que envelhece que WR2-06 corrige
- [Phase ?]: 04-11: avancarRelogioAte (04-10) so observa promessas pelo caminho de SUCESSO — numa rejeicao substitui o erro real por 'a promessa nao concluiu'; contornado por envelope LOCAL no arquivo de teste, sem editar o helper compartilhado; dedupar/estender fica para a Fase 5/7
- [Phase 04]: 04-13: o helper avancarRelogioAte criava a promessa derivada com um then de UM argumento — sem handler de rejeicao; numa rejeicao ela ficava orfa e aflorava como unhandledRejection, que o node:test credita ao caso em execucao NAQUELE momento e portanto pode reprovar um caso VIZINHO com a mensagem de outro (WR2-03)
- [Phase 04]: 04-13: DESVIO deliberado do snippet do 04-REVIEW — a falha explicita por nao-conclusao vem ANTES do await encerrada, e nao depois; a ordem do review travaria a suite quando a promessa nunca assenta, e um teste que trava nao da diagnostico nenhum. Uma promessa derivada pendente para sempre e inofensiva porque tem handler de rejeicao anexado (caso (3) do meta-teste e o guarda-corpo)
- [Phase 04]: 04-13: o erro real do SUT e relancado sem embrulho (throw desfecho.erro) e a mensagem de nao-conclusao ficou byte-a-byte igual a anterior — e o assert.rejects do arquivo consumidor que continua sendo o oraculo
- [Phase 04]: 04-13: restam 2 variantes do helper em circulacao (eram 3) — o envelope local avancarRelogioAteDesfecho de agendor.retry429.test.js sumiu com ZERO asseracoes alteradas; a copia de emailer.timeout.test.js FICA de proposito, porque e oraculo de REL-02 e o emailer.js muda no 04-17 (trocar o instrumento e o objeto medido na mesma rodada e o que a constraint de processo do CLAUDE.md proibe)
- [Phase 04]: 04-14: o contador results.notified passou a ser incrementado TAMBEM no ramo de excecao que grava 'sent' (D-WR2-01-a) — status gravado e contador sao um unico ponto de verdade nos DOIS caminhos; a sub-contagem era o espelho exato da super-contagem que WR-04 fechou no caminho de retorno
- [Phase 04]: 04-14: o ternario houveEnvioConfirmado ? 'sent' : 'error' deu lugar a um if/else porque a assimetria era ESTRUTURAL — com a decisao do status escrita dentro da chamada, o incremento nao tinha lugar fisico ao lado do status que ele reflete
- [Phase 04]: 04-14: NAO foi escrito dealResult.notified = false (D-WR2-01-b, desvio deliberado do snippet do 04-REVIEW) — o campo ja nasce false e reatribuir o mesmo valor e codigo morto que sugere ao leitor que algo muda ali; a assimetria intencional (contador 1, dealResult false) fica em comentario e e PINADA por assert.equal(r.deals[0].notified, false) no cenario A
- [Phase 04]: 04-14: a inconsistencia ficou sem oraculo por um detalhe do teste, nao por acaso — o cenario B ja asseria que "o objeto do deal e o contador precisam concordar", e o cenario A, onde eles discordam, nao asseria nenhum dos dois; fechar o achado foi acrescentar as duas asseracoes que faltavam
- [Phase 04]: 04-14: o RED trouxe a prova operacional inteira numa linha de log do proprio SUT — "[Scheduler] Concluido: 1 negocios parados, 0 notificacoes enviadas" com a linha do notification_log daquele deal ja gravada como 'sent'
- [Phase 04]: 04-13: o RED foi medido pela saida literal do runner (failureType: 'unhandledRejection' com error: 'ERRO REAL DO SUT') — a rejeicao orfa PREEMPTOU o proprio assert.rejects do caso, o que prova que o try/catch do autor do teste nao contem o defeito

- [Phase 04]: 04-15: a gravacao do desfecho dentro do catch do bloco de envio ganhou try/catch proprio (D-WR2-02-a) — uma excecao nascida DENTRO de um catch nao pode ter como destino o catch externo de runCheck, que existe para falhas da VERIFICACAO e nao para falhas de escrita de log
- [Phase 04]: 04-15: o RED medido CORRIGIU a previsao do plano — o previsto era r.deals.length === 1 e o medido e 0, porque results.deals.push(dealResult) fica DEPOIS do try/catch do bloco de envio; a rodada perdia tambem o registro do deal que disparou a falha, nao so os seguintes
- [Phase 04]: 04-15: results.notified++ ficou FORA do try de registro (D-WR2-02-c) — o contador acompanha a DECISAO de status, nao o sucesso da gravacao; junto da chamada, uma falha so de gravacao faria a rodada reportar zero num dia em que o e-mail saiu de verdade
- [Phase 04]: 04-15: DESVIO DE FORMA declarado — as duas exigencias do plano eram incompativeis entre si ('exatamente 1 catch (erroDeRegistro)' vs 'incremento dentro do mesmo ramo'); prevaleceu o criterio de aceite verificavel: UM try envolve o if/else do status e o incremento virou um if proprio abaixo do catch, com a divergencia mitigada por comentario e pelos oraculos A e B de partialFailure
- [Phase 04]: 04-15: so erroDeRegistro.message vai ao logger, nunca o objeto (D-WR2-02-b) — CR-02 do 04-09: um erro de borda carrega config.headers com o AGENDOR_TOKEN
- [Phase 04]: 04-15 [C10, decisao vinculante do usuario, 2026-08-05]: o TRADE-OFF DO FAIL-SAFE esta APROVADO — quando a gravacao do desfecho falha a linha fica 'pending', nao deduplica, e a rodada seguinte PODE reenviar para quem ja recebeu. Duplicata incomoda e aceitavel; deixar alguem sem notificacao nao e. Decisao do USUARIO, nao escolha do executor
- [Phase 04]: 04-15 [C10 (2), usuario, 2026-08-05]: o todo in-01-status-pending-na-ui MANTEM prioridade media mesmo com este plano aumentando a frequencia do 'pending' na UI; o arquivo do todo nao foi editado
- [Phase 04]: 04-15: o consumidor do canal parcial (err.resultadosParciais ?? []) NAO foi tocado (D-WR2-02-d) — o Cenario D dispara a excecao na fabrica INICIAL de sendStaleNotification, que fica FORA do try, entao o erro chega sem parcial anexado e nada do 04-16 e exercitado; e isso que preserva o rollback independente entre os dois planos
- [Phase 04]: 04-16: o consumidor do canal parcial passou a validar o TIPO do que recebe (D-WR2-04-a) — o `??` so protege contra ausencia, e um valor de outro tipo fazia o `.some` lancar de DENTRO do catch do bloco de envio, subir para o catch externo de runCheck e abortar o `for` dos deals; ausencia E corrupcao passam a significar "nada confirmado", com desfecho fail-safe (linha 'error', que nao deduplica e retenta amanha)
- [Phase 04]: 04-16: a origem do valor errado foi REPRODUZIDA, nao suposta — um erro CONGELADO (Object.freeze) faz a anexacao do produtor falhar EM SILENCIO em sloppy mode do CommonJS (sem TypeError, sem log), e um valor pre-existente com esse nome sobrevive intacto ate o consumidor; o teste assere isso diretamente depois da rodada, o que fecha o risco de verde falso pela raiz
- [Phase 04]: 04-16: o produtor MANTEM a anexacao e passa a DOCUMENTAR a propria fragilidade (D-WR2-04-b) — o diff de emailer.js e exclusivamente de comentario (contagem de linhas de codigo = 0); trocar o contrato de sendStaleNotification por { results, erro } esta fora desta rodada por escopo travado do usuario
- [Phase 04]: 04-16: DESVIO DE FORMA declarado — o criterio exigia 2 linhas de codigo no diff de scheduler.js e sao 4: a expressao prescrita ocupa 98 colunas e o Biome (lineWidth 80, obrigatorio pelo CLAUDE.md) a quebra em ternario de 3 linhas; e UM statement removido e UM acrescentado, e o intento do criterio esta verificado direto no diff
- [Phase 04]: 04-16: LACUNA DECLARADA e nao fechada — o encadeamento opcional da guarda nova NAO protege contra throw null, porque results.errors.push(err.message) e a primeira instrucao do catch e ja teria estourado antes; esta escrito no comentario para nao ser vendido como protecao que nao e
- [Phase 04]: 04-16: a previsao do RED foi corrigida pela medicao pela SEGUNDA vez (mesmo achado do 04-15) — r.deals.length medido e 0, nao 1, porque results.deals.push fica DEPOIS do try/catch do bloco de envio; sondado com copia descartavel do teste, removida e nunca commitada
- [Phase 04]: 04-15: o diff de emailer.js e EXCLUSIVAMENTE de comentario (contagem de linhas de codigo = 0) — parou de citar como coberto o cenario da conexao SQLite fechada e passou a citar o cenario A, declarando o desfecho do caso nao coberto sem nomear a funcao de desligamento
- [Phase 04]: 04-17: o transporte vivo volta junto do resultado de sendMailWithRetry e o chamador o reaproveita (D-WR2-05-a) — a recriacao dentro do laco de retry troca o PARAMETRO da funcao, nao a variavel do chamador, entao sem devolve-lo o destinatario seguinte recomeca com a conexao que ja se provou quebrada, paga outro ciclo de 3s+6s e tem chance maior de falhar
- [Phase 04]: 04-17: o transporte volta TAMBEM no retorno de falha, de proposito — se a exaustao veio depois de uma ou duas recriacoes, o transporte mais novo ainda e a melhor aposta para o proximo destinatario; devolve-lo so no sucesso deixaria justamente o pior caso sem conserto
- [Phase 04]: 04-17: o push separa o transporte do resultado com REST e nao listando as chaves (D-WR2-05-b) — listar introduziria error: undefined no caminho de sucesso e quebraria o assert Object.keys de emailer.timeout.test.js, oraculo de REL-02 que o plano proibe editar
- [Phase 04]: 04-17: criar um transporte POR DESTINATARIO foi recusado — dobraria as conexoes no caminho feliz (o de todo dia) para resolver um problema do caminho de falha; o caso 3 do teste novo assere transportesCriados === 1 e existe para impedir essa simplificacao
- [Phase 04]: 04-17: PC-13 satisfeito POR CONSTRUCAO em vez de por grep — o stub de createTransport nao recebe sequer o parametro de opcoes, entao o objeto que carrega a senha SMTP nunca e ligado a um nome no arquivo de teste
- [Phase 04]: 04-17: TERCEIRA ocorrencia do mesmo achado estrutural da rodada — criterio de aceite por grep contado sobre escopo diferente do que o plano descreve em prosa (arquivo inteiro vs. as duas funcoes); os valores REAIS medidos ficam registrados no SUMMARY, nao os previstos
- [Phase 04]: 04-17 [C11, decisao vinculante do usuario, 2026-08-05]: aprovado por escrito — D-03 intacta (3 tentativas, 3s/6s, exaustao sem lancar), transporte sem vazamento para results, RED reproduzido de fato e caminho feliz com uma conexao por rodada; os tres desvios de medicao ficam ACEITOS
- [Phase 04]: 04-17 [C11 (2), usuario, 2026-08-05]: o todo rel-02b-deadline-global-smtp MANTEM prioridade alta / pre-go-live — esta mudanca reduz o pior caso de tempo por rodada mas nao toca a causa (connectionTimeout por endereco A/AAAA resolvido desde o nodemailer 8, sem deadline acumulada); o arquivo do todo NAO foi editado
- [Phase ?]: [04-19 / CR3-01] Rota INDECIDIVEL implementada conforme decisao do usuario de 2026-08-05: /organizations/:id entrou no fetchWithRetry e a exaustao grava a sentinela CATEGORIA_INDECIDIVEL; o negocio fica FORA do envio (a partir do 04-20) mas PERMANECE no painel — nenhum continue novo em getStaleDeals, medido 5 antes e 5 depois
- [Phase ?]: 04-20 (D-CR3-01-h..k): a guarda de categoria indecidivel mora no laco de runCheck, entre a dedup e a de funil; nenhuma linha no notification_log; a guarda nao loga; continue e nunca throw
- [Phase ?]: 04-20: o cenario SIMETRICO da rodada 3 e a ORDEM INVERSA (falha no 2o negocio), o que separa 'a guarda funciona' de 'a guarda funciona porque o afetado era o primeiro'
- [Phase 04]: D-CR3-01-l/m/n/o aplicadas no 04-21: o e-mail individual do comercial exclui o negocio indecidivel; o consolidado do admin e o snapshot MANTEM (medido nas duas direcoes). Filtro em DOIS PASSOS separados, skippedByFunnel inalterado (3 antes, 3 depois), contagem propria avisada por logger.warn [Emailer]. LOG-01 nao antecipado: console.* em emailer.js = 4 antes e 4 depois.
- [Phase ?]: 04-22 (WR3-01): as CINCO chamadas HTTP de agendor.js sob a mesma politica de retry — 'await api.get(' = 0; o comentario passou a ENUMERAR as bordas com o ponto de chamada de cada uma
- [Phase ?]: 04-22: a guarda de tipo do id (WR-03) fica FORA do callback do retry — o helper da retentativa, nao permissao; caso (8) assere 0 requisicoes para '../users'

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

Last session: 2026-08-05T05:49:35.583Z
Stopped at: Completed 04-19-PLAN.md
Resume file: None
