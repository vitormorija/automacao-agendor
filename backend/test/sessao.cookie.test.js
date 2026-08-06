require('./setup');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { startServer, tokenFor } = require('./helpers/httpServer');
const { createUser } = require('../src/db');
const { COOKIE_SESSAO } = require('../src/middleware/auth');

// Sessão em cookie HttpOnly e política de conteúdo.
//
// O token vivia no localStorage e viajava no cabeçalho Authorization — legível por qualquer
// script da página, o que faz de uma única falha de XSS o roubo de uma sessão inteira. As
// duas metades da mitigação são medidas aqui: o cookie que o script não lê, e a CSP que
// impede o script de existir. Uma não substitui a outra.

const USUARIO = 'sessao@example.invalid';
const SENHA = 'senha-de-teste-longa';

async function criarUsuario() {
  createUser(USUARIO, await bcrypt.hash(SENHA, 4));
}

// Lê o Set-Cookie da sessão. `getSetCookie` devolve TODOS os cabeçalhos, e não só o
// primeiro — sem ele, um segundo cookie na resposta esconderia o que queremos medir.
function cookieDaSessao(res) {
  return res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${COOKIE_SESSAO}=`));
}

test('login devolve a sessão em cookie, e NÃO no corpo', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  await criarUsuario();

  const res = await srv.request('/api/auth/login', {
    method: 'POST',
    body: { username: USUARIO, password: SENHA },
    headers: { 'X-Forwarded-For': '10.7.0.1' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  // O corpo não pode conter o token: devolvê-lo também no JSON deixaria o painel livre para
  // guardá-lo no localStorage de novo, e o HttpOnly deixaria de significar qualquer coisa.
  assert.equal(
    res.body.token,
    undefined,
    'o token voltou a sair no corpo da resposta',
  );

  const cookie = cookieDaSessao(res);
  assert.ok(cookie, 'o login não gravou o cookie de sessão');
  assert.match(
    cookie,
    /HttpOnly/i,
    'sem HttpOnly, o script volta a ler o token',
  );
  assert.match(
    cookie,
    /SameSite=Strict/i,
    'SameSite=Strict é a defesa de CSRF deste desenho',
  );
  assert.match(cookie, /Path=\//i);
});

test('Secure só em produção — em http local o cookie não seria gravado', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  await criarUsuario();

  const pedirLogin = (ip) =>
    srv.request('/api/auth/login', {
      method: 'POST',
      body: { username: USUARIO, password: SENHA },
      headers: { 'X-Forwarded-For': ip },
    });

  const semProducao = cookieDaSessao(await pedirLogin('10.7.0.2'));
  assert.doesNotMatch(
    semProducao,
    /Secure/i,
    'fora de produção o painel roda em http://localhost e um cookie Secure seria descartado',
  );

  const anterior = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const emProducao = cookieDaSessao(await pedirLogin('10.7.0.3'));
    assert.match(
      emProducao,
      /Secure/i,
      'em produção o cookie precisa exigir HTTPS',
    );
  } finally {
    process.env.NODE_ENV = anterior;
  }
});

test('o cookie é o único canal aceito — Bearer não entra mais', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const token = tokenFor(USUARIO);

  // Pelo cookie: passa.
  const comCookie = await srv.request('/api/notifications', { token });
  assert.notEqual(comCookie.status, 401);

  // Pelo cabeçalho antigo: não passa. Manter o Bearer vivo deixaria de pé a via que a
  // migração fecha — e um painel que ainda pudesse mandá-lo teria motivo para guardar o
  // token onde o script alcança.
  const comBearer = await srv.request('/api/notifications', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(comBearer.status, 401);
  assert.equal(comBearer.body?.error, 'Não autenticado.');
});

test('logout apaga o cookie com os MESMOS atributos do login', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const res = await srv.request('/api/auth/logout', { method: 'POST' });
  assert.equal(res.status, 200);

  const cookie = cookieDaSessao(res);
  assert.ok(cookie, 'o logout não emitiu Set-Cookie');
  // Um clearCookie com Path ou SameSite diferentes do login mira um cookie que não existe,
  // responde 200 e deixa a sessão de pé.
  assert.match(cookie, /Path=\//i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(
    cookie,
    /Expires=Thu, 01 Jan 1970|Max-Age=0/i,
    'o Set-Cookie do logout precisa expirar o valor',
  );
});

test('logout funciona sem sessão válida', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  // Quem está com o token expirado precisa conseguir limpar o próprio estado. Exigir sessão
  // válida para encerrar sessão prenderia o usuário numa tela da qual não consegue sair.
  const res = await srv.request('/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: `${COOKIE_SESSAO}=lixo-que-nao-e-jwt` },
  });
  assert.equal(res.status, 200);
});

test('CSP está ligada e proíbe script de outra origem', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const res = await srv.request('/api/health');
  const csp = res.headers.get('content-security-policy');

  assert.ok(
    csp,
    'a CSP estava desligada com uma justificativa que não vale mais',
  );
  assert.match(
    csp,
    /script-src 'self'/,
    'script-src precisa recusar inline e origem externa',
  );
  assert.doesNotMatch(
    csp,
    /script-src[^;]*unsafe-inline/,
    "'unsafe-inline' em script-src anularia a proteção que a diretiva existe para dar",
  );
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
});
