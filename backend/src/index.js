// Ciclo de vida do processo: escutar porta, agendar o cron, desligar com segurança.
//
// A MONTAGEM do app (middlewares, rotas, tratamento de erro) mora em ./app.js e é
// exercitada por HTTP nos testes. A separação existe porque enquanto o listen morava
// junto da montagem nenhum teste conseguia exercitar a cadeia de middlewares — ver o
// comentário de cabeçalho de app.js para o defeito concreto que isso escondeu.
//
// O require de ./app precisa vir PRIMEIRO: é ele que carrega o dotenv e o fail-fast
// de configuração, na ordem que o comentário de app.js documenta.
const app = require('./app');
const logger = require('./logger');

// ── Validação de BASE_URL para links de email ───────────────────
function checkBaseUrl() {
  const raw = (process.env.BASE_URL || '').trim();
  if (!raw) {
    logger.info(
      'BASE_URL não configurado — botões nos emails apontarão direto para o Agendor (sem tracking de cliques).',
    );
    return;
  }
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local')
    ) {
      logger.warn(
        `BASE_URL=${raw} aponta para localhost — botões nos emails NÃO funcionariam em outras máquinas. Usando link direto para o Agendor.`,
      );
    } else {
      logger.info(
        `BASE_URL=${raw} — botões nos emails usarão tracking de cliques.`,
      );
    }
  } catch (_) {
    logger.warn(
      `BASE_URL=${raw} inválido — botões nos emails usarão link direto para o Agendor.`,
    );
  }
}

// ── Inicia servidor ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  logger.info(
    `Backend rodando em http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`,
  );
  checkBaseUrl();
  const { scheduleTask } = require('./scheduler');
  scheduleTask();
});

// ── Graceful shutdown ────────────────────────────────────────────
// Fecha servidor HTTP, cron jobs e conexão SQLite ao receber sinal de
// término (PM2 restart, deploy, Ctrl+C), evitando conexões/escritas a meio.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Recebido ${signal} — encerrando com segurança...`);

  const { stopTasks } = require('./scheduler');
  const { closeDb } = require('./db');
  stopTasks();

  server.close(() => {
    closeDb();
    logger.info('Encerrado.');
    process.exit(0);
  });

  // Failsafe: força saída se algo travar o close.
  setTimeout(() => {
    logger.warn('Shutdown forçado após timeout.');
    process.exit(1);
  }, 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
