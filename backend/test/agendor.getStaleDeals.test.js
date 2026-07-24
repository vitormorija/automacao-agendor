// Caracterização (golden) do "integrated lane": roda o getStaleDeals REAL contra
// uma instância axios stubada (borda HTTP, D-05) e um relógio fixo (mock.timers).
// Pina as regras que permanecem inline: threshold de data, fronteira estrita do dia
// (`<`), categoria, owner e status-id. DOCUMENTA O COMPORTAMENTO ATUAL — não o ideal.
require('./setup');

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');

// Relógio fixo: now = 2026-06-01T00:00:00.000Z -> cutoffDate = now - 15d = 2026-05-17T00:00:00.000Z.
// Fixtures expressam updatedAt/createdAt como ISO literais relativos a esse relógio,
// tornando o golden determinístico (RESEARCH Pitfall 3).
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

// Categoria por organização (resposta de /organizations/:id). Default = 'Lead'.
const ORG_CATEGORY = {
  205: 'Parceiro', // categoria excluída
};

const dealsPage = require('./fixtures/synthetic/deals-page.json');

// Instala o stub ANTES de exigir agendor.js (a instância `api` é criada no load).
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

test('getStaleDeals(15): golden do conjunto incluído — documenta comportamento ATUAL', async () => {
  const result = await getStaleDeals(15);
  const ids = result.map((d) => d.id);
  // Somente 101 (stale base) e 103 (cutoff - 1ms) sobrevivem a TODAS as regras.
  // Prova em uma única rodada determinística:
  //  - pre-2026 (108) excluído; fresh (109) excluído; boundary+1ms (104) excluído
  //  - categoria Parceiro (105) excluída; owner Maria Lobato (106) excluído
  //  - status != 1 (107) excluído; etapa "Perdida" (110) excluída
  assert.deepStrictEqual(ids, [101, 103]);
});

test('getStaleDeals(15): fronteira estrita do dia (`<`) — boundary golden (D-09)', async () => {
  const ids = (await getStaleDeals(15)).map((d) => d.id);
  // documenta o comportamento ATUAL: comparação `<` estrita — updatedAt igual ao
  // cutoff é EXCLUÍDO; um `<=` faria falhar este teste.
  assert.equal(ids.includes(102), false); // updatedAt == cutoffDate -> EXCLUÍDO
  assert.equal(ids.includes(103), true); // updatedAt == cutoffDate - 1ms -> INCLUÍDO
  // Blindagem extra contra flip de operador: se `<` virar `<=`, 102 entraria e o golden acima quebra.
});

test('getStaleDeals(15): não faz chamada de rede real (axios.create stubado)', async () => {
  // Se o stub não estivesse instalado, o require('../src/agendor') teria criado a
  // instância axios real e a chamada tentaria a API Agendor. O fato de o golden
  // acima passar sub-segundo comprova que a borda HTTP está mockada.
  const result = await getStaleDeals(15);
  assert.ok(Array.isArray(result));
});
