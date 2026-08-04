// Regressão de SHAPE da rota GET /api/notifications/resolved (04-03 / REL-01, risco R-5).
//
// O que esta rota faz: para cada negócio já notificado, consulta o estado ATUAL dele na
// Agendor e decide se o negócio "andou" (updatedAt mais recente que a última notificação).
// É o que alimenta o indicador de resolução do dashboard.
//
// Por que ela precisa de rede de segurança AGORA: até o 04-03 a consulta era um `axios.get`
// cru, com url absoluta e header `Authorization` remontados à mão dentro da rota
// (notifications.js:220-223). Esse ponto ESCAPAVA da instância compartilhada de agendor.js e
// portanto não herdaria o timeout de 15s — era o furo de REL-01. Ao trocá-lo por
// getDealById() muda a forma do dado recebido (a função já devolve `data.data`
// desembrulhado), e o campo mais fácil de perder nessa troca é `dealStatus`, o ÚNICO que o
// frontend usa para o rótulo ganho/perdido. Uma regressão aqui seria silenciosa: a rota
// continuaria respondendo 200, só com um campo a menos.
//
// Os 7 casos:
//   (1) a rota responde 200 — o catch externo de :259-261 nunca foi alcançado
//   (2) o corpo tem EXATAMENTE o conjunto de chaves de hoje (comparado ordenado, não só presença)
//   (3) o item resolvido traz currentUpdatedAt e dealStatus com o id devolvido pela borda
//   (4) o item cuja consulta FALHA volta como não-resolvido, em `pending`, e a rota segue 200
//   (5) resolvedRate é o inteiro arredondado de resolvedCount / totalNotified * 100
//   (6) lista vazia devolve o corpo com zeros (o early-return de :206-214)
//   (7) o seam não quebra o contrato do router (app.use continua válido)
//
// Método: o handler é executado DIRETO com um `res` falso mínimo — molde do
// scheduler.failsafe.test.js (04-02), Opção A de 04-PATTERNS §Sem Análogo Direto. Sem
// supertest, sem nock, sem porta.

const { makeTmpDbPath, openRaw } = require('./helpers/tmpDb');

// Arquivo temporário e DB_PATH fixados ANTES de qualquer require('../src/db'): db.js lê
// process.env.DB_PATH no load e abre a conexão ali. A rota grava de verdade (markResolved),
// então backend/agendor.db precisa ficar intocado.
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

// setup.js só define DB_PATH se ausente — como já definimos acima, o arquivo temp vence.
require('./setup');

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { installFakeAxios } = require('./helpers/fakeAxios');

// ── Bordas e dados ───────────────────────────────────────────────

// Instante da última notificação de cada negócio (gravado em notification_log.sent_at).
// Valores distintos para tornar determinística a ordenação de getNotifiedDeals
// (ORDER BY last_notified_at DESC): 201, depois 202, depois 203.
const NOTIFICADO_EM = {
  201: '2026-06-01T08:00:00.000Z',
  202: '2026-06-01T07:00:00.000Z',
  203: '2026-06-01T06:00:00.000Z',
};

// Estado ATUAL de cada negócio na Agendor, como a borda devolveria.
//  201 -> updatedAt POSTERIOR ao sent_at  => resolvido
//  202 -> updatedAt ANTERIOR ao sent_at   => pendente
//  203 -> ausente aqui: a borda REJEITA   => item com falha
const DEAL_ATUAL = {
  201: { id: 201, updatedAt: '2026-06-05T12:00:00.000Z', dealStatus: { id: 2 } },
  202: { id: 202, updatedAt: '2026-05-20T09:00:00.000Z', dealStatus: { id: 1 } },
};

// Erro fiel ao que o axios produz num timeout de client (ECONNABORTED, sem `response`) —
// o cenário que o timeout de 15s do D-01 torna ALCANÇÁVEL em vez de hipotético.
function erroDeTimeout() {
  return Object.assign(new Error('timeout of 15000ms exceeded'), {
    code: 'ECONNABORTED',
  });
}

// Stub instalado ANTES do require de src/agendor (a instância `api` nasce no load).
installFakeAxios((url) => {
  if (url.startsWith('/deals/')) {
    const id = Number(url.split('/').pop());
    if (!DEAL_ATUAL[id]) return Promise.reject(erroDeTimeout());
    return { data: { data: DEAL_ATUAL[id] } };
  }
  return { data: { data: [] } };
});

// Espião do axios.get GLOBAL — o caminho órfão que este plano elimina. Enquanto a rota
// montava a url absoluta na mão, era por aqui que a requisição saía, SEM o timeout da
// instância. Lança de propósito: no estado antigo isto derruba os casos (3) e (5) sem tocar a
// rede real; no estado novo o contador tem de ficar em zero.
const axiosGetGlobal = mock.method(axios, 'get', async () => {
  throw new Error(
    'axios.get global foi chamado: a consulta escapou da instância compartilhada (REL-01)',
  );
});

// require do db e da rota DEPOIS de DB_PATH e do stub de axios.
const db = require('../src/db');
const notificationsRouter = require('../src/routes/notifications');
const { resolvedHandler } = notificationsRouter;

// ── Semeadura e utilitários ──────────────────────────────────────

// Semeia por uma SEGUNDA conexão ao MESMO arquivo (padrão de db.dedup.test.js:62-82):
// logNotification() carimbaria sent_at = agora, e estes casos precisam de instantes
// controlados em relação ao updatedAt devolvido pela borda.
function semear() {
  const seed = openRaw(DB_PATH);
  try {
    const stmt = seed.prepare(
      `INSERT INTO notification_log
         (deal_id, deal_title, owner_name, owner_email, admin_email, sent_at,
          days_stale, status, deal_updated_at, deal_type, web_url, resolved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const [id, sentAt] of Object.entries(NOTIFICADO_EM)) {
      stmt.run(
        Number(id),
        `Negócio ${id}`,
        'Ana Vendas',
        'ana@exemplo.invalid',
        null,
        sentAt,
        20,
        'sent',
        '2026-05-10T00:00:00.000Z',
        'Lead',
        `https://web.agendor.com.br/sistema/negocios/historico.php?id=${id}`,
        0,
      );
    }
  } finally {
    seed.close();
  }
}

function limparNotificationLog() {
  const conn = openRaw(DB_PATH);
  try {
    conn.prepare('DELETE FROM notification_log').run();
  } finally {
    conn.close();
  }
}

// `res` falso mínimo, no molde de scheduler.failsafe.test.js. statusCode começa em 200
// porque é o default do Express quando o handler chama só res.json() — assim o caso (1)
// afirma "respondeu 200", e não apenas "não chamou status()".
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

// A rota é invocada UMA vez e os casos asserem sobre o resultado guardado: a invocação tem
// efeito colateral (markResolved grava resolved = 1), então repeti-la faria cada caso
// depender de quantos rodaram antes.
let resposta;
let corpo;

before(async () => {
  semear();
  resposta = resFalso();
  await resolvedHandler({ query: {} }, resposta);
  corpo = resposta.body;
});

after(() => {
  mock.restoreAll();
  db.closeDb();
  cleanup();
});

// ── Casos ────────────────────────────────────────────────────────

test('(1) a rota responde 200 mesmo com um dos negócios falhando na consulta', () => {
  assert.equal(
    resposta.statusCode,
    200,
    'o catch externo (500) não pode ser alcançado por falha de UM item: o catch por item absorve',
  );
});

test('(2) o corpo tem exatamente o conjunto de chaves de hoje', () => {
  // Conjunto ORDENADO, não só presença: uma chave a mais também é regressão de contrato
  // (o frontend renderiza a partir deste objeto).
  assert.deepEqual(Object.keys(corpo).sort(), [
    'pending',
    'pendingCount',
    'resolved',
    'resolvedCount',
    'resolvedRate',
    'totalNotified',
  ]);
  assert.equal(corpo.totalNotified, 3);
  assert.equal(corpo.resolvedCount, 1);
  assert.equal(corpo.pendingCount, 2);
  assert.equal(corpo.resolved.length + corpo.pending.length, 3);
});

test('(3) o item resolvido traz currentUpdatedAt e dealStatus vindos da borda', () => {
  const item = corpo.resolved.find((d) => d.deal_id === 201);
  assert.ok(item, 'o negócio 201 andou depois da notificação e tem de estar em `resolved`');

  assert.equal(item.currentUpdatedAt, DEAL_ATUAL[201].updatedAt);
  assert.equal(item.resolved, true);
  assert.equal(item.resolved_at, DEAL_ATUAL[201].updatedAt);
  // dealStatus é o campo que a troca de envelope mais facilmente perderia: getDealById já
  // devolve `data.data`, então a leitura passa de `data.data?.dealStatus?.id` para
  // `deal?.dealStatus?.id`. É o único campo que o frontend usa para o rótulo ganho/perdido
  // (1 = em andamento, 2 = ganho, 3 = perdido).
  assert.equal(
    item.dealStatus,
    2,
    'dealStatus tem de sobreviver à troca do axios cru por getDealById',
  );
  // As colunas do banco continuam presentes no item (o handler faz spread de `d`).
  assert.equal(item.deal_title, 'Negócio 201');
  assert.equal(item.notification_count, 1);
});

test('(4) o item cuja consulta falha volta como NÃO-resolvido, em pending', () => {
  const item = corpo.pending.find((d) => d.deal_id === 203);
  assert.ok(item, 'o item com falha não pode sumir da resposta');
  // Fail-safe de leitura: sem estado atual, o negócio permanece com o que o banco sabe.
  // Marcar como resolvido "no escuro" esconderia um negócio parado do dashboard.
  assert.equal(item.resolved, false);
  assert.equal(
    item.currentUpdatedAt,
    undefined,
    'o caminho de falha devolve `{ ...d, resolved }` — sem currentUpdatedAt nem dealStatus',
  );
  assert.equal(item.dealStatus, undefined);

  // E o pendente "normal" (consultado com sucesso, mas sem novidade) segue distinguível dele.
  const pendenteNormal = corpo.pending.find((d) => d.deal_id === 202);
  assert.equal(pendenteNormal.currentUpdatedAt, DEAL_ATUAL[202].updatedAt);
  assert.equal(pendenteNormal.dealStatus, 1);
});

test('(5) resolvedRate é o percentual inteiro arredondado — e nada saiu pelo axios.get global', () => {
  assert.equal(
    corpo.resolvedRate,
    Math.round((1 / 3) * 100),
    '1 de 3 resolvidos = 33',
  );
  // Asserção NEGATIVA de REL-01: prova que a consulta passou pela instância compartilhada
  // (que tem o timeout de 15s) e não pelo caminho órfão que a rota usava antes.
  assert.equal(
    axiosGetGlobal.mock.callCount(),
    0,
    'nenhuma consulta pode sair pelo axios.get global — ele não herda baseURL, header nem timeout',
  );
});

test('(6) sem negócios notificados, a rota devolve o corpo com zeros', async () => {
  // Este caso ESVAZIA o notification_log; por isso é o último a tocar o banco. Ele exercita o
  // early-return de notifications.js:206-214, que nem chega a consultar a borda.
  limparNotificationLog();

  const res = resFalso();
  await resolvedHandler({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    resolved: [],
    pending: [],
    totalNotified: 0,
    resolvedCount: 0,
    pendingCount: 0,
    resolvedRate: 0,
  });
});

test('(7) o seam não quebra o contrato do router (app.use continua válido)', () => {
  // Props anexadas a module.exports = router são ignoradas pelo Express.
  assert.equal(typeof notificationsRouter, 'function');
});
