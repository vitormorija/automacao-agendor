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
//   F  PRÉVIA x ENVIO, por categoria indecidível         -> a prévia promete exatamente quem recebe
//   G  SIMÉTRICO DE FILTRO: PRÉVIA x ENVIO, por FUNIL    -> idem, pelo outro filtro
//   H  RENOMEAÇÃO: o funil vira 'Beefor Comercial'       -> suprime no envio E na prévia
//   I  FORMA DO PAYLOAD: os DOIS sem funil               -> os dois recebem, e a rodada AVISA
//   J  SIMÉTRICO DE CAUSA: funil presente e não-Beefor   -> os dois recebem, e a rodada CALA
//   K  rodada CONCLUÍDA com negócios pulados             -> não é uma recusa do lock
//   L  RODADA MISTA: apagão + um negócio DEDUPLICADO     -> ninguém recebe, e a rodada AVISA
//   M  SIMÉTRICO: deduplicado ao lado de um notificável   -> o outro recebe, e a rodada CALA
//
// Por que L e M existem (WR5-01). O contador que o alarme de categoria comparava com o
// denominador incrementava DENTRO da guarda de categoria, que é a SEGUNDA do laço de runCheck: a
// guarda de dedup do dia vem antes e faz `continue`, então todo negócio já notificado hoje
// subtraía do numerador sem subtrair do denominador `results.stale`, e a condição de supressão
// TOTAL ficava inalcançável. Nenhum caso desta suíte armava uma rodada com dedup — por isso o
// modo de falha atravessou quatro rodadas de review sem nenhum vermelho. L prova que o alarme
// sobrevive a um `continue` anterior: apagão total da borda de organizações com um dos negócios
// já notificado hoje continua sendo audível. M prova que ele continua discriminando a CAUSA e
// não a quantidade: o mesmo negócio deduplicado, ao lado de um notificável com sucesso e com a
// borda sã, mantém a rodada SILENCIOSA. Sem o M, um conserto que ligasse o alarme por quantidade
// (`notified === 0`, `skipped > 0`, ou sempre) passaria por L e o operador receberia um erro em
// todo dia em que alguém já tivesse sido notificado às 8h — o conserto teria trocado mudez por
// ruído diário, que é o desfecho que o par D/E já existe para impedir pela outra causa.
//
// Por que K existe (CR5-01). `runCheck` usava a chave `skipped` para duas coisas incompatíveis —
// o `{ skipped: true, reason }` do guard de concorrência e o CONTADOR `results.skipped` —, e o
// consumidor do disparo manual (`sendNow`, em frontend/src/components/Dashboard.jsx) ramificava
// por ela: bastava UM negócio pulado para a rodada concluída ser lida como recusa e o operador
// receber um erro sem texto no lugar do resumo. K é a metade NEGATIVA do par que fecha o achado
// — o positivo é o caso (6) de scheduler.resilience.test.js. Sem ele, um conserto que apenas
// trocasse o nome lido no consumidor deixaria o lock silencioso, ou alguém "padronizaria" a
// chave nova no literal de `results` e toda rodada passaria a ser lida como recusa. A armação é
// a do cenário E porque ela é a única da suíte que produz uma rodada CONCLUÍDA com
// `results.skipped > 0` e NENHUM alarme — exatamente o estado que o consumidor não conseguia
// distinguir de uma recusa.
//
// Por que H, I e J existem (in3-08). H fecha o MODO 2 — a comparação de funil era por
// igualdade EXATA, então bastava um administrador renomear o funil no CRM para a supressão
// deixar de casar e o responsável voltar a receber cobrança de um negócio que a regra de negócio
// manda suprimir. H mede isso pelos DOIS consumidores do scheduler ao mesmo tempo: o envio
// (`runCheck`) e a prévia (`runCheckOnly`), com a mesma igualdade de conjuntos de F e G.
// I e J são o par ALARME/SILÊNCIO do MODO 1, com exatamente o mesmo papel que D e E têm para o
// alarme de categoria: I prova que uma mudança de FORMA do payload da Agendor — negócios sem a
// estrutura de funil — deixa de ser invisível; J prova que o sinal discrimina a CAUSA e não a
// quantidade, porque uma rodada com funil presente e não-Beefor continua silenciosa. Sem o J,
// uma implementação que ligasse o alarme sempre, ou por `notified === 0`, passaria por I.
// A direção da falha do MODO 1 NÃO muda e é medida em I: funil ausente CONTINUA notificando
// (fail-open deliberado). O que a decisão do usuário acrescentou foi observabilidade.
//
// Por que F e G existem (WR4-06). Até eles, este arquivo media apenas o ENVIO — `runCheck`. A
// PRÉVIA (`runCheckOnly`, a rota que o painel chama antes de disparar) não tinha NENHUM caso em
// toda a suíte, e aplicava só o filtro de tarefas futuras enquanto o envio aplicava quatro guardas.
// O oráculo de F e G não é o valor de um campo isolado: é a IGUALDADE entre o conjunto de negócios
// que a prévia promete notificar e o conjunto que o envio de fato notificou, medidos na MESMA
// armação. A igualdade é o oráculo certo porque os predicados vivem em DOIS lugares — a alternativa
// (extrair um predicado compartilhado dos dois) seria refatoração estrutural da cadeia de guardas
// de `runCheck`, no caminho do Core Value, e a constraint de processo do CLAUDE.md proíbe
// misturá-la a uma correção. Quem fizer os dois lugares divergirem deixa F e G vermelhos, em vez de
// deixar um comentário desatualizado.
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
//
// O terceiro parâmetro (o cenário G) escolhe QUAIS dos dois vão para o Beefor; omitido, os dois
// vão — a forma que o cenário E usa, byte a byte no efeito. G precisa de um negócio no Beefor AO
// LADO de um elegível, porque o que ele mede é a marcação por negócio, e uma rodada inteiramente
// suprimida não distingue "a prévia enxerga o funil" de "a prévia não promete nada".
function servirDealsDoFunilBeefor(idPrimeiro, idSegundo, idsNoBeefor = null) {
  servirDeals(idPrimeiro, idSegundo);
  const alvo = idsNoBeefor ?? new Set([idPrimeiro, idSegundo]);
  dealsServidos = dealsServidos.map((deal) =>
    alvo.has(deal.id)
      ? {
          ...deal,
          dealStage: { name: MOLDE.dealStage.name, funnel: { name: 'Beefor' } },
        }
      : deal,
  );
}

// Irmã de `servirDealsDoFunilBeefor` para os cenários H, I e J — ADITIVA: aquela fica intocada,
// porque é a armação de E e G e qualquer mudança lá mexeria em casos que este plano não toca.
//
// As duas diferenças em relação à irmã: o nome do funil vem por PARÂMETRO, e `nomeDoFunil === null`
// significa `dealStage` SEM a chave `funnel` — a forma que um payload de forma mudada teria, e que é
// o que `getStaleDeals` traduz para `funnel: null` na lista enriquecida. Passar uma string vazia não
// serviria: o que se quer medir é a AUSÊNCIA da estrutura, não um nome vazio.
//
// O `name` da ETAPA continua vindo do molde, pelo mesmo motivo já escrito acima para a irmã:
// `isExcludedStage(deal.dealStage?.name)` roda ANTES em getStaleDeals, então uma etapa trocada por
// descuido excluiria o negócio ainda na borda e o caso mediria uma lista vazia.
//
// O quarto parâmetro escolhe QUAIS dos dois recebem o funil informado; omitido, os dois recebem —
// a forma que I e J usam. H precisa de apenas um deles renomeado, ao lado de uma testemunha
// elegível, porque o que ele mede é a marcação POR NEGÓCIO: uma rodada inteiramente suprimida não
// distingue "a prévia enxerga o funil renomeado" de "a prévia não promete nada".
function servirDealsComFunil(
  idPrimeiro,
  idSegundo,
  nomeDoFunil,
  idsAlvo = null,
) {
  servirDeals(idPrimeiro, idSegundo);
  const alvo = idsAlvo ?? new Set([idPrimeiro, idSegundo]);
  const etapa =
    nomeDoFunil === null
      ? { name: MOLDE.dealStage.name }
      : { name: MOLDE.dealStage.name, funnel: { name: nomeDoFunil } };
  dealsServidos = dealsServidos.map((deal) =>
    alvo.has(deal.id) ? { ...deal, dealStage: etapa } : deal,
  );
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
const { runCheck, runCheckOnly } = require('../src/scheduler');

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

// Arma a DEDUP DO DIA para um negócio: grava uma linha 'sent' no notification_log real, no molde
// do caso `alreadyNotifiedToday: deal notificado hoje (status "sent") -> true` de db.dedup.test.js.
//
// Por que esta armação não existia (WR5-01): nenhum caso desta suíte exercitava uma rodada com
// dedup, e é exatamente o `continue` da guarda de dedup — a PRIMEIRA do laço de runCheck — que
// desarmava o alarme de supressão total. O modo de falha não precisa de dado faltando no CRM:
// basta o operador disparar o envio manual depois do cron das 8h.
//
// O relógio do beforeEach está fixo em FIXED_NOW e `Date` está mockado, então o `sent_at` que
// logNotification grava cai no MESMO dia que alreadyNotifiedToday consulta — a armação e o SUT
// concordam sobre que dia é hoje sem nenhum acordo implícito.
function marcarComoNotificadoHoje(dealId) {
  db.logNotification({
    deal_id: dealId,
    deal_title: `Negócio sintético ${dealId}`,
    owner_name: 'Ana Vendas',
    owner_email: DONO_1,
    admin_email: AUTOR_1,
    days_stale: 20,
    status: 'sent',
  });
}

// ── O oráculo dos cenários F e G: prévia x envio ──────────────────────────────
//
// A comparação é feita sobre o EFEITO IRREVERSÍVEL registrado no banco — a linha com status
// 'sent' no notification_log —, e NÃO sobre `r.notified`, que é um contador: ele diz QUANTOS
// negócios foram notificados e nunca QUAIS. Dois conjuntos de mesmo tamanho e conteúdo trocado
// passariam por um contador sem produzir vermelho nenhum, e é exatamente essa divergência que
// estes dois cenários existem para pegar.
function idsPrometidosPelaPrevia(previa) {
  return previa
    .filter((item) => item.seraNotificado)
    .map((item) => item.id)
    .sort((a, b) => a - b);
}

function idsNotificadosDeFato(resultado) {
  return resultado.deals
    .map((item) => item.id)
    .filter((id) => linhasDoDeal(id).some((linha) => linha.status === 'sent'))
    .sort((a, b) => a - b);
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

// ── F — a PRÉVIA concorda com o ENVIO: categoria indecidível ──────────────────
//
// A permanência dos DOIS negócios na prévia é a metade "permanece no painel" da decisão do
// usuário: a prévia MARCA quem não vai receber, ela não REMOVE. Remover mudaria o significado de
// `total`, que é o número de negócios PARADOS escrito no card do painel — outra pergunta.
//
// E a igualdade dos conjuntos é o guarda-corpo da duplicação: os predicados de elegibilidade
// existem em dois lugares (a cadeia de guardas de `runCheck` e a marcação de `runCheckOnly`), e
// nenhum comentário impede que eles divirjam numa mudança futura. Este caso impede — pelo vermelho.
test('F: a prévia concorda com o envio — o negócio de categoria indecidível vem marcado como não-notificável e PERMANECE na lista', async () => {
  const primeiro = 2351;
  const segundo = 2352;
  servirDeals(primeiro, segundo);
  orgsQueFalham = new Set([organizacaoDe(primeiro)]);

  // A PRÉVIA vem primeiro, e a ordem é obrigatória: `runCheckOnly` é somente leitura e `runCheck`
  // grava no notification_log. Invertida, a linha 'sent' do envio mudaria a resposta da dedup
  // dentro da prévia, e o oráculo passaria a medir o rastro do próprio teste.
  const previa = await avancarRelogioAte(runCheckOnly());

  assert.equal(
    consultasPorOrg[organizacaoDe(primeiro)],
    3,
    'pré-condição: a consulta de categoria da PRÉVIA esgotou as 3 tentativas do retry',
  );
  assert.equal(
    previa.length,
    2,
    'a prévia MARCA e não REMOVE: o negócio indecidível continua na lista',
  );

  const previstoPrimeiro = previa.find((d) => d.id === primeiro);
  const previstoSegundo = previa.find((d) => d.id === segundo);
  assert.notEqual(previstoPrimeiro, undefined);
  assert.notEqual(previstoSegundo, undefined);
  assert.equal(
    previstoPrimeiro.seraNotificado,
    false,
    'o negócio de categoria indecidível não pode ser prometido ao operador como destinatário',
  );
  assert.equal(
    previstoSegundo.seraNotificado,
    true,
    'e o elegível continua prometido — a marcação não pode ser larga demais',
  );

  // Guarda de NÃO-VACUIDADE: sem ela, dois conjuntos vazios satisfariam a igualdade abaixo e o
  // caso ficaria verde numa implementação que não prometesse ninguém.
  const prometidos = idsPrometidosPelaPrevia(previa);
  assert.deepEqual(
    prometidos,
    [segundo],
    'a prévia promete exatamente o negócio elegível — e promete alguém',
  );

  const r = await avancarRelogioAte(runCheck());

  assert.deepEqual(
    idsNotificadosDeFato(r),
    prometidos,
    'o conjunto NOTIFICADO pelo envio precisa ser IGUAL ao conjunto PROMETIDO pela prévia',
  );
});

// ── G — SIMÉTRICO por OUTRO FILTRO: prévia x envio, pelo funil ────────────────
//
// Este é o par que fecha o achado, e o SIMÉTRICO aqui é de FILTRO, não de posição. O cenário F
// prova que a prévia passou a enxergar o filtro do achado (categoria indecidível, introduzido no
// 04-20); o G prova que ela enxerga também um filtro que já existia ANTES dele — o funil sem
// notificação ao responsável. Sem o G, um conserto que tratasse exclusivamente
// `categoriaIndecidivel` ficaria verde e a prévia continuaria mentindo pelo funil, com o botão do
// painel escrevendo um número maior do que o envio entrega.
test('G: SIMÉTRICO por outro filtro — o negócio do funil Beefor também vem marcado como não-notificável, e a prévia continua concordando com o envio', async () => {
  const primeiro = 2361;
  const segundo = 2362;
  // Só o PRIMEIRO vai para o Beefor; o segundo mantém o funil do molde e é a testemunha elegível.
  servirDealsDoFunilBeefor(primeiro, segundo, new Set([primeiro]));
  // `orgsQueFalham` VAZIA: nenhuma categoria é indecidível aqui, e é essa diferença de CAUSA que
  // torna o caso simétrico ao F em vez de uma segunda cópia dele.

  const previa = await avancarRelogioAte(runCheckOnly());

  assert.equal(
    previa.length,
    2,
    'a prévia MARCA e não REMOVE também quando o filtro é o funil',
  );

  const previstoPrimeiro = previa.find((d) => d.id === primeiro);
  const previstoSegundo = previa.find((d) => d.id === segundo);
  assert.notEqual(previstoPrimeiro, undefined);
  assert.notEqual(previstoSegundo, undefined);
  assert.equal(
    previstoPrimeiro.funnel,
    'Beefor',
    'pré-condição: o negócio chegou à prévia com o funil que o exclui do envio',
  );
  assert.equal(
    previstoPrimeiro.seraNotificado,
    false,
    'o negócio do funil que não notifica o responsável não pode ser prometido como destinatário',
  );
  assert.equal(
    previstoSegundo.seraNotificado,
    true,
    'e o elegível continua prometido',
  );

  const prometidos = idsPrometidosPelaPrevia(previa);
  assert.deepEqual(
    prometidos,
    [segundo],
    'guarda de não-vacuidade: a prévia promete exatamente o negócio elegível',
  );

  const r = await avancarRelogioAte(runCheck());

  assert.deepEqual(
    idsNotificadosDeFato(r),
    prometidos,
    'a igualdade entre prometido e notificado vale para o filtro de funil tanto quanto para o de categoria',
  );
});

// ── H — RENOMEAÇÃO: 'Beefor Comercial' suprime no ENVIO e na PRÉVIA ───────────
//
// O modo de falha que este cenário fecha não depende de erro nenhum: a comparação de funil era por
// igualdade EXATA, então bastava alguém renomear o funil dentro do Agendor — 'Beefor' vira
// 'Beefor Comercial' — para a supressão deixar de casar e o responsável voltar a ser cobrado por um
// negócio que a regra de negócio diz não ser dele. O cenário G mede o nome EXATO; este mede o
// renomeado, e os dois juntos são o que impede a correção de ser desfeita por engano.
//
// Os dois consumidores do scheduler entram no mesmo caso, porque chamam a MESMA função exportada:
// a prévia (rótulo do botão de disparo) e o envio, com a igualdade de conjuntos herdada de F e G.
test('H: RENOMEAÇÃO — o funil "Beefor Comercial" suprime a notificação no envio e na prévia', async () => {
  const primeiro = 2371;
  const segundo = 2372;
  // Só o PRIMEIRO é renomeado; o segundo mantém o funil do molde ('Comercial') e é a testemunha
  // elegível — sem ela o caso não distinguiria "a supressão nova funciona" de "ficou larga demais".
  servirDealsComFunil(
    primeiro,
    segundo,
    'Beefor Comercial',
    new Set([primeiro]),
  );
  // `orgsQueFalham` VAZIA: nenhuma categoria é indecidível aqui, e é essa diferença de CAUSA que
  // mantém o cenário medindo o funil e não outra coisa.

  // A PRÉVIA vem primeiro, e a ordem é obrigatória (a mesma razão de F e G): `runCheckOnly` é
  // somente leitura e `runCheck` grava no notification_log. Invertida, a linha 'sent' mudaria a
  // resposta da dedup DENTRO da prévia e o oráculo mediria o rastro do próprio teste.
  const previa = await avancarRelogioAte(runCheckOnly());

  const previstoPrimeiro = previa.find((d) => d.id === primeiro);
  const previstoSegundo = previa.find((d) => d.id === segundo);
  assert.notEqual(previstoPrimeiro, undefined);
  assert.notEqual(previstoSegundo, undefined);

  // (a) pré-condição: o negócio chegou com o funil RENOMEADO, e não com o nome exato do cenário G.
  assert.equal(
    previstoPrimeiro.funnel,
    'Beefor Comercial',
    'pré-condição: o negócio chegou à prévia com o funil RENOMEADO no CRM',
  );

  // (b) é aqui que o achado fica vermelho enquanto a comparação for por igualdade exata.
  assert.equal(
    previstoPrimeiro.seraNotificado,
    false,
    'um funil renomeado que contém o termo continua suprimindo a notificação ao responsável',
  );

  // (c) a supressão nova não é larga demais.
  assert.equal(
    previstoSegundo.seraNotificado,
    true,
    'o negócio do funil "Comercial" continua prometido — a substring não pode suprimir o inocente',
  );

  // (d) guarda de NÃO-VACUIDADE: sem ela, dois conjuntos vazios satisfariam a igualdade abaixo.
  const prometidos = idsPrometidosPelaPrevia(previa);
  assert.deepEqual(
    prometidos,
    [segundo],
    'a prévia promete exatamente o negócio elegível — e promete alguém',
  );

  const r = await avancarRelogioAte(runCheck());

  // (e) a igualdade prévia-x-envio, herdada de F e G.
  assert.deepEqual(
    idsNotificadosDeFato(r),
    prometidos,
    'o conjunto NOTIFICADO pelo envio precisa ser IGUAL ao conjunto PROMETIDO pela prévia',
  );

  // (f) o efeito irreversível, medido por destinatário.
  assert.equal(envios(DONO_1), 0, 'o dono do negócio renomeado não recebe');
  assert.equal(envios(AUTOR_1), 0, 'o autor do negócio renomeado não recebe');
  assert.equal(envios(DONO_2) >= 1, true, 'o dono do negócio elegível recebe');
  assert.equal(
    envios(AUTOR_2) >= 1,
    true,
    'o autor do negócio elegível recebe',
  );

  // (g) funil RENOMEADO é funil PRESENTE. Um conserto que tratasse rename como ausência de funil
  // ficaria vermelho aqui — e trocaria a supressão exigida por uma notificação indevida.
  assert.equal(
    r.funilNaoAvaliado,
    0,
    'nenhum negócio ficou sem funil: a regra pôde ser avaliada nos dois',
  );
});

// ── I — FORMA DO PAYLOAD: funil ausente continua notificando, e a rodada AVISA ─
//
// A direção da falha NÃO muda aqui, e essa é a metade mais importante do caso: negócio sem a
// estrutura de funil CONTINUA sendo notificado (fail-open deliberado). A razão medida está escrita
// no oráculo unitário `agendor.funnel.test.js`: 15 de 15 negócios das fixtures do repositório trazem
// a estrutura, então funil ausente é caminho de EXCEÇÃO. Um fail-safe uniforme faria "não sei o
// funil" virar o estado padrão de qualquer payload que mudasse de forma, reintroduzindo a supressão
// em massa invisível que o cenário D acabou de tornar audível.
//
// O que MUDA é a observabilidade — e a ordem das asserções abaixo é instrumento, não estilo: TODAS
// as de COMPORTAMENTO (símbolos que já existiam) vêm antes de TODAS as de INSTRUMENTO (símbolos
// introduzidos junto com o sinal). Assim o vermelho distingue "o fail-open regrediu" de "o
// instrumento ainda não existe".
test('I: FORMA DO PAYLOAD — os dois negócios sem funil continuam notificados, e a rodada registra que a regra não pôde ser avaliada', async () => {
  const primeiro = 2381;
  const segundo = 2382;
  // Os DOIS sem a chave `funnel`: é a rodada inteira que perde a estrutura, que é o desfecho de uma
  // mudança de forma do payload da borda.
  servirDealsComFunil(primeiro, segundo, null);

  const previa = await avancarRelogioAte(runCheckOnly());
  const r = await avancarRelogioAte(runCheck());

  const previstoPrimeiro = previa.find((d) => d.id === primeiro);
  const previstoSegundo = previa.find((d) => d.id === segundo);
  assert.notEqual(previstoPrimeiro, undefined);
  assert.notEqual(previstoSegundo, undefined);

  // ── COMPORTAMENTO — símbolos que já existem; estas asserções NÃO podem ficar vermelhas ──
  // (a) pré-condição: os dois entraram na rodada (a etapa do molde foi preservada).
  assert.equal(r.stale, 2, 'pré-condição: os dois negócios entraram na rodada');

  // (b) O FAIL-OPEN É A ASSERÇÃO QUE NÃO PODE MUDAR.
  assert.equal(
    r.notified,
    2,
    'funil ausente CONTINUA notificando — fail-open deliberado, não descuido',
  );
  assert.equal(envios(DONO_1) >= 1, true);
  assert.equal(envios(AUTOR_1) >= 1, true);
  assert.equal(envios(DONO_2) >= 1, true);
  assert.equal(envios(AUTOR_2) >= 1, true);

  // (c) e a prévia não promete MENOS do que o envio entrega.
  assert.equal(previstoPrimeiro.seraNotificado, true);
  assert.equal(previstoSegundo.seraNotificado, true);

  // ── INSTRUMENTO — símbolos do sinal novo; é aqui que o RED precisa parar ──
  // (d) o contador da rodada.
  assert.equal(
    r.funilNaoAvaliado,
    2,
    'a rodada conta quantos negócios ficaram sem a regra de funil avaliada',
  );

  // (e) o campo por negócio atravessa o spread `{ ...deal }` de runCheckOnly — VERIFICADO por
  // medição, não presumido pela leitura do código.
  assert.equal(
    previstoPrimeiro.funilAusente,
    true,
    'o campo derivado na borda chega à prévia sem ninguém precisar reimplementar o critério',
  );

  // (f) a mudança de forma deixou de ser invisível, nas duas superfícies do resultado.
  assert.equal(
    r.errors.length,
    1,
    'UM alarme por rodada no array que a UI renderiza — não um por negócio',
  );
  assert.equal(typeof r.error, 'string');
  assert.equal(
    r.error.includes('funil'),
    true,
    'a mensagem precisa nomear a causa: quem lê o campo de erro tem de saber que é o funil',
  );
});

// ── J — SIMÉTRICO DE CAUSA: funil presente e não-Beefor não dispara nada ──────
//
// Construção IDÊNTICA à de I, mudando EXCLUSIVAMENTE o nome do funil — é essa igualdade que faz o
// par medir a CAUSA e não outra coisa. Sem o J, qualquer implementação que ligasse o alarme em
// `notified === 0`, em `skipped === stale` ou simplesmente sempre passaria por I, e o operador
// receberia um erro por rodada. Um alarme que dispara sem causa é um alarme que se aprende a
// ignorar — e aí a mudança de forma real volta a passar despercebida.
test('J: SIMÉTRICO DE CAUSA — com funil presente e não-Beefor a rodada notifica os dois e CALA', async () => {
  const primeiro = 2391;
  const segundo = 2392;
  servirDealsComFunil(primeiro, segundo, 'Comercial');

  const r = await avancarRelogioAte(runCheck());

  // (a) o comportamento é o mesmo de I — o que muda é só o sinal.
  assert.equal(r.stale, 2, 'pré-condição: os dois negócios entraram na rodada');
  assert.equal(r.notified, 2, 'os dois negócios elegíveis foram notificados');
  assert.equal(envios(DONO_1) >= 1, true);
  assert.equal(envios(AUTOR_1) >= 1, true);
  assert.equal(envios(DONO_2) >= 1, true);
  assert.equal(envios(AUTOR_2) >= 1, true);

  // (b) o contador discrimina a CAUSA: funil presente não é funil não avaliado.
  assert.equal(
    r.funilNaoAvaliado,
    0,
    'nenhum negócio ficou sem a regra de funil avaliada numa rodada de forma íntegra',
  );

  // (c) e (d) as DUAS superfícies do resultado continuam limpas.
  assert.equal(
    r.error,
    undefined,
    'uma rodada de forma íntegra não preenche o campo de erro',
  );
  assert.equal(
    r.errors.length,
    0,
    'nem entra no array de erros que a UI renderiza — o alarme não é ruído diário',
  );
});

// ── K — a rodada que CONCLUIU não pode ser lida como RECUSA ───────────────────
//
// A metade NEGATIVA do par de CR5-01; a positiva é o caso (6) de
// scheduler.resilience.test.js, onde a chamada recusada pelo lock traz `execucaoIgnorada` e o
// motivo escrito. Aqui a rodada CONCLUI e pula os dois negócios, e o que se assere é a AUSÊNCIA
// das duas chaves da recusa.
//
// A armação é a do cenário E, com ids NOVOS: a dedup do próprio SUT (alreadyNotifiedToday)
// acopla casos que compartilham id, então id reusado é caso contaminado. A escolha de E não é
// acaso — é a única armação da suíte que produz uma rodada concluída com `results.skipped > 0`
// e NENHUM alarme, que é exatamente o estado que o consumidor do disparo manual não conseguia
// distinguir de uma recusa do lock.
//
// A asserção (d) nasce VERDE, e isso é esperado: enquanto `execucaoIgnorada` não existir em
// lugar nenhum ela é `undefined` por ausência. O valor deste caso não está no vermelho — está em
// impedir que o conserto marque toda rodada como ignorada, ou que a chave nova seja
// "padronizada" dentro do literal de `results`. É o guarda-corpo do par.
//
// A ordem é deliberada: primeiro a pré-condição do gatilho, depois a prova de que a rodada
// concluiu, e só então as chaves da recusa. Assim o vermelho distingue "a armação parou de
// produzir supressão" de "a chave da recusa vazou para uma rodada concluída".
test('K: a rodada que CONCLUIU com negócios pulados NÃO é uma recusa do lock', async () => {
  const primeiro = 2401;
  const segundo = 2402;
  servirDealsDoFunilBeefor(primeiro, segundo);
  // `orgsQueFalham` VAZIA: as categorias são consultadas com sucesso, exatamente como no E. A
  // supressão aqui é do funil, e é ela que produz o `skipped > 0` sem alarme.

  const r = await avancarRelogioAte(runCheck());

  // (a) o GATILHO do defeito: a rodada tem negócios pulados.
  assert.equal(
    r.skipped,
    2,
    'pré-condição: `results.skipped` é o CONTADOR, e nesta rodada ele é maior que zero',
  );

  // (b) e mesmo assim ela CONCLUIU — uma recusa nunca chega a executar.
  assert.equal(r.notified, 0, 'nenhuma notificação saiu nesta rodada');
  assert.equal(
    typeof r.ranAt,
    'string',
    'ranAt só é gravado quando a rodada completa: esta completou',
  );

  // (c) sem alarme agregado — rodada sã, e o toast de alarme do consumidor não dispara aqui.
  assert.equal(
    r.errors.length,
    0,
    'nenhum alarme agregado: o array que a UI renderiza continua vazio numa rodada sã',
  );

  // (d) A METADE NEGATIVA DO PAR: por mais negócios pulados que tenha, uma rodada concluída não
  // pode carregar a chave da recusa.
  assert.equal(
    r.execucaoIgnorada,
    undefined,
    'uma rodada que CONCLUIU não pode ser lida como recusa do lock, por maior que seja o contador de pulados',
  );

  // (e) e o motivo da recusa também não vaza para uma rodada concluída.
  assert.equal(
    r.reason,
    undefined,
    '`reason` é o motivo da RECUSA: numa rodada concluída ele não existe',
  );
});

// ── L — RODADA MISTA por DEDUP: o apagão volta a ser audível ──────────────────
//
// O cenário D mede o apagão PURO: os dois negócios chegam à guarda de categoria e o alarme
// dispara. Aqui a borda está igualmente fora, mas um dos negócios já foi notificado hoje e é
// interceptado ANTES, pela guarda de dedup — que faz `continue`. Era esse `continue` que
// desarmava o alarme: o contador da guarda de categoria via UM, o denominador continuava valendo
// DOIS, e a rodada ficava indistinguível de um dia calmo. Zero e-mails, campo de erro vazio,
// array de erros vazio — literalmente o enunciado de CR4-01, por um caminho que nenhum plano
// nomeou.
//
// A ordem das asserções é instrumento, não estilo: a pré-condição da armação vem primeiro, depois
// TODAS as de COMPORTAMENTO (símbolos que já existiam), e só então as de INSTRUMENTO. Assim o
// vermelho distingue "a armação de dedup não produziu a linha" de "o comportamento por negócio
// regrediu" de "o alarme continua calado".
test('L: RODADA MISTA — apagão da borda com um negócio já notificado hoje continua disparando o alarme de supressão total', async () => {
  const primeiro = 2411;
  const segundo = 2412;
  servirDeals(primeiro, segundo);
  // Apagão TOTAL, como em D: as organizações dos DOIS negócios respondem 429 persistente.
  orgsQueFalham = new Set([organizacaoDe(primeiro), organizacaoDe(segundo)]);
  // E o primeiro já recebeu hoje — a rodada do cron das 8h, ou um disparo manual anterior.
  marcarComoNotificadoHoje(primeiro);

  // (a) pré-condição da ARMAÇÃO: sem ela, uma falha silenciosa da dedup faria o caso medir o
  // cenário D com outro nome.
  assert.equal(
    db.alreadyNotifiedToday(primeiro),
    true,
    'pré-condição: o primeiro negócio precisa constar como já notificado hoje',
  );

  const r = await avancarRelogioAte(runCheck());

  // ── COMPORTAMENTO — símbolos que já existem; estas asserções NÃO podem ficar vermelhas ──
  // (b) os dois negócios entraram na rodada: o denominador vale DOIS.
  assert.equal(r.stale, 2, 'pré-condição: os dois negócios entraram na rodada');

  // (c) e nenhum foi notificado.
  assert.equal(r.notified, 0, 'nenhuma notificação saiu nesta rodada');

  // (d) o efeito irreversível, por IGUALDADE EXATA e nunca por `>= 0`: zero e-mails é o fato que
  // este caso existe para medir, e uma forma frouxa não distinguiria zero de qualquer número.
  assert.equal(envios(DONO_1), 0, 'o dono do negócio deduplicado não recebe');
  assert.equal(envios(AUTOR_1), 0, 'o autor do negócio deduplicado não recebe');
  assert.equal(envios(DONO_2), 0, 'o dono do negócio indecidível não recebe');
  assert.equal(envios(AUTOR_2), 0, 'o autor do negócio indecidível não recebe');

  // (e) nenhuma linha NOVA no notification_log: a do primeiro é a da armação, e o segundo nem
  // chega ao bloco de envio (T-04-20-03).
  assert.equal(
    linhasDoDeal(primeiro).length,
    1,
    'só a linha da armação: a rodada não grava um segundo envio para quem já recebeu hoje',
  );
  assert.equal(
    linhasDoDeal(segundo).length,
    0,
    'nenhuma linha para o negócio que a guarda de categoria nem deixa chegar ao envio',
  );

  // (f) A MEDIÇÃO QUE TORNA O ACHADO CONFERÍVEL. Os dois contadores valem números DIFERENTES na
  // MESMA rodada: `skippedCategoriaIndecidivel` responde "quantos a GUARDA suprimiu" e vale UM,
  // porque o `continue` da dedup veio antes; o denominador continua valendo DOIS. É essa
  // diferença que o conserto precisa preservar — a contagem da guarda não é o numerador do
  // alarme, e nunca deveria ter sido.
  assert.equal(
    r.skipped,
    2,
    'os dois negócios foram pulados — um pela dedup, outro pela categoria',
  );
  assert.equal(
    r.skippedCategoriaIndecidivel,
    1,
    'a guarda de categoria vê UM: o outro foi interceptado antes, pela dedup do dia',
  );

  // ── INSTRUMENTO — é aqui que o RED precisa parar ──
  // (g) O ACHADO. Antes do conserto isto vale ZERO: o alarme fica calado num apagão total.
  assert.equal(
    r.errors.length,
    1,
    'UM alarme por rodada no array que a UI renderiza — um `continue` anterior não pode calá-lo',
  );

  // (h) o numerador novo, que percorre o MESMO conjunto do denominador.
  assert.equal(
    r.categoriaIndecidivelNaRodada,
    2,
    'o numerador do alarme conta os negócios marcados na borda, antes de qualquer guarda',
  );

  // (i) a superfície escalar que a decisão do usuário nomeia.
  assert.equal(
    typeof r.error === 'string' && r.error.length > 0,
    true,
    'a rodada totalmente suprimida preenche o campo de erro também na rodada MISTA',
  );

  // (j) A REDAÇÃO. Com o numerador no topo do laço a condição passa a valer numa rodada COMPOSTA,
  // em que um dos negócios contados JÁ HAVIA SIDO NOTIFICADO hoje — e ali a frase larga ("nenhum
  // negócio parado DO DIA foi notificado") é factualmente FALSA. Uma mitigação que mente em parte
  // dos casos treina o operador a ignorá-la, e o operador que conclui ter perdido envios redispara
  // e gera DUPLICATAS. É a mesma armadilha que o alarme de FORMA do funil evitou por redação; a
  // diferença é que aqui ela está pinada por asserção, para que a mensagem não seja "melhorada"
  // de volta.
  assert.equal(
    r.error.includes('desta rodada'),
    true,
    'a mensagem afirma sobre a RODADA — é só isso que o contador garante',
  );
  assert.equal(
    r.error.includes('do dia foi notificado'),
    false,
    'a redação larga é PROIBIDA: numa rodada composta ela mente sobre quem já recebeu às 8h',
  );
});

// ── M — SIMÉTRICO: deduplicado ao lado de um notificável, e a rodada CALA ─────
//
// Construção IDÊNTICA à de L, mudando EXCLUSIVAMENTE a saúde da borda de organizações — é essa
// igualdade que faz o par medir a CAUSA e não a quantidade. Sem este caso, um conserto que ligasse
// o alarme por quantidade (`notified === 0`, `skipped > 0`, ou sempre) passaria por L, e o
// operador receberia um erro em TODO dia em que alguém já tivesse sido notificado às 8h: o
// conserto teria trocado mudez por ruído diário.
test('M: SIMÉTRICO — um negócio deduplicado ao lado de um notificável com sucesso não dispara alarme nenhum', async () => {
  const primeiro = 2421;
  const segundo = 2422;
  servirDeals(primeiro, segundo);
  // `orgsQueFalham` VAZIA: a borda está sã. É a ÚNICA diferença em relação ao cenário L.
  marcarComoNotificadoHoje(primeiro);

  // (a) pré-condição da ARMAÇÃO, a mesma de L.
  assert.equal(
    db.alreadyNotifiedToday(primeiro),
    true,
    'pré-condição: o primeiro negócio precisa constar como já notificado hoje',
  );

  const r = await avancarRelogioAte(runCheck());

  // (b) o comportamento por negócio: um pulado pela dedup, um notificado.
  assert.equal(r.stale, 2, 'pré-condição: os dois negócios entraram na rodada');
  assert.equal(r.skipped, 1, 'só o deduplicado foi pulado');
  assert.equal(r.notified, 1, 'e o outro foi notificado de verdade');

  // (c) o negócio deduplicado NÃO recebe de novo — a proteção contra DUPLICATA, a outra metade do
  // Core Value.
  assert.equal(
    envios(DONO_1),
    0,
    'o dono do negócio já notificado hoje não recebe de novo',
  );
  assert.equal(
    envios(AUTOR_1),
    0,
    'o autor do negócio já notificado hoje não recebe de novo',
  );

  // (d) e o elegível recebe EXATAMENTE uma vez, por destinatário. A igualdade exata é deliberada:
  // a forma frouxa — comparar por maior-ou-igual a um em vez de por igualdade — detecta o envio a
  // MENOS e NÃO detecta o e-mail DUPLICADO, que é justamente o dano que a dedup existe para
  // impedir. É o afrouxamento que a rodada 5 encontrou nos cenários mais novos deste mesmo
  // arquivo (WR5-05, com dono no plano 04-38); os cenários novos não repetem essa forma. O
  // comentário evita reproduzir o operador literal, para que o gate que o proíbe no diff não
  // acuse a própria justificativa.
  assert.equal(envios(DONO_2), 1, 'o dono do negócio elegível recebe uma vez');
  assert.equal(
    envios(AUTOR_2),
    1,
    'o autor do negócio elegível recebe uma vez',
  );

  // (e) o numerador do alarme discrimina a CAUSA: borda sã, nenhum negócio indecidível.
  assert.equal(
    r.categoriaIndecidivelNaRodada,
    0,
    'nenhum negócio ficou com a categoria indecidível numa rodada de borda sã',
  );

  // (f) e (g) as DUAS superfícies do resultado continuam limpas.
  assert.equal(
    r.error,
    undefined,
    'uma rodada com dedup ao lado de um envio bem-sucedido não preenche o campo de erro',
  );
  assert.equal(
    r.errors.length,
    0,
    'nem entra no array de erros que a UI renderiza — o alarme não é ruído diário',
  );
});
