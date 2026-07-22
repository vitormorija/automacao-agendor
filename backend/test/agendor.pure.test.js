// Caracterização (golden) do "pure lane" de agendor.js: helpers puros sem mocks.
// Estes testes DOCUMENTAM O COMPORTAMENTO ATUAL (inclusive quirks), não o ideal.
// Qualquer alteração futura na lógica de exclusão por etapa ou na classificação
// Lead/Negócio deve falhar aqui antes de chegar em produção (TEST-02 / D-04).
require('./setup');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getDealType, isExcludedStage } = require('../src/agendor');

test('isExcludedStage: correspondência parcial (substring) — documenta comportamento ATUAL', () => {
  // "perd" casa "Perdida"
  assert.equal(isExcludedStage('Oportunidade Perdida'), true);
  // "ganh" casa "Ganho"
  assert.equal(isExcludedStage('Ganho'), true);
  // "congelad" casa "Congelado"
  assert.equal(isExcludedStage('Congelado'), true);
});

test('isExcludedStage: QUIRK "Perdão de contrato" é EXCLUÍDO — documenta comportamento ATUAL', () => {
  // "perd" casa "Perdão" mesmo sem relação com "perdido". Comportamento atual,
  // não necessariamente desejado — se um dia mudar, este golden falha de propósito.
  assert.equal(isExcludedStage('Perdão de contrato'), true);
});

test('isExcludedStage: etapas benignas e nulas NÃO são excluídas — comportamento ATUAL', () => {
  assert.equal(isExcludedStage('Negociação'), false);
  assert.equal(isExcludedStage(null), false);
  assert.equal(isExcludedStage(''), false);
});

test('getDealType: categorias de Cliente classificam como "Negócio" — comportamento ATUAL', () => {
  assert.equal(getDealType('Cliente'), 'Negócio');
  assert.equal(getDealType('Cliente Ouro'), 'Negócio');
  assert.equal(getDealType('Cliente Bronze'), 'Negócio');
});

test('getDealType: demais categorias (incl. null) classificam como "Lead" — comportamento ATUAL', () => {
  assert.equal(getDealType('Lead'), 'Lead');
  assert.equal(getDealType(null), 'Lead');
  assert.equal(getDealType('Concorrente'), 'Lead');
});
