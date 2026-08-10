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

// A contagem PARCIAL precisa decair, e antes não decaía: `record` só zerava ao atingir o
// limite, e `check` só apagava a entrada depois de um bloqueio já cumprido. O efeito era uma
// cota cumulativa pela vida do processo — três pedidos de "esqueci minha senha" espalhados
// por SEMANAS, feitos por três pessoas diferentes, esgotavam o balde, e a quarta pessoa a de
// fato esquecer a senha levava 429 sem ninguém ter abusado de nada.
//
// O detalhe que torna isso grave neste sistema: com `trust proxy` o `req.ip` é o endereço
// público real, e um escritório inteiro atrás de um NAT compartilha UM endereço. A janela
// abaixo é o que transforma "N tentativas para sempre" em "N tentativas por janela", que é o
// que a expressão "5 tentativas em 15 minutos" sempre quis dizer.
const MINUTOS_DE_JANELA_PADRAO = 15;

function criarLimitador({ maxTentativas, minutosBloqueio, minutosJanela }) {
  const janelaMs = (minutosJanela ?? MINUTOS_DE_JANELA_PADRAO) * 60 * 1000;
  const tentativas = new Map(); // ip → { count, primeiraEm, blockedUntil }

  // Remove a entrada cujo bloqueio expirou OU cuja janela de contagem já passou. Chamada
  // pelos dois caminhos para que a expiração valha tanto na leitura quanto na escrita: se
  // só `check` limpasse, um `record` que chegasse primeiro somaria sobre uma contagem morta.
  function expirar(ip, now) {
    const entry = tentativas.get(ip);
    if (!entry) return null;
    if (entry.blockedUntil) {
      if (now < entry.blockedUntil) return entry;
      tentativas.delete(ip);
      return null;
    }
    if (now - entry.primeiraEm >= janelaMs) {
      tentativas.delete(ip);
      return null;
    }
    return entry;
  }

  function check(ip) {
    const now = Date.now();
    const entry = expirar(ip, now);
    if (!entry) return { blocked: false };
    if (entry.blockedUntil && now < entry.blockedUntil) {
      const minutesLeft = Math.ceil((entry.blockedUntil - now) / 60000);
      return { blocked: true, minutesLeft };
    }
    return { blocked: false };
  }

  function record(ip) {
    const now = Date.now();
    const entry = expirar(ip, now) || { count: 0, primeiraEm: now };
    entry.count += 1;
    if (entry.count >= maxTentativas) {
      entry.blockedUntil = now + minutosBloqueio * 60 * 1000;
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
