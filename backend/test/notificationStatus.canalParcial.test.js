// Prova de WR2-04 — um resultado parcial CORROMPIDO apaga o resto da rodada.
//
// O canal `err.resultadosParciais` é uma propriedade improvisada num objeto de erro, e o
// consumidor do `catch` do bloco de envio de `runCheck` (`scheduler.js`) não valida o que
// recebe: ele faz `?? []` e chama `.some`. O `??` só protege contra `null`/`undefined` —
// um valor de OUTRO TIPO faz o `.some` lançar DENTRO do próprio `catch`, e uma exceção
// nascida ali não tem quem a segure: ela sobe para o `catch` externo de `runCheck`, aborta
// o `for` dos deals e deixa os negócios restantes da rodada SEM PROCESSAR.
//
// A origem plausível de um valor errado não é hipotética: módulos CommonJS rodam em
// SLOPPY MODE, então a anexação do produtor (`emailer.js`) sobre um erro CONGELADO
// (`Object.freeze`, ou um erro singleton de biblioteca) falha em SILÊNCIO — sem
// `TypeError`, sem log — e uma propriedade pré-existente com esse nome, de qualquer tipo,
// sobrevive intacta até o consumidor.
//
// Este arquivo SOMA-SE a `notificationStatus.test.js` (os 6 cenários de REL-05/Q1), a
// `notificationStatus.partialFailure.test.js` (WR-01/WR-04/WR2-01) e a
// `notificationStatus.registroResiliente.test.js` (WR2-02). Nenhum dos três é editado
// nesta rodada: eles são os oráculos que garantem que o endurecimento do canal não desfaz
// o 04-06, o 04-10, o 04-14 nem o 04-15. Como o `node --test` isola por ARQUIVO (cada um
// em processo próprio), o cenário novo mora aqui sem interferir nas variações de ambiente
// daqueles.
//
// A falha ao GRAVAR o desfecho do envio é assunto de `registroResiliente` (04-15), não
// deste arquivo: aqui a gravação funciona normalmente e nada dela é substituído por mock —
// é isso que isola o defeito no canal e mantém os dois consertos revertíveis de forma
// independente.
//
// Os cenários:
//   E (WR2-04)  o parcial chega com tipo errado, num erro congelado -> a rodada CONTINUA,
//               a linha do 1º deal vai para 'error' (nada confirmado) e o 2º é notificado
//   F (WR3-03)  o parcial é um ARRAY BEM FORMADO NO CONTÊINER e corrompido no ELEMENTO
//               ([null]) -> `Array.isArray` deixa passar e o `.some` lança de dentro do
//               próprio catch: mesmo desfecho de WR2-04, um nível mais fundo. A rodada
//               precisa CONTINUAR, com a linha do 1º deal em 'error'
//   G (SIMÉTRICO de F — a direção oposta)  o parcial mistura um elemento corrompido com um
//               sucesso GENUÍNO ([null, { success: true }]) -> endurecer a leitura não pode
//               custar a confirmação que realmente aconteceu: linha 'sent', dedup verdadeira
//               e r.notified === 2
//
// PC-13: nada aqui assere nem imprime o objeto de opções do transporte SMTP — ele carrega
// `auth.pass`.
//
// WR2-06: as referências abaixo são por ÂNCORA (nome de função e de caso), nunca por
// número de linha.

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

// Relógio fixo: mesmo instante de `notificationStatus.partialFailure.test.js`, para reusar
// a fixture sintética. now = 2026-06-01 -> cutoff = 2026-05-17 (staleDays 15). Congelar o
// Date também torna DETERMINÍSTICO o `sent_at` gravado — é disso que a asserção de
// alreadyNotifiedToday depende.
const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

const DONO = 'dono@exemplo.invalid';
const AUTOR = 'autor@exemplo.invalid';

// Fixture REUSADA (não recriada): o deal 101 é o "incluído base" do golden — passa por
// todos os filtros de getStaleDeals. Cada rodada serve CLONES dele com ids próprios,
// porque a dedup do próprio SUT acopla os casos entre si.
const dealsPage = require('./fixtures/synthetic/deals-page.json');
const MOLDE = dealsPage.find((d) => d.id === 101);

// DOIS deals por rodada — mesmo padrão de `notificationStatus.registroResiliente.test.js`,
// e é essa a diferença que faz o cenário existir. Com um deal só não há como distinguir
// "a rodada seguiu" de "a rodada acabou porque não havia mais nada a processar": o segundo
// deal é a testemunha de que o `for` não foi abortado. A ordem é preservada por
// getStaleDeals (que não reordena), então o primeiro id servido é o primeiro processado.
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

// ── Controle do envio ────────────────────────────────────────────
// Variáveis mutáveis de módulo lidas DENTRO do stub: o mock nunca é reinstalado no meio do
// arquivo (`node --test` isola por arquivo, não por `test()`).
// 'ok'                    — envio saudável, nenhum erro injetado
// 'canal-corrompido'      — cenário E: o parcial não é sequer um array
// 'canal-elemento-nulo'   — cenário F: o parcial é array, o elemento é `null`
// 'canal-elemento-misto'  — cenário G: array com elemento `null` E um sucesso genuíno
let modoEnvio = 'ok';

// Contadores que são a PRÉ-CONDIÇÃO do cenário: sem eles o caso poderia ficar verde por
// coincidência (lição de WR-05 — um teste que não prova o caminho que afirma medir).
let transportesCriados = 0;
let enviosConfirmados = 0;
let enviosConfirmadosDoPrimeiroDeal = 0;

// O erro do cenário, e CONGELAR é o ponto do caso — não um detalhe estético.
//
// Quando este erro atravessa `sendStaleNotification`, o produtor tenta anexar o resultado
// por destinatário nele. Em sloppy mode (todo módulo CommonJS deste backend), atribuir uma
// propriedade a um objeto congelado NÃO levanta TypeError: a atribuição simplesmente não
// acontece, sem erro e sem log. O valor de tipo errado que já mora na propriedade sobrevive
// intacto e é ele que chega ao consumidor do agendador — que hoje faz `?? []` (protege
// contra null/undefined, não contra tipo errado) e chama `.some`.
//
// O objeto é criado UMA vez e reusado, para que a asserção de pré-condição possa verificar,
// depois da rodada, que a anexação do produtor de fato não o alterou.
const ERRO_CONGELADO = Object.freeze(
  Object.assign(
    new Error('transporte SMTP indisponível ao recriar a conexão'),
    { resultadosParciais: 'isto não é um array' },
  ),
);

// WR3-03 — o mesmo molde do erro acima, com UMA diferença: a propriedade improvisada agora
// É um array. `Array.isArray` fica VERDADEIRO e a guarda do 04-16 deixa o valor passar
// inteiro para o `.some`, que desreferencia cada elemento. O contêiner está correto; o
// elemento, não. A premissa do cenário E (um erro congelado de biblioteca carregando uma
// propriedade homônima "de qualquer tipo") não dá nenhuma razão para supor que esse tipo
// seria preferencialmente string e não array.
const ERRO_CONGELADO_ELEMENTO_NULO = Object.freeze(
  Object.assign(
    new Error('transporte SMTP indisponível ao recriar a conexão (elemento nulo)'),
    { resultadosParciais: [null] },
  ),
);

// O SIMÉTRICO: um elemento corrompido AO LADO de uma confirmação genuína. É a entrada que
// separa "a leitura parou de lançar" de "a leitura parou de lançar sem perder nada" — uma
// validação que descartasse o array inteiro ao ver o `null` rebaixaria a linha para 'error',
// ela deixaria de deduplicar, e a rodada de amanhã reenviaria para quem já recebeu.
const ERRO_CONGELADO_ELEMENTO_MISTO = Object.freeze(
  Object.assign(
    new Error('transporte SMTP indisponível ao recriar a conexão (parcial misto)'),
    { resultadosParciais: [null, { success: true }] },
  ),
);

// O erro que cada modo injeta na recriação do transporte. A tabela existe para que os três
// cenários compartilhem exatamente o mesmo caminho de código do stub: o que muda entre eles
// é APENAS o valor que chega ao consumidor do canal parcial.
const ERRO_DO_MODO = {
  'canal-corrompido': ERRO_CONGELADO,
  'canal-elemento-nulo': ERRO_CONGELADO_ELEMENTO_NULO,
  'canal-elemento-misto': ERRO_CONGELADO_ELEMENTO_MISTO,
};

// Erro classificado como DE REDE por sendMailWithRetry (a mensagem contém 'timeout'). É o
// que faz o retry entrar no ramo que espera 3s e RECRIA o transporte, em vez de devolver
// { success:false } de imediato — e é dentro dessa recriação, ou seja DENTRO do `try` de
// sendStaleNotification, que o erro congelado precisa nascer para que a anexação chegue a
// ser tentada.
function erroDeRede() {
  return Object.assign(new Error('Connection timeout ao entregar a mensagem'), {
    code: 'ETIMEDOUT',
  });
}

// PC-13: o objeto de opções (que carrega auth.pass) não é capturado nem asserido.
mock.method(nodemailer, 'createTransport', () => {
  transportesCriados++;

  // A 2ª chamada é a recriação do transporte de dentro do catch do laço de retry — logo,
  // DENTRO do `try` de sendStaleNotification. A 1ª (fábrica inicial daquela função, que
  // fica FORA do try) e a 3ª (fábrica inicial do SEGUNDO deal) funcionam normalmente.
  if (ERRO_DO_MODO[modoEnvio] && transportesCriados === 2) {
    throw ERRO_DO_MODO[modoEnvio];
  }

  // O índice fica preso no fecho: é ele que distingue o transporte do PRIMEIRO deal (cujos
  // envios precisam falhar) do transporte do SEGUNDO (que precisa funcionar), sem depender
  // de inspecionar o objeto de opções.
  const indiceDoTransporte = transportesCriados;

  return {
    verify: async () => true,
    sendMail: async () => {
      if (ERRO_DO_MODO[modoEnvio] && indiceDoTransporte === 1) {
        throw erroDeRede();
      }
      enviosConfirmados++;
      if (indiceDoTransporte === 1) enviosConfirmadosDoPrimeiroDeal++;
      return {};
    },
  };
});

// require do db e do scheduler DEPOIS de DB_PATH e do stub de axios. A gravação do desfecho
// NÃO é substituída por mock aqui — ela funciona, e é isso que isola o defeito no canal.
const db = require('../src/db');
const { runCheck } = require('../src/scheduler');

// O default do projeto é 'false' (db.js). Ligado aqui para que dono e autor sejam
// destinatários distintos, como nos arquivos vizinhos.
db.setConfig('notify_author', 'true');

before(() => {
  // 'setTimeout' entra junto com 'Date' porque o caminho medido passa pela espera de 3s do
  // retry de sendMailWithRetry — é dentro daquele ramo que a recriação do transporte
  // acontece. `avancarRelogioAte` vence essa espera sem tempo real.
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
  enviosConfirmadosDoPrimeiroDeal = 0;
});

// Linhas do deal, da mais recente para a mais antiga. Usa getNotificationLogs — nenhuma
// consulta SQL ad-hoc. A ordenação é por `id` e não por `sent_at` porque o relógio está
// congelado: todas as linhas compartilham o mesmo `sent_at`.
function linhasDoDeal(dealId) {
  const { logs } = db.getNotificationLogs({ limit: 100 });
  return logs.filter((l) => l.deal_id === dealId).sort((a, b) => b.id - a.id);
}

// ── E (WR2-04) — o parcial chega corrompido, num erro congelado ──
test('E: um resultado parcial de tipo errado não pode abortar a rodada — a linha vai para "error" e o deal seguinte é notificado', async () => {
  const primeiro = 2203;
  const segundo = 2204;
  servirDeals(primeiro, segundo);
  modoEnvio = 'canal-corrompido';

  // Dirigido pelo relógio falso: a espera de 3s do retry fica entre a falha do envio do
  // dono e a recriação do transporte que lança o erro congelado.
  const r = await avancarRelogioAte(runCheck());

  // Pré-condições avaliadas ANTES da asserção central, porque valem tanto no estado
  // defeituoso quanto no corrigido — elas provam que o CAMINHO medido é o pretendido, e não
  // que o conserto existe.
  assert.ok(
    transportesCriados >= 2,
    'pré-condição: a exceção precisa ter vindo da recriação do transporte (dentro do try), não da fábrica inicial',
  );
  assert.equal(
    enviosConfirmadosDoPrimeiroDeal,
    0,
    'pré-condição: nenhum destinatário do primeiro deal confirmou — é por isso que o desfecho correto é "error"',
  );
  assert.equal(
    ERRO_CONGELADO.resultadosParciais,
    'isto não é um array',
    'pré-condição: a anexação do produtor falhou EM SILÊNCIO no erro congelado e o valor de tipo errado chegou intacto ao consumidor',
  );

  // A asserção central de WR2-04: `?? []` só protege contra null/undefined. Com um valor de
  // outro tipo o `.some` lança DENTRO do catch do bloco de envio e a exceção sobe para o
  // catch externo de runCheck. A guarda correta é uma validação de TIPO (Array.isArray),
  // que lê a corrupção do canal como "nada confirmado".
  assert.equal(
    r.error,
    undefined,
    'um parcial de tipo errado não pode abortar a rodada',
  );
  assert.equal(
    r.deals.length,
    2,
    'os deals seguintes da rodada precisam continuar sendo processados',
  );

  // Pré-condição forte, avaliada só DEPOIS das asserções centrais: no estado defeituoso a
  // rodada morre no primeiro deal e o terceiro transporte nunca é criado, então esta
  // contagem produziria um vermelho sobre o instrumento em vez de sobre o defeito.
  assert.equal(
    transportesCriados,
    3,
    'pré-condição: 1 fábrica inicial + 1 recriação que lança + 1 do segundo deal',
  );

  // O deal afetado: nada foi confirmado, então o desfecho fail-safe é 'error'. A linha
  // 'error' NÃO deduplica (alreadyNotifiedToday filtra status = 'sent'), então a rodada de
  // amanhã retenta — fail-safe, não silêncio. Este é o mesmo trade-off aprovado pelo usuário
  // no checkpoint C10 (04-15): nenhum destinatário recebe a mais por causa desta mudança,
  // porque hoje a mesma linha já ficaria 'pending', igualmente retentável.
  const linhasPrimeiro = linhasDoDeal(primeiro);
  assert.equal(linhasPrimeiro.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhasPrimeiro[0].status,
    'error',
    'nada foi confirmado: o desfecho fail-safe da linha é "error"',
  );
  assert.equal(
    db.alreadyNotifiedToday(primeiro),
    false,
    'a linha error não deduplica: a rodada de amanhã retenta',
  );

  // O deal seguinte: processado E notificado de verdade. É a diferença entre "a rodada não
  // estourou" e "a rodada continuou fazendo o seu trabalho".
  assert.equal(
    enviosConfirmados,
    2,
    'o segundo deal ENVIOU de verdade (dono e autor), não apenas gravou uma linha',
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

// ── F (WR3-03) — o parcial é array, e o ELEMENTO é que está corrompido ──
test('F: um elemento não-objeto dentro do parcial não pode abortar a rodada — o contêiner válido não basta', async () => {
  const primeiro = 2205;
  const segundo = 2206;
  servirDeals(primeiro, segundo);
  modoEnvio = 'canal-elemento-nulo';

  const r = await avancarRelogioAte(runCheck());

  // Pré-condições avaliadas ANTES da asserção central: elas valem tanto no estado defeituoso
  // quanto no corrigido e provam que o CAMINHO medido é o pretendido.
  assert.ok(
    transportesCriados >= 2,
    'pré-condição: a exceção precisa ter vindo da recriação do transporte (dentro do try), não da fábrica inicial',
  );
  assert.equal(
    enviosConfirmadosDoPrimeiroDeal,
    0,
    'pré-condição: nenhum destinatário do primeiro deal confirmou — é por isso que o desfecho correto é "error"',
  );
  assert.deepEqual(
    ERRO_CONGELADO_ELEMENTO_NULO.resultadosParciais,
    [null],
    'pré-condição: a anexação do produtor falhou EM SILÊNCIO no erro congelado e o array com o elemento nulo chegou intacto ao consumidor',
  );
  assert.equal(
    Array.isArray(ERRO_CONGELADO_ELEMENTO_NULO.resultadosParciais),
    true,
    'pré-condição: o CONTÊINER é válido — este cenário passa pela guarda do 04-16, ele não a contorna',
  );

  // A asserção central de WR3-03. `Array.isArray` valida o CONTÊINER e nada mais: um array
  // cujos elementos não sejam objetos passa pela guarda, e a desreferência de `r.success`
  // sobre `null` faz o `.some` lançar DENTRO do próprio catch do bloco de envio. Uma exceção
  // nascida ali não tem quem a segure: sobe para o catch externo de runCheck, aborta o `for`
  // e deixa os negócios restantes sem processar — o mesmo desfecho que WR2-04 existia para
  // impedir, pela mesma porta, um nível mais fundo. A guarda correta valida as DUAS camadas.
  assert.equal(
    r.error,
    undefined,
    'um elemento não-objeto no parcial não pode abortar a rodada',
  );
  assert.equal(
    r.deals.length,
    2,
    'os deals seguintes da rodada precisam continuar sendo processados',
  );

  // Pré-condição forte, depois das centrais: no estado defeituoso a rodada morre no primeiro
  // deal e o terceiro transporte nunca nasce, então esta contagem produziria um vermelho
  // sobre o instrumento em vez de sobre o defeito.
  assert.equal(
    transportesCriados,
    3,
    'pré-condição: 1 fábrica inicial + 1 recriação que lança + 1 do segundo deal',
  );

  // Nada foi confirmado (o único elemento do parcial não é uma confirmação), então o desfecho
  // fail-safe é 'error' — que não deduplica e é retentável amanhã.
  const linhasPrimeiro = linhasDoDeal(primeiro);
  assert.equal(linhasPrimeiro.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhasPrimeiro[0].status,
    'error',
    'nada foi confirmado: o desfecho fail-safe da linha é "error"',
  );
  assert.equal(
    db.alreadyNotifiedToday(primeiro),
    false,
    'a linha error não deduplica: a rodada de amanhã retenta',
  );

  const linhasSegundo = linhasDoDeal(segundo);
  assert.equal(linhasSegundo.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhasSegundo[0].status,
    'sent',
    'o deal seguinte foi notificado normalmente',
  );
  assert.equal(
    enviosConfirmados,
    2,
    'o segundo deal ENVIOU de verdade (dono e autor), não apenas gravou uma linha',
  );
  assert.equal(
    r.notified,
    1,
    'exatamente uma notificação confirmada na rodada — a do segundo deal',
  );
});

// ── G (SIMÉTRICO de F) — validar o elemento não pode custar uma confirmação real ──
//
// Por que este cenário é o simétrico EXIGIDO e não um extra: endurecer a leitura para que ela
// deixe de LANÇAR é só metade do conserto. A outra metade é não PERDER uma confirmação
// genuína por causa de um elemento corrompido ao lado dela. A forma mais natural de "resolver"
// F — desconfiar do array inteiro assim que um elemento não for objeto — produziria
// exatamente esse defeito: a linha do negócio seria rebaixada para 'error' apesar de um
// destinatário ter recebido o e-mail de verdade; 'error' NÃO deduplica; e a rodada de amanhã
// reenviaria para quem já recebeu — que é precisamente o desfecho que WR-01 (04-10) existe
// para impedir. F e G se apoiam em direções opostas e é o par que fecha WR3-03.
//
// O conteúdo do array é a ENTRADA SOB TESTE, não uma afirmação sobre a realidade do envio: no
// stub deste arquivo nenhum e-mail do primeiro deal chega a sair, e é a leitura do canal — e
// só ela — que decide o status gravado.
test('G: um elemento corrompido ao lado de um sucesso genuíno não pode custar a confirmação — o simétrico de F', async () => {
  const primeiro = 2207;
  const segundo = 2208;
  servirDeals(primeiro, segundo);
  modoEnvio = 'canal-elemento-misto';

  const r = await avancarRelogioAte(runCheck());

  assert.ok(
    transportesCriados >= 2,
    'pré-condição: a exceção precisa ter vindo da recriação do transporte (dentro do try), não da fábrica inicial',
  );
  assert.deepEqual(
    ERRO_CONGELADO_ELEMENTO_MISTO.resultadosParciais,
    [null, { success: true }],
    'pré-condição: o parcial chegou intacto ao consumidor, com o elemento corrompido ANTES do sucesso genuíno — é o primeiro que o `.some` avalia',
  );

  assert.equal(
    r.error,
    undefined,
    'um parcial misto não pode abortar a rodada',
  );
  assert.equal(
    r.deals.length,
    2,
    'os deals seguintes da rodada precisam continuar sendo processados',
  );
  assert.equal(
    transportesCriados,
    3,
    'pré-condição: 1 fábrica inicial + 1 recriação que lança + 1 do segundo deal',
  );

  // O coração do simétrico: houve envio confirmado no parcial, então a linha é 'sent' e a
  // dedup passa a proteger quem recebeu.
  const linhasPrimeiro = linhasDoDeal(primeiro);
  assert.equal(linhasPrimeiro.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhasPrimeiro[0].status,
    'sent',
    'o sucesso genuíno do parcial precisa sobreviver ao elemento corrompido — rebaixar para "error" reabriria a duplicata que WR-01 fechou',
  );
  assert.equal(
    db.alreadyNotifiedToday(primeiro),
    true,
    'a linha sent deduplica: a rodada de amanhã NÃO reenvia para quem já recebeu',
  );

  // A assimetria intencional pinada desde o 04-14: `results.notified` conta envio real (e o
  // parcial confirmado é envio real), enquanto `dealResult.notified` responde outra pergunta
  // — "todos os destinatários confirmaram?" —, e no sucesso parcial a resposta é não.
  assert.equal(
    r.notified,
    2,
    'duas notificações confirmadas: o primeiro pelo parcial e o segundo pelo envio real',
  );
  assert.equal(
    r.deals[0].notified,
    false,
    'no sucesso parcial dealResult.notified permanece false — nem todos os destinatários confirmaram',
  );

  const linhasSegundo = linhasDoDeal(segundo);
  assert.equal(linhasSegundo.length, 1, 'uma notificação, uma linha');
  assert.equal(
    linhasSegundo[0].status,
    'sent',
    'o deal seguinte foi notificado normalmente',
  );
  assert.equal(
    enviosConfirmados,
    2,
    'o segundo deal ENVIOU de verdade (dono e autor) — nenhum envio do primeiro chegou a sair',
  );
});
