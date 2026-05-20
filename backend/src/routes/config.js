const express = require('express');
const router = express.Router();
const { getAllConfig, setConfig } = require('../db');
const { scheduleTask } = require('../scheduler');
const { verifySmtp } = require('../emailer');

// GET /api/config
router.get('/', (req, res) => {
  const config = getAllConfig();
  // Nunca expor a senha SMTP no GET
  const safe = { ...config, smtp_pass: config.smtp_pass ? '••••••••' : '' };
  res.json(safe);
});

// PUT /api/config
router.put('/', (req, res) => {
  const allowed = ['stale_days', 'admin_email', 'notify_author', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'cron_schedule', 'notifications_enabled'];
  for (const key of allowed) {
    if (req.body[key] !== undefined && req.body[key] !== '••••••••') {
      setConfig(key, req.body[key]);
    }
  }
  // Reagendar se necessário
  scheduleTask();
  res.json({ ok: true });
});

// POST /api/config/test-smtp — testa conexão SMTP
router.post('/test-smtp', async (req, res) => {
  try {
    await verifySmtp();
    res.json({ ok: true, message: 'Conexão SMTP bem-sucedida!' });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

module.exports = router;
