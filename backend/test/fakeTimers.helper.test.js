// Meta-teste de WR2-03 — o objeto sob teste aqui é o PRÓPRIO helper de teste
// (`avancarRelogioAte`, em `test/helpers/fakeTimers.js`), não código de produção.
//
// Por que um helper merece teste próprio: ele é o instrumento que dirige os arquivos que
// provam REL-05 (status do notification_log) e REL-06 (fail-safe da consulta de tarefas), e
// um instrumento que atribui a falha ao caso ERRADO corrói a confiança em toda a rede de
// segurança — o dano não fica contido no caso que ele quebra.
//
// O defeito medido: a promessa derivada interna do helper era criada com um `then` de UM
// argumento, isto é, SEM handler de rejeição. Quando a promessa observada rejeita, a flag
// interna nunca vira verdadeira, o laço estoura o limite de iterações, o helper lança a sua
// mensagem genérica e a promessa derivada aflora como rejeição não tratada. Como o `node:test`
// credita uma rejeição não tratada ao caso que estiver correndo no momento, ela pode reprovar
// um caso VIZINHO com a mensagem de outro caso.
require('./setup');

const { test, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { avancarRelogioAte } = require('./helpers/fakeTimers');

// ── Relógio falso ─────────────────────────────────────────────────────────────
// Mesmo padrão de `agendor.retry429.test.js`: `reset()` ANTES de `enable()`, porque
// `enable()` lança se os temporizadores já estiverem habilitados — e cada caso deste arquivo
// deixa o relógio adiantado para o seguinte (é o próprio helper que o avança).
//
// Só `setTimeout` é mockado: nenhum caso daqui lê o relógio de parede, e deixar `Date` real
// mantém o escopo do mock no mínimo necessário para exercitar o laço.
beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['setTimeout'] });
});

after(() => {
  mock.timers.reset();
});

// ── Fábrica local de promessas dirigidas por temporizador ─────────────────────
// Toda promessa começa por uma espera de 3s. É essa espera que OBRIGA o helper a avançar o
// relógio: sem ela a promessa assentaria na primeira cessão do event loop e o laço — o trecho
// que este arquivo mede — nunca seria exercitado.
async function esperaEntaoRejeita() {
  await new Promise((r) => setTimeout(r, 3000));
  throw new Error('ERRO REAL DO SUT');
}

async function esperaEntaoResolve(valor) {
  await new Promise((r) => setTimeout(r, 3000));
  return valor;
}

function nuncaAssenta() {
  return new Promise(() => {});
}

// ── Caso 1 — o erro real do SUT chega ao chamador ─────────────────────────────
// Antes da correção este caso falha DUAS vezes: a mensagem que chega ao `assert.rejects` é a
// genérica do helper (e não `ERRO REAL DO SUT`), e além disso o ARQUIVO INTEIRO é marcado com
// `failureType: 'unhandledRejection'` — a rejeição órfã da promessa derivada. É essa segunda
// falha que torna WR2-03 mais grave do que o débito registrado no 04-10 dizia.
test('(1) uma promessa que REJEITA sob relógio falso relança o erro REAL do SUT', async () => {
  await assert.rejects(
    () => avancarRelogioAte(esperaEntaoRejeita()),
    /ERRO REAL DO SUT/,
    'o erro do SUT não pode ser substituído pela mensagem genérica do helper: é ele que o assert.rejects do arquivo consumidor está medindo',
  );
});

// ── Caso 2 — não-regressão do caminho de sucesso ──────────────────────────────
// Este caso já passa antes da correção e existe para provar que ela não move o ÚNICO ramo que
// os consumidores atuais do helper exercitam hoje.
test('(2) uma promessa que RESOLVE sob relógio falso devolve exatamente o valor', async () => {
  const valor = await avancarRelogioAte(esperaEntaoResolve('valor do SUT'));

  assert.equal(valor, 'valor do SUT');
});

// ── Caso 3 — a falha explícita continua explícita ─────────────────────────────
// Guarda-corpo do desvio deliberado deste plano em relação ao snippet do code review: a ordem
// das instruções dentro do helper não pode fazer a suíte TRAVAR em vez de falhar. Um teste que
// trava não dá diagnóstico nenhum — e, num runner sequencial, leva junto todos os que viriam
// depois dele.
test('(3) uma promessa que NUNCA conclui falha com mensagem explícita, sem travar a suíte', async () => {
  await assert.rejects(
    () => avancarRelogioAte(nuncaAssenta()),
    /não concluiu após avançar o relógio falso/,
    'sem conclusão, o helper precisa falhar de forma legível em vez de deixar a execução pendurada',
  );
});
