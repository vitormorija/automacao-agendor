// Retentativa em resposta 4xx do servidor SMTP.
//
// O defeito que este arquivo fixa aconteceu em produção, em 17/08/2026: numa rodada de 40
// notificações, o servidor da Locaweb recusou a vigésima com
//
//     451 4.3.0 Error: queue file write error
//
// e `sendMailWithRetry` desistiu na PRIMEIRA tentativa. A guarda de retentativa só
// reconhecia falha de REDE — `ECONNRESET`, `ETIMEDOUT` e as duas variantes por mensagem —
// e a resposta do servidor chega com `code: 'EMESSAGE'` e `responseCode: 451`, que não
// casa com nenhuma delas. Resultado: a função existia justamente para o caso que o
// protocolo define como retentável e era o único que ela não cobria.
//
// A distinção que este arquivo pina é a que importa:
//   4xx → temporário. O servidor está pedindo "tente de novo". RETENTA.
//   5xx → definitivo (caixa inexistente, mensagem barrada). NÃO retenta, porque repetir
//         só reproduz o mesmo erro três vezes e ainda atrasa os destinatários seguintes.
//
// O cenário (8) de emailer.timeout.test.js cobre o 5xx pelo caminho de um Error simples,
// sem `responseCode`. Aqui o 5xx vem COM o campo preenchido, que é como o nodemailer o
// entrega de verdade — sem este caso, trocar a faixa por `>= 400` sozinho passaria.
//
// Molde do harness (stub de nodemailer, semente de config, relógio falso): copiado de
// emailer.timeout.test.js, pelo mesmo motivo declarado lá — `createTransporter()` é
// privada, e o caminho público que passa por ela é `sendStaleNotification`.
require('./setup');

const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { avancarRelogioAte } = require('./helpers/fakeTimers');

const { setConfig } = require('../src/db');
setConfig('smtp_host', 'smtp.exemplo.invalid');
setConfig('smtp_port', '587');
setConfig('smtp_user', 'usuario@exemplo.invalid');
setConfig('smtp_from', 'automacao@exemplo.invalid');

let enviosTentados = 0;
let aoEnviar = async () => ({});

mock.method(nodemailer, 'createTransport', () => ({
  verify: async () => true,
  sendMail: async (mailOptions) => {
    enviosTentados++;
    return aoEnviar(mailOptions, enviosTentados);
  },
}));

const { sendStaleNotification } = require('../src/emailer');

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

// O erro EXATO recebido em produção, montado como o nodemailer o entrega.
function erro451() {
  return Object.assign(
    new Error('Message failed: 451 4.3.0 Error: queue file write error'),
    { code: 'EMESSAGE', responseCode: 451 },
  );
}

beforeEach(() => {
  enviosTentados = 0;
  aoEnviar = async () => ({});
});

test('o 451 da Locaweb é retentado, e o envio seguinte conclui', async () => {
  aoEnviar = async (_opts, tentativa) => {
    if (tentativa === 1) throw erro451();
    return {};
  };

  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const promessa = sendStaleNotification({
      deal: NEGOCIO,
      ownerEmail: DONO,
      authorEmail: null,
      logId: 201,
    });
    const resultados = await avancarRelogioAte(promessa);

    assert.equal(resultados.length, 1);
    assert.equal(
      resultados[0].success,
      true,
      'a segunda tentativa deu certo — a notificação NÃO pode terminar como falha',
    );
    // Duas e não três: retentou uma vez e parou ao conseguir.
    assert.equal(enviosTentados, 2);
  } finally {
    mock.timers.reset();
  }
});

test('4xx persistente esgota as 3 tentativas antes de desistir', async () => {
  aoEnviar = async () => {
    throw erro451();
  };

  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const promessa = sendStaleNotification({
      deal: NEGOCIO,
      ownerEmail: DONO,
      authorEmail: null,
      logId: 202,
    });
    const resultados = await avancarRelogioAte(promessa);

    assert.equal(resultados[0].success, false);
    assert.match(resultados[0].error, /451/);
    // Exatamente 3: é o que separa "retenta" de "retenta para sempre".
    assert.equal(enviosTentados, 3);
  } finally {
    mock.timers.reset();
  }
});

test('5xx com responseCode preenchido continua SEM retentativa', async () => {
  // A metade que impede o conserto de virar exagero. Caixa inexistente não melhora
  // tentando de novo: as três tentativas só atrasariam os destinatários seguintes.
  aoEnviar = async () => {
    throw Object.assign(new Error('550 5.1.1 Mailbox unavailable'), {
      code: 'EMESSAGE',
      responseCode: 550,
    });
  };

  // Sem relógio falso de propósito: se este caminho passasse a retentar, o teste gastaria
  // 9 segundos reais, e a lentidão seria o próprio alarme.
  const resultados = await sendStaleNotification({
    deal: NEGOCIO,
    ownerEmail: DONO,
    authorEmail: null,
    logId: 203,
  });

  assert.equal(resultados[0].success, false);
  assert.equal(enviosTentados, 1, 'o 5xx não pode consumir as 3 tentativas');
});
