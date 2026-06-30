require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const app = express();

// ── Segurança: cabeçalhos HTTP ───────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // desativado pois o frontend usa CDN/inline
  crossOriginEmbedderPolicy: false,
}));

// ── CORS: em produção, aceita só a origin do servidor ───────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3001'];

app.use(cors({
  origin: (origin, cb) => {
    // Permite requisições sem origin (curl, Postman, mesmo servidor)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS bloqueado: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json());

// ── Logs de acesso ───────────────────────────────────────────────
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// Log em arquivo (produção) + console (desenvolvimento)
// Streams abertos UMA vez (evita leak de file descriptors sob carga).
const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });
const errorLogStream = fs.createWriteStream(path.join(logDir, 'error.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ── Autenticação ─────────────────────────────────────────────────
const authMiddleware = require('./middleware/auth');
app.use(authMiddleware);

// ── Rotas públicas ───────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/track', require('./routes/track'));

// ── Health check ─────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
});

// ── Rotas protegidas ─────────────────────────────────────────────
app.use('/api/deals', require('./routes/deals'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/config', require('./routes/config'));
app.use('/api/reports', require('./routes/reports'));

// ── Serve o frontend buildado em produção ────────────────────────
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA: qualquer rota não-API serve o index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  logger.info('Servindo frontend de:', frontendDist);
}

// ── Tratamento de erros global ───────────────────────────────────
app.use((err, req, res, next) => {
  const msg = `[${new Date().toISOString()}] ${req.method} ${req.path} — ${err.message}\n${err.stack}\n`;
  errorLogStream.write(msg);
  if (process.env.NODE_ENV !== 'production') console.error(err);

  // Em produção não vaza detalhes internos (stack/mensagem) ao cliente.
  const status = err.status || 500;
  const clientMessage = process.env.NODE_ENV === 'production'
    ? 'Erro interno do servidor.'
    : (err.message || 'Erro interno do servidor.');
  res.status(status).json({ error: clientMessage });
});

// ── Validação de BASE_URL para links de email ───────────────────
function checkBaseUrl() {
  const raw = (process.env.BASE_URL || '').trim();
  if (!raw) {
    logger.info('BASE_URL não configurado — botões nos emails apontarão direto para o Agendor (sem tracking de cliques).');
    return;
  }
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) {
      logger.warn(`BASE_URL=${raw} aponta para localhost — botões nos emails NÃO funcionariam em outras máquinas. Usando link direto para o Agendor.`);
    } else {
      logger.info(`BASE_URL=${raw} — botões nos emails usarão tracking de cliques.`);
    }
  } catch (_) {
    logger.warn(`BASE_URL=${raw} inválido — botões nos emails usarão link direto para o Agendor.`);
  }
}

// ── Inicia servidor ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  logger.info(`Backend rodando em http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`);
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
  setTimeout(() => { logger.warn('Shutdown forçado após timeout.'); process.exit(1); }, 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
