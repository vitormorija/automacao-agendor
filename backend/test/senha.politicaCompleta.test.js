require('./setup');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, tokenFor } = require('./helpers/httpServer');
const auth = require('../src/routes/auth');

// A política de tamanho de senha, medida nos QUATRO caminhos que gravam senha.
//
// A correção anterior cobriu dois — redefinição por link e troca pelo usuário logado — e
// deixou os outros dois de pé, o que tornava a política decorativa: bastava um administrador
// criar a conta com senha de um caractere para contornar as duas portas fechadas, e a conta
// nascia com o mesmo acesso de qualquer outra. É o mesmo padrão que já tinha aparecido uma
// vez neste projeto: o conserto seguinte estava sempre no vizinho do conserto anterior.

const MIN_SENHA = auth.MIN_SENHA;
const FONTE = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'auth.js'),
  'utf8',
);

test('os QUATRO caminhos que gravam senha usam o mesmo piso', () => {
  // Inventário por construção, e não por lista escrita à mão: qualquer `bcrypt.hash` novo
  // sobre uma senha vinda de fora precisa aparecer aqui e ser conferido.
  const guardas = (FONTE.match(/\.length < MIN_SENHA/g) || []).length;
  assert.equal(
    guardas,
    4,
    `esperava 4 guardas de tamanho (reset, troca, criação e seed) — encontrei ${guardas}`,
  );

  // E nenhum piso solto pode ter sobrevivido em número cru.
  assert.doesNotMatch(FONTE, /\.length < (6|8|10)\b/);
});

test('criação de usuário pelo admin recusa senha curta', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const ADMIN = 'chefe@example.invalid';
  process.env.ADMIN_USERS = ADMIN;

  const res = await srv.request('/api/auth/users', {
    method: 'POST',
    token: tokenFor(ADMIN),
    body: {
      username: 'novo@example.invalid',
      password: 'a'.repeat(MIN_SENHA - 1),
    },
  });

  assert.equal(
    res.status,
    400,
    'o admin conseguiu criar conta com senha curta',
  );
  assert.match(res.body.message, new RegExp(`${MIN_SENHA} caracteres`));
});

test('o seed do admin inicial recusa senha curta em vez de criar fraco', () => {
  // Esta é a conta mais sensível do sistema — nasce administradora. Recusar é o desfecho
  // certo: um boot sem admin é um problema VISÍVEL, que o operador conserta em um minuto;
  // um admin com senha curta é um problema invisível, que fica.
  const trecho = FONTE.slice(
    FONTE.indexOf('async function ensureDefaultUsers'),
    FONTE.indexOf('ensureDefaultUsers();'),
  );
  assert.match(trecho, /seedPassword\.length < MIN_SENHA/);
  assert.match(
    trecho,
    /return;/,
    'o seed precisa ABORTAR, e não seguir criando a conta',
  );
});

test('o piso do JWT_SECRET atende os 32 bytes exigidos', () => {
  const fonteSecret = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'secret.js'),
    'utf8',
  );

  // 64 caracteres hexadecimais = 32 bytes = o que o parecer de segurança pediu, e
  // exatamente o que `openssl rand -hex 32` produz — o mesmo comando que .env.example manda
  // usar. A regra e a instrução precisam continuar dizendo a mesma coisa.
  assert.match(fonteSecret, /MIN_SEGREDO = 64/);
  assert.doesNotMatch(
    fonteSecret,
    /length < 16/,
    'o piso antigo de 16 caracteres não pode sobreviver',
  );

  const exemplo = fs.readFileSync(
    path.join(__dirname, '..', '.env.example'),
    'utf8',
  );
  assert.match(
    exemplo,
    /openssl rand -hex 32/,
    '.env.example precisa ensinar a gerar um segredo do tamanho que o código exige',
  );
});
