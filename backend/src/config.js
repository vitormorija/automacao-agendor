// Validação centralizada das variáveis de ambiente obrigatórias (CFG-04, D-04/D-05/D-06).
//
// Segue o modelo de secret.js — falha no carregamento do módulo — mas com uma diferença
// deliberada: a regra mora numa função PURA (validateEnv) que recebe o ambiente como
// argumento. Isso a torna testável sem subprocesso e sem variável global, e é o que permite
// cobrir os dois ramos (produção derruba / desenvolvimento avisa) na suíte de testes.
//
// Este módulo NÃO carrega o dotenv de propósito: quem carrega o .env é o boot
// (src/index.js:1, por caminho absoluto). A suíte requer este arquivo, e o
// backend/.env real jamais deve ser lido por um teste (é a razão de existir do test/setup.js).

const logger = require('./logger');

// ── Contrato das variáveis obrigatórias ──────────────────────────
// D-04: só o que é "funcionamento + segurança". As demais (PORT, LOG_LEVEL, DB_PATH,
// BASE_URL, …) têm default sensato no código e seguem opcionais.
// A dica de cada uma é o que a mensagem de erro mostra — precisa dizer COMO obter o valor,
// não apenas que ele falta: quem lê essa mensagem é um operador no meio de um deploy.
const REQUIRED = [
  {
    name: 'AGENDOR_TOKEN',
    hint: 'token da API Agendor — painel Agendor › Configurações › API',
  },
  {
    name: 'JWT_SECRET',
    hint: 'mín. 16 caracteres — gere com `openssl rand -hex 32`',
  },
  {
    name: 'SMTP_PASS',
    hint: 'senha de app do provedor SMTP (Gmail: Conta › Segurança › Senhas de app)',
  },
  {
    name: 'ALLOWED_ORIGINS',
    hint: 'origens liberadas no CORS, separadas por vírgula (ex.: http://agendor.cadmus.com.br)',
  },
  {
    name: 'ADMIN_USERS',
    hint: 'e-mails que podem gerenciar usuários, separados por vírgula',
  },
];

// ── Regra (pura) ─────────────────────────────────────────────────

// Retorna a lista de variáveis obrigatórias ausentes ou vazias. FUNÇÃO PURA:
// não lê process.env, não loga, não lança — só olha o objeto recebido. É o que a
// suíte de testes exercita diretamente. Presente-mas-vazio (inclusive só espaços)
// conta como ausente: um `SMTP_PASS=` no .env é tão inútil quanto a linha faltando.
function findMissing(env) {
  return REQUIRED.filter(({ name }) => !String(env[name] ?? '').trim());
}

// Monta a mensagem em PT listando TODAS as faltantes de uma vez (não para na primeira:
// um deploy mal configurado deve descobrir tudo o que falta num único boot, não um por vez).
// Só usa `name` e `hint` do contrato acima — nunca o VALOR de env[name], para que uma
// configuração parcial não vaze segredo no log de boot (ASVS V7 / T-03-01).
function buildMessage(missing) {
  const linhas = missing
    .map(({ name, hint }) => `  - ${name}: ${hint}`)
    .join('\n');
  return (
    `Configuração incompleta — ${missing.length} variável(is) de ambiente obrigatória(s) ausente(s):\n` +
    `${linhas}\n` +
    `Defina-as em backend/.env (use backend/.env.example como referência).`
  );
}

// Aplica o rigor escalonado de D-05: em produção a ausência derruba o boot; em
// desenvolvimento vira aviso e o processo sobe (permite mexer no frontend sem credenciais
// reais). Também é pura em relação a process.env — recebe env, devolve ou lança.
// Usa `throw`, nunca um encerramento forçado do processo: matar o processo direto
// impede o logger de drenar e impede o teste de capturar o erro — é o mesmo motivo
// pelo qual secret.js lança em vez de encerrar.
function validateEnv(env) {
  const missing = findMissing(env);
  if (missing.length === 0) return { ok: true, missing: [] };

  const message = buildMessage(missing);
  if (env.NODE_ENV === 'production') throw new Error(message);

  logger.warn(`[Config] ${message}`);
  return { ok: false, missing: missing.map((m) => m.name) };
}

// ── Efeito de boot ───────────────────────────────────────────────
// Executado no require, seguindo o padrão de secret.js: quem importar este módulo
// já garante que o ambiente foi validado. Em produção, lança e o processo morre aqui.
validateEnv(process.env);

module.exports = { validateEnv, findMissing, buildMessage, REQUIRED };
