// Helper de teste (NÃO define testes) — fornece um banco SQLite em ARQUIVO temporário
// para os casos em que `:memory:` não serve. Motivo (RESEARCH Pitfall 4): db.js abre
// UMA conexão no load; para semear um `sent_at` controlado (ex.: "ontem") o teste
// precisa abrir uma SEGUNDA conexão better-sqlite3 apontando para o MESMO arquivo.
// Com `:memory:` cada conexão teria um banco isolado e vazio, inviabilizando o seed.
//
// Uso típico:
//   const { makeTmpDbPath, openRaw } = require('./helpers/tmpDb');
//   const { path: dbPath, cleanup } = makeTmpDbPath();
//   process.env.DB_PATH = dbPath;            // ANTES de require('../src/db')
//   const conn = openRaw(dbPath);            // segunda conexão para seed direto
//   ... conn.close(); cleanup();
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

// Gera um caminho de arquivo temporário único e devolve também um cleanup que
// remove o arquivo e seus irmãos de journaling (-journal / -wal / -shm),
// ignorando erros (o arquivo pode nem ter sido criado ainda).
function makeTmpDbPath() {
  const suffix = crypto.randomBytes(8).toString('hex');
  const dbPath = path.join(
    os.tmpdir(),
    `agendor-test-${process.pid}-${suffix}.db`,
  );

  function cleanup() {
    for (const ext of ['', '-journal', '-wal', '-shm']) {
      try {
        fs.unlinkSync(dbPath + ext);
      } catch (_) {
        /* arquivo inexistente ou já removido — ignorado de propósito */
      }
    }
  }

  return { path: dbPath, cleanup };
}

// Abre uma conexão better-sqlite3 crua para o caminho dado, usada para semear
// linhas com valores controlados (ex.: sent_at = ontem) direto no mesmo arquivo
// que o singleton de db.js está usando.
function openRaw(dbPath) {
  return new Database(dbPath);
}

module.exports = { makeTmpDbPath, openRaw };
