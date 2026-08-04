// Helper de teste (NÃO define testes) — instala um stub da instância axios que
// agendor.js cria no load do módulo. Padrão D-05: mockar a borda HTTP (axios) sem
// tocar na lógica interna de getStaleDeals. Precisa ser instalado ANTES do primeiro
// require('../src/agendor'), pois agendor.js faz `const api = axios.create(...)` no load.
const { mock } = require('node:test');
const axios = require('axios');

// routeHandler(url, config) => payload no formato do axios: { data: <envelope Agendor> }
//
// Extensão aditiva (04-03 / REL-01): além de `get`, o objeto devolvido expõe
// `createArgs` — o objeto de configuração que agendor.js entregou a `axios.create(...)`.
// Ele existe porque a prova de REL-01 é sobre a CONFIGURAÇÃO da instância (`timeout:
// 15000`), não sobre esperar um timeout real acontecer: inspecionar os argumentos da
// fábrica é determinístico e sub-segundo, enquanto provocar um timeout de verdade exigiria
// rede ou relógio falso (RESEARCH Pitfall 1). A chave `get` continua idêntica — três
// arquivos de teste já consomem o retorno como `fake.get.mock`, então qualquer mudança aqui
// só pode ACRESCENTAR propriedades, nunca trocar o formato.
function installFakeAxios(routeHandler) {
  const fakeInstance = {
    get: mock.fn(async (url, config) => routeHandler(url, config)),
    // null até o primeiro axios.create(); guarda o 1º argumento da chamada mais recente.
    createArgs: null,
  };
  mock.method(axios, 'create', (config) => {
    fakeInstance.createArgs = config;
    return fakeInstance;
  });
  return fakeInstance;
}

module.exports = { installFakeAxios };
