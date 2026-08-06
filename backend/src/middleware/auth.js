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
  '/api/auth/logout', // sair não é privilegiado, e sessão expirada precisa poder se limpar
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

// Nome do cookie de sessão. O token deixou de viajar no cabeçalho Authorization e de morar
// no localStorage: lá ele era legível por qualquer JavaScript da página, então uma única
// falha de XSS entregaria uma sessão inteira de 4h para ser usada em outro lugar. Como
// cookie HttpOnly ele continua sendo enviado pelo navegador a cada requisição, mas nenhum
// script consegue lê-lo — nem o nosso, nem um injetado.
const COOKIE_SESSAO = 'auth_token';

// Leitura do cookie sem dependência nova. `cookie-parser` resolveria isto, mas o valor é um
// JWT — alfabeto base64url e pontos, nada que exija decodificação de percent-encoding — e
// acrescentar um pacote à árvore de um projeto que está justamente sob auditoria de
// dependência precisaria se pagar melhor do que estas seis linhas.
function lerCookie(req, nome) {
  const bruto = req.headers.cookie;
  if (!bruto) return null;
  for (const parte of bruto.split(';')) {
    const sep = parte.indexOf('=');
    if (sep === -1) continue;
    if (parte.slice(0, sep).trim() === nome) return parte.slice(sep + 1).trim();
  }
  return null;
}

// Fonte ÚNICA do token para todo o backend. Existia em três lugares — este middleware,
// /verify e /change-password —, cada um relendo o cabeçalho por conta própria; com a
// migração para cookie, três lugares seriam três chances de um deles continuar aceitando o
// esquema antigo e manter viva a via que a mudança fecha.
function lerToken(req) {
  return lerCookie(req, COOKIE_SESSAO);
}

function authMiddleware(req, res, next) {
  // Libera rotas públicas
  if (isPublic(req.path)) {
    return next();
  }

  const token = lerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
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
module.exports.lerToken = lerToken;
module.exports.COOKIE_SESSAO = COOKIE_SESSAO;
