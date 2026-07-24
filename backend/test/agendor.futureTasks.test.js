// Caracterização (golden) de getDealsWithFutureTasks: roda a função REAL contra uma
// instância axios stubada (borda HTTP, D-05) e um relógio fixo (mock.timers). Pina o
// comportamento ATUAL — não o ideal: inclui deal sse a tarefa está aberta (!finishedAt),
// tem deal.id, e dueDate ESTRITAMENTE no futuro (`>`); exclui finalizada, passado e
// igualdade exata; para a paginação quando a página traz < 100 tarefas. WR-02: fecha a
// lacuna de 0% do gargalo que o scheduler usa para decidir quem NÃO é notificado.
require('./setup');

const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');

// Relógio fixo: now = 2026-06-01T00:00:00.000Z. As tarefas expressam dueDate/finishedAt
// como ISO literais relativos a esse instante, tornando "futuro/passado" determinístico
// (RESEARCH Pitfall 5 — sem isso, new Date() real deixa o teste flaky).
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

// ── Fixtures inline de tarefas (envelope Agendor: { data: { data: [...] } }) ──────────
// Cada tarefa carrega um caso de caracterização auto-descrito pelo comentário.
const FUTURO = '2026-07-01T00:00:00.000Z'; // > FIXED_NOW
const PASSADO = '2026-05-01T00:00:00.000Z'; // < FIXED_NOW
const AGORA = '2026-06-01T00:00:00.000Z'; // === FIXED_NOW (blindagem do `>` estrito)

// Tarefas significativas da página 1 (casos a, b, c, c2, e + o P1 da paginação).
const TASKS_SIGNIFICATIVAS = [
  // (a) aberta + dueDate futuro -> deal 501 ENTRA no Set
  { finishedAt: null, dueDate: FUTURO, deal: { id: 501 } },
  // (b) finalizada (finishedAt preenchido), dueDate futuro -> deal 502 EXCLUÍDO
  { finishedAt: '2026-05-20T00:00:00.000Z', dueDate: FUTURO, deal: { id: 502 } },
  // (c) aberta, mas dueDate no passado -> deal 503 EXCLUÍDO
  { finishedAt: null, dueDate: PASSADO, deal: { id: 503 } },
  // (c2) aberta, dueDate === FIXED_NOW exato -> deal 504 EXCLUÍDO (`>` estrito exclui igualdade)
  { finishedAt: null, dueDate: AGORA, deal: { id: 504 } },
  // (e) aberta, dueDate futuro, mas SEM deal.id -> guard t.deal?.id não adiciona nada
  { finishedAt: null, dueDate: FUTURO, deal: null },
  // (d) P1 da paginação: aberta + futuro na página 1 -> deal 601 ENTRA
  { finishedAt: null, dueDate: FUTURO, deal: { id: 601 } },
];

// Preenche a página 1 até EXATAMENTE 100 tarefas (gatilho da paginação: SUT só faz
// page++ quando tasks.length === 100). O recheio são tarefas finalizadas -> inertes.
const RECHEIO = Array.from({ length: 100 - TASKS_SIGNIFICATIVAS.length }, (_, i) => ({
  finishedAt: '2026-05-20T00:00:00.000Z',
  dueDate: FUTURO,
  deal: { id: 700 + i },
}));

const PAGE_1 = [...TASKS_SIGNIFICATIVAS, ...RECHEIO]; // 100 tarefas -> força página 2
// (d) P2 da paginação: página 2 traz < 100 tarefas (aqui 1) -> SUT para após processá-la.
const PAGE_2 = [{ finishedAt: null, dueDate: FUTURO, deal: { id: 602 } }];

// Instala o stub ANTES de exigir agendor.js (a instância `api` é criada no load).
// Ramifica por config.params.page para simular as duas páginas de /tasks.
const fake = installFakeAxios((url, config) => {
  if (url === '/tasks') {
    const page = config?.params?.page;
    return { data: { data: page === 1 ? PAGE_1 : PAGE_2 } };
  }
  return { data: { data: [] } };
});

const { getDealsWithFutureTasks } = require('../src/agendor');

before(() => {
  mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
});

after(() => {
  mock.timers.reset();
});

// Zera o contador de chamadas antes de cada teste para que a asserção de callCount do
// caso (d) reflita UMA única invocação de getDealsWithFutureTasks (o mock.fn acumula).
beforeEach(() => {
  fake.get.mock.resetCalls();
});

test('(a) tarefa aberta com dueDate futuro -> deal incluído no Set', async () => {
  const result = await getDealsWithFutureTasks();
  // Por quê: é exatamente o "negócio protegido" que o scheduler deve pular na notificação.
  assert.equal(result.has(501), true);
});

test('(b) tarefa finalizada -> deal excluído mesmo com dueDate futuro', async () => {
  const result = await getDealsWithFutureTasks();
  // Por quê: finishedAt truthy derruba o deal; um futuro não "ressuscita" tarefa concluída.
  assert.equal(result.has(502), false);
});

test('(c) tarefa aberta com dueDate no passado -> deal excluído', async () => {
  const result = await getDealsWithFutureTasks();
  // Por quê: só prazo futuro "protege"; prazo vencido não conta como tarefa futura.
  assert.equal(result.has(503), false);
});

test('(c2) blindagem `>` estrito: dueDate === FIXED_NOW exato -> deal excluído', async () => {
  const result = await getDealsWithFutureTasks();
  // Blindagem: o SUT usa `new Date(t.dueDate) > now` (ESTRITO). Igualdade exata NÃO entra.
  // Se algum dia `>` virar `>=`, o deal 504 passaria a entrar e este teste quebra — de propósito.
  assert.equal(result.has(504), false);
});

test('(d) paginação: para em página < 100 e agrega deals das duas páginas', async () => {
  const result = await getDealsWithFutureTasks();
  // Por quê: o gargalo pagina /tasks; um off-by-one na condição de break (tasks.length < 100)
  // silenciaria deals de páginas seguintes. P1 (pág. 1) e P2 (pág. 2) devem ambos estar no Set.
  assert.equal(result.has(601), true);
  assert.equal(result.has(602), true);
  // Prova a parada: página 1 = 100 tarefas força page++, página 2 = 1 tarefa (<100) encerra.
  assert.equal(fake.get.mock.callCount(), 2);
});

test('(e) tarefa sem deal.id -> guard t.deal?.id não adiciona nada; Set final é exatamente {501,601,602}', async () => {
  const result = await getDealsWithFutureTasks();
  // Por quê: a única saída observável de getDealsWithFutureTasks é o conjunto de ids.
  // Só sobrevivem os abertos + futuros + com deal.id: 501 (pág.1), 601 (pág.1), 602 (pág.2).
  // A tarefa sem deal (caso e) e as finalizadas/passadas/iguais não geram entradas.
  assert.deepStrictEqual([...result].sort((a, b) => a - b), [501, 601, 602]);
});

test('não faz chamada de rede real (axios.create stubado)', async () => {
  // Se o stub não estivesse instalado antes do require('../src/agendor'), a instância
  // axios real teria sido criada e a chamada tentaria a API Agendor. Rodar sub-segundo
  // comprova que a borda HTTP está mockada (mesmo padrão do golden de getStaleDeals).
  const result = await getDealsWithFutureTasks();
  assert.ok(result instanceof Set);
});
