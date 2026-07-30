// Ramo DEFENSIVO da migração de senha SMTP (CFG-01, D-02): quando SMTP_PASS está
// AUSENTE do ambiente, a senha antiga gravada na tabela `config` tem de ser
// PRESERVADA e um aviso tem de ser logado.
//
// O que este arquivo protege: o cenário de um `.env` incompleto num deploy. Se a
// migração zerasse a chave incondicionalmente, o primeiro `pm2 restart` com o
// ambiente mal configurado deixaria o sistema sem nenhuma senha SMTP — nem no
// banco, nem no ambiente — e o envio de e-mail (o core value do projeto) pararia
// em silêncio. A asserção de preservação já passa hoje; o que discrimina o antes
// e o depois é a asserção sobre o aviso.
//
// Por que um ARQUIVO próprio: `node --test` roda cada arquivo num processo
// separado, e db.js abre a conexão e roda a migração NO require — não dá para
// reconfigurar o ambiente depois. O ramo oposto (env presente) mora em
// db.smtpPassMigration.clear.test.js.

const { makeTmpDbPath, openRaw } = require('./helpers/tmpDb');

// DB_PATH em arquivo temporário fixado ANTES do require('./setup'): o preset do
// setup é guardado (`if (!process.env.DB_PATH)`), então o temporário vence. Arquivo
// e não `:memory:` porque a senha antiga é semeada por uma SEGUNDA conexão, antes
// de db.js abrir a dele.
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

// Aqui NÃO se define SMTP_PASS: o setup.js força `''` sem guarda (linha 31), que é
// exatamente o ambiente que este ramo precisa exercitar.
require('./setup');

const { test, after, mock } = require('node:test');
const assert = require('node:assert/strict');

// Semeia a senha antiga com o DDL exato da tabela `config` de db.js, ANTES do load.
const seed = openRaw(DB_PATH);
try {
  seed.exec(
    'CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  );
  seed
    .prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)')
    .run('smtp_pass', 'senha-antiga');
} finally {
  seed.close();
}

// O aviso é emitido durante o LOAD de db.js, então o espião precisa estar
// instalado antes do require. db.js guarda o módulo logger (não a função), e a
// chamada resolve a propriedade em tempo de execução — mock.method funciona.
const logger = require('../src/logger');
const warnings = [];
mock.method(logger, 'warn', (...args) => {
  warnings.push(args.join(' '));
});

const db = require('../src/db');

after(() => {
  mock.restoreAll();
  db.closeDb();
  cleanup();
});

test('SMTP_PASS ausente: a senha antiga do banco é PRESERVADA (D-02)', () => {
  assert.equal(process.env.SMTP_PASS, '');
  assert.equal(db.getConfig('smtp_pass'), 'senha-antiga');
});

test('SMTP_PASS ausente: a migração loga um aviso explicando como concluí-la', () => {
  const aviso = warnings.find((w) => w.includes('SMTP_PASS'));
  assert.ok(
    aviso,
    `esperava um logger.warn citando SMTP_PASS; recebidos: ${JSON.stringify(warnings)}`,
  );
  // A mensagem tem de dizer o que foi feito e o que falta fazer — sem isso o
  // operador não tem como saber que a migração ficou pela metade.
  assert.match(aviso, /PRESERVADA/);
  assert.match(aviso, /\.env/);
});

test('getAllConfig continua devolvendo a chave smtp_pass (zerada, nunca removida)', () => {
  // O mascaramento do GET /api/config (routes/config.js:38) depende da chave
  // existir; a migração zera o valor, nunca faz DELETE.
  assert.ok('smtp_pass' in db.getAllConfig());
});
