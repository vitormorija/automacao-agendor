// Prova de REL-02 / D-02 na borda SMTP: todo transporte criado pelo projeto nasce
// com teto de tempo explícito — `connectionTimeout`, `greetingTimeout` e `socketTimeout`.
//
// Por que isto importa: sem essas opções valem os defaults do nodemailer
// (2min / 30s / **10min**). O socket de 10 minutos é o que permite UMA tentativa
// travada segurar a rodada inteira: com as 3 tentativas de `sendMailWithRetry`
// (emailer.js:178-203) o pior caso por destinatário passa de ~30 minutos. Com
// `socketTimeout` de 30s ele cai para ~1min40s.
//
// Como a chamada é disparada: `createTransporter()` é privada (não exportada), e o
// molde deste arquivo é `emailer.smtpPass.test.js` — em vez de abrir um seam no
// módulo, usa-se o caminho público mais barato que passa pela fábrica: `verifySmtp()`,
// que só faz `createTransporter().verify()`. Os cenários de retry chegam à mesma
// fábrica pelo outro caminho público, `sendStaleNotification(...)`.
//
// Invariantes pinados aqui:
//   (1) os três timeouts de D-02 chegam a `nodemailer.createTransport`;
//   (2) host/porta/usuário continuam vindo da tabela `config` (o híbrido de D-01);
//   (3) o teto escolhido é mesmo um teto — bem abaixo do default do nodemailer;
//   (4) esgotar as 3 tentativas RESOLVE com `{ success: false }`, nunca lança (D-03);
//   (5) uma falha de rede seguida de sucesso ainda envia, e o transporter é RECRIADO;
//   (6) o retorno continua sendo um item `{ to, success, error? }` por destinatário,
//       e um erro que não é de rede não queima as 3 tentativas.
//
// Os cenários (4)-(6) existem como ORÁCULO do caminho de envio para o bump de
// nodemailer 6→9 do 04-05: `emailer.js` tinha 7,16% de cobertura, então "a suíte
// continua verde sob v9" seria evidência fraca sem eles. São caracterização —
// pinam o comportamento ATUAL, não o ideal; o contrato proíbe alterar a semântica
// de `sendMailWithRetry`.
//
// PC-13: NUNCA imprimir o objeto de opções inteiro nem usá-lo em `deepStrictEqual`
// — ele carrega `auth.pass`. Só asserções sobre campos individuais.
require('./setup');

const { test, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

// DB_PATH fica no `:memory:` do setup — aqui não há segunda conexão para semear.
const { setConfig } = require('../src/db');
setConfig('smtp_host', 'smtp.exemplo.invalid');
setConfig('smtp_port', '587');
setConfig('smtp_user', 'usuario@exemplo.invalid');
setConfig('smtp_from', 'automacao@exemplo.invalid');

// ── Stub da borda SMTP ───────────────────────────────────────────
// Um único stub para o arquivo inteiro. Os cenários variam o comportamento pelo
// handler mutável `aoEnviar`, NUNCA reinstalando o mock no meio do arquivo
// (`node --test` isola por arquivo, não por `test()`).
let opcoesCapturadas = null;
let transportesCriados = 0;
let enviosTentados = 0;
let aoEnviar = async () => ({});

mock.method(nodemailer, 'createTransport', (opts) => {
  opcoesCapturadas = opts;
  transportesCriados++;
  return {
    verify: async () => true,
    sendMail: async (mailOptions) => {
      enviosTentados++;
      return aoEnviar(mailOptions, enviosTentados);
    },
  };
});

const { verifySmtp, sendStaleNotification } = require('../src/emailer');

// Negócio sintético mínimo com os campos que `dealEmailHtml` lê. Nenhum dado real:
// os domínios são `.invalid`, reservado por RFC 2606 e portanto nunca resolvível.
const NEGOCIO = {
  id: 4242,
  title: 'Negócio sintético de teste',
  ownerName: 'Fulana',
  authorName: 'Beltrano',
  organization: 'Organização Sintética',
  funnel: 'Funil Padrão',
  dealType: 'Negócio',
  daysSinceUpdate: 31,
  updatedAt: '2026-07-01T12:00:00.000Z',
  createdAt: '2026-05-01T12:00:00.000Z',
  webUrl: 'https://web.agendor.com.br/deal/4242',
};

const DONO = 'dono@exemplo.invalid';
const AUTOR = 'autor@exemplo.invalid';

// Avança o relógio falso até a promessa concluir, sem esperar tempo real.
//
// Por que não `mock.timers.tickAsync`: essa API só existe a partir do Node 23, e o
// alvo do projeto é Node 20 (engines do package.json e a matriz do CI) — lá ela é
// `undefined` e o teste morreria com TypeError. O equivalente portátil é alternar
// duas coisas: ceder o event loop com `setImmediate` (que NÃO está mockado, pois
// habilitamos apenas `setTimeout`) para as microtasks entre as tentativas drenarem,
// e só então avançar o relógio. Um `tick()` síncrono sozinho não basta: a
// continuação de cada `await` de `sendMailWithRetry` é uma microtask que ainda não
// rodou quando o tick retorna.
async function avancarRelogioAte(promessa) {
  let concluida = false;
  const encerrada = promessa.then((valor) => {
    concluida = true;
    return valor;
  });
  for (let i = 0; i < 20 && !concluida; i++) {
    await new Promise((r) => setImmediate(r));
    if (!concluida) mock.timers.tick(10000);
  }
  // Falha explícita em vez de travar a suíte se o laço não for suficiente.
  if (!concluida) {
    throw new Error('a promessa não concluiu após avançar o relógio falso');
  }
  return encerrada;
}

beforeEach(() => {
  opcoesCapturadas = null;
  transportesCriados = 0;
  enviosTentados = 0;
  aoEnviar = async () => ({});
});

after(() => {
  mock.restoreAll();
});

// ── D-02: os três timeouts na fábrica ────────────────────────────

test('o transporte SMTP nasce com os três timeouts explícitos de D-02', async () => {
  await verifySmtp();

  assert.equal(opcoesCapturadas.connectionTimeout, 10000);
  assert.equal(opcoesCapturadas.greetingTimeout, 10000);
  assert.equal(opcoesCapturadas.socketTimeout, 30000);
});

test('os timeouts não deslocam host, porta e usuário da tabela config', async () => {
  await verifySmtp();

  // Asserção de não-regressão: a mudança de D-02 é ADITIVA. Se alguém reescrever
  // o objeto da fábrica em vez de acrescentar chaves, é aqui que aparece.
  assert.equal(opcoesCapturadas.host, 'smtp.exemplo.invalid');
  assert.equal(opcoesCapturadas.port, 587);
  assert.equal(opcoesCapturadas.secure, false);
  assert.equal(opcoesCapturadas.auth.user, 'usuario@exemplo.invalid');
  // O VALOR da senha é assunto de emailer.smtpPass.test.js (PC-13): aqui só o tipo.
  assert.equal(typeof opcoesCapturadas.auth.pass, 'string');
});

test('o socketTimeout é um teto real: bem abaixo dos 10 minutos de default do nodemailer', async () => {
  await verifySmtp();

  // Defaults medidos no fonte do nodemailer (lib/smtp-connection/index.js:14-16),
  // idênticos em 6.10.1 (instalado) e 9.0.4 (alvo do 04-05).
  const SOCKET_TIMEOUT_PADRAO = 10 * 60 * 1000;
  const CONNECTION_TIMEOUT_PADRAO = 2 * 60 * 1000;
  assert.ok(
    opcoesCapturadas.socketTimeout < SOCKET_TIMEOUT_PADRAO,
    'socketTimeout precisa ser menor que o default de 10 min',
  );
  assert.ok(
    opcoesCapturadas.connectionTimeout < CONNECTION_TIMEOUT_PADRAO,
    'connectionTimeout precisa ser menor que o default de 2 min',
  );

  // O número que justifica D-02: pior caso por destinatário com as 3 tentativas de
  // sendMailWithRetry (3 × socketTimeout + as esperas de 3s e 6s) fica em ~1min40s.
  const piorCasoPorDestinatario =
    3 * opcoesCapturadas.socketTimeout + 3000 + 6000;
  assert.ok(
    piorCasoPorDestinatario <= 100000,
    `pior caso por destinatário subiu para ${piorCasoPorDestinatario}ms`,
  );
});

test('cada chamada à fábrica produz um transporte novo, e todos com os mesmos timeouts', async () => {
  await verifySmtp();
  const primeiro = opcoesCapturadas.socketTimeout;
  await verifySmtp();

  // Os 6 call-sites de createTransporter() são cobertos por UMA configuração porque
  // ninguém guarda o transporte: cada invocação passa pela fábrica de novo.
  assert.equal(transportesCriados, 2);
  assert.equal(opcoesCapturadas.socketTimeout, primeiro);
  assert.equal(opcoesCapturadas.connectionTimeout, 10000);
  assert.equal(opcoesCapturadas.greetingTimeout, 10000);
});

// ── D-03: caracterização do caminho de envio (oráculo para o 04-05) ──
//
// Os erros injetados são FIÉIS ao que o nodemailer realmente produz. O `_formatError`
// dele SOBRESCREVE `err.code` (`if (type && type !== 'Error') err.code = type`), e o
// listener de socket usa o tipo 'ESOCKET' — então um ECONNRESET nativo chega a
// `sendMailWithRetry` como `code: 'ESOCKET'`, e o único ramo que de fato o captura é
// o da MENSAGEM (`emailer.js:188`). Injetar `{ code: 'ECONNRESET' }` seria um caminho
// que o nodemailer real nunca produz — verde falso.

test('(4) esgotar as 3 tentativas resolve com success:false, sem lançar (D-03)', async () => {
  aoEnviar = async () => {
    throw Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' });
  };

  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    // A promessa é INICIADA sem await: o relógio falso precisa ser avançado
    // enquanto ela está pendente nas esperas de 3s e 6s.
    const promessa = sendStaleNotification({
      deal: NEGOCIO,
      ownerEmail: DONO,
      authorEmail: null,
      logId: 101,
    });
    const resultados = await avancarRelogioAte(promessa);

    // Resolve — não rejeita. É por isso que NÃO existe assert.rejects aqui: o
    // scheduler conta com receber a lista e seguir para o próximo destinatário.
    assert.equal(Array.isArray(resultados), true);
    assert.equal(resultados.length, 1);
    assert.equal(resultados[0].to, DONO);
    assert.equal(resultados[0].success, false);
    assert.equal(typeof resultados[0].error, 'string');

    // Exatamente 3 tentativas: nem 1 (retry morto), nem 4 (retry a mais).
    assert.equal(enviosTentados, 3);
  } finally {
    mock.timers.reset();
  }
});

test('(5) falha de rede seguida de sucesso ainda envia, e recria o transporter', async () => {
  aoEnviar = async (_mailOptions, tentativa) => {
    if (tentativa === 1) {
      // Reset de conexão como o nodemailer o entrega: code ESOCKET, mensagem
      // preservando o ECONNRESET nativo.
      throw Object.assign(new Error('read ECONNRESET'), { code: 'ESOCKET' });
    }
    return {};
  };

  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const promessa = sendStaleNotification({
      deal: NEGOCIO,
      ownerEmail: DONO,
      authorEmail: null,
      logId: 102,
    });
    const resultados = await avancarRelogioAte(promessa);

    assert.equal(resultados.length, 1);
    assert.equal(resultados[0].success, true);
    assert.equal(enviosTentados, 2);

    // O que pina `emailer.js:197`: a retentativa não reusa a conexão morta — passa
    // pela fábrica de novo (1 no início de sendStaleNotification + 1 no retry).
    assert.ok(
      transportesCriados > 1,
      `o transporter deveria ser recriado no retry; criados: ${transportesCriados}`,
    );
  } finally {
    mock.timers.reset();
  }
});

test('(6) dois destinatários distintos rendem 2 itens { to, success }', async () => {
  const resultados = await sendStaleNotification({
    deal: NEGOCIO,
    ownerEmail: DONO,
    authorEmail: AUTOR,
    logId: 103,
  });

  assert.equal(resultados.length, 2);
  assert.deepEqual(
    resultados.map((r) => r.to),
    [DONO, AUTOR],
  );
  for (const item of resultados) {
    assert.equal(item.success, true);
    // No sucesso a chave `error` está AUSENTE — não é `null` nem string vazia.
    assert.deepEqual(Object.keys(item).sort(), ['success', 'to']);
  }
  assert.equal(enviosTentados, 2);
});

test('(7) authorEmail igual ao ownerEmail rende 1 item apenas', async () => {
  const resultados = await sendStaleNotification({
    deal: NEGOCIO,
    ownerEmail: DONO,
    authorEmail: DONO,
    logId: 104,
  });

  // A guarda de `emailer.js:229` (`authorEmail !== ownerEmail`) evita o e-mail
  // duplicado para quem é dono e autor do mesmo card.
  assert.equal(resultados.length, 1);
  assert.equal(resultados[0].to, DONO);
  assert.equal(enviosTentados, 1);
});

test('(8) erro que não é de rede não é retentado, e não impede o outro destinatário', async () => {
  aoEnviar = async (mailOptions) => {
    if (mailOptions.to === DONO) {
      // Rejeição definitiva do servidor: nenhuma das 4 condições de isNetworkError
      // casa, então sendMailWithRetry retorna na PRIMEIRA tentativa.
      throw new Error('550 5.1.1 Mailbox unavailable');
    }
    return {};
  };

  // Sem mock.timers de propósito: se este caminho passasse a retentar, o teste
  // gastaria 9 segundos reais — a lentidão seria o próprio alarme.
  const resultados = await sendStaleNotification({
    deal: NEGOCIO,
    ownerEmail: DONO,
    authorEmail: AUTOR,
    logId: 105,
  });

  assert.equal(resultados.length, 2);
  assert.equal(resultados[0].to, DONO);
  assert.equal(resultados[0].success, false);
  assert.equal(resultados[0].error, '550 5.1.1 Mailbox unavailable');
  // D-03 em uma linha: a falha de um destinatário é registrada e o envio SEGUE.
  assert.equal(resultados[1].to, AUTOR);
  assert.equal(resultados[1].success, true);
  assert.equal(resultados[1].error, undefined);

  // 1 tentativa para o dono (sem retry) + 1 para o autor.
  assert.equal(enviosTentados, 2);
});
