require('./setup');

const test = require('node:test');
const assert = require('node:assert/strict');
const { _interno } = require('../src/emailer');

const {
  escapeHtml,
  linkSeguro,
  assuntoSeguro,
  dealEmailHtml,
  buildOwnerBlocks,
  ownerWeeklyHtml,
} = _interno;

// Neutralização do conteúdo vindo do CRM nos corpos de e-mail.
//
// Os campos abaixo — título, empresa, funil, etapa, nome do responsável — são digitados por
// pessoas no Agendor e iam CRUS para dentro do HTML. Quem edita um negócio no CRM não
// deveria conseguir escrever marcação no e-mail institucional que a equipe recebe.
//
// A medição é sobre o HTML GERADO, e não sobre a existência das funções de escape: é o
// template montado que prova que o campo saiu neutralizado, e é ele que regride se alguém
// acrescentar um ponto de interpolação novo sem passar pela cópia segura.

// Uma carga por vetor de ataque distinto. `PAYLOAD` é o que não pode reaparecer inteiro.
const PAYLOAD = '<script>alert(1)</script>';
const ASPAS = '" onmouseover="alert(1)';

function negocioMalicioso(extra = {}) {
  return {
    id: 1,
    title: PAYLOAD,
    organization: `Empresa ${PAYLOAD}`,
    orgCategory: PAYLOAD,
    funnel: `Funil ${ASPAS}`,
    stage: PAYLOAD,
    dealType: 'Lead',
    ownerName: PAYLOAD,
    daysSinceUpdate: 20,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
    webUrl: 'https://web.agendor.com.br/sistema/negocios/historico.php?id=1',
    ...extra,
  };
}

// A asserção central, repetida nos três templates: nem a tag nem a aspa que escaparia de um
// atributo podem sobreviver ao HTML gerado.
function assertNeutralizado(html, ondeVem) {
  assert.ok(
    !html.includes(PAYLOAD),
    `${ondeVem}: a carga <script> sobreviveu crua no HTML`,
  );
  // Mede a ASPA CRUA, e não a palavra `onmouseover`: escapada, ela vira `&quot;` e o texto
  // `onmouseover=` sobrevive como conteúdo inerte — procurar pela palavra reprovaria um
  // HTML correto. O que não pode existir é a sequência original, com a aspa de verdade,
  // porque é ela que fecharia o atributo e criaria o manipulador de evento.
  assert.ok(
    !html.includes(ASPAS),
    `${ondeVem}: a aspa crua sobreviveu e pode fechar o atributo`,
  );
  assert.ok(
    html.includes('&quot;'),
    `${ondeVem}: a aspa do campo do CRM precisa aparecer como entidade`,
  );
  // A prova de que o texto continua SENDO exibido, só que inerte — um escape que apagasse o
  // conteúdo passaria na asserção acima e quebraria o e-mail.
  assert.ok(
    html.includes('&lt;script&gt;'),
    `${ondeVem}: o texto do CRM precisa aparecer escapado, não sumir`,
  );
}

test('alerta diário: campos do CRM saem escapados', () => {
  const html = dealEmailHtml({
    deal: negocioMalicioso(),
    ownerName: PAYLOAD,
    role: 'owner',
    logId: 10,
  });
  assertNeutralizado(html, 'dealEmailHtml');
});

test('resumo consolidado do admin: campos do CRM saem escapados', () => {
  const html = buildOwnerBlocks([negocioMalicioso()]);
  assertNeutralizado(html, 'buildOwnerBlocks');
});

test('resumo individual do comercial: campos do CRM saem escapados', () => {
  const html = ownerWeeklyHtml({
    ownerName: PAYLOAD,
    deals: [negocioMalicioso()],
    weekLabel: 'Semana de teste',
    staleDays: 15,
  });
  assertNeutralizado(html, 'ownerWeeklyHtml');
});

// O caso que o escape NÃO resolve, e por isso tem tratamento próprio: dentro de um href,
// `javascript:` continua sendo `javascript:` depois de escapado.
test('href: URL fora do Agendor não chega ao e-mail', () => {
  const proibidas = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'https://agendor.com.br.evil.example/roubo',
    'https://evil.example/phishing',
    'nao-e-url',
    null,
    undefined,
  ];
  for (const url of proibidas) {
    assert.equal(
      linkSeguro(url),
      'https://web.agendor.com.br',
      `${String(url)} deveria cair no link padrão`,
    );
  }

  // E o caminho feliz precisa continuar intacto — uma validação que recusa tudo quebraria
  // todos os botões dos e-mails sem ninguém perceber até o próximo disparo.
  const boa = 'https://web.agendor.com.br/sistema/negocios/historico.php?id=42';
  assert.equal(linkSeguro(boa), boa);
  assert.equal(
    linkSeguro('https://agendor.com.br/x'),
    'https://agendor.com.br/x',
  );
});

test('href malicioso não sobrevive ao template', () => {
  const html = dealEmailHtml({
    deal: negocioMalicioso({ webUrl: 'javascript:alert(1)' }),
    ownerName: 'Fulano',
    role: 'owner',
    logId: null,
  });
  assert.ok(
    !html.includes('javascript:'),
    'o href com javascript: chegou ao corpo do e-mail',
  );
});

test('assunto: quebra de linha não vira cabeçalho SMTP', () => {
  const sujo = 'Negócio\r\nBcc: vazamento@evil.example';
  const limpo = assuntoSeguro(sujo);
  assert.ok(!/[\r\n]/.test(limpo), 'o assunto manteve quebra de linha');
  assert.match(limpo, /^Negócio Bcc: vazamento@evil\.example$/);
});

test('assunto NÃO é escapado como HTML', () => {
  // Escapar o assunto faria a caixa de entrada exibir "&amp;" no lugar de "&". O risco no
  // assunto é injeção de cabeçalho, não marcação — e o tratamento é outro.
  assert.equal(assuntoSeguro('Contrato A & B'), 'Contrato A & B');
});

test('escapeHtml cobre os cinco caracteres, e o & primeiro', () => {
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  // Se o & fosse substituído por último, `&lt;` viraria `&amp;lt;` e o texto exibido
  // mostraria a entidade em vez do caractere.
  assert.equal(escapeHtml('<'), '&lt;');
});
