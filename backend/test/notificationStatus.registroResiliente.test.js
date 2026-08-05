// Prova de WR2-02 e WR3-02 — uma falha numa OPERAÇÃO DE BANCO do laço apaga o resto
// da rodada.
//
// O `catch` do bloco de envio de `runCheck` (`scheduler.js`) chama
// `updateNotificationStatus` para gravar o desfecho da tentativa. Essa chamada usa a
// MESMA conexão SQLite que pode ter causado a exceção que trouxe o fluxo até ali — com
// a conexão indisponível, ela lança POR CONTA PRÓPRIA, de dentro do `catch`. Uma exceção
// nascida ali não tem quem a segure: ela escapa para o `catch` externo de `runCheck`,
// aborta o `for` dos deals e deixa os negócios restantes da rodada SEM PROCESSAR —
// silêncio total num dia em que o sistema deveria notificar. Pior: a linha do deal
// afetado fica `'pending'`, e como `alreadyNotifiedToday` filtra `status = 'sent'`, ela
// não deduplica — a rodada de amanhã reenvia para quem já recebeu, que é exatamente o
// desfecho que WR-01 (04-10) existia para impedir.
//
// Este arquivo SOMA-SE a `notificationStatus.test.js` (os 6 cenários de REL-05/Q1) e a
// `notificationStatus.partialFailure.test.js` (WR-01/WR-04/WR2-01). Nenhum dos dois é
// editado nesta rodada: eles são os oráculos que garantem que o conserto de WR2-02 não
// desfaz o 04-06, o 04-10 nem o 04-14. Como o `node --test` isola por ARQUIVO (cada um
// em processo próprio), o cenário novo mora aqui sem interferir nas variações de
// ambiente daqueles — em especial o mock de `updateNotificationStatus`, que aqui é
// instalado no load do módulo e vale para o arquivo inteiro.
//
// O endurecimento do canal `err.resultadosParciais` (WR2-04) é assunto de OUTRO arquivo,
// `notificationStatus.canalParcial.test.js` (04-16). O cenário abaixo foi desenhado para
// não exercitar nada daquele escopo — ver o comentário do `modoEnvio` no próprio cenário.
//
// WR3-02 é o VIZINHO de WR2-02, uma construção ACIMA. O laço de `runCheck` toca o banco
// em TRÊS pontos, todos pela MESMA conexão: `alreadyNotifiedToday` (a leitura de dedup,
// PRIMEIRA operação do laço), `logNotification` (o insert) e `updateNotificationStatus`
// (a gravação do desfecho). O 04-15 protegeu o terceiro; o segundo já nascia dentro do
// `try` do bloco de envio; o PRIMEIRO ficava fora de qualquer `try` interno — uma falha
// nele subia direto ao `catch` externo, abortava o `for` e deixava TODOS os negócios
// restantes sem processar. Este arquivo passa a ser o oráculo dos três.
//
// Os cenários:
//   D (WR2-02)  o registro do desfecho lança -> a rodada CONTINUA, o 2º deal é notificado
//               e a linha do 1º fica 'pending' (retentável amanhã)
//   E (WR3-02)  a LEITURA de dedup lança -> a rodada CONTINUA e AMBOS os deals são
//               notificados: não saber se já notificamos é lido como "não deduplica"
//   F (VIZINHO) o INSERT do notification_log lança -> a rodada CONTINUA, o 1º fica sem
//               linha e sem envio, o 2º é notificado. Já era seguro ANTES desta rodada,
//               e entra justamente para deixar de ser presunção e virar asserção
//
// PC-13: nada aqui assere nem imprime o objeto de opções do transporte SMTP — ele
// carrega `auth.pass`.

const { makeTmpDbPath } = require('./helpers/tmpDb');

// Cria o arquivo temporário e fixa DB_PATH ANTES de qualquer require('../src/db'):
// db.js lê process.env.DB_PATH no load e abre a conexão ali (seam 01-01). O runCheck
// grava no notification_log de verdade — backend/agendor.db fica intocado.
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

// setup.js só define DB_PATH se ausente — como já definimos acima, o temp vence.
require('./setup');

const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { installFakeAxios } = require('./helpers/fakeAxios');
const { avancarRelogioAte } = require('./helpers/fakeTimers');

// Relógio fixo: mesmo instante de `notificationStatus.partialFailure.test.js`, para
// reusar a fixture sintética. now = 2026-06-01 -> cutoff = 2026-05-17 (staleDays 15).
// Congelar o Date também torna DETERMINÍSTICO o `sent_at` que logNotification grava —
// é disso que a asserção de alreadyNotifiedToday depende.
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

const DONO = 'dono@exemplo.invalid';
const AUTOR = 'autor@exemplo.invalid';

// Fixture REUSADA (não recriada): o deal 101 é o "incluído base" do golden — passa por
// todos os filtros de getStaleDeals. Cada rodada serve CLONES dele com ids próprios,
// porque a dedup do próprio SUT acopla os casos entre si.
const dealsPage = require('./fixtures/synthetic/deals-page.json');
const MOLDE = dealsPage.find((d) => d.id === 101);

// DOIS deals por rodada — e é essa a diferença que faz o cenário existir. Com um deal
// só não há como distinguir "a rodada seguiu" de "a rodada acabou porque não havia mais
// nada a processar": o segundo deal é a testemunha de que o `for` não foi abortado.
// A ordem é preservada por getStaleDeals (que não reordena), então o primeiro id servido
// é o primeiro processado.
let dealsServidos = [];
function servirDeals(idPrimeiro, idSegundo) {
  dealsServidos = [idPrimeiro, idSegundo].map((id) => ({
    ...MOLDE,
    id,
    title: `Negócio sintético ${id}`,
  }));
}

// O dono (11) e o autor (21) do molde, com e-mails DIFERENTES.
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

// ── Controle do envio e do registro ──────────────────────────────
// Variáveis mutáveis de módulo lidas DENTRO dos stubs: os mocks nunca são reinstalados
// no meio do arquivo (`node --test` isola por arquivo, não por `test()`).
let modoEnvio = 'ok'; // 'ok' | 'excecao-na-fabrica-inicial'
let modoRegistro = 'ok'; // 'ok' | 'falha'
let modoDedup = 'ok'; // 'ok' | 'falha'  (cenário E, WR3-02)
let modoInsert = 'ok'; // 'ok' | 'falha'  (cenário F, o vizinho pinado)

// Contadores que são a PRÉ-CONDIÇÃO do cenário: sem eles o caso poderia ficar verde por
// coincidência (lição de WR-05 — um teste que não prova o caminho que afirma medir).
let transportesCriados = 0;
let enviosConfirmados = 0;
let registrosTentados = 0;
let registrosQueFalharam = 0;
let leiturasDedup = 0;
let leiturasQueFalharam = 0;
let insertsTentados = 0;
let insertsQueFalharam = 0;

// PC-13: o objeto de opções (que carrega auth.pass) não é capturado nem asserido.
mock.method(nodemailer, 'createTransport', () => {
  transportesCriados++;

  // A PRIMEIRA chamada é a fábrica INICIAL de sendStaleNotification — a que fica FORA
  // do `try` daquela função. Fazer a exceção nascer aí é deliberado: assim ela chega ao
  // agendador SEM `err.resultadosParciais`, o consumidor cai no `?? []` que já existe
  // hoje e NADA do endurecimento do canal parcial (WR2-04 / plano 04-16) é exercitado —
  // este arquivo não depende daquele conserto e não muda de desfecho com ele.
  if (modoEnvio === 'excecao-na-fabrica-inicial' && transportesCriados === 1) {
    throw new Error('transporte SMTP indisponível');
  }

  return {
    verify: async () => true,
    sendMail: async () => {
      enviosConfirmados++;
      return {};
    },
  };
});

// ── Mocks das três operações de banco do laço ────────────────────
// ARMADILHA DE CommonJS: `scheduler.js` faz
// `const { updateNotificationStatus } = require('./db')` no TOPO, e a desestruturação
// captura a REFERÊNCIA no load. Um `mock.method(db, 'updateNotificationStatus', …)`
// aplicado DEPOIS de `require('../src/scheduler')` não teria efeito nenhum — o
// scheduler continuaria chamando a função real, o cenário ficaria verde já no RED e
// pagaríamos com falsa confiança. Por isso a sequência abaixo é obrigatória:
// require do db -> guardar as referências reais -> mock.method -> require do scheduler.
// Ela vale igualmente para `alreadyNotifiedToday` e `logNotification`, que o scheduler
// desestrutura do mesmo require.
const db = require('../src/db');
const registroReal = db.updateNotificationStatus;
const dedupReal = db.alreadyNotifiedToday;
const insertReal = db.logNotification;

mock.method(db, 'updateNotificationStatus', (...args) => {
  registrosTentados++;
  // Falhar SÓ na primeira chamada é o que permite ao segundo deal da rodada ser
  // registrado normalmente — é assim que o caso mede "a rodada continuou e funcionou",
  // e não apenas "a rodada continuou".
  if (modoRegistro === 'falha' && registrosTentados === 1) {
    registrosQueFalharam++;
    // Mensagem fiel ao better-sqlite3 com a conexão fechada.
    throw new Error('The database connection is not open');
  }
  return registroReal(...args);
});

// A LEITURA de dedup (cenário E, WR3-02). Mesma forma do mock acima e pelo mesmo motivo:
// falhar SÓ na primeira chamada é o que permite ao segundo negócio da rodada ser lido
// normalmente — e é o que distingue "a rodada continuou" de "a rodada continuou fazendo
// o seu trabalho". As demais chamadas delegam para a função real, inclusive as que o
// próprio teste faz para conferir o estado do notification_log.
mock.method(db, 'alreadyNotifiedToday', (...args) => {
  leiturasDedup++;
  if (modoDedup === 'falha' && leiturasDedup === 1) {
    leiturasQueFalharam++;
    // Mensagem fiel ao better-sqlite3 com a conexão fechada — a MESMA conexão que
    // origina a falha de gravação do cenário D.
    throw new Error('The database connection is not open');
  }
  return dedupReal(...args);
});

// O INSERT do notification_log (cenário F, o vizinho). Mesmo molde.
mock.method(db, 'logNotification', (...args) => {
  insertsTentados++;
  if (modoInsert === 'falha' && insertsTentados === 1) {
    insertsQueFalharam++;
    throw new Error('The database connection is not open');
  }
  return insertReal(...args);
});

const { runCheck } = require('../src/scheduler');

// O default do projeto é 'false' (db.js). Ligado aqui para que dono e autor sejam
// destinatários distintos, como no arquivo de sucesso parcial.
db.setConfig('notify_author', 'true');

before(() => {
  // 'setTimeout' entra junto com 'Date' porque `avancarRelogioAte` avança o relógio
  // falso: qualquer espera que o caminho exercite (o retry de sendMailWithRetry, por
  // exemplo) precisa ser vencida sem tempo real.
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
  modoRegistro = 'ok';
  modoDedup = 'ok';
  modoInsert = 'ok';
  transportesCriados = 0;
  enviosConfirmados = 0;
  registrosTentados = 0;
  registrosQueFalharam = 0;
  leiturasDedup = 0;
  leiturasQueFalharam = 0;
  insertsTentados = 0;
  insertsQueFalharam = 0;
});

// Linhas do deal, da mais recente para a mais antiga. Usa getNotificationLogs — nenhuma
// consulta SQL ad-hoc. A ordenação é por `id` e não por `sent_at` porque o relógio está
// congelado: todas as linhas compartilham o mesmo `sent_at`.
function linhasDoDeal(dealId) {
  const { logs } = db.getNotificationLogs({ limit: 100 });
  return logs.filter((l) => l.deal_id === dealId).sort((a, b) => b.id - a.id);
}

// ── D (WR2-02) — o registro do desfecho falha ────────────────────
test('D: falha ao registrar o desfecho não aborta a rodada — o deal seguinte continua sendo notificado', async () => {
  const primeiro = 2201;
  const segundo = 2202;
  servirDeals(primeiro, segundo);
  modoEnvio = 'excecao-na-fabrica-inicial';
  modoRegistro = 'falha';

  const r = await avancarRelogioAte(runCheck());

  // Pré-condição: o caminho medido é o do registro que LANÇA. Sem ela, um cenário em
  // que o mock nunca foi consultado (ver a armadilha de CommonJS acima) passaria como
  // se tivesse provado alguma coisa.
  assert.equal(
    registrosQueFalharam,
    1,
    'pré-condição: o registro do desfecho precisa ter falhado exatamente uma vez',
  );

  // A asserção central de WR2-02: a exceção nascida DENTRO do catch do bloco de envio
  // não pode escapar para o catch externo de runCheck.
  assert.equal(
    r.error,
    undefined,
    'a falha ao registrar não pode abortar a rodada',
  );
  assert.equal(
    r.deals.length,
    2,
    'os deals seguintes da rodada precisam continuar sendo processados',
  );

  // Pré-condição avaliada só DEPOIS de `r.deals.length`: no estado defeituoso o array
  // está vazio, e ler `r.deals[0].id` ali produziria um TypeError em vez de um
  // vermelho legível. A ordem preservada de getStaleDeals é o que garante o par.
  assert.equal(
    r.deals[0].id,
    primeiro,
    'pré-condição: o deal que falha é o PRIMEIRO da rodada',
  );

  // O deal afetado: a gravação não aconteceu, então a linha continua como nasceu.
  //
  // Que a linha fique 'pending' é uma ESCOLHA, não um esquecimento. 'pending' não
  // deduplica (alreadyNotifiedToday filtra status = 'sent'), então a rodada de amanhã
  // retenta — inclusive para um destinatário que já tivesse recebido hoje. Entre
  // "reenviar para quem já recebeu" e "nunca mais notificar um negócio parado", o
  // milestone escolhe o reenvio: notificação perdida em silêncio é a pior classe de
  // falha do Core Value. O trade-off foi submetido ao humano no checkpoint C10.
  const linhasPrimeiro = linhasDoDeal(primeiro);
  assert.equal(linhasPrimeiro.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhasPrimeiro[0].status,
    'pending',
    'o registro do desfecho falhou: a linha permanece como nasceu',
  );
  assert.equal(
    db.alreadyNotifiedToday(primeiro),
    false,
    'a linha ficou pending: a rodada de amanhã retenta — fail-safe declarado',
  );

  // O deal seguinte: processado E notificado de verdade. É a diferença entre "a rodada
  // não estourou" e "a rodada continuou fazendo o seu trabalho".
  assert.equal(
    enviosConfirmados,
    2,
    'pré-condição: o segundo deal ENVIOU (dono e autor), não apenas gravou uma linha',
  );
  const linhasSegundo = linhasDoDeal(segundo);
  assert.equal(linhasSegundo.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhasSegundo[0].status,
    'sent',
    'o deal seguinte foi notificado normalmente',
  );
  assert.equal(
    r.notified,
    1,
    'exatamente uma notificação confirmada na rodada — a do segundo deal',
  );
});

// ── E (WR3-02) — a LEITURA de dedup falha ────────────────────────
test('E: falha ao LER a dedup não aborta a rodada — os dois deals são processados e notificados', async () => {
  const primeiro = 2205;
  const segundo = 2206;
  servirDeals(primeiro, segundo);
  modoDedup = 'falha';
  modoEnvio = 'ok';

  const r = await avancarRelogioAte(runCheck());

  // Pré-condição: o caminho medido é o da LEITURA que lança. Sem ela, um mock nunca
  // consultado (ver a armadilha de CommonJS acima) passaria como prova.
  assert.equal(
    leiturasQueFalharam,
    1,
    'pré-condição: a leitura de dedup precisa ter falhado exatamente uma vez',
  );

  // A asserção central de WR3-02: a exceção nascida na PRIMEIRA operação de banco do
  // laço não pode escapar para o catch externo de runCheck.
  assert.equal(
    r.error,
    undefined,
    'a falha ao ler a dedup não pode abortar a rodada',
  );
  assert.equal(
    r.deals.length,
    2,
    'os deals seguintes da rodada precisam continuar sendo processados',
  );

  // Pré-condição avaliada só DEPOIS de `r.deals.length`: no estado defeituoso o array
  // está vazio, e ler `r.deals[0].id` ali produziria um TypeError em vez de um
  // vermelho legível.
  assert.equal(
    r.deals[0].id,
    primeiro,
    'pré-condição: o deal cuja leitura falha é o PRIMEIRO da rodada',
  );

  // Os DOIS deals notificados — dono e autor de cada um. Que o deal afetado seja
  // NOTIFICADO é a metade do contrato que mais parece um descuido, e não é:
  // quando a leitura falha não sabemos se já notificamos hoje, e a escolha entre
  // reenviar e silenciar é decisão do usuário, registrada no checkpoint C10.
  // Nas palavras dele: duplicata incomoda e é aceitável; deixar alguém sem
  // notificação não é. Uma "melhoria" futura que assumisse `true` na falha (isto é,
  // "no caso de dúvida, não envia") inverteria o fail-safe e reintroduziria a pior
  // classe de falha do Core Value — notificação perdida em silêncio. É esta asserção,
  // e o `r.notified` lá embaixo, que ficam vermelhos se alguém tentar.
  assert.equal(
    enviosConfirmados,
    4,
    'pré-condição: os DOIS deals enviaram (dono e autor de cada um)',
  );

  const linhasPrimeiro = linhasDoDeal(primeiro);
  assert.equal(linhasPrimeiro.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhasPrimeiro[0].status,
    'sent',
    'não saber se já notificamos significa notificar: a linha fica sent',
  );

  const linhasSegundo = linhasDoDeal(segundo);
  assert.equal(linhasSegundo.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhasSegundo[0].status,
    'sent',
    'o deal seguinte foi notificado normalmente',
  );

  assert.equal(
    r.notified,
    2,
    'as duas notificações da rodada foram confirmadas',
  );
});

// ── F (VIZINHO) — o INSERT do notification_log falha ─────────────
// Este cenário JÁ PASSA no estado de entrada, e é exatamente por isso que ele entra:
// o vizinho imediato da operação consertada precisa ser VERIFICADO e pinado, não
// presumido — foi a ausência dessa verificação que produziu três rodadas seguidas de
// achados vizinhos nesta fase. Ele é seguro porque a exceção nasce DENTRO do `try` do
// bloco de envio: o `catch` a absorve e, com `logId` ainda nulo, não há linha a
// atualizar. Se alguém mover o insert para fora daquele `try`, este caso fica vermelho.
test('F: falha no INSERT do notification_log não aborta a rodada — o deal seguinte continua sendo notificado', async () => {
  const primeiro = 2207;
  const segundo = 2208;
  servirDeals(primeiro, segundo);
  modoInsert = 'falha';

  const r = await avancarRelogioAte(runCheck());

  // Pré-condição: o caminho medido é o do insert que lança.
  assert.equal(
    insertsQueFalharam,
    1,
    'pré-condição: o insert precisa ter falhado exatamente uma vez',
  );

  assert.equal(
    r.error,
    undefined,
    'a falha no insert não pode abortar a rodada',
  );
  assert.equal(
    r.deals.length,
    2,
    'os deals seguintes da rodada precisam continuar sendo processados',
  );
  assert.equal(
    r.deals[0].id,
    primeiro,
    'pré-condição: o deal cujo insert falha é o PRIMEIRO da rodada',
  );

  // Sem linha e sem envio para o deal afetado: o insert precede o envio, então a
  // exceção interrompe o bloco antes de qualquer sendMail.
  assert.equal(
    linhasDoDeal(primeiro).length,
    0,
    'o insert falhou: nenhuma linha nasce para o deal afetado',
  );
  assert.equal(
    r.deals[0].notified,
    false,
    'o deal afetado não é dado como notificado',
  );

  const linhasSegundo = linhasDoDeal(segundo);
  assert.equal(linhasSegundo.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhasSegundo[0].status,
    'sent',
    'o deal seguinte foi notificado normalmente',
  );
  assert.equal(
    r.notified,
    1,
    'exatamente uma notificação confirmada na rodada — a do segundo deal',
  );
});
