// Helper de teste (NÃO define testes) — instala um stub da instância axios que
// agendor.js cria no load do módulo. Padrão D-05: mockar a borda HTTP (axios) sem
// tocar na lógica interna de getStaleDeals. Precisa ser instalado ANTES do primeiro
// require('../src/agendor'), pois agendor.js faz `const api = axios.create(...)` no load.
const { mock } = require('node:test');
const axios = require('axios');

// routeHandler(url, config) => payload no formato do axios: { data: <envelope Agendor> }
function installFakeAxios(routeHandler) {
  const fakeInstance = {
    get: mock.fn(async (url, config) => routeHandler(url, config)),
  };
  mock.method(axios, 'create', () => fakeInstance);
  return fakeInstance;
}

module.exports = { installFakeAxios };
