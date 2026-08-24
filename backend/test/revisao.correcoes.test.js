require('./setup');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { startServer, tokenFor } = require('./helpers/httpServer');
const { createUser } = require('../src/db');
const { criarLimitador } = require('../src/rateLimit');

// Achados da revisão de código, travados por asserção.
//
// Todos os dez eram reais e nenhum tinha teste que os pegasse — é por isso que passaram. O
// valor deste arquivo não é a correção (já está feita), é impedir a REGRESSÃO: cada caso
// abaixo reprova exatamente o estado anterior.

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

// ── 1. O bloqueador de deploy ────────────────────────────────────
test('o cookie só é Secure quando a conexão realmente é HTTPS', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  await createUser(
    'rev@example.invalid',
    await bcrypt.hash('senha-de-teste-longa', 4),
  );

  const anterior = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const res = await srv.request('/api/auth/login', {
      method: 'POST',
      body: {
        username: 'rev@example.invalid',
        password: 'senha-de-teste-longa',
      },
      headers: { 'X-Forwarded-For': '10.5.0.1' },
    });
    const cookie = res.headers
      .getSetCookie()
      .find((c) => c.startsWith('auth_token='));

    // A conexão do teste é http. A versão anterior marcava Secure só por NODE_ENV, e o
    // resultado sobre o nginx que o repositório entrega (porta 80, bloco 443 comentado)
    // seria o navegador descartar o cookie: painel abre, toda chamada seguinte dá 401, e
    // ninguém entra. Sem Bearer, não havia caminho alternativo.
    assert.doesNotMatch(
      cookie,
      /Secure/i,
      'cookie marcado como Secure numa conexão HTTP — nenhum navegador o guardaria',
    );
    // E os atributos que não dependem do protocolo continuam de pé.
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
  } finally {
    process.env.NODE_ENV = anterior;
  }
});

test('sob HTTPS o Secure volta', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  await createUser(
    'rev2@example.invalid',
    await bcrypt.hash('senha-de-teste-longa', 4),
  );

  // `trust proxy: 'loopback'` faz o Express acreditar no X-Forwarded-Proto do nginx — é
  // assim que `req.secure` fica verdadeiro atrás do proxy que termina o TLS.
  const res = await srv.request('/api/auth/login', {
    method: 'POST',
    body: {
      username: 'rev2@example.invalid',
      password: 'senha-de-teste-longa',
    },
    headers: { 'X-Forwarded-For': '10.5.0.2', 'X-Forwarded-Proto': 'https' },
  });
  const cookie = res.headers
    .getSetCookie()
    .find((c) => c.startsWith('auth_token='));
  assert.match(
    cookie,
    /Secure/i,
    'sob HTTPS o cookie precisa exigir canal seguro',
  );
});

// ── 2. Data vazia não pode reprovar o PUT inteiro ────────────────
test('deals_since em branco é ignorado, e as outras chaves salvam', async (t) => {
  const srv = await startServer();
  const { stopTasks } = require('../src/scheduler');
  t.after(() => {
    stopTasks();
    return srv.close();
  });
  const ADMIN = 'chefe@example.invalid';
  process.env.ADMIN_USERS = ADMIN;

  // O painel reenvia o objeto INTEIRO a cada save, e o <input type="date"> devolve '' com a
  // data incompleta. Antes isso reprovava o PUT todo — a gravação é tudo-ou-nada —, e o
  // admin perdia a capacidade de salvar SMTP, agendamento e threshold por causa de um campo
  // que nem estava editando.
  const res = await srv.request('/api/config', {
    method: 'PUT',
    token: tokenFor(ADMIN),
    body: { deals_since: '', stale_days: '33' },
  });
  assert.equal(
    res.status,
    200,
    'uma data em branco derrubou o salvamento inteiro',
  );

  const depois = await srv.request('/api/config', { token: tokenFor(ADMIN) });
  assert.equal(depois.body.stale_days, '33', 'a outra chave não foi gravada');
  assert.ok(depois.body.deals_since, 'o corte não pode ter sido apagado');

  // A validação de verdade continua valendo — ignorar vazio não é aceitar qualquer coisa.
  const invalida = await srv.request('/api/config', {
    method: 'PUT',
    token: tokenFor(ADMIN),
    body: { deals_since: '2026-13-45' },
  });
  assert.equal(invalida.status, 400);
});

// ── 3. Piso de senha coerente entre backend e painel ─────────────
test('o painel não anuncia um piso de senha menor que o do servidor', () => {
  const MIN_SENHA = require('../src/routes/auth').MIN_SENHA;
  const constantes = fs.readFileSync(
    path.join(RAIZ, '..', 'frontend', 'src', 'constantes.js'),
    'utf8',
  );
  assert.match(
    constantes,
    new RegExp(`MIN_SENHA = ${MIN_SENHA}\\b`),
    'o piso do painel divergiu do piso do backend',
  );

  // Nenhuma tela pode ter sobrado com o número antigo cravado. O modo de falha era pior do
  // que validação ausente: o campo AFIRMAVA que 6 bastavam, o usuário obedecia, e o servidor
  // recusava contradizendo o rótulo que ele acabara de seguir.
  for (const arquivo of ['LoginPage.jsx', 'ChangePasswordModal.jsx']) {
    const fonte = fs.readFileSync(
      path.join(RAIZ, '..', 'frontend', 'src', 'components', arquivo),
      'utf8',
    );
    assert.doesNotMatch(
      fonte,
      /\.length < 6\b/,
      `${arquivo} ainda valida com 6`,
    );
    assert.doesNotMatch(
      fonte,
      /[Mm]ínimo 6 caracteres/,
      `${arquivo} ainda anuncia 6`,
    );
  }
});

// ── 5. O e-mail não pode contradizer o filtro ────────────────────
test('os templates de e-mail derivam o recorte, em vez de cravar 2026', () => {
  const fonte = ler('src', 'emailer.js');
  assert.doesNotMatch(
    fonte,
    /criados em 2026/,
    'o corpo do e-mail voltou a cravar o ano — a partir de 2027 estaria errado para todos',
  );
  assert.match(fonte, /rotuloDoCorteEmail\(\)/);
});

// ── 6. A trilha não pode sumir quando a resposta é abortada ──────
test('a auditoria registra mesmo quando a conexão é cortada', () => {
  const fonte = ler('src', 'middleware', 'auditoria.js');
  // `finish` não dispara em resposta abortada, e é justamente o disparo em massa — a ação
  // mais longa e mais sensível — que o proxy corta em 60s depois de o e-mail já ter saído.
  assert.match(fonte, /res\.on\('finish', registrar\)/);
  assert.match(fonte, /res\.on\('close', registrar\)/);
  assert.match(
    fonte,
    /if \(registrado\) return;/,
    'sem trava, o caminho normal gravaria duas linhas',
  );
});

// ── 7 e 10. A cota precisa decair ────────────────────────────────
test('a contagem parcial expira com a janela, em vez de acumular para sempre', () => {
  const lim = criarLimitador({
    maxTentativas: 3,
    minutosBloqueio: 15,
    minutosJanela: 15,
  });
  const ip = '10.6.0.1';

  const inicio = Date.now();
  const relogio = () => inicio;
  // Duas tentativas dentro da janela.
  lim.record(ip);
  lim.record(ip);
  assert.equal(lim.check(ip).blocked, false);

  // Antes, essas duas ficariam contadas PARA SEMPRE: três pedidos espalhados por semanas,
  // de três pessoas diferentes atrás do mesmo NAT, esgotavam o balde e a quarta pessoa a de
  // fato esquecer a senha levava 429 sem ninguém ter abusado de nada.
  const original = Date.now;
  try {
    Date.now = () => relogio() + 16 * 60 * 1000;
    // Passada a janela, a próxima tentativa recomeça do zero — logo, ainda restam 2.
    const r = lim.record(ip);
    assert.equal(r.nowBlocked, false);
    assert.equal(
      r.remaining,
      2,
      'a contagem anterior não expirou com a janela',
    );
  } finally {
    Date.now = original;
  }
});

// ── 8. LOG_DIR não pode depender do cwd ──────────────────────────
test('LOG_DIR relativo resolve contra o módulo, não contra o cwd', () => {
  const fonte = ler('src', 'app.js');
  assert.match(
    fonte,
    /path\.resolve\(__dirname, process\.env\.LOG_DIR\)/,
    'um LOG_DIR relativo cairia em /opt/logs sob PM2, e não em /opt/agendor/logs — a mesma dependência de cwd que D-13 removeu',
  );
});

// ── 9. As duas mensagens de boot precisam dizer o mesmo número ───
test('a dica do config.js anuncia o mesmo piso que o secret.js exige', () => {
  const secret = ler('src', 'secret.js');
  const config = ler('src', 'config.js');

  const piso = secret.match(/MIN_SEGREDO = (\d+)/)?.[1];
  assert.ok(piso, 'não achei o piso em secret.js');
  assert.match(
    config,
    new RegExp(`mín\\. ${piso} caracteres`),
    'a dica do contrato de configuração ficou menor que a regra: o operador corrige seguindo a dica, reinicia, e o boot aborta de novo — desta vez pelo secret.js',
  );
});
