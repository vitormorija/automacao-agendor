// Helper de teste (NÃO define testes) — avança o relógio falso do `node:test` até
// uma promessa concluir, sem esperar tempo real. Serve a qualquer caso que exercite
// um caminho com `await new Promise((r) => setTimeout(r, ...))` no meio (hoje: a
// espera de 3s/6s entre as tentativas de `sendMailWithRetry`, em `emailer.js`).
//
// Uso típico:
//   const { avancarRelogioAte } = require('./helpers/fakeTimers');
//   mock.timers.enable({ apis: ['Date', 'setTimeout'], now: FIXED_NOW });
//   const r = await avancarRelogioAte(runCheck());
//
// Por que NÃO `mock.timers.tickAsync`: essa API só existe a partir do Node 23, e o
// alvo do projeto é Node 20 (`engines.node` do package.json e `node-version: '20'`
// na matriz do `.github/workflows/ci.yml`) — lá ela é `undefined` e o teste morreria
// com TypeError. O equivalente portátil é alternar duas coisas: ceder o event loop
// com `setImmediate` (que NÃO está mockado, pois habilitamos apenas `setTimeout`)
// para as microtasks entre as tentativas drenarem, e só então avançar o relógio. Um
// `tick()` síncrono sozinho não basta: a continuação de cada `await` do código sob
// teste é uma microtask que ainda não rodou quando o tick retorna.
//
// Nota sobre duplicação deliberada: `backend/test/emailer.timeout.test.js` (04-04)
// mantém a SUA cópia local desta função de propósito, e por isso restam DUAS variantes
// em circulação — não três. A terceira (o envelope `avancarRelogioAteDesfecho`, que vivia
// em `agendor.retry429.test.js`) desapareceu no 04-13, porque ela existia exatamente para
// compensar o ramo de rejeição que agora é tratado aqui dentro. A cópia de
// `emailer.timeout.test.js` continua: aquele arquivo é o oráculo de REL-02 e o `emailer.js`
// muda ainda nesta rodada de gap closure — trocar o instrumento e o objeto medido na mesma
// rodada é o que a constraint de processo do CLAUDE.md proíbe. A deduplicação (fazer aquele
// arquivo passar a importar daqui) segue registrada como trabalho futuro.
const { mock } = require('node:test');

// Por que o `then` tem DOIS argumentos (WR2-03): com apenas o ramo de sucesso, a promessa
// derivada `encerrada` fica ÓRFÃ quando `promessa` rejeita — a flag nunca vira verdadeira, o
// laço estoura, esta função lança a mensagem genérica e a rejeição aflora como
// `unhandledRejection`. O `node:test` credita uma rejeição não tratada ao caso que estiver
// correndo NAQUELE momento, então ela pode reprovar um caso VIZINHO com a mensagem de outro
// caso — e um instrumento que atribui a falha ao ator errado corrói a confiança em toda a
// suíte. Tratando os dois ramos, `encerrada` nunca rejeita e o erro REAL do SUT é relançado
// abaixo, sem embrulho, para que o `assert.rejects` do chamador continue sendo o oráculo.
//
// Por que a falha explícita vem ANTES do `await encerrada`: o snippet do code review (WR2-03)
// propõe a ordem inversa, e ela reintroduz o defeito que a mensagem explícita existe para
// evitar — se a promessa NUNCA assentar, `await encerrada` fica pendurado para sempre e a
// suíte TRAVA em vez de falhar de forma legível. Uma `encerrada` pendente para sempre é
// inofensiva justamente porque tem handler de rejeição anexado. (Coberto pelo caso (3) de
// `fakeTimers.helper.test.js`.)
async function avancarRelogioAte(promessa) {
  let desfecho = null;
  const encerrada = promessa.then(
    (valor) => {
      desfecho = { ok: true, valor };
    },
    (erro) => {
      desfecho = { ok: false, erro };
    },
  );
  for (let i = 0; i < 20 && !desfecho; i++) {
    await new Promise((r) => setImmediate(r));
    if (!desfecho) mock.timers.tick(10000);
  }
  // Falha explícita em vez de travar a suíte se o laço não for suficiente.
  if (!desfecho) {
    throw new Error('a promessa não concluiu após avançar o relógio falso');
  }
  // A esta altura já está assentada, e não pode rejeitar (os dois ramos foram tratados).
  await encerrada;
  if (!desfecho.ok) throw desfecho.erro;
  return desfecho.valor;
}

module.exports = { avancarRelogioAte };
