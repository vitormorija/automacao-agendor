// Caracterização (golden) da resiliência do agendador: roda o runCheck REAL contra as
// três bordas stubadas (HTTP Agendor via installFakeAxios, SMTP via nodemailer, SQLite
// em arquivo temporário) e um relógio fixo. Pina o comportamento ATUAL — não o ideal:
//   (1) uma falha de borda durante runCheck vira `results.error` e NÃO é relançada;
//   (2) o `finally` do try principal de runCheck (scheduler.js) libera o lock `isRunning`
//       mesmo na falha;
//   (3) a execução SEGUINTE a uma falha roda normalmente (o guard `if (isRunning)` do topo
//       de runCheck não trava);
//   (4) uma chamada concorrente recebe `{ skipped: true }` sem executar;
//   (5) runWeeklySummary resolve sem lançar quando a borda falha (o catch que fecha o corpo
//       daquela função, logando '[Scheduler] Erro no resumo semanal:').
//   (6) a chamada recusada pelo lock traz `execucaoIgnorada` — a chave PRÓPRIA da recusa —,
//       além do contrato antigo (`skipped: true` e o motivo escrito). CR5-01: `skipped`
//       designava DUAS coisas incompatíveis, o retorno deste guard e o CONTADOR
//       `results.skipped` da rodada, e o único consumidor do disparo manual (`sendNow`, em
//       frontend/src/components/Dashboard.jsx) ramificava por ela — uma rodada que CONCLUIU
//       com um negócio pulado era lida como recusa e virava erro sem texto na tela. O par
//       negativo deste caso é o cenário K de scheduler.categoriaIndecidivel.test.js.
//
// REL-03 (D-04): somente caracterização, nenhuma mudança de comportamento. Fecha a
// lacuna de 10,65% de cobertura de scheduler.js — o arquivo que os planos 04-02 e 04-06
// vão alterar. Se o lock vazasse, o guard `if (isRunning)` recusaria TODA execução seguinte e o
// sistema pararia de notificar EM SILÊNCIO: é essa classe de falha que estes testes
// existem para deixar vermelha no CI.
//
// Por que a borda que falha aqui é `/users` e não `/tasks`: hoje getDealsWithFutureTasks
// engole erros (o catch do laço de páginas em agendor.js) e o plano 04-02 muda exatamente
// esse caminho.
// Falhando por `/users` — que getUsers propaga sem catch — estes 5 cenários seguem
// válidos e verdes depois do fail-safe do 04-02.

const { makeTmpDbPath } = require('./helpers/tmpDb');

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
// `links` sem `next` encerra a paginação de getUsers (agendor.js) na primeira volta.
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

// ── Controles mutáveis da borda /users ───────────────────────────
// O stub NUNCA é reinstalado entre casos: o routeHandler ramifica por estas variáveis
// de módulo. Reinstalar mock.method(axios,'create') depois do require de agendor.js não
// teria efeito algum — a instância `api` já foi criada no load.
let usuariosDevemFalhar = false;
let usuariosPendentes = null; // promise controlada pelo teste de concorrência
let liberarUsuarios = null;

// Erro de borda realista: é a forma exata com que o axios reporta um timeout de client.
function erroDeBorda() {
  return Object.assign(new Error('timeout of 15000ms exceeded'), {
    code: 'ECONNABORTED',
  });
}

// Suspende /users numa promise pendente; só resolve quando o teste chamar liberarUsuarios().
function suspenderUsuarios() {
  usuariosPendentes = new Promise((resolve) => {
    liberarUsuarios = () => {
      usuariosPendentes = null;
      liberarUsuarios = null;
      resolve({ data: USUARIOS });
    };
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
    // Nenhuma tarefa futura: nenhum deal é "protegido", o fluxo segue para o envio.
    return { data: { data: [] } };
  }
  if (url === '/users') {
    if (usuariosPendentes) return usuariosPendentes;
    if (usuariosDevemFalhar) return Promise.reject(erroDeBorda());
    return { data: USUARIOS };
  }
  return { data: { data: [] } };
});

// Borda SMTP stubada: pode ser instalada antes do require porque emailer.js só chama
// createTransport() dentro de createTransporter(), no momento do envio.
// PC-13: nada aqui é asserido nem impresso — o objeto de opções carrega auth.pass.
mock.method(nodemailer, 'createTransport', () => ({
  verify: async () => true,
  sendMail: async () => ({}),
}));

// require do db e do scheduler DEPOIS de DB_PATH e do stub de axios.
// `runWeeklySummary` vem do seam aditivo de scheduler.js (module.exports.runWeeklySummary):
// em produção ela só é alcançada pelo cron, e o cenário (5) precisa chamá-la direto.
const db = require('../src/db');
const { runCheck, runWeeklySummary, getStatus } = require('../src/scheduler');

before(() => {
  // Só 'Date': habilitar 'setTimeout' congelaria a espera entre lotes de páginas
  // (o setTimeout entre batches de getStaleDeals, em agendor.js). Com totalCount = 10 não há
  // segunda página, então nada espera.
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

test('(1) falha na borda HTTP durante runCheck é registrada em results.error e NÃO é relançada', async () => {
  usuariosDevemFalhar = true;

  // Se o catch externo de runCheck (scheduler.js) sumisse, esta linha rejeitaria e o teste
  // quebraria:
  // é exatamente o await "nu" que prova a não-propagação.
  const r = await runCheck();

  assert.equal(
    typeof r.error,
    'string',
    'a falha da borda deve virar uma string em results.error',
  );
  assert.ok(r.error.length > 0, 'results.error não pode ser string vazia');
  assert.match(
    r.error,
    /timeout of 15000ms exceeded/,
    'results.error deve carregar a mensagem do erro injetado em /users',
  );
});

test('(2) o lock isRunning é liberado mesmo quando a execução falha', async () => {
  usuariosDevemFalhar = true;
  await runCheck();

  // Pina o `finally` do try principal de runCheck (scheduler.js). Um lock vazado não derruba
  // nada —
  // faz o sistema parar de notificar em silêncio, que é o pior modo de falha daqui.
  assert.equal(
    getStatus().isRunning,
    false,
    'isRunning deve voltar a false após uma execução que falhou',
  );
});

test('(3) a execução seguinte a uma falha roda normalmente (o guard de :27 não recusa)', async () => {
  // Primeiro deixa uma falha para trás, depois cura a borda.
  usuariosDevemFalhar = true;
  await runCheck();
  usuariosDevemFalhar = false;

  const r = await runCheck();

  // O guard `if (isRunning)` do topo de runCheck devolve
  // { skipped: true, reason: 'Verificação já em andamento' }.
  // Uma execução REAL devolve o objeto results completo, em que `skipped` é a CONTAGEM
  // de deals pulados (número, inicializado em 0 no literal `results` de runCheck) e `reason`
  // nunca existe.
  // Por isso a prova de "não foi recusada" é `reason === undefined`, não `skipped`.
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
    'com a borda sã, results.error não é definido',
  );
  // A rodada realmente andou: os dois deals do golden ([101, 103]) foram processados.
  assert.equal(
    r.checked,
    2,
    'os dois deals stale da fixture devem ter sido checados',
  );
  assert.equal(
    typeof r.ranAt,
    'string',
    'ranAt só é gravado quando a rodada completa',
  );
});

test('(4) chamada concorrente devolve { skipped: true } sem executar', async () => {
  // Estado neutro esperado por este caso: a borda responde, mas /users fica PENDENTE
  // até liberarUsuarios(). É esse pendurado que mantém a primeira execução em voo.
  usuariosDevemFalhar = false;
  suspenderUsuarios();

  // Sem `await`: runCheck() roda sincronamente até o primeiro await, e nesse trecho já
  // executou `isRunning = true` (a instrução logo após o guard, em scheduler.js). É a janela
  // que o guard protege.
  const emAndamento = runCheck();

  const concorrente = await runCheck();
  assert.equal(
    concorrente.skipped,
    true,
    'a segunda chamada deve ser recusada pelo guard de scheduler.js:27',
  );
  assert.equal(
    concorrente.reason,
    'Verificação já em andamento',
    'o motivo da recusa é literal e faz parte do contrato observado hoje',
  );

  // Libera a borda e AGUARDA a primeira execução: sem isto o arquivo terminaria com
  // uma promessa pendurada (e a rodada gravando no banco já fechado pelo `after`).
  liberarUsuarios();
  await emAndamento;

  assert.equal(
    getStatus().isRunning,
    false,
    'terminada a primeira execução, o lock volta a false',
  );
});

test('(5) runWeeklySummary resolve sem lançar quando a borda falha', async () => {
  // Reafirma o estado neutro que este caso espera (o cenário 4 deixou a borda sã).
  usuariosDevemFalhar = true;

  // Pina o catch que fecha o corpo de runWeeklySummary (scheduler.js): registra o erro e NÃO
  // relança. Note que
  // runWeeklySummary NÃO tem lock `isRunning` — é o comportamento ATUAL, deliberadamente
  // pinado como está; nada aqui pede que ela ganhe um.
  await assert.doesNotReject(
    () => runWeeklySummary(),
    'uma falha de borda no resumo semanal não pode escapar para o cron',
  );

  // `assert.doesNotReject` sozinho é insuficiente (WR-05): runWeeklySummary tem um
  // early-return (`if (!notificationsEnabled) return;`, em runWeeklySummary) ANTES do
  // Promise.all que falha. Qualquer coisa que faça a função sair cedo mantém o caso
  // verde sem NUNCA tocar o catch que ele afirma pinar. A asserção abaixo prova que a
  // execução passou do early-return e chegou à borda: o `beforeEach` deste arquivo zera
  // fake.get.mock.calls, então a contagem é local a este caso.
  assert.ok(
    fake.get.mock.calls.some((c) => c.arguments[0] === '/users'),
    'pré-condição: a falha da borda precisa ter sido ALCANÇADA — sem isto o caso passaria por ausência de exceção, inclusive numa regressão real como o seed de notifications_enabled virar "false" e a função sair no early-return',
  );

  usuariosDevemFalhar = false;
});

// ── (6) CR5-01: a recusa do lock precisa continuar FALANDO ───────
//
// O caso (4) acima pina o contrato ANTIGO da recusa e fica byte a byte DE PROPÓSITO: é o
// contraste entre os dois casos que documenta a compatibilidade. Aqui o que se mede é a chave
// PRÓPRIA da recusa, `execucaoIgnorada`, que existe porque `skipped` significava duas coisas
// incompatíveis no MESMO payload — o booleano deste guard e o contador `results.skipped`, que
// quatro causas incrementam (dedup do dia, categoria indecidível, funil e "sem destinatário").
//
// As três chaves são asseridas JUNTAS de propósito. Sem `execucaoIgnorada`, o consumidor não
// consegue separar recusa de rodada concluída; sem `reason`, a recusa volta a renderizar um
// toast vazio; e sem `skipped: true` um consumidor não medido do payload quebraria em silêncio,
// que é o custo de "limpar" o contrato em vez de acrescentar a ele.
//
// A armação de concorrência duplica ~6 linhas do caso (4) DE PROPÓSITO: reaproveitá-la exigiria
// extrair um helper e editar o caso (4), que é caracterização golden e precisa ficar intocado.
test('(6) a chamada recusada pelo lock traz `execucaoIgnorada` E o motivo escrito, sem perder o contrato antigo', async () => {
  // Estado neutro esperado por este caso: a borda responde, mas /users fica PENDENTE até
  // liberarUsuarios(). É esse pendurado que mantém a primeira execução em voo.
  usuariosDevemFalhar = false;
  suspenderUsuarios();

  // Sem `await`: runCheck() roda sincronamente até o primeiro await, e nesse trecho já executou
  // `isRunning = true` (a instrução logo após o guard do topo de runCheck). É a janela do lock.
  const emAndamento = runCheck();

  const concorrente = await runCheck();

  // (a) A CHAVE NOVA — é aqui que o achado fica vermelho. Ela só pode existir no caminho de
  // recusa; o cenário K do outro oráculo prova o lado negativo.
  assert.equal(
    concorrente.execucaoIgnorada,
    true,
    'a recusa precisa de uma chave PRÓPRIA: o consumidor não tem informação para distinguir o booleano da recusa do contador de negócios pulados',
  );

  // (b) O motivo escrito continua no payload — é ele que o consumidor exibe. Asserido por FORMA
  // (string não vazia) e não pelo literal, para não duplicar aqui o texto que o caso (4) pina.
  assert.equal(
    typeof concorrente.reason === 'string' && concorrente.reason.length > 0,
    true,
    'a recusa continua carregando motivo escrito: um erro sem texto é o defeito que este caso existe para impedir',
  );

  // (c) O contrato ANTIGO fica de pé. Remover `skipped: true` a título de limpeza quebraria
  // consumidor não medido do payload — por isso ele é asserido ao lado da chave nova.
  assert.equal(
    concorrente.skipped,
    true,
    '`skipped: true` permanece por compatibilidade — a chave nova é ADITIVA, não substituta',
  );

  // (d) E a recusa não executou rodada nenhuma: nenhum campo do literal `results` veio junto.
  assert.equal(
    concorrente.stale,
    undefined,
    'a recusa não roda a verificação: nenhum campo do resultado da rodada pode vir no payload',
  );

  // Libera a borda e AGUARDA a primeira execução: sem isto o arquivo terminaria com uma promessa
  // pendurada (e a rodada gravando no banco já fechado pelo `after`).
  liberarUsuarios();
  await emAndamento;

  assert.equal(
    getStatus().isRunning,
    false,
    'terminada a primeira execução, o lock volta a false',
  );
});
