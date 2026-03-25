require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Rotas
app.use('/api/deals', require('./routes/deals'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/config', require('./routes/config'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`);

  // Inicia o agendador
  const { scheduleTask } = require('./scheduler');
  scheduleTask();
});
