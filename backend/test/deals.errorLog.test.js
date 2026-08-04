// Sanitização do log de erro de GET /api/deals/stale (CR-02 do 04-REVIEW).
//
// Por que o SINK importa, e não só a mensagem: `routes/deals.js` tratava a falha com uma
// chamada crua de console passando o objeto de erro INTEIRO. `util.inspect` de um AxiosError
// imprime suas propriedades próprias enumeráveis — entre elas `config` — e
// `config.headers.Authorization` carrega o token de serviço da Agendor. Em produção esse
// stream vai para `/opt/agendor/logs/pm2-error.log` (`ecosystem.config.js:20`), **persistido
// em disco** e sobrevivente a restart. Ou seja: uma API Agendor lenta bastava para gravar a
// credencial em arquivo.
//
// Por que o caminho é ROTINEIRO e não hipotético: antes do 04-02 a falha de `/tasks` era
// engolida dentro de `agendor.js`; com o fail-safe de REL-06 ela propaga e o `staleHandler`
// responde 500 (pinado pelo caso B3 de `scheduler.failsafe.test.js`). O timeout de 15s do
// REL-01 (04-03) tornou esse 500 alcançável sempre que a Agendor demorar. A própria fase já
// havia reconhecido a ameaça do OUTRO lado, em `agendor.js:291-292` — este arquivo fecha a
// inconsistência.
//
// Método: o handler é executado DIRETO pelo seam `staleHandler`, com um `res` falso mínimo
// (molde de `scheduler.failsafe.test.js`), sem supertest, sem nock e sem porta. A prova é
// COMPORTAMENTAL: injeta-se um erro cujo header carrega um token SINTÉTICO, capturam-se TODOS
// os argumentos entregues ao logger e assere-se que a string sintética não aparece na
// serialização. Nenhum grep estático prova isso — greps olham a forma do código, este caso
// olha a saída real.
//
// Disciplina de segredo do próprio teste (PC-13): o valor sintético é literal e reconhecível,
// e o arquivo NUNCA lê a variável de ambiente do token real nem `backend/.env`. Isto é
// verificável por grep: nem o nome dessa variável aparece neste arquivo. Nenhuma mensagem de
// asserção ecoa o token ou o objeto serializado — uma falha aqui não pode virar um segundo
// vazamento, desta vez na saída do CI.

const { makeTmpDbPath } = require('./helpers/tmpDb');

// Arquivo temporário e DB_PATH fixados ANTES de qualquer require('../src/db'): db.js lê
// process.env.DB_PATH no load e abre a conexão ali.
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

// setup.js só define DB_PATH se ausente — como já definimos acima, o arquivo temp vence.
require('./setup');

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const util = require('node:util');
const { installFakeAxios } = require('./helpers/fakeAxios');

// ── Segredo sintético ────────────────────────────────────────────

// Valor deliberadamente NÃO parecido com credencial real: sem formato de UUID, em caixa alta e
// com a palavra SINTETICO no meio. Isso mantém verde tanto o `test/secrets.grep.test.js`
// quanto o job `secrets`/gitleaks do CI — um teste de vazamento que dispara o detector de
// segredos seria "consertado" removendo o teste, que é o pior desfecho possível.
const TOKEN_SINTETICO = 'AGENDOR-TOKEN-SINTETICO-DO-TESTE';

// Erro fiel ao que o axios produz num timeout de client contra a borda `/tasks`: sem
// `response` (timeout não traz resposta), com `code: 'ECONNABORTED'`, `isAxiosError` e o
// `config` que carrega o header de autorização. É esse `config` que o `console.error(err)`
// despejava no arquivo de log.
function erroDeTimeoutComHeader() {
  return Object.assign(new Error('timeout of 15000ms exceeded'), {
    code: 'ECONNABORTED',
    isAxiosError: true,
    config: {
      url: '/tasks',
      baseURL: 'https://api.agendor.com.br/v3',
      timeout: 15000,
      headers: { Authorization: `Token ${TOKEN_SINTETICO}` },
    },
  });
}

// ── Borda HTTP ───────────────────────────────────────────────────

// Uma única página de negócios (totalCount = 1) para que getStaleDeals não entre no laço de
// lotes com espera de 1s entre eles. `/tasks` é a única borda que falha: é ela que o
// fail-safe de REL-06 faz propagar até o catch da rota.
const DEAL = {
  id: 701,
  title: 'Negócio de exemplo',
  owner: { id: 9, name: 'Ana Vendas' },
  organization: { id: 55, name: 'Empresa Exemplo' },
  dealStage: { name: 'Proposta Enviada', funnel: { name: 'Funil Principal' } },
  dealStatus: { id: 1 },
  createdAt: '2026-02-01T10:00:00.000Z',
  updatedAt: '2026-05-01T10:00:00.000Z',
  _webUrl: 'https://web.agendor.com.br/sistema/negocios/historico.php?id=701',
};

installFakeAxios((url) => {
  if (url === '/tasks') return Promise.reject(erroDeTimeoutComHeader());
  if (url === '/deals')
    return { data: { data: [DEAL], meta: { totalCount: 1 } } };
  if (url === '/users')
    return {
      data: {
        data: [
          { id: 9, name: 'Ana Vendas', contact: { email: 'ana@exemplo.invalid' } },
        ],
      },
    };
  if (url.startsWith('/organizations/'))
    return { data: { data: { category: { name: 'Lead' } } } };
  return { data: { data: [] } };
});

// require do logger e da rota DEPOIS de DB_PATH e do stub de axios.
const logger = require('../src/logger');
const db = require('../src/db');
const dealsRouter = require('../src/routes/deals');
const { staleHandler } = dealsRouter;

// ── Espiões ──────────────────────────────────────────────────────

// A ORDEM importa: `logger.error` é substituído por um no-op ANTES de qualquer invocação, de
// modo que o logger nunca alcance o `console.error` real. Sem isso o contador de `console.error`
// registraria a emissão legítima do próprio logger e a asserção (2) perderia o sentido — ela
// afirma "nenhum objeto de erro foi despejado no console", não "nada foi logado".
const logErro = mock.method(logger, 'error', () => {});
const consoleErro = mock.method(console, 'error', () => {});

// `res` falso mínimo, no molde de scheduler.failsafe.test.js.
function resFalso() {
  return {
    statusCode: undefined,
    body: undefined,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(corpo) {
      this.body = corpo;
      return this;
    },
  };
}

let resposta;

before(async () => {
  // Zera imediatamente antes da invocação: a contagem precisa ser local a esta rodada, e não
  // acumular o que o carregamento dos módulos por acaso tenha emitido.
  logErro.mock.resetCalls();
  consoleErro.mock.resetCalls();

  resposta = resFalso();
  await staleHandler({ query: {} }, resposta);
});

after(() => {
  mock.restoreAll();
  db.closeDb();
  cleanup();
});

// ── Casos ────────────────────────────────────────────────────────

test('CR-02: a falha da borda Agendor não escreve o token em nenhum stream de log', () => {
  // (1) Pré-condição e shape. Sem isto o caso não prova que o caminho de erro foi alcançado —
  // um handler que respondesse 200 também não logaria o token, e o teste ficaria verde à toa.
  // O shape { error } (sem a chave `ok`) é o mesmo pinado pelo caso B3 de
  // scheduler.failsafe.test.js e não pode mudar.
  assert.equal(
    resposta.statusCode,
    500,
    'pré-condição: a falha de /tasks precisa ter alcançado o catch da rota',
  );
  assert.equal(
    typeof resposta.body.error,
    'string',
    'o catch de routes/deals.js devolve { error: err.message }',
  );
  assert.equal(
    Object.hasOwn(resposta.body, 'ok'),
    false,
    "o shape de erro do /stale não tem a chave 'ok'",
  );

  // (2) Nenhum objeto vai para o console. `console.error(err)` era o vazamento: é ele que o
  // PM2 redireciona para o arquivo. Com `logger.error` neutralizado acima, qualquer chamada
  // contada aqui só pode vir de um `console.error` direto no código de produção.
  assert.equal(
    consoleErro.mock.callCount(),
    0,
    'console.error foi chamado no tratamento do erro: o stream do PM2 grava esse objeto em disco',
  );

  // (3) O token não aparece no que foi entregue ao logger. Serializa TODOS os argumentos de
  // TODAS as chamadas com profundidade ilimitada — se alguém voltar a passar `err`,
  // `err.config` ou qualquer objeto que os contenha, a string sintética reaparece aqui.
  const argumentosLogados = logErro.mock.calls.map((c) => c.arguments);
  const serializado = util.inspect(argumentosLogados, { depth: null });

  // A mensagem NÃO ecoa o token nem o serializado: uma falha desta asserção não pode virar um
  // segundo vazamento, desta vez na saída do CI (mesma disciplina de PC-13 para auth.pass).
  assert.equal(
    serializado.includes(TOKEN_SINTETICO),
    false,
    'o log carregou o token da API Agendor — inspecione backend/src/routes/deals.js manualmente, sem imprimir a saída',
  );

  // (4) O log útil continua existindo. Sanitizar não pode virar silenciar: sem estas duas
  // asserções, apagar a linha de log inteira também deixaria o caso (3) verde.
  assert.ok(
    serializado.includes('[Deals]'),
    'a rota precisa continuar registrando a falha com a tag [Deals]',
  );
  assert.ok(
    serializado.includes('timeout of 15000ms exceeded'),
    'a mensagem do erro precisa sobreviver à sanitização — é o que torna a falha diagnosticável',
  );
});

test('o seam não quebra o contrato do router (app.use continua válido)', () => {
  // Props anexadas a module.exports = router são ignoradas pelo Express.
  assert.equal(typeof dealsRouter, 'function');
});
