// Prova INDEPENDENTE de CFG-01 — "nenhum segredo no código versionado" (D-15).
//
// Por que este arquivo existe, se o CI já roda o gitleaks (job `secrets`, D-08):
// o gitleaks NÃO detecta a exposição do token da Agendor quando ela está num header
// `Authorization: Token …` — medido nos três modos de scan (`git`, `dir`, `stdin`)
// contra o blob histórico de `.claude/settings.local.json@13905d4`. Ou seja: gitleaks
// verde NÃO é prova de zero segredos. Este teste é a segunda perna dessa prova.
//
// Escopo, e por que ele não é a raiz do repositório (Pitfall 8):
// `.planning/` cita o prefixo do token DE PROPÓSITO, para rastrear a exposição do
// `sec-01`. São referências truncadas (`c57f59ef-…`), não vazamento novo — o valor
// íntegro já está no histórico público desde `13905d4`. Um grep na raiz falharia
// contra a própria documentação de segurança do projeto, e o "conserto" natural
// seria apagar essa documentação. Por isso o escopo é código + configuração, que é
// o que CFG-01 de fato pede.
//
// O que este teste NÃO prova: o token histórico continua ATIVO até ser rotacionado
// no painel da Agendor (`.planning/todos/pending/sec-01-rotate-agendor-token.md`).
// A afirmação aqui é estritamente "não há segredo no código versionado em HEAD" —
// nada além disso.
//
// O escopo também não lê `backend/.env` nem `.claude/**` (gitignored, com segredos
// reais): `git grep` só olha arquivos rastreados, e os pathspecs abaixo são todos de
// código/configuração versionada.
require('./setup');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Raiz do repositório derivada de __dirname, nunca do diretório de trabalho corrente:
// o teste precisa funcionar rodado de backend/ ou da raiz, e sob c8.
const REPO_ROOT = path.join(__dirname, '..', '..');

// Prefixo do token real da Agendor exposto em 13905d4. Literal de propósito: o escopo
// abaixo não inclui backend/test/, então este arquivo não casa consigo mesmo.
const PREFIXO_TOKEN_AGENDOR = 'c57f59ef';

// Escopo exato de 03-RESEARCH.md §Pitfall 8 — código e configuração versionados.
const ESCOPO_CODIGO = ['backend/src', 'frontend/src', 'deploy', '*.example', '*.json', '*.sh'];
const EXCLUI_PLANNING = ':!.planning';

// Literal de segredo genérico: chave/valor com string longa o bastante para não ser
// um identificador comum. Complementa o gitleaks em código-fonte de aplicação.
// Casado com -i (ver gitGrep abaixo): em JS a convenção de constante é SCREAMING_SNAKE
// (`AGENDOR_TOKEN = '…'`), que a versão sensível a maiúsculas deixaria passar inteira.
const PADRAO_SEGREDO_LITERAL = "(password|secret|token|api_key)\\s*[:=]\\s*['\"][A-Za-z0-9/+_-]{16,}['\"]";

// git grep sai 0 quando ACHA, 1 quando NÃO acha, e >1 em erro real (git ausente,
// pathspec inválido, -P sem suporte a PCRE). Erro real precisa falhar EXPLICITAMENTE,
// nunca ser confundido com "não achou nada".
function gitGrep(args) {
  try {
    const saida = execFileSync('git', ['grep', ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { encontrou: true, saida };
  } catch (err) {
    if (err.status === 1) return { encontrou: false, saida: '' };
    if (err.code === 'ENOENT') {
      throw new Error(
        'git não está disponível no PATH. Este teste é a prova de CFG-01 e não pode ser ' +
          'pulado em silêncio — instale o git ou rode a suíte num ambiente que o tenha.'
      );
    }
    throw new Error(
      `git grep falhou com status ${err.status} (não é "nada encontrado"). ` +
        `Args: ${JSON.stringify(args)}. stderr: ${String(err.stderr || '').trim()}`
    );
  }
}

test('CFG-01: o token da Agendor não aparece em código nem em configuração versionada', () => {
  const r = gitGrep(['-nI', '-e', PREFIXO_TOKEN_AGENDOR, '--', ...ESCOPO_CODIGO, EXCLUI_PLANNING]);

  assert.equal(
    r.encontrou,
    false,
    'Token da Agendor encontrado em código/configuração versionada:\n' +
      `${r.saida}\n` +
      'NÃO "conserte" ampliando o exclusor do grep — remova a credencial e rotacione o token.'
  );
});

test('CFG-01: nenhum literal de segredo (password/secret/token/api_key = "…") em src/', () => {
  const r = gitGrep(['-nIPi', '-e', PADRAO_SEGREDO_LITERAL, '--', 'backend/src', 'frontend/src']);

  assert.equal(
    r.encontrou,
    false,
    'Literal com aparência de segredo encontrado no código-fonte:\n' +
      `${r.saida}\n` +
      'Segredos vêm de process.env (ver backend/src/config.js), nunca de literal no código.'
  );
});

// Controle negativo. Se este teste falhar, o grep dos dois anteriores pode ter deixado
// de procurar de verdade (pathspec quebrado, prefixo alterado) — e um verde deles
// passaria a não significar nada. Também documenta, dentro do próprio código, POR QUE
// o exclusor `:!.planning` existe, impedindo que alguém "resolva" um falso alarme
// apagando a documentação da exposição do sec-01.
test('controle negativo: a MESMA busca sem o exclusor ACHA as citações em .planning/', () => {
  const r = gitGrep(['-nI', '-e', PREFIXO_TOKEN_AGENDOR, '--', '.planning']);

  assert.equal(
    r.encontrou,
    true,
    'A busca pelo prefixo do token não encontrou nada nem em .planning/, onde ele é citado ' +
      'de propósito. Duas leituras possíveis: (a) o grep parou de funcionar e os testes ' +
      'acima estão verdes por engano; ou (b) o token foi rotacionado e a documentação da ' +
      'exposição foi removida — nesse caso, remova este controle negativo junto com o ' +
      'exclusor :!.planning, conscientemente.'
  );
});
