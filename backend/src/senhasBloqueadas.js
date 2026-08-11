// Bloqueio de senhas vazadas e comuns — P2 do parecer de 14/07/2026, que pediu quatro
// controles na mesma linha: hash do token de reset, limite de tentativas, política de 12+
// caracteres e "bloqueio por vazamentos/senhas comuns". Os três primeiros já existiam; este
// arquivo é o quarto.
//
// São DUAS regras, e a diferença entre elas é o ponto do módulo:
//
//  1. COMUNS — comparação exata, depois de normalizar. É o controle padrão (NIST 800-63B:
//     comparar o segredo pretendido com uma lista de senhas comuns/comprometidas). Boa parte
//     desta lista já morreria no piso de 12 caracteres; ela existe mesmo assim porque o piso
//     é uma regra que pode mudar, e este módulo não deve depender dela para funcionar.
//
//  2. RAIZES_COMPROMETIDAS — comparação por CONTINÊNCIA, e só para segredos que vazaram
//     DESTE projeto. Aqui a igualdade exata seria decorativa: `cadmus2026` tem 10 caracteres
//     e já é recusada pelo tamanho, então uma regra de igualdade nunca dispararia — enquanto
//     `Cadmus2026@` e `cadmus2026!!` passariam, que é exatamente o que um atacante tenta
//     primeiro depois de achar a senha original no histórico público do Git. Quem viu a
//     senha vazada testa as variantes dela, não ela mesma.

// Normalização deliberadamente conservadora: apara espaços das pontas e baixa a caixa.
// Não remove acento nem caractere especial — fazer isso aumentaria os falsos positivos
// sobre senhas legítimas sem fechar nenhum caminho real de ataque.
function normalizar(senha) {
  return String(senha ?? '')
    .trim()
    .toLowerCase();
}

// Senhas comuns. Lista curta e deliberadamente não exaustiva: o objetivo é barrar o que
// alguém digita sem pensar, não substituir um serviço de vazamentos. Inclui as variantes
// em português, que nenhuma lista internacional cobre.
const COMUNS = new Set([
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '123456789012',
  '111111',
  '123123',
  'password',
  'password1',
  'password123',
  'password1234',
  'passw0rd',
  'qwerty',
  'qwerty123',
  'qwertyuiop',
  'qwertyuiop12',
  'abc123',
  'abcd1234',
  'letmein',
  'welcome',
  'welcome123',
  'iloveyou',
  'admin',
  'admin123',
  'administrador',
  'administrator',
  'root',
  'toor',
  'master',
  'shadow',
  'trustno1',
  'changeme',
  'change-me',
  'senha',
  'senha123',
  'senha1234',
  'senha12345678',
  'senhasegura',
  'senhasegura123',
  'mudar123',
  'mudarsenha',
  'trocarsenha',
  'primeiroacesso',
  'brasil',
  'brasil123',
  'brasil2026',
  'flamengo',
  'corinthians',
  'palmeiras',
  'saopaulo',
]);

// Segredos que vazaram DESTE repositório. Comparados por continência — ver o cabeçalho.
//
// `cadmus2026` esteve em texto puro em backend/src/routes/auth.js e continua legível no
// histórico público do Git (commit 9c39c40, removida em 30/06/2026). Em 10/08/2026 ela ainda
// abria três das cinco contas do painel.
const RAIZES_COMPROMETIDAS = ['cadmus2026'];

// Devolve o MOTIVO do bloqueio ('comum' | 'vazada') ou null quando a senha passa. Motivo em
// vez de booleano porque as duas mensagens ao usuário são diferentes: uma orienta a escolher
// algo menos previsível, a outra precisa dizer que aquele texto especificamente vazou — sem
// isso a pessoa tenta a variante seguinte da mesma senha e leva outro "não" sem entender.
function motivoBloqueio(senha) {
  const normalizada = normalizar(senha);
  if (!normalizada) return null;

  if (COMUNS.has(normalizada)) return 'comum';

  for (const raiz of RAIZES_COMPROMETIDAS) {
    if (normalizada.includes(raiz)) return 'vazada';
  }

  return null;
}

// Mensagens em português, no mesmo tom das demais respostas de auth.js. A de 'vazada' diz o
// PORQUÊ: quem escolheu aquela senha provavelmente a recebeu de alguém e não faz ideia de que
// ela é pública.
const MENSAGENS = {
  comum:
    'Esta senha é muito comum e não pode ser usada. Escolha uma combinação menos previsível.',
  vazada:
    'Esta senha contém uma senha que já vazou publicamente e não pode ser usada. Escolha uma sem relação com a anterior.',
};

function mensagemBloqueio(motivo) {
  return MENSAGENS[motivo] || MENSAGENS.comum;
}

module.exports = { motivoBloqueio, mensagemBloqueio };
