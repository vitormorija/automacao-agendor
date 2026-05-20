const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getConfig } = require('../db');
const {
  getUser, createUser, listUsers, deleteUser, updateUserPassword,
  saveResetToken, getResetToken, markTokenUsed,
  logLogin, getLoginLogs,
} = require('../db');
const { sendResetPasswordEmail } = require('../emailer');

const JWT_SECRET = process.env.JWT_SECRET || 'agendor-secret-key';
const TOKEN_EXPIRY = '8h';
const BCRYPT_ROUNDS = 10;

// ── Rate limiting (bloqueio por IP após 5 tentativas) ────────────
const loginAttempts = new Map(); // ip → { count, blockedUntil }
const MAX_ATTEMPTS = 5;
const BLOCK_MINUTES = 15;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return { blocked: false };
  if (entry.blockedUntil && now < entry.blockedUntil) {
    const minutesLeft = Math.ceil((entry.blockedUntil - now) / 60000);
    return { blocked: true, minutesLeft };
  }
  if (entry.blockedUntil && now >= entry.blockedUntil) {
    loginAttempts.delete(ip);
  }
  return { blocked: false };
}

function recordFailedAttempt(ip) {
  const entry = loginAttempts.get(ip) || { count: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + BLOCK_MINUTES * 60 * 1000;
    entry.count = 0;
    loginAttempts.set(ip, entry);
    return { nowBlocked: true };
  }
  loginAttempts.set(ip, entry);
  return { nowBlocked: false, remaining: MAX_ATTEMPTS - entry.count };
}

function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

// ── Garante usuários iniciais ────────────────────────────────────
async function ensureDefaultUsers() {
  const users = [
    { username: 'patricia.maricato@cadmus.com.br', password: 'cadmus2026' },
    { username: 'renato.enachev@cadmus.com.br',    password: 'cadmus2026' },
  ];

  for (const u of users) {
    const existing = getUser(u.username);
    if (!existing) {
      const hash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
      createUser(u.username, hash);
      console.log(`[Auth] Usuário criado: ${u.username}`);
    } else if (!existing.password.startsWith('$2')) {
      // Migra senha em texto puro para hash
      const hash = await bcrypt.hash(existing.password, BCRYPT_ROUNDS);
      updateUserPassword(u.username, hash);
      console.log(`[Auth] Senha migrada para hash: ${u.username}`);
    }
  }

  // Migra todos os outros usuários sem hash
  const all = listUsers();
  for (const u of all) {
    const full = getUser(u.username);
    if (full && !full.password.startsWith('$2')) {
      const hash = await bcrypt.hash(full.password, BCRYPT_ROUNDS);
      updateUserPassword(u.username, hash);
      console.log(`[Auth] Senha migrada para hash: ${u.username}`);
    }
  }
}
ensureDefaultUsers();

// ── POST /api/auth/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ ok: false, message: 'Usuário e senha são obrigatórios.' });
  }

  // Verifica bloqueio por tentativas
  const rateCheck = checkRateLimit(ip);
  if (rateCheck.blocked) {
    logLogin({ username, success: false, ip, reason: `IP bloqueado por ${rateCheck.minutesLeft} min` });
    return res.status(429).json({
      ok: false,
      message: `Muitas tentativas. Tente novamente em ${rateCheck.minutesLeft} minuto(s).`,
    });
  }

  const user = getUser(username);

  if (!user) {
    recordFailedAttempt(ip);
    logLogin({ username, success: false, ip, reason: 'Usuário não encontrado' });
    return res.status(401).json({ ok: false, message: 'Usuário ou senha incorretos.' });
  }

  // Compara senha (suporta hash bcrypt e texto puro legado)
  const match = user.password.startsWith('$2')
    ? await bcrypt.compare(password, user.password)
    : password === user.password;

  if (!match) {
    const result = recordFailedAttempt(ip);
    logLogin({ username, success: false, ip, reason: 'Senha incorreta' });
    if (result.nowBlocked) {
      return res.status(429).json({
        ok: false,
        message: `Muitas tentativas. Tente novamente em ${BLOCK_MINUTES} minuto(s).`,
      });
    }
    return res.status(401).json({
      ok: false,
      message: `Senha incorreta. Você tem mais ${result.remaining} tentativa(s) antes do bloqueio.`,
    });
  }

  // Login bem-sucedido
  clearAttempts(ip);
  logLogin({ username, success: true, ip });

  // Migra senha legada para hash se necessário
  if (!user.password.startsWith('$2')) {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    updateUserPassword(username, hash);
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  return res.json({ ok: true, token, username });
});

// ── POST /api/auth/verify ────────────────────────────────────────
router.post('/verify', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ ok: false });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    res.json({ ok: true, username: decoded.username });
  } catch {
    res.status(401).json({ ok: false, message: 'Sessão expirada.' });
  }
});

// ── POST /api/auth/change-password (usuário logado) ─────────────
router.post('/change-password', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ ok: false, message: 'Não autenticado.' });

  let username;
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    username = decoded.username;
  } catch {
    return res.status(401).json({ ok: false, message: 'Sessão expirada.' });
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ ok: false, message: 'Preencha todos os campos.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ ok: false, message: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }

  const user = getUser(username);
  if (!user) return res.status(404).json({ ok: false, message: 'Usuário não encontrado.' });

  const match = user.password.startsWith('$2')
    ? await bcrypt.compare(currentPassword, user.password)
    : currentPassword === user.password;

  if (!match) return res.status(401).json({ ok: false, message: 'Senha atual incorreta.' });

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  updateUserPassword(username, hash);
  console.log(`[Auth] Senha alterada pelo usuário: ${username}`);
  res.json({ ok: true, message: 'Senha alterada com sucesso!' });
});

// ── POST /api/auth/forgot-password ───────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ ok: false, message: 'Informe o e-mail.' });

  // Sempre retorna sucesso (não revela se o usuário existe)
  const user = getUser(username);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h
    saveResetToken(username, token, expiresAt);

    const BASE_URL = process.env.BASE_URL_FRONTEND || 'http://localhost:5173';
    const resetUrl = `${BASE_URL}?reset_token=${token}`;

    try {
      await sendResetPasswordEmail({ to: username, resetUrl });
      console.log(`[Auth] E-mail de redefinição enviado para: ${username}`);
    } catch (err) {
      console.error('[Auth] Erro ao enviar e-mail de redefinição:', err.message);
    }
  }

  res.json({ ok: true, message: 'Se este e-mail estiver cadastrado, você receberá as instruções em instantes.' });
});

// ── POST /api/auth/reset-password ────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ ok: false, message: 'Token e nova senha são obrigatórios.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ ok: false, message: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  const record = getResetToken(token);
  if (!record) {
    return res.status(400).json({ ok: false, message: 'Link inválido ou já utilizado.' });
  }
  if (new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ ok: false, message: 'Este link expirou. Solicite um novo.' });
  }

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  updateUserPassword(record.username, hash);
  markTokenUsed(token);

  console.log(`[Auth] Senha redefinida para: ${record.username}`);
  res.json({ ok: true, message: 'Senha redefinida com sucesso! Você já pode fazer login.' });
});

// ── GET /api/auth/users ──────────────────────────────────────────
router.get('/users', (req, res) => {
  res.json(listUsers());
});

// ── POST /api/auth/users ─────────────────────────────────────────
router.post('/users', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, message: 'Usuário e senha são obrigatórios.' });
  }
  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    createUser(username, hash);
    res.json({ ok: true, message: `Usuário "${username}" criado com sucesso.` });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

// ── DELETE /api/auth/users/:username ────────────────────────────
router.delete('/users/:username', (req, res) => {
  deleteUser(req.params.username);
  res.json({ ok: true });
});

// ── GET /api/auth/logs ───────────────────────────────────────────
router.get('/logs', (req, res) => {
  res.json(getLoginLogs(100));
});

module.exports = router;
