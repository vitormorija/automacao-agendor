// Prova determinística da corrida do orgCategoryCache (CR-01 / WR-06): a decisão de exclusão
// por CATEGORIA não pode depender de estado de módulo compartilhado entre duas execuções
// SOBREPOSTAS de getStaleDeals — e sobreposição não é hipótese, é o dia a dia: a função tem 8
// call-sites sem lock comum (cron das 8h em scheduler.js, runWeeklySummary, runCheckOnly, três
// pontos de routes/notifications.js, routes/reports.js e routes/deals.js), então basta o cron
// rodar enquanto alguém abre o dashboard.
//
// O interleaving que quebra a regra: a execução A popula o cache, a execução B começa e APAGA
// as chaves (a limpeza de REL-04 é a primeira instrução), e o laço síncrono de A então lê
// `undefined` → `?? null` → `EXCLUDED_CATEGORIES.includes(null)` é `false` → uma organização
// 'Parceiro' entra na lista de notificação. Este arquivo pina o oposto: AMBAS as execuções
// devolvem o golden [101, 103], em qualquer entrelaçamento.
//
// Determinismo vem de DOIS pontos de suspensão controlados no stub (a organização 210 na
// execução A e a organização 205 na execução B), nunca de temporização — um teste de
// concorrência intermitente é pior que nenhum, porque dá falsa confiança.
require('./setup');

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');

// Relógio fixo: now = 2026-06-01T00:00:00.000Z -> cutoffDate = now - 15d = 2026-05-17T00:00:00.000Z.
// Mesmo instante do golden de agendor.getStaleDeals.test.js:14, para que a fixture compartilhada
// signifique exatamente a mesma coisa nos dois arquivos.
//
// Só o relógio é mockado. Os temporizadores NÃO são: a fixture tem 10 deals numa página única,
// então nada dorme dentro de getStaleDeals — mockar a espera entre lotes (agendor.js:196-197)
// não compraria nada e ainda congelaria o setImmediate real de que cederEventLoop depende.
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

// Categoria por organização (resposta de /organizations/:id). Default = 'Lead'.
const ORG_CATEGORY = {
  205: 'Parceiro', // categoria excluída — a única exclusão por categoria do golden
};

const dealsPage = require('./fixtures/synthetic/deals-page.json');

function respostaDaOrganizacao(id) {
  return { data: { data: { category: { name: ORG_CATEGORY[id] || 'Lead' } } } };
}

// Estado mutável lido DENTRO do routeHandler. O stub é instalado UMA única vez, antes do
// require de agendor.js (a instância `api` nasce no load), então toda ramificação mora aqui.
let liberar210 = null;
let liberar205DaExecucaoB = null;
let chamadas205 = 0;

installFakeAxios((url) => {
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

    // Ponto de suspensão 1 — a execução A trava aqui. A organização 210 é a escolha certa
    // porque o deal 110 já é excluído pela etapa "Oportunidade Perdida": suspendê-la controla
    // o tempo sem mexer no resultado esperado de nenhuma das execuções.
    if (id === 210 && liberar210 === null) {
      return new Promise((resolve) => {
        liberar210 = () => resolve(respostaDaOrganizacao(210));
      });
    }

    if (id === 205) {
      chamadas205 += 1;
      // Ponto de suspensão 2 — a SEGUNDA consulta de 205 é a da execução B. Mantê-la pendente
      // é o que impede B de repopular orgCategoryCache[205] antes de A ler. Sem isto o
      // resultado dependeria da ordem das microtasks e o teste seria intermitente.
      if (chamadas205 === 2) {
        return new Promise((resolve) => {
          liberar205DaExecucaoB = () => resolve(respostaDaOrganizacao(205));
        });
      }
    }

    return respostaDaOrganizacao(id);
  }

  return { data: { data: [] } };
});

const { getStaleDeals } = require('../src/agendor');

before(() => {
  mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
});

after(() => {
  mock.timers.reset();
});

// Um turno de setImmediate drena TODA a fila de microtasks: os temporizadores são reais (só o
// relógio está mockado), e o callback da fase de check só roda depois de a fila de microtasks
// esvaziar. É isso que torna o passo (2) do cenário um FATO — a execução A terá avançado até o
// seu ponto de suspensão — e não uma aposta de temporização.
async function cederEventLoop() {
  await new Promise((r) => setImmediate(r));
}

// Falha explícita em vez de travar a suíte, no mesmo espírito de avancarRelogioAte
// (emailer.timeout.test.js:98-113).
async function esperarAte(condicao, descricao) {
  for (let i = 0; i < 20 && !condicao(); i++) {
    await cederEventLoop();
  }
  if (!condicao()) throw new Error(descricao);
}

test('duas execuções SOBREPOSTAS: a organização "Parceiro" não entra em nenhuma das listas (CR-01)', async () => {
  // (1) A execução A começa e não é aguardada.
  const execucaoA = getStaleDeals(15);

  // (2) Um turno de event loop: A resolve /deals, filtra, dispara o Promise.all das 6
  // organizações; 201/203/205/206/207 respondem e GRAVAM no orgCategoryCache; 210 fica
  // pendente e A trava ali, com o cache já populado.
  await cederEventLoop();

  // (3) Pré-condições: sem elas o caso não diz nada — um cenário concorrente que na verdade
  // rodou sequencial passaria em silêncio.
  assert.equal(
    chamadas205,
    1,
    'pré-condição: a execução A já consultou /organizations/205',
  );
  assert.notEqual(
    liberar210,
    null,
    'pré-condição: a execução A está suspensa em /organizations/210',
  );

  // (4) A execução B começa. Sua PRIMEIRA instrução apaga as chaves do orgCategoryCache —
  // inclusive a 205 que A acabou de gravar e ainda não leu.
  const execucaoB = getStaleDeals(15);

  // (5) A é liberada e roda o laço de enriquecimento síncrono.
  liberar210();

  // (6) O que A decidiu tem de valer o golden: a categoria que A consultou não pode ter sido
  // apagada por B no meio do caminho.
  const idsA = (await execucaoA).map((d) => d.id);
  assert.equal(
    idsA.includes(105),
    false,
    'organização 205 = "Parceiro": o deal 105 não pode ser notificado',
  );
  assert.deepStrictEqual(idsA, [101, 103]);

  // (7) Agora B pode terminar.
  await esperarAte(
    () => liberar205DaExecucaoB !== null,
    'a execução B não chegou a consultar /organizations/205',
  );
  liberar205DaExecucaoB();

  // (8) E B também tem de devolver o golden — a asserção cobre as DUAS execuções, não só a
  // que termina por último.
  const idsB = (await execucaoB).map((d) => d.id);
  assert.equal(
    idsB.includes(105),
    false,
    'organização 205 = "Parceiro": o deal 105 não pode ser notificado',
  );
  assert.deepStrictEqual(idsB, [101, 103]);
});

test('depois do entrelaçamento, uma execução sequencial continua devolvendo o golden', async () => {
  // O cruzamento não pode ter deixado o dicionário de módulo em estado ruim para as rodadas
  // seguintes — inclusive a limpeza por execução de REL-04 continua valendo.
  const ids = (await getStaleDeals(15)).map((d) => d.id);
  assert.deepStrictEqual(ids, [101, 103]);
});
