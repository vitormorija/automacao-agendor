// WR3-06 — as duas paginações de agendor.js encerram por condição vinda da RESPOSTA, e não por
// contagem derivada do total: `getUsers` para quando a resposta deixa de trazer `links.next`, e
// `getDealsWithFutureTasks` para quando a página traz menos de 100 tarefas. Uma borda que passe a
// ignorar o parâmetro `page` — regressão plenamente plausível numa API de terceiros — nunca
// satisfaz nenhuma das duas condições, e o laço não termina. O custo real não é a requisição
// desperdiçada: o laço vive dentro do `try` de `runCheck` (scheduler.js), então o `finally` que
// devolve `isRunning` a false NUNCA executa, e toda execução seguinte cai no guard do topo e
// devolve `{ skipped: true }` — para sempre, até reiniciar o processo. É o modo de falha que o
// cabeçalho de scheduler.resilience.test.js declara como o pior daqui ("o sistema pararia de
// notificar EM SILÊNCIO"), lá coberto só na variante por EXCEÇÃO; a variante por NÃO-TERMINAÇÃO
// não tinha cobertura nem teto. `getStaleDeals` NÃO entra aqui, e é decisão: ela deriva o número
// de páginas de `meta.totalCount` e é limitada por construção.
//
// Convenção (WR2-06): referências por âncora nomeada — função, identificador ou arquivo —, nunca
// por número de linha.
require('./setup');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');

// ── Fixtures ─────────────────────────────────────────────────────────────────
// Um usuário por página, com ids distintos, para que o caso da paginação legítima possa asserir
// o dicionário por VALOR: um mapa "do tamanho certo" com o endereço errado notificaria a pessoa
// errada e continuaria passando numa asserção de contagem.
const USUARIO_P1 = {
  id: 11,
  name: 'Ana Vendas',
  contact: { email: 'ana@exemplo.invalid' },
};
const USUARIO_P2 = {
  id: 12,
  name: 'Bruno Vendas',
  contact: { email: 'bruno@exemplo.invalid' },
};

// Prazo no futuro em relação ao relógio REAL: este arquivo não usa relógio falso (nenhuma das
// duas funções espera entre páginas, então não há nada para adiantar).
const PRAZO_FUTURO = new Date(
  Date.now() + 30 * 24 * 60 * 60 * 1000,
).toISOString();

// Página CHEIA de /tasks: exatamente 100 tarefas — o gatilho do `page++` do SUT. Montada UMA
// única vez e reutilizada em todas as páginas do modo 'infinito'; construí-la por página faria o
// caso do teto criar dezenas de milhares de objetos sem medir nada a mais.
const TAREFAS_CHEIAS = Array.from({ length: 100 }, (_, i) => ({
  finishedAt: null,
  dueDate: PRAZO_FUTURO,
  deal: { id: 601 + i },
}));
// Página 2 legítima: menos de 100 tarefas encerra a paginação.
const TAREFA_DA_P2 = {
  finishedAt: null,
  dueDate: PRAZO_FUTURO,
  deal: { id: 999 },
};

// ── Controle mutável das bordas ──────────────────────────────────────────────
// O stub NUNCA é reinstalado entre casos (depois do require de agendor.js a instância `api` já
// existe): o routeHandler ramifica por estas variáveis, zeradas no beforeEach.
let chamadasUsers = 0;
let chamadasTasks = 0;
let modoUsers = 'duas-paginas'; // 'infinito' | 'duas-paginas'
let modoTasks = 'duas-paginas'; // 'infinito' | 'duas-paginas'

// O stub devolve a resposta atravessando UMA volta real do event loop (`setImmediate`), e isso é
// construção necessária, não decoração. Um stub que resolvesse de forma puramente síncrona faria
// o laço não terminante consumir apenas a fila de MICROtarefas: nenhum timer voltaria a rodar, o
// `--test-timeout` do runner nunca dispararia e o RED travaria a suíte em vez de falhar. Ceder ao
// event loop também é mais fiel ao original — uma resposta HTTP real chega por I/O.
function respostaAssincrona(payload) {
  return new Promise((resolve) => setImmediate(() => resolve(payload)));
}

installFakeAxios((url, config) => {
  if (url === '/users') {
    chamadasUsers++;
    // 'infinito': a borda ignora `page` e serve SEMPRE a mesma página, sempre anunciando que há
    // próxima. `!data.links?.next` nunca é verdadeiro e o `break` do SUT nunca é alcançado.
    if (modoUsers === 'infinito') {
      return respostaAssincrona({
        data: {
          data: [USUARIO_P1],
          links: { next: 'https://exemplo.invalid/users?page=2' },
        },
      });
    }
    const page = config?.params?.page;
    return respostaAssincrona(
      page === 1
        ? {
            data: {
              data: [USUARIO_P1],
              links: { next: 'https://exemplo.invalid/users?page=2' },
            },
          }
        : { data: { data: [USUARIO_P2], links: {} } },
    );
  }
  if (url === '/tasks') {
    chamadasTasks++;
    // 'infinito': a borda ignora `page` e serve SEMPRE uma página cheia. `tasks.length < 100`
    // nunca é verdadeiro, a página nunca vem vazia, e o `break` do SUT nunca é alcançado.
    if (modoTasks === 'infinito') {
      return respostaAssincrona({ data: { data: TAREFAS_CHEIAS } });
    }
    const page = config?.params?.page;
    return respostaAssincrona({
      data: { data: page === 1 ? TAREFAS_CHEIAS : [TAREFA_DA_P2] },
    });
  }
  return respostaAssincrona({ data: { data: [] } });
});

const {
  MAX_PAGES,
  getUsers,
  getDealsWithFutureTasks,
} = require('../src/agendor');

// O número do teto é DERIVADO do módulo, nunca reescrito aqui. Duplicar o literal faria este
// arquivo continuar verde depois de alguém mudar a constante — falso positivo exatamente na
// asserção que existe para provar que a falha acontece no lugar certo.
function padraoDoTeto(borda) {
  return new RegExp(`paginação de ${borda} excedeu ${MAX_PAGES} páginas`);
}

beforeEach(() => {
  chamadasUsers = 0;
  chamadasTasks = 0;
  modoUsers = 'duas-paginas';
  modoTasks = 'duas-paginas';
});

test('(1) /users com próxima página SEMPRE: a paginação falha no teto em vez de laçar para sempre', async () => {
  modoUsers = 'infinito';

  await assert.rejects(
    () => getUsers(),
    padraoDoTeto('/users'),
    'a não-terminação precisa virar uma rejeição LEGÍVEL: sem ela, o finally de runCheck nunca roda e o lock isRunning fica preso para sempre',
  );

  // Este contador é a diferença entre "falhou" e "falhou no lugar certo". Uma rejeição vinda de
  // qualquer outro ponto (um erro de fixture, uma borda trocada) satisfaria o assert.rejects
  // acima sem provar nada sobre o teto. Só a igualdade EXATA com MAX_PAGES demonstra que o laço
  // percorreu o teto inteiro e parou nele — nem antes, nem uma página além.
  assert.equal(
    chamadasUsers,
    MAX_PAGES,
    'a rejeição precisa acontecer ao ESTOURAR o teto, não antes nem depois dele',
  );
});

test('(2) SIMÉTRICO — /users com 2 páginas legítimas: o teto NÃO trunca a operação normal', async () => {
  modoUsers = 'duas-paginas';

  const users = await getUsers();

  // A direção oposta do caso (1), e é o par que fecha o achado: um teto que cortasse paginação
  // legítima trocaria um defeito silencioso por outro — responsáveis sumindo do dicionário, e
  // com eles o e-mail de quem deveria ser notificado. Verificação por VALOR nas DUAS páginas.
  assert.deepStrictEqual(users[11], {
    id: 11,
    name: 'Ana Vendas',
    email: 'ana@exemplo.invalid',
  });
  assert.deepStrictEqual(users[12], {
    id: 12,
    name: 'Bruno Vendas',
    email: 'bruno@exemplo.invalid',
  });
  assert.equal(
    chamadasUsers,
    2,
    'duas páginas legítimas gastam duas requisições — o teto não pode encurtar nem alongar isso',
  );
});

test('(3) /tasks com página cheia SEMPRE: a paginação falha no teto em vez de laçar para sempre', async () => {
  modoTasks = 'infinito';

  await assert.rejects(
    () => getDealsWithFutureTasks(),
    padraoDoTeto('/tasks'),
    'propagar é coerente com o contrato "Set completo ou falha explícita" (Decisão Q2): a rejeição sobe ao catch EXTERNO de runCheck, cujo finally libera o lock isRunning e deixa a rodada seguinte executar',
  );

  assert.equal(
    chamadasTasks,
    MAX_PAGES,
    'a rejeição precisa acontecer ao ESTOURAR o teto, não antes nem depois dele',
  );
});

test('(4) SIMÉTRICO — /tasks com 2 páginas legítimas: o Set sai completo das duas', async () => {
  modoTasks = 'duas-paginas';

  const dealIds = await getDealsWithFutureTasks();

  // A direção oposta do caso (3). Aqui o custo de um teto que truncasse seria ainda mais
  // perverso: o Set é usado por runCheck para decidir quem NÃO recebe notificação, então uma
  // tarefa futura perdida vira notificação indevida para um negócio que está sendo acompanhado.
  assert.equal(dealIds.has(601), true, 'id da primeira página');
  assert.equal(dealIds.has(700), true, 'último id da primeira página');
  assert.equal(dealIds.has(999), true, 'id da segunda página');
  assert.equal(
    chamadasTasks,
    2,
    'página cheia força a segunda requisição; a segunda página, com menos de 100 tarefas, encerra',
  );
});
