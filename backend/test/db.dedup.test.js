// Caracterização da regra de dedup do mesmo dia (`alreadyNotifiedToday`).
// DOCUMENTA O COMPORTAMENTO ATUAL — a garantia de que o mesmo deal nunca é
// notificado duas vezes no MESMO dia, e de que a fronteira do dia funciona como
// funciona hoje (TEST-03).
//
// Por que ARQUIVO temporário e não `:memory:` (RESEARCH Pitfall 4): db.js abre UMA
// conexão no load e `logNotification` grava sempre `sent_at = agora`. Para exercitar
// o caso "notificado ONTEM" precisamos semear um sent_at do passado — o que só é
// possível por uma SEGUNDA conexão better-sqlite3 apontando para o MESMO arquivo.
// Com `:memory:` a segunda conexão veria um banco isolado e vazio.

const { makeTmpDbPath, openRaw } = require('./helpers/tmpDb');

// Cria o arquivo temporário e fixa DB_PATH ANTES de qualquer require('../src/db'):
// db.js lê process.env.DB_PATH no momento do load e abre a conexão ali (seam 01-01).
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

// setup.js só define DB_PATH se ausente — como já definimos acima, o arquivo temp vence.
require('./setup');

const { test, after } = require('node:test');
const assert = require('node:assert/strict');

// require do db DEPOIS de setar DB_PATH: a conexão singleton abre no arquivo temp.
const db = require('../src/db');

after(() => {
  // Fecha a conexão do singleton e remove o arquivo temp; backend/agendor.db intocado.
  db.closeDb();
  cleanup();
});

test('alreadyNotifiedToday: deal notificado hoje (status "sent") -> true', () => {
  const dealId = 9001;
  db.logNotification({
    deal_id: dealId,
    deal_title: 'Deal notificado hoje',
    owner_name: 'Fulano',
    owner_email: 'fulano@example.com',
    admin_email: 'admin@example.com',
    days_stale: 20,
    status: 'sent',
  });
  // sent_at = agora (hoje) e status = 'sent' -> a regra de dedup considera notificado.
  assert.equal(db.alreadyNotifiedToday(dealId), true);
});

test('alreadyNotifiedToday: deal sem nenhuma linha -> false', () => {
  // Nenhum registro para este id -> pode notificar.
  assert.equal(db.alreadyNotifiedToday(9999), false);
});

test('alreadyNotifiedToday: deal notificado ONTEM -> false (fronteira do dia pinada)', () => {
  const dealId = 9002;

  // Semeia um sent_at de ontem por uma SEGUNDA conexão ao MESMO arquivo temp,
  // porque logNotification só sabe gravar "agora". Documenta o comportamento
  // ATUAL: a dedup compara pelo prefixo de DATA (YYYY-MM-DD) do sent_at, então
  // uma notificação de ontem NÃO bloqueia o envio de hoje.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const seed = openRaw(DB_PATH);
  try {
    seed
      .prepare(
        `INSERT INTO notification_log
           (deal_id, deal_title, owner_name, owner_email, admin_email, sent_at, days_stale, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dealId,
        'Deal notificado ontem',
        'Beltrano',
        'beltrano@example.com',
        'admin@example.com',
        yesterday,
        30,
        'sent',
      );
  } finally {
    seed.close();
  }

  // O singleton (outra conexão, mesmo arquivo) enxerga a linha semeada e mesmo assim
  // retorna false, porque a data de ontem != data de hoje.
  assert.equal(db.alreadyNotifiedToday(dealId), false);
});
