// Logger estruturado mínimo (sem dependências).
//
// Em produção emite uma linha JSON por evento (fácil de coletar/parsear).
// Em desenvolvimento emite texto legível com timestamp e nível.
// Substitui o uso ad-hoc de console.* espalhado pelo código.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;
const isProd = process.env.NODE_ENV === 'production';

function emit(level, args) {
  if (LEVELS[level] > currentLevel) return;
  const time = new Date().toISOString();
  const message = args
    .map((a) =>
      a instanceof Error
        ? a.stack || a.message
        : typeof a === 'object'
          ? JSON.stringify(a)
          : String(a),
    )
    .join(' ');

  const line = isProd
    ? JSON.stringify({ time, level, message })
    : `${time} [${level.toUpperCase()}] ${message}`;

  (level === 'error'
    ? console.error
    : level === 'warn'
      ? console.warn
      : console.log)(line);
}

module.exports = {
  error: (...a) => emit('error', a),
  warn: (...a) => emit('warn', a),
  info: (...a) => emit('info', a),
  debug: (...a) => emit('debug', a),
};
