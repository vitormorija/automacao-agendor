---
id: in-04-escape-html-no-test-card
type: todo
status: pending
priority: high
created: 2026-08-04
source: Fase 4, code review 04-REVIEW.md §IN-04 — defeito pré-existente, linhas não tocadas pela fase
resolves_phase: null
tags: [backend, seguranca, email, xss, phase-4-carryover]
---

# IN-04 — `test-card` interpola o corpo da requisição sem escape no HTML do e-mail

**O que acontece:** `POST /api/notifications/test-card` monta um negócio de teste inteiramente
a partir de `req.body` (`backend/src/routes/notifications.js:67-83`):

```js
const mockDeal = {
  title: title || 'Exemplo de Negócio Parado [TESTE]',
  ownerName: ownerName || 'Responsável Exemplo',
  organization: organization || 'Empresa Exemplo Ltda',
  ...
  webUrl: `https://web.agendor.com.br/sistema/negocios/historico.php?id=${req.body.dealId || '5620'}`,
};
```

E esses campos chegam **sem nenhum escape** ao template de e-mail em
`backend/src/emailer.js:117,158,164` — `${deal.title}`, `${deal.organization}`,
`${deal.ownerName}` e, o pior, `href="${deal.webUrl}"`, ou seja, **dentro de um atributo
HTML**.

**Consequência:** um usuário **autenticado** consegue enviar HTML arbitrário — inclusive um
link apontando para domínio próprio — para **qualquer endereço de e-mail que ele escolher**,
com o remetente configurado (`smtp_from`) e a identidade visual da empresa. É phishing
assinado pelo domínio da organização, servido pela própria infraestrutura dela. Requer conta
válida no painel, o que limita a exposição, mas não a torna teórica: qualquer conta
comprometida vira um relay de phishing com aparência legítima.

**A prioridade é `high` justamente porque o dano não é ao sistema, é a terceiros** — e nenhum
teste, log ou alerta do projeto registraria que aconteceu.

**Relação com o 04-09:** este plano corrigiu apenas o `dealId` **gravado no banco**
(`Number.parseInt`, WR-03), porque era o valor que reaparecia como path da API Agendor. A
**linha 82** (a `webUrl` interpolada no e-mail) foi deliberadamente deixada intocada e é
verificada por asserção do plano — a interpolação sem escape continua exatamente como estava.

## Por que ficou fora da Fase 4

- São linhas **pré-existentes**, **não tocadas** por nenhum plano desta fase — o REL-01/REL-06
  não as criou nem as tornou alcançáveis.
- A correção mexe no **conteúdo do template de e-mail**, que o
  `04-DELIVERY-CONTRACT.md` declara **inalterado** nesta fase.
- Consertar sem teste do novo template violaria a constraint do `CLAUDE.md` ("não alterar
  comportamento funcional sem teste cobrindo o novo comportamento") — e testar template de
  e-mail é trabalho próprio, não emenda de uma rodada de gap closure.

## Correção sugerida

1. Um helper `escapeHtml()` em `emailer.js`, aplicado a **todos** os campos interpolados de
   `dealEmailHtml` (`title`, `organization`, `ownerName`, e os equivalentes dos resumos
   semanais, que sofrem do mesmo padrão).
2. Para `webUrl`, escape **não basta** dentro de `href`: validar que a URL é do domínio
   esperado (`web.agendor.com.br`) ou reconstruí-la a partir do `dealId` já numérico — o
   `Number.parseInt` do 04-09 dá metade dessa garantia, mas só para o valor gravado no banco,
   não para o que vai ao e-mail.
3. Teste do novo template: um caso que injete `<script>` e `href` hostil e assere que a saída
   HTML os carrega escapados / rejeitados.

**Destino sugerido:** fase de segurança pós-Fase 5, ou um plano dedicado. **Não bloqueia a
Fase 4**, mas é o item de maior severidade deixado em aberto por ela.
