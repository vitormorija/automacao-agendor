// Prova da SEGUNDA metade de CR3-01 (rodada 3 do code review): o agendador ainda envia
// e-mail para um negócio que ele NÃO SABE CLASSIFICAR.
//
// `agendor.categoriaIndecidivel.test.js` (plano 04-19) mede a BORDA: o oráculo de lá é a
// LISTA que `getStaleDeals` devolve — quantas tentativas a consulta de categoria fez e se o
// negócio saiu marcado `categoriaIndecidivel`. Isso não diz nada sobre quem recebe e-mail:
// com a borda já corrigida, o campo existe e ninguém o lê, e o `runCheck` continua notificando
// uma organização que pode ser 'Parceiro'. Aqui o oráculo é OUTRO — é o e-mail que sai ou não
// sai (`sendMail` por destinatário) e a linha que entra ou não entra no `notification_log`
// real, gravado num SQLite temporário. É o único lugar da suíte onde o efeito irreversível
// (um e-mail enviado) é observado de ponta a ponta.
//
// A decisão do usuário (2026-08-05) tem DOIS lados e os dois são medidos aqui: o negócio
// indecidível fica FORA do envio e PERMANECE no painel — por isso ele continua em `r.deals`,
// marcado como `skipped` e com o motivo escrito, em vez de desaparecer. E a rodada NÃO é
// abortada: a rota "uma organização inatingível derruba a verificação do dia inteiro" foi
// explicitamente rejeitada e é vigiada aqui por `r.error === undefined`.
//
// Os cenários:
//   A  a organização do PRIMEIRO negócio é inatingível  -> ele não recebe nada; o 2º recebe
//   B  SIMÉTRICO: a organização do SEGUNDO é inatingível -> o 1º recebe; o 2º não
//   C  não-regressão: nada falha                        -> os DOIS recebem
//
// Referências por âncora nomeada — função, identificador ou caso de teste —, nunca por número
// de linha (WR2-06). PC-13: nada aqui captura, assere ou imprime o objeto de opções do
// transporte SMTP, que carrega `auth.pass`; o stub de `sendMail` lê apenas `mailOptions.to`.

const { makeTmpDbPath } = require('./helpers/tmpDb');

// Cria o arquivo temporário e fixa DB_PATH ANTES de qualquer require('../src/db'): db.js lê
// process.env.DB_PATH no load e abre a conexão ali (seam 01-01). O runCheck grava no
// notification_log de verdade — backend/agendor.db fica intocado.
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

// setup.js só define DB_PATH se ausente — como já definimos acima, o temp vence.
require('./setup');

const { test, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { installFakeAxios } = require('./helpers/fakeAxios');
const { avancarRelogioAte } = require('./helpers/fakeTimers');

// Relógio fixo: mesmo instante dos demais arquivos de notificação, para que a fixture
// compartilhada signifique aqui exatamente o que significa lá.
// now = 2026-06-01 -> cutoff = 2026-05-17 (staleDays 15).
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

// Destinatários DISTINTOS por negócio. Sem isso não existiria a asserção central: com dono e
// autor compartilhados entre os dois negócios, "zero envios para os destinatários do primeiro"
// seria indistinguível de "zero envios na rodada inteira".
const DONO_1 = 'dono1@exemplo.invalid';
const AUTOR_1 = 'autor1@exemplo.invalid';
const DONO_2 = 'dono2@exemplo.invalid';
const AUTOR_2 = 'autor2@exemplo.invalid';

// Fixture REUSADA (não recriada): o negócio 101 é o "incluído base" do golden — passa por
// todos os filtros de getStaleDeals. Cada rodada serve CLONES dele com ids próprios, porque a
// dedup do próprio SUT (alreadyNotifiedToday) acopla os casos entre si.
const dealsPage = require('./fixtures/synthetic/deals-page.json');
const MOLDE = dealsPage.find((d) => d.id === 101);

// A organização de cada negócio deriva do id dele, para que os dois clones NUNCA compartilhem
// organização: a falha é injetada por id de organização, e com uma organização só ela atingiria
// os dois negócios de uma vez — o cenário perderia a testemunha que prova que a rodada seguiu.
function organizacaoDe(dealId) {
  return dealId + 100;
}

// DOIS negócios por rodada, e é essa a diferença que faz os cenários existirem: o outro negócio
// é a testemunha de que o `for` de runCheck não foi abortado E de que a guarda não é larga
// demais. A ordem é preservada por getStaleDeals (que não reordena), então o primeiro id servido
// é o primeiro processado.
let dealsServidos = [];
function servirDeals(idPrimeiro, idSegundo) {
  dealsServidos = [
    {
      ...MOLDE,
      id: idPrimeiro,
      title: `Negócio sintético ${idPrimeiro}`,
      owner: { id: 31, name: 'Ana Vendas' },
      author: { id: 41, name: 'Ana Vendas' },
      organization: {
        id: organizacaoDe(idPrimeiro),
        name: `Org ${organizacaoDe(idPrimeiro)}`,
      },
    },
    {
      ...MOLDE,
      id: idSegundo,
      title: `Negócio sintético ${idSegundo}`,
      owner: { id: 32, name: 'Bruno Vendas' },
      author: { id: 42, name: 'Bruno Vendas' },
      organization: {
        id: organizacaoDe(idSegundo),
        name: `Org ${organizacaoDe(idSegundo)}`,
      },
    },
  ];
}

const USUARIOS = {
  data: [
    { id: 31, name: 'Ana Vendas', contact: { email: DONO_1 } },
    { id: 41, name: 'Ana Vendas', contact: { email: AUTOR_1 } },
    { id: 32, name: 'Bruno Vendas', contact: { email: DONO_2 } },
    { id: 42, name: 'Bruno Vendas', contact: { email: AUTOR_2 } },
  ],
  links: {},
};

// ── Controle mutável das bordas ───────────────────────────────────────────────
// O stub NUNCA é reinstalado entre casos (depois do require de agendor.js a instância `api` já
// existe e um novo mock.method não teria efeito): o routeHandler ramifica por estas variáveis.
let orgQueFalha = null;
let consultasPorOrg = {};

// Erro fiel ao que o axios produz num rate limit: o que fetchWithRetry consulta é a PRESENÇA de
// `err.response.status` (mesmo molde de agendor.retry429.test.js e de
// agendor.categoriaIndecidivel.test.js).
function erro429() {
  return Object.assign(new Error('Request failed with status code 429'), {
    response: { status: 429 },
  });
}

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
    const id = Number(url.split('/').pop());
    consultasPorOrg[id] = (consultasPorOrg[id] || 0) + 1;
    // 429 SEMPRE para a organização escolhida: é a falha PERSISTENTE, a única que sobrevive ao
    // retry da borda (04-19) e portanto a única que chega ao agendador como indecidível.
    if (id === orgQueFalha) return Promise.reject(erro429());
    // 'Lead' não está em EXCLUDED_CATEGORIES: as demais organizações são elegíveis.
    return { data: { data: { category: { name: 'Lead' } } } };
  }
  if (url === '/tasks') {
    // Nenhuma tarefa futura: nenhum negócio é "protegido", o fluxo segue para o envio.
    return { data: { data: [] } };
  }
  if (url === '/users') {
    return { data: USUARIOS };
  }
  return { data: { data: [] } };
});

// ── Controle do envio ─────────────────────────────────────────────────────────
let transportesCriados = 0;
let enviosPorDestinatario = {};

// PC-13: o objeto de opções do TRANSPORTE (que carrega auth.pass) sequer chega aqui — a fábrica
// o ignora. O stub de sendMail lê exclusivamente `mailOptions.to`, o endereço de destino, que é
// o dado sob medição.
mock.method(nodemailer, 'createTransport', () => {
  transportesCriados++;
  return {
    verify: async () => true,
    sendMail: async (mailOptions) => {
      const destinatario = mailOptions.to;
      enviosPorDestinatario[destinatario] =
        (enviosPorDestinatario[destinatario] || 0) + 1;
      return {};
    },
  };
});

const db = require('../src/db');
const { runCheck } = require('../src/scheduler');

// O default do projeto é 'false' (db.js). Ligado aqui para que dono e autor sejam destinatários
// distintos — são eles que formam o par de endereços de cada negócio.
db.setConfig('notify_author', 'true');

after(() => {
  mock.restoreAll();
  db.closeDb();
  cleanup();
  mock.timers.reset();
});

// Contadores E RELÓGIO voltam ao estado inicial antes de cada caso.
//
// Rearmar o relógio não é zelo decorativo (mesmo motivo registrado em agendor.retry429.test.js):
// avançar o tempo é o mecanismo que faz as esperas de 5s/10s do retry resolverem, então cada
// caso que retenta DEIXA o relógio adiantado para o caso seguinte — e o cutoff de 15 dias anda
// junto. `reset()` antes de `enable()` porque `enable()` lança se os timers já estiverem
// habilitados.
beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: FIXED_NOW });
  orgQueFalha = null;
  consultasPorOrg = {};
  transportesCriados = 0;
  enviosPorDestinatario = {};
});

// Linhas do negócio no notification_log, da mais recente para a mais antiga. Usa
// getNotificationLogs — nenhuma consulta SQL ad-hoc.
function linhasDoDeal(dealId) {
  const { logs } = db.getNotificationLogs({ limit: 100 });
  return logs.filter((l) => l.deal_id === dealId).sort((a, b) => b.id - a.id);
}

function envios(destinatario) {
  return enviosPorDestinatario[destinatario] || 0;
}

// ── A — a organização do PRIMEIRO negócio é inatingível ───────────────────────
test('A: negócio de categoria indecidível não recebe e-mail nem linha de log, e a rodada continua notificando o outro', async () => {
  const primeiro = 2301;
  const segundo = 2302;
  servirDeals(primeiro, segundo);
  orgQueFalha = organizacaoDe(primeiro);

  const r = await avancarRelogioAte(runCheck());

  // Pré-condição: o caminho medido é o da falha PERSISTENTE, depois de o retry do 04-19 ter
  // tentado de verdade. Sem ela, um cenário em que a borda nem consultou passaria como se
  // tivesse provado alguma coisa (lição de WR-05).
  assert.equal(
    consultasPorOrg[orgQueFalha],
    3,
    'pré-condição: a consulta de categoria precisa ter esgotado as 3 tentativas do retry',
  );

  // A rota REJEITADA pelo usuário: uma organização inatingível não pode abortar a rodada.
  assert.equal(
    r.error,
    undefined,
    'uma organização inatingível não aborta a verificação do dia',
  );
  assert.equal(
    r.deals.length,
    2,
    'o negócio indecidível PERMANECE no resultado — a outra metade da decisão do usuário',
  );

  const itemPrimeiro = r.deals.find((d) => d.id === primeiro);
  assert.notEqual(itemPrimeiro, undefined);
  assert.equal(
    itemPrimeiro.skipped,
    true,
    'o negócio indecidível é marcado como ignorado, não removido',
  );
  assert.equal(
    typeof itemPrimeiro.skipReason === 'string' &&
      itemPrimeiro.skipReason.length > 0,
    true,
    'o motivo precisa estar escrito: negócio suprimido sem justificativa é repúdio (T-04-20-04)',
  );

  // O efeito irreversível: nenhum e-mail saiu para os destinatários DELE.
  assert.equal(envios(DONO_1), 0, 'o dono do negócio indecidível não recebe');
  assert.equal(envios(AUTOR_1), 0, 'o autor do negócio indecidível não recebe');

  // E nenhum vestígio no notification_log: não houve evento de envio, e uma linha 'pending'
  // aqui poluiria a dedup e o histórico com um evento que nunca existiu (T-04-20-03).
  assert.equal(
    linhasDoDeal(primeiro).length,
    0,
    'nenhuma linha é inserida para um negócio que a guarda nem deixa chegar ao bloco de envio',
  );

  // A testemunha: o outro negócio foi notificado DE VERDADE, não apenas "processado".
  assert.equal(envios(DONO_2), 1, 'o dono do negócio elegível recebe');
  assert.equal(envios(AUTOR_2), 1, 'o autor do negócio elegível recebe');
  const linhasSegundo = linhasDoDeal(segundo);
  assert.equal(linhasSegundo.length, 1, 'uma notificação, uma linha');
  assert.equal(linhasSegundo[0].status, 'sent');
  assert.equal(
    r.notified,
    1,
    'exatamente uma notificação confirmada na rodada — a do negócio elegível',
  );
});

// ── B — SIMÉTRICO: a organização do SEGUNDO negócio é inatingível ─────────────
//
// Este é o cenário SIMÉTRICO exigido pela rodada 3, e ele existe por um motivo medido: as
// rodadas r1 e r2 desta fase fecharam três vezes seguidas o cenário exato do achado e deixaram
// o vizinho aberto (CR2-01 -> CR3-01, WR2-02 -> WR3-02, WR2-04 -> WR3-03). Aqui o vizinho é a
// ORDEM INVERSA — é ele que separa "a guarda funciona" de "a guarda funciona porque o negócio
// afetado calhava de ser o primeiro da lista", que é exatamente o tipo de acoplamento posicional
// que um `continue` mal colocado produziria sem nenhum caso vermelho para acusá-lo.
test('B: SIMÉTRICO — a falha na organização do SEGUNDO negócio produz o espelho exato do cenário A', async () => {
  const primeiro = 2311;
  const segundo = 2312;
  servirDeals(primeiro, segundo);
  orgQueFalha = organizacaoDe(segundo);

  const r = await avancarRelogioAte(runCheck());

  assert.equal(
    consultasPorOrg[orgQueFalha],
    3,
    'pré-condição: a consulta de categoria precisa ter esgotado as 3 tentativas do retry',
  );
  assert.equal(
    r.error,
    undefined,
    'uma organização inatingível não aborta a verificação do dia',
  );
  assert.equal(r.deals.length, 2);

  // O primeiro, agora elegível, é notificado normalmente.
  assert.equal(envios(DONO_1), 1);
  assert.equal(envios(AUTOR_1), 1);
  const linhasPrimeiro = linhasDoDeal(primeiro);
  assert.equal(linhasPrimeiro.length, 1, 'uma notificação, uma linha');
  assert.equal(linhasPrimeiro[0].status, 'sent');

  // O segundo, indecidível, fica fora do envio e sem vestígio de envio.
  const itemSegundo = r.deals.find((d) => d.id === segundo);
  assert.notEqual(itemSegundo, undefined);
  assert.equal(itemSegundo.skipped, true);
  assert.equal(
    typeof itemSegundo.skipReason === 'string' &&
      itemSegundo.skipReason.length > 0,
    true,
    'o motivo precisa estar escrito também quando o afetado é o último da rodada',
  );
  assert.equal(envios(DONO_2), 0);
  assert.equal(envios(AUTOR_2), 0);
  assert.equal(linhasDoDeal(segundo).length, 0);

  assert.equal(
    r.notified,
    1,
    'exatamente uma notificação confirmada na rodada — a do negócio elegível',
  );
});

// ── C — não-regressão: nada falha ─────────────────────────────────────────────
//
// É este caso que impede a guarda de virar um filtro largo demais. Uma condição escrita ao
// contrário (ou lida de um campo ausente e portanto sempre "verdadeiro") suprimiria notificação
// legítima em silêncio — a pior classe de falha do Core Value, e a única que nenhum cenário de
// falha consegue acusar.
test('C: rodada sã — sem falha de categoria, os dois negócios são notificados e nenhum é ignorado', async () => {
  const primeiro = 2321;
  const segundo = 2322;
  servirDeals(primeiro, segundo);
  orgQueFalha = null;

  const r = await avancarRelogioAte(runCheck());

  assert.equal(r.error, undefined);
  assert.equal(r.deals.length, 2);
  assert.equal(
    r.deals.some((d) => d.skipped === true),
    false,
    'nenhum negócio pode ser ignorado quando todas as categorias foram obtidas',
  );

  assert.equal(envios(DONO_1), 1);
  assert.equal(envios(AUTOR_1), 1);
  assert.equal(envios(DONO_2), 1);
  assert.equal(envios(AUTOR_2), 1);
  assert.equal(
    transportesCriados > 0,
    true,
    'pré-condição: o envio de fato passou pela fábrica de transporte',
  );

  assert.equal(linhasDoDeal(primeiro).length, 1);
  assert.equal(linhasDoDeal(primeiro)[0].status, 'sent');
  assert.equal(linhasDoDeal(segundo).length, 1);
  assert.equal(linhasDoDeal(segundo)[0].status, 'sent');

  assert.equal(r.notified, 2, 'os dois negócios elegíveis foram notificados');
});
