const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../secret');

// Rotas que respondem sem credencial.
//
// AS DUAS DE SENHA ESTAVAM FALTANDO, e o efeito era o fluxo de recuperação inteiro morto:
// este middleware roda ANTES do roteador (app.js: `app.use(authMiddleware)` precede
// `app.use('/api/auth', ...)`), então /forgot-password e /reset-password respondiam 401
// exigindo justamente o token que quem esqueceu a senha não tem. O handler das duas sempre
// esteve correto — quem errava era a ordem, e é por isso que nenhum teste de handler pegou:
// eles nunca executam o middleware. Pinado por test/routes.authMatrix.test.js, que exercita
// a cadeia por HTTP de verdade.
//
// /change-password NÃO entra aqui, e a diferença é intencional: ela exige a senha ATUAL, o
// que só faz sentido para quem já está autenticado.
const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/verify',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/track/click', // link dos e-mails — deve funcionar sem login
  '/api/health',
]);

// COMPARAÇÃO EXATA, e não `startsWith` como antes. Com prefixo, qualquer rota futura cujo
// caminho comece com o de uma pública herdaria a liberação sem ninguém perceber —
// '/api/auth/login-como-outro' passaria por ser prefixada por '/api/auth/login'. O conjunto
// de rotas públicas é pequeno e fechado; não há razão para casá-lo por prefixo.
// A barra final é normalizada porque Express entrega '/api/health/' como caminho distinto.
function isPublic(reqPath) {
  const normalizado =
    reqPath.length > 1 && reqPath.endsWith('/')
      ? reqPath.slice(0, -1)
      : reqPath;
  return PUBLIC_PATHS.has(normalizado);
}

function authMiddleware(req, res, next) {
  // Libera rotas públicas
  if (isPublic(req.path)) {
    return next();
  }

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res
      .status(401)
      .json({ error: 'Sessão expirada. Faça login novamente.' });
  }
}

module.exports = authMiddleware;

// ── Seams de teste (não afetam o uso como middleware) ────────────
// app.use() só precisa da função; estas props extras existem para que a matriz de rotas
// possa afirmar sobre o CONJUNTO de rotas públicas sem redigitá-lo — se alguém acrescentar
// uma pública e esquecer de cobri-la, a asserção de tamanho reprova.
module.exports.PUBLIC_PATHS = PUBLIC_PATHS;
module.exports.isPublic = isPublic;
