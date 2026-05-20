const express = require('express');
const router = express.Router();
const { recordClick, getLogById } = require('../db');

// GET /api/track/click?log_id=123
// Registra o clique e redireciona para o card no Agendor
router.get('/click', (req, res) => {
  const { log_id } = req.query;

  if (log_id) {
    try {
      const log = getLogById(parseInt(log_id));
      if (log) {
        if (!log.clicked_at) recordClick(parseInt(log_id));
        if (log.web_url) return res.redirect(log.web_url);
      }
    } catch (err) {
      console.error('[Track] Erro ao registrar clique:', err.message);
    }
  }

  // Fallback: redireciona para o Agendor genérico
  res.redirect('https://web.agendor.com.br');
});

module.exports = router;
