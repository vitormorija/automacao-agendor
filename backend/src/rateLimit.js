// Limitador de tentativas por IP, em memória.
//
// A regra já existia dentro de routes/auth.js, cravada num único Map de módulo e servindo
// só ao login. Virou fábrica porque a recuperação de senha precisa do MESMO comportamento
// com uma contagem SEPARADA: compartilhar o balde faria uma rajada de "esqueci minha senha"
// bloquear o login do mesmo IP, e faria cinco senhas erradas consumirem a cota de envio de
// e-mail. São dois recursos distintos sendo protegidos, então são dois baldes.
//
// LIMITAÇÃO CONHECIDA, HERDADA E NÃO RESOLVIDA AQUI: o estado é do processo. Um restart do
// PM2 zera as contagens, e o Map cresce com IPs distintos até cada entrada expirar. É
// aceitável no alvo declarado (instância única, ferramenta interna) e está registrado em
// .planning/codebase/CONCERNS.md; mover para SQLite ou Redis é decisão de outra etapa.

function criarLimitador({ maxTentativas, minutosBloqueio }) {
  const tentativas = new Map(); // ip → { count, blockedUntil }

  function check(ip) {
    const now = Date.now();
    const entry = tentativas.get(ip);
    if (!entry) return { blocked: false };
    if (entry.blockedUntil && now < entry.blockedUntil) {
      const minutesLeft = Math.ceil((entry.blockedUntil - now) / 60000);
      return { blocked: true, minutesLeft };
    }
    if (entry.blockedUntil && now >= entry.blockedUntil) {
      tentativas.delete(ip);
    }
    return { blocked: false };
  }

  function record(ip) {
    const entry = tentativas.get(ip) || { count: 0 };
    entry.count += 1;
    if (entry.count >= maxTentativas) {
      entry.blockedUntil = Date.now() + minutosBloqueio * 60 * 1000;
      entry.count = 0;
      tentativas.set(ip, entry);
      return { nowBlocked: true };
    }
    tentativas.set(ip, entry);
    return { nowBlocked: false, remaining: maxTentativas - entry.count };
  }

  function clear(ip) {
    tentativas.delete(ip);
  }

  // `mapa` é exposto para que a suíte zere o estado entre casos. É o mesmo seam que
  // routes/auth.js já publicava como `_loginAttempts`.
  return {
    check,
    record,
    clear,
    mapa: tentativas,
    maxTentativas,
    minutosBloqueio,
  };
}

module.exports = { criarLimitador };
