const express = require('express');
const router = express.Router();
const { getNotificationLogs } = require('../db');
const { runCheck, getStatus } = require('../scheduler');

// GET /api/notifications — histórico de notificações
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const result = getNotificationLogs({ limit, offset });
  res.json(result);
});

// GET /api/notifications/status — status do scheduler
router.get('/status', (req, res) => {
  res.json(getStatus());
});

// POST /api/notifications/run — executa verificação manualmente
router.post('/run', async (req, res) => {
  try {
    const result = await runCheck();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
