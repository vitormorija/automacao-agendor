// Retentativa da rodada agendada (runScheduledCheck, em scheduler.js).
//
// O incidente: em 15/10/2026, às 8h, `/tasks` passou dos 15 s de timeout, a rodada abortou
// inteira e ninguém foi notificado no dia — a próxima chance era o cron do dia seguinte. Estes
// cenários pinam o conserto: a rodada ABORTADA é tentada de novo mais tarde, até um teto; a que
// CONCLUI não é; e nada fica pendurado depois de desligar as notificações ou reagendar.
//
// O `setTimeout` de 15 minutos não é exercitado de verdade: runScheduledCheck recebe um
// `agendar` falso que só registra o pedido, e o teste dispara a próxima tentativa na mão.

const { makeTmpDbPath, openRaw } = require('./helpers/tmpDb');

// DB_PATH antes de qualquer require('../src/db'): o runCheck grava no notification_log.
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

require('./setup');

const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { installFakeAxios } = require('./helpers/fakeAxios');

// Mesmo relógio e mesma fixture de scheduler.resilience.test.js: dois negócios elegíveis.
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();
const dealsPage = require('./fixtures/synthetic/deals-page.json');
const USUARIOS = {
  data: [
    { id: 11, name: 'Ana Vendas', contact: { email: 'ana@exemplo.invalid' } },
    {
      id: 13,
      name: 'Bruno Vendas',
      contact: { email: 'bruno@exemplo.invalid' },
    },
  ],
  links: {},
};

// Quantas das próximas chamadas a /tasks devem falhar com timeout — a borda do incidente.
let falhasDeTarefasRestantes = 0;

const fake = installFakeAxios((url) => {
  if (url === '/deals') {
    return {
      data: {
        data: dealsPage,
        meta: { totalCount: dealsPage.length },
        links: {},
      },
    };
  }
  if (url.startsWith('/organizations/')) {
    return { data: { data: { category: { name: 'Lead' } } } };
  }
  if (url === '/tasks') {
    if (falhasDeTarefasRestantes > 0) {
      falhasDeTarefasRestantes--;
      return Promise.reject(
        Object.assign(new Error('timeout of 15000ms exceeded'), {
          code: 'ECONNABORTED',
        }),
      );
    }
    return { data: { data: [] } };
  }
  if (url === '/users') return { data: USUARIOS };
  return { data: { data: [] } };
});

const enviados = [];
mock.method(nodemailer, 'createTransport', () => ({
  verify: async () => true,
  sendMail: async (msg) => {
    enviados.push(msg.to);
    return {};
  },
}));

const db = require('../src/db');
const scheduler = require('../src/scheduler');
const { runScheduledCheck } = scheduler;

// `agendar` falso: guarda cada pedido de nova tentativa sem esperar 15 minutos.
function agendadorFalso() {
  const pedidos = [];
  const agendar = (fn, ms) => {
    pedidos.push({ fn, ms });
    return pedidos.length;
  };
  return { pedidos, agendar };
}

before(() => {
  mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
});

after(() => {
  scheduler.stopTasks();
  mock.restoreAll();
  db.closeDb();
  cleanup();
  mock.timers.reset();
});

beforeEach(() => {
  falhasDeTarefasRestantes = 0;
  enviados.length = 0;
  fake.get.mock.resetCalls();
  db.setConfig('notifications_enabled', 'true');
  // A dedup do dia pularia os negócios já notificados por um cenário anterior.
  const conn = openRaw(DB_PATH);
  try {
    conn.prepare('DELETE FROM notification_log').run();
  } finally {
    conn.close();
  }
});

test('(A) rodada abortada por timeout é tentada de novo em 15 min, e a nova tentativa envia', async () => {
  falhasDeTarefasRestantes = 1;
  const { pedidos, agendar } = agendadorFalso();

  const primeira = await runScheduledCheck({ agendar });
  assert.equal(primeira.abortada, true);
  assert.match(primeira.error, /timeout of 15000ms exceeded/);
  assert.equal(enviados.length, 0, 'a rodada abortada não chega ao envio');
  assert.equal(
    pedidos.length,
    1,
    'a rodada abortada precisa agendar nova tentativa',
  );
  assert.equal(pedidos[0].ms, 15 * 60 * 1000);

  const segunda = await pedidos[0].fn();
  assert.equal(segunda.abortada, undefined);
  assert.equal(
    segunda.notified,
    2,
    'a nova tentativa notifica os dois negócios',
  );
  assert.equal(pedidos.length, 1, 'a tentativa que concluiu não agenda outra');
});

test('(B) desiste depois de 3 novas tentativas — no total, 4 rodadas', async () => {
  falhasDeTarefasRestantes = 99;
  const { pedidos, agendar } = agendadorFalso();

  let r = await runScheduledCheck({ agendar });
  while (pedidos.length && r.abortada) {
    const antes = pedidos.length;
    r = await pedidos[antes - 1].fn();
    if (pedidos.length === antes) break;
  }

  assert.equal(r.abortada, true);
  assert.equal(pedidos.length, 3, 'o teto é de 3 novas tentativas');
  const chamadasDeTarefas = fake.get.mock.calls.filter(
    (c) => c.arguments[0] === '/tasks',
  ).length;
  assert.equal(chamadasDeTarefas, 4, 'quatro rodadas consultaram /tasks');
  assert.equal(enviados.length, 0);
});

test('(C) rodada que conclui não agenda nova tentativa', async () => {
  const { pedidos, agendar } = agendadorFalso();
  const r = await runScheduledCheck({ agendar });
  assert.equal(r.abortada, undefined);
  assert.equal(r.notified, 2);
  assert.equal(pedidos.length, 0);
});

test('(D) notificações desligadas entre as tentativas: não agenda mais nada', async () => {
  falhasDeTarefasRestantes = 99;
  const { pedidos, agendar } = agendadorFalso();

  await runScheduledCheck({ agendar });
  assert.equal(pedidos.length, 1);

  db.setConfig('notifications_enabled', 'false');
  const r = await pedidos[0].fn();
  assert.equal(r.abortada, true);
  assert.equal(
    pedidos.length,
    1,
    'com as notificações desligadas a cadeia para',
  );
});

test('(E) reagendar ou parar cancela a tentativa pendente', async () => {
  falhasDeTarefasRestantes = 1;
  const limpos = [];
  const clear = mock.method(globalThis, 'clearTimeout', (id) =>
    limpos.push(id),
  );
  try {
    // `agendar` devolve um identificador conhecido no lugar de um timer de verdade.
    await runScheduledCheck({ agendar: () => 'timer-pendente' });
    scheduler.stopTasks();
    assert.deepEqual(limpos, ['timer-pendente']);

    // Já cancelado: um segundo stop não tenta limpar o mesmo timer de novo.
    scheduler.stopTasks();
    assert.deepEqual(limpos, ['timer-pendente']);
  } finally {
    clear.mock.restore();
  }
});
