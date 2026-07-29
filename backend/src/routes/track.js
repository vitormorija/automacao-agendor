const express = require('express');
const router = express.Router();
const { recordClick, getLogById } = require('../db');

// Só permite redirecionar para domínios do Agendor — evita virar um redirect aberto
// que poderia ser usado em phishing.
function isSafeRedirect(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'agendor.com.br' || host.endsWith('.agendor.com.br');
  } catch (_) {
    return false;
  }
}

// GET /api/track/click?log_id=123[&u=<fallback_url>]
// Registra o clique e redireciona para o card no Agendor.
// O parâmetro `u` é usado como fallback se o log_id não existir mais (DB resetado, log antigo apagado).
router.get('/click', (req, res) => {
  const logId = parseInt(req.query.log_id, 10);
  const fallback = typeof req.query.u === 'string' ? req.query.u : null;

  if (Number.isFinite(logId) && logId > 0) {
    try {
      const log = getLogById(logId);
      if (log && log.web_url) {
        if (!log.clicked_at) recordClick(logId);
        return res.redirect(log.web_url);
      }
    } catch (err) {
      console.error('[Track] Erro ao registrar clique:', err.message);
    }
  }

  // Fallback explícito da querystring (só se for URL do Agendor)
  if (fallback && isSafeRedirect(fallback)) {
    return res.redirect(fallback);
  }

  // Último recurso: home do Agendor
  res.redirect('https://web.agendor.com.br');
});

module.exports = router;
