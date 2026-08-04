// Prova de invalidação do orgCategoryCache (REL-04 / Decisão D-05): roda o getStaleDeals
// REAL contra a borda HTTP stubada e um relógio fixo. Mede três coisas que o cache de
// módulo de agendor.js hoje NÃO garante:
//   (1) uma recategorização feita no Agendor vale já na execução SEGUINTE — hoje o valor
//       fica no cache até o processo reiniciar, então uma organização recategorizada para
//       'Parceiro' continua sendo notificada indefinidamente;
//   (2) dentro de UMA execução cada organização única é consultada exatamente uma vez —
//       a invalidação não pode custar uma chamada por deal;
//   (3) o `null` que o catch de getOrgCategory (agendor.js:56-59) grava quando a consulta
//       falha não contamina as rodadas seguintes — hoje um erro transitório de UMA consulta
//       apaga a categoria daquela organização para todas as rodadas do processo.
//
// Por que a invalidação DELETA AS CHAVES e não reatribui o objeto: getOrgCategory
// (agendor.js:50) é o único leitor e o único escritor do dicionário, e fecha sobre a MESMA
// referência — reatribuir deixaria a limpeza escrevendo num objeto novo enquanto
// getOrgCategory segue lendo o antigo, e a invalidação não aconteceria.
//
// ESCOPO DESTE ARQUIVO: exclusivamente o refetch ENTRE execuções SEQUENCIAIS. Os três
// cenários abaixo rodam getStaleDeals uma execução por vez e nada afirmam sobre execuções
// sobrepostas — essa garantia mora em agendor.cacheConcurrency.test.js (CR-01), que pina o
// fato de o laço de enriquecimento consumir um mapa LOCAL à execução em vez de reler o
// dicionário de módulo. O detector do afrouxamento da exclusão por categoria continua sendo
// o golden `[101, 103]` de agendor.getStaleDeals.test.js:61 — este arquivo não o substitui,
// soma-se a ele.
require('./setup');

const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');

// Relógio fixo: now = 2026-06-01T00:00:00.000Z -> cutoffDate = now - 15d = 2026-05-17T00:00:00.000Z.
// Mesmo instante do golden de agendor.getStaleDeals.test.js:14, para que a fixture
// compartilhada signifique exatamente a mesma coisa nos dois arquivos.
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

// Categoria por organização (resposta de /organizations/:id). Default = 'Lead'.
// É um dicionário MUTÁVEL de módulo de propósito: os cenários de recategorização mudam uma
// entrada entre duas execuções em vez de reinstalar o stub (RESEARCH §Pitfall 4 — o
// routeHandler é uma função, então a ramificação mora DENTRO dela).
const ORG_CATEGORY = {
  205: 'Parceiro', // categoria excluída
  305: 'Parceiro', // organização do deal sintético do cenário (3), também excluída
};

const dealsPage = require('./fixtures/synthetic/deals-page.json');

// Deal sintético usado SOMENTE pelo cenário (3). Existe porque o cenário precisa de uma
// organização que ainda não esteja no cache quando o erro é injetado — todas as 6
// organizações da fixture já foram consultadas pelos cenários anteriores, e no estado SEM
// invalidação uma consulta cacheada nem chega a ser tentada (logo, nem chega a falhar).
// Clone do molde 105 da fixture: stale sob FIXED_NOW, status 1, etapa benigna, owner válido.
const DEAL_ORG_QUE_FALHA = {
  id: 305,
  title:
    'Sintetico do cenario (3): categoria excluida cuja consulta falha na 1a execucao',
  createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  owner: { id: 15, name: 'Ana Vendas' },
  author: { id: 25, name: 'Ana Vendas' },
  organization: { id: 305, name: 'Org 305' },
  dealStatus: { id: 1 },
  dealStage: { name: 'Negociação', funnel: { name: 'Comercial' } },
  _webUrl: 'https://web.agendor.com.br/deal/305',
};

// Estado mutável lido DENTRO do routeHandler (nunca reinstalar o stub — Pitfall 4).
let dealsServidos = dealsPage;
let orgQueFalha = null;

// Instala o stub ANTES de exigir agendor.js (a instância `api` é criada no load).
const fake = installFakeAxios((url) => {
  if (url === '/deals') {
    return {
      data: {
        data: dealsServidos,
        meta: { totalCount: dealsServidos.length },
        links: {},
      },
    };
  }
  if (url.startsWith('/organizations/')) {
    const id = Number(url.split('/').pop());
    // Erro transitório injetado por organização: é o que faz getOrgCategory cair no catch
    // e cachear `null`. Um Error simples basta — getOrgCategory engole qualquer falha.
    if (id === orgQueFalha) {
      throw new Error(`Falha transitoria simulada em /organizations/${id}`);
    }
    return {
      data: { data: { category: { name: ORG_CATEGORY[id] || 'Lead' } } },
    };
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

// Zera o contador antes de cada caso para que a contagem do cenário (2) reflita UMA única
// execução de getStaleDeals (o mock.fn acumula) — padrão de agendor.futureTasks.test.js:81-83.
beforeEach(() => {
  fake.get.mock.resetCalls();
});

// ── Organizações consultadas por execução ────────────────────────────────────────────
// Golden derivado da fixture sob FIXED_NOW: as organizações dos 6 deals que sobrevivem ao
// filtro de data (createdAt >= 2026-01-01 e updatedAt < cutoff). A consulta de categoria
// acontece ANTES das exclusões por categoria/owner/status/etapa, então 205 (Parceiro),
// 206 (owner excluído), 207 (status 3) e 210 (etapa "Perdida") também são consultadas.
const ORGS_DOS_DEALS_STALE = [201, 203, 205, 206, 207, 210];

// A ORDEM DE DECLARAÇÃO DOS CASOS É PARTE DO TESTE. O cenário (2) mede o número de
// consultas de uma execução e por isso precisa do cache FRIO — no estado sem invalidação
// (RED) qualquer caso anterior já teria populado o cache e a contagem cairia para zero,
// transformando um caso que deve passar em falha por contaminação. Por isso ele vem
// primeiro. Em GREEN a ordem é indiferente, já que cada execução começa limpando o cache.

test('cenário (2): dentro de UMA execução, cada organização única é consultada exatamente uma vez', async () => {
  fake.get.mock.resetCalls();
  await getStaleDeals(15);

  const urlsDeOrganizacao = fake.get.mock.calls
    .map((c) => c.arguments[0])
    .filter((url) => url.startsWith('/organizations/'));

  // Contado, não inferido: se a invalidação por execução fosse implementada como uma
  // limpeza DENTRO do laço de enriquecimento (ou se o Promise.all de agendor.js:187
  // deixasse de deduplicar), o número saltaria para uma chamada por deal stale.
  assert.equal(urlsDeOrganizacao.length, ORGS_DOS_DEALS_STALE.length);

  // Nenhuma url de organização repetida na mesma execução.
  assert.equal(
    urlsDeOrganizacao.length,
    new Set(urlsDeOrganizacao).size,
    'houve consulta repetida da mesma organização dentro de uma única execução',
  );

  const idsConsultados = urlsDeOrganizacao
    .map((url) => Number(url.split('/').pop()))
    .sort((a, b) => a - b);
  assert.deepStrictEqual(idsConsultados, ORGS_DOS_DEALS_STALE);
});

test('cenário (3): `null` cacheado por erro transitório não contamina a execução seguinte', async () => {
  dealsServidos = [...dealsPage, DEAL_ORG_QUE_FALHA];
  orgQueFalha = 305;

  // 1ª execução: a consulta de /organizations/305 falha. getOrgCategory engole o erro e
  // grava `null`; `null` não está em EXCLUDED_CATEGORIES, então uma organização que É
  // 'Parceiro' passa pelo filtro e o deal entra na lista de notificação. Isto documenta o
  // comportamento ATUAL do caminho de erro — vale nos dois estados, antes e depois da
  // correção, e é o que dá sentido à asserção da 2ª execução.
  const idsComFalha = (await getStaleDeals(15)).map((d) => d.id);
  assert.equal(idsComFalha.includes(305), true);

  // 2ª execução: a API volta a responder normalmente. Sem invalidação, o `null` do erro
  // continua no cache e a organização 'Parceiro' segue sendo notificada — todas as rodadas
  // seguintes do processo, não só a próxima.
  orgQueFalha = null;
  const idsAposRecuperacao = (await getStaleDeals(15)).map((d) => d.id);
  assert.equal(
    idsAposRecuperacao.includes(305),
    false,
    'o null cacheado pelo catch de getOrgCategory sobreviveu à execução em que foi gravado',
  );

  dealsServidos = dealsPage;
});

test('cenário (1): recategorização no Agendor vale já na execução seguinte', async () => {
  // 1ª execução com a organização 201 na sua categoria de origem ('Lead', o default do stub).
  const idsAntes = (await getStaleDeals(15)).map((d) => d.id);
  assert.equal(idsAntes.includes(101), true);
  assert.equal(idsAntes.includes(103), true);

  // O operador recategoriza a organização 201 para 'Parceiro' no Agendor.
  ORG_CATEGORY[201] = 'Parceiro';

  // 2ª execução: sem invalidação, esta rodada leria a categoria antiga do cache de módulo e
  // continuaria notificando uma organização já recategorizada — até o próximo restart do
  // processo, que em produção (PM2, single-instance) pode não acontecer por semanas.
  const idsDepois = (await getStaleDeals(15)).map((d) => d.id);
  assert.equal(
    idsDepois.includes(101),
    false,
    'a 2ª execução serviu a categoria obsoleta do cache em vez de reconsultar o Agendor',
  );
  // Não-regressão: a limpeza não pode derrubar quem continua elegível.
  assert.equal(idsDepois.includes(103), true);

  delete ORG_CATEGORY[201];
});
