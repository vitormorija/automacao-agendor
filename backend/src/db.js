const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'agendor.db'));

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
`);

// Valores padrão de configuração
const defaults = {
  stale_days: '15',
  admin_email: process.env.ADMIN_EMAIL || '',
  smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtp_port: process.env.SMTP_PORT || '587',
  smtp_user: process.env.SMTP_USER || '',
  smtp_pass: process.env.SMTP_PASS || '',
  smtp_from: process.env.SMTP_FROM || '',
  cron_schedule: '0 8 * * *', // 8h todo dia
  notifications_enabled: 'true',
};

for (const [key, value] of Object.entries(defaults)) {
  const existing = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  if (!existing) {
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(key, value);
  }
}

function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, String(value));
}

function getAllConfig() {
  const rows = db.prepare('SELECT key, value FROM config').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function logNotification({ deal_id, deal_title, owner_name, owner_email, admin_email, days_stale, status, error }) {
  return db.prepare(`
    INSERT INTO notification_log (deal_id, deal_title, owner_name, owner_email, admin_email, sent_at, days_stale, status, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(deal_id, deal_title, owner_name, owner_email, admin_email, new Date().toISOString(), days_stale, status, error || null);
}

function getNotificationLogs({ limit = 100, offset = 0 } = {}) {
  const rows = db.prepare('SELECT * FROM notification_log ORDER BY sent_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as count FROM notification_log').get().count;
  return { logs: rows, total };
}

// Verifica se já enviamos notificação hoje para este deal
function alreadyNotifiedToday(deal_id) {
  const today = new Date().toISOString().split('T')[0];
  const row = db.prepare(`
    SELECT id FROM notification_log
    WHERE deal_id = ? AND sent_at LIKE ? AND status = 'sent'
  `).get(deal_id, `${today}%`);
  return !!row;
}

module.exports = { getConfig, setConfig, getAllConfig, logNotification, getNotificationLogs, alreadyNotifiedToday };
