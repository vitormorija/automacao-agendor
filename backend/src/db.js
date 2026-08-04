const Database = require('better-sqlite3');
const path = require('path');
const logger = require('./logger');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'agendor.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL,
    deal_title TEXT NOT NULL,
    owner_name TEXT,
    owner_email TEXT,
    admin_email TEXT,
    sent_at TEXT NOT NULL,
    days_stale INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS weekly_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_label TEXT NOT NULL,
    snapshot_at TEXT NOT NULL,
    total_stale INTEGER NOT NULL,
    avg_days REAL NOT NULL,
    max_days INTEGER NOT NULL,
    by_owner TEXT NOT NULL,
    by_category TEXT NOT NULL,
    by_funnel TEXT NOT NULL
  );
`);

// Tabela de usuários do sistema (login)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
} catch (_) {}

// Tokens de redefinição de senha (expiram em 1h)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
} catch (_) {}

// Log de acessos ao sistema
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      success INTEGER NOT NULL,
      ip TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
} catch (_) {}

// Migrations: adiciona colunas ao notification_log se ainda não existirem
const migrations = [
  `ALTER TABLE notification_log ADD COLUMN deal_updated_at TEXT`,
  `ALTER TABLE notification_log ADD COLUMN deal_type TEXT`,
  `ALTER TABLE notification_log ADD COLUMN web_url TEXT`,
  `ALTER TABLE notification_log ADD COLUMN resolved INTEGER DEFAULT 0`,
  `ALTER TABLE notification_log ADD COLUMN resolved_at TEXT`,
  `ALTER TABLE notification_log ADD COLUMN clicked_at TEXT`,
];
for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch (_) {
    /* coluna já existe */
  }
}

// Índices para as colunas mais consultadas/filtradas no notification_log.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_notiflog_deal_id ON notification_log (deal_id);
  CREATE INDEX IF NOT EXISTS idx_notiflog_sent_at ON notification_log (sent_at);
  CREATE INDEX IF NOT EXISTS idx_notiflog_status  ON notification_log (status);
`);

// Valores padrão de configuração
const defaults = {
  stale_days: '15',
  admin_email: process.env.ADMIN_EMAIL || '',
  smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtp_port: process.env.SMTP_PORT || '587',
  smtp_user: process.env.SMTP_USER || '',
  smtp_from: process.env.SMTP_FROM || '',
  cron_schedule: '0 8 * * *', // 8h todo dia
  notifications_enabled: 'true',
  notify_author: 'false',
};

for (const [key, value] of Object.entries(defaults)) {
  const existing = db
    .prepare('SELECT value FROM config WHERE key = ?')
    .get(key);
  if (!existing) {
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(key, value);
  }
}

// ── Migração: a senha SMTP sai do banco (D-01/D-02, CFG-01) ──────
//
// EXCEÇÃO DELIBERADA ao padrão "toda config runtime mora na tabela config":
// smtp_pass é o único valor aqui que é de fato um segredo, e o backup diário
// (deploy/backup.sh) copia o .db inteiro — ou seja, a senha ia parar em até 30
// cópias em disco. A partir daqui ela vem só do ambiente, lida em emailer.js.
// Host, porta, usuário e remetente continuam no banco e editáveis pela UI.
//
// A migração é DEFENSIVA (D-02): só zera o valor antigo se o ambiente realmente
// tiver a senha. Um .env incompleto no deploy nunca deve derrubar o envio de e-mail —
// nesse caso o valor do banco é preservado e um aviso é logado.
// É idempotente: rodar N vezes tem o mesmo efeito de rodar uma. Zera (valor '')
// em vez de DELETE de propósito: a linha continua existindo, então nem o seeder
// acima nem nada mais a recria com a senha do ambiente.
try {
  const envPass = (process.env.SMTP_PASS || '').trim();
  const dbPass = getConfig('smtp_pass');

  if (envPass && dbPass) {
    setConfig('smtp_pass', '');
    logger.info(
      '[DB] smtp_pass removida da tabela config — a senha SMTP agora vem de SMTP_PASS (D-01).',
    );
  } else if (!envPass && dbPass) {
    logger.warn(
      '[DB] SMTP_PASS ausente no ambiente — a senha antiga foi PRESERVADA no banco para não ' +
        'interromper o envio de e-mail. Defina SMTP_PASS em backend/.env e reinicie para concluir a migração.',
    );
  }
} catch (_) {
  /* banco recém-criado ou chave inexistente — nada a migrar */
}

function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(
    key,
    String(value),
  );
}

function getAllConfig() {
  const rows = db.prepare('SELECT key, value FROM config').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function logNotification({
  deal_id,
  deal_title,
  owner_name,
  owner_email,
  admin_email,
  days_stale,
  status,
  error,
  deal_updated_at,
  deal_type,
  web_url,
}) {
  return db
    .prepare(`
    INSERT INTO notification_log (deal_id, deal_title, owner_name, owner_email, admin_email, sent_at, days_stale, status, error, deal_updated_at, deal_type, web_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      deal_id,
      deal_title,
      owner_name,
      owner_email,
      admin_email,
      new Date().toISOString(),
      days_stale,
      status,
      error || null,
      deal_updated_at || null,
      deal_type || null,
      web_url || null,
    );
}

function getNotificationLogs({ limit = 100, offset = 0 } = {}) {
  const rows = db
    .prepare(
      'SELECT * FROM notification_log ORDER BY sent_at DESC LIMIT ? OFFSET ?',
    )
    .all(limit, offset);
  const total = db
    .prepare('SELECT COUNT(*) as count FROM notification_log')
    .get().count;
  return { logs: rows, total };
}

// Verifica se já enviamos notificação hoje para este deal
function alreadyNotifiedToday(deal_id) {
  const today = new Date().toISOString().split('T')[0];
  const row = db
    .prepare(`
    SELECT id FROM notification_log
    WHERE deal_id = ? AND sent_at LIKE ? AND status = 'sent'
  `)
    .get(deal_id, `${today}%`);
  return !!row;
}

function saveWeeklySnapshot({
  week_label,
  total_stale,
  avg_days,
  max_days,
  by_owner,
  by_category,
  by_funnel,
}) {
  db.prepare(`
    INSERT INTO weekly_snapshots (week_label, snapshot_at, total_stale, avg_days, max_days, by_owner, by_category, by_funnel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    week_label,
    new Date().toISOString(),
    total_stale,
    avg_days,
    max_days,
    JSON.stringify(by_owner),
    JSON.stringify(by_category),
    JSON.stringify(by_funnel),
  );
}

function getWeeklySnapshots(limit = 12) {
  return db
    .prepare('SELECT * FROM weekly_snapshots ORDER BY snapshot_at DESC LIMIT ?')
    .all(limit)
    .reverse()
    .map((row) => ({
      ...row,
      by_owner: JSON.parse(row.by_owner),
      by_category: JSON.parse(row.by_category),
      by_funnel: JSON.parse(row.by_funnel),
    }));
}

function getNotificationStats() {
  const total = db
    .prepare(
      `SELECT COUNT(*) as count FROM notification_log WHERE status = 'sent'`,
    )
    .get().count;
  const clicked = db
    .prepare(
      `SELECT COUNT(*) as count FROM notification_log WHERE status = 'sent' AND clicked_at IS NOT NULL`,
    )
    .get().count;
  const lastSent = db
    .prepare(
      `SELECT sent_at FROM notification_log WHERE status = 'sent' ORDER BY sent_at DESC LIMIT 1`,
    )
    .get();
  return {
    totalSent: total,
    totalClicked: clicked,
    clickRate: total > 0 ? Math.round((clicked / total) * 100) : 0,
    lastSentAt: lastSent?.sent_at || null,
  };
}

function getClickedDealIds() {
  const rows = db
    .prepare(
      `SELECT DISTINCT deal_id FROM notification_log WHERE clicked_at IS NOT NULL`,
    )
    .all();
  return new Set(rows.map((r) => r.deal_id));
}

function getNotifiedDealIds() {
  const rows = db
    .prepare(
      `SELECT deal_id, MAX(clicked_at) as clicked_at FROM notification_log WHERE status = 'sent' GROUP BY deal_id`,
    )
    .all();
  const map = {};
  rows.forEach((r) => {
    map[r.deal_id] = { clicked: !!r.clicked_at, clicked_at: r.clicked_at };
  });
  return map;
}

function getNotifiedDeals() {
  return db
    .prepare(`
    SELECT deal_id, deal_title, owner_name, owner_email, MAX(sent_at) as last_notified_at,
           deal_updated_at, deal_type, web_url, resolved, resolved_at,
           COUNT(*) as notification_count
    FROM notification_log
    WHERE status = 'sent'
    GROUP BY deal_id
    ORDER BY last_notified_at DESC
  `)
    .all();
}

function markResolved(deal_id, resolved_at) {
  db.prepare(
    `UPDATE notification_log SET resolved = 1, resolved_at = ? WHERE deal_id = ?`,
  ).run(resolved_at, deal_id);
}

// Reconcilia o status da MESMA linha depois que o envio termina (REL-05): a linha
// nasce 'pending' e vira 'sent' ou 'error' conforme o resultado por destinatário.
// Existe para que o caminho de falha ATUALIZE o registro em vez de inserir um segundo.
function updateNotificationStatus(log_id, status, error) {
  db.prepare(
    `UPDATE notification_log SET status = ?, error = ? WHERE id = ?`,
  ).run(status, error || null, log_id);
}

function recordClick(log_id) {
  db.prepare(`UPDATE notification_log SET clicked_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    log_id,
  );
}

function getLogById(id) {
  return db.prepare(`SELECT * FROM notification_log WHERE id = ?`).get(id);
}

// ── Funções de usuários do sistema ──────────────────────────────

function getUser(username) {
  return db.prepare('SELECT * FROM app_users WHERE username = ?').get(username);
}

function createUser(username, password) {
  return db
    .prepare(
      'INSERT OR REPLACE INTO app_users (username, password) VALUES (?, ?)',
    )
    .run(username, password);
}

function listUsers() {
  return db.prepare('SELECT id, username, created_at FROM app_users').all();
}

function deleteUser(username) {
  return db.prepare('DELETE FROM app_users WHERE username = ?').run(username);
}

function updateUserPassword(username, hashedPassword) {
  return db
    .prepare('UPDATE app_users SET password = ? WHERE username = ?')
    .run(hashedPassword, username);
}

// ── Reset de senha ───────────────────────────────────────────────

function saveResetToken(username, token, expiresAt) {
  // Limpa tokens anteriores deste usuário
  db.prepare('DELETE FROM reset_tokens WHERE username = ?').run(username);
  return db
    .prepare(
      'INSERT INTO reset_tokens (username, token, expires_at) VALUES (?, ?, ?)',
    )
    .run(username, token, expiresAt);
}

function getResetToken(token) {
  return db
    .prepare('SELECT * FROM reset_tokens WHERE token = ? AND used = 0')
    .get(token);
}

function markTokenUsed(token) {
  return db
    .prepare('UPDATE reset_tokens SET used = 1 WHERE token = ?')
    .run(token);
}

// ── Log de acessos ───────────────────────────────────────────────

function logLogin({ username, success, ip, reason }) {
  return db
    .prepare(
      'INSERT INTO login_logs (username, success, ip, reason) VALUES (?, ?, ?, ?)',
    )
    .run(username, success ? 1 : 0, ip || null, reason || null);
}

function getLoginLogs(limit = 50) {
  return db
    .prepare('SELECT * FROM login_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit);
}

// Fecha a conexão com o banco (usado no graceful shutdown).
function closeDb() {
  try {
    db.close();
  } catch (_) {
    /* já fechado */
  }
}

module.exports = {
  closeDb,
  getConfig,
  setConfig,
  getAllConfig,
  logNotification,
  getNotificationLogs,
  alreadyNotifiedToday,
  saveWeeklySnapshot,
  getWeeklySnapshots,
  getNotificationStats,
  getNotifiedDeals,
  markResolved,
  updateNotificationStatus,
  recordClick,
  getLogById,
  getClickedDealIds,
  getNotifiedDealIds,
  getUser,
  createUser,
  listUsers,
  deleteUser,
  updateUserPassword,
  saveResetToken,
  getResetToken,
  markTokenUsed,
  logLogin,
  getLoginLogs,
};
