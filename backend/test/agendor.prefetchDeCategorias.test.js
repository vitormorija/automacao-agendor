// Oráculo das duas correções de 2026-09-18 no custo de `getStaleDeals` — o defeito que deixava a
// tela de negócios parados sem carregar em produção (http://10.10.15.23, atrás da VPN da Cadmus).
//
// O DEFEITO, MEDIDO CONTRA A API REAL. `fetchDealsPage` enviava `deal_status_id`, e esse nome de
// parâmetro NÃO EXISTE na borda v3 do Agendor. Um parâmetro desconhecido não é recusado: a API
// responde 200 e devolve a base inteira, em silêncio. Na conta da Cadmus, `GET /v3/deals?per_page=1`:
// `deal_status_id=1` → 6.021; sem filtro nenhum → 6.021; `dealStatus=1` → 565. Os dois primeiros
// baterem é a prova de que o parâmetro era ignorado.
//
// O custo disso não era a lentidão em si, e é por isso que vale um arquivo de teste. `getStaleDeals`
// baixava 61 páginas em vez de 6 e, pior, pagava uma requisição a `/organizations/:id` por
// organização de negócios JÁ GANHOS OU PERDIDOS — porque o filtro de status por payload roda depois
// da fase de categorias. Sob esse volume a Agendor devolve HTTP 429 nas consultas de organização,
// `getOrgCategory` esgota o retry e grava CATEGORIA_INDECIDIVEL — e negócio indecidível fica FORA
// do envio. Ou seja: o parâmetro errado SUPRIMIA NOTIFICAÇÃO, que é exatamente o modo de falha que
// esta suíte existe para impedir. A medição de 2026-09-18 pegou isso acontecendo com uma
// organização real ("Ayvens (Ald/Leaseplan)").
//
// A SEGUNDA CORREÇÃO. Com o parâmetro certo, a fase de categorias ainda fazia 252 consultas por id,
// 31 delas respondidas com 429, somando 117 s — contra `proxy_read_timeout 60s` do nginx
// (deploy/nginx.conf). O 504 do nginx chega ao navegador como página HTML e o `await
// dealsRes.json()` de frontend/src/components/DealsList.jsx quebra com `Unexpected token '<'`: é
// literalmente a tela que não carrega. Medido também que o limite do Agendor é de QUOTA ACUMULADA e
// não de paralelismo — baixar a concorrência de 10 para 3 PIOROU o número de 429. Contra quota a
// defesa é pedir menos vezes, e a listagem `/organizations` traz 100 categorias por requisição.
//
// O QUE ESTE ARQUIVO NÃO MEDE, e por quê: concorrência em voo. Isso é o oráculo de
// agendor.loteDeOrganizacoes.test.js, que continua byte a byte e roda como REGRESSÃO do caminho por
// id — o caminho que o prefetch NÃO substitui, só reduz. Aqui o instrumento é a CONTAGEM de
// requisições por borda e, nos casos simétricos, o RESULTADO por valor.
//
// Convenção (WR2-06): referências por âncora nomeada — função, identificador, arquivo ou nome de
// caso —, nunca por número de linha.
require('./setup');

const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');

// Mesmo instante dos demais arquivos de negócios, para que datas iguais signifiquem a mesma coisa
// em todos eles. now = 2026-06-01 → cutoffDate de 15 dias = 2026-05-17.
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

// ── Fixtures ─────────────────────────────────────────────────────────────────
// 25 negócios, cada um com organização própria. O número é o mesmo de
// agendor.loteDeOrganizacoes.test.js de propósito: os dois arquivos medem coisas diferentes sobre
// a MESMA fase, e uma fixture comum deixa a comparação entre eles direta.
const ORGS_UNICAS = 25;

// 3 páginas de listagem (300 organizações) contra 25 organizações necessárias. A relação é o que
// faz o prefetch COMPENSAR — e ela é asserida explicitamente no caso (2), para que ninguém mexa em
// um dos dois números e deixe o caso vacuamente verde.
const TOTAL_DE_ORGS_NA_CONTA = 300;
const PAGINAS_DA_LISTAGEM = Math.ceil(TOTAL_DE_ORGS_NA_CONTA / 100);

const PRIMEIRO_ORG_ID = 2000;

// A organização de categoria excluída. Fica no MEIO da fixture, e não nas pontas: um prefetch que
// associe a categoria ao índice errado tende a acertar as pontas por acidente.
const INDICE_DO_PARCEIRO = 13;
const ORG_DO_PARCEIRO = PRIMEIRO_ORG_ID + INDICE_DO_PARCEIRO;

// A organização do caso (4): existe nos negócios e NÃO aparece na listagem. É o buraco que o
// fail-safe precisa tapar — uma organização criada entre duas páginas, por exemplo.
const INDICE_DO_AUSENTE = 7;
const ORG_AUSENTE_DA_LISTAGEM = PRIMEIRO_ORG_ID + INDICE_DO_AUSENTE;

function negocioSintetico(indice) {
  const id = 1000 + indice;
  const orgId = PRIMEIRO_ORG_ID + indice;
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

// Categoria devolvida por AMBAS as bordas para a mesma organização — a listagem e a consulta por
// id precisam concordar, senão um caso simétrico mediria a divergência do stub e não do código.
function categoriaDaOrg(orgId) {
  return orgId === ORG_DO_PARCEIRO ? 'Parceiro' : 'Lead';
}

// A página `p` da listagem, no envelope da Agendor. Os ids são contíguos a partir de
// PRIMEIRO_ORG_ID, então as 25 organizações necessárias caem todas na primeira página — exceto a
// do caso (4), que é omitida quando `omitirDaListagem` está ligado.
function paginaDeOrganizacoes(p) {
  const inicio = (p - 1) * 100;
  const fim = Math.min(inicio + 100, TOTAL_DE_ORGS_NA_CONTA);
  const registros = [];
  for (let i = inicio; i < fim; i++) {
    const id = PRIMEIRO_ORG_ID + i;
    if (omitirDaListagem && id === ORG_AUSENTE_DA_LISTAGEM) continue;
    registros.push({
      id,
      name: `Org ${id}`,
      category: { name: categoriaDaOrg(id) },
    });
  }
  return {
    data: {
      data: registros,
      meta: { totalCount: TOTAL_DE_ORGS_NA_CONTA },
      links: p < PAGINAS_DA_LISTAGEM ? { next: `?page=${p + 1}` } : {},
    },
  };
}

// ── Instrumentação ───────────────────────────────────────────────────────────
let paramsDeDeals = [];
let listagensDeOrg = 0;
let consultasPorId = [];
let negociosDaPagina1 = NEGOCIOS_SINTETICOS;
let omitirDaListagem = false;
let listagemFalha = false;

function respostaAssincrona(payload) {
  return new Promise((resolve) => setImmediate(() => resolve(payload)));
}

installFakeAxios((url, config) => {
  if (url === '/deals') {
    paramsDeDeals.push(config?.params || {});
    const negocios = config?.params?.page === 1 ? negociosDaPagina1 : [];
    return respostaAssincrona({
      data: { data: negocios, meta: { totalCount: negociosDaPagina1.length } },
    });
  }
  // A listagem (`/organizations`) e a consulta por id (`/organizations/<id>`) são bordas
  // DIFERENTES e contadas separadamente — é essa separação que torna os casos (2) e (5)
  // conferíveis. A ordem dos dois `if` importa: `/organizations/` também começa com
  // `/organizations`.
  if (url.startsWith('/organizations/')) {
    const id = Number(url.split('/').pop());
    consultasPorId.push(id);
    return respostaAssincrona({
      data: { data: { category: { name: categoriaDaOrg(id) } } },
    });
  }
  if (url === '/organizations') {
    listagensDeOrg++;
    if (listagemFalha) {
      // 500 e não 429: `fetchWithRetry` só retenta 429, então um 500 falha na primeira
      // requisição e o caso mede a DESISTÊNCIA, sem depender de relógio falso para as esperas.
      const err = new Error('Request failed with status code 500');
      err.response = { status: 500 };
      return Promise.reject(err);
    }
    return respostaAssincrona(paginaDeOrganizacoes(config?.params?.page ?? 1));
  }
  return respostaAssincrona({ data: { data: [] } });
});

const { getStaleDeals, LOTE_DE_PAGINAS_DE_ORG } = require('../src/agendor');

before(() => {
  mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
});

after(() => {
  mock.timers.reset();
});

beforeEach(() => {
  paramsDeDeals = [];
  listagensDeOrg = 0;
  consultasPorId = [];
  negociosDaPagina1 = NEGOCIOS_SINTETICOS;
  omitirDaListagem = false;
  listagemFalha = false;
});

test('(1) o filtro de status vai em `dealStatus` — `deal_status_id` é ignorado pela borda e devolve a base inteira', async () => {
  await getStaleDeals(15);

  assert.ok(paramsDeDeals.length > 0, 'a fixture precisa exercitar /deals');
  for (const params of paramsDeDeals) {
    assert.equal(
      params.dealStatus,
      1,
      'toda página de /deals precisa levar dealStatus=1, senão a borda devolve negócios ganhos, perdidos e congelados',
    );
    // A asserção negativa é a que fecha o caso. Enviar o nome errado JUNTO com o certo não
    // quebraria nada visível — a API ignoraria o desconhecido — e o defeito voltaria a existir no
    // código sem nenhum sinal.
    assert.ok(
      !('deal_status_id' in params),
      '`deal_status_id` não existe na API v3 do Agendor: enviá-lo não filtra nada e mascara o parâmetro correto',
    );
  }
});

test('(2) com muitas organizações, a listagem substitui as consultas por id', async () => {
  await getStaleDeals(15);

  assert.equal(
    listagensDeOrg,
    PAGINAS_DA_LISTAGEM,
    'a listagem pagina até o fim: uma requisição por página anunciada em meta.totalCount',
  );
  assert.deepEqual(
    consultasPorId,
    [],
    'nenhuma organização deveria sobrar para consulta individual — todas as 25 estão na listagem',
  );

  // Guarda de não-vacuidade. Se alguém mexer nas fixturas até a listagem custar MAIS requisições
  // que as consultas por id, o código passa a escolher o caminho por id — corretamente — e as duas
  // asserções acima ficariam medindo o contrário do que este caso descreve. Esta linha fica
  // vermelha antes disso.
  assert.ok(
    PAGINAS_DA_LISTAGEM < ORGS_UNICAS,
    'a fixture só exercita o prefetch enquanto a listagem custar menos requisições que as consultas por id',
  );
});

test('(3) SIMÉTRICO — o resultado não muda: a categoria excluída continua excluída quando vem da listagem', async () => {
  const ids = (await getStaleDeals(15)).map((d) => d.id);

  // Verificado por VALOR, e não por tamanho: um prefetch que associe a categoria ao id errado
  // devolveria a lista com o tamanho certo e o negócio errado dentro — que é o fail-open de
  // CR3-01 reaberto por caminho novo, uma organização 'Parceiro' voltando a ser notificada.
  assert.ok(
    !ids.includes(ID_DO_NEGOCIO_PARCEIRO),
    'o negócio da organização "Parceiro" tem de ficar fora, venha a categoria da listagem ou da consulta por id',
  );
  assert.equal(
    ids.length,
    ORGS_UNICAS - 1,
    'exatamente um negócio sai pela regra de categoria — nenhum outro pode se perder no caminho',
  );
});

test('(4) organização ausente da listagem cai no caminho por id — o prefetch é otimização, nunca decisão', async () => {
  omitirDaListagem = true;

  const ids = (await getStaleDeals(15)).map((d) => d.id);

  assert.deepEqual(
    consultasPorId,
    [ORG_AUSENTE_DA_LISTAGEM],
    'só a organização que faltou na listagem é consultada por id — as outras 24 vieram do lote',
  );
  assert.equal(
    ids.length,
    ORGS_UNICAS - 1,
    'o negócio da organização ausente continua na lista: faltar no lote não pode custar um negócio',
  );
});

test('(5) quando a listagem custaria mais requisições que as consultas por id, ela não é paginada', async () => {
  // Dois negócios, duas organizações, contra 3 páginas de listagem. A aritmética se inverte e o
  // caminho barato passa a ser o de antes.
  negociosDaPagina1 = NEGOCIOS_SINTETICOS.slice(0, 2);

  await getStaleDeals(15);

  assert.equal(
    listagensDeOrg,
    1,
    'uma única requisição — só a primeira página, que é o que revela totalCount e permite comparar os dois custos',
  );
  assert.deepEqual(
    consultasPorId.sort((a, b) => a - b),
    [PRIMEIRO_ORG_ID, PRIMEIRO_ORG_ID + 1],
    'com poucas organizações o caminho por id é o mais barato e continua sendo o usado',
  );
});

test('(6) listagem que falha não custa nenhum negócio: tudo cai no caminho por id', async () => {
  listagemFalha = true;

  const ids = (await getStaleDeals(15)).map((d) => d.id);

  assert.equal(
    consultasPorId.length,
    ORGS_UNICAS,
    'falhando o lote, as 25 organizações são consultadas uma a uma — o comportamento anterior, íntegro',
  );
  assert.ok(
    !ids.includes(ID_DO_NEGOCIO_PARCEIRO),
    'a exclusão por categoria continua valendo pelo caminho de reserva',
  );
  assert.equal(
    ids.length,
    ORGS_UNICAS - 1,
    'o pior caso do prefetch é ser exatamente o comportamento de antes, nunca uma lista menor',
  );
});

test('(7) o lote de páginas da listagem tem teto de concorrência declarado', () => {
  // A listagem é a borda nova, e ela pagina em paralelo. Sem teto, uma conta grande dispararia
  // todas as páginas de uma vez contra a MESMA quota cujo estouro este trabalho veio corrigir. O
  // valor é medido (ver o comentário da constante em agendor.js); o que este caso impede é que ele
  // desapareça ou vire algo que não limita nada.
  assert.equal(
    typeof LOTE_DE_PAGINAS_DE_ORG,
    'number',
    'o teto precisa ser exportado para que este oráculo o DERIVE em vez de duplicar o literal',
  );
  assert.ok(
    LOTE_DE_PAGINAS_DE_ORG >= 1 && LOTE_DE_PAGINAS_DE_ORG <= 10,
    `teto de páginas em voo fora da faixa medida como segura contra a quota do Agendor: ${LOTE_DE_PAGINAS_DE_ORG}`,
  );
});
