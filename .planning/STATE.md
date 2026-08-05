---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Completed 04-33-PLAN.md — WR4-02 e WR4-03 FECHADOS: os comentarios da suite deixaram de afirmar que existe uma copia do helper de relogio que foi removida, e as 4 ancoras por numero de linha do oraculo de REL-02 viraram ancoras NOMEADAS, cada uma conferida contra o emailer.js atual antes de escrita. UNICO plano da r4 com DIFF DE PRODUCAO ZERO por criterio (backend/src/ vazio nas duas tasks). Inventario medido: 4 linhas em 4 arquivos sobre a copia, 45 -> 41 linhas com referencia por numero; residual de 39 linhas em 9 arquivos vai para o todo wr4-03b (04-34). Suite 186/186 (mesmo total da entrada), cobertura exit 0, lint exit 0 (44 warnings). Falta so o 04-34 da gap closure r4. || anterior: Completed 04-32-PLAN.md — WR4-07 FECHADO: um responsavel SEM NOME deixou de derrubar o resumo semanal de TODOS os comerciais. O rotulo do relatorio individual passou a resolver pelo CADASTRO (negocio -> users[d.ownerId]?.name -> rotulo neutro) e o template ganhou a guarda gemea como defesa em profundidade. Suite 183 -> 186, cobertura exit 0, lint exit 0 (44 warnings). Faltam 04-33 e 04-34 da gap closure r4. || anterior: Completed 04-31-PLAN.md — WR4-06 FECHADO: a PREVIA do envio (runCheckOnly) passou a MARCAR quem sera notificado, com os MESMOS quatro predicados de runCheck, e o rotulo do botao do painel deixou de contar negocios parados para contar destinatarios. A divergencia entre previa e envio virou VERMELHO (cenarios F e G), nao comentario. Suite 181 -> 183, lint exit 0 no backend e no frontend, build do frontend exit 0. Faltam 04-32..04-34 da gap closure r4. || anterior: Completed 04-30-PLAN.md — WR4-04 e IN4-01 FECHADOS: a unica borda do modulo com fan-out proporcional ao VOLUME DE DADOS ganhou teto de CONCORRENCIA (LOTE_DE_ORGS), sem mudar o resultado de getStaleDeals, e o lote IRMAO da paginacao esta VERIFICADO por medicao. Suite 178 -> 181, agendor.js 100% linhas / 91,72% branches, lint exit 0. Faltam 04-31..04-34 da gap closure r4. || anterior: Completed 04-29-PLAN.md — WR4-01 e WR4-05 FECHADOS: as TRES paginacoes de agendor.js tem o mesmo teto e o mesmo tratamento de envelope, com as irmas VERIFICADAS por teste e nao presumidas. Suite 174 -> 178, agendor.js em 100% linhas / 91,6% branches, lint exit 0. Faltam 04-30..04-34 da gap closure r4. || anterior: Completed 04-28-PLAN.md — CR4-01 (o BLOCKER da r4) FECHADO. || GAP CLOSURE R4 PLANEJADA E VERIFICADA (2026-08-05): 7 planos aditivos 04-28..04-34 sobre o 04-REVIEW.md round 4. Plan-checker: VERIFICATION PASSED NA PRIMEIRA PASSADA. Cobertura REL-01..06 = 6/6. || FASE 04 REABERTA PELA 4a VEZ pelo code review rodada 4: 1 BLOCKER (CR4-01), 7 warnings e 6 info."
last_updated: "2026-08-05T19:15:00.000Z"
last_activity: 2026-08-05 -- 04-33 completo (WR4-02 e WR4-03: comentarios da suite alinhados ao instrumento unico e ancoras nomeadas no oraculo de REL-02); diff de producao ZERO, suite 186/186, cobertura exit 0, lint exit 0
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 50
  completed_plans: 49
  percent: 38
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-22)

**Core value:** Rede de testes automatizados sobre a lógica crítica de notificação (quem recebe / quem não recebe) — para nunca mais uma regressão silenciosa.
**Current focus:** Phase 04 — confiabilidade-das-integra-es

## Current Position

Phase: 04 (confiabilidade-das-integra-es) — gap closure r4 EM EXECUCAO
Plan: 33 de 34 executados (04-01..04-33). Falta o 04-34 (ultimo da gap closure r4).
Status: WR4-02 E WR4-03 FECHADOS PELO 04-33 (2026-08-05)

  O 04-33 e o UNICO plano da r4 com DIFF DE PRODUCAO ZERO por criterio de aceite
  (`git diff --name-only backend/src/` vazio nas DUAS tasks) — precedente: 04-26 e 04-27.
  Os dois achados sao sobre o INSTRUMENTO, nao sobre o produto.
  WR4-02 — o commit 46cf90a (WR3-05, plano 04-26) removeu a copia local do helper de
  relogio mas atualizou apenas 2 dos 4 comentarios que a declaravam viva. DOIS ARQUIVOS DO
  REPOSITORIO AFIRMAVAM O OPOSTO SOBRE O MESMO FATO: helpers/fakeTimers.js dizia "NAO
  existe mais nenhuma" e agendor.retry429.test.js dizia "Restam duas variantes ... continua
  de proposito", com um motivo que o proprio 04-26 extinguiu. E
  agendor.cacheConcurrency.test.js apontava para "o helper homonimo de
  emailer.timeout.test.js", simbolo que nao existe mais naquele arquivo.
  A FONTE DA VERDADE E helpers/fakeTimers.js (D-WR4-02-a) e ficou BYTE A BYTE — `git diff
  --name-only backend/test/helpers/` vazio nas duas tasks. Os que contradiziam foram
  alinhados a ela, nunca o contrario: foi a inversao desse sentido que produziu o achado na
  primeira vez. O paragrafo do envelope local do 04-13 foi PRESERVADO (D-WR4-02-b): so saiu
  a afirmacao das duas variantes.
  WR4-03 — emailer.timeout.test.js mantinha 4 referencias por numero de linha a emailer.js
  e AS 4 APONTAVAM PARA O LUGAR ERRADO, porque o modulo foi reescrito por 04-17, 04-21 e
  04-24 depois de o teste ter sido escrito. E o defeito que a convencao de WR2-06 descreve,
  no arquivo que e o ORACULO DE REL-02.
  CADA ANCORA FOI LOCALIZADA NO emailer.js ATUAL ANTES DE SER ESCRITA (mitigacao de R4-31):
  sendMailWithRetry; o termo de MENSAGEM da condicao isNetworkError (com o porque escrito —
  com code 'ESOCKET' os dois termos que olham err.code nao casam); a recriacao do transporte
  dentro do catch; e a guarda authorEmail !== ownerEmail de sendStaleNotification. O que as
  linhas antigas apontavam hoje: :178 = `<!-- Footer -->`, :188 = `</body>`, :197 = linha de
  comentario, :229 = fecha-bloco do ramo de retry.
  A REFERENCIA AO FONTE DO nodemailer PERMANECE (D-WR4-03-b), com a exclusao DECLARADA por
  escrito no cabecalho: e arquivo de dependencia, versionado pelo lockfile e nao por este
  repositorio, entao o numero nao se desloca a cada commit daqui. Mesma forma da decisao
  registrada em in3-06 sobre o nome do caso — para que a assimetria nao pareca esquecimento.
  INVENTARIO DE IRMAOS ENTREGUE, com os dois numeros do plano batendo exatamente: 4 linhas
  em 4 arquivos para "copia local|helper homonimo" (2 corrigidas, 2 verificadas-e-sas, uma
  delas a fonte da verdade) e 45 linhas em 11 arquivos com referencia por numero na ENTRADA,
  41 na SAIDA (so emailer.timeout mudou, de 5 para 1). Verificadas-e-sas por MEDICAO, nao
  por leitura: a frase de emailer.timeout esta no PASSADO e descreve corretamente o 04-26;
  agendor.loteDeOrganizacoes.test.js tem 0; backend/src tem 0 em todos os arquivos.
  RESIDUAL COM DONO, medido: 39 linhas em 9 arquivos (scheduler.failsafe 12,
  notificationStatus 11, agendor.timeout 8, notifications.resolved 3, e 1 em cada um de
  config.route.smtpPass, db.smtpPassMigration.clear, db.smtpPassMigration.keep,
  emailer.smtpPass e setup.js) — o in3-06 nomeia APENAS scheduler.resilience.test.js. Dono:
  todo `wr4-03b`, a criar no 04-34, junto do gate de CI de in3-04.
  DUAS DIVERGENCIAS DE MEDICAO, registradas e nao forcadas: (1) o cabecalho novo ficou com 8
  linhas de texto e o plano pedia "3 a 5" — sao DUAS declaracoes independentes e cada uma
  precisa carregar o seu porque; encurtar exigiria cortar um deles. NONA rodada da fase com
  divergencia de contagem, e de classe NOVA (orcamento de prosa, nao forma de grep nem
  reformatacao do Biome); (2) emailer.js:229 nao e `error: err.message` como o plano dizia,
  e sim o fecha-bloco do ramo de retry (a atribuicao esta na 232) — a conclusao que importa
  (a referencia aponta para lugar sem relacao) sobrevive e fica ate mais forte.
  IN4-02 INTOCADO: `grep -c "tres vezes"` no diff = 0 (mitigacao de R4-36).
  TODOS OS DEMAIS NUMEROS PRESCRITOS BATERAM: copia local|helper homonimo = 0 nos dois
  corrigidos e 2 linhas nos dois corretos, emailer.js:N = 0, .js:N = 1, 0 assercoes no diff
  das duas tasks, 8/3/9 casos preservados. Suite 186 -> 186 (o mesmo total da entrada, como
  exigido de um plano sem mudanca de comportamento), cobertura exit 0, lint exit 0 (44
  warnings, baseline). emailer.js em 89,78% linhas / 63,7% branches — identico ao 04-32.
  ZERO DESVIOS: nenhuma Rule 1-4 acionada, nenhum pacote instalado.
  ATENCAO PARA QUEM SEGUIR: quem for fechar o wr4-03b precisa CONFERIR cada referencia
  contra o arquivo apontado antes de converte-la — este plano converteu 4 e as 4 estavam
  erradas; trocar numero por nome sem conferir reproduz o defeito com outra sintaxe, e ai
  ele fica invisivel para o grep que hoje o encontra.
  Commits: 70721d5 (WR4-02), 8356ed1 (WR4-03).

Status anterior: WR4-07 FECHADO PELO 04-32 (2026-08-05)

  O 04-32 fechou o achado cujo dano NAO E PROPORCIONAL A CAUSA: `ownerWeeklyHtml`
  desreferenciava `ownerName` sem guarda, e `getStaleDeals` produz `ownerName: null`
  explicito quando o payload da borda traz `owner` sem `name`. O template e montado DENTRO
  do laco de destinatarios e ANTES do try/catch que envolve o sendMail, entao a excecao
  saia de sendOwnerWeeklySummary, subia ate o catch de runWeeklySummary e encerrava o
  resumo semanal INTEIRO — um unico responsavel sem nome custava o relatorio de TODOS os
  comerciais, inclusive os que ja teriam recebido, com vestigio de UMA linha generica de
  log. A assimetria que provava descuido e nao decisao: POST /test-owner-summary ja
  guardava o mesmo campo (`ownerName || d.ownerName || 'Comercial Teste'`).
  O CUSTO AGREGADO FOI MEDIDO, NAO PRESUMIDO (D-WR4-07-d). Sonda temporaria sobre o
  cenario (6) no estado defeituoso: `enviosCapturados.length = 0` com DOIS responsaveis na
  lista — zero de dois. O vizinho sem defeito nenhum nao recebia nada. A sonda foi apagada
  antes do commit; o numero esta no SUMMARY.
  AGORA: o rotulo do grupo resolve pela MELHOR FONTE — `d.ownerName || users[d.ownerId]?.name
  || 'Comercial'` — e nao apenas evita a excecao. O dicionario de getUsers tem o nome
  cadastrado mesmo quando o negocio nao tem; so evitar a excecao trocaria um erro por uma
  saudacao generica. A guarda gemea no template (`(ownerName || 'Comercial')`) e DEFESA EM
  PROFUNDIDADE declarada SEM caso dedicado (D-WR4-07-c), com o motivo escrito no codigo (o
  outro chamador ja guarda; pinar exigiria seam num modulo que nao exporta a funcao) e o
  precedente nomeado (D-WR3-03-b, 04-24).
  QUEM RECEBE NAO MUDOU: a decisao continua vindo de `owner?.email`; a mudanca e so no
  ROTULO guardado ao lado da lista.
  A ASSERCAO E SOBRE O HTML, NAO SOBRE A CONTAGEM (D-WR4-07-e): os tres casos novos exigem
  que o corpo enviado NAO contenha as strings `undefined` nem `null`. Um conserto que
  apenas evitasse a excecao e imprimisse "Ola, undefined!" passaria por qualquer assercao
  de quantidade. O caso (7) e o FUNDO do encadeamento (sem nome no negocio E sem nome no
  cadastro) — sem ele a cadeia poderia parar no penultimo elo sem ninguem perceber.
  A ORDEM DO CASO (6) E INSTRUMENTO, NAO ESTILO: o sem-nome vem PRIMEIRO porque
  Object.entries(byOwner) segue a ordem de insercao, que e a ordem da lista notificavel —
  com ele em segundo lugar o primeiro grupo ja teria sido enviado antes da excecao e o
  caso ficaria VERDE com o defeito presente.
  RED literal: os tres vermelhos com TypeError "Cannot read properties of null (reading
  'split')" em ownerWeeklyHtml, e (1) a (4) verdes sem ajuste — a condicao de PARAR ("a
  extensao da armacao afetou a politica") nao foi atingida. Acrescentar os ids 12 e 13 a
  USERS nao mexeu em nada: os casos antigos so referenciam o id 11.
  A POLITICA DE CR3-01 FICOU INTOCADA e medida: `categoriaIndecidivel` e `skippedByFunnel`
  ausentes do diff (0 e 0). sendWeeklySummary (consolidado do admin) continua NAO filtrando
  de proposito. dealEmailHtml ausente do diff (0) — o residual `wr4-07b` NAO foi fechado de
  carona. agendor.js ausente do diff: produzir `ownerName: null` explicito e DELIBERADO, e
  consertar a FONTE esconderia o dado ausente do painel, dos relatorios e do snapshot para
  consertar um template.
  DUAS DIVERGENCIAS DE MEDICAO, registradas e nao forcadas: (1) o baseline do plano dizia 8
  ocorrencias do identificador `ownerName` no emailer.js; medido `grep -o` = 11 em 10
  linhas — a conclusao que importa (UMA desreferencia, `.split(` = 1) sobrevive intacta;
  (2) o teto de "4 linhas nao-comentario no diff" ficou em 5 adicionadas / 2 removidas,
  porque o Biome quebrou o literal de objeto em quatro linhas ao passar de 80 colunas — as
  mudancas SEMANTICAS continuam sendo DUAS, e o proprio plano previa "mais o que o Biome
  reformatar". OITAVA rodada da fase com divergencia de contagem.
  TODOS OS DEMAIS NUMEROS PRESCRITOS BATERAM: ownerName.split( nao-comentario = 0, .split(
  nao-comentario = 1, users[d.ownerId]?.name nao-comentario = 1, 7 casos no arquivo,
  0 assercoes removidas/alteradas, 0 referencias por numero de linha.
  Suite 183 -> 186, emailer.js 89,78% linhas / 63,7% branches, cobertura exit 0, lint exit
  0 (44 warnings, baseline). Os CINCO arquivos vizinhos verdes SEM edicao (21 casos);
  git diff --name-only -- backend/test/ VAZIO na Task 2.
  ZERO DESVIOS: nenhuma Rule 1-4 acionada, nenhum pacote instalado.
  ATENCAO PARA QUEM SEGUIR: o cenario (6) e o UNICO da suite que mede o custo AGREGADO de
  uma excecao montada FORA do try/catch do envio. Quem inverter a ordem dos dois negocios o
  torna verde com o defeito presente. E a assercao de ausencia de `undefined`/`null` no
  HTML nao deve ser "simplificada" para contagem de envios.
  Commits: 3f38b6a (RED), 5fd6be8 (GREEN).

Status anterior: WR4-06 FECHADO PELO 04-31 (2026-08-05)

  O 04-31 fechou o achado em que o ERRO ERA LIDO PELO OPERADOR ANTES DE UMA DECISAO: a previa
  somente-leitura (runCheckOnly, POST /api/notifications/check) aplicava UM filtro — tarefas
  futuras — enquanto runCheck aplicava QUATRO guardas antes do envio (dedup do dia, categoria
  indecidivel, funil sem notificacao ao responsavel, e o else de notificacoes/destinatario). O
  consumidor nao e tabela decorativa: e o rotulo do botao de disparo, que renderizava
  literalmente "Enviar notificacoes (N negocios)". A UI prometia N e o envio entregava
  N menos (indecidiveis + Beefor). Medido na entrada: ZERO casos sobre runCheckOnly em toda a
  suite, e ZERO ocorrencias de seraNotificado no repositorio.
  AGORA: runCheckOnly acrescenta `seraNotificado` por negocio — a conjuncao dos MESMOS quatro
  predicados — e le notify_author e notifications_enabled, como a rodada real. A configuracao de
  notificacoes entra de proposito (D-WR4-06-b): a pergunta do botao e "quantos vao receber se eu
  clicar AGORA", e com as notificacoes desligadas a resposta honesta e zero. A dedup e consultada
  UMA vez por negocio e o valor e reusado pelos dois campos — alreadyNotifiedToday(deal.id)
  nao-comentario continua em 2, o mesmo valor de entrada (D-WR4-06-c).
  MARCA, NAO REMOVE (D-WR4-06-a): a lista continua filtrada so por tarefas futuras
  (futureTasks.has(deal.id) nao-comentario = 1) e o comprimento dela nao muda — e a metade
  "permanece no painel" da decisao do usuario, e e ela que da sentido ao `total` que o card
  exibe. O card e o toast continuam contando `total` (D-WR4-06-g): sao perguntas diferentes.
  O ORACULO E A IGUALDADE, NAO O CAMPO (D-WR4-06-d, a decisao central). Duplicar os predicados
  cria um segundo lugar para a regra divergir — o mecanismo exato de WR3-01 —, e extrair um
  predicado compartilhado seria refatoracao estrutural da cadeia de guardas de runCheck, no
  caminho do Core Value, que a constraint de processo do CLAUDE.md proibe misturar a uma
  correcao. A resposta foi um oraculo: os cenarios F e G rodam runCheckOnly() e runCheck() contra
  a MESMA armacao e exigem que o conjunto de ids PROMETIDOS seja IGUAL ao conjunto de ids
  NOTIFICADOS de fato — medido pela linha 'sent' no notification_log, e NAO por r.notified, que e
  contador e nao diz QUAIS. Cada caso tem guarda de NAO-VACUIDADE (o conjunto prometido e
  asserido contra [segundo]), senao dois conjuntos vazios satisfariam a igualdade.
  O SIMETRICO E DE FILTRO, NAO DE POSICAO, e e ele que fecha o achado: F cobre o filtro do
  achado (categoria indecidivel, do 04-20) e G cobre o funil Beefor, ANTERIOR ao 04-20. Sem o G,
  um conserto que tratasse so `categoriaIndecidivel` ficaria verde e a previa continuaria
  mentindo pelo funil. Ordem fixada por D-WR4-06-e: runCheckOnly() ANTES de runCheck(), porque a
  previa e somente leitura e o envio grava — invertida, a linha 'sent' mudaria a resposta da
  dedup DENTRO da previa e o oraculo mediria o rastro do proprio teste.
  RED literal, previsao do plano batendo nos dois: F e G vermelhos na PRIMEIRA assercao sobre
  seraNotificado, com `+ undefined / - expected false`, e A a E verdes. A condicao de PARAR
  ("se algum ficar verde, o campo ja existe por caminho nao medido") nao foi atingida.
  FRONTEND: aNotificarCount conta os itens com seraNotificado verdadeiro, com FALLBACK para
  `total` quando nenhum item traz o campo (D-WR4-06-f) — a resposta anterior e restaurada de
  localStorage sob `dashboard_check_cache` ao montar, entao logo apos o deploy o painel pode
  renderizar uma resposta de backend antigo; sem fallback o botao diria ZERO e o operador
  concluiria que nao ha ninguem a notificar. O rotulo passou a dizer "(N a notificar)".
  TODOS OS NUMEROS PRESCRITOS BATERAM, inclusive `git diff | grep -c "results\."` = 0 no comando
  LITERAL do plano (sem precisar de -U0, ao contrario do 04-30) — runCheck ficou byte a byte.
  Invariantes de scheduler.js preservadas e medidas: 1 catch (erroDeRegistro), 2
  results.notified++, 3 continue;, 3 skipReason, 3 skippedCategoriaIndecidivel, 1
  futureTasks.has(deal.id), 2 alreadyNotifiedToday(deal.id), 1 seraNotificado nao-comentario.
  agendor.js, routes/notifications.js e os todos: AUSENTES do diff.
  UMA DIVERGENCIA DE MEDICAO, registrada e nao forcada: `grep -c "checkResult.total"` no
  Dashboard.jsx da 2 como o plano previa, mas por COMPOSICAO DIFERENTE — o plano dizia "o card e
  o toast", e o toast usa `result.total` (sem o prefixo `checkResult`), que o padrao nao casa; os
  2 sao o card e o FALLBACK novo. Numero igual, motivo diferente. Segunda medicao ajustada: o
  inventario dizia que nenhum texto do DealsList.jsx usa "notificar" para prometer envio, e a
  palavra APARECE uma vez — em "(sem notificacao)", que DECLARA uma exclusao em vez de prometer
  um envio, e a exclusao declarada e justamente a de tarefas futuras, o unico filtro que a previa
  ja aplicava. A classificacao verificada-e-sa sobrevive por outra medicao, mais forte: nem
  DealsList.jsx nem ReportPanel.jsx tem botao de disparo (0 chamadas a notifications/run|check).
  in3-08 CONTINUA ABERTO E NAO FOI TOCADO, por decisao registrada: shouldNotifyOwner transforma
  funil ausente em string vazia e por isso NOTIFICA; conserta-lo mudaria QUEM RECEBE, esta pinado
  como quirk em agendor.funnel.test.js, e a pergunta central e de DIRECAO (fail-open ou fail-safe
  para os filtros de elegibilidade), reservada ao usuario. Este plano o ALCANCA sem o consertar:
  a previa passou a EXIBIR o resultado de shouldNotifyOwner, tornando o efeito visivel.
  ZERO DESVIOS: nenhuma Rule 1-4 acionada, nenhum pacote instalado, package.json e lockfiles
  intocados. Suite 181 -> 183 (os 2 novos sao F e G), cobertura exit 0, lint exit 0 no backend
  (44 warnings) e no frontend (60 warnings), `npm run build` exit 0.
  ATENCAO PARA QUEM SEGUIR: os cenarios F e G sao o UNICO lugar da suite que compara a PREVIA com
  o ENVIO. Quem acrescentar uma quinta guarda a runCheck e NAO acrescentar o predicado
  correspondente a runCheckOnly deixa os dois vermelhos — e essa e a funcao deles. Nao
  "simplificar" a guarda de nao-vacuidade nem inverter a ordem das duas chamadas.
  Commits: 15f534a (RED), 1b82e39 (GREEN), ca05995 (frontend).

Status anterior: WR4-04 E IN4-01 FECHADOS PELO 04-30 (2026-08-05)

  O 04-30 fechou o achado que nasceu como CONSEQUENCIA NAO AVALIADA do 04-19: o retry da borda
  entrou no UNICO ponto do modulo cujo fan-out e proporcional ao VOLUME DE DADOS. getOrgCategory
  dispara uma requisicao por organizacao unica, todas simultaneas num Promise.all, e desde CR3-01
  cada uma passa por fetchWithRetry — sob HTTP 429, N requisicoes viram 3N. O erro retentado e
  justamente o que a API usa para pedir MENOS trafego, entao retentar em massa PROLONGA a propria
  janela de rate limit que causou a falha, e e essa janela que produz a supressao em massa que o
  04-28 tornou audivel.
  O AGRAVANTE, MEDIDO: getStaleDeals e tambem o caminho de LEITURA do painel. Sao OITO invocacoes
  de getStaleDeals( fora do agendor.js — 3 no scheduler.js, 1 em routes/deals.js, 1 em
  routes/reports.js e TRES em routes/notifications.js (o plano media 6, contando notifications
  uma vez so). Com o auto-refresh do DealsList.jsx, cada atualizacao de tela com a API rate-
  limitada passou a custar 3N requisicoes e ate ~15 s dentro do handler HTTP.
  AGORA: LOTE_DE_ORGS = 10, constante de modulo EXPORTADA, e a fase de categorias saiu do
  Promise.all unico para um `for` sobre fatias de uniqueOrgIds com Promise.all por fatia. O par
  [id, categoria] foi preservado byte a byte — e ele que impede a categoria trocada que reabriria
  o fail-open de CR3-01 por caminho novo. SEM pausa entre lotes (D-WR4-04-b): a pausa da
  paginacao existe porque cada requisicao de la traz 100 registros; aqui o objetivo e limitar
  CONCORRENCIA, nao taxa. Promise.all nao-comentario em agendor.js continua em 2, e nenhum
  setTimeout novo entrou no diff. O lote vive DENTRO de getStaleDeals, entao as OITO invocacoes
  herdam de graca — zero linhas de rota no diff.
  O ORACULO E CONCORRENCIA EM VOO, NAO CONTAGEM TOTAL (D-WR4-04-d), e a distincao e o proprio
  conserto: totalOrganizacoes vale 25 nos DOIS estados, antes e depois. Contagem total nao
  distingue "10 de cada vez" de "25 de uma vez". O stub mantem emVoo/maxEmVoo/total por borda e
  resolve por setImmediate — um stub sincrono resolveria antes de a proxima chamada do map sair e
  o maximo medido seria SEMPRE 1, marcando concorrencia 1 em QUALQUER implementacao (R4-15, nao
  materializado porque a mitigacao estava prescrita).
  RED literal, previsao do plano batendo nos tres casos: (1) vermelho com
  `maximo em voo medido = 25`, (2) SIMETRICO e (3) IRMAO VERIFICADO verdes ja no estado atual. A
  condicao de PARAR nao foi atingida.
  IN4-01 FECHADO DENTRO DESTE PLANO, e por necessidade e nao por carona (D-WR4-04-e): o
  comentario dizia "batches de 10" logo acima de `const batchSize = 5;`, e este plano introduziu
  uma SEGUNDA constante de lote cujo valor E 10 — a frase errada ao lado dela tornaria os dois
  lotes indistinguiveis. O numero foi REMOVIDO em vez de corrigido: o comentario aponta para o
  identificador batchSize, que nao pode divergir de si mesmo. grep "batches de 10" = 0.
  QUATRO DIVERGENCIAS DE MEDICAO, todas registradas e nenhuma forcada: (1) ORGS_UNICAS NAO e
  derivada de LOTE_DE_ORGS e sim ASSERIDA contra ela (`LOTE_DE_ORGS < ORGS_UNICAS`) — no instante
  do RED a constante nao existe, o import devolve undefined e uma derivacao daria NaN, apagando
  a propria medicao de 25 em voo que o plano exige; a guarda explicita e MAIS FORTE contra o
  falso positivo, porque uma derivacao faria a fixture crescer EM SILENCIO junto com o teto;
  (2) os greps de IN4-02 e IN4-05 devolvem 1 e nao 0 pelo CONTEXTO do diff e pelo cabecalho de
  hunk — com `git diff -U0` os dois dao 0, e as duas conclusoes sobrevivem por medicao; (3) os
  "6 pontos de chamada" de getStaleDeals sao 8 invocacoes, o que torna o inventario MAIS forte;
  (4) Promise.all nao-comentario em backend/src = 11 (bate), mas as linhas que casam subiram de
  14 para 16 por MENCAO em comentario novo.
  SEXTA rodada da fase com divergencia de contagem; a de nº 2 e da mesma classe da nº 2 do 04-29
  (forma do padrao de grep), e a nº 1 e de classe NOVA: decisao de instrumento tomada dentro da
  acao porque a prescricao era impossivel no instante do RED.
  IN4-02 e IN4-05 AUSENTES do diff por criterio (-U0 = 0 nos dois). Contratos herdados medidos e
  nao regredidos: await api.get( = 0, fetchWithRetry( = 6, api.get( = 5, MAX_PAGES nao-comentario
  = 10, of data.data) = 0. Os DEZ arquivos vizinhos verdes SEM edicao (55 casos); em particular
  agendor.cacheInvalidation.test.js verde e byte a byte — e ELE a evidencia de que o RESULTADO
  nao mudou (git diff --name-only -- backend/test/ VAZIO na Task 2). Suite 178 -> 181, agendor.js
  100% linhas / 91,72% branches (era 100% / 91,6%), lint exit 0 (44 warnings, baseline).
  ZERO DESVIOS de escopo: nenhuma Rule 1-4 acionada, nenhum pacote instalado.
  ESCOPO QUE O 04-30 NAO FECHA: jitter e circuit breaker (o achado os nomeia; este plano entrega
  so o teto de concorrencia, e D-WR4-04-b exige medir antes) e o fan-out gemeo de
  GET /api/notifications/resolved — o TERCEIRO Promise.all proporcional ao dado do backend, com
  getNotifiedDeals() sem LIMIT; dono: todo `wr4-04b`, a criar no 04-34.
  ATENCAO: agendor.loteDeOrganizacoes.test.js e o oraculo de CONCORRENCIA, e a distincao importa —
  ele fica vermelho se alguem "otimizar" o lote de volta para um Promise.all unico, e continua
  verde se o total de requisicoes mudar. Uma sexta borda com fan-out proporcional ao dado entra
  ali com o trio completo: teto medido em voo, simetrico de resultado inalterado, irmao
  VERIFICADO. A guarda de nao-vacuidade do caso (1) e deliberada e NAO deve ser "simplificada"
  para uma derivacao.
  Commits: adbe279 (RED), 531479e (GREEN), 0ede631 (SUMMARY).

Status anterior: WR4-01 E WR4-05 FECHADOS PELO 04-29 (2026-08-05)

  O 04-29 fechou os dois vizinhos de codigo que a r3 deixou abertos no MESMO modulo, e os dois
  terminavam no mesmo lugar: o finally de runCheck que devolve isRunning a false.
  WR4-01 — getStaleDeals era a TERCEIRA paginacao sem teto, e a justificativa ESCRITA no
  agendor.js para dispensa-la era factualmente FALSA ("limitada por construcao, e nao existe ali
  condicao de parada vinda da resposta a ser frustrada"). O array de paginas e finito, mas o seu
  COMPRIMENTO sai de Math.ceil(meta.totalCount / perPage) — um valor da BORDA.
  O RED MEDIU O DESFECHO DE FUNDO, e ele e pior do que o travamento: com totalCount inflado,
  getStaleDeals percorreu as 201 paginas anunciadas e RESOLVEU COM SUCESSO em 39,08 s (40 lotes
  de 5 com a pausa de 1 s). Uma rodada que resolve nao deixa vestigio de erro nenhum; num
  totalCount de 10^9 os mesmos 39 s viram semanas de laco com isRunning preso. O estouro de tempo
  so aparece porque o runner tem teto — producao nao tem.
  AGORA: `totalPages > MAX_PAGES` com throw IMEDIATAMENTE apos derivar totalPages e ANTES do
  Array.from — a posicao E a decisao, porque a alocacao do array sozinha ja e modo de falha
  contra o max_memory_restart de 300M. Nunca Math.min (grep = 0), que trocaria nao-terminacao por
  resultado PARCIAL silencioso. MESMA constante MAX_PAGES das outras duas bordas (nao-comentario
  8 -> 10), mas MENSAGEM PROPRIA: /users e /tasks culpam o parametro page, /deals culpa
  meta.totalCount — mecanismo diferente, e uma mensagem copiada mandaria o investigador para o
  lugar errado. O teste ganhou padraoDoTetoDeDeals() separado, com o numero ainda DERIVADO.
  WR4-05 — getUsers era a UNICA das quatro desreferencias de data.data do modulo sem fallback.
  RED literal, e a previsao do plano bateu ate na mensagem: TypeError 'data.data is not iterable'
  em getUsers, que NAO e capturado em lugar nenhum da funcao e sobe pelo Promise.all de runCheck,
  abortando a rodada ANTES do laco de envio. Agora `data.data || []`, a MESMA forma da irma — a
  uniformidade entre as tres E o conserto. getUsers RESOLVE e nao rejeita (D-WR4-05-b): sem data
  tambem nao ha links.next, entao o laco encerra na mesma volta e rejeitar transformaria "zero
  usuarios cadastrados" em rodada abortada. `of data.data)` nao-comentario = 0: as quatro
  desreferencias estao guardadas.
  O CASO (8) E O MOLDE DO MANDATO DA RODADA: um unico caso serve envelope sem `data` em /tasks E
  /deals e assere que as DUAS irmas resolvem — VERIFICADAS por medicao, nao presumidas pela
  leitura. Mesmo papel do cenario F do 04-23.
  TRES DIVERGENCIAS DE MEDICAO, todas registradas e nenhuma forcada: (1) a FORMA do RED — o caso
  (5) cancela o ARQUIVO inteiro por timeout e (6),(7),(8) nunca sao reportados; medidos
  separadamente por --test-name-pattern, exatamente o precedente do 04-25 no mesmo arquivo;
  (2) `Array.from({ length:` devolve 0 e nao 1 porque o Biome quebrou a chamada em duas linhas —
  `Array.from(` nao-comentario = 1, e a conclusao do inventario sobrevive; (3) o plano media que
  ROADMAP e REQUIREMENTS nao nomeiam getStaleDeals, e nomeiam (4 e 3 vezes) — mas NENHUMA das 7
  ocorrencias fala de paginacao, volume ou teto (sao TEST-02, REL-04/C9, titulos de plano e
  PERF-01), entao a classificacao verificadas-e-sas sobrevive POR MEDICAO. meta.totalCount e
  MAX_PAGES = 0 nos dois, como previsto. QUINTA rodada da fase com divergencia de contagem; as 4
  anteriores foram MENCAO em comentario, estas duas sao de outra classe (forma do padrao de grep
  e sub-termo errado numa medicao composta).
  IN4-05 e IN4-02 AUSENTES do diff por criterio (TASKS_PER_PAGE, getDealsWithFutureTasks e
  "tres vezes" = 0). Contrato de 04-22/04-25 preservado: await api.get( = 0, fetchWithRetry( = 6,
  while (page <= MAX_PAGES) = 2. Os NOVE arquivos vizinhos verdes SEM edicao (git diff --name-only
  -- backend/test/ vazio na Task 2). Suite 174 -> 178, agendor.js 100% linhas / 91,6% branches
  (era 90,69% / 88,42%), lint exit 0 (44 warnings, baseline). ZERO DESVIOS de escopo.
  ATENCAO: agendor.paginacao.test.js deixou de ser o oraculo so da TERMINACAO e passou a ser
  tambem o do TRATAMENTO DO ENVELOPE. Uma quarta borda entra ali com o par completo: teto +
  simetrico legitimo + envelope sem `data`.
  Commits: fcc9611 (RED), 6f6d3a3 (GREEN), 375ed55 (SUMMARY).

Status anterior: CR4-01 (O BLOCKER DA R4) FECHADO PELO 04-28 (2026-08-05)

  O 04-28 fechou CR4-01. O conserto do CR3-01 tinha fechado o fail-open para UMA organizacao e
  aberto uma supressao em massa OPERACIONALMENTE INVISIVEL: com a borda /organizations/:id fora,
  results.error undefined, results.errors [], zero e-mails, zero linhas em notification_log e o
  log dizendo "Concluido: N negocios parados, 0 notificacoes enviadas" — o mesmo resultado
  observavel de um dia calmo. results.skipped era o MESMO contador de dedup, funil e "sem
  destinatario".
  AGORA: results.skippedCategoriaIndecidivel nasce no LITERAL de results (o campo existe SEMPRE
  no payload, nenhum consumidor precisa distinguir undefined de zero) e incrementa SEMPRE. O
  ALARME so na supressao TOTAL (results.stale > 0 && contador === results.stale), preenchendo as
  DUAS superficies — results.error (a que a decisao do usuario nomeia) e results.errors (a UNICA
  que o Dashboard renderiza, medido) — mais logger.error com tag [Scheduler], so com inteiros e
  texto fixo (CR-02 do 04-09). O quarto e ultimo ramo de skip sem motivo ganhou skipReason,
  distinguindo "notificacoes desativadas" de "nenhum destinatario com e-mail cadastrado".
  O ENQUADRAMENTO CORRETO DE D-CR4-01-a FICOU ESCRITO NO CODIGO: o bloco do alarme e ADITIVO,
  mora DEPOIS do laco e NAO decide quem recebe e-mail — nenhum limiar pode fazer isso. A
  invariante preservada e o CONTRATO AGREGADO-OBSERVAVEL do CR3-01, pinado nos cenarios A e B
  (campo de erro vazio com 1 de 2 suprimidos). A formulacao antiga e FALSA ("um limiar menor
  mudaria o comportamento por-negocio") NAO foi escrita.
  O PAR D + E E O QUE FECHA O ACHADO: D (2 de 2 por categoria) prova que o apagao passa a ser
  audivel; E (2 de 2 por FUNIL Beefor, com o MESMO results.skipped, o MESMO notified: 0 e a MESMA
  linha de conclusao) prova que o alarme discrimina a CAUSA e nao a quantidade. Sem o E, qualquer
  implementacao que ligasse o alarme em results.notified === 0 ou em skipped === stale passaria.
  PRIMEIRA RODADA DA FASE EM QUE NENHUM NUMERO PRESCRITO DIVERGIU DO MEDIDO: as 4 rodadas
  anteriores tiveram divergencia por MENCAO dentro de comentario; aqui os comentarios novos foram
  escritos sem reproduzir os identificadores medidos (skipReason total = nao-comentario = 3).
  UMA DIVERGENCIA DE PREVISAO, registrada e nao forcada: o plano previa o cenario E VERDE no RED,
  mas E assere o contador === 0 e o campo era undefined — E nao tinha como ficar verde. A ordem
  das assercoes de E foi escrita com as do funil ANTES da do contador (o plano so fixa ordem para
  D), entao o RED provou por MEDICAO que a armacao do funil produzia a supressao esperada — a
  condicao de PARAR ("a armacao do funil nao esta produzindo a supressao") nao foi atingida.
  IN4-04 e runCheckOnly AUSENTES do diff por criterio (grep = 0 nos dois). agendor.js intocado.
  2 RESIDUAIS COM DONO ja previstos para o 04-34, agora com medicao no SUMMARY: `cr4-01b` (a
  rodada MISTA — um negocio SEM organizacao escapa da contagem e desarma o alarme; denominador
  derivado REJEITADO porque deal.organization na lista enriquecida e o NOME e nao o id, o que
  faria o alarme falhar ABERTO por caminho novo) e `cr4-01c` (skipReason invisivel na UI, 0
  ocorrencias em frontend/src).
  Commits: a8c4e67 (RED), c801cf7 (GREEN), c5c426c (SUMMARY).

  --- planejamento da r4 abaixo ---
Status anterior: 7 PLANOS DA R4 CRIADOS E VERIFICADOS (2026-08-05)

  Planos 04-28..04-34, waves 21-27, cadeia sequencial. Plan-checker: VERIFICATION PASSED NA
  PRIMEIRA PASSADA — primeira vez nesta fase. Cobertura REL-01..06 = 6/6.
  04-28 CR4-01 (blocker) | 04-29 WR4-01+WR4-05 | 04-30 WR4-04 | 04-31 WR4-06
  04-32 WR4-07 | 04-33 WR4-02+WR4-03 (diff de producao zero) | 04-34 IN4-* + 5 residuais

  O MANDATO "INVENTARIO DE IRMAOS" PASSOU NO TESTE DECISIVO (o mesmo que expos a lacuna do 04-26
  na r3): todo item classificado como corrigida/verificada-e-sa carrega grep, teste de regressao
  ou citacao de leitura de codigo — nenhum item nomeado sem gate. O checker reproduziu
  independentemente os conjuntos de linhas do 04-33 e bateu no numero exato.

  DECISAO D-CR4-01-a — LIMIAR DO ALARME: supressao TOTAL (todos os negocios da rodada).
  O contador `results.skippedCategoriaIndecidivel` incrementa SEMPRE (desfaz a ambiguidade dos 4
  `results.skipped++` compartilhados com dedup, funil e "sem destinatario"); o ALARME so na
  supressao total, preenchendo `results.error` E `results.errors` — medido: o Dashboard.jsx NAO le
  `results.error` em lugar nenhum, o unico bloco renderizado e `lastRun.errors`.
  ENQUADRAMENTO CORRETO (corrigido apos o checker, commit 82d2550): o bloco do alarme e ADITIVO,
  fica DEPOIS do laco e NAO condiciona nenhum continue/skip — NENHUM limiar pode mudar quem recebe.
  A invariante preservada e o CONTRATO AGREGADO-OBSERVAVEL do CR3-01, pinado nos casos A e B de
  scheduler.categoriaIndecidivel.test.js (`r.error === undefined` com 1 de 2 suprimidos). Um limiar
  abaixo de 100% os tornaria vermelhos porque a rodada passaria a se ANUNCIAR como falha num
  cenario que o contrato fixou como normal — nao porque alguem deixaria de ser notificado.
  NAO citar este precedente para justificar mudanca de comportamento por-negocio.

  `in3-08` NAO foi promovido a plano, por decisao do planejador registrada como
  fora-de-escopo-com-medicao no inventario do 04-31: conserta-lo muda QUEM RECEBE (negocios sem
  funil deixariam de ser notificados), esta pinado como quirk em agendor.funnel.test.js, e a
  pergunta central e de DIRECAO (fail-open ou fail-safe para filtros de elegibilidade). Promove-lo
  seria um plano 04-35 e uma decisao do usuario.

  IN4-01 e fechado DENTRO do 04-30 (nao vira todo): o comentario "(batches de 10)" fica ao lado de
  `batchSize = 5` e o 04-30 introduz uma segunda constante de lote cujo valor E 10 — deixar a frase
  errada tornaria os dois lotes indistinguiveis. Mesmo precedente do in2-02 fechado pelo 04-26.

  5 RESIDUAIS NOVOS com dono, criados no 04-34, saidos dos inventarios de irmaos: `cr4-01b` (o
  limiar "todos" nao cobre a rodada MISTA — um negocio sem organizacao escapa da contagem e desarma
  o alarme), `cr4-01c` (skipReason invisivel na UI: 0 ocorrencias em frontend/src), `wr4-03b` (39
  linhas em 9 arquivos com referencia por numero, contra o in3-06 que nomeia so um arquivo),
  `wr4-04b` (fan-out gemeo em GET /api/notifications/resolved, com SELECT sem LIMIT), `wr4-07b`
  (dealEmailHtml interpolando nome nulo).

  --- historico anterior abaixo ---
Origem: CODE REVIEW RODADA 4 (2026-08-05)

  O 04-REVIEW.md (round: 4, 15 arquivos, standard) achou 1 BLOCKER, 7 warnings e 6 info sobre o
  codigo do gap closure r3. As rodadas 1-3 estao preservadas em 04-REVIEW-r1.md, -r2.md e -r3.md.
  Suite 172/172 e lint exit 0 — os testes NAO acusam o blocker.

  CR4-01 (BLOCKER): o conserto do CR3-01 fechou o fail-open para UMA organizacao e abriu uma
  SUPRESSAO EM MASSA OPERACIONALMENTE INVISIVEL. Sonda com 5 organizacoes em 429 persistente:
  results.error undefined, results.errors [], results.notified 0, ZERO e-mails, ZERO linhas em
  notification_log, e o log diria "Concluido: 5 negocios parados, 0 notificacoes enviadas".
  results.skipped e o MESMO contador de dedup, funil e "sem destinatario"; skipReason existe mas
  `grep -rn "skipReason" frontend/src` devolve 0. Um apagao total e indistinguivel de um dia calmo.
  A decisao do usuario cobriu "nao abortar por UMA organizacao" — ninguem perguntou o que acontece
  quando sao TODAS.

  DECISAO DO USUARIO sobre CR4-01 (vinculante, 2026-08-05): SINALIZAR COMO ERRO DA RODADA.
  Quando a supressao por indecidivel passa de um limiar (todos os negocios, ou uma proporcao alta),
  a rodada preenche `results.error` e logga em nivel de erro, para que o dia calmo deixe de ser
  indistinguivel do apagao. NAO muda o comportamento POR-NEGOCIO ja aprovado no CR3-01 — o negocio
  indecidivel isolado continua fora do envio, dentro do painel, com logger.warn.

  DECISAO DO USUARIO sobre o escopo (2026-08-05): gap closure r4 COMPLETA — blocker + os 7 warnings.

  VEREDITO DO REVISOR SOBRE O MANDATO DO CENARIO SIMETRICO (r3): funcionou — os simetricos
  entregues sao majoritariamente substantivos, nao cerimoniais (o melhor e o G do 04-24, que
  antecipou a armadilha do conserto "natural" de F; o F do 04-23 e a unica vez na fase em que o
  vizinho foi VERIFICADO em vez de presumido; o mais fraco e o B do 04-20). MAS O MANDATO RESOLVEU
  O PROBLEMA ERRADO: o padrao que reprovou r1->r2->r3 nunca foi "faltou o input simetrico", foi
  "FALTOU O CODIGO VIZINHO" — a funcao irma, o terceiro call-site, o outro arquivo que documenta a
  mesma coisa. Simetrico de ENTRADA nao detecta vizinho de CODIGO.
  RECOMENDACAO PARA A R4, adotada: trocar o mandato por "INVENTARIO DE IRMAOS" — para cada
  conserto, listar POR ESCRITO todas as construcoes gemeas e marcar cada uma como corrigida /
  verificada-e-sa / fora-de-escopo-com-medicao. Foi assim que WR4-01 e WR4-02 apareceram.

  Achados da r4 que vieram do inventario de irmaos:

  - WR4-01: `getStaleDeals` e a TERCEIRA paginacao sem teto, e a justificativa escrita para
    exclui-la (agendor.js, "nao existe ali condicao de parada vinda da resposta") e FALSA:
    `Array.from({length: totalPages - 1})` deriva o comprimento de `meta.totalCount`. Sonda: 201
    requisicoes, passando do MAX_PAGES, sem excecao — o mesmo isRunning preso que WR3-06 existe
    para impedir. Mesmo perfil de risco do achado que motivou o 04-25.

  - WR4-02: o commit 46cf90a (WR3-05) atualizou 2 dos 4 comentarios que declaram a copia do helper
    viva; agendor.retry429.test.js e helpers/fakeTimers.js hoje se CONTRADIZEM.

  - WR4-03: as 4 referencias por numero de linha em emailer.timeout.test.js estao TODAS erradas.
  - WR4-04 a WR4-07: 3N requisicoes no caminho de leitura do painel; getUsers sem a guarda de
    `data.data` que as irmas usam; runCheckOnly promete notificar o que runCheck nao notifica;
    ownerWeeklyHtml sem guarda de ownerName.

  O revisor concorda que o todo `in3-08` (shouldNotifyOwner falha ABERTA com funil ausente) merece
  severidade acima de Info — nao o reabriu por ja ter dono, mas e o ULTIMO filtro de elegibilidade
  fail-open ainda aberto.

  --- historico anterior abaixo ---

  O 04-27 fechou o RESIDUO DOCUMENTAL da rodada 3 — o ultimo plano da gap closure r3, e o
  unico da rodada com DIFF DE BACKEND ZERO por criterio de aceite (git status --porcelain
  backend/ vazio nas TRES tasks). Nao e um plano de conserto: e o que impede a rodada de
  terminar deixando achado sem dono.
  OS 8 INFO VIRARAM TODOS PENDENTES, NAO PLANOS — escopo travado pelo usuario, mesmo
  precedente de IN2-01..IN2-04 (04-18) e de IN-01..IN-04 (04-09). E esse precedente que
  permitiu ao 04-26 FECHAR o in2-02 com evidencia: achado sem arquivo nao sobrevive a fase.
  ls .planning/todos/pending/in3-0*.md = 8, cada arquivo entre 64 e 88 linhas, no molde do
  in2-02 (frontmatter + Onde / O que acontece / Por que isso importa / Correcao proposta).
  PRIORIDADES conforme D-IN3-b, com o motivo escrito em cada arquivo: in3-01 media,
  in3-02 baixa, in3-03 baixa, in3-04 media, in3-05 baixa, in3-06 baixa, in3-07 media,
  in3-08 ALTA.
  in3-08 E O QUE IMPORTA PARA A PROXIMA FASE, e esta declarado CANDIDATO A PROMOCAO A
  REQUISITO: shouldNotifyOwner transforma funil ausente em string vazia, que nao esta em
  NO_OWNER_NOTIFY_FUNNELS, entao NOTIFICA. Esta pinado como quirk conhecido em
  agendor.funnel.test.js — por isso o review classificou como Info e nao Warning. O que falta
  nao e cobertura: e a AVALIACAO DE RISCO. Este e o SEGUNDO filtro de elegibilidade que falha
  aberto, e o primeiro foi o BLOQUEANTE desta rodada (CR3-01). Nenhum plano da fase olhou os
  filtros como CATEGORIA. A pergunta de direcao (fail-open ou fail-safe para os filtros de
  elegibilidade como um todo) e o item central do arquivo, com a rota "indecidivel" aprovada
  pelo usuario em 2026-08-05 registrada como precedente disponivel — ela nao escolhe entre
  notificar e nao notificar: e fail-safe VISIVEL.
  A CONVENCAO DE WR2-06 FOI APLICADA AOS PROPRIOS ARTEFATOS (D-IN3-a): grep -cE
  "\.js:[0-9]|linhas? [0-9]" = 0 nos OITO, inclusive no in3-06, que fala SOBRE esse padrao sem
  reproduzi-lo. Cada todo cita funcao, identificador, arquivo ou nome de caso de teste.
  TRES PARES DECLARADOS para nao serem fechados pela metade: in3-01 + in2-04 (o dado existir no
  banco e aparecer para quem opera), in3-02 + in2-01 (as DUAS politicas de retry do sistema —
  in3-02 REFERENCIA aquele arquivo em vez de duplica-lo, D-IN3-c), in3-04 + in3-06 (o gate de
  CI e o residual que ele apanharia).
  ROADMAP: item 7 NOVO nos Success Criteria da Fase 4, e o item 4 (redacao aprovada em C9) NAO
  foi reescrito — D-IN3-d. Medido: 1 insercao e ZERO remocoes no arquivo inteiro; o grep por
  orgCategoryCache em linhas removidas do diff = 0. O item 7 e escrito como COMPORTAMENTO
  GARANTIDO e nao nomeia nenhum identificador (nem CATEGORIA_INDECIDIVEL, nem fetchWithRetry,
  nem categoriaIndecidivel): fora de TODO e-mail dirigido ao responsavel, visivel no painel /
  consolidado do admin / snapshot, rodada NAO abortada, e so depois de o retry da borda se
  esgotar. E a licao de C9 aplicada preventivamente — um criterio que nomeia mecanismo faz o
  verificador procurar por um identificador que o refactor seguinte apaga.
  REQUIREMENTS: REL-06 recebeu NOTA entre parenteses (padrao de REL-04/REL-05), nao um REL-07 —
  D-IN3-e. A mesma regra ("completo ou falha explicita") passa a valer para a consulta de
  categoria a partir de CR3-01, com a diferenca que importa registrada: aqui a falha e
  explicita e ESCOPADA AO NEGOCIO afetado, em vez de custar a rodada inteira como em /tasks.
  Tabela de rastreabilidade INTOCADA (grep "| Phase" no diff = 0).
  ARMADILHA DE MEDICAO, a mesma classe das tres divergencias da rodada: grep -c "indecidível"
  no ROADMAP devolve 3, nao 1. NAO e divergencia — as outras 2 ocorrencias sao as descricoes
  dos planos 04-20 e 04-21 na lista da r3, PREEXISTENTES. A ocorrencia que o criterio pede esta
  onde deveria, dentro do bloco de Success Criteria. Numero do plano nao forcado.
  NENHUM TODO COM PRIORIDADE DECIDIDA PELO USUARIO FOI TOCADO: in-01 (media, C10), rel-02b
  (alta / pre-go-live, C11), sec-01 (aberto, C8) e o recem-criado wr3-07b continuam byte a
  byte — nenhum deles aparece no diff. SEC-01 permanece ABERTO e nao foi declarado resolvido em
  lugar nenhum; o valor do AGENDOR_TOKEN nao aparece em nenhum artefato deste plano.
  Suite 172/172 verde e lint exit 0 (44 warnings, baseline) — executados como PROVA de que
  nenhuma mudanca de codigo se disfarcou de documentacao. ZERO DESVIOS: nenhuma Rule 1-4
  acionada, nenhum pacote instalado.
  ESCOPO QUE O 04-27 NAO FECHA: os 8 achados continuam ABERTOS. Este plano os torna
  rastreaveis, nao os conserta. Dois pedem DECISAO antes de qualquer codigo — in3-08 (direcao
  dos filtros de elegibilidade, candidato a requisito da fase seguinte) e in3-07 (reusar o
  transporte SMTP entre negocios da mesma rodada, com o socketTimeout de 30s / D-02 como teto
  de vida; a metade barata, renomear o caso (3) para falar em NEGOCIO, pode sair a qualquer
  momento).
  Commits: 45a6312 (Task 1), 10f146a (Task 2), edd7cfb (Task 3), a506739 (SUMMARY).

  O 04-26 fechou os TRES achados da rodada 3 sobre o INSTRUMENTO, nao sobre o produto. Os
  tres produzem o mesmo dano: um vermelho atribuido ao ATOR ERRADO, apontando para um
  defeito de producao que nao existe — numa suite que existe para ser o oraculo de quem e
  notificado, isso corroi a confianca em tudo o mais. DIFF DE PRODUCAO ZERO, medido sobre
  os tres commits (git diff --name-only HEAD~3 HEAD -- backend/src/ VAZIO), e ZERO
  assercoes alteradas nos seis arquivos de teste.
  WR3-04: tres arquivos habilitavam o relogio falso UMA VEZ num `before` de topo, entao
  cada tick(10000) de avancarRelogioAte (ate 200s por chamada) deixava o relogio adiantado
  para o caso seguinte — e o cutoff de 15 dias anda junto com ele. O precedente ja estava
  medido em agendor.retry429.test.js: 30s de adiantamento trouxeram os deals de fronteira
  102 e 104 para DENTRO do golden. Agora o enable vive no beforeEach, precedido de
  mock.timers.reset() (enable() lanca sobre timers ja habilitados). `before(` de topo = 0
  nos tres. O VIZINHO entrou: o review nomeava so os dois criados na rodada 2, mas o
  defeito foi COPIADO de partialFailure — corrigir so os nomeados repetiria pela quarta vez
  o padrao que reabriu esta fase tres vezes.
  WR3-05: a copia local de avancarRelogioAte em emailer.timeout.test.js (o oraculo de
  REL-02) mantinha o defeito que o 04-13 corrigiu no helper compartilhado — `then` de UM
  argumento, que deixa a promessa derivada orfa na rejeicao e faz o node:test creditar a
  falha ao caso VIZINHO. O motivo de manter a copia (nao trocar instrumento e objeto medido
  na mesma rodada) EXPIROU quando o 04-17 terminou de mexer no emailer.js. Agora
  helpers/fakeTimers.js e a UNICA implementacao em circulacao, e o VIZINHO entrou: a nota de
  topo do helper deixou de declarar a duplicacao como deliberada (diff do helper: 0 linhas
  nao-comentario).
  WR3-07: os dois arquivos de cache restauravam o estado global na ULTIMA instrucao do corpo
  do test() — restauracao no CAMINHO FELIZ, que nao roda quando uma assercao falha antes
  dela. Agora ha UM responsavel pelo estado em cada arquivo. Em cacheInvalidation o escopo
  foi COMPLETO (D-WR3-07-b): as TRES variaveis lidas pelo routeHandler no hook —
  dealsServidos, orgQueFalha e delete ORG_CATEGORY[201] —, e o VIZINHO aqui sao a segunda e
  a terceira, que o texto do achado nao citava. O `orgQueFalha = null` do MEIO do cenario (3)
  FICOU: ele nao e limpeza, e o passo em que a API volta a responder.
  D-WR3-07-c RESPEITADA E NAO 'COMPLETADA': em cacheConcurrency o beforeEach tem EXATAMENTE
  UMA atribuicao (cenarioAtivo). As outras 7 variaveis sao estado de ARMACAO, nao de
  cenario: os pontos de suspensao sao armados uma vez e consumidos ao longo da ordem
  declarada dos casos, e zera-los RE-ARMA uma suspensao que ninguem libera — os casos (2) e
  (3) DEIXAM DE TERMINAR ('Promise resolution is still pending but the event loop has
  already resolved'). Isso foi MEDIDO no planejamento, nao inferido. O que ficou de fora tem
  dono: .planning/todos/pending/wr3-07b-estado-de-armacao-em-cacheconcurrency.md (69 linhas),
  prioridade baixa, com a mensagem literal e a indicacao de que o conserto correto e escopar
  a armacao por caso (redesenho do arquivo), nao um hook.
  NENHUM CASO DEPENDIA DA CONTAMINACAO — a pergunta que a acao mandava PARAR e reportar. Os
  dois arquivos de cache ficaram 3/3 e os tres de notificationStatus 3/3 cada, sem edicao de
  assercao, ou seja, nenhum carregava o adiantamento do relogio como pre-condicao implicita.
  CENARIO SIMETRICO: ausente POR JUSTIFICATIVA ESCRITA no objetivo do plano — nenhuma das
  tres correcoes introduz ou altera ramificacao de comportamento, entao nao existe 'direcao
  oposta' de um beforeEach; o que se poderia asserir sobre ele e a suite continuar verde com
  o MESMO numero de casos, e isso foi criterio de aceite nas tres tasks. O que existe e o
  VIZINHO, e os tres entraram como trabalho obrigatorio.
  ARMADILHA DE MEDICAO CONFIRMADA (a que o plano avisou): uma varredura ingenua por
  'setTimeout' em `before` de topo acusa 3 arquivos (notificationStatus.test.js,
  scheduler.failsafe, scheduler.resilience). Os tres sao FALSO POSITIVO — a palavra aparece
  dentro de um comentario preexistente que explica por que so 'Date' e habilitado ali.
  Filtrando comentario: ZERO. D-WR3-04-b confirmada.
  UMA DIVERGENCIA, de escopo e para MENOS: o biome format refluiu dois `new Error(...)`
  PREEXISTENTES de canalParcial, alheios a hooks. Foram DEVOLVIDOS ao estado original para
  que o diff dos seis arquivos seja estritamente hooks, importacoes e comentario, como a
  acao do plano exige. Divida de formatacao preexistente registrada, nao silenciada.
  Todo in2-02 MOVIDO para .planning/todos/completed/ com o desfecho anotado (a correcao foi
  aplicada nos TRES arquivos, nao so no partialFailure que ele nomeava). NENHUM outro todo
  editado: in-01, rel-02b e sec-01 mantem prioridade e estado por decisao do usuario.
  SEC-01 permanece ABERTO (decisao C8) — nao tocado, nao declarado resolvido.
  Suite 172 -> 172 (o plano nao acrescenta casos), cobertura exit 0 (agendor.js 90,69%
  linhas / 88,42% branches, inalterada), lint exit 0 (44 warnings, baseline).
  Commits: 44c3e5c (WR3-04), 46cf90a (WR3-05), 3c94508 (WR3-07).

  O 04-25 fechou WR3-06, o unico achado da rodada 3 que era PRE-EXISTENTE e nunca fora
  avaliado por nenhum plano da fase — apesar de a fase inteira ter sido escrita em torno
  do modo de falha que ele produz. getStaleDeals deriva o numero de paginas de
  meta.totalCount e e limitada POR CONSTRUCAO; as outras duas paginam por condicao de
  parada vinda da RESPOSTA: `if (!data.links?.next) break` em getUsers e
  `if (tasks.length < 100) break` em getDealsWithFutureTasks. Uma borda que passe a ignorar
  o parametro `page` nunca satisfaz nenhuma das duas.
  RED MEDIDO, e a premissa da nao-terminacao NAO divergiu: as duas chamadas nao rejeitam,
  nao resolvem e nao erram — failureType: 'testTimeoutFailure', cada uma cancelando o
  arquivo inteiro. O custo nao e a requisicao desperdicada: o laco vive dentro do try de
  runCheck, entao o finally que devolve isRunning a false NUNCA executa e toda execucao
  seguinte cai no guard do topo devolvendo { skipped: true } — para sempre, ate reiniciar
  o processo. E o modo de falha que o cabecalho de scheduler.resilience.test.js declara
  como o pior daqui, la coberto SO na variante por EXCECAO.
  AGORA: MAX_PAGES = 200 (20.000 registros por borda), constante de modulo EXPORTADA e
  compartilhada; `while (page <= MAX_PAGES)` = 2 e `page > MAX_PAGES` = 2, com o throw
  DEPOIS do laco — nunca `break`, que trocaria nao-terminacao por resultado PARCIAL
  silencioso (a mesma direcao de falha, mais dificil de perceber). Os breaks existentes
  ficaram byte a byte, e as UNICAS 2 remocoes do diff sao os dois `while (true)`.
  `while (true)` nao-comentario em agendor.js = ZERO.
  O throw de /tasks fica FORA do try interno (D-WR3-06-d): o catch existe para logar e
  relancar erros de borda, e esta mensagem ja e explicita. Propagar e coerente com o
  contrato "Set completo ou falha explicita" (Q2) — a rejeicao sobe ao catch EXTERNO de
  runCheck, cujo finally libera o lock. NENHUMA linha de scheduler.js mudou; o que muda e
  que o finally passa a ser ALCANCAVEL.
  OS DOIS CENARIOS SIMETRICOS EXIGIDOS PELA RODADA EXISTEM E ESTAO NOMEADOS, e sao
  obrigatorios por motivos DIFERENTES em cada borda: caso (2) — /users com 2 paginas
  legitimas conclui (um teto que truncasse faria responsaveis sumirem do dicionario e com
  eles o e-mail de quem deveria ser notificado); caso (4) — /tasks com 2 paginas legitimas
  devolve o Set completo (aqui o custo e pior: o Set decide quem NAO recebe, entao tarefa
  futura perdida vira notificacao INDEVIDA). Os dois verificam por VALOR, nao por tamanho.
  DUAS DIVERGENCIAS MEDIDAS, nenhuma de comportamento:
  (1) A FORMA do RED. O plano previa uma execucao unica com (1) e (3) vermelhos e (2) e (4)
  verdes. Nao e observavel: `node --test` trata o ARQUIVO como um subteste, entao a primeira
  nao-terminacao CANCELA o arquivo e os tres casos seguintes nunca sao executados nem
  reportados (# cancelled 1, # tests 1). Os quatro desfechos foram medidos separadamente,
  por --test-name-pattern.
  (2) O stub PRECISOU ceder ao event loop (setImmediate), e isso e o proprio R3-30: um laco
  nao terminante que so consome MICROtarefas starva o event loop, nenhum timer roda, e o
  --test-timeout do runner NUNCA dispara — a mitigacao prescrita nao funciona sozinha. Ceder
  tambem e mais fiel ao original (resposta HTTP real chega por I/O) e custa nada: 4 casos em
  79ms. O motivo esta escrito NO ARQUIVO DE TESTE, para que ninguem "simplifique" o stub e
  ressuscite o travamento da suite.
  TODOS os criterios numericos bateram. Contrato do 04-22 preservado e medido:
  `await api.get(` = 0, `fetchWithRetry(` = 6, `api.get(` = 5. Diff de agendor.js com 16
  linhas nao-comentario (as 3 mudancas prescritas) e 2 remocoes. `\b200\b` no arquivo de
  teste = 0 (o numero e DERIVADO do modulo). Suite 168 -> 172, cobertura de agendor.js em
  90,69% linhas / 88,42% branches, lint exit 0 (44 warnings). Os 9 arquivos vizinhos verdes
  SEM edicao (47 casos); git diff --name-only -- backend/src/ na Task 1 saiu VAZIO e
  -- backend/test/ na Task 2 tambem. ZERO DESVIOS: nenhuma Rule 1-4 acionada, nenhum pacote
  instalado.
  ESCOPO QUE O 04-25 NAO FECHA: getStaleDeals NAO recebeu teto, e a justificativa esta
  ESCRITA NO CODIGO (D-WR3-06-e) — deriva totalPages de meta.totalCount e percorre um for
  sobre array finito, entao nao existe condicao de parada vinda da resposta a ser frustrada.
  Sem essa frase o proximo leitor suspeitaria de esquecimento. fetchWithRetry, getOrgCategory,
  getStaleDeals, getDealById, shouldNotifyOwner, isExcludedStage e getDealType ficaram byte a
  byte; o arquivo nao foi reordenado. O console.log legado continua la (LOG-01, Fase 5).
  ATENCAO para quem seguir: agendor.paginacao.test.js e o oraculo da TERMINACAO das
  paginacoes do modulo — uma terceira paginacao que encerre por condicao vinda da resposta
  entra ali, com o seu par (achado + simetrico), e herda MAX_PAGES do modulo.
  O proximo e o 04-26 (WR3-04 + WR3-05 + WR3-07).

  O 04-24 fechou WR3-03, o vizinho de WR2-04 um NIVEL MAIS FUNDO. O 04-16 endureceu a
  leitura do canal parcial com Array.isArray(err?.resultadosParciais) e escreveu no
  comentario que "ausencia e corrupcao passam a ser lidas do mesmo jeito". Meia corrupcao:
  Array.isArray valida o CONTEINER e nada mais, e a premissa do proprio cenario E (um erro
  congelado de biblioteca carregando "uma propriedade homonima de qualquer tipo") nao da
  razao nenhuma para supor que esse tipo seria preferencialmente string e nao array.
  RED MEDIDO, e a previsao do plano BATEU nas DUAS direcoes: TypeError "Cannot read
  properties of null (reading 'success')" com stack em scheduler.js:261 (a linha do .some) e
  "at Array.some", em F e em G. A prova operacional veio no log do proprio SUT, DUAS vezes, e
  o catch que capturou nao e nenhum dos internos: e o EXTERNO de runCheck. r.deals.length foi
  medido a parte (a asseracao de r.error dispara primeiro) e vale ZERO nos dois cenarios —
  mesmo achado estrutural do 04-15/04-16/04-23 (results.deals.push fica no FIM do laco) — com
  transportesCriados = 2 em vez de 3, a medida direta de que o SEGUNDO negocio nunca chegou a
  ser servido. 0 negocios processados, 0 e-mails, num dia em que dois deveriam sair. O modo
  canal-corrompido na mesma execucao e o CONTROLE: 2/1/2/3, o cenario E ja corrigido pelo
  04-16 atravessa a rodada inteira.
  AGORA: o predicado e `r && r.success === true` — comparacao ESTRITA de proposito (o produtor
  grava success como booleano, entao nada legitimo se perde, e um truthy de outro tipo e lido
  como nao confirmado). As DUAS guardas foram SOMADAS, nao trocadas: Array.isArray
  nao-comentario continua = 1. Diff de scheduler.js com EXATAMENTE 6 linhas nao-comentario, as
  2 mudancas prescritas (a quebra em bloco e do Biome, nao escolha).
  O CENARIO SIMETRICO EXIGIDO PELA RODADA EXISTE E ESTA NOMEADO: cenario G — parcial
  [null, { success: true }], com o elemento corrompido ANTES do sucesso genuino DE PROPOSITO
  (e o primeiro que o .some avalia). Endurecer a leitura para deixar de LANCAR e METADE do
  conserto; a outra metade e nao PERDER a confirmacao genuina. Descartar o array inteiro ao
  primeiro elemento invalido rebaixaria para 'error' uma linha cujo e-mail saiu de verdade,
  'error' nao deduplica, e a rodada de amanha reenviaria para quem ja recebeu — exatamente o
  desfecho que WR-01 (04-10) existe para impedir. F e G se apoiam em direcoes opostas e e o
  PAR que fecha o achado. G assere linha 'sent', alreadyNotifiedToday(primeiro) === true,
  r.notified === 2 E r.deals[0].notified === false (a assimetria do 04-14, por caminho novo).
  O COMENTARIO E METADE DO CONSERTO: o achado nasceu de um bloco que afirmava mais do que o
  codigo entregava — mesmo mecanismo de WR3-01 ("politica UNICA" sobre 2 de 5 bordas).
  Os dois blocos agora dizem CONTEINER E ELEMENTO, enumeram E/F/G pelo nome e trazem a frase
  em sentido OPOSTO, que nenhum comentario anterior tinha. Escrito SEM reproduzir a expressao
  do predicado (R3-26): grep -c "r.success === true" = 1, nao 2.
  emailer.js recebeu diff EXCLUSIVAMENTE DE COMENTARIO — 0 linhas nao-comentario, medido.
  TODOS os criterios numericos bateram, EXCETO UM, de contagem do proprio criterio: o plano
  esperava 3 ocorrencias de `Object.freeze`; o grep devolve 4 — as 3 construcoes reais (153,
  166, 177) mais 1 MENCAO no comentario do cabecalho que explica a armadilha do sloppy mode,
  que ja existia (baseline do mesmo grep era 2, nao 1). Filtrando comentario: exatamente 3.
  Mesma classe do desvio do 04-23 (mock.method(db). Valor medido registrado, numero do plano
  NAO forcado.
  INVARIANTES HERDADAS MEDIDAS E NAO REGREDIDAS: catch (erroDeRegistro) = 1; results.notified++
  = 2; continue; = 3; categoriaIndecidivel = 1; `= alreadyNotifiedToday(deal.id);` = 1;
  `if (alreadyNotifiedToday(deal.id))` = 0; total nao-comentario = 2 (a 2a em runCheckOnly,
  intocada).
  Suite 166 -> 168, cobertura de scheduler.js em 81,85% linhas / 76,81% branches e emailer.js
  em 89,49% / 63,07%, lint exit 0 (44 warnings). Os 8 arquivos vizinhos verdes SEM edicao (40
  casos); git diff --name-only -- test/ na Task 2 saiu VAZIO e -- src/ na Task 1 tambem.
  ZERO DESVIOS: nenhuma Rule 1-4 acionada, nenhum pacote instalado.
  ESCOPO QUE O 04-24 NAO FECHA: a lacuna do `throw null` continua ABERTA e por decisao —
  results.errors.push(err.message) e a PRIMEIRA instrucao do catch e estoura antes de qualquer
  guarda deste plano; fecha-la muda outra instrucao e pede plano proprio. `erroDeRegistro?.
  message` entrou como defesa em profundidade SEM caso dedicado (D-WR3-03-b): pina-lo exigiria
  mockar a gravacao dentro do arquivo do canal parcial, que deliberadamente nao a mocka — e
  esse isolamento que mantem os consertos do 04-15 e do 04-16/04-24 revertiveis de forma
  independente. O contrato de sendStaleNotification nao mudou (continua LANCANDO o erro
  original), a anexacao no produtor nao aparece no diff, e o desfecho do canal BEM FORMADO e
  identico (cenarios A e B de partialFailure verdes sem edicao). runCheckOnly intocada.
  ATENCAO para quem seguir: notificationStatus.canalParcial.test.js deixou de ser o oraculo de
  UMA corrupcao e virou o das DUAS camadas do canal — o cabecalho lista E, F e G com o papel
  de cada um. Uma terceira forma de corrupcao do canal entra ali, ao lado das existentes.
  O proximo e o 04-25 (WR3-06: a paginacao sem teto de paginas em getUsers).

  O 04-23 fechou WR3-02, o vizinho de WR2-02 uma construcao ACIMA. O 04-15 protegeu a
  GRAVACAO do desfecho argumentando que "a conexao SQLite pode estar indisponivel — e
  justamente uma das origens possiveis da excecao que trouxe o fluxo ate aqui — e
  updateNotificationStatus usa a MESMA conexao". O argumento estava correto e INCOMPLETO:
  alreadyNotifiedToday(deal.id) usa a mesma conexao, e a PRIMEIRA operacao de banco do laco
  e vivia fora de qualquer try interno.
  RED MEDIDO, e desta vez a previsao do plano BATEU: results.error preenchido com "The
  database connection is not open", E vermelho, D e F verdes. A prova operacional veio no
  log do proprio SUT com o ponto exato da morte da rodada — "[ERROR] [Scheduler] Erro na
  verificacao ... at runCheck (scheduler.js:93:11)", e o catch que capturou e o EXTERNO,
  o que encerra a funcao inteira. O valor de r.deals.length no estado defeituoso foi medido
  a parte (a asseracao de r.error dispara primeiro) e vale ZERO, nao 1: mesmo achado
  estrutural do 04-15 e do 04-16 — results.deals.push fica no FIM do corpo do laco, entao a
  rodada perde tambem o registro do negocio que disparou a falha. 0 negocios processados, 0
  e-mails, num dia em que dois deveriam sair.
  AGORA: a leitura vive num try/catch proprio, variavel inicializada em FALSE, catch
  (erroDeDedup) logando APENAS a mensagem com tag [Scheduler] (CR-02 do 04-09). Diff de 26
  insercoes e 2 remocoes — e as 2 remocoes sao exatamente as duas linhas reescritas.
  AS TRES OPERACOES DE BANCO DO LACO ESTAO PROTEGIDAS: alreadyNotifiedToday (este plano),
  logNotification (ja nascia dentro do try do bloco de envio) e updateNotificationStatus
  (04-15). Nenhuma delas pode mais abortar a rodada.
  A RESSALVA DO REVISOR ESTA HONRADA NO CODIGO, nao so no SUMMARY: C10 NAO cobria este caso
  — la o custo era uma linha 'pending' retentavel amanha, aqui era a rodada inteira. O que
  C10 decide e vale aqui e a DIRECAO do fail-safe (entre reenviar e silenciar, reenviar); a
  MAGNITUDE esta registrada por escrito no comentario.
  O CENARIO SIMETRICO/VIZINHO EXIGIDO PELA RODADA EXISTE E ESTA NOMEADO: cenario F —a falha
  no INSERT. Ele JA PASSAVA no RED, e e por isso que entrou: o vizinho imediato da operacao
  consertada precisava ser VERIFICADO e pinado, nao presumido. Se alguem mover o insert para
  fora do try do bloco de envio, F fica vermelho.
  O CENARIO E ASSERE 4 ENVIOS E r.notified === 2 de proposito: a metade do contrato que mais
  parece descuido e a que precisa estar pinada. Inicializar a variavel em TRUE ("na duvida,
  nao envia") pareceria conservador e seria a pior classe de falha do Core Value.
  TODOS os criterios numericos bateram, EXCETO UM, de contagem do proprio criterio: o plano
  esperava 3 ocorrencias de `mock.method(db`; o grep devolve 4 — as 3 instalacoes reais
  (linhas 183, 201, 213) mais 1 MENCAO dentro do bloco de comentario que explica a armadilha
  de CommonJS, que ja existia antes desta rodada. A INTENCAO (nenhum mock depois do require
  do scheduler, linha 222) esta satisfeita e medida. Valor medido registrado, numero do
  plano NAO forcado.
  runCheckOnly INTOCADA, e isso e decisao registrada (D-WR3-02-d), nao esquecimento: e a
  previa somente-leitura do painel e uma falha la vira erro HTTP visivel na tela, nao
  silencio. Por isso o total nao-comentario de alreadyNotifiedToday(deal.id) continua 2 e
  nao 1. `git diff | grep -c runCheckOnly` = 0.
  Suite 164 -> 166, cobertura de scheduler.js em 80,79% linhas / 76,47% branches, lint exit
  0 (44 warnings). Os 7 arquivos vizinhos verdes SEM edicao; git diff --name-only -- test/
  na Task 2 saiu VAZIO. ZERO DESVIOS: nenhuma Rule 1-4 acionada, nenhum pacote instalado.
  ESCOPO QUE O 04-23 NAO FECHA: WR3-03 — o endurecimento do canal parcial valida o
  CONTEINER (Array.isArray) e nao os ELEMENTOS, entao [null] continua reabrindo a rodada
  abortada. E o 04-24. A semantica da dedup quando a leitura FUNCIONA nao mudou (db.dedup
  verde sem edicao), e a guarda de categoria do 04-20 logo abaixo ficou byte a byte.
  ATENCAO para quem seguir: notificationStatus.registroResiliente.test.js deixou de ser o
  oraculo de UMA falha e virou o da CLASSE — o cabecalho lista as tres operacoes de banco do
  laco com o papel de cada uma. Uma quarta operacao de banco no laco deve entrar acompanhada
  do seu cenario nesse arquivo.

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
Last activity: 2026-08-05 -- 04-27 completo (IN3-01..IN3-08 como todos + Success Criteria 7 no ROADMAP + nota de CR3-01 em REL-06); diff de backend ZERO, suite 172/172

Progress: [██████████] 100%

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
| Phase 04 P23 | 12 | 2 tasks | 2 files |
| Phase 04 P24 | 14min | 2 tasks | 3 files |
| Phase 04 P25 | 16min | 2 tasks | 2 files |
| Phase 04 P26 | 21min | 3 tasks | 9 files |
| Phase 04 P27 | 25min | 3 tasks | 10 files |
| Phase 04 P28 | 35min | 2 tasks | 2 files |
| Phase 04 P29 | 40min | 2 tasks | 2 files |

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
- [Phase ?]: 04-23 (WR3-02): a leitura de dedup vive num try/catch proprio com a variavel em false — falhar a leitura significa NOTIFICAR (direcao do fail-safe decidida em C10); a magnitude que C10 nao cobria (a rodada inteira, nao uma linha) esta registrada no comentario do codigo
- [Phase ?]: 04-23 (D-WR3-02-d): runCheckOnly NAO entra no escopo — e a previa somente-leitura do painel e uma falha la vira erro HTTP visivel, nao silencio; por isso o total nao-comentario de alreadyNotifiedToday(deal.id) continua 2
- [Phase ?]: 04-25 (WR3-06): MAX_PAGES = 200 exportada e compartilhada pelas duas paginacoes que encerram por condicao vinda da resposta; teto com throw DEPOIS do laco (nunca break, que trocaria nao-terminacao por resultado parcial silencioso); getStaleDeals NAO recebe teto, com a justificativa escrita no codigo
- [Phase 04]: [04-26]: D-WR3-07-c respeitada e NAO 'completada' — o beforeEach de agendor.cacheConcurrency.test.js tem EXATAMENTE uma atribuicao (cenarioAtivo); as outras 7 sao estado de ARMACAO e zera-las faz os casos (2) e (3) DEIXAREM DE TERMINAR ('Promise resolution is still pending'). Registrado como todo wr3-07b
- [Phase 04]: [04-26]: backend/test/helpers/fakeTimers.js e a UNICA implementacao de avancarRelogioAte da suite — a copia local do oraculo de REL-02 foi removida (WR3-05) e a nota de topo do helper deixou de declarar a duplicacao como deliberada
- [Phase 04]: [04-26]: restauracao de estado global no fim do corpo de um test() e restauracao no CAMINHO FELIZ — nao roda se uma assercao falha antes. O lugar correto e um beforeEach que REAFIRMA o valor neutro (WR3-07)
- [Phase 04]: 04-27 — IN3-01..IN3-08 registrados como TODOS PENDENTES (escopo travado pelo usuario; precedente IN2-01..IN2-04 do 04-18). Prioridades D-IN3-b; in3-08 ALTA e declarado candidato a promocao a requisito da fase seguinte: e o SEGUNDO filtro de elegibilidade fail-open, e o primeiro foi CR3-01
- [Phase 04]: 04-27 (D-IN3-d) — ROADMAP ganhou Success Criteria 7 NOVO, escrito como COMPORTAMENTO garantido e sem nomear identificador (nem CATEGORIA_INDECIDIVEL, nem fetchWithRetry); o item 4 (redacao aprovada em C9) NAO foi reescrito — 1 insercao e 0 remocoes no arquivo inteiro
- [Phase 04]: 04-27 (D-IN3-e) — REL-06 recebeu NOTA de CR3-01 entre parenteses (padrao de REL-04/REL-05), sem REL-07 e sem mexer na tabela de rastreabilidade: a falha da consulta de categoria e explicita e ESCOPADA AO NEGOCIO afetado, em vez de custar a rodada inteira como em /tasks
- [Phase 04]: 04-28 (D-CR4-01-a) — limiar do alarme e a supressao TOTAL (results.stale > 0 && skippedCategoriaIndecidivel === results.stale). O bloco e ADITIVO, mora DEPOIS do laco e NAO decide quem recebe e-mail; a invariante preservada e o contrato agregado-observavel do CR3-01, pinado nos cenarios A e B. NAO citar como precedente para mudanca de comportamento por-negocio
- [Phase 04]: 04-28 (D-CR4-01-b/c) — o contador nasce no LITERAL de results e incrementa SEMPRE, sem limiar; o alarme preenche as DUAS superficies: results.error (nomeada pela decisao do usuario) e results.errors (a UNICA que o Dashboard renderiza, medido — nenhum componente le results.error)
- [Phase 04]: 04-28 — ordem das assercoes do cenario E invertida em relacao a listagem do plano (funil ANTES do contador) para tornar o RED diagnostico: provou por MEDICAO que a armacao do funil Beefor produzia a supressao esperada, entao a condicao de PARAR do plano nao foi atingida

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

Last session: 2026-08-05T13:35:47.633Z
Stopped at: Completed 04-28-PLAN.md
Resume file: None
