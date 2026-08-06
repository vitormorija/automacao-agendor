// Montagem do aplicativo Express — SEM `listen`.
//
// Este arquivo existe separado de index.js por uma razão de teste: enquanto o
// `app.listen()` morava no mesmo módulo que a montagem, nenhum teste conseguia
// exercitar a cadeia real de middlewares sem subir porta e ligar o agendador. O
// resultado media-se em cobertura: `middleware/auth.js` ficou em 0%, e o defeito
// que isso escondeu não era de handler — era de ORDEM. `/api/auth/forgot-password`
// respondia 401 porque o gate de autenticação roda antes do roteador, e um teste
// que invoca o handler direto (o padrão de "seam" usado no resto da suíte) jamais
// veria isso: o handler está correto, quem erra é a ordem.
//
// Regra derivada: tudo que decide QUEM PASSA mora aqui e é exercitado por HTTP de
// verdade (test/routes.authMatrix.test.js). index.js fica só com o ciclo de vida do
// processo — escutar porta, agendar cron, desligar com segurança.

// Caminho explícito: o .env mora ao lado do package.json do backend. Sem isto o
// carregamento depende do cwd — e sob PM2 (ecosystem.config.js: cwd '/opt/agendor')
// o dotenv procuraria /opt/agendor/.env, que não existe, e falharia em SILÊNCIO (D-13).
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
// Fail-fast de configuração (CFG-04, D-04/D-05): valida as obrigatórias no require.
// Vem AQUI, e não depois, por duas razões:
// (1) antes de './routes/auth', que puxa db.js — o db.js abre o SQLite e semeia a tabela
//     `config` no load; um boot mal configurado não pode deixar efeito colateral antes de
//     morrer (é a definição de fail-fast);
// (2) antes de './middleware/auth', que puxa secret.js — validando primeiro, o operador
//     recebe a lista COMPLETA do que falta num único boot, em vez de descobrir uma
//     variável por vez. O secret.js continua valendo: só ele exige os 16 caracteres
//     mínimos do JWT_SECRET.
// Em produção a ausência derruba o processo; fora dela, vira aviso no log (D-05).
require('./config');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const app = express();

// ── Segurança: cabeçalhos HTTP ───────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // desativado pois o frontend usa CDN/inline
    crossOriginEmbedderPolicy: false,
  }),
);

// ── CORS: em produção, aceita só a origin do servidor ───────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:3001'];

app.use(
  cors({
    origin: (origin, cb) => {
      // Permite requisições sem origin (curl, Postman, mesmo servidor)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS bloqueado: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(express.json());

// ── Logs de acesso ───────────────────────────────────────────────
// LOG_DIR é um seam de teste, no mesmo padrão de DB_PATH: sem ele, exercitar o app
// por HTTP faria a suíte escrever no logs/ real do repositório a cada requisição de
// teste. O default preserva exatamente o caminho anterior.
const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// Log em arquivo (produção) + console (desenvolvimento)
// Streams abertos UMA vez (evita leak de file descriptors sob carga).
const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), {
  flags: 'a',
});
const errorLogStream = fs.createWriteStream(path.join(logDir, 'error.log'), {
  flags: 'a',
});
app.use(morgan('combined', { stream: accessLogStream }));
// O log colorido no console é conveniência de quem está desenvolvendo. Sob teste ele vira
// ruído puro — uma linha por requisição da matriz de rotas — e é por isso que 'test' entra
// na exclusão junto de 'production'. O arquivo (acima) continua sendo escrito nos três
// ambientes; o que muda aqui é só o espelho no console.
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
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
  res.json({
    ok: true,
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
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
  const clientMessage =
    process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor.'
      : err.message || 'Erro interno do servidor.';
  res.status(status).json({ error: clientMessage });
});

module.exports = app;
