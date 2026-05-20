require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

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
const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });
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

// ── Screenshot interno ───────────────────────────────────────────
app.post('/api/save-screenshot', express.json({ limit: '20mb' }), (req, res) => {
  const { name, data } = req.body;
  const dir = path.join(__dirname, '../../slides_screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(data, 'base64'));
  res.json({ ok: true, path: path.join(dir, `${name}.png`) });
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
  console.log('📁 Servindo frontend de:', frontendDist);
}

// ── Tratamento de erros global ───────────────────────────────────
app.use((err, req, res, next) => {
  const errorLogStream = fs.createWriteStream(path.join(logDir, 'error.log'), { flags: 'a' });
  const msg = `[${new Date().toISOString()}] ${err.message}\n${err.stack}\n`;
  errorLogStream.write(msg);
  if (process.env.NODE_ENV !== 'production') console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor' });
});

// ── Inicia servidor ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Backend rodando em http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`);
  const { scheduleTask } = require('./scheduler');
  scheduleTask();
});
