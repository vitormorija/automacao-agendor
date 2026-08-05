// Teste do NOVO comportamento (WR-02) — a consulta de tarefas futuras não retenta HTTP 429.
//
// Por que isso é confiabilidade e não detalhe de rede: desde o 04-02 (REL-06 / Decisão Q2)
// `getDealsWithFutureTasks` propaga QUALQUER falha, e essa rejeição aborta a rodada inteira antes
// do laço de envio (pinado por scheduler.failsafe.test.js Q2-1: zero e-mails, zero linhas de log).
// Como o cron é DIÁRIO, um 429 transitório — o erro que a API Agendor usa justamente para dizer
// "tente de novo" — custa 24 HORAS SEM NENHUMA NOTIFICAÇÃO, em silêncio: o único vestígio é uma
// string em `results.error` que ninguém lê a menos que abra o dashboard. E 429 é provável
// exatamente aqui, porque runCheck (scheduler.js) dispara `getStaleDeals`, `getUsers` e
// `getDealsWithFutureTasks` no MESMO `Promise.all`, martelando a API simultaneamente.
//
// A decisão Q2 ("Set completo ou falha explícita") NÃO é revisitada: o caso 2 existe para provar
// que, esgotadas as tentativas, a falha continua propagando. O que muda é só a rede de segurança
// que o caminho irmão (`/deals`) já tem ANTES de a falha virar explícita.
//
// Os 4 casos:
//   (1) 429 transitório em /tasks é retentado e a chamada conclui  — HOJE FALHA
//   (2) 429 sempre: rejeita depois de EXATAMENTE 3 requisições      — HOJE FALHA (só 1 requisição)
//   (3) timeout (sem err.response) propaga na 1ª requisição (D-01)  — já passa; blindagem
//   (4) caracterização do 429 em /deals: golden [101, 103] com 2 requisições à página 1
//       — já passa; é o oráculo que impede a extração do laço de mudar a política de 429
//
// ── Extensão do 04-22 (WR3-01) ────────────────────────────────────────────────
// O parágrafo acima usa "runCheck dispara getStaleDeals, getUsers e getDealsWithFutureTasks no
// MESMO Promise.all" como MOTIVO para o retry — e, no entanto, `/users` continuava fora dele. O
// comentário da política em agendor.js (fetchWithRetry) abria com "Política ÚNICA de retry da
// borda Agendor" enquanto o helper cobria duas das cinco chamadas do módulo. Nada do raciocínio
// do cabeçalho é específico de `/tasks`: as duas bordas que faltavam entram aqui.
//
//   (5) 429 transitório em /users é retentado e a chamada conclui       — HOJE FALHA
//   (6) SIMÉTRICO (exaustão): 429 sempre em /users rejeita com 3 req.   — HOJE FALHA (1 req.)
//   (7) SIMÉTRICO (direção oposta): timeout em /users com 1 requisição  — já passa; blindagem
//   (8) 429 transitório em /deals/:id, e id inválido com ZERO requisição — HOJE FALHA
require('./setup');

const { test, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');
const { avancarRelogioAte } = require('./helpers/fakeTimers');

// Relógio fixo, com `setTimeout` TAMBÉM mockado: as esperas entre tentativas são de 5s e 10s
// reais, e sem relógio falso este arquivo levaria 15s de parede por caso de exaustão.
// Mockar `setTimeout` aqui não congela mais nada do SUT: a única outra espera do módulo é a
// pausa de 1s entre lotes de páginas de `getStaleDeals` (agendor.js), e ela nunca é atingida
// porque o
// `meta.totalCount` da fixture cabe em UMA página.
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

const dealsPage = require('./fixtures/synthetic/deals-page.json');

// Mesmo mapa de categorias do golden de getStaleDeals: sem ele a organização 205 deixaria de ser
// 'Parceiro' e o deal 105 entraria na lista, quebrando o golden por um motivo alheio ao 429.
const ORG_CATEGORY = {
  205: 'Parceiro',
};

// Resposta boa de /tasks: UMA tarefa aberta com prazo futuro apontando para o deal 101 — assim o
// Set resultante é verificável por VALOR, não só por tamanho. Uma página com menos de 100 tarefas
// encerra a paginação, então cada invocação bem-sucedida gasta exatamente uma requisição.
const TAREFAS_OK = [
  { finishedAt: null, dueDate: '2026-07-01T00:00:00.000Z', deal: { id: 101 } },
];

// Resposta boa de /users: UMA página com UM usuário e SEM `links.next`, para que a paginação de
// getUsers encerre na primeira requisição — assim cada invocação bem-sucedida gasta exatamente
// uma requisição e o contador mede tentativas, não páginas. O e-mail vem em `contact.email`,
// que é onde getUsers o lê; é ele que resolve o destinatário de cada negócio parado.
const USUARIOS_OK = [
  { id: 11, name: 'Ana Vendas', contact: { email: 'ana@exemplo.invalid' } },
];

// Resposta boa de /deals/:id — o envelope que getDealById desembrulha (`data.data`).
const DEAL_POR_ID = { id: 4242, title: 'Negócio consultado por id' };

// ── Controle mutável das bordas ───────────────────────────────────────────────
// O stub NUNCA é reinstalado entre casos (depois do require de agendor.js a instância `api` já
// existe e um novo mock.method não teria efeito): o routeHandler ramifica por estas variáveis.
let chamadasTasks = 0;
let chamadasDeals = 0;
let chamadasUsers = 0;
let chamadasDealById = 0;
let modoTasks = 'ok'; // 'ok' | '429-uma-vez' | '429-sempre' | 'timeout'
let modoDeals = 'ok'; // 'ok' | '429-uma-vez'
let modoUsers = 'ok'; // 'ok' | '429-uma-vez' | '429-sempre' | 'timeout'
let modoDealById = 'ok'; // 'ok' | '429-uma-vez' | '429-sempre' | 'timeout'

// Erro fiel ao que o axios produz num rate limit: o que o retry consulta é a PRESENÇA de
// `err.response.status`.
function erro429() {
  return Object.assign(new Error('Request failed with status code 429'), {
    response: { status: 429 },
  });
}

// Erro fiel a um timeout de client (mesmo molde do erro sintético de agendor.timeout.test.js):
// ECONNABORTED e,
// o que importa aqui, SEM `response`. É a AUSÊNCIA de `response` que mantém o timeout fora do
// retry (D-01) — retentá-lo levaria o pior caso de uma requisição de ~15s para ~60s.
function erroDeTimeout() {
  return Object.assign(new Error('timeout of 15000ms exceeded'), {
    code: 'ECONNABORTED',
  });
}

// Instala o stub ANTES de exigir agendor.js (a instância `api` nasce no load do módulo).
const fake = installFakeAxios((url) => {
  if (url === '/tasks') {
    chamadasTasks++;
    if (modoTasks === '429-sempre') return Promise.reject(erro429());
    if (modoTasks === '429-uma-vez' && chamadasTasks === 1) {
      return Promise.reject(erro429());
    }
    if (modoTasks === 'timeout') return Promise.reject(erroDeTimeout());
    return { data: { data: TAREFAS_OK } };
  }
  if (url === '/deals') {
    chamadasDeals++;
    if (modoDeals === '429-uma-vez' && chamadasDeals === 1) {
      return Promise.reject(erro429());
    }
    return {
      data: {
        data: dealsPage,
        meta: { totalCount: dealsPage.length },
        links: {},
      },
    };
  }
  if (url === '/users') {
    chamadasUsers++;
    if (modoUsers === '429-sempre') return Promise.reject(erro429());
    if (modoUsers === '429-uma-vez' && chamadasUsers === 1) {
      return Promise.reject(erro429());
    }
    if (modoUsers === 'timeout') return Promise.reject(erroDeTimeout());
    return { data: { data: USUARIOS_OK, links: {} } };
  }
  // A consulta de UM negócio por id. A comparação é por PREFIXO COM BARRA de propósito: a rota
  // `/deals` acima é `===`, e uma checagem de prefixo sem a barra ('/deals') capturaria também a
  // paginação de negócios, quebrando os casos (1)-(4) com um contador que não é o deles.
  if (url.startsWith('/deals/')) {
    chamadasDealById++;
    if (modoDealById === '429-sempre') return Promise.reject(erro429());
    if (modoDealById === '429-uma-vez' && chamadasDealById === 1) {
      return Promise.reject(erro429());
    }
    if (modoDealById === 'timeout') return Promise.reject(erroDeTimeout());
    return { data: { data: DEAL_POR_ID } };
  }
  if (url.startsWith('/organizations/')) {
    const id = Number(url.split('/').pop());
    return {
      data: { data: { category: { name: ORG_CATEGORY[id] || 'Lead' } } },
    };
  }
  return { data: { data: [] } };
});

const {
  getDealById,
  getDealsWithFutureTasks,
  getStaleDeals,
  getUsers,
} = require('../src/agendor');

// Este arquivo chamava `avancarRelogioAte` (helpers/fakeTimers.js) através de um envelope local
// que normalizava o desfecho para um VALOR antes de relançar — necessário enquanto o helper só
// observava a promessa pelo caminho de SUCESSO e substituía o erro real por "a promessa não
// concluiu", mensagem que esconderia o 429 que este arquivo inteiro está medindo. O 04-13 (WR2-03)
// levou essa normalização para DENTRO do helper compartilhado, então o envelope deixou de ter o
// que compensar e foi removido: as chamadas abaixo são diretas.
//
// NÃO resta nenhuma variante em circulação: `backend/test/helpers/fakeTimers.js` é a ÚNICA
// implementação de `avancarRelogioAte` desde o 04-26 (WR3-05), que removeu a última — a de
// `emailer.timeout.test.js`. Quem precisar avançar relógio falso importa de lá; a nota de topo
// daquele helper é a fonte da verdade sobre o assunto e enumera as três que convergiram para ele.

after(() => {
  mock.timers.reset();
});

// Contadores, modos E RELÓGIO voltam ao estado inicial antes de cada caso.
//
// Rearmar o relógio não é zelo decorativo: avançar o tempo é o mecanismo que faz as esperas do
// retry resolverem, então cada caso que retenta DEIXA o relógio adiantado (10s por tick) para o
// caso seguinte. Com um `before` único, o caso (4) rodava com `now` já em 00:00:30 — e o cutoff
// de 15 dias andava junto, fazendo os deals 102 e 104 (que existem na fixture justamente para
// pinar a fronteira estrita do dia) entrarem no golden. O caso ficaria vermelho por contaminação
// de ordem, não por defeito de produção. `reset()` antes de `enable()` porque `enable()` lança se
// os timers já estiverem habilitados.
beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: FIXED_NOW });
  chamadasTasks = 0;
  chamadasDeals = 0;
  chamadasUsers = 0;
  chamadasDealById = 0;
  modoTasks = 'ok';
  modoDeals = 'ok';
  modoUsers = 'ok';
  modoDealById = 'ok';
  fake.get.mock.resetCalls();
});

test('(1) 429 transitório em /tasks é retentado e a rodada conclui', async () => {
  modoTasks = '429-uma-vez';

  const tarefas = await avancarRelogioAte(getDealsWithFutureTasks());

  // O ponto do caso: um rate limit momentâneo NÃO pode custar o dia inteiro de notificações.
  assert.equal(
    tarefas.has(101),
    true,
    'o Set precisa sair COMPLETO da retentativa — é ele que decide quem NÃO é notificado',
  );
  assert.equal(
    chamadasTasks,
    2,
    'a 1ª requisição levou 429 e a 2ª foi a retentativa',
  );
});

test('(2) 429 sempre: esgotadas as 3 tentativas, a falha PROPAGA (o fail-safe de REL-06 fica intacto)', async () => {
  modoTasks = '429-sempre';

  await assert.rejects(
    () => avancarRelogioAte(getDealsWithFutureTasks()),
    /429/,
    'retry não pode virar "engolir o erro": um Set parcial notificaria indevidamente deals que TÊM tarefa futura (Decisão Q2)',
  );

  // Blindagem contra retry sem teto: sem o limite, uma indisponibilidade real prenderia a rodada
  // indefinidamente e o lock de scheduler.js nunca seria liberado.
  assert.equal(chamadasTasks, 3, 'três tentativas, nem mais nem menos');
});

test('(3) timeout NÃO é retentado: propaga na PRIMEIRA requisição (D-01)', async () => {
  modoTasks = 'timeout';

  await assert.rejects(
    () => avancarRelogioAte(getDealsWithFutureTasks()),
    /timeout of 15000ms exceeded/,
    'o timeout precisa chegar ao chamador com a mensagem original',
  );

  // Espelho, do lado de /tasks, do caso (5) de agendor.timeout.test.js. Se alguém "melhorar" o
  // retry para cobrir erros de rede, o pior caso desta consulta salta de ~15s para ~60s — comendo
  // a janela do cron que o teto de tempo existe para proteger. Este contador é o alarme.
  assert.equal(
    chamadasTasks,
    1,
    'um erro sem err.response não pode entrar no ramo de 429',
  );
});

test('(4) caracterização: o 429 de /deals continua retentado, e o golden não se move', async () => {
  modoDeals = '429-uma-vez';

  const ids = (await avancarRelogioAte(getStaleDeals(15))).map((d) => d.id);

  // Este caso JÁ PASSA hoje. Ele é a rede que protege a extração do laço de retry para um helper
  // compartilhado: se a extração mudar a condição, o número de tentativas ou o tempo de espera,
  // é aqui que o estrago aparece — e não em produção, 24h depois.
  assert.deepStrictEqual(ids, [101, 103]);
  assert.equal(
    chamadasDeals,
    2,
    'a página 1 foi retentada exatamente uma vez após o 429',
  );
});

// ── 04-22 (WR3-01): as duas bordas que faltavam ──────────────────────────────

// Espelho exato do caso (1), do lado de /users — e `/users` é a mais CARA das três bordas que
// estavam de fora. Ela é consultada dentro do mesmo `Promise.all` que runCheck (scheduler.js)
// usa como pré-requisito de tudo, então uma rejeição ali aborta a rodada ANTES do laço de envio:
// zero negócios processados, zero e-mails, e o único vestígio é a string em `results.error`.
// Com o cron diário, um rate limit de segundos custa 24 horas de silêncio — e 429 é provável
// justamente aqui, porque as três consultas saem simultaneamente.
test('(5) 429 transitório em /users é retentado e a rodada conclui', async () => {
  modoUsers = '429-uma-vez';

  const users = await avancarRelogioAte(getUsers());

  // Verificação por VALOR, não por tamanho: é este dicionário que resolve o e-mail do
  // responsável de cada negócio parado. Um mapa "do tamanho certo" com o endereço errado
  // notificaria a pessoa errada e continuaria passando numa asserção de contagem.
  assert.deepStrictEqual(
    users[11],
    { id: 11, name: 'Ana Vendas', email: 'ana@exemplo.invalid' },
    'o dicionário precisa sair COMPLETO da retentativa — é ele que resolve o destinatário',
  );
  assert.equal(
    chamadasUsers,
    2,
    'a 1ª requisição levou 429 e a 2ª foi a retentativa',
  );
});

test('(6) SIMÉTRICO — 429 sempre em /users: esgotadas as 3 tentativas, a falha PROPAGA', async () => {
  modoUsers = '429-sempre';

  await assert.rejects(
    () => avancarRelogioAte(getUsers()),
    /429/,
    'retry não pode virar "engolir o erro": um dicionário de usuários PARCIAL faria negócios perderem o e-mail do responsável em silêncio',
  );

  // Este é o par obrigatório do caso (5). Sem ele, "retentar" e "devolver o que já coletei"
  // são indistinguíveis — e o segundo é a mesma classe de falha que a Decisão Q2 recusou para
  // as tarefas futuras: um resultado incompleto que a rodada trata como completo. O contrato
  // "dicionário completo ou falha" (D-WR3-01-d) não muda; o fail-safe da rodada abortada sem
  // notificar continua pinado por scheduler.failsafe.test.js.
  assert.equal(chamadasUsers, 3, 'três tentativas, nem mais nem menos');
});

test('(7) SIMÉTRICO na direção oposta — timeout em /users NÃO é retentado: propaga na PRIMEIRA requisição (D-01)', async () => {
  modoUsers = 'timeout';

  await assert.rejects(
    () => avancarRelogioAte(getUsers()),
    /timeout of 15000ms exceeded/,
    'o timeout precisa chegar ao chamador com a mensagem original',
  );

  // Mesmo alarme dos casos (3) e (5) de agendor.timeout.test.js, agora sobre a borda que
  // acabou de entrar no helper: se alguém "melhorar" o retry para cobrir erro de rede, o pior
  // caso de uma requisição salta de ~15s para ~60s — comendo a janela do cron que o teto de
  // tempo (D-01) existe para proteger. Estender a política a uma borda nova não pode, de
  // carona, alargar a política em si.
  assert.equal(
    chamadasUsers,
    1,
    'um erro sem err.response não pode entrar no ramo de 429',
  );
});

test('(8) 429 transitório em /deals/:id é retentado, e a guarda de id continua ANTES da requisição', async () => {
  modoDealById = '429-uma-vez';

  // Primeiro a guarda de tipo (WR-03), com o contador ainda zerado: um id hostil precisa ser
  // recusado SEM emitir requisição. Se a guarda tivesse migrado para dentro do callback do
  // fetchWithRetry, `'../users'` sairia TRÊS vezes pela instância compartilhada — com o token
  // de serviço no header — em vez de nenhuma. Oráculo irmão: dealId.validation.test.js.
  await assert.rejects(
    () => getDealById('../users'),
    /id de negócio inválido/,
    'a guarda de tipo precisa continuar fora do callback do retry',
  );
  assert.equal(
    chamadasDealById,
    0,
    'nenhuma requisição pode sair para um id inválido — nem uma, muito menos três',
  );

  const deal = await avancarRelogioAte(getDealById(4242));

  assert.equal(
    deal.id,
    4242,
    'a função continua desembrulhando o envelope da Agendor',
  );
  assert.equal(
    chamadasDealById,
    2,
    'a 1ª requisição levou 429 e a 2ª foi a retentativa',
  );
});
