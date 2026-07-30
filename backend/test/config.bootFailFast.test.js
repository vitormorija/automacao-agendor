// CFG-04: o fail-fast de configuração LIGADO ao boot (D-04/D-05, Pitfall 2).
//
// O 03-01 entregou a regra em `src/config.js` e a cobriu como função pura. O que este
// arquivo prova é a outra metade — que o boot REALMENTE executa essa regra, e no lugar
// certo da ordem de carregamento:
//
//   1. NODE_ENV=production sem obrigatória  → o processo NÃO sobe (saída != 0).
//   2. NODE_ENV=production com as 5 presentes → o processo sobe.
//   3. desenvolvimento (ou NODE_ENV ausente) sem obrigatória → sobe, com aviso (D-05).
//   4. a mensagem NOMEIA as faltantes e nunca ecoa VALOR nenhum (ASVS V7 / T-03-01).
//
// Por que subprocesso: `src/index.js` abre um listener HTTP e agenda cron no require —
// exercitá-lo dentro da suíte deixaria porta e timer vivos. Cada caso aqui roda num
// processo filho de vida curta, com ambiente CONSTRUÍDO À MÃO (nunca `...process.env`),
// então nenhuma credencial real do shell ou do CI entra na medição.
//
// Todos os valores usados são descartáveis e óbvios ("dummy-*"): o backend/.env real
// não é lido nem consultado por nenhum caso deste arquivo.
require('./setup');

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const BACKEND_DIR = path.join(__dirname, '..');
const FONTE_INDEX = fs.readFileSync(
  path.join(BACKEND_DIR, 'src', 'index.js'),
  'utf8',
);

// Valores de mentira, deliberadamente legíveis e de baixa entropia: eles vão para
// dentro de um arquivo versionado e o job `secrets` (gitleaks) roda em todo PR.
const DUMMY = {
  AGENDOR_TOKEN: 'dummy-agendor-token',
  JWT_SECRET: 'dummy-jwt-secret-de-teste',
  SMTP_PASS: 'dummy-smtp-pass',
  ALLOWED_ORIGINS: 'http://localhost:5173',
  ADMIN_USERS: 'ops@example.invalid',
};

const temporarios = [];

after(() => {
  for (const alvo of temporarios) {
    try {
      fs.rmSync(alvo, { recursive: true, force: true });
    } catch (_) {
      /* já removido — ignorado de propósito */
    }
  }
});

// Roda `require('./src/config')` num processo filho isolado. `env` é o ambiente
// COMPLETO do filho — o que não estiver aqui não existe lá dentro.
function bootConfig(env) {
  return spawnSync(process.execPath, ['-e', "require('./src/config')"], {
    cwd: BACKEND_DIR,
    env,
    encoding: 'utf8',
    timeout: 20000,
  });
}

// ── 1. Produção sem obrigatória: o boot é IMPEDIDO ───────────────

test('produção sem as obrigatórias: o processo morre no carregamento do config', () => {
  const r = bootConfig({ NODE_ENV: 'production' });

  assert.notEqual(r.status, 0, 'o boot em produção precisa falhar');
  assert.match(r.stderr, /Configuração incompleta/);
  // Nada foi impresso na saída padrão: o processo morreu antes de qualquer trabalho.
  assert.equal(r.stdout, '');
});

test('produção: a falha nomeia TODAS as 5 obrigatórias de uma vez (D-04)', () => {
  const r = bootConfig({ NODE_ENV: 'production' });

  for (const nome of Object.keys(DUMMY)) {
    assert.match(
      r.stderr,
      new RegExp(nome),
      `a mensagem de boot precisa nomear ${nome}`,
    );
  }
});

// ── 2. Produção com as 5 presentes: o boot é PERMITIDO ───────────

test('produção com as 5 obrigatórias presentes: o processo sobe', () => {
  const r = bootConfig({ NODE_ENV: 'production', ...DUMMY });

  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
});

test('produção: uma obrigatória VAZIA vale como ausente', () => {
  // `SMTP_PASS=` no .env é tão inútil quanto a linha faltando — e é um erro de
  // deploy bem mais comum do que esquecer a variável inteira.
  const r = bootConfig({ NODE_ENV: 'production', ...DUMMY, SMTP_PASS: '   ' });

  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /SMTP_PASS/);
});

// ── 3. Desenvolvimento sem obrigatória: sobe com aviso (D-05) ────

for (const cenario of [
  { nome: 'NODE_ENV=development', env: { NODE_ENV: 'development' } },
  { nome: 'NODE_ENV ausente', env: {} },
]) {
  test(`${cenario.nome} sem as obrigatórias: o processo continua, só avisando`, () => {
    const r = bootConfig(cenario.env);

    assert.equal(r.status, 0, 'fora de produção o boot não pode ser impedido');
    assert.match(r.stderr, /\[Config\]/, 'o aviso precisa sair no log');
    assert.match(r.stderr, /Configuração incompleta/);
  });
}

// ── 4. A mensagem nomeia, mas nunca ecoa valores ─────────────────

test('a mensagem de erro não ecoa o VALOR de nenhuma variável (ASVS V7)', () => {
  // Quatro das cinco definidas: se a mensagem imprimisse valores, os quatro
  // presentes (ou o rótulo da faltante) apareceriam no stderr.
  const { ADMIN_USERS, ...quatroPresentes } = DUMMY;
  const r = bootConfig({ NODE_ENV: 'production', ...quatroPresentes });

  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /ADMIN_USERS/, 'a faltante precisa ser nomeada');

  for (const [nome, valor] of Object.entries(quatroPresentes)) {
    assert.doesNotMatch(
      r.stderr,
      new RegExp(valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `o valor de ${nome} vazou na mensagem de boot`,
    );
  }
  // E o segredo ausente não é "revelado" por um valor de exemplo qualquer.
  assert.doesNotMatch(r.stderr, new RegExp(ADMIN_USERS));
});

// ── 5. O boot REAL executa a validação, e antes do SQLite ────────

test('index.js: boot em produção sem obrigatórias falha com a mensagem do config, não com a do secret.js', () => {
  const dbTemp = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'agendor-boot-')),
    'nao-deve-existir.db',
  );
  temporarios.push(path.dirname(dbTemp));

  // As 5 são definidas VAZIAS de propósito: o dotenv não sobrescreve chave já
  // presente em process.env, então o backend/.env real não interfere no resultado —
  // o caso é determinístico independentemente do que exista na máquina.
  const vazias = Object.fromEntries(Object.keys(DUMMY).map((k) => [k, '']));
  const r = spawnSync(process.execPath, ['src/index.js'], {
    cwd: BACKEND_DIR,
    env: { ...vazias, NODE_ENV: 'production', DB_PATH: dbTemp, PORT: '0' },
    encoding: 'utf8',
    timeout: 20000,
    killSignal: 'SIGKILL', // nenhum listener/cron sobrevive a este teste
  });

  assert.notEqual(r.status, 0, 'o boot em produção precisa ser impedido');

  // Discriminante: sem `require('./config')` ligado, quem estouraria seria o
  // secret.js — com uma mensagem que fala SÓ do JWT. Só a validação central
  // menciona ALLOWED_ORIGINS e ADMIN_USERS.
  assert.match(r.stderr, /Configuração incompleta/);
  assert.match(r.stderr, /ALLOWED_ORIGINS/);
  assert.match(r.stderr, /ADMIN_USERS/);

  // Pitfall 2 / T-03-07: morrer ANTES de db.js abrir e semear o SQLite.
  assert.equal(
    fs.existsSync(dbTemp),
    false,
    'um boot que falhou não pode ter criado o banco',
  );
});

// ── 6. A ordem de carregamento no index.js ───────────────────────

test('index.js: require(./config) vem logo após o dotenv, sem nada executável entre eles', () => {
  const linhas = FONTE_INDEX.split('\n');
  const acha = (re) => linhas.findIndex((l) => re.test(l));

  const iDotenv = acha(/require\('dotenv'\)\.config\(/);
  const iConfig = acha(/require\('\.\/config'\)/);

  assert.notEqual(iDotenv, -1, 'index.js precisa carregar o dotenv');
  assert.notEqual(iConfig, -1, "index.js precisa requerer './config' (CFG-04)");
  assert.ok(
    iConfig > iDotenv,
    'validar antes do dotenv leria um process.env ainda vazio',
  );

  // O plano pede "linha 2", número escrito antes de o 03-01 inserir o comentário do
  // dotenv. A intenção — nada roda entre carregar o .env e validá-lo — é o que se
  // afirma aqui, e sobrevive a comentários novos.
  const entre = linhas.slice(iDotenv + 1, iConfig);
  for (const linha of entre) {
    const t = linha.trim();
    assert.ok(
      t === '' || t.startsWith('//'),
      `só comentários podem separar o dotenv da validação — encontrado: ${t}`,
    );
  }
});

test('index.js: a validação vem antes de QUALQUER outro módulo local', () => {
  const linhas = FONTE_INDEX.split('\n');
  const iConfig = linhas.findIndex((l) => /require\('\.\/config'\)/.test(l));

  // `./middleware/auth` puxa secret.js; `./routes/auth` puxa db.js, que abre e
  // semeia o SQLite no load (Pitfall 2). Nenhum deles pode vir antes.
  const iPrimeiroLocal = linhas.findIndex(
    (l) => /require\('\.\//.test(l) && !/require\('\.\/config'\)/.test(l),
  );

  assert.notEqual(iConfig, -1, "index.js precisa requerer './config' (CFG-04)");
  assert.notEqual(iPrimeiroLocal, -1);
  assert.ok(
    iConfig < iPrimeiroLocal,
    `require('./config') precisa preceder o primeiro módulo local (linha ${iPrimeiroLocal + 1}: ${linhas[iPrimeiroLocal].trim()})`,
  );
});

test('secret.js segue existindo: ele valida o comprimento mínimo, coisa que o config.js não faz', () => {
  const fonteSecret = fs.readFileSync(
    path.join(BACKEND_DIR, 'src', 'secret.js'),
    'utf8',
  );
  assert.match(fonteSecret, /16/);

  // Prova de que os dois papéis são distintos: um JWT_SECRET curto passa pelo
  // config.js (que só exige presença) e é o secret.js quem barra.
  const curto = crypto.randomBytes(3).toString('hex'); // 6 caracteres
  const r = bootConfig({ NODE_ENV: 'production', ...DUMMY, JWT_SECRET: curto });
  assert.equal(r.status, 0, 'config.js não valida comprimento — por desenho');
});
