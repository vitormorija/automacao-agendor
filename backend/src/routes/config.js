const express = require('express');
const cron = require('node-cron');
const router = express.Router();
const { getAllConfig, setConfig } = require('../db');
const { scheduleTask } = require('../scheduler');
const { verifySmtp } = require('../emailer');

// Valida cada chave de configuração. Retorna mensagem de erro ou null se ok.
const isBool = (v) => v === 'true' || v === 'false';
const isEmailList = (v) =>
  v.split(',').every((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim()));

const VALIDATORS = {
  stale_days: (v) =>
    Number.isInteger(+v) && +v >= 1 && +v <= 365
      ? null
      : 'stale_days deve ser um inteiro entre 1 e 365.',
  smtp_port: (v) =>
    Number.isInteger(+v) && +v >= 1 && +v <= 65535
      ? null
      : 'smtp_port deve ser uma porta válida (1-65535).',
  cron_schedule: (v) =>
    cron.validate(v) ? null : 'cron_schedule não é uma expressão cron válida.',
  notify_author: (v) =>
    isBool(v) ? null : "notify_author deve ser 'true' ou 'false'.",
  notifications_enabled: (v) =>
    isBool(v) ? null : "notifications_enabled deve ser 'true' ou 'false'.",
  admin_email: (v) =>
    v === '' || isEmailList(v)
      ? null
      : 'admin_email deve conter e-mails válidos separados por vírgula.',
};

// Chaves de configuração graváveis pelo PUT. É a superfície de escrita da API:
// o que não está aqui simplesmente não chega ao banco.
//
// 'smtp_pass' está FORA de propósito (CFG-01/D-01): a senha SMTP saiu da tabela
// config e vem só do ambiente. Se a chave continuasse gravável, a migração de
// boot se desfaria na primeira vez que alguém salvasse a aba Configurações — o
// save() do painel reenvia o objeto inteiro que veio do GET.
const ALLOWED_KEYS = [
  'stale_days',
  'admin_email',
  'notify_author',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_from',
  'cron_schedule',
  'notifications_enabled',
];

// GET /api/config
router.get('/', (req, res) => {
  const config = getAllConfig();
  // Nunca expor a senha SMTP no GET
  const safe = { ...config, smtp_pass: config.smtp_pass ? '••••••••' : '' };
  res.json(safe);
});

// PUT /api/config
router.put('/', (req, res) => {
  // Valida antes de gravar qualquer coisa (tudo ou nada).
  const updates = {};
  for (const key of ALLOWED_KEYS) {
    const value = req.body[key];
    if (value === undefined || value === '••••••••') continue;
    if (typeof value !== 'string' || value.length > 500) {
      return res
        .status(400)
        .json({ ok: false, message: `Valor inválido para ${key}.` });
    }
    const error = VALIDATORS[key]?.(value);
    if (error) return res.status(400).json({ ok: false, message: error });
    updates[key] = value;
  }

  for (const [key, value] of Object.entries(updates)) setConfig(key, value);

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

// ── Seams de teste (não afetam o roteamento do Express) ──────────
// app.use() só precisa que module.exports seja a função router; esta prop extra
// é ignorada pelo Express e existe para fixar por asserção que 'smtp_pass' está
// fora da superfície de escrita (CFG-01), sem subir servidor HTTP.
module.exports.ALLOWED_KEYS = ALLOWED_KEYS;
