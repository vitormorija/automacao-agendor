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
// WR4-07 — até aqui este arquivo media a POLÍTICA de quem entra no relatório individual
// (cenários 1 a 4). Os cenários 5 a 7 acrescentam outra coisa: a ROBUSTEZ do template
// quando o responsável não tem nome. O que os motiva não é o e-mail de um comercial, é o
// CUSTO AGREGADO — `ownerWeeklyHtml` é montada DENTRO do laço de destinatários e ANTES do
// `try/catch` que envolve o envio, então a exceção sai de `sendOwnerWeeklySummary`, sobe
// até o `catch` de `runWeeklySummary` (scheduler) e encerra o resumo semanal INTEIRO:
// todos os comerciais, inclusive os que já teriam recebido, ficam sem relatório, e o
// único vestígio é uma linha genérica de log.
// A assimetria que denuncia o descuido está medida: a rota `POST /test-owner-summary`
// já guarda o mesmo campo (`ownerName || d.ownerName || 'Comercial Teste'`); o caminho de
// produção não guardava nada.
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
// O parâmetro `ownerName` é OPCIONAL e distingue "não informado" de `null`: só a ausência
// (`undefined`) cai no padrão. Passar `null` explicitamente reproduz o que `getStaleDeals`
// produz quando o payload da borda traz `owner` sem `name` — que é a entrada dos cenários
// 5 a 7. Os cenários 1 a 4 não passam o campo e continuam com o nome de sempre.
function negocio({
  id,
  title,
  ownerId,
  funnel,
  categoriaIndecidivel,
  ownerName,
}) {
  return {
    id,
    title,
    ownerId,
    ownerName: ownerName === undefined ? 'Fulana Silva' : ownerName,
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
const COMERCIAL_CADASTRADO = 'beltrano@exemplo.invalid';
const COMERCIAL_SEM_CADASTRO = 'anonimo@exemplo.invalid';

// Acrescentar entradas a `USERS` não afeta os cenários 1 a 4: todos eles usam
// exclusivamente o id 11, e o agrupamento de `sendOwnerWeeklySummary` só consulta o
// dicionário pelo `ownerId` de cada negócio da lista — entradas não referenciadas por
// nenhum negócio nunca são lidas. O id 13 existe SEM `name` de propósito: é o fundo do
// encadeamento de fallbacks, exercido pelo cenário 7.
const USERS = {
  11: { email: COMERCIAL, name: 'Fulana Silva' },
  12: { email: COMERCIAL_CADASTRADO, name: 'Beltrano Souza' },
  13: { email: COMERCIAL_SEM_CADASTRO },
};

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

// ── WR4-07: responsável sem nome ─────────────────────────────────
// A asserção que importa nos três cenários abaixo é sobre o CORPO ENVIADO, não sobre a
// contagem de envios: um conserto que apenas evitasse a exceção e imprimisse
// "Olá, undefined!" passaria por qualquer asserção de quantidade. O e-mail que sai com um
// buraco no lugar do nome é o mesmo defeito, só que silencioso.
function assertHtmlSemNuloNoNome(html, rotulo) {
  assert.equal(
    html.includes('undefined'),
    false,
    `${rotulo}: o corpo enviado não pode conter a string "undefined"`,
  );
  assert.equal(
    html.includes('null'),
    false,
    `${rotulo}: o corpo enviado não pode conter a string "null"`,
  );
}

test('(5) responsável sem nome no negócio, mas com nome no cadastro: o rótulo resolve pelo cadastro', async () => {
  const deals = [
    negocio({
      id: 5041,
      title: 'NEGOCIO-SEM-NOME-DE-DONO',
      ownerId: 12,
      ownerName: null,
    }),
  ];

  const results = await sendOwnerWeeklySummary({ deals, users: USERS });

  assert.equal(enviosCapturados.length, 1);
  assert.equal(enviosCapturados[0].to, COMERCIAL_CADASTRADO);
  assert.equal(results.length, 1);
  assert.equal(results[0].success, true);

  // O dicionário de `getUsers` TEM o nome cadastrado; o negócio pode não ter. Preferir a
  // melhor fonte é o conserto de verdade — só evitar a exceção deixaria o comercial
  // recebendo uma saudação genérica quando o nome dele está disponível a um `?.name`.
  const html = enviosCapturados[0].html;
  assert.equal(html.includes('Olá, <strong>Beltrano</strong>'), true);
  assertHtmlSemNuloNoNome(html, 'cenário 5');
});

test('(6) AGREGADO — um responsável sem nome não pode custar o relatório de TODOS os outros', async () => {
  // Este é o cenário que mede o dano REAL do achado, e ele não é "um e-mail perdido".
  // `ownerWeeklyHtml` é montada dentro do laço de destinatários e ANTES do `try/catch` do
  // envio: no estado defeituoso a exceção do primeiro grupo escapa de
  // `sendOwnerWeeklySummary`, sobe até o `catch` de `runWeeklySummary` e encerra o resumo
  // semanal inteiro — o responsável 11, que não tem defeito nenhum, fica sem relatório por
  // causa do 12.
  // A ORDEM é parte do instrumento, não estilo: `Object.entries(byOwner)` segue a ordem de
  // inserção, que é a ordem da lista de negócios notificáveis. Com o sem-nome em SEGUNDO
  // lugar, o primeiro grupo já teria sido enviado antes da exceção e o caso ficaria verde
  // mesmo com o defeito presente. Por isso o sem-nome vem PRIMEIRO.
  const deals = [
    negocio({
      id: 5051,
      title: 'NEGOCIO-DO-SEM-NOME',
      ownerId: 12,
      ownerName: null,
    }),
    negocio({ id: 5052, title: 'NEGOCIO-DO-VIZINHO', ownerId: 11 }),
  ];

  const results = await sendOwnerWeeklySummary({ deals, users: USERS });

  assert.equal(enviosCapturados.length, 2);
  const destinatarios = enviosCapturados.map((e) => e.to).sort();
  assert.deepStrictEqual(
    destinatarios,
    [COMERCIAL_CADASTRADO, COMERCIAL].sort(),
    'os DOIS comerciais precisam receber: o defeito de um não pode custar o relatório do outro',
  );

  assert.equal(results.length, 2);
  assert.equal(
    results.every((r) => r.success),
    true,
  );

  assertHtmlSemNuloNoNome(
    enviosCapturados[0].html,
    'cenário 6 — primeiro envio',
  );
  assertHtmlSemNuloNoNome(
    enviosCapturados[1].html,
    'cenário 6 — segundo envio',
  );
});

test('(7) nem no negócio, nem no cadastro: o envio acontece com um rótulo neutro', async () => {
  // O fundo do encadeamento de fallbacks. Sem este cenário a cadeia poderia parar no
  // penúltimo elo — resolvendo pelo cadastro e voltando a desreferenciar nulo quando o
  // cadastro também não tem nome — e ninguém perceberia até a próxima sexta-feira.
  const deals = [
    negocio({
      id: 5061,
      title: 'NEGOCIO-SEM-NOME-EM-LUGAR-NENHUM',
      ownerId: 13,
      ownerName: null,
    }),
  ];

  const results = await sendOwnerWeeklySummary({ deals, users: USERS });

  assert.equal(enviosCapturados.length, 1);
  assert.equal(enviosCapturados[0].to, COMERCIAL_SEM_CADASTRO);
  assert.equal(results.length, 1);
  assert.equal(results[0].success, true);

  const html = enviosCapturados[0].html;
  assert.equal(html.includes('Olá, <strong>Comercial</strong>'), true);
  assertHtmlSemNuloNoNome(html, 'cenário 7');
});
