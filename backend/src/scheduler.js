const cron = require('node-cron');
const {
  getConfig,
  logNotification,
  updateNotificationStatus,
  alreadyNotifiedToday,
  saveWeeklySnapshot,
} = require('./db');
const {
  getStaleDeals,
  getUsers,
  getDealsWithFutureTasks,
  shouldNotifyOwner,
} = require('./agendor');
const {
  sendStaleNotification,
  sendWeeklySummary,
  sendOwnerWeeklySummary,
} = require('./emailer');
const logger = require('./logger');

let currentTask = null;
let weeklyTask = null;
let lastRunResult = null;
let isRunning = false;

async function runCheck() {
  if (isRunning)
    return { skipped: true, reason: 'Verificação já em andamento' };
  isRunning = true;

  const startTime = new Date();
  const results = {
    checked: 0,
    stale: 0,
    notified: 0,
    skipped: 0,
    // Nasce no literal, e não sob demanda, porque nenhum consumidor deve ter de distinguir
    // `undefined` de zero para saber se a borda de organizações respondeu (CR4-01). É ESTE
    // contador — e não `results.skipped`, que QUATRO causas diferentes incrementam (dedup do
    // dia, categoria indecidível, funil e "sem destinatário") — que separa "dia calmo" de "a
    // borda de organizações caiu". Ele conta SEMPRE, independente do limiar do alarme abaixo.
    skippedCategoriaIndecidivel: 0,
    errors: [],
    deals: [],
  };

  try {
    const staleDays = parseInt(getConfig('stale_days')) || 15;
    const adminEmails = (getConfig('admin_email') || '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const notifyAuthor = getConfig('notify_author') !== 'false';
    const notificationsEnabled = getConfig('notifications_enabled') === 'true';

    logger.info(
      `[Scheduler] Iniciando verificação — threshold: ${staleDays} dias`,
    );

    const [staleDeals, users, futureTasks] = await Promise.all([
      getStaleDeals(staleDays),
      getUsers(),
      getDealsWithFutureTasks(),
    ]);

    // Remove deals que têm tarefa futura agendada (não precisam de notificação agora)
    const dealsToNotify = staleDeals.filter((d) => !futureTasks.has(d.id));
    const skippedFutureTasks = staleDeals.length - dealsToNotify.length;
    if (skippedFutureTasks > 0) {
      logger.info(
        `[Scheduler] ${skippedFutureTasks} deal(s) ignorado(s) por terem tarefa futura agendada`,
      );
    }

    results.stale = dealsToNotify.length;
    results.skippedFutureTasks = skippedFutureTasks;

    for (const deal of dealsToNotify) {
      results.checked++;
      const owner = users[deal.ownerId];
      const ownerEmail = owner?.email || null;
      const author = users[deal.authorId];
      const authorEmail = notifyAuthor ? author?.email || null : null;

      const dealResult = {
        id: deal.id,
        title: deal.title,
        ownerName: deal.ownerName,
        ownerEmail,
        authorName: deal.authorName,
        authorEmail,
        daysSinceUpdate: deal.daysSinceUpdate,
        notified: false,
        skipped: false,
      };

      // Não notificar duas vezes no mesmo dia.
      //
      // A leitura vive num try/catch próprio (WR3-02) porque ela é a PRIMEIRA operação de
      // banco do laço e usa a MESMA conexão SQLite que o 04-15 protegeu na gravação do
      // desfecho — o argumento daquele plano valia aqui desde o início, e só a gravação
      // recebeu a guarda. Sem ela, uma falha aqui sobe direto ao catch externo, aborta o
      // `for` e deixa TODOS os negócios restantes sem processar: silêncio total num dia de
      // notificar, e não apenas um negócio perdido.
      //
      // A variável nasce `false` de propósito: não saber se já notificamos é lido como
      // "não deduplica", e a escolha entre reenviar e silenciar é decisão do usuário
      // (checkpoint C10 — duplicata incomoda e é aceitável; deixar alguém sem notificação
      // não é). Registre-se que C10 NÃO cobria este caso: lá o custo era uma linha
      // 'pending' retentável amanhã, aqui era a rodada inteira. Só a MENSAGEM do erro vai
      // ao log (CR-02 do 04-09: um erro de borda carrega config.headers com o
      // AGENDOR_TOKEN). Oráculo: notificationStatus.registroResiliente.test.js, cenário E.
      let jaNotificadoHoje = false;
      try {
        jaNotificadoHoje = alreadyNotifiedToday(deal.id);
      } catch (erroDeDedup) {
        logger.error(
          '[Scheduler] Falha ao consultar a dedup do dia:',
          erroDeDedup.message,
        );
      }
      if (jaNotificadoHoje) {
        dealResult.skipped = true;
        results.skipped++;
        results.deals.push(dealResult);
        continue;
      }

      // Categoria da organização INDECIDÍVEL (CR3-01). A exclusão por categoria é o único
      // filtro de elegibilidade que depende de uma segunda chamada HTTP; quando ela falha
      // mesmo depois do retry da borda, "não sei a categoria" é indistinguível de "pode ser
      // uma categoria excluída", e notificar seria a direção INSEGURA — a mesma regra que a
      // Decisão Q2 (REL-06) já aplicou às tarefas futuras. A decisão do usuário (2026-08-05)
      // tem duas metades e as duas valem aqui: o negócio fica FORA do envio E permanece no
      // painel e nos relatórios, porque getStaleDeals continua devolvendo-o; e a rodada NÃO é
      // abortada — uma organização inatingível não pode custar as notificações de todos os
      // outros negócios do dia (rota explicitamente rejeitada). Nenhuma linha entra no
      // notification_log, porque não houve evento de envio, e o aviso nomeando a organização
      // já sai em getStaleDeals. Oráculo: scheduler.categoriaIndecidivel.test.js.
      if (deal.categoriaIndecidivel) {
        dealResult.skipped = true;
        dealResult.skipReason =
          'categoria da organização não pôde ser consultada — negócio não notificado';
        results.skipped++;
        results.skippedCategoriaIndecidivel++;
        results.deals.push(dealResult);
        continue;
      }

      // Funis sem notificação ao responsável (ex.: Beefor — produto de outra equipe do grupo).
      // O card continua visível no dashboard e relatório admin, só não dispara email pro dono.
      if (!shouldNotifyOwner(deal)) {
        dealResult.skipped = true;
        dealResult.skipReason = `funil ${deal.funnel} não notifica responsável`;
        results.skipped++;
        results.deals.push(dealResult);
        continue;
      }

      const hasRecipient = ownerEmail || authorEmail;
      if (notificationsEnabled && hasRecipient) {
        // Registro do envio em DUAS etapas (REL-05, Decisão Q1). O insert continua
        // vindo ANTES do envio porque o log_id é o que identifica o clique no link
        // de tracking — mas ele não pode mais nascer 'sent', senão uma falha deixa
        // a linha mentindo e, como alreadyNotifiedToday (em db.js) filtra
        // status = 'sent', o deal nunca seria retentado.
        //
        // Por que o status inicial é 'pending': se o processo morrer no meio do
        // envio, a linha fica 'pending' — que nenhum leitor conta como enviado, e
        // portanto a rodada de amanhã retenta. É o fail-safe correto. Manter
        // 'sent' e só corrigir na falha reabriria essa janela.
        //
        // Por que ≥ 1 sucesso confirma 'sent': houve envio real, e a dedup precisa
        // proteger quem já recebeu de um segundo e-mail amanhã. O erro do
        // destinatário que falhou é preservado na coluna `error`. D-03 (registrar
        // e seguir para o próximo destinatário) fica intocado.
        //
        // A MESMA razão vale no caminho de EXCEÇÃO (WR-01), e é por isso que
        // sendStaleNotification anexa ao erro o resultado por destinatário que já
        // tinha coletado: ela pode lançar DEPOIS de um envio confirmado (o retry
        // de sendMailWithRetry, em emailer.js, recria o transporte dentro do próprio
        // catch, e essa
        // recriação lê o SQLite). Rebaixar a linha para 'error' sem olhar o parcial
        // reabre a duplicata — a linha deixa de deduplicar e a rodada de amanhã
        // reenvia para quem já recebeu.
        //
        // Por que results.notified++ mora DENTRO do ramo 'sent' (WR-04), NOS DOIS
        // CAMINHOS: esse contador é o número que o logger.info('[Scheduler]
        // Concluído: …') do fim desta função e a UI exibem como "notificações
        // enviadas". Incrementá-lo numa falha total faria o log dizer que tudo saiu
        // justamente no dia em que o SMTP estivesse fora (super-contagem); deixar de
        // incrementá-lo no caminho de EXCEÇÃO que grava 'sent' faz o log dizer que
        // nada saiu num dia em que houve envio real (sub-contagem, WR2-01). Status
        // gravado e contador são um único ponto de verdade: quem grava 'sent'
        // incrementa, e é por isso que a decisão do status é um if/else nos dois
        // ramos, e não um ternário dentro da chamada — o incremento precisa ter
        // lugar físico ao lado do status.
        let logId = null;
        let houveEnvioConfirmado = false;
        try {
          const logEntry = logNotification({
            deal_id: deal.id,
            deal_title: deal.title,
            owner_name: deal.ownerName,
            owner_email: ownerEmail,
            admin_email: adminEmails.join(', '),
            days_stale: deal.daysSinceUpdate,
            status: 'pending',
            error: null,
            deal_updated_at: deal.updatedAt,
            deal_type: deal.dealType,
            web_url: deal.webUrl,
          });
          logId = logEntry.lastInsertRowid;

          const emailResults = await sendStaleNotification({
            deal,
            ownerEmail,
            authorEmail,
            logId,
          });
          const allOk = emailResults.every((r) => r.success);
          houveEnvioConfirmado = emailResults.some((r) => r.success);
          const errors = emailResults
            .filter((r) => !r.success)
            .map((r) => r.error);

          if (houveEnvioConfirmado) {
            updateNotificationStatus(
              logId,
              'sent',
              errors.length ? errors.join('; ') : null,
            );
            results.notified++;
          } else {
            updateNotificationStatus(logId, 'error', errors.join('; '));
          }

          dealResult.notified = allOk;
          if (!allOk) results.errors.push(...errors);
        } catch (err) {
          results.errors.push(err.message);
          // Atualiza a linha já inserida em vez de criar uma segunda. Se a exceção
          // ocorreu antes do insert, não há nada a atualizar.
          if (logId !== null) {
            // O que já foi confirmado antes da exceção chega aqui anexado ao erro.
            //
            // Por que a leitura é VALIDADA EM DUAS CAMADAS (WR2-04 + WR3-03): este
            // canal é uma propriedade improvisada num objeto de erro que pode ter
            // nascido em qualquer biblioteca da pilha SMTP, e nada garante nem o
            // tipo do CONTÊINER nem o tipo dos ELEMENTOS. A primeira camada recusa
            // o valor que não é array; a segunda recusa o elemento que não é objeto
            // e o elemento cujo `success` não é booleano verdadeiro. As duas são
            // complementares, não alternativas: validar só o contêiner deixava um
            // array de elementos não-objeto passar, e a desreferência lançava DENTRO
            // deste catch — exceção que sobe para o catch externo de runCheck,
            // aborta o `for` dos deals e deixa os negócios restantes da rodada sem
            // processar. Ausência, contêiner corrompido e elemento corrompido são
            // lidos do mesmo jeito: "nada confirmado", com desfecho fail-safe —
            // linha 'error', que não deduplica e portanto é retentável amanhã (o
            // trade-off aprovado no checkpoint C10).
            //
            // E a frase em sentido OPOSTO, que é a outra metade do contrato: um
            // elemento corrompido AO LADO de um sucesso genuíno NÃO pode custar a
            // confirmação. Descartar o array inteiro ao primeiro elemento inválido
            // rebaixaria para 'error' uma linha cujo e-mail saiu de verdade; 'error'
            // não deduplica; e a rodada de amanhã reenviaria para quem já recebeu —
            // exatamente o desfecho que WR-01 (04-10) existe para impedir. Por isso
            // a validação é por elemento e a decisão continua sendo "existe ao menos
            // um confirmado?".
            //
            // A comparação com o booleano é ESTRITA de propósito: o produtor grava
            // `success` como booleano, então nenhum resultado legítimo se perde, e um
            // elemento com valor truthy de outro tipo é lido como não confirmado —
            // o mesmo fail-safe já escolhido para o contêiner corrompido.
            //
            // O encadeamento opcional sobre o erro é defensivo e NÃO protege contra
            // `throw null`: results.errors.push(err.message), primeira instrução
            // deste catch, já teria estourado antes. Lacuna conhecida e declarada,
            // fora desta rodada. Quem pina este comportamento é
            // notificationStatus.canalParcial.test.js — cenário E (contêiner de tipo
            // errado), F (elemento não-objeto) e G (elemento corrompido ao lado de um
            // sucesso genuíno).
            const parciais = Array.isArray(err?.resultadosParciais)
              ? err.resultadosParciais
              : [];
            if (parciais.some((r) => r && r.success === true)) {
              houveEnvioConfirmado = true;
            }

            // Por que a gravação tem try/catch PRÓPRIO (WR2-02): a conexão SQLite pode
            // estar indisponível — é justamente uma das origens possíveis da exceção que
            // trouxe o fluxo até aqui — e updateNotificationStatus usa a MESMA conexão.
            // Sem esta guarda a falha da GRAVAÇÃO escapa para o catch externo de
            // runCheck, aborta o `for` dos deals e deixa os negócios restantes da rodada
            // sem processar: silêncio total num dia de notificar. Registrar e seguir é a
            // escolha — a linha fica 'pending', não deduplica, e a rodada de amanhã
            // retenta. É reenvio no pior caso contra silêncio permanente, e o milestone
            // escolhe o reenvio (trade-off aprovado no checkpoint C10). Só a MENSAGEM do
            // erro vai ao logger, nunca o objeto: um erro de borda carrega
            // config.headers com o AGENDOR_TOKEN (CR-02 do 04-09). Quem pina este
            // comportamento é notificationStatus.registroResiliente.test.js.
            //
            // O status gravado continua sendo decidido por houveEnvioConfirmado, com o
            // mesmo significado do ramo de retorno: houve envio real -> 'sent', e a dedup
            // protege quem já recebeu.
            try {
              if (houveEnvioConfirmado) {
                updateNotificationStatus(logId, 'sent', err.message);
              } else {
                updateNotificationStatus(logId, 'error', err.message);
              }
            } catch (erroDeRegistro) {
              // Encadeamento opcional na leitura da mensagem: defesa em profundidade
              // dentro do bloco que existe justamente para ser inquebrável. Não há
              // caso dedicado, e isso é declarado (D-WR3-03-b) — pinar esta linha
              // exigiria mockar a gravação no arquivo do canal parcial, que
              // deliberadamente não a mocka; é esse isolamento que mantém os dois
              // consertos revertíveis de forma independente.
              logger.error(
                '[Scheduler] Falha ao registrar o desfecho do envio:',
                erroDeRegistro?.message,
              );
            }

            // O contador segue o status TAMBÉM aqui (WR2-01): houve envio real, e é este
            // número que o logger.info de conclusão e a UI exibem como "notificações
            // enviadas". Já dealResult.notified permanece false DE PROPÓSITO — ele
            // responde a outra pergunta ("todos os destinatários confirmaram?"), e no
            // sucesso parcial a resposta é não. Quem pina essa relação é o cenário A de
            // notificationStatus.partialFailure.test.js.
            //
            // Por que o incremento ficou FORA do try acima, num `if` próprio (WR2-02):
            // ele acompanha a DECISÃO de status, não o sucesso da gravação. Junto da
            // chamada, uma falha só de gravação faria a rodada reportar zero num dia em
            // que o e-mail saiu de verdade — a sub-contagem que WR2-01 acabou de fechar.
            // O preço é testar houveEnvioConfirmado em duas construções seguidas; quem as
            // fizer divergir deixa vermelhos os cenários A e B de
            // notificationStatus.partialFailure.test.js.
            if (houveEnvioConfirmado) results.notified++;
          }
        }
      } else {
        // Quarto e último ramo de skip — era o único sem motivo escrito nenhum (D-CR4-01-f).
        // Um negócio suprimido sem justificativa é exatamente o que CR4-01 descreve numa escala
        // menor: o resultado registra que alguém não foi notificado e não diz por quê. Não ganha
        // contador nem alarme — não é falha de dependência externa, é configuração ou dado ausente.
        dealResult.skipped = true;
        dealResult.skipReason = notificationsEnabled
          ? 'nenhum destinatário com e-mail cadastrado'
          : 'notificações desativadas na configuração';
        results.skipped++;
      }

      results.deals.push(dealResult);
    }

    // Alarme de supressão TOTAL por categoria indecidível (CR4-01). Este bloco é ADITIVO e mora
    // DEPOIS do laço: ele não condiciona nenhum `continue`, nenhuma guarda e nenhuma decisão de
    // notificar ou pular, e portanto NÃO decide quem recebe e-mail. Quem mexer aqui não deve
    // acreditar no contrário — nenhuma escolha de limiar, alta ou baixa, pode mudar isso; o que
    // este bloco toca é exclusivamente o sinal AGREGADO da rodada.
    // Por que o limiar é "todos os negócios" e não uma proporção: o que ele preserva é o
    // contrato agregado-observável de CR3-01, pinado nos cenários A e B do oráculo, que asserem
    // campo de erro vazio com UM de dois suprimidos; um limiar proporcional abaixo de 100% faria
    // a rodada se ANUNCIAR como falha num cenário que aquele contrato fixou como normal.
    // Por que as DUAS superfícies: o campo de erro é o que a decisão do usuário nomeia, e o
    // array de erros é o único que a UI de fato renderiza. Preencher só o campo nomeado deixaria
    // o alarme tão invisível quanto o defeito que ele conserta.
    // Preencher o campo de erro numa rodada que CONCLUIU é deliberado, e a mensagem diz isso por
    // extenso. E o alarme discrimina a CAUSA, não a quantidade: uma supressão total por OUTRA
    // causa continua silenciosa, e o guarda-corpo disso é o cenário E do oráculo. Só inteiros e
    // texto fixo entram na mensagem — nenhum objeto de erro (CR-02 do 04-09).
    if (
      results.stale > 0 &&
      results.skippedCategoriaIndecidivel === results.stale
    ) {
      const mensagem =
        `Nenhum dos ${results.stale} negócio(s) parado(s) do dia foi notificado: a categoria ` +
        'da organização não pôde ser consultada em nenhum deles. A borda de organizações da ' +
        'Agendor pode estar indisponível. A rodada CONCLUIU — este é um alarme de supressão ' +
        'total, não uma interrupção.';
      results.error = mensagem;
      results.errors.push(mensagem);
      logger.error(`[Scheduler] ${mensagem}`);
    }

    results.duration = Date.now() - startTime;
    results.ranAt = startTime.toISOString();
    logger.info(
      `[Scheduler] Concluído: ${results.stale} negócios parados, ${results.notified} notificações enviadas`,
    );
  } catch (err) {
    results.error = err.message;
    logger.error('[Scheduler] Erro na verificação:', err);
  } finally {
    isRunning = false;
    lastRunResult = results;
  }

  return results;
}

async function runWeeklySummary() {
  logger.info('[Scheduler] Iniciando resumo semanal...');
  try {
    const staleDays = parseInt(getConfig('stale_days')) || 15;
    const adminEmails = (getConfig('admin_email') || '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const notificationsEnabled = getConfig('notifications_enabled') === 'true';
    if (!notificationsEnabled) return;

    const [deals, users] = await Promise.all([
      getStaleDeals(staleDays),
      getUsers(),
    ]);
    const enriched = deals.map((d) => ({
      ...d,
      ownerEmail: users[d.ownerId]?.email || null,
    }));

    // Salva snapshot semanal no banco
    const byOwner = {};
    const byCategory = {};
    const byFunnel = {};
    for (const d of enriched) {
      const o = d.ownerName || 'Sem responsável';
      byOwner[o] = (byOwner[o] || 0) + 1;
      const c = d.orgCategory || 'Indefinido';
      byCategory[c] = (byCategory[c] || 0) + 1;
      const f = d.funnel || 'Sem funil';
      byFunnel[f] = (byFunnel[f] || 0) + 1;
    }
    const totalDays = enriched.reduce((s, d) => s + d.daysSinceUpdate, 0);
    const now = new Date();
    saveWeeklySnapshot({
      week_label: `Semana ${now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
      total_stale: enriched.length,
      avg_days: enriched.length ? totalDays / enriched.length : 0,
      max_days: enriched.length
        ? Math.max(...enriched.map((d) => d.daysSinceUpdate))
        : 0,
      by_owner: byOwner,
      by_category: byCategory,
      by_funnel: byFunnel,
    });

    // 1. Resumo consolidado para admins
    if (adminEmails.length) {
      await sendWeeklySummary({ deals: enriched, adminEmails });
      logger.info(
        `[Scheduler] Resumo admin enviado para: ${adminEmails.join(', ')}`,
      );
    }

    // 2. Relatório individualizado para cada comercial responsável
    const results = await sendOwnerWeeklySummary({ deals: enriched, users });
    const sent = results.filter((r) => r.success).length;
    logger.info(
      `[Scheduler] Relatórios individuais enviados para ${sent} comercial(is)`,
    );
  } catch (err) {
    logger.error('[Scheduler] Erro no resumo semanal:', err.message);
  }
}

function scheduleTask() {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  if (weeklyTask) {
    weeklyTask.stop();
    weeklyTask = null;
  }

  const schedule = getConfig('cron_schedule') || '0 8 * * *';
  const notificationsEnabled = getConfig('notifications_enabled') === 'true';

  if (!notificationsEnabled) {
    logger.info('[Scheduler] Notificações desativadas — agendamento pausado');
    return;
  }

  logger.info(`[Scheduler] Agendado com: "${schedule}"`);
  currentTask = cron.schedule(schedule, runCheck, {
    timezone: 'America/Sao_Paulo',
  });

  // Resumo semanal para admins: toda sexta às 11h
  logger.info('[Scheduler] Resumo semanal agendado: sextas às 11h');
  weeklyTask = cron.schedule('0 11 * * 5', runWeeklySummary, {
    timezone: 'America/Sao_Paulo',
  });
}

function getStatus() {
  return {
    isRunning,
    lastRunResult,
    schedule: getConfig('cron_schedule'),
    notificationsEnabled: getConfig('notifications_enabled') === 'true',
    nextRun: currentTask ? 'agendado' : 'não agendado',
  };
}

// Apenas verifica negócios parados, sem enviar emails
async function runCheckOnly() {
  const staleDays = parseInt(getConfig('stale_days')) || 15;
  const [staleDeals, users, futureTasks] = await Promise.all([
    getStaleDeals(staleDays),
    getUsers(),
    getDealsWithFutureTasks(),
  ]);

  // Separa os deals com tarefa futura dos que realmente precisam de notificação
  return staleDeals
    .filter((deal) => !futureTasks.has(deal.id))
    .map((deal) => ({
      ...deal,
      ownerEmail: users[deal.ownerId]?.email || null,
      authorEmail: users[deal.authorId]?.email || null,
      alreadyNotifiedToday: alreadyNotifiedToday(deal.id),
    }));
}

// Para todos os agendamentos (usado no graceful shutdown).
function stopTasks() {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  if (weeklyTask) {
    weeklyTask.stop();
    weeklyTask = null;
  }
}

module.exports = { scheduleTask, runCheck, runCheckOnly, getStatus, stopTasks };

// ── Seam de teste (não altera o agendamento) ─────────────────────
// `runWeeklySummary` é registrada direto no cron por scheduleTask() e nenhum
// consumidor de produção a importa — por isso ela nunca esteve no export acima.
// Esta linha a expõe SOMENTE para a caracterização de REL-03, que precisa provar
// que uma falha de borda dentro dela é registrada e NÃO relançada (o catch que fecha o
// corpo de runWeeklySummary, logando '[Scheduler] Erro no resumo semanal:').
// Acrescentar a propriedade não muda o que scheduleTask agenda nem quem chama o quê.
module.exports.runWeeklySummary = runWeeklySummary;
