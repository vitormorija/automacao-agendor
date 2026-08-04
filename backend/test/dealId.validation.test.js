// Validação do id de negócio antes da borda HTTP (WR-03 do 04-REVIEW).
//
// A cadeia concreta, ponta a ponta:
//   1. `POST /api/notifications/test-card` grava `deal_id` vindo direto do CORPO da requisição
//      (`routes/notifications.js`) — é o único escritor de `notification_log.deal_id`
//      controlado pelo usuário.
//   2. A coluna tem afinidade `INTEGER` mas a tabela **não é `STRICT`**, então o SQLite guarda
//      texto sem reclamar: `'../users'` sobrevive como TEXT.
//   3. `GET /api/notifications/resolved` lê essa linha e passa o valor a `getDealById`, que
//      interpolava o argumento cru no path.
//   4. O path relativo `/deals/../users` resolve para outro recurso — e a requisição sai pela
//      instância compartilhada, ou seja, **com o token de serviço da Agendor no header**.
//
// Impacto real é limitado (exige autenticação, é GET, e a resposta só alimenta
// `updatedAt`/`dealStatus`), mas `getDealById` nasceu nesta fase (04-03) e a guarda custa
// duas linhas — é o momento certo de fechá-la, não depois.
//
// Efeito colateral que a guarda também conserta: hoje uma linha com `deal_id` textual faz a
// consulta devolver dado de OUTRO recurso, e a rota pode marcar o negócio como resolvido com
// base nisso. Depois da guarda ela rejeita, o `catch` por item de `resolvedHandler` absorve, e
// a linha simplesmente aparece como não-resolvida — sem consulta indevida.
//
// Método: função de domínio exercitada direto, e o handler HTTP pelo seam `testCardHandler`,
// com o `res` falso mínimo — sem supertest, sem nock, sem porta.
//
// PC-13: o transporte SMTP é stubado e o objeto de opções do envio NUNCA é capturado nem
// impresso (ele carrega `from`, destinatários e o HTML do e-mail).

const { makeTmpDbPath, openRaw } = require('./helpers/tmpDb');

// Arquivo temporário e DB_PATH fixados ANTES de qualquer require('../src/db'): db.js lê
// process.env.DB_PATH no load e abre a conexão ali. Este teste GRAVA de verdade
// (logNotification), então backend/agendor.db precisa ficar intocado.
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

// setup.js só define DB_PATH se ausente — como já definimos acima, o arquivo temp vence.
require('./setup');

const { test, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { installFakeAxios } = require('./helpers/fakeAxios');

// ── Bordas ───────────────────────────────────────────────────────

// Stub instalado ANTES do require de src/agendor (a instância `api` nasce no load). Responde a
// QUALQUER `/deals/...`: é justamente por isso que o teste não pode se contentar em olhar a
// resposta — no estado sem guarda, `/deals/../users` também "funcionaria". A prova precisa ser
// a CONTAGEM de chamadas: zero requisição emitida é o que caracteriza "validado ANTES da borda".
const fake = installFakeAxios((url) => {
  if (url.startsWith('/deals/')) {
    const id = Number(url.split('/').pop());
    return {
      data: {
        data: { id, updatedAt: '2026-06-05T12:00:00.000Z', dealStatus: { id: 1 } },
      },
    };
  }
  return { data: { data: [] } };
});

// Transporte SMTP stubado: `/test-card` chama sendStaleNotification, que constrói um
// transporter de verdade. O objeto de opções entregue a sendMail é deliberadamente IGNORADO
// (PC-13) — este teste afirma coisas sobre o que foi GRAVADO no banco, não sobre o e-mail.
mock.method(nodemailer, 'createTransport', () => ({
  verify: async () => true,
  sendMail: async () => ({}),
}));

// require do db, da rota e do agendor DEPOIS de DB_PATH e dos stubs.
const db = require('../src/db');
const { getDealById } = require('../src/agendor');
const notificationsRouter = require('../src/routes/notifications');
const { testCardHandler } = notificationsRouter;

// ── Utilitários ──────────────────────────────────────────────────

function resFalso() {
  return {
    statusCode: 200,
    body: undefined,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(corpo) {
      this.body = corpo;
      return this;
    },
  };
}

// Zera por uma SEGUNDA conexão ao mesmo arquivo (padrão de db.dedup.test.js). Necessário
// porque getNotificationLogs ordena por sent_at DESC e os dois envios do caso (5) acontecem
// no mesmo milissegundo — sem limpar, qual linha vem primeiro seria indeterminado.
function limparNotificationLog() {
  const conn = openRaw(DB_PATH);
  try {
    conn.prepare('DELETE FROM notification_log').run();
  } finally {
    conn.close();
  }
}

// Executa o /test-card com o dealId dado e devolve a ÚNICA linha resultante.
async function gravarPeloTestCard(dealId) {
  limparNotificationLog();
  const res = resFalso();
  await testCardHandler(
    { body: { email: 'destino@exemplo.invalid', dealId } },
    res,
  );
  const { logs } = db.getNotificationLogs({ limit: 100 });
  assert.equal(logs.length, 1, 'pré-condição: o /test-card grava exatamente uma linha');
  return logs[0];
}

after(() => {
  mock.restoreAll();
  db.closeDb();
  cleanup();
});

// ── Casos ────────────────────────────────────────────────────────

test('(1) getDealById recusa um id de travessia de path SEM emitir requisição', async () => {
  fake.get.mock.resetCalls();

  await assert.rejects(
    () => getDealById('../users'),
    /id de negócio inválido/,
    'o valor hostil precisa ser recusado pela própria função de domínio',
  );

  // A asserção que dá sentido ao caso: recusar DEPOIS de consultar não fecha nada — a
  // requisição já teria saído com o token de serviço no header.
  assert.equal(
    fake.get.mock.callCount(),
    0,
    'a validação precisa acontecer ANTES da requisição: nenhuma chamada pode ter sido emitida',
  );
});

test('(2) inteiro POSITIVO é o contrato: 0, negativo, null e NaN também são recusados', async () => {
  for (const invalido of [0, -1, null, undefined, '', 'abc', 1.5]) {
    fake.get.mock.resetCalls();
    await assert.rejects(
      () => getDealById(invalido),
      /id de negócio inválido/,
      `o id ${JSON.stringify(invalido)} deveria ser recusado`,
    );
    assert.equal(
      fake.get.mock.callCount(),
      0,
      `nenhuma requisição pode sair para o id ${JSON.stringify(invalido)}`,
    );
  }
});

test('(3) o caminho legítimo continua funcionando: id numérico consulta /deals/101', async () => {
  fake.get.mock.resetCalls();

  const deal = await getDealById(101);

  assert.equal(fake.get.mock.callCount(), 1);
  assert.equal(fake.get.mock.calls[0].arguments[0], '/deals/101');
  assert.equal(deal.id, 101, 'a função continua desembrulhando o envelope da Agendor');
});

test('(4) NÃO-REGRESSÃO: string numérica (a forma como o valor sai do SQLite) também consulta /deals/101', async () => {
  // Sem este caso a guarda poderia quebrar o caminho REAL de produção em silêncio: o
  // better-sqlite3 devolve o que foi gravado, e nada garante que toda linha histórica de
  // notification_log tenha sido gravada como número. Uma validação estrita demais
  // (`typeof id === 'number'`) faria TODA a rota /resolved cair no catch por item e devolver
  // "nada resolvido" — uma negação de serviço silenciosa, não um conserto.
  fake.get.mock.resetCalls();

  const deal = await getDealById('101');

  assert.equal(fake.get.mock.callCount(), 1);
  assert.equal(
    fake.get.mock.calls[0].arguments[0],
    '/deals/101',
    'a string numérica precisa ser normalizada para o mesmo path do caso (3)',
  );
  assert.equal(deal.id, 101);
});

test('(5) o escritor controlado pelo usuário grava NÚMERO em notification_log.deal_id', async () => {
  // Corpo hostil: no estado sem correção isto vira TEXT na coluna (afinidade INTEGER sem
  // STRICT) e reaparece depois como argumento de getDealById.
  const hostil = await gravarPeloTestCard('../users');
  assert.equal(
    typeof hostil.deal_id,
    'number',
    'texto do corpo da requisição não pode sobreviver na coluna: é o que alimenta o path da Agendor',
  );
  assert.equal(hostil.deal_id, 0, 'sem id numérico utilizável, o fallback é 0');

  // Corpo legítimo: a conversão não pode descartar o id verdadeiro — o `logId` do
  // rastreamento de clique e o próprio /resolved dependem dele.
  const legitimo = await gravarPeloTestCard('5620');
  assert.equal(typeof legitimo.deal_id, 'number');
  assert.equal(legitimo.deal_id, 5620, 'o id numérico enviado como string precisa ser preservado');
});

test('(6) o seam não quebra o contrato do router (app.use continua válido)', () => {
  // Props anexadas a module.exports = router são ignoradas pelo Express.
  assert.equal(typeof notificationsRouter, 'function');
  assert.equal(typeof testCardHandler, 'function');
});
