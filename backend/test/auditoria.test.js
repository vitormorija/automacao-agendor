require('./setup');

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, tokenFor } = require('./helpers/httpServer');
const { getAuditLogs } = require('../src/db');

// Trilha de auditoria das ações sensíveis.
//
// O parecer de segurança pediu papéis E trilha no MESMO item: o controle de acesso diz quem
// PODE agir, e só a trilha diz quem AGIU. Sem ela, "quem mudou o agendamento" e "quem
// disparou e-mail para a base inteira" são perguntas sem resposta possível depois do fato.
//
// Os casos abaixo exercitam apenas rotas cujo desfecho é 403 — o middleware de papel
// responde antes do handler, então nada aqui fala com a API Agendor nem com o SMTP. É o que
// torna seguro auditar o disparo de e-mail numa suíte.

const ADMIN = 'chefe@example.invalid';
const COMUM = 'comercial@example.invalid';

function ultimaAcao(acao) {
  return getAuditLogs(200).find((l) => l.acao === acao);
}

test('a tentativa NEGADA entra na trilha', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  process.env.ADMIN_USERS = ADMIN;

  const res = await srv.request('/api/notifications/run', {
    method: 'POST',
    token: tokenFor(COMUM),
    body: {},
  });
  assert.equal(res.status, 403);

  // ESTE é o caso que motivou colocar `auditar` ANTES de `requireAdmin`. Registrar só o
  // sucesso deixaria invisível justamente o sinal que interessa: alguém tentando
  // repetidamente o que não pode.
  const linha = ultimaAcao('notificacao.disparar');
  assert.ok(linha, 'a tentativa negada não foi registrada');
  assert.equal(linha.username, COMUM, 'a trilha precisa nomear quem tentou');
  assert.equal(linha.status, 403, 'o desfecho real precisa constar');
  assert.ok(linha.created_at, 'sem quando, a trilha não serve');
});

test('a trilha cobre configuração, disparo e gestão de usuário', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  process.env.ADMIN_USERS = ADMIN;
  const token = tokenFor(COMUM);

  const esperadas = [
    ['/api/config', 'PUT', 'config.alterar'],
    ['/api/config/test-smtp', 'POST', 'config.testar-smtp'],
    ['/api/notifications/run', 'POST', 'notificacao.disparar'],
    [
      '/api/notifications/send-owner-summaries',
      'POST',
      'notificacao.disparar-resumos',
    ],
    ['/api/notifications/test-card', 'POST', 'notificacao.teste-card'],
    ['/api/notifications/test-summary', 'POST', 'notificacao.teste-resumo'],
    [
      '/api/notifications/test-owner-summary',
      'POST',
      'notificacao.teste-resumo-individual',
    ],
    ['/api/auth/users', 'POST', 'usuario.criar'],
    ['/api/auth/users/alguem', 'DELETE', 'usuario.excluir'],
  ];

  for (const [path, method, acao] of esperadas) {
    await srv.request(path, { method, token, body: {} });
    assert.ok(
      ultimaAcao(acao),
      `${method} ${path} deveria ter registrado a ação "${acao}"`,
    );
  }

  // Guarda de contagem: se alguém acrescentar uma rota administrativa e esquecer o
  // `auditar`, a lista acima continuaria verde medindo um conjunto menor. O número é
  // conferido contra as rotas que de fato declaram o middleware.
  const fonte = ['config', 'notifications', 'auth']
    .map((f) =>
      require('node:fs').readFileSync(
        require('node:path').join(__dirname, '..', 'src', 'routes', `${f}.js`),
        'utf8',
      ),
    )
    .join('\n');
  const declaradas = (fonte.match(/auditar\('/g) || []).length;
  assert.equal(
    declaradas,
    esperadas.length,
    `${declaradas} rota(s) declaram auditar(), mas o teste mede ${esperadas.length}`,
  );
});

test('a trilha só é legível por administrador', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  process.env.ADMIN_USERS = ADMIN;

  // Quem não pode agir também não precisa ver quem agiu.
  const comum = await srv.request('/api/auth/audit', {
    token: tokenFor(COMUM),
  });
  assert.equal(comum.status, 403);

  const semSessao = await srv.request('/api/auth/audit');
  assert.equal(semSessao.status, 401);
});

// Único caso deste arquivo que ATRAVESSA o gate de papel e executa o handler de verdade —
// é o preço de medir o `detalhe`, que só existe quando a gravação acontece. `PUT /api/config`
// chama `scheduleTask()` no fim, e as tarefas de cron criadas ali seguram o event loop: sem
// o `stopTasks` abaixo o processo de teste não termina, e a suíte trava sem falhar.
test('o detalhe registra QUAIS chaves mudaram, e nenhum valor', async (t) => {
  const srv = await startServer();
  const { stopTasks } = require('../src/scheduler');
  t.after(() => {
    stopTasks();
    return srv.close();
  });
  process.env.ADMIN_USERS = ADMIN;

  await srv.request('/api/config', {
    method: 'PUT',
    token: tokenFor(ADMIN),
    body: { stale_days: '21', admin_email: 'sigiloso@example.invalid' },
  });

  const linha = ultimaAcao('config.alterar');
  assert.equal(linha.status, 200);
  assert.match(linha.detalhe, /stale_days/);
  assert.match(linha.detalhe, /admin_email/);
  // O VALOR não pode entrar: chaves como admin_email e smtp_user carregam endereço de
  // pessoa, e a trilha não deve virar um segundo lugar onde esse dado é acumulado.
  assert.doesNotMatch(
    linha.detalhe,
    /sigiloso@example\.invalid/,
    'o valor da configuração vazou para dentro da trilha',
  );
});
