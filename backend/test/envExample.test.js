// Meta-teste anti-drift do backend/.env.example (CFG-02, D-10/D-12).
//
// Este teste não exercita o código da aplicação: ele fixa o CONTRATO entre o que
// backend/src/ realmente lê de process.env e o que o .env.example documenta. Foi
// revisão manual que produziu o estado corrigido nesta fase — três variáveis lidas
// pelo código e ausentes do exemplo (DB_PATH, LOG_LEVEL, BASE_URL_FRONTEND) e uma
// variável fantasma documentada que nenhum código lê (STALE_DAYS, D-12). Revisão
// manual não escala; este arquivo transforma CFG-02 de conserto pontual em invariante
// verificada a cada commit, nas DUAS direções (faltando e sobrando).
require('./setup');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const EXAMPLE = path.join(__dirname, '..', '.env.example');

// Exceções ao teste inverso: variáveis que podem constar do .env.example sem serem
// lidas por src/. Deliberadamente VAZIA. STALE_DAYS era exatamente isso e mentia — o
// valor efetivo vem de getConfig('stale_days'), default literal em db.js, editável
// pela UI. Manter a lista vazia é a decisão de D-12; qualquer exceção futura tem de
// ser escrita aqui, com justificativa, e aparece no diff de quem a introduz.
const SOMENTE_DOCUMENTAIS = [];

// Percorre backend/src/ recursivamente devolvendo só os .js. Recursivo de propósito:
// routes/ e middleware/ também leem process.env, e foi um grep raso que deixou
// BASE_URL_FRONTEND (routes/auth.js) de fora do exemplo.
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

// Nomes lidos via process.env.X em qualquer .js sob src/.
function lidasNoCodigo() {
  const lidas = new Set();
  for (const file of walk(SRC)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) lidas.add(m[1]);
  }
  return lidas;
}

// Pares NOME → valor do .env.example, já sem o comentário de fim de linha. O corte
// exige espaço antes do '#' para não picar um valor que legitimamente o contenha.
function documentadasNoExemplo() {
  const pares = new Map();
  for (const linha of fs.readFileSync(EXAMPLE, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (m) pares.set(m[1], m[2].split(/\s+#/)[0].trim());
  }
  return pares;
}

test('.env.example documenta todas as process.env lidas em src/', () => {
  const documentadas = documentadasNoExemplo();
  const faltando = [...lidasNoCodigo()].filter((k) => !documentadas.has(k)).sort();
  assert.deepEqual(
    faltando,
    [],
    `Variáveis lidas em backend/src/ e ausentes do .env.example: ${faltando.join(', ')}`,
  );
});

test('.env.example não documenta variável que o código não lê (D-12)', () => {
  const lidas = lidasNoCodigo();
  const sobrando = [...documentadasNoExemplo().keys()]
    .filter((k) => !lidas.has(k) && !SOMENTE_DOCUMENTAIS.includes(k))
    .sort();
  assert.deepEqual(
    sobrando,
    [],
    `Variáveis no .env.example que nenhum código lê (remova, ou declare em SOMENTE_DOCUMENTAIS): ${sobrando.join(', ')}`,
  );
});

test('.env.example não contém placeholder com cara de segredo real (Pitfall 9)', () => {
  // O que caracteriza um segredo de verdade — e o que o gitleaks persegue — é uma
  // sequência LONGA E ININTERRUPTA de caracteres alfanuméricos: hex de `openssl rand`,
  // base64, chave de API. Um placeholder em português é longo mas quebrado por hífens
  // ("troque-por-um-segredo-forte-e-aleatorio" tem 39 caracteres e nenhuma corrida
  // maior que 9), por isso a corrida — e não o comprimento total — é o critério aqui.
  // Foi assim que o token real da Agendor entrou no .env.example em 13905d4.
  const suspeitos = [...documentadasNoExemplo().entries()]
    .filter(([, valor]) => /[A-Za-z0-9/+]{16,}/.test(valor))
    .map(([nome]) => nome)
    .sort();
  assert.deepEqual(
    suspeitos,
    [],
    `Placeholders de alta entropia (troque por um valor óbvio em português): ${suspeitos.join(', ')}`,
  );
});
