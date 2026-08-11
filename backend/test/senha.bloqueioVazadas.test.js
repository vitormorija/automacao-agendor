require('./setup');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, tokenFor } = require('./helpers/httpServer');
const auth = require('../src/routes/auth');
const { motivoBloqueio, mensagemBloqueio } = require('../src/senhasBloqueadas');

// O quarto controle da linha P2 do parecer de 14/07/2026: "hash do token, limitar tentativas,
// política de 12+ caracteres e bloqueio por vazamentos/senhas comuns". Os três primeiros
// tinham teste; este não existia porque o controle não existia.

const MIN_SENHA = auth.MIN_SENHA;
const FONTE = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'auth.js'),
  'utf8',
);

// Senha longa o bastante para passar no piso de tamanho — assim, quando um teste recebe 400,
// a causa só pode ser o bloqueio, e não o comprimento.
const SENHA_BOA = 'CorreiaVerde!Trilho7';

test('os QUATRO caminhos que gravam senha consultam o bloqueio', () => {
  // Mesmo padrão do teste do piso de tamanho: inventário por CONSTRUÇÃO. Um `bcrypt.hash`
  // novo sobre senha vinda de fora precisa aparecer aqui — foi assim que a política de
  // tamanho ficou decorativa por dois caminhos antes de alguém contar.
  const guardas = (FONTE.match(/motivoBloqueio\(/g) || []).length;
  assert.equal(
    guardas,
    4,
    `esperava 4 consultas ao bloqueio (reset, troca, criação e seed) — encontrei ${guardas}`,
  );
});

test('senhas comuns são recusadas, com e sem variação de caixa', () => {
  assert.equal(motivoBloqueio('senha123'), 'comum');
  assert.equal(motivoBloqueio('SENHA123'), 'comum');
  assert.equal(motivoBloqueio('  Password123  '), 'comum');
  assert.equal(motivoBloqueio('administrador'), 'comum');
});

test('a senha que vazou deste repositório é recusada NAS VARIANTES', () => {
  // O ponto do controle. `cadmus2026` sozinha já morre no piso de 12 caracteres, então uma
  // regra de igualdade exata nunca dispararia — e é justamente a variante que quem achou a
  // senha no histórico público do Git tenta primeiro.
  assert.equal(motivoBloqueio('cadmus2026'), 'vazada');
  assert.equal(motivoBloqueio('Cadmus2026@'), 'vazada');
  assert.equal(motivoBloqueio('Cadmus2026@Agendor'), 'vazada');
  assert.equal(motivoBloqueio('xxCADMUS2026xx'), 'vazada');
});

test('senha legítima passa, e string vazia não é tratada como bloqueio', () => {
  assert.equal(motivoBloqueio(SENHA_BOA), null);
  assert.equal(motivoBloqueio('Cadmus2027@Agendor'), null);
  // Vazio e nulo são problema de OUTRA guarda (campo obrigatório). Este módulo devolvendo
  // 'comum' para vazio faria a mensagem errada chegar ao usuário.
  assert.equal(motivoBloqueio(''), null);
  assert.equal(motivoBloqueio(null), null);
  assert.equal(motivoBloqueio(undefined), null);
});

test('a mensagem de senha vazada explica o motivo, e não repete a de senha comum', () => {
  // Sem dizer que aquele texto vazou, a pessoa tenta a variante seguinte da mesma senha e
  // leva outro "não" sem entender o porquê.
  const vazada = mensagemBloqueio('vazada');
  const comum = mensagemBloqueio('comum');
  assert.notEqual(vazada, comum);
  assert.match(vazada, /vaz/i);
});

test('criação de usuário pelo admin recusa senha vazada', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const ADMIN = 'chefe@example.invalid';
  process.env.ADMIN_USERS = ADMIN;

  const res = await srv.request('/api/auth/users', {
    method: 'POST',
    token: tokenFor(ADMIN),
    body: {
      username: 'novo@example.invalid',
      password: 'Cadmus2026@Agendor',
    },
  });

  assert.equal(
    res.status,
    400,
    'o admin conseguiu criar conta com uma variante da senha vazada',
  );
  assert.match(res.body.message, /vaz/i);
});

test('criação de usuário aceita senha legítima do mesmo tamanho', async (t) => {
  // Contraprova: sem ela, o teste acima passaria mesmo se o bloqueio recusasse TUDO.
  const srv = await startServer();
  t.after(() => srv.close());

  const ADMIN = 'chefe@example.invalid';
  process.env.ADMIN_USERS = ADMIN;

  const res = await srv.request('/api/auth/users', {
    method: 'POST',
    token: tokenFor(ADMIN),
    body: { username: 'legitimo@example.invalid', password: SENHA_BOA },
  });

  assert.equal(res.status, 200, res.body.message);
  assert.ok(SENHA_BOA.length >= MIN_SENHA);
});

test('o seed do admin inicial aborta diante de senha comum ou vazada', () => {
  const trecho = FONTE.slice(
    FONTE.indexOf('async function ensureDefaultUsers'),
    FONTE.indexOf('ensureDefaultUsers();'),
  );
  assert.match(trecho, /motivoBloqueio\(seedPassword\)/);
  assert.match(
    trecho,
    /return;/,
    'o seed precisa ABORTAR, e não seguir criando a conta',
  );
});
