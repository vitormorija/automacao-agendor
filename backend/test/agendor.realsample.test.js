// Smoke de REALISMO (D-10): alimenta a amostra de deals reais ANONIMIZADA através
// do getStaleDeals real (via stub axios). Não é um golden de ids — apenas garante
// que a forma real dos dados atravessa o pipeline sem lançar exceção.
//
// A fixture backend/test/fixtures/real-deals.sample.json permanece UNTRACKED até a
// aprovação humana (Task 4). Este teste a lê localmente do disco.
require('./setup');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');

const realSample = require('./fixtures/real-deals.sample.json');

installFakeAxios((url) => {
  if (url === '/deals') {
    return { data: { data: realSample, meta: { totalCount: realSample.length }, links: {} } };
  }
  if (url.startsWith('/organizations/')) {
    // Categoria genérica não-excluída para o smoke de realismo.
    return { data: { data: { category: { name: 'Lead' } } } };
  }
  return { data: { data: [] } };
});

const { getStaleDeals } = require('../src/agendor');

test('getStaleDeals: amostra real anonimizada atravessa o pipeline sem lançar (smoke de realismo)', async () => {
  const result = await getStaleDeals(15);
  assert.ok(Array.isArray(result));
});
