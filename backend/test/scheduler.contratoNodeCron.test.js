require('./setup');

const test = require('node:test');
const assert = require('node:assert/strict');
const cron = require('node-cron');
const scheduler = require('../src/scheduler');

// Contrato do node-cron, pinado depois da subida 3 → 4.
//
// A major foi necessária porque a linha 3.x depende de um `uuid` vulnerável e não recebe
// correção. A superfície que este projeto usa é minúscula — três símbolos — e o resto da
// suíte não a exercita: os testes de scheduler chamam `runCheck` diretamente e nunca
// `scheduleTask`, então uma quebra de API passaria verde e só apareceria no primeiro boot
// em produção, com o agendamento morto e nenhum e-mail saindo.
//
// Este arquivo mede os três símbolos e o efeito de ponta a ponta. É o oráculo da próxima
// atualização de major.

test('node-cron: os três símbolos que o projeto usa', () => {
  // 1. validate — usado por routes/config.js para recusar expressão inválida no PUT.
  assert.equal(cron.validate('0 8 * * *'), true);
  assert.equal(cron.validate('nao-e-uma-expressao'), false);

  // 2. schedule com timezone — o fuso é requisito de negócio (8h em São Paulo, não em UTC).
  const task = cron.schedule('0 8 * * *', () => {}, {
    timezone: 'America/Sao_Paulo',
  });
  assert.ok(task, 'schedule precisa devolver a tarefa');

  // 3. stop — usado por stopTasks(), no reagendamento e no shutdown.
  assert.equal(typeof task.stop, 'function');
  task.stop();
  task.destroy();
});

test('node-cron: o fuso configurado realmente desloca a próxima execução', () => {
  // Um `timezone` silenciosamente ignorado é a falha mais cara possível aqui: o cron
  // dispararia às 8h UTC, isto é, às 5h da manhã no Brasil, e ninguém notaria olhando o
  // código. A diferença entre os dois fusos é o que prova que a opção foi honrada.
  const emSaoPaulo = cron.schedule('0 8 * * *', () => {}, {
    timezone: 'America/Sao_Paulo',
  });
  const emUtc = cron.schedule('0 8 * * *', () => {}, { timezone: 'UTC' });

  const proximaSp = emSaoPaulo.getNextRun();
  const proximaUtc = emUtc.getNextRun();

  emSaoPaulo.destroy();
  emUtc.destroy();

  assert.ok(proximaSp instanceof Date, 'getNextRun precisa devolver uma data');
  assert.ok(proximaUtc instanceof Date);
  assert.notEqual(
    proximaSp.getTime(),
    proximaUtc.getTime(),
    'as duas tarefas caíram no mesmo instante — o timezone foi ignorado',
  );
});

test('scheduleTask/stopTasks sobrevivem à major', () => {
  // O caminho que nenhum outro teste percorre: o agendamento de verdade, com as duas
  // tarefas do sistema (diária e semanal), pelo código do projeto.
  scheduler.scheduleTask();
  const status = scheduler.getStatus();
  assert.equal(status.schedule, '0 8 * * *');

  scheduler.stopTasks();
  // Depois de parar, o status precisa refletir que não há tarefa viva — é o que o painel lê.
  assert.equal(scheduler.getStatus().nextRun, 'não agendado');
});
