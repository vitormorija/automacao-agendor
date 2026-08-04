// Teste do NOVO comportamento (NÃO é caracterização): fixa REL-01 / Decisão D-01 —
// TODA chamada HTTP à API Agendor passa por UMA instância axios com teto de tempo de 15s.
//
// Por que isto é confiabilidade e não detalhe de configuração: sem `timeout`, o axios espera
// INDEFINIDAMENTE. Uma API lenta (não caída — lenta) trava o cron das 8h dentro do
// `Promise.all` de scheduler.js:54-58, e o modo de falha resultante é "parar de notificar em
// silêncio", exatamente a classe de regressão que o Core Value do milestone existe para
// impedir. Com o fail-safe do 04-02 já no lugar, a lentidão vira falha explícita e registrada.
//
// Os 5 cenários:
//   (1) a instância nasce com `timeout: 15000` E o resto da configuração intocado (baseURL/header)
//   (2) getDealById(555) chama pela INSTÂNCIA (url relativa `/deals/555`) — e a asserção
//       NEGATIVA correspondente: o `axios.get` global (o ponto órfão de
//       routes/notifications.js:220) não é usado por ninguém aqui
//   (3) getDealById desembrulha o envelope Agendor (`data.data`) e devolve null se vier vazio
//   (4) getDealById PROPAGA a falha — ao contrário de getOrgCategory (agendor.js:35-47), que
//       engole. Quem absorve é o catch POR ITEM da rota /resolved, que permanece
//   (5) caracterização de borda: um erro de timeout (code ECONNABORTED, SEM err.response) NÃO
//       é retentado como 429 por fetchDealsPage — propaga na 1ª tentativa
//
// Nota de método (RESEARCH Pitfall 1): a prova do timeout inspeciona os argumentos entregues a
// `axios.create`, em vez de esperar um timeout real. Esperar de verdade exigiria rede ou
// relógio falso, seria lento e frágil; e o código de erro do axios num timeout de client é
// ECONNABORTED (não ETIMEDOUT), porque `transitional.clarifyTimeoutError` é false por padrão.
require('./setup');

const { test, beforeEach, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { installFakeAxios } = require('./helpers/fakeAxios');

// ── Controle mutável das bordas ──────────────────────────────────
// O stub NUNCA é reinstalado entre casos: o routeHandler ramifica por estas variáveis de
// módulo. Reinstalar mock.method(axios,'create') depois do require de agendor.js não teria
// efeito nenhum — a instância `api` já foi criada no load do módulo.
let envelopeDoDeal = {
  data: { data: { id: 555, title: 'Negócio 555', dealStatus: { id: 2 } } },
};
let dealByIdDeveFalhar = false;
let dealsDeveFalhar = false;

// Erro fiel ao que o axios produz num timeout de client: ECONNABORTED e, o que importa para o
// cenário (5), SEM `response` — é a ausência de `err.response` que faz o retry de 429 de
// fetchDealsPage (agendor.js:109) não reconhecer o caso e propagar.
function erroDeTimeout() {
  return Object.assign(new Error('timeout of 15000ms exceeded'), {
    code: 'ECONNABORTED',
  });
}

// Instala o stub ANTES de exigir agendor.js (a instância `api` nasce no load do módulo).
const fake = installFakeAxios((url) => {
  if (url.startsWith('/deals/')) {
    if (dealByIdDeveFalhar) return Promise.reject(erroDeTimeout());
    return envelopeDoDeal;
  }
  if (url === '/deals') {
    if (dealsDeveFalhar) return Promise.reject(erroDeTimeout());
    return { data: { data: [], meta: { totalCount: 0 }, links: {} } };
  }
  return { data: { data: [] } };
});

// Espião do `axios.get` GLOBAL (o método de módulo, não o da instância). Ele é o caminho que
// routes/notifications.js:220 usava e que este plano elimina: nada em agendor.js pode usá-lo,
// porque uma chamada por ali NÃO herdaria baseURL, header nem — o ponto do plano — o timeout.
const axiosGetGlobal = mock.method(axios, 'get', async () => {
  throw new Error(
    'axios.get global foi chamado: a requisição escapou da instância compartilhada',
  );
});

const { getDealById, getStaleDeals } = require('../src/agendor');

after(() => {
  mock.restoreAll();
});

// O mock.fn acumula chamadas entre casos; zerar mantém cada asserção de contagem local.
beforeEach(() => {
  fake.get.mock.resetCalls();
  axiosGetGlobal.mock.resetCalls();
});

test('(1) a instância compartilhada nasce com timeout de 15s — e o resto da configuração fica intacto', () => {
  assert.equal(
    fake.createArgs.timeout,
    15000,
    'D-01: 15s é generoso para uma API que responde em menos de 1s no caminho normal, mas corta um travamento antes de comer a janela do cron',
  );
  // Estas duas asserções não são decorativas: elas provam que o timeout foi ACRESCENTADO ao
  // objeto de configuração, e não que o objeto foi reescrito. Se baseURL sumisse, todas as
  // urls relativas do módulo passariam a apontar para lugar nenhum.
  assert.equal(
    fake.createArgs.baseURL,
    'https://api.agendor.com.br/v3',
    'baseURL não pode mudar: todo o módulo usa paths relativos',
  );
  assert.ok(
    typeof fake.createArgs.headers?.Authorization === 'string' &&
      fake.createArgs.headers.Authorization.startsWith('Token '),
    'o header de autenticação continua montado na fábrica (valor nunca impresso — carrega o AGENDOR_TOKEN)',
  );
});

test('(2) getDealById busca pela INSTÂNCIA compartilhada, com path relativo — e não pelo axios.get global', async () => {
  await getDealById(555);

  assert.equal(
    fake.get.mock.callCount(),
    1,
    'a chamada tem de passar pela instância — é dela que o timeout de 15s é herdado',
  );
  assert.equal(
    fake.get.mock.calls[0].arguments[0],
    '/deals/555',
    'path RELATIVO: a url absoluta de notifications.js:221 é justamente o que escapava da instância',
  );
  // Asserção NEGATIVA explícita (padrão de emailer.smtpPass.test.js:55-56): sem ela, o caso
  // passaria também numa implementação que montasse a url absoluta à mão. É ela que distingue
  // "usa o cliente configurado" de "por acaso alcança o mesmo recurso".
  assert.equal(
    axiosGetGlobal.mock.callCount(),
    0,
    'nenhuma chamada pode usar o axios.get global: ele não herda baseURL, header nem timeout',
  );
});

test('(3) getDealById desembrulha o envelope Agendor e devolve null quando ele vem vazio', async () => {
  const deal = await getDealById(555);
  assert.equal(deal.id, 555);
  assert.equal(
    deal.dealStatus.id,
    2,
    'dealStatus precisa sobreviver ao desembrulho: é o único campo que o frontend usa para o rótulo ganho/perdido',
  );

  const anterior = envelopeDoDeal;
  envelopeDoDeal = { data: {} };
  try {
    assert.equal(
      await getDealById(999),
      null,
      'envelope sem `data` vira null, não undefined — a rota trata ausência com `deal?.updatedAt`',
    );
  } finally {
    envelopeDoDeal = anterior;
  }
});

test('(4) getDealById PROPAGA a falha da borda (ao contrário de getOrgCategory, que engole)', async () => {
  dealByIdDeveFalhar = true;
  try {
    await assert.rejects(
      () => getDealById(555),
      /timeout of 15000ms exceeded/,
      'engolir aqui devolveria null e faria a rota marcar o negócio como não-resolvido SEM diferenciar "não mudou" de "não deu para consultar"',
    );
  } finally {
    dealByIdDeveFalhar = false;
  }
});

test('(5) um timeout NÃO é retentado como 429: propaga na primeira tentativa', async () => {
  dealsDeveFalhar = true;
  try {
    await assert.rejects(
      () => getStaleDeals(15),
      /timeout of 15000ms exceeded/,
      'o timeout precisa chegar ao chamador; abafá-lo devolveria lista parcial de negócios parados',
    );

    // O ponto do caso: fetchDealsPage (agendor.js:102-117) só retenta quando
    // err.response?.status === 429. Um timeout de client não traz `response`, então cai direto
    // no `throw err` de :114. Se alguém "melhorar" o retry para cobrir erros de rede, o pior
    // caso de UMA página passaria de ~15s para 15s + 5s + 15s + 10s + 15s — comendo a janela
    // do cron que o D-01 existe para proteger. Este contador é o alarme.
    assert.equal(
      fake.get.mock.callCount(),
      1,
      'uma única tentativa: o retry de 429 não pode capturar o timeout',
    );
  } finally {
    dealsDeveFalhar = false;
  }
});
