// Teste do NOVO fluxo (NÃO é caracterização): fixa o fail-safe de REL-06 / Decisão Q2 —
// a consulta de tarefas futuras passa a ser "completa ou exceção", nunca parcial silenciosa.
//
// Por que isso é regra de segurança e não detalhe de robustez: o Set devolvido por
// getDealsWithFutureTasks é usado por scheduler.js:61 como decisão de QUEM NÃO É NOTIFICADO
// (`staleDeals.filter((d) => !futureTasks.has(d.id))`). Um Set parcial — o que o antigo
// `catch { console.error; break }` de agendor.js:224-227 produzia — significa notificar
// indevidamente deals que TÊM tarefa futura agendada. Proteção parcial é pior que falha
// explícita, porque ninguém percebe. Com o timeout de 15s do 04-03 esse caminho deixa de ser
// hipotético e passa a ser alcançável por lentidão da API.
//
// Os 7 cenários (5 literais da Decisão Q2 + os 2 outros consumidores do Set):
//   (Q2-1) /tasks falha -> ZERO envios de e-mail e ZERO linhas novas no notification_log
//   (Q2-2) /tasks falha -> a mensagem fica registrada em results.error
//   (Q2-3) /tasks falha -> o lock isRunning é liberado (finally de scheduler.js:174)
//   (B2)   /tasks falha -> runCheckOnly() REJEITA (POST /api/notifications/check vira 500)
//   (B3)   /tasks falha -> staleHandler responde 500 com o shape { error } de routes/deals.js
//   (Q2-5) caminho feliz IDÊNTICO ao de hoje: deal com tarefa futura segue filtrado,
//          deal sem tarefa segue sendo notificado
//   (Q2-4) depois da falha, com a borda sã, a rodada seguinte executa normalmente
//
// A borda que falha aqui é `/tasks` — o oposto de scheduler.resilience.test.js (04-01), que
// falha por `/users` justamente para sobreviver a esta mudança. Os 5 invariantes daquele
// arquivo continuam válidos e devem seguir verdes.

const { makeTmpDbPath, openRaw } = require('./helpers/tmpDb');

// Cria o arquivo temporário e fixa DB_PATH ANTES de qualquer require('../src/db'):
// db.js lê process.env.DB_PATH no load e abre a conexão ali. O runCheck grava no
// notification_log de verdade, então backend/agendor.db precisa ficar intocado.
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

// setup.js só define DB_PATH se ausente — como já definimos acima, o arquivo temp vence.
require('./setup');

const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { installFakeAxios } = require('./helpers/fakeAxios');

// Relógio fixo: mesmo instante de agendor.getStaleDeals.test.js, para reusar a fixture
// sintética e o seu golden. now = 2026-06-01 -> cutoff = 2026-05-17 (staleDays 15).
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

// Categoria por organização (resposta de /organizations/:id). Default = 'Lead'.
const ORG_CATEGORY = {
  205: 'Parceiro', // categoria excluída
};

// Fixture REUSADA (não recriada): é a fonte do golden [101, 103] do teste de getStaleDeals.
const dealsPage = require('./fixtures/synthetic/deals-page.json');

// Usuários responsáveis pelos dois deals que sobrevivem aos filtros (owners 11 e 13).
// `links` sem `next` encerra a paginação de getUsers (agendor.js:26) na primeira volta.
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

// Resposta de /tasks. UMA tarefa não finalizada com prazo futuro apontando para o deal 101:
// é o que faz o filtro de scheduler.js:61 proteger o 101 e deixar só o 103 para notificar.
// Lista de módulo (mutável) para permitir variações sem reinstalar o stub.
const TAREFAS = [
  {
    id: 9001,
    finishedAt: null,
    dueDate: '2026-06-10T00:00:00.000Z', // futuro em relação ao FIXED_NOW
    deal: { id: 101 },
  },
];

// ── Controle mutável da borda /tasks ─────────────────────────────
// O stub NUNCA é reinstalado entre casos: o routeHandler ramifica por esta variável de
// módulo. Reinstalar mock.method(axios,'create') depois do require de agendor.js não teria
// efeito nenhum — a instância `api` já foi criada no load do módulo.
let tarefasDevemFalhar = false;

// Erro de borda fiel ao que o axios produz num timeout de client: o adaptador HTTP usa
// ECONNABORTED (e não ETIMEDOUT) porque transitional.clarifyTimeoutError é false por padrão.
function erroDeBorda() {
  return Object.assign(new Error('timeout of 15000ms exceeded'), {
    code: 'ECONNABORTED',
  });
}

// Instala o stub ANTES de exigir agendor.js/scheduler.js (a instância `api` nasce no load).
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
    const id = Number(url.split('/').pop());
    return {
      data: { data: { category: { name: ORG_CATEGORY[id] || 'Lead' } } },
    };
  }
  if (url === '/tasks') {
    if (tarefasDevemFalhar) return Promise.reject(erroDeBorda());
    return { data: { data: TAREFAS } };
  }
  if (url === '/users') {
    return { data: USUARIOS };
  }
  return { data: { data: [] } };
});

// Borda SMTP stubada com contador de envios: é o oráculo do cenário Q2-1 ("nenhuma
// notificação enviada"). PC-13: nada do objeto de opções é capturado, asserido ou impresso
// — ele carrega auth.pass.
let enviados = 0;
mock.method(nodemailer, 'createTransport', () => ({
  verify: async () => true,
  sendMail: async () => {
    enviados++;
    return {};
  },
}));

// require do db, do scheduler e da rota DEPOIS de DB_PATH e do stub de axios.
const db = require('../src/db');
const { runCheck, runCheckOnly, getStatus } = require('../src/scheduler');
const dealsRouter = require('../src/routes/deals');
const { staleHandler } = dealsRouter;

// `res` falso mínimo, no padrão da Opção A de 04-PATTERNS §Sem Análogo Direto: acumula o
// estado que o assert precisa, sem servidor HTTP e sem supertest/nock (proibidos nesta fase).
function resFalso() {
  return {
    statusCode: undefined,
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

// Zera o notification_log por uma SEGUNDA conexão ao mesmo arquivo (padrão de
// db.dedup.test.js:62-82). Necessário porque alreadyNotifiedToday (db.js:223) dedupa por
// dia e o relógio está congelado: sem isso, o resultado de um caso dependeria de quantos
// casos anteriores conseguiram notificar — que é exatamente o que muda entre RED e GREEN.
function limparNotificationLog() {
  const conn = openRaw(DB_PATH);
  try {
    conn.prepare('DELETE FROM notification_log').run();
  } finally {
    conn.close();
  }
}

before(() => {
  // Só 'Date': habilitar 'setTimeout' congelaria a espera entre lotes de páginas
  // (agendor.js:143). Com totalCount = 10 não há segunda página, então nada espera.
  mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
});

after(() => {
  mock.restoreAll();
  db.closeDb();
  cleanup();
  mock.timers.reset();
});

// O mock.fn acumula chamadas entre casos; zerar mantém cada asserção de contagem local.
beforeEach(() => {
  fake.get.mock.resetCalls();
});

test('(Q2-1) falha na consulta de tarefas futuras: NENHUMA notificação enviada e NENHUMA linha nova no log', async () => {
  tarefasDevemFalhar = true;
  const antes = enviados;

  // Com a borda sã esta mesma rodada notificaria o deal 103 (ver Q2-5): é isso que
  // torna "zero envios" uma afirmação sobre o fail-safe, e não sobre um cenário vazio.
  await runCheck();

  assert.equal(
    enviados,
    antes,
    'uma rodada abortada pelo fail-safe não pode disparar nenhum e-mail',
  );
  const { total } = db.getNotificationLogs({ limit: 100 });
  assert.equal(
    total,
    0,
    'sem envio não pode haver linha em notification_log (nem "sent" nem "error")',
  );
});

test('(Q2-2) falha na consulta de tarefas futuras: a mensagem fica registrada em results.error', async () => {
  tarefasDevemFalhar = true;

  // `await` nu: o catch de scheduler.js:171 registra e NÃO relança (invariante do 04-01).
  const r = await runCheck();

  assert.equal(
    typeof r.error,
    'string',
    'a falha propagada por getDealsWithFutureTasks deve virar string em results.error',
  );
  assert.ok(r.error.length > 0, 'results.error não pode ser string vazia');
  assert.match(
    r.error,
    /timeout of 15000ms exceeded/,
    'results.error deve carregar a mensagem do erro injetado em /tasks',
  );
});

test('(Q2-3) o lock isRunning é liberado depois da rodada abortada pelo fail-safe', async () => {
  tarefasDevemFalhar = true;
  const r = await runCheck();

  // Pré-condição explícita: sem ela o caso seria vago — passaria também quando a rodada
  // termina com sucesso, que é justamente o estado ANTES do fail-safe existir.
  assert.equal(
    typeof r.error,
    'string',
    'pré-condição: a rodada precisa ter falhado para o caso dizer algo sobre o lock',
  );
  // Um lock vazado não derruba nada — faz o guard de scheduler.js:27 recusar TODA execução
  // seguinte, e o sistema para de notificar EM SILÊNCIO. É o pior modo de falha daqui.
  assert.equal(
    getStatus().isRunning,
    false,
    'isRunning deve voltar a false pelo finally, mesmo na rodada abortada',
  );
});

test('(B2) falha na consulta de tarefas futuras: runCheckOnly REJEITA em vez de devolver lista parcial', async () => {
  tarefasDevemFalhar = true;

  // runCheckOnly não tem try/catch próprio; quem absorve é o handler de
  // routes/notifications.js:35-42, que já responde 500 { error }. Rejeitar é o contrato.
  await assert.rejects(
    () => runCheckOnly(),
    /timeout of 15000ms exceeded/,
    'a prévia sem envio não pode mascarar a falha devolvendo hasFutureTask incompleto',
  );
});

test('(B3) falha na consulta de tarefas futuras: staleHandler responde 500 com o shape { error }', async () => {
  tarefasDevemFalhar = true;

  const res = resFalso();
  await staleHandler({ query: {} }, res);

  assert.equal(
    res.statusCode,
    500,
    'a aba "Negócios" deixa de carregar enquanto /tasks falha — 500 aceito por decisão humana',
  );
  assert.equal(
    typeof res.body.error,
    'string',
    'o catch de routes/deals.js:31-34 devolve { error: err.message }',
  );
  // /stale usa a forma { error }, não { ok:false, error } — as duas coexistem no repositório
  // e a regra do CLAUDE.md é manter a que a rota já usa.
  assert.equal(
    Object.hasOwn(res.body, 'ok'),
    false,
    "o shape de erro do /stale não tem a chave 'ok'",
  );
});

test('(B3) o seam não quebra o contrato do router (app.use continua válido)', () => {
  // Props anexadas a module.exports = router são ignoradas pelo Express.
  assert.equal(typeof dealsRouter, 'function');
});

test('(Q2-5) caminho feliz IDÊNTICO: deal com tarefa futura segue filtrado, deal sem tarefa é notificado', async () => {
  tarefasDevemFalhar = false;
  // Independência de ordem: o resultado deste caso não pode depender de quantas rodadas
  // anteriores conseguiram notificar (alreadyNotifiedToday dedupa por dia, relógio fixo).
  limparNotificationLog();
  const antes = enviados;

  const r = await runCheck();

  assert.equal(r.error, undefined, 'com a borda sã não há results.error');
  assert.equal(
    r.skippedFutureTasks,
    1,
    'o deal 101 tem tarefa futura e deve ser removido antes do laço de envio',
  );
  assert.equal(
    r.stale,
    1,
    'dos dois deals stale da fixture ([101, 103]), sobra só o 103 para notificar',
  );
  const idsProcessados = r.deals.map((d) => d.id);
  assert.deepEqual(
    idsProcessados,
    [103],
    'o filtro por tarefa futura continua exatamente igual ao de hoje',
  );
  assert.equal(
    r.deals[0].notified,
    true,
    'o deal sem tarefa futura continua sendo notificado',
  );
  assert.equal(
    enviados,
    antes + 1,
    'um e-mail para o dono do 103 (o autor 23 não está na lista de usuários)',
  );
});

test('(Q2-4) depois da rodada abortada, a rodada seguinte executa normalmente', async () => {
  tarefasDevemFalhar = true;
  await runCheck();
  tarefasDevemFalhar = false;

  const r = await runCheck();

  // O guard de scheduler.js:27 devolve { skipped: true, reason: 'Verificação já em andamento' }.
  // Numa execução REAL `skipped` é a CONTAGEM de deals pulados (número, inicializado em 0 na
  // :36) e `reason` nunca existe — por isso a prova de "não foi recusada" é `reason`, não
  // `skipped`. Mesma correção registrada no 04-01.
  assert.equal(
    r.reason,
    undefined,
    'uma execução recusada pelo guard traria `reason`; esta não pode trazer',
  );
  assert.equal(
    typeof r.skipped,
    'number',
    '`skipped` aqui é contagem, não flag',
  );
  assert.equal(
    r.error,
    undefined,
    'a falha anterior não pode contaminar a rodada seguinte',
  );
  assert.equal(
    r.checked,
    1,
    'a rodada realmente andou: o deal 103 foi checado (o 101 segue filtrado pela tarefa futura)',
  );
  assert.equal(
    typeof r.ranAt,
    'string',
    'ranAt só é gravado quando a rodada completa',
  );
});
