require('./setup');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startServer } = require('./helpers/httpServer');
const auth = require('../src/routes/auth');
const db = require('../src/db');

// Fluxo de recuperação de senha, ponta a ponta, por HTTP.
//
// Ele nunca teve cobertura — e o preço disso foi ele estar QUEBRADO sem ninguém notar: as
// duas rotas exigiam autenticação, que é exatamente o que falta a quem esqueceu a senha.
// Os casos abaixo cobrem as três mudanças desta etapa (token gravado como hash, piso de
// senha, cota de envio) e, antes de todas, a que as torna alcançáveis: a rota responde.

const MIN_SENHA = auth.MIN_SENHA;
const MAX_RECUPERACOES = auth.MAX_RECUPERACOES;

// Cada caso usa um IP próprio: a cota é por IP e o Map vive no processo, então reaproveitar
// o mesmo endereço faria um caso bloquear o seguinte.
//
// O X-Forwarded-For só chega a `req.ip` porque app.js declara `trust proxy: 'loopback'` e a
// suíte conecta de 127.0.0.1. Sem essa configuração o cabeçalho seria ignorado, TODOS os
// casos compartilhariam o IP do socket, e estes testes passariam por coincidência — é
// exatamente o que acontecia em produção antes, com o nginx no lugar da suíte.
let contadorDeIp = 0;
function novoIp() {
  contadorDeIp += 1;
  return `10.9.0.${contadorDeIp}`;
}

test('o pedido de redefinição responde sem credencial', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  auth._recuperacaoAttempts.clear();

  const res = await srv.request('/api/auth/forgot-password', {
    method: 'POST',
    body: { username: 'ninguem@example.invalid' },
    headers: { 'X-Forwarded-For': novoIp() },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  // A resposta é a mesma para conta existente e inexistente — não pode virar oráculo de
  // enumeração de usuários. Este comportamento já existia e não pode regredir.
  assert.match(res.body.message, /Se este e-mail estiver cadastrado/);
});

test('o token do link NÃO é gravado no banco', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const tokenCru = crypto.randomBytes(32).toString('hex');
  db.saveResetToken(
    'alguem@example.invalid',
    tokenCru,
    new Date(Date.now() + 3600_000).toISOString(),
  );

  // O que a busca por token cru encontra continua sendo a linha certa...
  const encontrado = db.getResetToken(tokenCru);
  assert.ok(
    encontrado,
    'o token do link precisa continuar resolvendo para a linha',
  );
  assert.equal(encontrado.username, 'alguem@example.invalid');

  // ...mas o valor GRAVADO é outro. É esta a diferença que impede um backup do .db de
  // entregar links de redefinição prontos para uso.
  assert.notEqual(
    encontrado.token,
    tokenCru,
    'a coluna guardou o token do link em claro',
  );
  assert.equal(
    encontrado.token,
    crypto.createHash('sha256').update(tokenCru).digest('hex'),
  );
});

test('senha curta é recusada nos DOIS caminhos que gravam senha', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const curta = 'a'.repeat(MIN_SENHA - 1);

  const reset = await srv.request('/api/auth/reset-password', {
    method: 'POST',
    body: { token: 'irrelevante', newPassword: curta },
  });
  assert.equal(reset.status, 400);
  assert.match(reset.body.message, new RegExp(`${MIN_SENHA} caracteres`));

  // O irmão: change-password é o outro ponto que grava senha nova. Deixá-lo em 6 tornaria
  // o piso do reset decorativo — bastaria entrar e trocar por uma senha curta.
  const troca = await srv.request('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword: 'seja-la-qual-for', newPassword: curta },
    headers: { Authorization: 'Bearer token-invalido' },
  });
  // 401 (sessão) viria ANTES do 400 (tamanho); o que importa aqui é que não passe.
  assert.notEqual(troca.status, 200);
  const fonte = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'src', 'routes', 'auth.js'),
    'utf8',
  );
  assert.equal(
    (fonte.match(/newPassword\.length < MIN_SENHA/g) || []).length,
    2,
    'os dois caminhos que gravam senha precisam usar o mesmo piso',
  );
  assert.doesNotMatch(
    fonte,
    /newPassword\.length < 6/,
    'o piso antigo de 6 caracteres não pode sobreviver em nenhum dos caminhos',
  );
});

test('o pedido de redefinição tem cota por IP', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  auth._recuperacaoAttempts.clear();

  const ip = novoIp();
  const pedir = () =>
    srv.request('/api/auth/forgot-password', {
      method: 'POST',
      body: { username: 'ninguem@example.invalid' },
      headers: { 'X-Forwarded-For': ip },
    });

  for (let i = 0; i < MAX_RECUPERACOES; i++) {
    const r = await pedir();
    assert.equal(r.status, 200, `pedido ${i + 1} deveria passar`);
  }

  const bloqueado = await pedir();
  assert.equal(
    bloqueado.status,
    429,
    `o pedido ${MAX_RECUPERACOES + 1} deveria ser recusado por cota`,
  );
});

// A prova de que a cota discrimina o cliente, e não o proxy. Sem `trust proxy` este caso
// falha: os dois IPs colapsam no endereço do socket e o segundo já nasce bloqueado.
test('a cota é por cliente, e não pelo IP do proxy', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  auth._recuperacaoAttempts.clear();

  const esgotado = novoIp();
  const outro = novoIp();
  const pedir = (ip) =>
    srv.request('/api/auth/forgot-password', {
      method: 'POST',
      body: { username: 'ninguem@example.invalid' },
      headers: { 'X-Forwarded-For': ip },
    });

  for (let i = 0; i <= MAX_RECUPERACOES; i++) await pedir(esgotado);
  assert.equal(
    (await pedir(esgotado)).status,
    429,
    'o primeiro IP deve estar bloqueado',
  );
  assert.equal(
    (await pedir(outro)).status,
    200,
    'um cliente diferente não pode herdar o bloqueio de outro',
  );
});

test('a cota de recuperação é SEPARADA da cota de login', () => {
  // Baldes compartilhados fariam uma rajada de "esqueci minha senha" bloquear o login do
  // mesmo IP, e cinco senhas erradas consumirem a cota de envio de e-mail.
  assert.notEqual(
    auth._loginAttempts,
    auth._recuperacaoAttempts,
    'login e recuperação não podem dividir o mesmo contador',
  );
});
