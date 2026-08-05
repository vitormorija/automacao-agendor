// Prova do achado CR3-01 (rodada 3 do code review): a exclusão por CATEGORIA falha ABERTA.
//
// Dos cinco filtros de elegibilidade de getStaleDeals, quatro decidem a partir do payload do
// próprio negócio (data, dono, dealStatus, etapa) e não têm como falhar. Só a exclusão por
// categoria depende de uma SEGUNDA chamada HTTP — /organizations/:id, a única borda Agendor
// fora de fetchWithRetry — e o catch de getOrgCategory engole a falha e devolve `null`. Como
// EXCLUDED_CATEGORIES.includes(null) é `false`, um único 429 transitório faz uma organização
// 'Parceiro' (categoria EXCLUÍDA) receber e-mail de verdade, com a rodada reportando sucesso.
//
// Este arquivo pina o contrato NOVO, decidido pelo usuário em 2026-08-05: (a) a consulta de
// categoria entra na política ÚNICA de retry da borda; (b) se ainda assim falhar, o negócio é
// INDECIDÍVEL — fica FORA do envio, mas PERMANECE no painel e nos relatórios. A rota
// alternativa (abortar a rodada inteira por uma organização inatingível) foi explicitamente
// rejeitada e NÃO deve ser reintroduzida aqui.
//
// ESCOPO: este arquivo mede a BORDA (getStaleDeals). Quem deixa de ENVIAR é o agendador, e
// isso é medido pelo arquivo do plano 04-20. Referências por âncora nomeada — função,
// identificador ou caso de teste —, nunca por número de linha (WR2-06).
require('./setup');

const { test, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');
const { avancarRelogioAte } = require('./helpers/fakeTimers');

// Relógio fixo, com `setTimeout` TAMBÉM mockado: as esperas entre tentativas do retry são de
// 5s e 10s reais, e sem relógio falso cada caso de exaustão custaria 15s de parede. Mesmo
// instante do golden de agendor.getStaleDeals.test.js, para que a fixture compartilhada
// signifique exatamente a mesma coisa aqui.
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

const dealsPage = require('./fixtures/synthetic/deals-page.json');

// Mesmo mapa de categorias do golden: a organização 205 (do negócio 105) é 'Parceiro',
// categoria EXCLUÍDA. Todas as outras caem no default 'Lead', que NÃO é excluída.
const ORG_CATEGORY = {
  205: 'Parceiro',
};

// Clone do molde 101 da fixture SEM a chave `organization`, usado só pelo caso (5). Stale sob
// FIXED_NOW, status 1, etapa benigna, owner válido — tudo que o 101 tem, menos a organização.
const DEAL_SEM_ORGANIZACAO = {
  id: 901,
  title: 'Sintetico do caso (5): negocio sem organizacao (nada a consultar)',
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  owner: { id: 91, name: 'Ana Vendas' },
  author: { id: 92, name: 'Ana Vendas' },
  dealStatus: { id: 1 },
  dealStage: { name: 'Negociação', funnel: { name: 'Comercial' } },
  _webUrl: 'https://web.agendor.com.br/deal/901',
};

// ── Controle mutável das bordas ───────────────────────────────────────────────
// O stub NUNCA é reinstalado entre casos (depois do require de agendor.js a instância `api` já
// existe e um novo mock.method não teria efeito): o routeHandler ramifica por estas variáveis.
let dealsServidos = dealsPage;
let orgQueFalha = null;
let modoFalhaDaOrg = '429-sempre'; // '429-sempre' | '429-uma-vez' | 'erro-sem-response'
let consultasPorOrg = {};

// Erro fiel ao que o axios produz num rate limit: o que fetchWithRetry consulta é a PRESENÇA
// de `err.response.status` (mesmo molde de agendor.retry429.test.js).
function erro429() {
  return Object.assign(new Error('Request failed with status code 429'), {
    response: { status: 429 },
  });
}

// Erro SEM `response` — é a ausência dela que mantém o erro fora do ramo de 429 (D-01).
function erroSemResponse() {
  return new Error('Falha simulada sem response em /organizations');
}

// Instala o stub ANTES de exigir agendor.js (a instância `api` nasce no load do módulo).
installFakeAxios((url) => {
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
    consultasPorOrg[id] = (consultasPorOrg[id] || 0) + 1;
    if (id === orgQueFalha) {
      if (modoFalhaDaOrg === '429-sempre') return Promise.reject(erro429());
      if (modoFalhaDaOrg === '429-uma-vez' && consultasPorOrg[id] === 1) {
        return Promise.reject(erro429());
      }
      if (modoFalhaDaOrg === 'erro-sem-response') {
        return Promise.reject(erroSemResponse());
      }
    }
    return {
      data: { data: { category: { name: ORG_CATEGORY[id] || 'Lead' } } },
    };
  }
  return { data: { data: [] } };
});

const { getStaleDeals, CATEGORIA_INDECIDIVEL } = require('../src/agendor');

after(() => {
  mock.timers.reset();
});

// Contadores, modos E RELÓGIO voltam ao estado inicial antes de cada caso.
//
// Rearmar o relógio não é zelo decorativo (mesmo motivo registrado em agendor.retry429.test.js):
// avançar o tempo é o mecanismo que faz as esperas do retry resolverem, então cada caso que
// retenta DEIXA o relógio adiantado para o caso seguinte — e o cutoff de 15 dias anda junto,
// trazendo para dentro do golden os negócios 102 e 104, que existem na fixture justamente para
// pinar a fronteira estrita. `reset()` antes de `enable()` porque `enable()` lança se os timers
// já estiverem habilitados.
beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: FIXED_NOW });
  dealsServidos = dealsPage;
  orgQueFalha = null;
  modoFalhaDaOrg = '429-sempre';
  consultasPorOrg = {};
});

test('(1) 429 SEMPRE numa organização de categoria EXCLUÍDA: 3 tentativas e o negócio fica INDECIDÍVEL, sem sumir do painel', async () => {
  orgQueFalha = 205;
  modoFalhaDaOrg = '429-sempre';

  const negocios = await avancarRelogioAte(getStaleDeals(15));

  // A primeira coisa que fica vermelha hoje: a borda de categorias não retenta nem uma vez.
  assert.equal(
    consultasPorOrg[205],
    3,
    'a consulta de categoria precisa passar pela política ÚNICA de retry da borda (3 tentativas)',
  );

  const negocio105 = negocios.find((d) => d.id === 105);
  // Esta asserção de PRESENÇA não é fail-open. O que impede o e-mail é o campo
  // `categoriaIndecidivel`, lido pelo agendador (plano 04-20) — e a decisão do usuário manda
  // preservar o negócio no dashboard e nos relatórios justamente para que a falha seja
  // VISÍVEL, em vez de o negócio desaparecer em silêncio da lista.
  assert.notEqual(
    negocio105,
    undefined,
    'o negócio indecidível PERMANECE na lista: quem não envia é o consumidor, não a borda',
  );
  assert.equal(negocio105.categoriaIndecidivel, true);
  assert.equal(
    negocio105.orgCategory,
    null,
    'orgCategory continua nulo para preservar o agrupamento "Indefinido" dos relatórios',
  );

  // A sentinela é detalhe INTERNO do cache da execução: ela não pode vazar para o objeto de
  // negócio, que é lido por rotas, e-mails e relatórios.
  assert.equal(typeof CATEGORIA_INDECIDIVEL, 'string');
  assert.notEqual(negocio105.orgCategory, CATEGORIA_INDECIDIVEL);
});

test('(2) SIMÉTRICO — 429 SEMPRE numa organização de categoria NÃO excluída: o mesmo negócio elegível também fica indecidível', async () => {
  orgQueFalha = 201;
  modoFalhaDaOrg = '429-sempre';

  const negocios = await avancarRelogioAte(getStaleDeals(15));

  assert.equal(
    consultasPorOrg[201],
    3,
    'a política de retry vale para qualquer organização, não só para as de categoria excluída',
  );

  const negocio101 = negocios.find((d) => d.id === 101);
  assert.notEqual(negocio101, undefined);
  // O cenário SIMÉTRICO do achado, e o custo declarado por escrito: o fail-safe NÃO é
  // seletivo. Um negócio que passaria pelo filtro fica fora do envio no dia da falha e volta
  // na rodada seguinte, porque "não sei a categoria" é indistinguível de "não sei se posso
  // notificar". Marcar só as organizações de categoria excluída exigiria saber a categoria —
  // exatamente o que a consulta falhou em descobrir.
  assert.equal(
    negocio101.categoriaIndecidivel,
    true,
    'o fail-safe não é seletivo: sem categoria conhecida, ninguém é elegível',
  );
  assert.equal(negocio101.orgCategory, null);
});

test('(3) 429 TRANSITÓRIO: a retentativa obtém a categoria e a organização excluída volta a ser excluída', async () => {
  orgQueFalha = 205;
  modoFalhaDaOrg = '429-uma-vez';

  const negocios = await avancarRelogioAte(getStaleDeals(15));

  assert.equal(
    consultasPorOrg[205],
    2,
    'a 1ª consulta levou 429 e a 2ª foi a retentativa',
  );

  // É este caso que mostra que o conserto PRINCIPAL é o retry: o indecidível é só a rede
  // embaixo dele. Com a categoria obtida na retentativa, nada muda em relação ao golden.
  assert.equal(
    negocios.find((d) => d.id === 105),
    undefined,
    'organização 205 = "Parceiro": o negócio 105 continua excluído por categoria',
  );
  assert.deepStrictEqual(
    negocios.map((d) => d.id),
    [101, 103],
    'o golden da fixture não se move quando o 429 é transitório',
  );
  assert.equal(
    negocios.some((d) => d.categoriaIndecidivel === true),
    false,
    'nenhum negócio pode ser marcado indecidível quando a categoria foi obtida',
  );
});

test('(4) erro SEM response: 1 consulta apenas (a política de 429 não muda) e o negócio fica indecidível', async () => {
  orgQueFalha = 205;
  modoFalhaDaOrg = 'erro-sem-response';

  const negocios = await avancarRelogioAte(getStaleDeals(15));

  // Espelho, do lado de /organizations, do caso (3) de agendor.retry429.test.js: um erro sem
  // `err.response` — timeout de client — NÃO entra no ramo de 429 (D-01). Retentá-lo levaria o
  // pior caso de uma requisição de ~15s para ~60s, comendo a janela do cron das 8h. Este
  // contador é o alarme contra "melhorar" o retry para cobrir erros de rede.
  assert.equal(
    consultasPorOrg[205],
    1,
    'um erro sem err.response não pode entrar no ramo de 429',
  );

  const negocio105 = negocios.find((d) => d.id === 105);
  assert.notEqual(negocio105, undefined);
  assert.equal(
    negocio105.categoriaIndecidivel,
    true,
    'a falha não retentável também deixa a categoria indecidível — o fail-safe não depende do código HTTP',
  );
});

test('(5) negócio SEM organização: categoria nula e NÃO indecidível — não há o que consultar', async () => {
  dealsServidos = [...dealsPage, DEAL_SEM_ORGANIZACAO];

  const negocios = await avancarRelogioAte(getStaleDeals(15));

  const negocio901 = negocios.find((d) => d.id === 901);
  assert.notEqual(negocio901, undefined);
  // Este é o SEGUNDO `null` do domínio, e ele não é indecidível: a guarda `!orgId` de
  // getOrgCategory devolve `null` sem sequer tentar a requisição. Não existe consulta a
  // fazer, portanto não existe falha a temer — confundir os dois nulls tiraria do envio todo
  // negócio sem organização, que hoje é notificado normalmente.
  assert.equal(negocio901.orgCategory, null);
  assert.equal(
    negocio901.categoriaIndecidivel,
    false,
    'ausência de organização não é falha de consulta',
  );
  // Nenhuma requisição a /organizations/undefined foi disparada por ele.
  assert.equal(consultasPorOrg.NaN, undefined);
});
