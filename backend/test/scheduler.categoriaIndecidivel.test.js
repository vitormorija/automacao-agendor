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
//   D  APAGÃO: as organizações dos DOIS são inatingíveis -> ninguém recebe, e a rodada AVISA
//   E  SIMÉTRICO DE CAUSA: os DOIS no funil Beefor       -> ninguém recebe, e a rodada CALA
//
// Por que D e E existem (CR4-01). Os cenários A e B medem supressão de 1 de 2, e por isso
// "supressão parcial" e "apagão total" produziam o MESMO resultado observável: campo de erro
// vazio, array de erros vazio, nenhuma linha de log agregado e o mesmo `results.skipped` — que
// é o MESMO contador incrementado pela dedup do dia, pelo funil e por "sem destinatário". Uma
// rodada em que a borda de organizações caiu INTEIRA ficava indistinguível de um dia em que
// todo mundo já tinha sido notificado às 8h. O cenário D fecha essa lacuna pelo lado do alarme.
// O cenário E fecha pelo lado oposto, e é ele que impede o alarme de virar ruído diário: com o
// MESMO `results.skipped`, o MESMO `notified: 0` e a MESMA linha de conclusão, uma supressão
// total por OUTRA causa continua silenciosa. O par existe para provar que o alarme discrimina
// a CAUSA da supressão, e não apenas a QUANTIDADE de negócios suprimidos.
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

// Irmã de `servirDeals` para o cenário E: os MESMOS dois clones, com os MESMOS donos e autores,
// trocando exclusivamente o funil. É essa igualdade que faz o cenário medir a CAUSA da supressão
// e não outra coisa.
//
// O `name` da ETAPA é PRESERVADO do molde de propósito: `isExcludedStage(deal.dealStage?.name)`
// roda ANTES em getStaleDeals, então uma etapa trocada por descuido excluiria o negócio ainda na
// borda — ele nunca chegaria ao `for` de runCheck, `results.stale` seria 0 e o caso mediria uma
// lista vazia em vez de uma supressão por funil.
function servirDealsDoFunilBeefor(idPrimeiro, idSegundo) {
  servirDeals(idPrimeiro, idSegundo);
  dealsServidos = dealsServidos.map((deal) => ({
    ...deal,
    dealStage: { name: MOLDE.dealStage.name, funnel: { name: 'Beefor' } },
  }));
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
// A falha é injetada por um CONJUNTO de ids de organização, e não por um id solto, porque o
// cenário D precisa derrubar as organizações dos DOIS negócios na MESMA rodada — com uma
// variável escalar o apagão total seria inexprimível. A conversão não muda nada do que A, B e
// C mediam: cada um deles povoa o conjunto com um id ou com nenhum.
let orgsQueFalham = new Set();
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
    // 429 SEMPRE para as organizações escolhidas: é a falha PERSISTENTE, a única que sobrevive
    // ao retry da borda (04-19) e portanto a única que chega ao agendador como indecidível.
    if (orgsQueFalham.has(id)) return Promise.reject(erro429());
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
  orgsQueFalham = new Set();
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
  orgsQueFalham = new Set([organizacaoDe(primeiro)]);

  const r = await avancarRelogioAte(runCheck());

  // Pré-condição: o caminho medido é o da falha PERSISTENTE, depois de o retry do 04-19 ter
  // tentado de verdade. Sem ela, um cenário em que a borda nem consultou passaria como se
  // tivesse provado alguma coisa (lição de WR-05).
  assert.equal(
    consultasPorOrg[organizacaoDe(primeiro)],
    3,
    'pré-condição: a consulta de categoria precisa ter esgotado as 3 tentativas do retry',
  );

  // A rota REJEITADA pelo usuário: uma organização inatingível não pode abortar a rodada.
  assert.equal(
    r.error,
    undefined,
    'uma organização inatingível não aborta a verificação do dia',
  );

  // É este caso e o B que fixam o limiar do alarme de CR4-01 POR BAIXO: com 1 de 2 negócios
  // suprimidos, a rodada continua sem NENHUM sinal agregado de erro. Qualquer limiar
  // proporcional abaixo de 100% — inclusive "metade ou mais", que com 2 negócios dá 1 — deixa
  // estes dois casos vermelhos, porque a rodada passaria a se ANUNCIAR como falha num cenário
  // que o contrato de CR3-01 fixou como normal.
  assert.equal(
    r.skippedCategoriaIndecidivel,
    1,
    'o contador dedicado existe e separa esta supressão da dedup, do funil e do "sem destinatário"',
  );
  assert.equal(
    r.errors.length,
    0,
    'supressão PARCIAL não entra no array de erros que a UI renderiza',
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
  orgsQueFalham = new Set([organizacaoDe(segundo)]);

  const r = await avancarRelogioAte(runCheck());

  assert.equal(
    consultasPorOrg[organizacaoDe(segundo)],
    3,
    'pré-condição: a consulta de categoria precisa ter esgotado as 3 tentativas do retry',
  );
  assert.equal(
    r.error,
    undefined,
    'uma organização inatingível não aborta a verificação do dia',
  );

  // O limiar por baixo vale igualmente quando o afetado é o ÚLTIMO da rodada: 1 de 2 suprimidos
  // continua sendo supressão parcial, e supressão parcial não produz sinal agregado de erro.
  assert.equal(
    r.skippedCategoriaIndecidivel,
    1,
    'o contador dedicado conta o negócio suprimido também na ordem inversa',
  );
  assert.equal(
    r.errors.length,
    0,
    'supressão PARCIAL não entra no array de erros que a UI renderiza',
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
  // `orgsQueFalham` permanece VAZIA (o beforeEach a rearma assim): é a AUSÊNCIA de falha que
  // faz este caso medir a não-regressão.

  const r = await avancarRelogioAte(runCheck());

  assert.equal(r.error, undefined);
  assert.equal(
    r.skippedCategoriaIndecidivel,
    0,
    'o contador dedicado é zero numa rodada sã — ele não pode contar o que a guarda não suprimiu',
  );
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

// ── D — APAGÃO: as organizações dos DOIS negócios são inatingíveis ────────────
//
// Sem este caso, o apagão total e o dia calmo continuam sendo o MESMO resultado observável: A e
// B só medem 1 de 2, e a testemunha notificada que eles usam é justamente o que desaparece
// quando a borda inteira cai. Aqui não há testemunha — é a rodada que precisa falar por si.
//
// A metade "permanece no painel" da decisão do usuário continua medida MESMO no apagão: os dois
// negócios seguem em `r.deals`, marcados e com motivo escrito. Sinalizar a rodada como erro não
// pode virar desculpa para sumir com eles do painel.
test('D: 2 de 2 — a supressão TOTAL por categoria indecidível vira erro da rodada', async () => {
  const primeiro = 2331;
  const segundo = 2332;
  servirDeals(primeiro, segundo);
  orgsQueFalham = new Set([organizacaoDe(primeiro), organizacaoDe(segundo)]);

  const r = await avancarRelogioAte(runCheck());

  // Pré-condição, a mesma de A e B: a falha é PERSISTENTE nas DUAS organizações, depois de o
  // retry do 04-19 ter tentado de verdade.
  assert.equal(
    consultasPorOrg[organizacaoDe(primeiro)],
    3,
    'pré-condição: a organização do primeiro negócio esgotou as 3 tentativas do retry',
  );
  assert.equal(
    consultasPorOrg[organizacaoDe(segundo)],
    3,
    'pré-condição: a organização do segundo negócio esgotou as 3 tentativas do retry',
  );

  assert.equal(
    r.skippedCategoriaIndecidivel,
    2,
    'os DOIS negócios foram suprimidos pela guarda de categoria',
  );

  // As DUAS superfícies do alarme. O campo de erro é o que a decisão do usuário nomeia; o array
  // é o único que o Dashboard de fato renderiza (`lastRun?.errors?.length > 0`).
  assert.equal(
    typeof r.error === 'string' && r.error.length > 0,
    true,
    'a rodada totalmente suprimida preenche o campo de erro',
  );
  assert.equal(
    r.errors.length,
    1,
    'e entra UMA vez no array de erros que a UI renderiza — um alarme por rodada, não um por negócio',
  );

  assert.equal(r.notified, 0, 'nenhuma notificação saiu nesta rodada');

  // A metade "permanece no painel": o apagão não pode custar a visibilidade dos negócios.
  assert.equal(
    r.deals.length,
    2,
    'os dois negócios PERMANECEM no resultado mesmo no apagão',
  );
  for (const id of [primeiro, segundo]) {
    const item = r.deals.find((d) => d.id === id);
    assert.notEqual(item, undefined);
    assert.equal(item.skipped, true);
    assert.equal(
      typeof item.skipReason === 'string' && item.skipReason.length > 0,
      true,
      'o motivo continua escrito por negócio, além do alarme agregado',
    );
  }

  // O efeito irreversível: nenhum e-mail para nenhum dos quatro destinatários.
  assert.equal(envios(DONO_1), 0);
  assert.equal(envios(AUTOR_1), 0);
  assert.equal(envios(DONO_2), 0);
  assert.equal(envios(AUTOR_2), 0);

  // E nenhum vestígio no notification_log: não houve evento de envio (T-04-20-03). O alarme
  // mora no resultado da rodada, não numa linha de histórico que mentiria sobre um envio.
  assert.equal(linhasDoDeal(primeiro).length, 0);
  assert.equal(linhasDoDeal(segundo).length, 0);
});

// ── E — SIMÉTRICO: 2 de 2 por OUTRA causa NÃO dispara o alarme ────────────────
//
// Este é o par que fecha o achado. O cenário D prova que o apagão passa a ser audível; o E prova
// que o alarme não vira ruído. Uma rodada com o MESMO `results.skipped`, o MESMO `notified: 0` e
// a MESMA linha de conclusão continua SILENCIOSA quando a causa é determinística, lida do payload
// do próprio negócio e já tem motivo escrito.
//
// Sem o E, qualquer implementação que ligasse o alarme em `results.notified === 0` — ou em
// `results.skipped === results.stale` — passaria, e o operador receberia um erro todo dia em que
// só houvesse negócios do funil Beefor parados. Um alarme que dispara sem causa é um alarme que
// se aprende a ignorar, e aí o apagão real volta a passar despercebido.
//
// A ordem das asserções é deliberada: as do funil vêm ANTES da do contador. Assim o vermelho do
// RED distingue "a armação do funil não produziu a supressão" de "o contador ainda não existe".
test('E: SIMÉTRICO — 2 de 2 suprimidos por FUNIL não disparam o alarme de categoria', async () => {
  const primeiro = 2341;
  const segundo = 2342;
  servirDealsDoFunilBeefor(primeiro, segundo);
  // `orgsQueFalham` VAZIA: as categorias são consultadas com sucesso. A supressão aqui é do
  // funil, e é essa diferença de CAUSA que o caso mede.

  const r = await avancarRelogioAte(runCheck());

  // Pré-condição: os dois negócios chegaram ao `for` de runCheck e foram suprimidos lá — não
  // filtrados antes, na borda, por `isExcludedStage`.
  assert.equal(
    r.stale,
    2,
    'pré-condição: os dois negócios entraram na rodada (a etapa do molde foi preservada)',
  );
  assert.equal(
    r.skipped,
    2,
    'os dois foram suprimidos — o MESMO contador compartilhado do cenário D',
  );
  assert.equal(r.notified, 0, 'e o MESMO notified: 0 do cenário D');

  assert.equal(envios(DONO_1), 0);
  assert.equal(envios(AUTOR_1), 0);
  assert.equal(envios(DONO_2), 0);
  assert.equal(envios(AUTOR_2), 0);

  // O que MUDA em relação ao D, e é o ponto inteiro deste caso: nenhum sinal de alarme.
  assert.equal(
    r.skippedCategoriaIndecidivel,
    0,
    'nenhuma supressão por categoria: o contador dedicado discrimina a CAUSA',
  );
  assert.equal(
    r.error,
    undefined,
    'supressão total por OUTRA causa não preenche o campo de erro',
  );
  assert.equal(
    r.errors.length,
    0,
    'nem entra no array de erros que a UI renderiza — o alarme não é ruído diário',
  );
});
