const cron = require('node-cron');
const {
  getConfig,
  logNotification,
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

      // Não notificar duas vezes no mesmo dia
      if (alreadyNotifiedToday(deal.id)) {
        dealResult.skipped = true;
        results.skipped++;
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
        try {
          // Salva primeiro para obter o log_id para rastreamento
          const logEntry = logNotification({
            deal_id: deal.id,
            deal_title: deal.title,
            owner_name: deal.ownerName,
            owner_email: ownerEmail,
            admin_email: adminEmails.join(', '),
            days_stale: deal.daysSinceUpdate,
            status: 'sent',
            error: null,
            deal_updated_at: deal.updatedAt,
            deal_type: deal.dealType,
            web_url: deal.webUrl,
          });
          const logId = logEntry.lastInsertRowid;

          const emailResults = await sendStaleNotification({
            deal,
            ownerEmail,
            authorEmail,
            logId,
          });
          const allOk = emailResults.every((r) => r.success);
          const errors = emailResults
            .filter((r) => !r.success)
            .map((r) => r.error);

          dealResult.notified = allOk;
          if (!allOk) results.errors.push(...errors);
          results.notified++;
        } catch (err) {
          results.errors.push(err.message);
          logNotification({
            deal_id: deal.id,
            deal_title: deal.title,
            owner_name: deal.ownerName,
            owner_email: ownerEmail,
            admin_email: adminEmails.join(', '),
            days_stale: deal.daysSinceUpdate,
            status: 'error',
            error: err.message,
            deal_updated_at: deal.updatedAt,
            deal_type: deal.dealType,
            web_url: deal.webUrl,
          });
        }
      } else {
        dealResult.skipped = true;
        results.skipped++;
      }

      results.deals.push(dealResult);
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
// que uma falha de borda dentro dela é registrada e NÃO relançada (catch de :242).
// Acrescentar a propriedade não muda o que scheduleTask agenda nem quem chama o quê.
module.exports.runWeeklySummary = runWeeklySummary;
