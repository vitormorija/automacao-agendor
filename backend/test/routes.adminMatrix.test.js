require('./setup');

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, tokenFor } = require('./helpers/httpServer');
const { isAdmin } = require('../src/middleware/requireAdmin');

// Matriz de PAPEL: quem está autenticado mas não é administrador.
//
// POR QUE SÓ AS NEGATIVAS SÃO EXERCITADAS POR HTTP. Um 403 é emitido pelo middleware ANTES
// do handler — é isso que torna seguro varrer as onze rotas administrativas numa suíte:
// nenhuma delas chega a falar com a API Agendor nem com o SMTP. O caminho POSITIVO (admin
// passa) tem o efeito oposto — POST /api/notifications/run com papel válido dispararia uma
// rodada de verdade — então ele é medido no predicado `isAdmin`, no fim do arquivo, sem HTTP.
//
// O ADMIN_USERS é escrito caso a caso porque requireAdmin lê process.env a cada chamada,
// justamente para permitir isto sem reimportar módulo.

const ADMIN = 'chefe@example.invalid';
const COMUM = 'comercial@example.invalid';

// As onze rotas que passam a exigir papel. As quatro primeiras já exigiam; as sete
// restantes não exigiam NADA além de estar logado — e são as que mudam configuração ou
// colocam e-mail na caixa de entrada de alguém.
const ADMINISTRATIVAS = [
  { path: '/api/auth/users', method: 'GET' },
  { path: '/api/auth/users', method: 'POST' },
  { path: '/api/auth/users/alguem', method: 'DELETE' },
  { path: '/api/auth/logs', method: 'GET' },
  { path: '/api/config', method: 'PUT' },
  { path: '/api/config/test-smtp', method: 'POST' },
  { path: '/api/notifications/run', method: 'POST' },
  { path: '/api/notifications/test-card', method: 'POST' },
  { path: '/api/notifications/test-summary', method: 'POST' },
  { path: '/api/notifications/test-owner-summary', method: 'POST' },
  { path: '/api/notifications/send-owner-summaries', method: 'POST' },
];

// O lado simétrico, e igualmente importante: restringir demais quebra o painel para todo
// mundo que não é admin. Estas leituras precisam continuar passando.
//
// COBERTURA PARCIAL, DECLARADA: /api/deals/stale, /api/notifications/check e
// /api/reports/current também são leituras que devem permanecer abertas, mas seus handlers
// falam com a API Agendor — exercitá-los aqui faria a suíte depender de rede. Ficam de fora
// desta varredura POR ESCOLHA, e não por esquecimento; quem os cobrir precisa do stub de
// axios (test/helpers/fakeAxios.js). As cinco abaixo tocam apenas o SQLite em memória.
const LEITURAS_ABERTAS = [
  { path: '/api/config', method: 'GET' },
  { path: '/api/notifications', method: 'GET' },
  { path: '/api/notifications/status', method: 'GET' },
  { path: '/api/notifications/notified-deals', method: 'GET' },
  { path: '/api/notifications/resolved', method: 'GET' },
];

test('papel: usuário comum é barrado nas rotas administrativas', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  process.env.ADMIN_USERS = ADMIN;
  const token = tokenFor(COMUM);

  for (const { path, method } of ADMINISTRATIVAS) {
    const res = await srv.request(path, { method, token, body: {} });
    assert.equal(
      res.status,
      403,
      `${method} ${path} deveria exigir papel de admin, mas respondeu ${res.status}`,
    );
    assert.equal(res.body?.ok, false);
  }
});

test('papel: as leituras do painel seguem abertas a quem não é admin', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  process.env.ADMIN_USERS = ADMIN;
  const token = tokenFor(COMUM);

  for (const { path, method } of LEITURAS_ABERTAS) {
    const res = await srv.request(path, { method, token });
    assert.notEqual(
      res.status,
      403,
      `${method} ${path} é leitura do painel e não pode exigir papel de admin`,
    );
  }
});

// O CASO QUE MOTIVOU A EXTRAÇÃO DO MIDDLEWARE. A versão anterior tinha
// `if (!ADMIN_USERS.length) return next()`: sem a variável configurada, todo usuário
// autenticado era tratado como administrador. Um controle de acesso que não sabe quem é
// administrador não pode concluir que todos são.
test('papel: ADMIN_USERS ausente NEGA, em vez de liberar geral', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const token = tokenFor(ADMIN); // o próprio admin — não há lista que o abone

  for (const vazio of ['', '   ', ',,']) {
    process.env.ADMIN_USERS = vazio;
    for (const { path, method } of ADMINISTRATIVAS) {
      const res = await srv.request(path, { method, token, body: {} });
      assert.equal(
        res.status,
        403,
        `com ADMIN_USERS=${JSON.stringify(vazio)}, ${method} ${path} respondeu ${res.status} — o fail-open voltou`,
      );
    }
  }
});

// O caminho positivo, medido sem HTTP pelo motivo explicado no cabeçalho.
test('predicado isAdmin', () => {
  process.env.ADMIN_USERS = ` ${ADMIN} , OUTRO@example.invalid `;

  assert.equal(isAdmin(ADMIN), true, 'e-mail listado deve ser admin');
  assert.equal(
    isAdmin(ADMIN.toUpperCase()),
    true,
    'a comparação é insensível a caixa nos dois lados',
  );
  assert.equal(
    isAdmin('outro@example.invalid'),
    true,
    'espaços em volta e caixa na própria lista não podem excluir ninguém',
  );
  assert.equal(isAdmin(COMUM), false);
  assert.equal(
    isAdmin(undefined),
    false,
    'requisição sem req.user não é admin',
  );
  assert.equal(isAdmin(''), false);

  process.env.ADMIN_USERS = '';
  assert.equal(isAdmin(ADMIN), false, 'sem lista, ninguém é admin');
});
