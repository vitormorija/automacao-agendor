// Teste do NOVO comportamento (WR-02) — a consulta de tarefas futuras não retenta HTTP 429.
//
// Por que isso é confiabilidade e não detalhe de rede: desde o 04-02 (REL-06 / Decisão Q2)
// `getDealsWithFutureTasks` propaga QUALQUER falha, e essa rejeição aborta a rodada inteira antes
// do laço de envio (pinado por scheduler.failsafe.test.js Q2-1: zero e-mails, zero linhas de log).
// Como o cron é DIÁRIO, um 429 transitório — o erro que a API Agendor usa justamente para dizer
// "tente de novo" — custa 24 HORAS SEM NENHUMA NOTIFICAÇÃO, em silêncio: o único vestígio é uma
// string em `results.error` que ninguém lê a menos que abra o dashboard. E 429 é provável
// exatamente aqui, porque scheduler.js:55-59 dispara `getStaleDeals`, `getUsers` e
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
require('./setup');

const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');
const { avancarRelogioAte } = require('./helpers/fakeTimers');

// Relógio fixo, com `setTimeout` TAMBÉM mockado: as esperas entre tentativas são de 5s e 10s
// reais, e sem relógio falso este arquivo levaria 15s de parede por caso de exaustão.
// Mockar `setTimeout` aqui não congela mais nada do SUT: a única outra espera do módulo é a
// pausa de 1s entre lotes de páginas (agendor.js:209-210), e ela nunca é atingida porque o
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

// ── Controle mutável das bordas ───────────────────────────────────────────────
// O stub NUNCA é reinstalado entre casos (depois do require de agendor.js a instância `api` já
// existe e um novo mock.method não teria efeito): o routeHandler ramifica por estas variáveis.
let chamadasTasks = 0;
let chamadasDeals = 0;
let modoTasks = 'ok'; // 'ok' | '429-uma-vez' | '429-sempre' | 'timeout'
let modoDeals = 'ok'; // 'ok' | '429-uma-vez'

// Erro fiel ao que o axios produz num rate limit: o que o retry consulta é a PRESENÇA de
// `err.response.status`.
function erro429() {
  return Object.assign(new Error('Request failed with status code 429'), {
    response: { status: 429 },
  });
}

// Erro fiel a um timeout de client (mesmo molde de agendor.timeout.test.js:45-49): ECONNABORTED e,
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
  if (url.startsWith('/organizations/')) {
    const id = Number(url.split('/').pop());
    return {
      data: { data: { category: { name: ORG_CATEGORY[id] || 'Lead' } } },
    };
  }
  return { data: { data: [] } };
});

const { getDealsWithFutureTasks, getStaleDeals } = require('../src/agendor');

// `avancarRelogioAte` (helpers/fakeTimers.js, criado no 04-10) só observa a promessa pelo caminho
// de SUCESSO: numa rejeição a flag interna nunca vira true, o laço estoura as 20 iterações e o
// erro real é substituído por "a promessa não concluiu" — mensagem que esconderia o 429 que este
// arquivo inteiro está medindo. Este envelope normaliza o desfecho para um VALOR, deixa o helper
// avançar o relógio, e só então relança. Assim `assert.rejects` continua sendo o oráculo e o
// helper compartilhado permanece intocado (ele é oráculo estável do 04-10; dedupá-lo/estendê-lo é
// trabalho futuro, junto com a cópia local de emailer.timeout.test.js).
//
// Usado também nos casos que HOJE rejeitam mas amanhã podem retentar: com `setTimeout` mockado,
// uma espera não tickada nunca resolve, e um caso escrito sem avanço de relógio TRAVARIA a suíte
// em vez de falhar. Aqui ele falha, com contagem legível.
async function avancarRelogioAteDesfecho(promessa) {
  const desfecho = await avancarRelogioAte(
    promessa.then(
      (valor) => ({ tipo: 'sucesso', valor }),
      (erro) => ({ tipo: 'falha', erro }),
    ),
  );
  if (desfecho.tipo === 'falha') throw desfecho.erro;
  return desfecho.valor;
}

before(() => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: FIXED_NOW });
});

after(() => {
  mock.timers.reset();
});

// Contadores e modos são estado de módulo: zerar aqui mantém cada asserção de contagem local ao
// seu caso, independentemente da ordem de execução.
beforeEach(() => {
  chamadasTasks = 0;
  chamadasDeals = 0;
  modoTasks = 'ok';
  modoDeals = 'ok';
  fake.get.mock.resetCalls();
});

test('(1) 429 transitório em /tasks é retentado e a rodada conclui', async () => {
  modoTasks = '429-uma-vez';

  const tarefas = await avancarRelogioAteDesfecho(getDealsWithFutureTasks());

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
    () => avancarRelogioAteDesfecho(getDealsWithFutureTasks()),
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
    () => avancarRelogioAteDesfecho(getDealsWithFutureTasks()),
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

  const ids = (await avancarRelogioAteDesfecho(getStaleDeals(15))).map(
    (d) => d.id,
  );

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
