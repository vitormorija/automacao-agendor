// Cobertura da validação centralizada das variáveis de ambiente (CFG-03/CFG-04).
//
// Protege as decisões travadas na Phase 3: D-04 (QUAIS variáveis são obrigatórias
// e em que ordem), D-05 (rigor escalonado — em produção a ausência derruba o boot,
// em qualquer outro ambiente vira apenas aviso) e D-06 (mensagem única, em PT,
// dizendo o que falta e COMO obter cada valor).
//
// A regra mora numa FUNÇÃO PURA exatamente para poder ser exercitada aqui sem
// subprocesso e sem mexer no process.env real: os dois ramos de D-05 são testados
// chamando validateEnv() com um objeto literal. Copiar o `throw`-no-topo-do-módulo
// de secret.js deixaria o ramo de erro sem cobertura (medido: 50 % de branches lá).

// setup PRIMEIRO: preseta JWT_SECRET/DB_PATH/AGENDOR_TOKEN e neutraliza SMTP_PASS.
require('./setup');

// O setup força SMTP_PASS='' SEM guarda, então estes valores inertes precisam vir
// DEPOIS dele e ANTES do require('../src/config'). O módulo valida process.env no
// load (efeito de boot, no molde de secret.js); sem isto a suíte imprimiria um
// warn de "configuração incompleta" sem nenhuma relação com o que se testa aqui.
process.env.SMTP_PASS = 'test-smtp-pass';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.ADMIN_USERS = 'test@example.com';

const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const logger = require('../src/logger');
const {
  validateEnv,
  findMissing,
  buildMessage,
  REQUIRED,
} = require('../src/config');

// Ambiente completo. Os valores são propositalmente reconhecíveis: nenhum deles
// pode aparecer na mensagem de erro (ASVS V7 — a mensagem cita NOMES, nunca valores).
const TODAS = {
  AGENDOR_TOKEN: 'valor-do-token-agendor',
  JWT_SECRET: 'valor-do-jwt-secret',
  SMTP_PASS: 'valor-da-senha-smtp',
  ALLOWED_ORIGINS: 'valor-das-origens',
  ADMIN_USERS: 'valor-dos-admins',
};

const NOMES = [
  'AGENDOR_TOKEN',
  'JWT_SECRET',
  'SMTP_PASS',
  'ALLOWED_ORIGINS',
  'ADMIN_USERS',
];

// ── Contrato de REQUIRED (D-04) ──────────────────────────────────

test('REQUIRED: exatamente as 5 obrigatórias de D-04, nesta ordem, cada uma com dica', () => {
  assert.deepEqual(
    REQUIRED.map((r) => r.name),
    NOMES,
  );
  // A dica é o que torna a mensagem acionável (D-06): toda entrada precisa ter uma.
  for (const { name, hint } of REQUIRED) {
    assert.ok(
      typeof hint === 'string' && hint.trim().length > 0,
      `${name} sem dica de como obter o valor`,
    );
  }
});

// ── findMissing: função pura ─────────────────────────────────────

test('findMissing: ambiente completo não tem nenhuma faltante', () => {
  assert.deepEqual(findMissing(TODAS), []);
});

test('findMissing: ambiente vazio devolve as 5, na ordem de REQUIRED', () => {
  assert.deepEqual(
    findMissing({}).map((r) => r.name),
    NOMES,
  );
});

test('findMissing: presente-mas-só-espaços conta como AUSENTE', () => {
  const missing = findMissing({ ...TODAS, SMTP_PASS: '   ' });
  assert.deepEqual(
    missing.map((r) => r.name),
    ['SMTP_PASS'],
  );
});

test('findMissing: undefined e null contam como ausentes (guarda do ?? )', () => {
  assert.deepEqual(
    findMissing({ ...TODAS, ADMIN_USERS: undefined }).map((r) => r.name),
    ['ADMIN_USERS'],
  );
  assert.deepEqual(
    findMissing({ ...TODAS, ALLOWED_ORIGINS: null }).map((r) => r.name),
    ['ALLOWED_ORIGINS'],
  );
});

test('findMissing: é pura — não lê process.env nem lança', () => {
  // process.env aqui está COMPLETO (preenchido no topo do arquivo); mesmo assim,
  // findMissing({}) precisa reportar as 5 — prova de que só olha o argumento.
  assert.equal(findMissing({}).length, 5);
});

// ── buildMessage: mensagem acionável e sem vazamento (T-03-01) ────

test('buildMessage: lista TODAS as faltantes de uma vez, com nome e dica', () => {
  const message = buildMessage(findMissing({}));
  for (const { name, hint } of REQUIRED) {
    assert.ok(message.includes(name), `mensagem não cita ${name}`);
    assert.ok(message.includes(hint), `mensagem não cita a dica de ${name}`);
  }
  // Aponta para o arquivo de referência — é o que o operador precisa abrir.
  assert.match(message, /\.env\.example/);
});

test('buildMessage: NUNCA ecoa o valor de nenhuma variável (ASVS V7)', () => {
  // Ambiente com uma única faltante: as outras 4 estão presentes e com valores
  // reconhecíveis. Nenhum desses valores pode aparecer na mensagem.
  const message = buildMessage(findMissing({ ...TODAS, JWT_SECRET: '' }));
  for (const valor of Object.values(TODAS)) {
    assert.ok(!message.includes(valor), `mensagem vazou o valor "${valor}"`);
  }
});

// ── validateEnv: os dois ramos de D-05 ───────────────────────────

test('validateEnv: ambiente completo em produção retorna ok e NÃO lança', () => {
  assert.deepEqual(validateEnv({ NODE_ENV: 'production', ...TODAS }), {
    ok: true,
    missing: [],
  });
});

test('validateEnv: em produção, faltando obrigatória, LANÇA citando as 5 de uma vez', () => {
  assert.throws(
    () => validateEnv({ NODE_ENV: 'production' }),
    (err) => {
      assert.ok(err instanceof Error);
      for (const nome of NOMES) {
        assert.ok(err.message.includes(nome), `erro não cita ${nome}`);
      }
      return true;
    },
  );
});

test('validateEnv: em development NÃO lança — avisa uma vez com a tag [Config]', () => {
  const warn = mock.method(logger, 'warn', () => {});
  try {
    const r = validateEnv({ NODE_ENV: 'development' });
    assert.deepEqual(r, { ok: false, missing: NOMES });
    assert.equal(warn.mock.calls.length, 1);
    const [linha] = warn.mock.calls[0].arguments;
    assert.ok(
      String(linha).startsWith('[Config] '),
      'o aviso precisa da tag [Config] no padrão [Scheduler]/[Auth]/[Emailer]',
    );
  } finally {
    mock.restoreAll();
  }
});

test('validateEnv: sem NODE_ENV comporta-se como development (ramo do CI e da suíte)', () => {
  // `npm run` não define NODE_ENV — é neste ramo que a suíte e o CI caem.
  const warn = mock.method(logger, 'warn', () => {});
  try {
    const r = validateEnv({});
    assert.equal(r.ok, false);
    assert.deepEqual(r.missing, NOMES);
    assert.equal(warn.mock.calls.length, 1);
  } finally {
    mock.restoreAll();
  }
});
