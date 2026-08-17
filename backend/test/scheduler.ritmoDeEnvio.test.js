// Pausa entre envios consecutivos de uma rodada (`EMAIL_INTERVALO_MS`).
//
// Por que ela existe: em 17/08/2026 uma rodada real disparou 40 notificações em 67 segundos
// e o servidor recusou a vigésima com `451 4.3.0 queue file write error`. O limite atingido
// não é o de VOLUME — a Locaweb permite 100 mensagens por hora por caixa e a rodada nem
// chega perto — mas o de CONEXÕES: `sendStaleNotification` cria um transporte por
// notificação, então foram ~40 conexões em pouco mais de um minuto. A retentativa em 4xx
// (emailer.retry4xx.test.js) conserta o sintoma; esta pausa ataca a causa.
//
// O que este arquivo pina, e que uma asserção sobre o fonte não alcançaria: que a pausa
// GATEIA de fato o envio seguinte. A prova é feita segurando o relógio falso parado e
// mostrando que a rodada estaciona no meio — se a pausa fosse removida ou o `await`
// esquecido, todos os envios aconteceriam na mesma leva e o caso ficaria vermelho.
//
// Molde do harness copiado de scheduler.categoriaIndecidivel.test.js, que é o arquivo que
// já monta um `runCheck` completo com as duas bordas (Agendor e SMTP) sob controle.

const { makeTmpDbPath } = require('./helpers/tmpDb');

// DB_PATH antes de qualquer require de db.js — ele abre a conexão no load.
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

// O intervalo precisa valer ANTES do require de scheduler.js: a constante é resolvida no
// load do módulo. É também a razão de este caso morar em arquivo PRÓPRIO — `node --test`
// isola por arquivo, e setup.js zera o intervalo para todos os outros.
process.env.EMAIL_INTERVALO_MS = '3000';

require('./setup');

const { test, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { installFakeAxios } = require('./helpers/fakeAxios');
const { avancarRelogioAte } = require('./helpers/fakeTimers');

const DONO_1 = 'dono1@exemplo.invalid';
const DONO_2 = 'dono2@exemplo.invalid';

// Dono e autor com o MESMO e-mail em cada negócio: assim cada negócio produz exatamente um
// envio, e a contagem mede rodadas do laço em vez de destinatários por notificação.
const USUARIOS = {
  data: [
    { id: 31, name: 'Ana Vendas', contact: { email: DONO_1 } },
    { id: 41, name: 'Ana Vendas', contact: { email: DONO_1 } },
    { id: 32, name: 'Bruno Vendas', contact: { email: DONO_2 } },
    { id: 42, name: 'Bruno Vendas', contact: { email: DONO_2 } },
  ],
  links: {},
};

const dealsPage = require('./fixtures/synthetic/deals-page.json');
const MOLDE = dealsPage.find((d) => d.id === 101);

const DEALS = [
  {
    ...MOLDE,
    id: 901,
    title: 'Negócio sintético 901',
    owner: { id: 31, name: 'Ana Vendas' },
    author: { id: 41, name: 'Ana Vendas' },
    organization: { id: 1001, name: 'Org 1001' },
  },
  {
    ...MOLDE,
    id: 902,
    title: 'Negócio sintético 902',
    owner: { id: 32, name: 'Bruno Vendas' },
    author: { id: 42, name: 'Bruno Vendas' },
    organization: { id: 1002, name: 'Org 1002' },
  },
];

installFakeAxios((url) => {
  if (url === '/deals') {
    return {
      data: { data: DEALS, meta: { totalCount: DEALS.length }, links: {} },
    };
  }
  if (url.startsWith('/organizations/')) {
    return { data: { data: { category: { name: 'Lead' } } } };
  }
  if (url === '/tasks') return { data: { data: [] } };
  if (url === '/users') return { data: USUARIOS };
  return { data: { data: [] } };
});

let envios = 0;
mock.method(nodemailer, 'createTransport', () => ({
  verify: async () => true,
  sendMail: async () => {
    envios++;
    return {};
  },
}));

const db = require('../src/db');
const { runCheck } = require('../src/scheduler');

db.setConfig('notifications_enabled', 'true');
db.setConfig('smtp_host', 'smtp.exemplo.invalid');
db.setConfig('smtp_port', '587');
db.setConfig('smtp_user', 'usuario@exemplo.invalid');
db.setConfig('smtp_from', 'automacao@exemplo.invalid');

after(() => cleanup());

test('a rodada estaciona na pausa e só segue quando o relógio anda', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const promessa = runCheck();

    // Cede o event loop várias vezes SEM avançar o relógio. Todo o trabalho assíncrono que
    // não depende de tempo (as chamadas de borda, já stubadas, e o primeiro envio) drena
    // aqui. O que não pode drenar é o segundo envio: ele está atrás de um setTimeout que
    // ninguém disparou.
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setImmediate(r));
    }
    const enviosComRelogioParado = envios;

    const resultado = await avancarRelogioAte(promessa);

    assert.equal(
      resultado.notified,
      2,
      'os dois negócios precisam ser notificados quando a rodada termina',
    );
    assert.equal(envios, 2);

    // O coração do caso: com o relógio parado a rodada NÃO chegou ao fim. Sem a pausa este
    // número seria 2, igual ao total, porque nada seguraria o laço.
    assert.ok(
      enviosComRelogioParado < 2,
      `com o relógio parado deveria faltar envio; foram ${enviosComRelogioParado} de 2`,
    );
  } finally {
    mock.timers.reset();
  }
});
