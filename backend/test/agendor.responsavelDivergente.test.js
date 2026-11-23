// Responsável divergente: a organização mudou de dono e o negócio ficou no nome anterior.
//
// Caso real que motivou (nov/2026): a empresa Hydra Foods passou para Barbara Leite, o negócio
// 43047037 continuou com Pamela Polastro, e ela recebia o aviso diário olhando a EMPRESA — outro
// dono, atualizações recentes — sem entender por quê. O campo novo só INFORMA o e-mail; ele NÃO
// pode mudar quem entra na lista. As duas coisas são medidas aqui, nos dois caminhos que trazem o
// dono da organização: a listagem em lote (prefetch) e a consulta por id.
require('./setup');

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');

const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

function negocio(id, ownerId, orgId) {
  return {
    id,
    title: `Negócio ${id}`,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    owner: { id: ownerId, name: `Dono ${ownerId}` },
    author: { id: ownerId, name: `Dono ${ownerId}` },
    organization: orgId ? { id: orgId, name: `Org ${orgId}` } : null,
    dealStatus: { id: 1 },
    dealStage: { name: 'Negociação', funnel: { name: 'Comercial' } },
    _webUrl: `https://web.agendor.com.br/deal/${id}`,
  };
}

const NEGOCIOS = [
  negocio(1, 11, 301), // org com OUTRO dono -> divergente
  negocio(2, 11, 302), // org com o MESMO dono -> não divergente
  negocio(3, 11, 303), // org sem dono informado -> não divergente
  negocio(4, 11, null), // sem organização -> não divergente
  negocio(5, 11, 304), // org cuja consulta por id falha -> não divergente
];

const ORGS = {
  301: {
    id: 301,
    category: { name: 'Lead' },
    ownerUser: { id: 12, name: 'Outra Pessoa' },
  },
  302: {
    id: 302,
    category: { name: 'Lead' },
    ownerUser: { id: 11, name: 'Dono 11' },
  },
  303: { id: 303, category: { name: 'Lead' } },
  304: {
    id: 304,
    category: { name: 'Lead' },
    ownerUser: { id: 13, name: 'Terceira' },
  },
};

// 'lote': a listagem /organizations resolve tudo. 'id': a listagem falha e cada organização é
// consultada uma a uma (a 304 falha também, para cobrir a sentinela de categoria indecidível).
let modo = 'lote';

installFakeAxios((url) => {
  if (url === '/deals') {
    return { data: { data: NEGOCIOS, meta: { totalCount: NEGOCIOS.length } } };
  }
  if (url === '/organizations') {
    if (modo === 'id') throw new Error('listagem indisponível');
    return { data: { data: Object.values(ORGS), meta: { totalCount: 4 } } };
  }
  if (url.startsWith('/organizations/')) {
    const id = Number(url.split('/').pop());
    if (id === 304) throw new Error('falha simulada');
    return { data: { data: ORGS[id] } };
  }
  return { data: { data: [] } };
});

const { getStaleDeals } = require('../src/agendor');

before(() => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: FIXED_NOW });
});
after(() => mock.timers.reset());

// fetchWithRetry espera entre tentativas; o relógio falso avança essas esperas.
async function rodar() {
  const p = getStaleDeals(15);
  for (let i = 0; i < 50; i++) {
    await new Promise(setImmediate);
    mock.timers.tick(60_000);
  }
  return p;
}

const porId = (lista) => Object.fromEntries(lista.map((d) => [d.id, d]));

test('listagem em lote: marca só o negócio cuja empresa tem outro dono', async () => {
  modo = 'lote';
  const d = porId(await rodar());
  assert.deepStrictEqual(Object.keys(d).map(Number), [1, 2, 3, 4, 5]);
  assert.equal(d[1].responsavelDivergente, true);
  assert.equal(d[1].orgOwnerName, 'Outra Pessoa');
  assert.equal(d[2].responsavelDivergente, false);
  assert.equal(d[3].responsavelDivergente, false);
  assert.equal(d[3].orgOwnerName, null);
  assert.equal(d[4].responsavelDivergente, false);
  // Na listagem a 304 chega normalmente — ela também é divergente.
  assert.equal(d[5].responsavelDivergente, true);
});

test('consulta por id: mesmo resultado, e falha na consulta nunca gera aviso', async () => {
  modo = 'id';
  const lista = await rodar();
  const d = porId(lista);
  // A 304 falhou: categoria indecidível (regra antiga, intacta) e nenhum aviso de divergência.
  assert.equal(d[5].categoriaIndecidivel, true);
  assert.equal(d[5].responsavelDivergente, false);
  assert.equal(d[5].orgOwnerName, null);
  assert.equal(d[1].responsavelDivergente, true);
  assert.equal(d[1].orgOwnerName, 'Outra Pessoa');
  assert.equal(d[2].responsavelDivergente, false);
  assert.equal(d[3].responsavelDivergente, false);
});

test('o campo é só informativo: não tira nem põe negócio na lista, nem troca o dono', async () => {
  modo = 'lote';
  const lista = await rodar();
  assert.equal(lista.length, NEGOCIOS.length);
  for (const d of lista) {
    assert.equal(d.ownerId, 11, `negócio ${d.id} mudou de dono`);
    assert.equal(d.ownerName, 'Dono 11');
  }
});
