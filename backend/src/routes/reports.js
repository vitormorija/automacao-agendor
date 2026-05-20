const express = require('express');
const router = express.Router();
const { getStaleDeals, getUsers } = require('../agendor');
const { getConfig, getWeeklySnapshots } = require('../db');

// GET /api/reports/current — dados para os gráficos (tempo real)
router.get('/current', async (req, res) => {
  try {
    const staleDays = parseInt(getConfig('stale_days')) || 15;
    const [deals, users] = await Promise.all([getStaleDeals(staleDays), getUsers()]);

    // Enriquece com email
    const enriched = deals.map(d => ({
      ...d,
      ownerEmail: users[d.ownerId]?.email || null,
    }));

    // Agrupamento por responsável
    const byOwner = {};
    for (const d of enriched) {
      const name = d.ownerName || 'Sem responsável';
      if (!byOwner[name]) byOwner[name] = { name, count: 0, totalDays: 0, deals: [] };
      byOwner[name].count++;
      byOwner[name].totalDays += d.daysSinceUpdate;
      byOwner[name].deals.push(d);
    }
    const ownerData = Object.values(byOwner)
      .sort((a, b) => b.count - a.count)
      .map(o => ({ ...o, avgDays: Math.round(o.totalDays / o.count) }));

    // Agrupamento por categoria
    const byCategory = {};
    for (const d of enriched) {
      const cat = d.orgCategory || 'Indefinido';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }
    const categoryData = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Agrupamento por funil
    const byFunnel = {};
    for (const d of enriched) {
      const f = d.funnel || 'Sem funil';
      byFunnel[f] = (byFunnel[f] || 0) + 1;
    }
    const funnelData = Object.entries(byFunnel)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Agrupamento por faixa de urgência
    const urgencyBands = [
      { label: '15–20 dias', min: 15, max: 20 },
      { label: '21–30 dias', min: 21, max: 30 },
      { label: '31–45 dias', min: 31, max: 45 },
      { label: '46–60 dias', min: 46, max: 60 },
      { label: '60+ dias',   min: 61, max: Infinity },
    ];
    const urgencyData = urgencyBands.map(band => ({
      label: band.label,
      count: enriched.filter(d => d.daysSinceUpdate >= band.min && d.daysSinceUpdate <= band.max).length,
    }));

    // Histórico semanal
    const weeklyHistory = getWeeklySnapshots(12);

    // Resumo geral
    const totalDays = enriched.reduce((s, d) => s + d.daysSinceUpdate, 0);
    const summary = {
      total: enriched.length,
      avgDays: enriched.length ? Math.round(totalDays / enriched.length) : 0,
      maxDays: enriched.length ? Math.max(...enriched.map(d => d.daysSinceUpdate)) : 0,
      topOwner: ownerData[0]?.name || '—',
      topOwnerCount: ownerData[0]?.count || 0,
      staleDays,
    };

    res.json({ summary, ownerData, categoryData, funnelData, urgencyData, weeklyHistory, deals: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
