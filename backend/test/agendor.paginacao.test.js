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
// não tinha cobertura nem teto.
//
// WR4-01 — a frase que ficava aqui ("`getStaleDeals` NÃO entra aqui, e é decisão: ela deriva o
// número de páginas de `meta.totalCount` e é limitada por construção") estava ERRADA, e este
// arquivo não mudou de escopo por capricho. O array de páginas de `getStaleDeals` é finito, mas o
// seu COMPRIMENTO é derivado de `meta.totalCount` — um valor que vem da RESPOSTA da borda, igual
// às outras duas. São portanto TRÊS as paginações do módulo que dependem da resposta para
// terminar: duas por condição de parada explícita (`links.next` e página incompleta) e a terceira
// pelo comprimento do array que ela percorre. As três estão cobertas aqui e as três herdam
// MAX_PAGES do módulo.
//
// WR4-05 — escopo NOVO deste arquivo, além da terminação: ele passa a ser também o oráculo do
// TRATAMENTO DO ENVELOPE nas três bordas. Uma resposta bem-sucedida no envelope mas SEM a chave
// `data` não pode derrubar a rodada; `getUsers` era a única das três que a desreferenciava sem
// guarda, e o caso (8) VERIFICA as duas irmãs em vez de presumi-las sãs pela leitura.
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

// ── Fixtures de /deals ───────────────────────────────────────────────────────
// Datas FIXAS de 2026, e não datas relativas a `Date.now()`: este arquivo não usa relógio falso
// (mesma nota de PRAZO_FUTURO, acima) e o filtro de `getStaleDeals` compara `updatedAt` contra
// `Date.now() - staleDays`. Uma data fixa bem no passado continua parada enquanto o relógio real
// avança, e `createdAt` em 2026 atravessa o corte de "criados a partir de 2026" sem depender de
// nenhum ajuste futuro. `dealStatus` de id 1 e uma etapa benigna existem para que os dois
// negócios sobrevivam a TODOS os filtros — o caso (6) mede o teto, não a elegibilidade.
function negocioParado(id) {
  return {
    id,
    title: `Negócio ${id}`,
    owner: { id: 11, name: 'Ana Vendas' },
    dealStatus: { id: 1 },
    dealStage: { name: 'Proposta' },
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    _webUrl: 'https://exemplo.invalid/deals',
  };
}
const NEGOCIO_P1 = negocioParado(301);
const NEGOCIO_P2 = negocioParado(302);

// `meta.totalCount` que dá EXATAMENTE 2 páginas de 100 — o par simétrico do caso do teto.
const TOTAL_DE_DUAS_PAGINAS = 150;

// ── Controle mutável das bordas ──────────────────────────────────────────────
// O stub NUNCA é reinstalado entre casos (depois do require de agendor.js a instância `api` já
// existe): o routeHandler ramifica por estas variáveis, zeradas no beforeEach.
let chamadasUsers = 0;
let chamadasTasks = 0;
let chamadasDeals = 0;
let modoUsers = 'duas-paginas'; // 'infinito' | 'duas-paginas' | 'sem-data'
let modoTasks = 'duas-paginas'; // 'infinito' | 'duas-paginas' | 'sem-data'
let modoDeals = 'duas-paginas'; // 'total-inflado' | 'duas-paginas' | 'sem-data'

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
    // 'sem-data': envelope bem formado, chave `data` AUSENTE. Sem `data` também não há
    // `links.next`, então o laço do SUT encerra na mesma volta.
    if (modoUsers === 'sem-data') {
      return respostaAssincrona({ data: { links: {} } });
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
    // 'sem-data': envelope bem formado, chave `data` AUSENTE.
    if (modoTasks === 'sem-data') {
      return respostaAssincrona({ data: {} });
    }
    const page = config?.params?.page;
    return respostaAssincrona({
      data: { data: page === 1 ? TAREFAS_CHEIAS : [TAREFA_DA_P2] },
    });
  }
  if (url === '/deals') {
    chamadasDeals++;
    // 'total-inflado': a borda anuncia um `meta.totalCount` que não corresponde ao filtro
    // enviado. A primeira página vem VAZIA de propósito — o que faz o laço crescer aqui é o
    // total anunciado, nunca o conteúdo servido, e é justamente essa a diferença entre esta
    // borda e as outras duas.
    if (modoDeals === 'total-inflado') {
      return respostaAssincrona({
        data: { data: [], meta: { totalCount: TOTAL_INFLADO } },
      });
    }
    // 'sem-data': envelope bem formado, chave `data` AUSENTE.
    if (modoDeals === 'sem-data') {
      return respostaAssincrona({ data: { meta: { totalCount: 0 } } });
    }
    const page = config?.params?.page;
    return respostaAssincrona({
      data: {
        data: [page === 1 ? NEGOCIO_P1 : NEGOCIO_P2],
        meta: { totalCount: TOTAL_DE_DUAS_PAGINAS },
      },
    });
  }
  return respostaAssincrona({ data: { data: [] } });
});

const {
  MAX_PAGES,
  getUsers,
  getStaleDeals,
  getDealsWithFutureTasks,
} = require('../src/agendor');

// `meta.totalCount` que dá mais páginas do que o teto. DERIVADO de MAX_PAGES pelo mesmo motivo
// que `padraoDoTeto` deriva o número da mensagem: um literal continuaria "passando" depois de
// alguém mudar a constante, e o caso deixaria de medir o que diz medir. Declarado DEPOIS do
// require porque MAX_PAGES vem do módulo; o routeHandler só o lê em tempo de execução.
const TOTAL_INFLADO = (MAX_PAGES + 1) * 100;

// O número do teto é DERIVADO do módulo, nunca reescrito aqui. Duplicar o literal faria este
// arquivo continuar verde depois de alguém mudar a constante — falso positivo exatamente na
// asserção que existe para provar que a falha acontece no lugar certo.
function padraoDoTeto(borda) {
  return new RegExp(`paginação de ${borda} excedeu ${MAX_PAGES} páginas`);
}

// O teto de /deals tem padrão PRÓPRIO, e não uma reutilização de `padraoDoTeto`: a mensagem das
// outras duas bordas culpa o parâmetro `page`, e aqui a suspeita é outra — o total anunciado não
// corresponde ao filtro enviado. Uma mensagem copiada mandaria quem investiga para o mecanismo
// errado. O número continua DERIVADO do módulo nos dois helpers.
function padraoDoTetoDeDeals() {
  return new RegExp(
    `/deals anunciou ${MAX_PAGES + 1} páginas \\(> ${MAX_PAGES}\\)`,
  );
}

beforeEach(() => {
  chamadasUsers = 0;
  chamadasTasks = 0;
  chamadasDeals = 0;
  modoUsers = 'duas-paginas';
  modoTasks = 'duas-paginas';
  modoDeals = 'duas-paginas';
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

test('(5) /deals anuncia mais páginas do que o teto: a TERCEIRA paginação falha em vez de percorrer o total anunciado', async () => {
  modoDeals = 'total-inflado';

  // A justificativa que estava escrita em agendor.js para dispensar esta borda do teto — "é
  // limitada por construção, e não existe ali condição de parada vinda da resposta a ser
  // frustrada" — era FALSA: o comprimento do array de páginas sai de `meta.totalCount`, um valor
  // da borda. Sem teto, o laço percorre o que a borda anunciar, dentro do `try` de runCheck; o
  // `finally` que devolve `isRunning` a false nunca executa e toda rodada seguinte é recusada com
  // `{ skipped: true }` — para sempre, até reiniciar o processo.
  await assert.rejects(
    () => getStaleDeals(),
    padraoDoTetoDeDeals(),
    'a terceira paginação precisa falhar de forma LEGÍVEL, como as outras duas, em vez de percorrer o total anunciado',
  );

  // 1, e não MAX_PAGES como nos casos (1) e (3): aqui o total é conhecido já na PRIMEIRA
  // resposta, então a falha tem de vir antes da segunda requisição e, sobretudo, antes do
  // `Array.from({ length: totalPages - 1 })` — essa alocação de uma vez já é sozinha um modo de
  // falha contra o `max_memory_restart` do ecosystem.config.js.
  assert.equal(
    chamadasDeals,
    1,
    'a rejeição precisa vir da PRIMEIRA página, antes de gastar requisições e antes de alocar o array de páginas',
  );
});

test('(6) SIMÉTRICO — /deals com 2 páginas legítimas: o teto NÃO trunca a operação normal', async () => {
  modoDeals = 'duas-paginas';

  const ids = (await getStaleDeals()).map((d) => d.id);

  // A direção oposta do caso (5), pelo mesmo motivo já escrito no caso (2): verificação por
  // VALOR e não por tamanho. Uma lista "do tamanho certo" com os negócios errados esconderia
  // exatamente os negócios parados que esta suíte existe para não deixar sumir.
  assert.equal(ids.includes(301), true, 'negócio da primeira página');
  assert.equal(ids.includes(302), true, 'negócio da segunda página');
  assert.equal(
    chamadasDeals,
    2,
    'duas páginas legítimas gastam duas requisições — o teto não pode encurtar nem alongar isso',
  );
});

test('(7) /users com envelope sem a chave `data`: getUsers RESOLVE em vez de derrubar a rodada', async () => {
  modoUsers = 'sem-data';

  // Sem a guarda que as duas irmãs já têm, `for (const user of data.data)` lança um TypeError que
  // NÃO é capturado em lugar nenhum de getUsers e sobe pelo Promise.all de runCheck — a rodada
  // morre antes do laço de envio, com zero e-mails e zero linhas de log. É a mesma classe de
  // falha que WR3-01 usou como argumento para levar /users à política de retry da borda,
  // entrando pela porta ao lado.
  const users = await getUsers();

  assert.deepStrictEqual(
    Object.keys(users),
    [],
    'sem `data` também não há `links.next`: o laço encerra na mesma volta e o resultado é o dicionário do que a borda entregou — resolver é o desfecho certo, porque rejeitar transformaria "zero usuários cadastrados" numa rodada abortada',
  );
});

test('(8) IRMÃS VERIFICADAS — /tasks e /deals com envelope sem a chave `data`: as duas resolvem', async () => {
  modoTasks = 'sem-data';
  modoDeals = 'sem-data';

  // Este caso existe para VERIFICAR as irmãs, e não para presumi-las sãs pela leitura: as três
  // paginações do módulo tratavam o payload de forma diferente, e a única maneira de o conserto
  // de uma não deixar a outra aberta é MEDIR as três. Mesmo papel do cenário F do 04-23 — a
  // primeira vez na fase em que o vizinho imediato de uma correção foi verificado em vez de
  // presumido.
  const dealIds = await getDealsWithFutureTasks();
  assert.equal(
    dealIds.size,
    0,
    'o Set sai vazio, sem TypeError: a guarda de envelope de getDealsWithFutureTasks já existia e continua valendo',
  );

  const deals = await getStaleDeals();
  assert.equal(
    deals.length,
    0,
    'a lista sai vazia, sem TypeError: as duas desreferências de envelope de getStaleDeals já eram guardadas e continuam valendo',
  );
});
