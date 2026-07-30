// Prova de D-01 (CFG-01) na borda que importa: as opções entregues a
// nodemailer.createTransport levam a senha do AMBIENTE, nunca a da tabela `config`.
//
// O banco é semeado de propósito com um valor DIFERENTE ('db-pass') do que está no
// ambiente ('env-pass'), e a asserção negativa contra 'db-pass' é o que distingue
// "o código lê o env" de "o código lê o banco, que por acaso tem o mesmo valor".
// Sem ela o teste passaria mesmo com a regressão de volta.
//
// Como a chamada é disparada: `createTransporter()` é privada (não exportada). Em
// vez de abrir um seam de teste no módulo, usa-se o caminho público mais barato que
// passa por ela — `verifySmtp()`, que só faz `createTransporter().verify()`. Zero
// alteração no contrato de emailer.js, e o mesmo caminho que
// `POST /api/config/test-smtp` exercita em produção.
require('./setup');

// DEPOIS do setup, obrigatoriamente: setup.js:31 faz `SMTP_PASS = ''` SEM guarda
// (impede que um segredo do shell/CI vaze para o SQLite de teste). Se esta linha
// viesse antes, o setup a apagaria e o teste exercitaria o ramo errado.
process.env.SMTP_PASS = 'env-pass';

const { test, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

// DB_PATH fica no `:memory:` do setup — aqui não há segunda conexão para semear.
const { setConfig } = require('../src/db');
setConfig('smtp_host', 'smtp.exemplo.invalid');
setConfig('smtp_port', '587');
setConfig('smtp_user', 'usuario@exemplo.invalid');
// A senha "velha" que ficou no banco: o transporte NUNCA pode usá-la.
setConfig('smtp_pass', 'db-pass');

const { verifySmtp } = require('../src/emailer');

// O stub pode ser instalado DEPOIS do require de emailer.js: o módulo requer
// nodemailer no load, mas só chama createTransport() dentro de createTransporter()
// — folga que o caso do axios em agendor.js não tinha.
let captured = null;
mock.method(nodemailer, 'createTransport', (opts) => {
  captured = opts;
  return {
    verify: async () => true,
    sendMail: async () => ({}),
  };
});

after(() => {
  mock.restoreAll();
});

test('a senha entregue ao nodemailer vem de SMTP_PASS, não da tabela config (D-01)', async () => {
  await verifySmtp();

  assert.equal(captured.auth.pass, 'env-pass');
  // Asserção negativa explícita: é ela que prova D-01 em vez de presumi-lo.
  assert.notEqual(captured.auth.pass, 'db-pass');
  // E o valor antigo continua no banco — o transporte simplesmente o ignora.
  assert.equal(require('../src/db').getConfig('smtp_pass'), 'db-pass');
});

test('host, porta e usuário continuam vindo da tabela config (o híbrido de D-01)', async () => {
  await verifySmtp();

  assert.equal(captured.host, 'smtp.exemplo.invalid');
  assert.equal(captured.port, 587);
  assert.equal(captured.secure, false);
  assert.equal(captured.auth.user, 'usuario@exemplo.invalid');
});

test('sem SMTP_PASS no ambiente, auth.pass é string vazia — nunca o valor do banco', async () => {
  const anterior = process.env.SMTP_PASS;
  delete process.env.SMTP_PASS;
  try {
    await verifySmtp();
    // Normalizado para '' (não undefined, não 'db-pass'): a autenticação falha de
    // forma previsível em vez de usar silenciosamente uma credencial do banco.
    assert.equal(captured.auth.pass, '');
    assert.notEqual(captured.auth.pass, 'db-pass');
  } finally {
    process.env.SMTP_PASS = anterior;
  }
});
