// Protege CFG-03/CFG-04 contra a regressão do Pitfall 1 — o único achado desta fase
// capaz de causar INDISPONIBILIDADE em produção.
//
// O mecanismo: `require('dotenv').config()` sem `path` resolve `process.cwd() + '/.env'`.
// O ecosystem.config.js do PM2 define `cwd: '/opt/agendor'` (raiz do repo), mas o arquivo
// mora em `/opt/agendor/backend/.env`. O dotenv não encontra, devolve `{ error: ENOENT }`
// e NÃO lança — ou seja, o boot "sobe bem" com o ambiente vazio. Ligar o fail-fast de D-04
// antes de corrigir isso derruba produção no próximo `pm2 restart` (D-13).
//
// Nenhum teste aqui toca o backend/.env real: os casos usam arquivos temporários e a opção
// `processEnv` do dotenv, que impede a escrita no process.env global (T-03-03).
require('./setup');

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

const temporarios = [];

function makeTmpDir(prefixo) {
  const dir = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      `agendor-${prefixo}-${crypto.randomBytes(4).toString('hex')}-`,
    ),
  );
  temporarios.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporarios) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {
      /* diretório já removido — ignorado de propósito */
    }
  }
});

// ── (a) O modo de falha é SILENCIOSO ─────────────────────────────

test('dotenv: caminho inexistente devolve error ENOENT e NÃO lança', () => {
  const inexistente = path.join(
    os.tmpdir(),
    `agendor-nao-existe-${crypto.randomBytes(6).toString('hex')}`,
    '.env',
  );

  // Se lançasse, o boot teria falhado alto e o Pitfall 1 nem existiria.
  const resultado = dotenv.config({ path: inexistente, processEnv: {} });

  assert.ok(resultado.error, 'o dotenv precisa reportar erro no retorno');
  assert.equal(resultado.error.code, 'ENOENT');
  // O silêncio medido (dotenv 16.6.1): além de não lançar, ele ainda devolve um
  // `parsed` vazio — quem não olhar o `.error` do retorno não percebe nada.
  assert.deepEqual(resultado.parsed, {});
});

// ── (b) Caminho absoluto torna o carregamento independente do cwd ─

test('dotenv: com path absoluto carrega mesmo com o cwd em outro diretório', () => {
  const dirComEnv = makeTmpDir('env');
  const envPath = path.join(dirComEnv, '.env');
  fs.writeFileSync(envPath, 'GSD_DOTENV_PROBE=ok\n');

  // Diretório de trabalho comprovadamente SEM .env — é o análogo de '/opt/agendor'
  // sob PM2, onde o carregamento por cwd falharia.
  const dirSemEnv = makeTmpDir('cwd');
  assert.equal(fs.existsSync(path.join(dirSemEnv, '.env')), false);

  const cwdOriginal = process.cwd();
  try {
    process.chdir(dirSemEnv);

    // Sanity check do mecanismo: sem `path`, o dotenv procuraria no cwd e falharia.
    const semPath = dotenv.config({ processEnv: {} });
    assert.equal(semPath.error?.code, 'ENOENT');

    // Com o caminho absoluto, carrega — independentemente do cwd.
    const destino = {};
    const comPath = dotenv.config({ path: envPath, processEnv: destino });

    assert.equal(comPath.error, undefined);
    assert.equal(destino.GSD_DOTENV_PROBE, 'ok');
    // `processEnv` isola: o process.env real permanece intocado (T-03-03).
    assert.equal(process.env.GSD_DOTENV_PROBE, undefined);
  } finally {
    process.chdir(cwdOriginal);
  }
});

// ── (c) A fonte do boot está corrigida ───────────────────────────

test('index.js: carrega o .env por caminho absoluto derivado de __dirname', () => {
  const fonte = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'index.js'),
    'utf8',
  );

  // O `path:` e o `__dirname` têm de estar dentro do MESMO objeto de opções —
  // por isso a classe negada é `[^}]` (e não `[^)]`: a chamada correta contém
  // um `require('path')` inline, cujo parêntese de fechamento interromperia a busca).
  assert.match(
    fonte,
    /require\('dotenv'\)\.config\(\{[^}]*path:[^}]*__dirname/,
    'index.js deve carregar o .env por caminho absoluto derivado de __dirname (D-13)',
  );

  // E a forma dependente do cwd não pode voltar.
  assert.doesNotMatch(
    fonte,
    /require\('dotenv'\)\.config\(\s*\)/,
    "require('dotenv').config() sem path depende do cwd — regressão do Pitfall 1",
  );
});
