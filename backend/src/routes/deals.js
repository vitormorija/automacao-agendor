const express = require('express');
const router = express.Router();
const {
  getStaleDeals,
  getUsers,
  getDealsWithFutureTasks,
} = require('../agendor');
const { getConfig } = require('../db');
const logger = require('../logger');

// GET /api/deals/stale — lista negócios parados
async function staleHandler(req, res) {
  try {
    const staleDays = parseInt(getConfig('stale_days')) || 15;
    const [staleDeals, users, futureTasks] = await Promise.all([
      getStaleDeals(staleDays),
      getUsers(),
      getDealsWithFutureTasks(),
    ]);

    const dealsWithEmails = staleDeals.map((deal) => ({
      ...deal,
      ownerEmail: users[deal.ownerId]?.email || null,
      hasFutureTask: futureTasks.has(deal.id),
    }));

    res.json({
      deals: dealsWithEmails,
      total: dealsWithEmails.length,
      staleDays,
    });
  } catch (err) {
    // Só a MENSAGEM vai para o log — nunca o objeto de erro (CR-02). O AxiosError carrega
    // `config.headers` com o header `Authorization` e o token de serviço da Agendor dentro
    // dele, e a chamada crua de console que estava aqui despejava esse objeto inteiro no
    // stream que o PM2 persiste em `/opt/agendor/logs/pm2-error.log`
    // (`ecosystem.config.js:20`) — a credencial gravada em disco, sobrevivendo a restart,
    // sempre que a API Agendor ficasse lenta.
    // Mesma razão já registrada em `agendor.js:291-292`, que corrigiu só o outro lado.
    // Pinado por backend/test/deals.errorLog.test.js: o teste injeta um token sintético no
    // header e falha se ele reaparecer na serialização do que foi entregue ao logger.
    logger.error('[Deals] Erro ao listar negócios parados:', err.message);
    res.status(500).json({ error: err.message });
  }
}

router.get('/stale', staleHandler);

module.exports = router;

// ── Seams de teste (não afetam o roteamento do Express) ──────────
// app.use() só precisa que module.exports seja a função router; esta prop extra
// é ignorada pelo Express e existe para invocar o handler direto, com um `res`
// falso mínimo e sem subir servidor HTTP nem depender de supertest.
// Motivo: esta rota é o consumidor B3 de getDealsWithFutureTasks. Com o
// fail-safe de REL-06 (Decisão Q2) a consulta de tarefas passou a propagar a
// falha, então o catch acima responde 500 { error } em vez de devolver a lista
// com `hasFutureTask` silenciosamente errado. Esse 500 é decisão humana aceita
// e precisa ficar pinado por asserção.
module.exports.staleHandler = staleHandler;
