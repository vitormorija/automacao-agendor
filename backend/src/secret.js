// Segredo de assinatura dos tokens JWT.
//
// Resolvido uma única vez no carregamento do módulo. NÃO há fallback: se a
// variável de ambiente estiver ausente ou for muito curta, o processo falha no
// boot. Isso evita o risco de rodar em produção com um segredo previsível
// (que permitiria forjar tokens de autenticação).
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error(
    'JWT_SECRET ausente ou muito curto. Defina a variável de ambiente JWT_SECRET ' +
    'com pelo menos 16 caracteres (ex.: gere com `openssl rand -hex 32`).'
  );
}

module.exports = { JWT_SECRET };
