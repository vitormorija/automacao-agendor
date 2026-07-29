// CFG-01 / D-01 / Pitfall 4: a senha SMTP saiu do banco (03-03), mas enquanto
// 'smtp_pass' continuasse na allowlist do PUT /api/config a migração se desfazia
// na PRIMEIRA vez que alguém salvasse a aba Configurações — o save() do painel
// reenvia o objeto inteiro que veio do GET. Este arquivo fixa a ausência da chave.
//
// Sem HTTP e sem supertest (que não é dependência do projeto): a allowlist é uma
// constante de módulo exposta como seam no router, no mesmo padrão de
// routes/auth.js:359-369. Asserção pura, zero branches novos no gate de cobertura.

// setup PRIMEIRO: routes/config.js requer ../db, ../scheduler e ../emailer no
// load. Sem o preset de DB_PATH(:memory:)/JWT_SECRET o require abriria o
// backend/agendor.db de produção.
require('./setup');

const { test } = require('node:test');
const assert = require('node:assert/strict');

// config.js exporta o router (function) com o seam anexado como prop.
const configRouter = require('../src/routes/config');
const { ALLOWED_KEYS } = configRouter;

// As 9 chaves que continuam graváveis pela UI (o híbrido de D-01: host, porta,
// usuário e remetente seguem no banco; só a senha saiu).
const CHAVES_ESPERADAS = [
  'admin_email',
  'cron_schedule',
  'notifications_enabled',
  'notify_author',
  'smtp_from',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'stale_days',
];

test("allowlist do PUT /api/config NÃO aceita 'smtp_pass' (CFG-01)", () => {
  assert.ok(Array.isArray(ALLOWED_KEYS), 'ALLOWED_KEYS deve ser um array');
  assert.equal(
    ALLOWED_KEYS.includes('smtp_pass'),
    false,
    'a senha SMTP não pode ser regravável no banco pelo PUT',
  );
});

test('allowlist do PUT contém exatamente as 9 chaves restantes', () => {
  assert.deepEqual([...ALLOWED_KEYS].sort(), CHAVES_ESPERADAS);
});

test('o seam não quebra o contrato do router (app.use continua válido)', () => {
  // Props anexadas a module.exports = router são ignoradas pelo Express.
  assert.equal(typeof configRouter, 'function');
});
