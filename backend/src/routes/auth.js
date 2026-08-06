const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getConfig } = require('../db');
const {
  getUser,
  createUser,
  listUsers,
  deleteUser,
  updateUserPassword,
  saveResetToken,
  getResetToken,
  markTokenUsed,
  logLogin,
  getLoginLogs,
} = require('../db');
const { sendResetPasswordEmail } = require('../emailer');
const { JWT_SECRET } = require('../secret');
const logger = require('../logger');

// Sessão de 4h. Era 8h: encurtar é a metade barata da mitigação — a outra metade é tirar o
// token do alcance do script, que é o que o cookie HttpOnly faz.
const TOKEN_EXPIRY = '4h';
const TOKEN_EXPIRY_MS = 4 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

const { lerToken, COOKIE_SESSAO } = require('../middleware/auth');

// Atributos do cookie de sessão, num lugar só — login e logout precisam concordar, e um
// logout que não repita `sameSite`/`path` não apaga o cookie que o login criou.
//
//   httpOnly  o ponto da mudança: JavaScript da página não lê o token, nem o nosso nem um
//             injetado por XSS.
//   sameSite  'strict' é a defesa de CSRF deste desenho: o navegador simplesmente não
//             envia o cookie em requisição originada de outro site, então um formulário
//             hostil não consegue disparar PUT /api/config em nome de quem está logado.
//             Não custa usabilidade aqui porque o painel é aberto direto, e não por link
//             de terceiro; e o único link que mandamos por e-mail (redefinição de senha)
//             aponta para uma rota pública, que não depende do cookie.
//   secure    só em produção — em desenvolvimento o painel roda em http://localhost e um
//             cookie `secure` simplesmente não seria gravado.
function opcoesDoCookie() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

// requireAdmin saiu daqui para middleware/requireAdmin.js. O motivo está escrito no
// cabeçalho de lá: além de falhar aberto, ele protegia a superfície errada — gestão de
// usuário exigia papel enquanto mudar SMTP e disparar e-mail em massa não exigiam nada.
const { requireAdmin, isAdmin } = require('../middleware/requireAdmin');

// ── Rate limiting ────────────────────────────────────────────────
// A regra saiu daqui para src/rateLimit.js quando passou a ter DOIS consumidores. Os
// parâmetros do login são preservados exatamente — 5 tentativas, 15 minutos —, e os nomes
// abaixo continuam existindo porque test/auth.test.js os exercita diretamente.
const { criarLimitador } = require('../rateLimit');

const MAX_ATTEMPTS = 5;
const BLOCK_MINUTES = 15;
const limitadorLogin = criarLimitador({
  maxTentativas: MAX_ATTEMPTS,
  minutosBloqueio: BLOCK_MINUTES,
});
const checkRateLimit = limitadorLogin.check;
const recordFailedAttempt = limitadorLogin.record;
const clearAttempts = limitadorLogin.clear;

// Balde PRÓPRIO para "esqueci minha senha", com cota menor. O recurso protegido aqui é
// outro: cada requisição bem-sucedida faz o servidor ENVIAR um e-mail usando a credencial
// SMTP da empresa, e o endereço de destino vem do corpo da requisição. Sem cota, a rota
// pública é um canal de envio aberto — que é justamente o motivo de ela ter cota ANTES de
// virar pública, e não depois.
const MAX_RECUPERACOES = 3;
const limitadorRecuperacao = criarLimitador({
  maxTentativas: MAX_RECUPERACOES,
  minutosBloqueio: BLOCK_MINUTES,
});

// Piso de tamanho da senha. Eram 6 — o parecer de segurança pediu 12, e o número precisa
// valer nos DOIS caminhos que gravam senha nova: a redefinição por link e a troca pelo
// usuário logado. Aplicar só num deles deixaria o outro como a porta larga.
const MIN_SENHA = 12;

// ── Verificação de senha (bcrypt + texto puro legado) ────────────
// Fator comum extraído do login e do change-password: suporta hash bcrypt
// (prefixo '$2') e, por compatibilidade, senhas legadas em texto puro. O
// discriminador '$2' é preservado EXATAMENTE — qualquer mudança nesse caminho
// é decisão de segurança de fase futura, coberta por teste próprio.
async function verifyPassword(storedHash, plain) {
  return storedHash.startsWith('$2')
    ? bcrypt.compare(plain, storedHash)
    : plain === storedHash;
}

// ── Garante usuário administrador inicial ────────────────────────
// Em vez de credenciais hardcoded no código, o usuário inicial é semeado a
// partir de variáveis de ambiente (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) e
// somente quando NÃO existe nenhum usuário cadastrado. Após o primeiro boot,
// gerencie usuários pela própria aplicação.
async function ensureDefaultUsers() {
  const seedEmail = (process.env.SEED_ADMIN_EMAIL || '').trim();
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || '';

  if (seedEmail && seedPassword && listUsers().length === 0) {
    const hash = await bcrypt.hash(seedPassword, BCRYPT_ROUNDS);
    createUser(seedEmail, hash);
    logger.info(`[Auth] Usuário administrador inicial criado: ${seedEmail}`);
  }

  // Migra senhas legadas em texto puro para hash bcrypt (idempotente).
  for (const u of listUsers()) {
    const full = getUser(u.username);
    if (full && !full.password.startsWith('$2')) {
      const hash = await bcrypt.hash(full.password, BCRYPT_ROUNDS);
      updateUserPassword(u.username, hash);
      logger.info(`[Auth] Senha migrada para hash: ${u.username}`);
    }
  }
}
ensureDefaultUsers();

// ── POST /api/auth/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ ok: false, message: 'Usuário e senha são obrigatórios.' });
  }

  // Verifica bloqueio por tentativas
  const rateCheck = checkRateLimit(ip);
  if (rateCheck.blocked) {
    logLogin({
      username,
      success: false,
      ip,
      reason: `IP bloqueado por ${rateCheck.minutesLeft} min`,
    });
    return res.status(429).json({
      ok: false,
      message: `Muitas tentativas. Tente novamente em ${rateCheck.minutesLeft} minuto(s).`,
    });
  }

  const user = getUser(username);

  if (!user) {
    recordFailedAttempt(ip);
    logLogin({
      username,
      success: false,
      ip,
      reason: 'Usuário não encontrado',
    });
    return res
      .status(401)
      .json({ ok: false, message: 'Usuário ou senha incorretos.' });
  }

  // Compara senha (suporta hash bcrypt e texto puro legado)
  const match = await verifyPassword(user.password, password);

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

  // O token vai no cookie e NÃO no corpo da resposta. Devolvê-lo também no JSON manteria
  // viva a via que esta mudança fecha: o painel voltaria a poder guardá-lo no localStorage,
  // e o HttpOnly do cookie deixaria de significar coisa alguma.
  res.cookie(COOKIE_SESSAO, token, {
    ...opcoesDoCookie(),
    maxAge: TOKEN_EXPIRY_MS,
  });

  // `isAdmin` viaja FORA do token, e é recalculado a cada /verify. Assar o papel dentro do
  // JWT faria uma remoção de ADMIN_USERS só valer quando a sessão expirasse — até lá o
  // portador continuaria carregando a afirmação de que é admin. Aqui é só exibição: o
  // servidor decide o acesso por requisição, em requireAdmin.
  return res.json({ ok: true, username, isAdmin: isAdmin(username) });
});

// ── POST /api/auth/verify ────────────────────────────────────────
// É esta rota que o painel usa para descobrir, ao carregar, se há sessão — o token não
// está mais visível ao JavaScript, então perguntar ao servidor é o único caminho.
router.post('/verify', (req, res) => {
  const token = lerToken(req);
  if (!token) return res.status(401).json({ ok: false });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({
      ok: true,
      username: decoded.username,
      isAdmin: isAdmin(decoded.username),
    });
  } catch {
    res.status(401).json({ ok: false, message: 'Sessão expirada.' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────
// Precisa existir no servidor: o cookie é HttpOnly, então o painel não tem como apagá-lo
// sozinho — era isso que o `localStorage.removeItem` fazia antes.
//
// É rota PÚBLICA de propósito. Sair não é uma operação privilegiada, e exigir sessão válida
// para encerrá-la deixaria quem está com o token expirado sem como limpar o próprio estado.
// A resposta é sempre 200, com ou sem cookie: não há nada a revelar aqui.
router.post('/logout', (req, res) => {
  // Os atributos precisam ser os MESMOS do login. Um clearCookie sem `path`/`sameSite`
  // iguais mira um cookie diferente do que existe, responde 200 e não apaga nada.
  res.clearCookie(COOKIE_SESSAO, opcoesDoCookie());
  res.json({ ok: true });
});

// ── POST /api/auth/change-password (usuário logado) ─────────────
router.post('/change-password', async (req, res) => {
  const token = lerToken(req);
  if (!token)
    return res.status(401).json({ ok: false, message: 'Não autenticado.' });

  let username;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    username = decoded.username;
  } catch {
    return res.status(401).json({ ok: false, message: 'Sessão expirada.' });
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ ok: false, message: 'Preencha todos os campos.' });
  }
  if (newPassword.length < MIN_SENHA) {
    return res.status(400).json({
      ok: false,
      message: `A nova senha deve ter pelo menos ${MIN_SENHA} caracteres.`,
    });
  }

  const user = getUser(username);
  if (!user)
    return res
      .status(404)
      .json({ ok: false, message: 'Usuário não encontrado.' });

  const match = await verifyPassword(user.password, currentPassword);

  if (!match)
    return res
      .status(401)
      .json({ ok: false, message: 'Senha atual incorreta.' });

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  updateUserPassword(username, hash);
  logger.info(`[Auth] Senha alterada pelo usuário: ${username}`);
  res.json({ ok: true, message: 'Senha alterada com sucesso!' });
});

// ── POST /api/auth/forgot-password ───────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { username } = req.body;
  if (!username)
    return res.status(400).json({ ok: false, message: 'Informe o e-mail.' });

  // Cota por IP. Note que ela é consumida a CADA requisição, e não só nas que falham como
  // no login: aqui o recurso escasso é o envio de e-mail, e uma requisição bem-sucedida é
  // exatamente a que consome. Recusar com 429 não revela nada sobre a existência da conta —
  // o bloqueio é do IP, e chega igual para e-mail cadastrado e não cadastrado.
  const ip = req.ip || req.connection.remoteAddress;
  const cota = limitadorRecuperacao.check(ip);
  if (cota.blocked) {
    return res.status(429).json({
      ok: false,
      message: `Muitas solicitações. Tente novamente em ${cota.minutesLeft} minuto(s).`,
    });
  }
  limitadorRecuperacao.record(ip);

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
      logger.info(`[Auth] E-mail de redefinição enviado para: ${username}`);
    } catch (err) {
      logger.error('[Auth] Erro ao enviar e-mail de redefinição:', err.message);
    }
  }

  res.json({
    ok: true,
    message:
      'Se este e-mail estiver cadastrado, você receberá as instruções em instantes.',
  });
});

// ── POST /api/auth/reset-password ────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res
      .status(400)
      .json({ ok: false, message: 'Token e nova senha são obrigatórios.' });
  }
  if (newPassword.length < MIN_SENHA) {
    return res.status(400).json({
      ok: false,
      message: `A senha deve ter pelo menos ${MIN_SENHA} caracteres.`,
    });
  }

  const record = getResetToken(token);
  if (!record) {
    return res
      .status(400)
      .json({ ok: false, message: 'Link inválido ou já utilizado.' });
  }
  if (new Date(record.expires_at) < new Date()) {
    return res
      .status(400)
      .json({ ok: false, message: 'Este link expirou. Solicite um novo.' });
  }

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  updateUserPassword(record.username, hash);
  markTokenUsed(token);

  logger.info(`[Auth] Senha redefinida para: ${record.username}`);
  res.json({
    ok: true,
    message: 'Senha redefinida com sucesso! Você já pode fazer login.',
  });
});

// ── GET /api/auth/users ──────────────────────────────────────────
router.get('/users', requireAdmin, (req, res) => {
  res.json(listUsers());
});

// ── POST /api/auth/users ─────────────────────────────────────────
router.post('/users', requireAdmin, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ ok: false, message: 'Usuário e senha são obrigatórios.' });
  }
  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    createUser(username, hash);
    res.json({
      ok: true,
      message: `Usuário "${username}" criado com sucesso.`,
    });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

// ── DELETE /api/auth/users/:username ────────────────────────────
router.delete('/users/:username', requireAdmin, (req, res) => {
  if (req.params.username === req.user?.username) {
    return res
      .status(400)
      .json({ ok: false, message: 'Você não pode excluir o próprio usuário.' });
  }
  deleteUser(req.params.username);
  res.json({ ok: true });
});

// ── GET /api/auth/logs ───────────────────────────────────────────
router.get('/logs', requireAdmin, (req, res) => {
  res.json(getLoginLogs(100));
});

module.exports = router;

// ── Seams de teste (não afetam o roteamento do Express) ──────────
// app.use() só precisa que module.exports seja a função router; estas props
// extras são ignoradas pelo Express e existem para caracterizar o rate-limit e
// a verificação de senha, além de permitir reset do Map em memória entre casos.
module.exports.checkRateLimit = checkRateLimit;
module.exports.recordFailedAttempt = recordFailedAttempt;
module.exports.clearAttempts = clearAttempts;
module.exports.verifyPassword = verifyPassword;
module.exports._loginAttempts = limitadorLogin.mapa;
module.exports._recuperacaoAttempts = limitadorRecuperacao.mapa;
module.exports.MIN_SENHA = MIN_SENHA;
module.exports.MAX_RECUPERACOES = MAX_RECUPERACOES;
