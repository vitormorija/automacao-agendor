require('./setup');

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/httpServer');

// Matriz do PORTÃO de autenticação, exercitada por HTTP real.
//
// POR QUE ESTE ARQUIVO EXISTE. `middleware/auth.js` decide, para toda requisição, quem entra
// sem credencial — e estava em 0% de cobertura. O defeito que isso escondeu não é de handler,
// é de ORDEM: `app.use(authMiddleware)` roda antes do roteador, então uma rota ausente do
// PUBLIC_PATHS é barrada com 401 mesmo tendo handler correto. Nenhum seam de handler (o
// padrão usado no resto da suíte) pode reprovar isso, porque o seam nunca executa o middleware.
//
// POR QUE SÓ O CAMINHO SEM TOKEN. Uma requisição barrada pelo middleware NÃO chega ao handler
// — e é essa propriedade que torna a matriz segura de rodar: nenhuma rota aqui listada toca a
// API Agendor, o SMTP ou o relógio. A matriz de PAPEL (usuário comum barrado em rota
// administrativa) exige o oposto — atravessar o gate — e por isso vive em arquivo próprio,
// onde cada rota perigosa é tratada uma a uma.
//
// COMO SE LÊ "passou pelo portão". O 401 do middleware tem forma `{ error }`; os 401 emitidos
// pelas próprias rotas têm forma `{ ok: false, message }`. O discriminador abaixo depende
// dessa diferença e não do código de status, justamente porque uma rota pública pode
// legitimamente responder 401 por conta própria (é o caso de /api/auth/verify sem header).
const BLOQUEIO_DO_MIDDLEWARE = 'Não autenticado.';

function passouPeloPortao(res) {
  return !(res.status === 401 && res.body?.error === BLOQUEIO_DO_MIDDLEWARE);
}

// As rotas que respondem sem credencial. `/api/auth/verify` está aqui porque o middleware a
// libera — ela mesma decide se o header é válido.
//
// As duas de senha ESTAVAM na lista de protegidas, e é essa movimentação que prova a
// correção: recuperação de senha é, por definição, usada por quem não tem token. Nenhuma
// delas envia nada quando chamada sem corpo (respondem 400 pedindo o e-mail), então
// exercitá-las aqui é seguro.
const PUBLICAS = [
  { path: '/api/auth/login', method: 'POST' },
  { path: '/api/auth/logout', method: 'POST' },
  { path: '/api/auth/verify', method: 'POST' },
  { path: '/api/auth/forgot-password', method: 'POST' },
  { path: '/api/auth/reset-password', method: 'POST' },
  { path: '/api/track/click', method: 'GET' },
  { path: '/api/health', method: 'GET' },
];

// Todo o resto da superfície HTTP. /change-password fica AQUI de propósito, e não junto das
// outras duas de senha: ela exige a senha atual, o que só faz sentido para quem já entrou.
const PROTEGIDAS = [
  { path: '/api/auth/change-password', method: 'POST' },
  { path: '/api/auth/users', method: 'GET' },
  { path: '/api/auth/users', method: 'POST' },
  { path: '/api/auth/users/alguem', method: 'DELETE' },
  { path: '/api/auth/logs', method: 'GET' },
  { path: '/api/config', method: 'GET' },
  { path: '/api/config', method: 'PUT' },
  { path: '/api/config/test-smtp', method: 'POST' },
  { path: '/api/deals/stale', method: 'GET' },
  { path: '/api/notifications', method: 'GET' },
  { path: '/api/notifications/status', method: 'GET' },
  { path: '/api/notifications/check', method: 'POST' },
  { path: '/api/notifications/run', method: 'POST' },
  { path: '/api/notifications/test-card', method: 'POST' },
  { path: '/api/notifications/test-summary', method: 'POST' },
  { path: '/api/notifications/test-owner-summary', method: 'POST' },
  { path: '/api/notifications/send-owner-summaries', method: 'POST' },
  { path: '/api/notifications/notified-deals', method: 'GET' },
  { path: '/api/notifications/resolved', method: 'GET' },
  { path: '/api/reports/current', method: 'GET' },
];

test('portão de autenticação: matriz sem credencial', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  await t.test('as rotas públicas atravessam o middleware', async () => {
    for (const { path, method } of PUBLICAS) {
      const res = await srv.request(path, { method });
      assert.ok(
        passouPeloPortao(res),
        `${method} ${path} deveria ser pública, mas o middleware barrou com 401 { error: '${BLOQUEIO_DO_MIDDLEWARE}' }`,
      );
    }
  });

  await t.test('todas as demais são barradas antes do handler', async () => {
    for (const { path, method } of PROTEGIDAS) {
      const res = await srv.request(path, { method });
      assert.equal(
        res.status,
        401,
        `${method} ${path} deveria exigir credencial, mas respondeu ${res.status}`,
      );
      assert.equal(
        res.body?.error,
        BLOQUEIO_DO_MIDDLEWARE,
        `${method} ${path} respondeu 401, mas não com o 401 do middleware — o handler pode ter executado`,
      );
    }
  });

  // Guarda anti-regressão da própria matriz: se alguém acrescentar uma rota e esquecer de
  // listá-la, este arquivo continuaria verde medindo um conjunto menor. O total é conferido
  // contra a soma das duas listas, que é o inventário completo da superfície HTTP.
  await t.test('a matriz cobre as 27 entradas da superfície HTTP', () => {
    assert.equal(PUBLICAS.length + PROTEGIDAS.length, 27);
  });

  // Guarda do lado de dentro: a lista de públicas do middleware e a deste arquivo têm de
  // descrever o mesmo conjunto. Sem isto, acrescentar uma pública lá e esquecer aqui
  // deixaria a rota nova sem nenhuma asserção — e é exatamente assim que /forgot-password
  // ficou anos sem cobertura.
  await t.test(
    'a lista de públicas do middleware é a mesma medida aqui',
    () => {
      const doMiddleware = [...require('../src/middleware/auth').PUBLIC_PATHS];
      const daMatriz = PUBLICAS.map((r) => r.path);
      assert.deepEqual([...doMiddleware].sort(), [...daMatriz].sort());
    },
  );
});

// A comparação por prefixo que existia antes liberaria qualquer caminho começado por uma
// rota pública. É um erro que não aparece em nenhuma das listas acima, porque exige uma
// rota INVENTADA para se manifestar.
test('rota pública não libera por prefixo', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  for (const path of [
    '/api/auth/login-como-outro',
    '/api/healthcheck-interno',
    '/api/track/clickjacking',
  ]) {
    const res = await srv.request(path, { method: 'POST' });
    assert.equal(
      res.body?.error,
      BLOQUEIO_DO_MIDDLEWARE,
      `${path} não é rota pública e não pode herdar a liberação por prefixo`,
    );
  }
});
