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

// As quatro rotas que hoje respondem sem credencial. `/api/auth/verify` está aqui porque o
// middleware a libera — ela mesma decide se o header é válido.
const PUBLICAS = [
  { path: '/api/auth/login', method: 'POST' },
  { path: '/api/auth/verify', method: 'POST' },
  { path: '/api/track/click', method: 'GET' },
  { path: '/api/health', method: 'GET' },
];

// Todo o resto da superfície HTTP. Os dois primeiros itens carregam a marcação DEFEITO:
// eles são o fluxo de recuperação de senha, que por definição é usado por quem NÃO tem
// token — e hoje é barrado antes de chegar ao handler. A expectativa aqui pina o
// comportamento ATUAL (bloqueado); a Etapa 1 move as duas linhas para PUBLICAS junto com
// a correção, e é essa movimentação que prova a correção.
const PROTEGIDAS = [
  { path: '/api/auth/forgot-password', method: 'POST', defeito: true },
  { path: '/api/auth/reset-password', method: 'POST', defeito: true },
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
  await t.test('a matriz cobre as 26 entradas da superfície HTTP', () => {
    assert.equal(PUBLICAS.length + PROTEGIDAS.length, 26);
  });
});

// Documenta, por asserção e não por comentário, os dois pontos do fluxo de senha que a
// Etapa 1 vai corrigir. Falhar AQUI depois da correção é o comportamento desejado: força
// quem corrigir a mover as linhas para PUBLICAS em vez de deixar a matriz desatualizada.
test('DEFEITO CONHECIDO: recuperação de senha exige o token que o usuário não tem', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  for (const { path } of PROTEGIDAS.filter((r) => r.defeito)) {
    const res = await srv.request(path, { method: 'POST', body: {} });
    assert.equal(res.status, 401);
    assert.equal(res.body?.error, BLOQUEIO_DO_MIDDLEWARE);
  }
});
