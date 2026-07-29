const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../secret');

// Rotas públicas que não precisam de autenticação
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/verify',
  '/api/track/click', // link dos e-mails — deve funcionar sem login
  '/api/health',
];

function authMiddleware(req, res, next) {
  // Libera rotas públicas
  if (PUBLIC_PATHS.some((p) => req.path.startsWith(p))) {
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
