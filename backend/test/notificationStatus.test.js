// Prova de REL-05 / Decisão Q1: o status gravado no `notification_log` passa a
// refletir o que REALMENTE aconteceu no envio.
//
// Este arquivo NÃO é caracterização — ele mede o NOVO fluxo, e por isso nasce
// vermelho. O defeito que ele mede (DESC-1) vive em `scheduler.js:109-164`:
//   · a linha é inserida com `status: 'sent'` ANTES de enviar (para obter o
//     `logId` do link de tracking), então uma falha por RETORNO
//     (`{ success:false }` em todos os destinatários) deixa a linha mentindo
//     `'sent'`;
//   · o caminho de EXCEÇÃO insere uma SEGUNDA linha `'error'` e deixa a `'sent'`
//     original intacta.
// Como `alreadyNotifiedToday` (`db.js:223-232`) filtra `status = 'sent'`,
// NENHUM dos dois caminhos de falha é retentado no dia seguinte — ou seja, a
// premissa de "recuperação natural pela rodada diária" que sustenta D-03 é falsa
// hoje. É essa premissa que os 6 cenários abaixo passam a garantir.
//
// Os 6 cenários (5 literais de Q1 + 1 de risco):
//   Q1-1  envio confirmado                       -> 'sent', `error` nulo
//   Q1-2  exceção (fábrica SMTP lança)           -> 'error' e EXATAMENTE 1 linha
//   Q1-3  { success:false } em TODOS             -> 'error'
//   Q1-4  linha de HOJE com 'error'              -> alreadyNotifiedToday = false
//   Q1-5  linha de HOJE com 'sent'               -> alreadyNotifiedToday = true
//   R-11  sucesso parcial (dono ok, autor falha) -> 'sent' com o erro agregado
//
// Q1-4 NÃO duplica `db.dedup.test.js:54-87`. Lá a asserção `false` vinha da
// DATA (um `sent_at` de ontem, com `status = 'sent'`); aqui ela vem do STATUS
// (um `sent_at` de HOJE, com `status = 'error'`). São as duas metades da mesma
// cláusula SQL, e só juntas provam que a dedup dedupla envios CONFIRMADOS e não
// simplesmente "tentativas do dia".
//
// Por que arquivo temporário e não `:memory:` (mesmo motivo de
// `db.dedup.test.js:6-10`): os cenários Q1-4/Q1-5 precisam semear um
// `sent_at`/`status` que `logNotification` não sabe produzir, e isso exige uma
// SEGUNDA conexão better-sqlite3 apontando para o MESMO arquivo.
//
// PC-13: nada aqui assere nem imprime o objeto de opções do transporte SMTP —
// ele carrega `auth.pass`.

const { makeTmpDbPath, openRaw } = require('./helpers/tmpDb');

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

// Relógio fixo: mesmo instante de agendor.getStaleDeals.test.js, para reusar a
// fixture sintética. now = 2026-06-01 -> cutoff = 2026-05-17 (staleDays 15).
// Congelar o Date também torna DETERMINÍSTICO o `sent_at` que logNotification
// grava — é disso que Q1-4 e Q1-5 dependem para semear uma linha "de hoje".
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();
const HOJE_ISO = new Date(FIXED_NOW).toISOString();

const DONO = 'dono@exemplo.invalid';
const AUTOR = 'autor@exemplo.invalid';

// Fixture REUSADA (não recriada): o deal 101 é o "incluído base" do golden — passa
// por todos os filtros de getStaleDeals (criado em 2026, status 1, categoria Lead,
// etapa benigna, dono não excluído). Cada rodada serve um CLONE dele com um id
// próprio, e o motivo é a própria dedup: um deal que termina a rodada com 'sent'
// fica bloqueado para o resto do arquivo. Um id por cenário mantém os 6 casos
// independentes entre si, nos DOIS estados (antes e depois da correção).
const dealsPage = require('./fixtures/synthetic/deals-page.json');
const MOLDE = dealsPage.find((d) => d.id === 101);

let dealsServidos = [];
function servirDeal(id) {
  dealsServidos = [{ ...MOLDE, id, title: `Negócio sintético ${id}` }];
}

// O dono (11) e o autor (21) do molde, com e-mails DIFERENTES: é o que faz
// sendStaleNotification produzir dois itens de resultado, sem o qual o cenário de
// sucesso parcial (R-11) não existiria. `links` sem `next` encerra a paginação de
// getUsers (agendor.js:26) na primeira volta.
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
// Variáveis mutáveis de módulo lidas DENTRO do stub: o mock nunca é reinstalado
// no meio do arquivo (`node --test` isola por arquivo, não por `test()`).
let modoEnvio = 'ok'; // 'ok' | 'falha-total' | 'parcial'
let fabricaDeveLancar = false;

// Erro PERMANENTE, deliberadamente NÃO classificável como erro de rede por
// `sendMailWithRetry` (emailer.js:198-202): a mensagem não contém 'timeout' nem
// 'econnreset' e o `code` não é ECONNRESET/ETIMEDOUT. Consequência: o retry
// devolve `{ success:false }` na PRIMEIRA tentativa, sem as esperas de 3s/6s.
// É por isso que este arquivo não precisa de fake timers para `setTimeout` nem
// do helper `avancarRelogioAte` — e não deve usar `mock.timers.tickAsync`, que
// só existe a partir do Node 23 (o CI roda Node 20). A contagem de tentativas do
// retry já tem o seu oráculo em `emailer.timeout.test.js` (04-04); aqui o objeto
// de medida é o STATUS gravado, não o retry.
function erroPermanente() {
  return Object.assign(new Error('550 5.1.1 Caixa postal indisponível'), {
    code: 'EENVELOPE',
  });
}

// Falha na FÁBRICA do transporte: o erro escapa de sendStaleNotification e cai no
// catch de scheduler.js:142 — o caminho que hoje insere uma segunda linha (Q1-2).
function erroDeFabrica() {
  return new Error('transporte SMTP indisponível ao criar a conexão');
}

// PC-13: o objeto de opções (que carrega auth.pass) não é capturado nem asserido.
mock.method(nodemailer, 'createTransport', () => {
  if (fabricaDeveLancar) throw erroDeFabrica();
  return {
    verify: async () => true,
    sendMail: async (mailOptions) => {
      if (modoEnvio === 'falha-total') throw erroPermanente();
      if (modoEnvio === 'parcial' && mailOptions.to === AUTOR) {
        throw erroPermanente();
      }
      return {};
    },
  };
});

// require do db e do scheduler DEPOIS de DB_PATH e do stub de axios.
const db = require('../src/db');
const { runCheck } = require('../src/scheduler');

// O default do projeto é 'false' (db.js:114). Ligado aqui para que dono e autor
// sejam destinatários distintos — pré-requisito do cenário de sucesso parcial.
db.setConfig('notify_author', 'true');

before(() => {
  // Só 'Date': habilitar 'setTimeout' congelaria a espera entre lotes de páginas
  // (agendor.js:173). Com uma página só, nada espera.
  mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
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
  fabricaDeveLancar = false;
});

// Linhas do deal, da mais recente para a mais antiga. Usa getNotificationLogs
// (db.js:210-220), que já devolve { logs, total } — nenhuma consulta SQL ad-hoc.
// A ordenação é por `id` e não por `sent_at` porque o relógio está congelado:
// todas as linhas do arquivo compartilham o mesmo `sent_at`.
function linhasDoDeal(dealId) {
  const { logs } = db.getNotificationLogs({ limit: 100 });
  return logs.filter((l) => l.deal_id === dealId).sort((a, b) => b.id - a.id);
}

// ── Q1-2 — exceção no envio: uma linha só, e ela é 'error' ────────
// Declarado PRIMEIRO de propósito: é o único cenário que assere o `total` GLOBAL
// da tabela, e isso só é uma medida limpa enquanto esta é a primeira rodada do
// arquivo. Antes da correção o total é 2 (a 'sent' otimista + a 'error' inserida
// pelo catch); depois, 1.
test('Q1-2: exceção no envio deixa UMA linha com status "error" (sem "sent" órfã)', async () => {
  const dealId = 1101;
  servirDeal(dealId);
  fabricaDeveLancar = true;

  const r = await runCheck();

  // D-03 intocado: a rodada registra o erro e segue; nada é relançado.
  assert.equal(r.error, undefined, 'a exceção do envio não derruba a rodada');
  assert.ok(
    r.errors.length >= 1,
    'o erro do envio é registrado em results.errors',
  );

  const linhas = linhasDoDeal(dealId);
  assert.equal(
    linhas.length,
    1,
    'o caminho de exceção deve ATUALIZAR a linha existente, não inserir uma segunda',
  );
  assert.equal(
    linhas[0].status,
    'error',
    'a única linha do deal precisa refletir a falha',
  );
  assert.match(
    linhas[0].error,
    /transporte SMTP indisponível/,
    'a mensagem da exceção é preservada na coluna error',
  );

  const { total } = db.getNotificationLogs({ limit: 100 });
  assert.equal(
    total,
    1,
    'esta é a primeira rodada do arquivo e serviu um único deal: uma notificação, uma linha',
  );
});

// ── Q1-3 — falha total por RETORNO: 'error' ──────────────────────
test('Q1-3: { success:false } em todos os destinatários deixa a linha com status "error"', async () => {
  const dealId = 1103;
  servirDeal(dealId);
  modoEnvio = 'falha-total';

  await runCheck();

  const linhas = linhasDoDeal(dealId);
  assert.equal(linhas.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhas[0].status,
    'error',
    'nenhum destinatário confirmou o envio: a linha não pode dizer "sent"',
  );
  assert.match(
    linhas[0].error,
    /Caixa postal indisponível/,
    'o erro devolvido por destinatário é agregado na coluna error',
  );
});

// ── Q1-1 — envio confirmado: 'sent' ──────────────────────────────
test('Q1-1: envio confirmado deixa a linha com status "sent" e error nulo', async () => {
  const dealId = 1105;
  servirDeal(dealId);

  const r = await runCheck();

  assert.equal(r.notified, 1, 'a rodada contabiliza a notificação enviada');

  const linhas = linhasDoDeal(dealId);
  assert.equal(linhas.length, 1, 'uma notificação, uma linha');
  assert.equal(linhas[0].status, 'sent');
  assert.equal(
    linhas[0].error,
    null,
    'sem falha em nenhum destinatário, não há erro a registrar',
  );
});

// ── R-11 — sucesso parcial: 'sent', com o erro do que falhou ─────
// O risco que este caso fecha: classificar o parcial como 'error' faria a dedup
// liberar o deal no dia seguinte e quem JÁ recebeu receberia de novo.
test('R-11: sucesso parcial (dono ok, autor falha) mantém "sent" e registra o erro agregado', async () => {
  const dealId = 1107;
  servirDeal(dealId);
  modoEnvio = 'parcial';

  const r = await runCheck();

  // D-03 intocado: o destinatário que falhou vai para results.errors e a rodada segue.
  assert.equal(
    r.errors.length,
    1,
    'exatamente o destinatário que falhou entra em results.errors',
  );

  const linhas = linhasDoDeal(dealId);
  assert.equal(linhas.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhas[0].status,
    'sent',
    '≥ 1 destinatário confirmado é envio real — a dedup precisa proteger quem recebeu',
  );
  assert.match(
    linhas[0].error,
    /Caixa postal indisponível/,
    'o parcial não pode apagar o rastro do destinatário que falhou',
  );
});

// ── Q1-4 — a dedup passa a refletir apenas envios confirmados ────
test('Q1-4: registro de HOJE com status "error" NÃO bloqueia a rodada seguinte', () => {
  const dealId = 9104;

  // Semeia por uma SEGUNDA conexão ao MESMO arquivo temporário, porque
  // logNotification sempre grava status/sent_at do fluxo real. Diferença para
  // db.dedup.test.js:54-87: lá o `false` vinha da DATA (sent_at de ontem);
  // aqui o sent_at é de HOJE e o `false` vem do STATUS.
  const seed = openRaw(DB_PATH);
  try {
    seed
      .prepare(
        `INSERT INTO notification_log
           (deal_id, deal_title, owner_name, owner_email, admin_email, sent_at, days_stale, status, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dealId,
        'Deal cuja notificação de hoje falhou',
        'Ana Vendas',
        DONO,
        '',
        HOJE_ISO,
        30,
        'error',
        '550 5.1.1 Caixa postal indisponível',
      );
  } finally {
    seed.close();
  }

  assert.equal(
    db.alreadyNotifiedToday(dealId),
    false,
    'uma tentativa que falhou hoje precisa ser retentável na rodada seguinte',
  );
});

// ── Q1-5 — a dedup de envios confirmados continua íntegra ────────
test('Q1-5: registro de HOJE com status "sent" continua bloqueando duplicação', () => {
  const dealId = 9105;

  const seed = openRaw(DB_PATH);
  try {
    seed
      .prepare(
        `INSERT INTO notification_log
           (deal_id, deal_title, owner_name, owner_email, admin_email, sent_at, days_stale, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dealId,
        'Deal notificado com sucesso hoje',
        'Ana Vendas',
        DONO,
        '',
        HOJE_ISO,
        30,
        'sent',
      );
  } finally {
    seed.close();
  }

  // O conserto de REL-05 não pode afrouxar a garantia original: quem recebeu
  // hoje não recebe de novo hoje.
  assert.equal(
    db.alreadyNotifiedToday(dealId),
    true,
    'um envio confirmado no dia continua deduplicando',
  );
});
