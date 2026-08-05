// WR4-04 — a consulta de categoria por organização é o ÚNICO ponto de agendor.js cujo número de
// requisições é proporcional ao VOLUME DE DADOS: `getStaleDeals` dispara uma chamada a
// `/organizations/:id` por organização única dos negócios parados, e todas saem ao mesmo tempo.
// Desde CR3-01 cada uma dessas chamadas passa pela política de retry da borda (`fetchWithRetry`),
// então sob HTTP 429 `N` requisições viram `3N`. O erro que está sendo retentado é justamente o
// que a API usa para dizer "você está mandando demais": retentar em massa PROLONGA a própria
// janela de rate limit que causou a falha, e é essa janela que produz a supressão em massa que
// CR4-01 tornou audível.
//
// O agravante que nenhum plano anterior olhou: `getStaleDeals` é também o caminho de LEITURA do
// painel. A rota de negócios parados, a de relatórios e a prévia de envio (`runCheckOnly`) chamam
// a MESMA função, e a lista de negócios do frontend tem auto-refresh. Cada atualização de tela com
// a API rate-limitada passou a custar `3N` requisições e até ~15 s de espera dentro do handler
// HTTP — o custo deixou de ser só da rodada das 8 h.
//
// POR QUE ESTE ARQUIVO É NOVO, e não um caso a mais em agendor.cacheInvalidation.test.js: medir
// concorrência exige um stub que CEDA ao event loop (ver `respostaAssincrona`, abaixo), e trocar o
// instrumento de um oráculo já existente JUNTO com o objeto medido é exatamente o que a constraint
// de processo do projeto proíbe. Aquele arquivo fica byte a byte e roda como REGRESSÃO — é ele a
// evidência de que o RESULTADO não mudou.
//
// O ORÁCULO AQUI É A CONCORRÊNCIA MÁXIMA EM VOO, nunca a contagem total: contagem total não
// distingue "dez de cada vez" de "vinte e cinco de uma vez", porque as duas fazem 25 requisições.
//
// PC-13: nada neste arquivo imprime nem compara o objeto de configuração da instância axios — ele
// carrega o AGENDOR_TOKEN no header. O stub lê apenas a url e o parâmetro `page`.
//
// Convenção (WR2-06): referências por âncora nomeada — função, identificador, arquivo ou nome de
// caso —, nunca por número de linha.
require('./setup');

const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');

// Mesmo instante dos demais arquivos de negócios (a constante FIXED_NOW de
// agendor.getStaleDeals.test.js e de agendor.cacheInvalidation.test.js), para que uma fixture com
// as mesmas datas signifique exatamente a mesma coisa em todos eles.
// now = 2026-06-01 -> cutoffDate de 15 dias = 2026-05-17.
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

// ── Fixtures ─────────────────────────────────────────────────────────────────
// Tamanho da fixture dos casos (1) e (2). Dois lotes cheios mais um lote parcial sob o teto que
// este plano introduz — o parcial importa: um lote implementado com fatias de tamanho fixo, sem
// tratar o resto da divisão, perderia organizações justamente na última fatia.
//
// O número NÃO é derivado de LOTE_DE_ORGS de propósito, e a relação entre os dois é asserida
// EXPLICITAMENTE no caso (1). Derivar deixaria a fixture crescer em silêncio junto com o teto e o
// caso continuaria "verde" sem medir nada; a asserção explícita fica VERMELHA e obriga quem mudar
// a constante a olhar para a fixture.
const ORGS_UNICAS = 25;

// A organização de categoria excluída do caso (2). Fica no MEIO da fixture, e não na primeira nem
// na última posição: um lote que associe a categoria ao índice errado (o defeito que o caso (2)
// existe para detectar) tende a acertar as pontas por acidente.
const INDICE_DO_PARCEIRO = 13;

// Páginas anunciadas pelo caso (3). Seis páginas produzem UM lote de 5 páginas restantes, que é
// exatamente o `batchSize` da paginação de negócios — e, por ser um lote só, a pausa de 1 s entre
// lotes NÃO é exercida, então este caso não precisa de relógio falso para timers.
const PAGINAS_ANUNCIADAS = 6;
const TOTAL_COUNT_DE_SEIS_PAGINAS = (PAGINAS_ANUNCIADAS - 1) * 100 + 50;

// Gerador de negócios sintéticos: ids distintos, uma organização de id distinto por negócio,
// `createdAt` em 2026 (atravessa o corte de "criados a partir de 2026"), `updatedAt` bem anterior
// ao cutoff sob FIXED_NOW, `dealStatus` de id 1 e etapa benigna — todos sobrevivem a TODOS os
// filtros de getStaleDeals. O caso mede o custo da consulta de categoria, não a elegibilidade.
function negocioSintetico(indice) {
  const id = 1000 + indice;
  const orgId = 2000 + indice;
  return {
    id,
    title: `Negócio sintético ${id}`,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    owner: { id: 15, name: 'Ana Vendas' },
    author: { id: 25, name: 'Ana Vendas' },
    organization: { id: orgId, name: `Org ${orgId}` },
    dealStatus: { id: 1 },
    dealStage: { name: 'Negociação', funnel: { name: 'Comercial' } },
    _webUrl: `https://web.agendor.com.br/deal/${id}`,
  };
}

const NEGOCIOS_SINTETICOS = Array.from({ length: ORGS_UNICAS }, (_, i) =>
  negocioSintetico(i),
);
const ID_DO_NEGOCIO_PARCEIRO = NEGOCIOS_SINTETICOS[INDICE_DO_PARCEIRO].id;
const ORG_DO_PARCEIRO = NEGOCIOS_SINTETICOS[INDICE_DO_PARCEIRO].organization.id;

// ── Instrumentação de concorrência ───────────────────────────────────────────
// Por borda: quantas requisições estão EM VOO agora, o máximo simultâneo já observado e o total.
// O par "em voo" + "máximo" é o instrumento; o total sozinho não mede nada sobre concorrência.
let emVooOrganizacoes = 0;
let maxEmVooOrganizacoes = 0;
let totalOrganizacoes = 0;
let urlsDeOrganizacao = [];

let emVooDeals = 0;
let maxEmVooDeals = 0;
let totalDeals = 0;

// 'lote-de-orgs': uma única página de negócios, com uma organização por negócio.
// 'paginacao': todas as páginas VAZIAS, para que o caso meça só o lote da paginação.
let modo = 'lote-de-orgs';
let orgDeCategoriaExcluida = null;

// O stub resolve atravessando UMA volta real do event loop (`setImmediate`), e isso é construção
// necessária, não decoração — mesmo molde de `respostaAssincrona` em agendor.paginacao.test.js,
// aqui por um motivo adicional. Um stub puramente síncrono resolveria a promessa ANTES de a
// próxima chamada do `map` sair: "em voo" voltaria a zero entre uma requisição e a seguinte, o
// máximo medido seria SEMPRE 1, e o instrumento marcaria concorrência 1 em qualquer implementação
// — inclusive na defeituosa. Ceder ao event loop também é mais fiel ao original, porque uma
// resposta HTTP real chega por I/O.
function respostaAssincrona(payload, aoResolver) {
  return new Promise((resolve) => {
    setImmediate(() => {
      aoResolver();
      resolve(payload);
    });
  });
}

installFakeAxios((url, config) => {
  if (url === '/deals') {
    totalDeals++;
    emVooDeals++;
    if (emVooDeals > maxEmVooDeals) maxEmVooDeals = emVooDeals;
    const pagina = config?.params?.page;
    const negocios =
      modo === 'lote-de-orgs' && pagina === 1 ? NEGOCIOS_SINTETICOS : [];
    const totalCount =
      modo === 'paginacao' ? TOTAL_COUNT_DE_SEIS_PAGINAS : ORGS_UNICAS;
    return respostaAssincrona(
      { data: { data: negocios, meta: { totalCount } } },
      () => {
        emVooDeals--;
      },
    );
  }
  if (url.startsWith('/organizations/')) {
    totalOrganizacoes++;
    urlsDeOrganizacao.push(url);
    emVooOrganizacoes++;
    if (emVooOrganizacoes > maxEmVooOrganizacoes) {
      maxEmVooOrganizacoes = emVooOrganizacoes;
    }
    const id = Number(url.split('/').pop());
    const name = id === orgDeCategoriaExcluida ? 'Parceiro' : 'Lead';
    return respostaAssincrona(
      { data: { data: { category: { name } } } },
      () => {
        emVooOrganizacoes--;
      },
    );
  }
  return respostaAssincrona({ data: { data: [] } }, () => {});
});

const { LOTE_DE_ORGS, getStaleDeals } = require('../src/agendor');

before(() => {
  mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
});

after(() => {
  mock.timers.reset();
});

beforeEach(() => {
  emVooOrganizacoes = 0;
  maxEmVooOrganizacoes = 0;
  totalOrganizacoes = 0;
  urlsDeOrganizacao = [];
  emVooDeals = 0;
  maxEmVooDeals = 0;
  totalDeals = 0;
  modo = 'lote-de-orgs';
  orgDeCategoriaExcluida = null;
});

test('(1) 25 organizações únicas: a consulta de categoria respeita um teto de CONCORRÊNCIA', async () => {
  modo = 'lote-de-orgs';

  await getStaleDeals(15);

  // As duas asserções abaixo são COMPLEMENTARES e nenhuma das duas basta sozinha.
  // O total sozinho ficaria verde no estado defeituoso, porque o defeito não é fazer requisições
  // demais — é fazê-las todas ao mesmo tempo. E o teto sozinho ficaria verde num "conserto" que
  // simplesmente consultasse menos organizações, o que trocaria custo por resultado errado: uma
  // organização não consultada é uma exclusão por categoria que deixa de acontecer.
  assert.equal(
    totalOrganizacoes,
    ORGS_UNICAS,
    'uma consulta por organização ÚNICA, nem mais nem menos — limitar a concorrência não pode mudar quantas organizações são consultadas',
  );

  assert.ok(
    maxEmVooOrganizacoes <= LOTE_DE_ORGS,
    `o fan-out da borda de categorias não pode ser proporcional ao volume de dados: máximo em voo medido = ${maxEmVooOrganizacoes}, teto = ${LOTE_DE_ORGS}`,
  );

  // Guarda de não-vacuidade. O tamanho da fixture não deriva do teto (ver ORGS_UNICAS), então a
  // relação entre os dois é asserida aqui: se alguém subir LOTE_DE_ORGS até perto de ORGS_UNICAS,
  // a asserção acima passaria a ser trivialmente verdadeira e o caso deixaria de medir qualquer
  // coisa. Esta linha fica vermelha antes disso e obriga a fixture a crescer junto.
  assert.ok(
    LOTE_DE_ORGS < ORGS_UNICAS,
    'a fixture precisa ser maior que o teto, senão o caso (1) fica vacuamente verde',
  );
});

test('(2) SIMÉTRICO — o resultado não muda: uma consulta por organização e a categoria excluída continua excluída', async () => {
  modo = 'lote-de-orgs';
  orgDeCategoriaExcluida = ORG_DO_PARCEIRO;

  const ids = (await getStaleDeals(15)).map((d) => d.id);

  // Este é o par que FECHA o achado. Limitar a concorrência é metade do conserto; a outra metade é
  // não perder nem reordenar nenhuma resposta. Um lote implementado com `Promise.all` sobre um
  // índice errado devolveria categorias TROCADAS, e o sintoma seria uma organização excluída sendo
  // NOTIFICADA — exatamente o fail-open que CR3-01 fechou, reaberto por caminho novo. Por isso o
  // caso verifica por VALOR (quais ids entraram e qual ficou fora), não por tamanho da lista.
  assert.equal(
    totalOrganizacoes,
    ORGS_UNICAS,
    'uma consulta por organização única, nunca uma por negócio — o oráculo do caso (2) de agendor.cacheInvalidation.test.js, medido aqui sob 25 organizações',
  );

  assert.equal(
    new Set(urlsDeOrganizacao).size,
    urlsDeOrganizacao.length,
    'houve consulta repetida da mesma organização dentro de uma única execução',
  );

  assert.equal(
    ids.includes(ID_DO_NEGOCIO_PARCEIRO),
    false,
    'o negócio da organização "Parceiro" precisa continuar FORA da lista: a associação id/categoria não pode se perder no lote',
  );

  const esperados = NEGOCIOS_SINTETICOS.map((d) => d.id).filter(
    (id) => id !== ID_DO_NEGOCIO_PARCEIRO,
  );
  assert.deepStrictEqual(
    ids,
    esperados,
    'os demais negócios continuam na lista, na mesma ordem — o lote muda QUANDO as requisições saem, não O QUE a função devolve',
  );
});

test('(3) IRMÃO VERIFICADO — o lote da paginação de negócios continua com o seu próprio teto', async () => {
  modo = 'paginacao';

  await getStaleDeals(15);

  // Este caso existe para VERIFICAR o irmão em vez de presumi-lo pela leitura: a paginação de
  // negócios é o outro `Promise.all` de agendor.js, e é o único do módulo que já tinha lote
  // próprio antes deste plano. Uma correção só está fechada quando as construções gêmeas foram
  // MEDIDAS — mesmo papel do caso (8) de agendor.paginacao.test.js.
  //
  // O número 5 é lido do código e NÃO derivado de constante exportada, de propósito: o `batchSize`
  // da paginação não é exportado hoje. Se alguém o exportar, este caso deve passar a derivá-lo; até
  // lá, a divergência entre os dois lotes fica visível aqui em vez de escondida.
  assert.equal(
    maxEmVooDeals,
    5,
    'o lote da paginação de negócios é o batchSize de 5 — este caso mede o irmão, não o presume',
  );

  assert.equal(
    totalDeals,
    PAGINAS_ANUNCIADAS,
    'seis páginas anunciadas gastam seis requisições: a primeira sozinha, e as cinco restantes num único lote',
  );

  assert.equal(
    totalOrganizacoes,
    0,
    'todas as páginas vêm vazias de propósito: sem negócios não há organização a consultar, e o caso mede só a paginação',
  );
});
