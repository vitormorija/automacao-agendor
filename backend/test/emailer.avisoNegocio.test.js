// Texto do aviso por negócio (nov/2026).
//
// 1. O aviso é sempre sobre o NEGÓCIO: "Lead parado" fazia quem recebia ir conferir a empresa.
//    Lead/Negócio continua só como tipo de cliente.
// 2. Quando a empresa tem outro responsável, o e-mail diz isso e diz o que fazer.
require('./setup');

const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

const { setConfig } = require('../src/db');
setConfig('smtp_host', 'smtp.exemplo.invalid');
setConfig('smtp_port', '587');
setConfig('smtp_user', 'usuario@exemplo.invalid');
setConfig('smtp_from', 'automacao@exemplo.invalid');

const enviados = [];
mock.method(nodemailer, 'createTransport', () => ({
  verify: async () => true,
  sendMail: async (opcoes) => {
    enviados.push(opcoes);
    return {};
  },
}));

const { sendStaleNotification, _interno } = require('../src/emailer');
const { dealEmailHtml } = _interno;

const NEGOCIO = {
  id: 4242,
  title: 'Negócio sintético',
  ownerName: 'Fulana',
  organization: 'Organização Sintética',
  orgCategory: null,
  dealType: 'Lead',
  funnel: 'Funil Padrão',
  daysSinceUpdate: 24,
  updatedAt: '2026-07-01T12:00:00.000Z',
  createdAt: '2026-05-01T12:00:00.000Z',
  webUrl: 'https://web.agendor.com.br/deal/4242',
};

test('tipo Lead: título e assunto dizem "Negócio parado", nunca "Lead parado"', async () => {
  const html = dealEmailHtml({
    deal: NEGOCIO,
    ownerName: 'Fulana',
    role: 'owner',
  });
  assert.ok(html.includes('Negócio parado há 24 dias'));
  assert.ok(!html.includes('Lead parado'));
  assert.ok(html.includes('Um negócio sob sua responsabilidade'));
  assert.ok(html.includes('🔵 Lead'), 'o tipo de cliente continua visível');

  await sendStaleNotification({
    deal: NEGOCIO,
    ownerEmail: 'dono@exemplo.invalid',
    logId: 1,
  });
  assert.equal(
    enviados.at(-1).subject,
    '⚠️ Negócio parado há 24 dias: Negócio sintético',
  );
});

test('autor: a saudação também fala em negócio', () => {
  const html = dealEmailHtml({
    deal: NEGOCIO,
    ownerName: 'Beltrano',
    role: 'author',
  });
  assert.ok(html.includes('Um negócio que você criou'));
});

test('a dica explica que registro só na empresa não conta', () => {
  const html = dealEmailHtml({
    deal: NEGOCIO,
    ownerName: 'Fulana',
    role: 'owner',
  });
  assert.ok(
    html.includes('Registros feitos só na empresa ou no contato não contam'),
  );
});

test('responsáveis diferentes: o aviso aparece com os dois nomes', () => {
  const html = dealEmailHtml({
    deal: { ...NEGOCIO, responsavelDivergente: true, orgOwnerName: 'Ciclana' },
    ownerName: 'Fulana',
    role: 'owner',
  });
  assert.ok(html.includes('responsáveis diferentes'));
  assert.ok(html.includes('hoje está com <strong>Ciclana</strong>'));
  assert.ok(html.includes('continua no nome de <strong>Fulana</strong>'));
});

test('mesmo responsável (ou desconhecido): nenhum aviso', () => {
  for (const extra of [
    {},
    { responsavelDivergente: false, orgOwnerName: 'Fulana' },
  ]) {
    const html = dealEmailHtml({
      deal: { ...NEGOCIO, ...extra },
      ownerName: 'Fulana',
      role: 'owner',
    });
    assert.ok(!html.includes('responsáveis diferentes'));
  }
});

test('o nome do responsável da empresa sai escapado', () => {
  const carga = '<script>alert(1)</script>';
  const html = dealEmailHtml({
    deal: { ...NEGOCIO, responsavelDivergente: true, orgOwnerName: carga },
    ownerName: 'Fulana',
    role: 'owner',
  });
  assert.ok(!html.includes(carga));
});
