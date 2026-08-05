// Prova de WR2-05 na borda SMTP: o transporte recriado dentro do retry precisa
// SOBREVIVER à chamada e servir o destinatário seguinte.
//
// O defeito: `sendMailWithRetry` faz `transporter = createTransporter()` dentro do
// próprio catch — isso reatribui o PARÂMETRO da função, não a variável do chamador.
// Em `sendStaleNotification` o transporte inicial nunca é substituído, então, se o
// envio ao dono só teve sucesso DEPOIS de recriar a conexão, o envio ao autor
// recomeça com a conexão que já se provou quebrada: paga outro ciclo completo de
// espera (3s + 6s) e tem chance maior de falhar. Com sessão SMTP morta esse é o caso
// comum, não o raro — se a primeira conexão morreu, é natural que a segunda tentativa
// de envio do mesmo lote também a encontre morta.
//
// Por que o segundo destinatário é o elo frágil: com a semântica de sucesso parcial
// vigente (≥ 1 confirmação mantém a linha do notification_log em 'sent'), quem NÃO
// recebeu simplesmente SOME — a dedup bloqueia o negócio pelo dia inteiro e o único
// vestígio é a coluna `error` de uma linha cujo status diz 'sent'. Reduzir a chance de
// o segundo destinatário falhar ataca diretamente a pior classe de falha do milestone:
// notificação perdida em silêncio.
//
// O que cada caso pina:
//   (1) uma rodada de dois destinatários com o primeiro transporte quebrado cria
//       DOIS transportes, não três — o autor reusa o que o retry do dono recriou;
//   (2) o retorno por destinatário NÃO muda de forma: `{to, success}` no sucesso e
//       `{to, success, error}` na falha. O transporte não pode vazar para `results`,
//       porque esse array viaja em `err.resultadosParciais` até o agendador e é
//       agregado na coluna `error` do notification_log;
//   (3) o caminho feliz continua com UMA conexão por rodada — a correção não pode
//       virar "um transporte por destinatário", encarecendo o caminho de todo dia.
//
// PC-13: o objeto de opções entregue à fábrica de transporte carrega a senha SMTP.
// Aqui ele NUNCA é capturado, asserido nem impresso — o stub sequer o recebe como
// parâmetro, e ramifica apenas pelo ÍNDICE do transporte e pelo destinatário da
// mensagem. As referências a código são por âncora (nome de função e de caso), nunca
// por número de linha (WR2-06).
require('./setup');

const { test, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { avancarRelogioAte } = require('./helpers/fakeTimers');

// DB_PATH fica no `:memory:` do setup — aqui não há segunda conexão para semear.
const { setConfig } = require('../src/db');
setConfig('smtp_host', 'smtp.exemplo.invalid');
setConfig('smtp_port', '587');
setConfig('smtp_user', 'usuario@exemplo.invalid');
setConfig('smtp_from', 'automacao@exemplo.invalid');

// ── Stub da borda SMTP, com IDENTIDADE por transporte ────────────
// Um único stub para o arquivo inteiro (`node --test` isola por arquivo, não por
// `test()`); os cenários variam o comportamento pelo handler mutável
// `modoTransporte`. Cada objeto criado recebe um índice sequencial preso no fecho —
// é ele que distingue "o transporte antigo" do "transporte novo" sem inspecionar
// nada do objeto de opções (PC-13).
let transportesCriados = 0;
let enviosPorTransporte = [];
let modoTransporte = async () => ({});

mock.method(nodemailer, 'createTransport', () => {
  transportesCriados++;
  const indice = transportesCriados;
  return {
    verify: async () => true,
    sendMail: async (mailOptions) => {
      enviosPorTransporte[indice] = (enviosPorTransporte[indice] ?? 0) + 1;
      return modoTransporte(indice, mailOptions);
    },
  };
});

const { sendStaleNotification } = require('../src/emailer');

// Negócio sintético mínimo com os campos que o template lê. Nenhum dado real: os
// domínios são `.invalid`, reservado por RFC 2606 e portanto nunca resolvível.
const NEGOCIO = {
  id: 7171,
  title: 'Negócio sintético do transporte vivo',
  ownerName: 'Fulana',
  authorName: 'Beltrano',
  organization: 'Organização Sintética',
  funnel: 'Funil Padrão',
  dealType: 'Negócio',
  daysSinceUpdate: 22,
  updatedAt: '2026-07-01T12:00:00.000Z',
  createdAt: '2026-05-01T12:00:00.000Z',
  webUrl: 'https://web.agendor.com.br/deal/7171',
};

const DONO = 'dono@exemplo.invalid';
const CRIADOR = 'criador@exemplo.invalid';

// Os três casos mandam para os MESMOS dois destinatários e variam só o `logId`, então
// os argumentos do SUT são escritos em um único lugar do arquivo.
function pedidoDeEnvio(logId) {
  return { deal: NEGOCIO, ownerEmail: DONO, authorEmail: CRIADOR, logId };
}

beforeEach(() => {
  transportesCriados = 0;
  enviosPorTransporte = [];
  modoTransporte = async () => ({});
  // `reset()` precede `enable()` porque `enable()` LANÇA se os timers já estiverem
  // habilitados. Rearmar o relógio por caso evita a contaminação de ordem descoberta
  // no 04-11 (o avanço do retry de um caso adiantando o relógio do caso seguinte).
  // Só `setTimeout`: as esperas do retry são a única coisa que precisa ser avançada.
  mock.timers.reset();
  mock.timers.enable({ apis: ['setTimeout'] });
});

after(() => {
  mock.timers.reset();
  mock.restoreAll();
});

test('(1) o transporte recriado no retry do dono precisa servir o segundo destinatário (WR2-05)', async () => {
  // O primeiro transporte está morto: todo envio por ele falha com erro de rede.
  // Qualquer transporte criado depois entrega normalmente.
  modoTransporte = async (indice) => {
    if (indice === 1) {
      throw Object.assign(new Error('Connection timeout'), {
        code: 'ETIMEDOUT',
      });
    }
    return {};
  };

  // A promessa é INICIADA sem await: o relógio falso precisa ser avançado enquanto
  // ela está pendente na espera de 3s do retry.
  const promessa = sendStaleNotification(pedidoDeEnvio(201));
  const resultados = await avancarRelogioAte(promessa);

  assert.equal(
    resultados.length,
    2,
    'pré-condição: o caso exige dois destinatários distintos',
  );
  assert.ok(
    enviosPorTransporte[1] >= 1,
    'pré-condição: o transporte quebrado precisa ter sido de fato exercitado pelo dono',
  );

  // O defeito, em um número: hoje são 3 transportes (a fábrica inicial, a recriação
  // do retry do dono e a recriação do retry do autor, que recomeçou com a conexão
  // morta). Com o transporte vivo devolvido ao chamador, bastam 2.
  assert.equal(
    transportesCriados,
    2,
    'o autor deve reusar o transporte que o retry do dono acabou de recriar, em vez de recomeçar com o que já falhou',
  );

  assert.equal(resultados[0].success, true);
  assert.equal(resultados[1].success, true);

  // Só vale no estado corrigido, por isso vem DEPOIS da asserção central: o
  // transporte quebrado é encontrado UMA única vez na rodada (pelo dono). No estado
  // com o defeito, o autor o encontra de novo e esta contagem é 2.
  assert.equal(
    enviosPorTransporte[1],
    1,
    'o transporte morto não pode ser encontrado uma segunda vez na mesma rodada',
  );
});

test('(2) o retorno por destinatário não muda de forma — o transporte não vaza para results', async () => {
  // Rejeição definitiva do servidor para o segundo destinatário: nenhuma das
  // condições de erro de rede casa, então não há retry e o caso não depende do
  // relógio. O primeiro destinatário recebe normalmente.
  modoTransporte = async (_indice, mailOptions) => {
    if (mailOptions.to === CRIADOR) {
      throw Object.assign(new Error('550 5.1.1 Caixa postal indisponível'), {
        code: 'EENVELOPE',
      });
    }
    return {};
  };

  const resultados = await sendStaleNotification(pedidoDeEnvio(202));

  assert.equal(
    resultados.length,
    2,
    'pré-condição: o caso exige dois destinatários distintos',
  );

  // Qualquer chave a mais aqui — o transporte, inclusive — viajaria em
  // `err.resultadosParciais` até o agendador e acabaria agregada no campo `error` do
  // notification_log; e quebraria `emailer.timeout.test.js`, que assere exatamente
  // estes conjuntos de chaves e é oráculo de REL-02 (não pode ser editado).
  assert.deepEqual(Object.keys(resultados[0]).sort(), ['success', 'to']);
  assert.deepEqual(Object.keys(resultados[1]).sort(), [
    'error',
    'success',
    'to',
  ]);

  assert.equal(resultados[0].to, DONO);
  assert.equal(resultados[0].success, true);
  assert.equal(resultados[1].to, CRIADOR);
  assert.equal(resultados[1].success, false);
  assert.equal(resultados[1].error, '550 5.1.1 Caixa postal indisponível');

  // Sem falha de rede não há recriação: uma conexão serviu os dois envios.
  assert.equal(transportesCriados, 1);
});

test('(3) caminho feliz: uma conexão por rodada, não uma por destinatário', async () => {
  // Nenhuma falha: o modo padrão do stub entrega tudo.
  const resultados = await sendStaleNotification(pedidoDeEnvio(203));

  assert.equal(
    resultados.length,
    2,
    'pré-condição: o caso exige dois destinatários distintos',
  );
  assert.equal(resultados[0].success, true);
  assert.equal(resultados[1].success, true);

  // Este é o caminho de todo dia. Resolver o problema do caminho de falha criando um
  // transporte POR DESTINATÁRIO dobraria as conexões aqui — é isso que esta asserção
  // proíbe.
  assert.equal(
    transportesCriados,
    1,
    'o caminho feliz não pode passar a abrir uma conexão por destinatário',
  );
  assert.equal(enviosPorTransporte[1], 2);
});
