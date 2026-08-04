// Helper de teste (NÃO define testes) — avança o relógio falso do `node:test` até
// uma promessa concluir, sem esperar tempo real. Serve a qualquer caso que exercite
// um caminho com `await new Promise((r) => setTimeout(r, ...))` no meio (hoje: a
// espera de 3s/6s entre as tentativas de `sendMailWithRetry`, em `emailer.js:209`).
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
// mantém a SUA cópia local desta função de propósito. Os arquivos de teste das ondas
// 1-7 não são editados nesta rodada de gap closure — editá-los tiraria deles o papel
// de oráculo estável enquanto o código de produção muda. A deduplicação (fazer aquele
// arquivo passar a importar daqui) fica registrada como trabalho futuro.
const { mock } = require('node:test');

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

module.exports = { avancarRelogioAte };
