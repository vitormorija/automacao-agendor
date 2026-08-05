// Prova de WR-01 e WR-04 — os dois defeitos que o bloco de envio de
// `scheduler.js:110-183` carrega HOJE, ambos sobre a mesma linha do
// `notification_log`.
//
// WR-01 (regressão introduzida pelo 04-06): o `catch` de `scheduler.js:169-176`
// grava `updateNotificationStatus(logId, 'error', err.message)` INCONDICIONALMENTE.
// Quando `sendStaleNotification` lança DEPOIS de um destinatário já ter confirmado
// o envio — é o que acontece quando a recriação do transporte dentro do laço de
// retry (`emailer.js:211`) falha —, a única linha do deal é rebaixada para
// `'error'`, `alreadyNotifiedToday` (`db.js:223-232`, que filtra `status = 'sent'`)
// volta a devolver `false` e **a rodada de amanhã reenvia para quem já recebeu**.
//
// WR-04: `results.notified++` (`scheduler.js:168`) é incondicional. Numa falha
// total por retorno, o mesmo bloco grava `'error'` e em seguida incrementa o
// contador — e é esse número que `logger.info('[Scheduler] Concluído: …')`
// (`:187-189`) e a UI exibem. No dia em que o SMTP estiver fora, o log dirá que
// tudo saiu.
//
// WR2-01 (lacuna deixada pelo fechamento de WR-01/WR-04): o ramo de EXCEÇÃO grava
// `'sent'` quando houve envio confirmado, mas não incrementa `results.notified` —
// sub-contagem, o espelho de WR-04. O cenário A passou a cobrir também a relação
// linha↔contador no caminho de EXCEÇÃO, que WR-04 só fechou no caminho de retorno:
// ele agora assere o contador da rodada (`results.notified`) e o desfecho por deal
// (`dealResult.notified`), não só o status gravado.
//
// Este arquivo NÃO substitui `notificationStatus.test.js` — soma-se a ele. Aquele
// arquivo (os 6 cenários de REL-05/Q1) NÃO é editado nesta rodada: ele é o oráculo
// que garante que o conserto de WR-01/WR-04 não desfaz o 04-06. Como `node --test`
// isola por ARQUIVO (cada um em processo próprio), o cenário novo mora aqui sem
// interferir nas variações de ambiente daquele.
//
// Os 3 cenários:
//   A (WR-01)  exceção DEPOIS de um envio confirmado -> 'sent' e dedup preservada
//   B (WR-04)  falha total por retorno               -> notified = 0 e linha 'error'
//   C          caminho feliz                          -> notified = 1, 'sent', erro nulo
//
// PC-13: nada aqui assere nem imprime o objeto de opções do transporte SMTP — ele
// carrega `auth.pass`.

const { makeTmpDbPath } = require('./helpers/tmpDb');

// Cria o arquivo temporário e fixa DB_PATH ANTES de qualquer require('../src/db'):
// db.js lê process.env.DB_PATH no load e abre a conexão ali (seam 01-01). O
// runCheck grava no notification_log de verdade — backend/agendor.db fica intocado.
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

// setup.js só define DB_PATH se ausente — como já definimos acima, o temp vence.
require('./setup');

const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { installFakeAxios } = require('./helpers/fakeAxios');
const { avancarRelogioAte } = require('./helpers/fakeTimers');

// Relógio fixo: mesmo instante de agendor.getStaleDeals.test.js, para reusar a
// fixture sintética. now = 2026-06-01 -> cutoff = 2026-05-17 (staleDays 15).
// Congelar o Date também torna DETERMINÍSTICO o `sent_at` que logNotification
// grava — é disso que a asserção de alreadyNotifiedToday do cenário A depende.
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

const DONO = 'dono@exemplo.invalid';
const AUTOR = 'autor@exemplo.invalid';

// Fixture REUSADA (não recriada): o deal 101 é o "incluído base" do golden — passa
// por todos os filtros de getStaleDeals. Cada rodada serve um CLONE dele com um id
// próprio, porque a dedup do próprio SUT acopla os casos entre si: um deal que
// termina a rodada com 'sent' fica bloqueado para o resto do arquivo.
const dealsPage = require('./fixtures/synthetic/deals-page.json');
const MOLDE = dealsPage.find((d) => d.id === 101);

let dealsServidos = [];
function servirDeal(id) {
  dealsServidos = [{ ...MOLDE, id, title: `Negócio sintético ${id}` }];
}

// O dono (11) e o autor (21) do molde, com e-mails DIFERENTES: sem dois
// destinatários distintos o cenário A simplesmente não existe (não haveria um
// primeiro envio confirmado antes da exceção do segundo).
const USUARIOS = {
  data: [
    { id: 11, name: 'Ana Vendas', contact: { email: DONO } },
    { id: 21, name: 'Ana Vendas', contact: { email: AUTOR } },
  ],
  links: {},
};

// Instala o stub ANTES de exigir agendor.js/scheduler.js (a instância `api` nasce no load).
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
    // Categoria 'Lead' -> nenhuma exclusão por categoria.
    return { data: { data: { category: { name: 'Lead' } } } };
  }
  if (url === '/tasks') {
    // Nenhuma tarefa futura: nenhum deal é "protegido", o fluxo segue para o envio.
    return { data: { data: [] } };
  }
  if (url === '/users') {
    return { data: USUARIOS };
  }
  return { data: { data: [] } };
});

// ── Controle do resultado do envio ───────────────────────────────
// Variáveis mutáveis de módulo lidas DENTRO do stub: o mock nunca é reinstalado no
// meio do arquivo (`node --test` isola por arquivo, não por `test()`).
let modoEnvio = 'ok'; // 'ok' | 'falha-total' | 'excecao-apos-envio'

// Contadores que são a PRÉ-CONDIÇÃO do cenário A: sem eles o caso passaria por
// coincidência (lição de WR-05 — um teste que não prova o caminho que afirma medir).
let transportesCriados = 0;
let enviosConfirmados = 0;

// Erro classificado como DE REDE por sendMailWithRetry (emailer.js:198-202): a
// mensagem contém 'timeout'. É o que faz o retry entrar no ramo que espera 3s e
// RECRIA o transporte, em vez de devolver { success:false } de imediato.
function erroDeRede() {
  return Object.assign(new Error('Connection timeout ao entregar a mensagem'), {
    code: 'ETIMEDOUT',
  });
}

// Erro PERMANENTE, deliberadamente NÃO classificável como erro de rede: sem
// 'timeout'/'econnreset' na mensagem e sem ECONNRESET/ETIMEDOUT no code. O retry
// devolve { success:false } na PRIMEIRA tentativa, então o cenário B não depende
// de relógio nenhum.
function erroPermanente() {
  return Object.assign(new Error('550 5.1.1 Caixa postal indisponível'), {
    code: 'EENVELOPE',
  });
}

// PC-13: o objeto de opções (que carrega auth.pass) não é capturado nem asserido —
// o stub apenas RAMIFICA por `to`, como já faz notificationStatus.test.js:150.
mock.method(nodemailer, 'createTransport', () => {
  transportesCriados++;

  // Cenário A: a 1ª chamada é a do topo de sendStaleNotification (emailer.js:220) e
  // precisa funcionar — é ela que entrega o e-mail do dono. A 2ª é a recriação de
  // emailer.js:211, dentro do catch do retry, e é aí que a exceção nasce: DEPOIS de
  // um destinatário já ter confirmado o envio.
  if (modoEnvio === 'excecao-apos-envio' && transportesCriados >= 2) {
    throw new Error('transporte SMTP indisponível ao recriar a conexão');
  }

  return {
    verify: async () => true,
    sendMail: async (mailOptions) => {
      if (modoEnvio === 'falha-total') throw erroPermanente();
      if (modoEnvio === 'excecao-apos-envio' && mailOptions.to === AUTOR) {
        throw erroDeRede();
      }
      enviosConfirmados++;
      return {};
    },
  };
});

// require do db e do scheduler DEPOIS de DB_PATH e do stub de axios.
const db = require('../src/db');
const { runCheck } = require('../src/scheduler');

// O default do projeto é 'false' (db.js:114). Ligado aqui para que dono e autor
// sejam destinatários distintos — pré-requisito do cenário A.
db.setConfig('notify_author', 'true');

before(() => {
  // 'setTimeout' entra AQUI (e não em notificationStatus.test.js, que habilita só
  // 'Date'): o cenário A depende da espera de 3s do retry de sendMailWithRetry —
  // é dentro daquele ramo que o createTransporter() da recriação é chamado. Com um
  // único deal servido (meta.totalCount = 1) não há segunda página, então a espera
  // entre lotes de agendor.js:203-210 nunca é atingida e nada mais fica congelado.
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: FIXED_NOW });
});

after(() => {
  mock.restoreAll();
  db.closeDb();
  cleanup();
  mock.timers.reset();
});

beforeEach(() => {
  // Estado neutro entre casos: cada teste declara explicitamente o que precisa.
  modoEnvio = 'ok';
  transportesCriados = 0;
  enviosConfirmados = 0;
});

// Linhas do deal, da mais recente para a mais antiga. Usa getNotificationLogs
// (db.js:210-220) — nenhuma consulta SQL ad-hoc. A ordenação é por `id` e não por
// `sent_at` porque o relógio está congelado: todas as linhas compartilham o mesmo
// `sent_at`.
function linhasDoDeal(dealId) {
  const { logs } = db.getNotificationLogs({ limit: 100 });
  return logs.filter((l) => l.deal_id === dealId).sort((a, b) => b.id - a.id);
}

// ── A (WR-01) — exceção DEPOIS de um envio confirmado ────────────
test('A: exceção após o dono já ter recebido mantém "sent" e a dedup protege quem recebeu', async () => {
  const dealId = 2101;
  servirDeal(dealId);
  modoEnvio = 'excecao-apos-envio';

  // Dirigido pelo relógio falso: a espera de 3s do retry está entre o envio
  // confirmado do dono e a recriação do transporte que lança.
  const r = await avancarRelogioAte(runCheck());

  // Pré-condições: sem elas o caso poderia ficar verde por outro motivo (a exceção
  // vir da fábrica INICIAL, antes de qualquer envio — que é o cenário Q1-2, já
  // coberto, e cujo desfecho correto é justamente 'error').
  assert.equal(
    enviosConfirmados,
    1,
    'pré-condição: o dono precisa ter recebido antes da exceção',
  );
  assert.equal(
    transportesCriados,
    2,
    'pré-condição: a exceção precisa ter vindo da recriação do transporte, não da fábrica inicial',
  );

  // WR2-01 — as duas asserções abaixo NÃO se contradizem, e é de propósito que uma
  // diz 1 e a outra diz false. Elas respondem a perguntas diferentes:
  //   `results.notified` conta RODADAS DE NOTIFICAÇÃO EM QUE HOUVE ENVIO CONFIRMADO
  //     — é o número operacional, o mesmo do ramo de retorno, e é o que o
  //     `logger.info('[Scheduler] Concluído: …')` e a UI exibem.
  //   `dealResult.notified` responde "TODOS os destinatários receberam?" — e no
  //     sucesso parcial a resposta é não.
  // Sem este comentário, um leitor futuro pode "harmonizar" a assimetria e
  // reintroduzir exatamente o defeito que WR2-01 nomeia.
  assert.equal(
    r.notified,
    1,
    'houve envio real: o número que o logger.info do scheduler e a UI exibem não pode dizer que nada saiu',
  );
  assert.equal(
    r.deals[0].notified,
    false,
    'nem todos os destinatários confirmaram — o objeto do deal registra isso, e é por isso que ele NÃO acompanha o contador aqui',
  );

  // D-03 intocado: a rodada registra o erro e segue; nada é relançado.
  assert.equal(r.error, undefined, 'a exceção do envio não derruba a rodada');
  assert.ok(
    r.errors.length >= 1,
    'o erro do envio é registrado em results.errors',
  );

  const linhas = linhasDoDeal(dealId);
  assert.equal(linhas.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhas[0].status,
    'sent',
    'houve envio confirmado: rebaixar para "error" reabriria a duplicata de amanhã',
  );
  assert.match(
    linhas[0].error,
    /transporte SMTP indisponível/,
    'a mensagem da exceção continua registrada na coluna error',
  );
  assert.equal(
    db.alreadyNotifiedToday(dealId),
    true,
    'quem já recebeu não pode ser notificado de novo amanhã',
  );
});

// ── B (WR-04) — falha total por retorno: contador zerado ─────────
test('B: falha total por retorno deixa results.notified em 0 e a linha em "error"', async () => {
  const dealId = 2103;
  servirDeal(dealId);
  modoEnvio = 'falha-total';

  const r = await avancarRelogioAte(runCheck());

  assert.equal(
    enviosConfirmados,
    0,
    'pré-condição: nenhum destinatário pode ter confirmado o envio neste caso',
  );

  assert.equal(
    r.notified,
    0,
    'nenhum envio aconteceu: o contador exibido no log e na UI não pode dizer que sim',
  );
  assert.equal(
    r.deals[0].notified,
    false,
    'o objeto do deal e o contador da rodada precisam concordar',
  );

  const linhas = linhasDoDeal(dealId);
  assert.equal(linhas.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhas[0].status,
    'error',
    'falha total continua gravando "error" — e continua retentável amanhã',
  );
  assert.match(
    linhas[0].error,
    /Caixa postal indisponível/,
    'o erro devolvido por destinatário é agregado na coluna error',
  );
});

// ── C — caminho feliz (não-regressão do contador) ────────────────
// Existe para provar que mover `results.notified++` para dentro do ramo 'sent' NÃO
// move o número que a UI já exibe no caminho que acontece todo dia.
test('C: caminho feliz mantém results.notified em 1, linha "sent" e erro nulo', async () => {
  const dealId = 2105;
  servirDeal(dealId);

  const r = await avancarRelogioAte(runCheck());

  assert.equal(r.notified, 1, 'a rodada contabiliza a notificação enviada');
  assert.equal(r.deals[0].notified, true, 'todos os destinatários confirmaram');

  const linhas = linhasDoDeal(dealId);
  assert.equal(linhas.length, 1, 'uma notificação, uma linha');
  assert.equal(linhas[0].status, 'sent');
  assert.equal(
    linhas[0].error,
    null,
    'sem falha em nenhum destinatário, não há erro a registrar',
  );
});
