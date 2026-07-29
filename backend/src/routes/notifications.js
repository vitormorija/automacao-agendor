const express = require('express');
const router = express.Router();
const {
  getNotificationLogs,
  getConfig,
  getNotificationStats,
  getNotifiedDeals,
  markResolved,
  logNotification,
  getNotifiedDealIds,
} = require('../db');
const { runCheck, runCheckOnly, getStatus } = require('../scheduler');
const {
  sendStaleNotification,
  sendWeeklySummary,
  sendOwnerWeeklySummary,
} = require('../emailer');
const { getStaleDeals, getUsers } = require('../agendor');
const axios = require('axios');

// GET /api/notifications — histórico de notificações
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const result = getNotificationLogs({ limit, offset });
  res.json(result);
});

// GET /api/notifications/status — status do scheduler
router.get('/status', (req, res) => {
  res.json({ ...getStatus(), ...getNotificationStats() });
});

// POST /api/notifications/check — apenas verifica, SEM enviar emails
router.post('/check', async (req, res) => {
  try {
    const deals = await runCheckOnly();
    res.json({ total: deals.length, deals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/run — verifica E envia emails
router.post('/run', async (req, res) => {
  try {
    const result = await runCheck();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/test-card — envia email de card de teste para um email específico
router.post('/test-card', async (req, res) => {
  const {
    email,
    ownerName,
    title,
    organization,
    orgCategory,
    dealType,
    funnel,
    stage,
    daysSinceUpdate,
  } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório' });
  const mockDeal = {
    id: 0,
    title: title || 'Exemplo de Negócio Parado [TESTE]',
    ownerName: ownerName || 'Responsável Exemplo',
    authorName: ownerName || 'Criador Exemplo',
    organization: organization || 'Empresa Exemplo Ltda',
    orgCategory: orgCategory || 'Lead',
    dealType: dealType || 'Lead',
    funnel: funnel || 'Funil Principal',
    stage: stage || 'Proposta Enviada',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(
      Date.now() - (daysSinceUpdate || 18) * 24 * 60 * 60 * 1000,
    ).toISOString(),
    daysSinceUpdate: daysSinceUpdate || 18,
    webUrl: `https://web.agendor.com.br/sistema/negocios/historico.php?id=${req.body.dealId || '5620'}`,
  };
  try {
    // Salva no log para habilitar rastreamento de clique
    const logEntry = logNotification({
      deal_id: req.body.dealId || 0,
      deal_title: mockDeal.title,
      owner_name: mockDeal.ownerName,
      owner_email: email,
      admin_email: null,
      days_stale: mockDeal.daysSinceUpdate,
      status: 'sent',
      error: null,
      deal_updated_at: mockDeal.updatedAt,
      deal_type: mockDeal.dealType,
      web_url: mockDeal.webUrl,
    });
    const logId = logEntry.lastInsertRowid;
    await sendStaleNotification({
      deal: mockDeal,
      ownerEmail: email,
      authorEmail: null,
      logId,
    });
    res.json({ ok: true, message: `Email de card enviado para ${email}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/notifications/test-summary — envia resumo semanal de teste com dados reais
router.post('/test-summary', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório' });
  try {
    const staleDays = parseInt(getConfig('stale_days')) || 15;
    const [deals, users] = await Promise.all([
      getStaleDeals(staleDays),
      getUsers(),
    ]);
    const enriched = deals.map((d) => ({
      ...d,
      ownerEmail: users[d.ownerId]?.email || null,
    }));
    await sendWeeklySummary({ deals: enriched, adminEmails: [email] });
    res.json({
      ok: true,
      message: `Resumo semanal enviado para ${email} com ${enriched.length} negócio(s)`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/notifications/test-owner-summary — envia amostra do relatório individual (todos os deals) para um email de teste
router.post('/test-owner-summary', async (req, res) => {
  const { email, ownerName } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório' });
  try {
    const staleDays = parseInt(getConfig('stale_days')) || 15;
    const [deals, users] = await Promise.all([
      getStaleDeals(staleDays),
      getUsers(),
    ]);
    const enriched = deals.map((d) => ({
      ...d,
      ownerEmail: users[d.ownerId]?.email || null,
    }));

    // Simula como se todos os deals fossem do email de teste
    const fakeOwnerId = '__test__';
    const mockUsers = { [fakeOwnerId]: { email } };
    const mockDeals = enriched.map((d) => ({
      ...d,
      ownerId: fakeOwnerId,
      ownerName: ownerName || d.ownerName || 'Comercial Teste',
    }));

    const results = await sendOwnerWeeklySummary({
      deals: mockDeals,
      users: mockUsers,
    });
    res.json({
      ok: true,
      message: `Relatório de teste enviado para ${email} com ${enriched.length} card(s)`,
      results,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/notifications/send-owner-summaries — dispara os relatórios para TODOS os comerciais agora
router.post('/send-owner-summaries', async (req, res) => {
  try {
    const staleDays = parseInt(getConfig('stale_days')) || 15;
    const [deals, users] = await Promise.all([
      getStaleDeals(staleDays),
      getUsers(),
    ]);
    const enriched = deals.map((d) => ({
      ...d,
      ownerEmail: users[d.ownerId]?.email || null,
    }));
    const results = await sendOwnerWeeklySummary({ deals: enriched, users });
    const sent = results.filter((r) => r.success).length;
    res.json({ ok: true, sent, total: results.length, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/notifications/notified-deals — retorna mapa de deal_id -> {clicked, clicked_at}
router.get('/notified-deals', (req, res) => {
  res.json(getNotifiedDealIds());
});

// GET /api/notifications/resolved — verifica quais deals notificados foram atualizados no Agendor
router.get('/resolved', async (req, res) => {
  try {
    const TOKEN = process.env.AGENDOR_TOKEN;

    const notifiedDeals = getNotifiedDeals();
    if (!notifiedDeals.length)
      return res.json({
        resolved: [],
        pending: [],
        totalNotified: 0,
        resolvedCount: 0,
        pendingCount: 0,
        resolvedRate: 0,
      });

    // Verifica status atual de cada deal na API do Agendor
    const results = await Promise.all(
      notifiedDeals.map(async (d) => {
        try {
          const { data } = await axios.get(
            `https://api.agendor.com.br/v3/deals/${d.deal_id}`,
            { headers: { Authorization: `Token ${TOKEN}` } },
          );
          const currentUpdatedAt = data.data?.updatedAt;
          const isResolved =
            currentUpdatedAt &&
            new Date(currentUpdatedAt) > new Date(d.last_notified_at);

          if (isResolved && !d.resolved) {
            markResolved(d.deal_id, currentUpdatedAt);
          }

          return {
            ...d,
            currentUpdatedAt,
            resolved: isResolved || d.resolved === 1,
            resolved_at: isResolved ? currentUpdatedAt : d.resolved_at,
            dealStatus: data.data?.dealStatus?.id, // 1=em andamento, 2=ganho, 3=perdido
          };
        } catch {
          return { ...d, resolved: d.resolved === 1 };
        }
      }),
    );

    const resolved = results.filter((d) => d.resolved);
    const pending = results.filter((d) => !d.resolved);

    res.json({
      resolved,
      pending,
      totalNotified: results.length,
      resolvedCount: resolved.length,
      pendingCount: pending.length,
      resolvedRate: results.length
        ? Math.round((resolved.length / results.length) * 100)
        : 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
