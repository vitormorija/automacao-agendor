// Ramo ATIVO da migração de senha SMTP (CFG-01, D-01/D-02): quando SMTP_PASS está
// presente no ambiente, a chave `smtp_pass` da tabela `config` é ZERADA no boot —
// e o seeder de defaults NÃO a re-insere no boot seguinte.
//
// O que este arquivo protege: `deploy/backup.sh` copia o `backend/agendor.db`
// inteiro para até 30 cópias diárias em disco. Enquanto a senha morar na tabela
// `config`, ela mora também em todos esses backups. O segundo teste é a regressão
// do Pitfall 3: zerar sem tirar `smtp_pass` do objeto `defaults` de db.js faria o
// seeder regravar `process.env.SMTP_PASS` no SQLite no próximo boot, desfazendo a
// migração em silêncio.
//
// Por que um ARQUIVO próprio: `node --test` roda cada arquivo num processo
// separado, e db.js abre a conexão e roda a migração NO require. O ramo oposto
// (env ausente) mora em db.smtpPassMigration.keep.test.js.

const { makeTmpDbPath, openRaw } = require('./helpers/tmpDb');

// DB_PATH ANTES do require('./setup'): o preset do setup é GUARDADO
// (`if (!process.env.DB_PATH)`), então o arquivo temporário definido aqui vence.
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

require('./setup');

// ⚠ ORDEM INVERTIDA EM RELAÇÃO AO DB_PATH, E DE PROPÓSITO: setup.js:31 faz
// `process.env.SMTP_PASS = ''` SEM guarda (é intencional — impede que um segredo
// exportado no shell/CI vaze para o SQLite de teste). Logo, a atribuição abaixo
// tem de vir DEPOIS do setup, ao contrário de DB_PATH, que vem antes. Inverter as
// duas faria este arquivo exercitar o ramo "env ausente" e passar por acidente —
// um teste verde provando o contrário do que promete, o pior resultado possível.
process.env.SMTP_PASS = 'senha-do-env';

const { test, after } = require('node:test');
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

let db = require('../src/db');

after(() => {
  db.closeDb();
  cleanup();
});

test('SMTP_PASS presente: a senha antiga do banco é zerada no boot (D-02)', () => {
  assert.equal(db.getConfig('smtp_pass'), '');
  // Zerada, não deletada: a chave continua existindo.
  assert.ok('smtp_pass' in db.getAllConfig());
});

test('boot seguinte: o seeder de defaults NÃO re-insere a senha do ambiente (Pitfall 3)', () => {
  // Simula um segundo boot sobre o MESMO arquivo de banco: fecha a conexão do
  // singleton, descarta o módulo do cache e requer de novo, com
  // process.env.SMTP_PASS ainda definido.
  db.closeDb();
  delete require.cache[require.resolve('../src/db')];
  db = require('../src/db');

  assert.equal(db.getConfig('smtp_pass'), '');
  assert.ok('smtp_pass' in db.getAllConfig());
  // A senha do ambiente jamais pode reaparecer dentro do banco.
  assert.notEqual(db.getConfig('smtp_pass'), 'senha-do-env');
});
