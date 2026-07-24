const express = require('express');
const router = express.Router();
const {
  getStaleDeals,
  getUsers,
  getDealsWithFutureTasks,
} = require('../agendor');
const { getConfig } = require('../db');

// GET /api/deals/stale — lista negócios parados
router.get('/stale', async (req, res) => {
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
