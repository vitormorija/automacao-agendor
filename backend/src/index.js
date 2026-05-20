require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Autenticação — aplicar ANTES de todas as rotas protegidas
const authMiddleware = require('./middleware/auth');
app.use(authMiddleware);

// Rotas públicas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/track', require('./routes/track'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Salvar screenshot (uso interno para geração de slides)
const fs = require('fs');
const path = require('path');
app.post('/api/save-screenshot', express.json({ limit: '20mb' }), (req, res) => {
  const { name, data } = req.body;
  const dir = path.join(__dirname, '../../slides_screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(data, 'base64'));
  res.json({ ok: true, path: path.join(dir, `${name}.png`) });
});

// Rotas protegidas
app.use('/api/deals', require('./routes/deals'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/config', require('./routes/config'));
app.use('/api/reports', require('./routes/reports'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`);

  // Inicia o agendador
  const { scheduleTask } = require('./scheduler');
  scheduleTask();
});
