const cron = require('node-cron');
const { getConfig, logNotification, alreadyNotifiedToday } = require('./db');
const { getStaleDeals, getUsers } = require('./agendor');
const { sendStaleNotification } = require('./emailer');

let currentTask = null;
let lastRunResult = null;
let isRunning = false;

async function runCheck() {
  if (isRunning) return { skipped: true, reason: 'Verificação já em andamento' };
  isRunning = true;

  const startTime = new Date();
  const results = { checked: 0, stale: 0, notified: 0, skipped: 0, errors: [], deals: [] };

  try {
    const staleDays = parseInt(getConfig('stale_days')) || 15;
    const adminEmail = getConfig('admin_email');
    const notificationsEnabled = getConfig('notifications_enabled') === 'true';

    console.log(`[Scheduler] Iniciando verificação — threshold: ${staleDays} dias`);

    const [staleDeals, users] = await Promise.all([
      getStaleDeals(staleDays),
      getUsers(),
    ]);

    results.stale = staleDeals.length;

    for (const deal of staleDeals) {
      results.checked++;
      const owner = users[deal.ownerId];
      const ownerEmail = owner?.email || null;

      const dealResult = {
        id: deal.id,
        title: deal.title,
        ownerName: deal.ownerName,
        ownerEmail,
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

      if (notificationsEnabled && (ownerEmail || adminEmail)) {
        try {
          const emailResults = await sendStaleNotification({ deal, ownerEmail, adminEmail });
          const allOk = emailResults.every(r => r.success);
          const errors = emailResults.filter(r => !r.success).map(r => r.error);

          logNotification({
            deal_id: deal.id,
            deal_title: deal.title,
            owner_name: deal.ownerName,
            owner_email: ownerEmail,
            admin_email: adminEmail,
            days_stale: deal.daysSinceUpdate,
            status: allOk ? 'sent' : 'error',
            error: errors.join('; ') || null,
          });

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
            admin_email: adminEmail,
            days_stale: deal.daysSinceUpdate,
            status: 'error',
            error: err.message,
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
    console.log(`[Scheduler] Concluído: ${results.stale} negócios parados, ${results.notified} notificações enviadas`);
  } catch (err) {
    results.error = err.message;
    console.error('[Scheduler] Erro na verificação:', err);
  } finally {
    isRunning = false;
    lastRunResult = results;
  }

  return results;
}

function scheduleTask() {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }

  const schedule = getConfig('cron_schedule') || '0 8 * * *';
  const notificationsEnabled = getConfig('notifications_enabled') === 'true';

  if (!notificationsEnabled) {
    console.log('[Scheduler] Notificações desativadas — agendamento pausado');
    return;
  }

  console.log(`[Scheduler] Agendado com: "${schedule}"`);
  currentTask = cron.schedule(schedule, runCheck, { timezone: 'America/Sao_Paulo' });
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

module.exports = { scheduleTask, runCheck, getStatus };
