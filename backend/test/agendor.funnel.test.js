// Oráculo da supressão de notificação por funil:
// shouldNotifyOwner / NO_OWNER_NOTIFY_FUNNELS = ['beefor'] (agendor.js).
//
// CONTRATO (in3-08, MODO 2 — decisão do usuário de 2026-08-05): a comparação é por
// SUBSTRING sobre o nome normalizado (trim + toLowerCase). Um funil renomeado no CRM
// para conter o termo — 'Beefor Comercial', 'Beefor 2026' — CONTINUA suprimido. Até
// esta decisão a comparação era por igualdade exata, e portanto bastava alguém
// renomear o funil no Agendor para reabilitar, em silêncio, a notificação que a regra
// de negócio manda suprimir. Não dependia de falha nenhuma.
//
// A consequência de a comparação ser por substring e não por limite de palavra
// (D-IN3-08-a): 'beeforx' TAMBÉM passa a ser suprimido. O usuário viu essa
// consequência explicitamente e escolheu assim — ver o caso 5 abaixo.
//
// FUNIL AUSENTE CONTINUA NOTIFICANDO, de propósito (D-IN3-08-c / D-IN3-08-d): é
// fail-open deliberado, não descuido — ver o caso 8. O que a mesma decisão acrescentou
// foi OBSERVABILIDADE (contagem e aviso agregado), nunca uma mudança de destinatário.
//
// A irmã isExcludedStage, no mesmo módulo, já comparava por correspondência parcial
// pelo mesmo motivo — filtro de elegibilidade sobre texto livre do CRM. O funil era a
// exceção, não a regra.
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

test("shouldNotifyOwner: SUPRIME 'beefor vendas' — a comparação é por substring", () => {
  // Este caso pinava o comportamento ANTERIOR (comparação exata, notificava) e foi
  // INVERTIDO por D-IN3-08-b. Reescrever um caso que dizia "comportamento ATUAL" é
  // justamente o sinal de que a decisão foi tomada: mudança deliberada de
  // comportamento, com teste cobrindo o comportamento novo.
  assert.equal(shouldNotifyOwner({ funnel: 'beefor vendas' }), false);
});

test("shouldNotifyOwner: SUPRIME 'beeforx' — consequência VISTA e ESCOLHIDA da substring", () => {
  // Não é descuido. O usuário viu explicitamente, em 2026-08-05, que a comparação por
  // substring alcança nomes que apenas CONTÊM o termo, e escolheu assim mesmo
  // (D-IN3-08-a): o CRM é interno e os nomes de funil são criados por administradores
  // da própria Cadmus, então o conjunto suprimido a mais é conhecido e pequeno.
  // Quem "consertar" isto com limite de palavra ou com lista de exceções está
  // DESFAZENDO uma decisão, não corrigindo um lapso — e deixa este caso vermelho,
  // que é exatamente a função dele.
  assert.equal(shouldNotifyOwner({ funnel: 'beeforx' }), false);
});

test("shouldNotifyOwner: SUPRIME 'Beefor Comercial' — a renomeação real que motivou a correção", () => {
  // O modo de falha que não dependia de erro nenhum: bastava renomear o funil no
  // Agendor para a comparação exata deixar de casar e o responsável voltar a receber
  // cobrança de um negócio que a regra manda suprimir.
  assert.equal(shouldNotifyOwner({ funnel: 'Beefor Comercial' }), false);
});

test("shouldNotifyOwner: NOTIFICA 'Comercial' — testemunha de que a supressão não é larga demais", () => {
  // Caso obrigatório. Com os dois ex-quirks invertidos, os únicos `true` restantes
  // seriam os de funil ausente, e uma implementação que devolvesse `false` sempre
  // passaria em 7 dos 8 casos deste arquivo. 'Comercial' não é um valor inventado: é
  // o funil do molde 101 e o da maioria das fixtures da suíte.
  assert.equal(shouldNotifyOwner({ funnel: 'Comercial' }), true);
});

test('shouldNotifyOwner: funil null/ausente NÃO suprime — notifica o responsável', () => {
  // FAIL-OPEN DELIBERADO (D-IN3-08-c). A string vazia da normalização não contém
  // nenhum termo da lista, então o fail-open é preservado POR CONSTRUÇÃO e não por
  // acidente. A razão medida: 15 de 15 negócios das fixtures do repositório trazem a
  // estrutura de funil, ou seja, funil ausente é caminho de EXCEÇÃO e não caso comum.
  // Um fail-safe uniforme aqui faria "não sei o funil" virar o estado padrão de
  // qualquer payload que mudasse de forma, reintroduzindo a supressão em massa
  // invisível que o plano 04-28 acabou de fechar.
  // O que a decisão acrescentou não foi supressão: foi SINAL — o campo funilAusente
  // por negócio, o aviso agregado de getStaleDeals e o contador da rodada em runCheck.
  assert.equal(shouldNotifyOwner({ funnel: null }), true);
  assert.equal(shouldNotifyOwner({}), true);
});
