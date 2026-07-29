// Caracterização (golden) da supressão de notificação por funil:
// shouldNotifyOwner / NO_OWNER_NOTIFY_FUNNELS = ['beefor'] (agendor.js).
// Estes testes DOCUMENTAM O COMPORTAMENTO ATUAL (inclusive quirks), não o ideal.
//
// A supressão é um match EXATO via trim().toLowerCase() + Array.includes():
// só o funil que, após trim+lowercase, for exatamente 'beefor' é suprimido.
// Nomes próximos ('beefor vendas', 'beeforx') NÃO são suprimidos. Se um rename
// de funil ou um novo funil semelhante mudar quem é notificado, este golden
// falha de propósito — a mudança passa a ser uma decisão consciente e coberta
// por teste (TEST-04 / D-04 / D-09; RESEARCH Pitfall 6).
require('./setup');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shouldNotifyOwner } = require('../src/agendor');

test("shouldNotifyOwner: SUPRIME 'beefor' exato — não notifica o responsável", () => {
  assert.equal(shouldNotifyOwner({ funnel: 'beefor' }), false);
});

test("shouldNotifyOwner: SUPRIME 'Beefor' (case-insensitive via toLowerCase)", () => {
  assert.equal(shouldNotifyOwner({ funnel: 'Beefor' }), false);
});

test("shouldNotifyOwner: SUPRIME ' beefor ' (com espaços, via trim)", () => {
  assert.equal(shouldNotifyOwner({ funnel: ' beefor ' }), false);
});

test("shouldNotifyOwner: QUIRK 'beefor vendas' NÃO é suprimido — comportamento ATUAL", () => {
  // Match é EXATO (includes() contra o array, não substring). Um funil renomeado
  // para conter 'beefor' como prefixo NÃO seria suprimido — se isso for indesejado
  // um dia, este golden falha e força uma decisão consciente.
  assert.equal(shouldNotifyOwner({ funnel: 'beefor vendas' }), true);
});

test("shouldNotifyOwner: QUIRK 'beeforx' NÃO é suprimido — comportamento ATUAL", () => {
  // 'beeforx' !== 'beefor' após trim/lowercase, então notifica normalmente.
  assert.equal(shouldNotifyOwner({ funnel: 'beeforx' }), true);
});

test('shouldNotifyOwner: funil null/ausente NÃO suprime — notifica o responsável', () => {
  assert.equal(shouldNotifyOwner({ funnel: null }), true);
  assert.equal(shouldNotifyOwner({}), true);
});
