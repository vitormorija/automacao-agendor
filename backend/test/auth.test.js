// Caracterização (golden) da lógica de segurança do auth.js:
//   - rate limiting de login (bloqueio por IP após 5 tentativas, 15 min)
//   - verificação de senha (bcrypt + texto puro legado)
// Estes testes DOCUMENTAM O COMPORTAMENTO ATUAL (TEST-05), não o ideal. Servem de
// rede de segurança para que o hardening futuro (Phase 6 SEC-01/SEC-04) não possa
// enfraquecer o brute-force blocking nem o caminho de comparação de senha sem que
// a mudança seja consciente e coberta por um novo teste.

// setup PRIMEIRO: preseta JWT_SECRET/DB_PATH(:memory:)/AGENDOR_TOKEN antes de
// requerer auth.js, cujo import roda ensureDefaultUsers() (DB) e exige secret.js.
// Sem isso o require lançaria ou tocaria o backend/agendor.db de produção.
require('./setup');

const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

// auth.js exporta o router (function) com os seams anexados como props.
const auth = require('../src/routes/auth');
const { checkRateLimit, recordFailedAttempt, clearAttempts, verifyPassword } =
  auth;

// Zera o Map em memória entre casos para isolar o estado de rate-limit por teste.
beforeEach(() => {
  auth._loginAttempts.clear();
});

// ── Rate limiting ────────────────────────────────────────────────

test('rate-limit: as 4 primeiras falhas NÃO bloqueiam; a 5ª bloqueia', () => {
  const ip = '10.0.0.1';
  // Documenta o comportamento ATUAL: MAX_ATTEMPTS = 5.
  for (let i = 0; i < 4; i++) {
    const r = recordFailedAttempt(ip);
    assert.equal(r.nowBlocked, false);
    assert.equal(r.remaining, 5 - (i + 1));
  }
  const fifth = recordFailedAttempt(ip);
  assert.equal(fifth.nowBlocked, true);
});

test('rate-limit: após o bloqueio, checkRateLimit reporta blocked com minutesLeft', () => {
  const ip = '10.0.0.2';
  for (let i = 0; i < 5; i++) recordFailedAttempt(ip);
  const check = checkRateLimit(ip);
  assert.equal(check.blocked, true);
  // Janela de bloqueio ATUAL = 15 min; minutesLeft é arredondado pra cima.
  assert.ok(check.minutesLeft >= 1 && check.minutesLeft <= 15);
});

test('rate-limit: passada a janela de 15 min, checkRateLimit reporta not blocked', () => {
  const ip = '10.0.0.3';
  mock.timers.enable({ apis: ['Date'] });
  try {
    for (let i = 0; i < 5; i++) recordFailedAttempt(ip);
    assert.equal(checkRateLimit(ip).blocked, true);
    // Avança além da janela (15 min + 1 ms): a entrada expira e libera o IP.
    mock.timers.tick(15 * 60 * 1000 + 1);
    assert.equal(checkRateLimit(ip).blocked, false);
  } finally {
    mock.timers.reset();
  }
});

test('rate-limit: clearAttempts(ip) libera o IP imediatamente', () => {
  const ip = '10.0.0.4';
  for (let i = 0; i < 5; i++) recordFailedAttempt(ip);
  assert.equal(checkRateLimit(ip).blocked, true);
  clearAttempts(ip);
  assert.equal(checkRateLimit(ip).blocked, false);
});

// ── Verificação de senha ─────────────────────────────────────────

test('verifyPassword: hash bcrypt confere/não confere', async () => {
  // Gera um hash bcrypt real em-teste (bcryptjs instalado).
  const hash = await bcrypt.hash('senha-correta', 10);
  assert.equal(hash.startsWith('$2'), true); // caminho bcrypt
  assert.equal(await verifyPassword(hash, 'senha-correta'), true);
  assert.equal(await verifyPassword(hash, 'senha-errada'), false);
});

test('verifyPassword: texto puro legado confere/não confere (discriminador $2)', async () => {
  // Documenta o comportamento ATUAL: sem prefixo '$2', a comparação é por
  // igualdade estrita de texto puro (senhas legadas ainda não migradas).
  assert.equal(await verifyPassword('plainpw', 'plainpw'), true);
  assert.equal(await verifyPassword('plainpw', 'nope'), false);
});
