// CR3-01 — o CAMINHO VIZINHO: o resumo semanal individual do comercial.
//
// `runCheck` (scheduler) e `sendOwnerWeeklySummary` (este módulo) são os DOIS únicos
// produtores de e-mail dirigido ao RESPONSÁVEL, e os dois leem a mesma lista de
// `getStaleDeals`. O 04-20 fechou o primeiro: o negócio cuja categoria de organização
// não pôde ser consultada (`categoriaIndecidivel`, produzido na borda pelo 04-19) deixou
// de ser notificado no envio diário. Fechar só ele deixaria o mesmo negócio voltar pela
// sexta-feira, pelo segundo caminho — que nenhuma das três rodadas de code review nomeou.
//
// POLÍTICA (decisão do usuário, 2026-08-05): o negócio indecidível sai do e-mail
// INDIVIDUAL do comercial e PERMANECE no consolidado do admin e no snapshot semanal. Não
// saber a categoria é indistinguível de "pode ser uma categoria excluída" — o comercial
// não pode ser notificado sobre isso; o admin é justamente quem precisa VER a anomalia.
// O precedente literal está no mesmo bloco de código: o filtro de funil de
// `sendOwnerWeeklySummary` (funil Beefor, via `shouldNotifyOwner`) já exclui do e-mail
// individual e mantém no relatório do admin, e o comentário existente diz isso.
//
// Referências por âncora nomeada, nunca por número de linha (WR2-06): o alvo é
// `sendOwnerWeeklySummary` em `src/emailer.js`; o contraponto é `sendWeeklySummary`.
//
// PC-13: NUNCA imprimir nem comparar o objeto de opções inteiro — ele carrega `auth.pass`.
// O stub abaixo lê exclusivamente `mailOptions.to` e `mailOptions.html`.
require('./setup');

const { test, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

const { setConfig } = require('../src/db');
setConfig('smtp_host', 'smtp.exemplo.invalid');
setConfig('smtp_port', '587');
setConfig('smtp_user', 'usuario@exemplo.invalid');
setConfig('smtp_from', 'automacao@exemplo.invalid');

// ── Stub da borda SMTP ───────────────────────────────────────────
// Um único stub para o arquivo inteiro (`node --test` isola por ARQUIVO, não por
// `test()`); os cenários variam apenas os dados de entrada. De cada envio guardamos
// somente os dois campos que as asserções precisam — PC-13.
const enviosCapturados = [];

mock.method(nodemailer, 'createTransport', () => ({
  verify: async () => true,
  sendMail: async (mailOptions) => {
    enviosCapturados.push({ to: mailOptions.to, html: mailOptions.html });
    return {};
  },
}));

const { sendOwnerWeeklySummary, sendWeeklySummary } = require('../src/emailer');

// ── Negócios sintéticos ──────────────────────────────────────────
// Aqui não há banco de negócios nem axios: as funções são chamadas DIRETAMENTE com
// objetos no formato que `getStaleDeals` devolve depois do 04-19 (mesmos campos de
// sempre, mais `categoriaIndecidivel`). Isso mantém o arquivo barato e o oráculo preciso.
// Os títulos são reconhecíveis por `includes` no HTML gerado.
function negocio({ id, title, ownerId, funnel, categoriaIndecidivel }) {
  return {
    id,
    title,
    ownerId,
    ownerName: 'Fulana Silva',
    organization: 'Organização Sintética',
    orgCategory: categoriaIndecidivel ? null : 'Cliente',
    categoriaIndecidivel: Boolean(categoriaIndecidivel),
    funnel: funnel || 'Funil Padrão',
    stage: 'Proposta',
    dealType: 'Negócio',
    daysSinceUpdate: 31,
    webUrl: `https://web.agendor.com.br/deal/${id}`,
  };
}

const COMERCIAL = 'comercial@exemplo.invalid';
const ADMIN = 'admin@exemplo.invalid';
const USERS = { 11: { email: COMERCIAL, name: 'Fulana Silva' } };

beforeEach(() => {
  enviosCapturados.length = 0;
});

after(() => {
  mock.restoreAll();
});

test('(1) exclusão parcial: o card indecidível não vai no e-mail individual do comercial', async () => {
  const deals = [
    negocio({ id: 5001, title: 'NEGOCIO-NORMAL', ownerId: 11 }),
    negocio({
      id: 5002,
      title: 'NEGOCIO-INDECIDIVEL',
      ownerId: 11,
      categoriaIndecidivel: true,
    }),
  ];

  const results = await sendOwnerWeeklySummary({ deals, users: USERS });

  assert.equal(enviosCapturados.length, 1);
  assert.equal(enviosCapturados[0].to, COMERCIAL);
  assert.equal(results.length, 1);
  assert.equal(results[0].count, 1);

  // A asserção sobre o HTML é o que impede um conserto que apenas CONTE diferente
  // e continue listando o card: o corpo do e-mail é o que o comercial de fato lê.
  const html = enviosCapturados[0].html;
  assert.equal(html.includes('NEGOCIO-NORMAL'), true);
  assert.equal(html.includes('NEGOCIO-INDECIDIVEL'), false);
});

test('(2) SIMÉTRICO — exclusão total: nenhum e-mail, e não um e-mail vazio', async () => {
  // Este é o cenário SIMÉTRICO exigido pela rodada. O cenário (1) prova que o filtro
  // tira da lista o negócio certo; este prova que o filtro não produz o defeito do
  // outro lado — um e-mail "Seus 0 cards parados" seria uma notificação indevida de
  // outro tipo. Quem impede isso é a saída antecipada já existente em
  // `sendOwnerWeeklySummary`, ANTES de criar o transporte: nenhum envio é tentado.
  const deals = [
    negocio({
      id: 5011,
      title: 'NEGOCIO-INDECIDIVEL-A',
      ownerId: 11,
      categoriaIndecidivel: true,
    }),
    negocio({
      id: 5012,
      title: 'NEGOCIO-INDECIDIVEL-B',
      ownerId: 11,
      categoriaIndecidivel: true,
    }),
  ];

  const results = await sendOwnerWeeklySummary({ deals, users: USERS });

  assert.equal(enviosCapturados.length, 0);
  assert.deepStrictEqual(results, []);
});

test('(3) o consolidado do admin CONTINUA listando o negócio indecidível', async () => {
  // A outra metade da decisão do usuário, medida e não presumida: o admin é a
  // superfície de OBSERVAÇÃO. Um filtro largo demais esconderia a anomalia justamente
  // de quem precisa vê-la.
  const deals = [
    negocio({ id: 5021, title: 'NEGOCIO-NORMAL', ownerId: 11 }),
    negocio({
      id: 5022,
      title: 'NEGOCIO-INDECIDIVEL',
      ownerId: 11,
      categoriaIndecidivel: true,
    }),
  ];

  const results = await sendWeeklySummary({ deals, adminEmails: [ADMIN] });

  assert.equal(enviosCapturados.length, 1);
  assert.equal(enviosCapturados[0].to, ADMIN);
  assert.equal(results.length, 1);
  assert.equal(results[0].success, true);

  const html = enviosCapturados[0].html;
  assert.equal(html.includes('NEGOCIO-NORMAL'), true);
  assert.equal(html.includes('NEGOCIO-INDECIDIVEL'), true);
});

test('(4) os dois filtros compõem: funil Beefor e categoria indecidível somam, não se substituem', async () => {
  const deals = [
    negocio({ id: 5031, title: 'NEGOCIO-NORMAL', ownerId: 11 }),
    negocio({
      id: 5032,
      title: 'NEGOCIO-BEEFOR',
      ownerId: 11,
      funnel: 'Beefor',
    }),
    negocio({
      id: 5033,
      title: 'NEGOCIO-INDECIDIVEL',
      ownerId: 11,
      categoriaIndecidivel: true,
    }),
  ];

  const results = await sendOwnerWeeklySummary({ deals, users: USERS });

  assert.equal(enviosCapturados.length, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].count, 1);

  // Se o filtro novo SUBSTITUÍSSE o antigo em vez de somar-se a ele, o card do funil
  // Beefor reapareceria aqui — e o contrário também: um filtro novo largo demais
  // apagaria o card normal.
  const html = enviosCapturados[0].html;
  assert.equal(html.includes('NEGOCIO-NORMAL'), true);
  assert.equal(html.includes('NEGOCIO-BEEFOR'), false);
  assert.equal(html.includes('NEGOCIO-INDECIDIVEL'), false);
});
