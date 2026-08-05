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
//
// A rodada 2 do code review (CR2-01) achou a direção OPOSTA do mesmo entrelaçamento, que este
// arquivo não media: não é a limpeza de B que apaga o que A escreveu, é a ESCRITA TARDIA de A
// que contamina B. getOrgCategory engole qualquer falha e, à época, cacheava `null`, que não
// está em EXCLUDED_CATEGORIES — se a consulta de A falhava DEPOIS do início de B, B lia esse
// `null` em cache, nem consultava a API, e notificava uma organização 'Parceiro' sem ter
// falhado em nada. Desde CR3-01 o valor gravado pelo catch é a sentinela
// CATEGORIA_INDECIDIVEL, e o negócio afetado sai marcado como indecidível — mas o que este
// arquivo mede continua sendo a HERANÇA entre execuções, não o conteúdo do valor herdado.
// A partir daqui o arquivo mede as DUAS direções: "a limpeza apaga a leitura futura" (casos
// 'duas execuções SOBREPOSTAS...' e 'depois do entrelaçamento...', CR-01) e "a escrita tardia
// contamina a execução vizinha" (caso 'escrita tardia...', CR2-01).
require('./setup');

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');

// Relógio fixo: now = 2026-06-01T00:00:00.000Z -> cutoffDate = now - 15d = 2026-05-17T00:00:00.000Z.
// Mesmo instante do golden de agendor.getStaleDeals.test.js (a constante FIXED_NOW de lá), para
// que a fixture compartilhada
// signifique exatamente a mesma coisa nos dois arquivos.
//
// Só o relógio é mockado. Os temporizadores NÃO são: a fixture tem 10 deals numa página única,
// então nada dorme dentro de getStaleDeals — mockar a espera entre lotes de páginas de
// getStaleDeals (o setTimeout de 1s entre batches, em agendor.js)
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

// ── Cenário espelho (CR2-01): a escrita tardia de A contamina B ──────────────────────
// Controles com nomes PRÓPRIOS, sem reuso dos dos dois casos acima: os dois cenários medem
// entrelaçamentos diferentes, e compartilhar contador deixaria a leitura de um refém da
// ordem do outro. `cenarioAtivo` nasce no valor que os casos existentes medem, e só o caso
// novo o troca (restaurando ao final).
let cenarioAtivo = 'limpeza-apaga-leitura';
let chamadasDealsNoEspelho = 0;
let liberarDealsDaExecucaoB = null;
let falhar205DaExecucaoA = null;
let consultas205NoEspelho = 0;

// Stub do cenário espelho. Mora numa função à parte, mas é CHAMADO de dentro do routeHandler
// — nunca por reinstalação do stub: installFakeAxios roda uma única vez, antes do
// require('../src/agendor'), porque a instância `api` de agendor.js nasce no load do módulo.
// Reinstalar depois não teria efeito nenhum, então toda ramificação de cenário vive dentro
// do handler.
function respostaDoEspelho(url) {
  if (url === '/deals') {
    chamadasDealsNoEspelho += 1;
    // Ponto de suspensão 1 do espelho — a SEGUNDA execução (B) fica estacionada aqui,
    // ANTES da fase de organizações. É a única forma de garantir que B só chegue a
    // getOrgCategory(205) DEPOIS de A ter gravado o `null` do erro; sem isso a ordem
    // dependeria de microtask e o caso seria intermitente.
    if (chamadasDealsNoEspelho === 2) {
      return new Promise((resolve) => {
        liberarDealsDaExecucaoB = () =>
          resolve({
            data: {
              data: dealsPage,
              meta: { totalCount: dealsPage.length },
              links: {},
            },
          });
      });
    }
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

    if (id === 205) {
      consultas205NoEspelho += 1;
      // Ponto de suspensão 2 do espelho — a PRIMEIRA consulta de 205 é a da execução A, e é
      // ela que vai FALHAR, em voo, depois do início de B. Um Error simples basta:
      // getOrgCategory engole qualquer falha e cacheia a sentinela CATEGORIA_INDECIDIVEL. E,
      // por ser SEM `response`, este erro fica fora do ramo de 429 de fetchWithRetry
      // (CR3-01) — a contagem `consultas205NoEspelho` continua significando exatamente o que
      // significava antes de a borda de categorias entrar no retry. Da segunda consulta em
      // diante a API responde normalmente, e é isso que torna o contador uma prova do
      // MECANISMO: em GREEN a execução B precisa reconsultar para saber que 205 é
      // 'Parceiro'.
      if (consultas205NoEspelho === 1) {
        return new Promise((_resolve, reject) => {
          falhar205DaExecucaoA = () =>
            reject(
              new Error('Falha transitoria simulada em /organizations/205'),
            );
        });
      }
    }

    return respostaDaOrganizacao(id);
  }

  return { data: { data: [] } };
}

installFakeAxios((url) => {
  // Ramificação por cenário DENTRO do routeHandler, pelo motivo explicado acima: o stub é
  // instalado uma única vez e não pode ser trocado depois do require de agendor.js.
  if (cenarioAtivo === 'falha-tardia') return respostaDoEspelho(url);

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
// (o helper homônimo de emailer.timeout.test.js).
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

test('escrita tardia: a falha de UMA execução não pode decidir quem a execução vizinha notifica (CR2-01)', async () => {
  // (1) Liga o cenário espelho. Só este caso o usa, e ele o restaura no final.
  cenarioAtivo = 'falha-tardia';

  // (2) A execução A começa e não é aguardada.
  const execucaoA = getStaleDeals(15);

  // (3) Um turno de event loop: A resolve /deals, filtra e dispara o Promise.all das 6
  // organizações. As demais respondem; a de 205 fica PENDENTE e A trava ali, em voo.
  await cederEventLoop();

  // (4) Pré-condições: sem elas o caso não diz nada — um cenário que na verdade rodou
  // sequencial passaria em silêncio.
  assert.notEqual(
    falhar205DaExecucaoA,
    null,
    'pré-condição: a execução A está suspensa na consulta de /organizations/205',
  );
  assert.equal(
    consultas205NoEspelho,
    1,
    'pré-condição: só a execução A consultou 205 até aqui',
  );

  // (5) A execução B começa e fica suspensa em /deals, antes da fase de organizações.
  const execucaoB = getStaleDeals(15);
  await esperarAte(
    () => liberarDealsDaExecucaoB !== null,
    'a execução B não chegou a pedir /deals',
  );

  // (6) Este é o ponto exato do defeito: no estado RED a limpeza de B já rodou (é a
  // primeira instrução de getStaleDeals) e A ainda vai escrever no dicionário de módulo.
  assert.equal(
    consultas205NoEspelho,
    1,
    'pré-condição: a execução B ainda não chegou à fase de organizações',
  );

  // (7) A consulta de A falha. No estado RED, getOrgCategory grava `null` no dicionário de
  // módulo DEPOIS da limpeza de B.
  falhar205DaExecucaoA();

  // (8) A execução que FALHOU marca o negócio como INDECIDÍVEL: ele continua na lista dela
  // (o painel o preserva), mas com `categoriaIndecidivel: true`, que é o que o tira do envio.
  // Desde CR3-01 isto NÃO é mais "tratar a categoria como desconhecida" — o `null` que
  // atravessava EXCLUDED_CATEGORIES deixou de existir neste caminho. A asserção de presença
  // vale nos dois estados e é o que dá sentido à asserção seguinte, sobre a execução B.
  const negociosA = await execucaoA;
  const idsA = negociosA.map((d) => d.id);
  assert.equal(
    idsA.includes(105),
    true,
    'caminho de erro documentado (cenário (3) de agendor.cacheInvalidation.test.js): a execução QUE FALHOU mantém o negócio na lista, marcado como indecidível',
  );
  assert.equal(
    negociosA.find((d) => d.id === 105).categoriaIndecidivel,
    true,
    'quem falhou na consulta precisa marcar o negócio como indecidível — presença sem a marca seria o fail-open de CR3-01',
  );

  // (9) Agora B avança para a fase de organizações.
  liberarDealsDaExecucaoB();

  // (10) B não falhou em nada: o golden tem de valer para ela.
  const idsB = (await execucaoB).map((d) => d.id);
  assert.equal(
    idsB.includes(105),
    false,
    'a execução B não falhou em nada: herdar o null de A faz uma organização "Parceiro" ser notificada',
  );
  assert.deepStrictEqual(idsB, [101, 103]);

  // (11) Prova do MECANISMO, não só do desfecho.
  assert.equal(
    consultas205NoEspelho,
    2,
    'a execução B precisa RECONSULTAR a categoria: com cache de módulo ela lê o null de A e nem chega a perguntar',
  );

  // (12) Restaura o cenário inicial para não afetar quem rodar depois.
  cenarioAtivo = 'limpeza-apaga-leitura';
});
