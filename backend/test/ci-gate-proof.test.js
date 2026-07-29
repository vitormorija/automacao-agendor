// ARQUIVO TEMPORÁRIO — prova do gate de CI (CI-02 / D-11).
// Falha proposital para comprovar que um PR vermelho fica com o merge BLOQUEADO.
// Este arquivo NÃO deve ser mesclado: o PR de prova é fechado e a branch descartada.
const test = require('node:test');
const assert = require('node:assert');

test('falha proposital para provar o gate de CI (CI-02)', () => {
  assert.equal(1, 2, 'falha intencional — prova de que o CI barra o merge');
});
