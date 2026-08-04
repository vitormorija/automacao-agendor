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
//   (3) o teto escolhido é mesmo um teto — bem abaixo do default do nodemailer.
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

const { verifySmtp } = require('../src/emailer');

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
