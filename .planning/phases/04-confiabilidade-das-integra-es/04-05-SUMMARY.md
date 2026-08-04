---
phase: 04-confiabilidade-das-integra-es
plan: 05
subsystem: integrations
tags:
  [
    nodemailer,
    dependency-bump,
    major-upgrade,
    smtp,
    supply-chain,
    npm-audit,
    sec-02,
    rel-02,
    d-06,
  ]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    plan: 04
    provides: 'backend/test/emailer.timeout.test.js — o oráculo real do caminho de envio (9 casos: fábrica, exaustão sem throw, recriação do transporter, retorno por destinatário). Sem ele, "a suíte passou" não diria nada sobre o major, porque emailer.js tinha 7,16% de cobertura'
  - phase: 04-confiabilidade-das-integra-es
    plan: 03
    provides: 'precedente de bump isolado (axios em 50a41c9) e o roteiro de revisão de diff de lockfile apresentado no checkpoint C4'
provides:
  - 'nodemailer em ^9.0.4 (resolvido 9.0.4) — fecha 4 advisories, entre eles o único HIGH sem correção dentro do 6.x'
  - 'npm audit do backend em 8 (2 high, 6 moderate); zero high/critical atribuível a axios ou nodemailer'
  - 'Revisão de changelog documentada: as 3 únicas BREAKING CHANGES entre 6.10.1 e 9.0.4, com veredito e prova por item'
  - 'Prova de compatibilidade por comparação de fonte: _formatError, códigos de erro e as 3 opções de timeout de D-02 idênticos entre 6.10.1 e 9.0.4'
  - '.planning/todos/pending/sec-02-dependency-vulnerabilities.md com a lista explícita dos 8 advisories remanescentes'
affects: [04-06-status-de-notificacao, 05-observabilidade, 06-hardening-seguranca]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Revisão de major por CHANGELOG.md que vem DENTRO do tarball publicado (nodemailer o entrega) — fonte primária versionada, sem depender de acesso à web nem de release notes reescritas'
    - 'Comparação de fonte v-antiga vs v-nova por npm pack em diretório descartável: o tarball da versão antiga é extraído no scratchpad e diffado contra node_modules, sem tocar o repositório'
    - 'Verificação de engines ANTES do install (npm view <pkg>@<ver> engines) — bloqueio de major incompatível com o runtime do CI é barato de detectar e caro de descobrir depois'

key-files:
  created:
    - .planning/phases/04-confiabilidade-das-integra-es/04-05-SUMMARY.md
  modified:
    - backend/package.json
    - backend/package-lock.json
    - .planning/todos/pending/sec-02-dependency-vulnerabilities.md

key-decisions:
  - '9.0.4 confirmada como alvo (fallback ^9.0.3 NÃO acionado): nenhum problema concreto apareceu, e o delta 9.0.3→9.0.4 é todo em mime-funcs/mime-node — caminho que este projeto exercita com assuntos em emoji e acento'
  - 'A revisão de changelog foi feita contra o CHANGELOG.md do próprio tarball, não contra a pesquisa — e isso rendeu duas correções à pesquisa e um achado novo'
  - 'Correção à pesquisa: a string NoAuth NÃO vive só em lib/smtp-pool — em 6.10.1 ela também está em lib/smtp-transport/index.js:390, dentro de verify(), que este projeto CHAMA. O veredito "não afeta" continua válido, mas por outra razão: o ramo exige options.forceAuth, que o projeto nunca passa — e nenhum consumidor lê err.code'
  - 'Achado novo NÃO previsto pela pesquisa: o 8.0.0 introduziu fallback de conexão para endereços DNS alternativos (_fallbackAddresses), inexistente no 6.x. Consequência para REL-02: connectionTimeout passa a valer POR ENDEREÇO resolvido na fase de conexão'
  - 'O bump ficou sozinho em b69eb63 (2 arquivos, 5 inserções, 5 remoções); a atualização do sec-02 foi para commit separado, porque D-06 exige que o commit do bump contenha apenas package.json e package-lock.json'
  - 'npm audit fix NÃO foi executado em nenhum momento (Pitfall 8); apenas npm install nodemailer@^9.0.4'

requirements-completed: [REL-02]

# Metrics
duration: 14min
completed: 2026-08-04
---

# Phase 4 Plan 05: nodemailer 6→9 Summary

**Três majors atravessados em um commit de 2 arquivos e 5 linhas, com a suíte inteira verde e zero testes editados — e a revisão independente do changelog, feita contra o `CHANGELOG.md` que vem dentro do tarball, corrigiu dois pontos da pesquisa e encontrou uma mudança de comportamento que ninguém tinha listado.**

## Performance

- **Duration:** 14 min
- **Tasks:** 2 (1 de execução + o checkpoint C3/C4, **aguardando aprovação humana**)
- **Files modified:** 3 (0 de produção, 0 de teste, 2 de dependência, 1 de planejamento)
- **Diff do bump:** 5 adições, 5 remoções em 2 arquivos
- **Testes editados:** **zero**

## Accomplishments

- **O advisory que não tinha saída foi fechado.** `GHSA-rcmh-qjqh-p98v` (DoS por recursão no `addressparser`, **HIGH**) tem `first_patched_version: null` para a linha 6.x — não existia correção dentro do 6.x. O major não era preferência, era o único caminho. Junto com ele saíram os outros três: e-mail entregue a domínio não intencionado, bypass de `disableFileAccess`/`disableUrlAccess` no `jsonTransport`, e leitura arbitrária de arquivo / SSRF pela opção `raw`.
- **O diff mais limpo que um bump pode ter.** `git show --stat` do commit do bump: **2 arquivos, 5 inserções, 5 remoções**. No lockfile são exatamente 2 hunks — o spec no bloco raiz e a entrada `node_modules/nodemailer` (`version`, `resolved`, `integrity`). **Zero pacotes adicionados, zero removidos.** `nodemailer` continua com **zero dependências** em 9.0.4.
- **`npm audit` de 9 (3 high) para 8 (2 high)**, exatamente o número pré-medido na pesquisa. `nodemailer` desapareceu da lista. Os 2 high remanescentes são `brace-expansion` e `path-to-regexp` — nenhum atribuível a `nodemailer` ou a `axios`.
- **A suíte não se mexeu.** 112 testes antes, **112 testes depois**, 112 passando, `test:coverage` exit 0, `lint` exit 0 com os mesmos 45 warnings. A tabela de cobertura saiu **byte-idêntica** à do baseline — inclusive `emailer.js` em 35,67 / 82,14. `git diff --name-only backend/test/` e `backend/src/` ficaram **vazios** durante toda a execução.
- **`engines` verificado antes do install, não depois.** `nodemailer@9.0.4` declara `node: ">=6.0.0"` — **idêntico** ao que 6.10.1 declarava. O Node 20 fixado nas duas linhas do `ci.yml` (D-09) está coberto com folga. Era o único bloqueio possível deste plano, e ele não existe.

## Revisão de changelog — C3, com veredito e prova por item

Fonte usada: **`node_modules/nodemailer/CHANGELOG.md`**, que o próprio tarball publicado entrega. É fonte primária, versionada junto do código, e cobre integralmente 6.10.1 → 9.0.4. Confirmação estrutural: `grep -c "BREAKING" CHANGELOG.md` retorna **3**, e as 3 estão em 9.0.0, 8.0.0 e 7.0.0. **Não existe nenhuma outra breaking change declarada entre 6.10.1 e 9.0.4.**

| Versão | Breaking change declarada | Veredito | Prova (não é "a suíte passou") |
| ------ | ------------------------- | -------- | ------------------------------ |
| **7.0.0** (2025-05-03) | SDK do SESv2; removidos SES SDK v2 e v3, rate limiting e idling do SES | **Não afeta** | O projeto usa transporte **SMTP puro**. `grep -rn "SES" backend/src/` → **0 ocorrências**. `createTransporter()` entrega `host`/`port`/`secure`/`auth` + os 3 timeouts — nunca um objeto de SES |
| **8.0.0** (2026-02-04) | Código de erro `'NoAuth'` renomeado para `'ENOAUTH'` | **Não afeta** | Ver a correção à pesquisa abaixo. Duas razões independentes: (a) o ramo que emite o código exige `options.forceAuth`, que o projeto nunca passa; (b) **nenhum consumidor do projeto lê `err.code` no caminho de `verify()`** — `verifySmtp()` só repassa a promessa, e `POST /api/config/test-smtp` usa apenas `err.message` (`routes/config.js:91`) |
| **9.0.0** (2026-06-14) | Certificado TLS validado por padrão ao **buscar conteúdo remoto** (href/path de anexo, endpoint OAuth2, CONNECT de proxy HTTP/HTTPS) | **Não afeta** | Nenhum dos três caminhos existe aqui. Greps em `backend/src/`: `attachments` → 0, `raw:` → 0, `oauth2`/`OAuth2` → 0, `proxy` → 0, `dkim` → 0. As **únicas** chaves entregues a `sendMail` em todo o `emailer.js` são `from`, `to`, `subject`, `html` (as 7 ocorrências de `href` são tags `<a>` dentro do HTML dos e-mails, não a opção `href` de anexo). **Não é a conexão ao servidor SMTP** — essa continua governada pela opção `tls` do transporte, que não mudou |

### Correção à pesquisa (1) — a string `NoAuth` também vive no caminho que este projeto usa

O `04-RESEARCH.md` §State of the Art afirma que `'NoAuth'` *"existe apenas em `lib/smtp-pool/index.js:632`"*. **Medido no fonte de 6.10.1: ela está em dois arquivos.**

```
lib/smtp-pool/index.js:632:      err.code = 'NoAuth';
lib/smtp-transport/index.js:390:  err.code = 'NoAuth';   ← dentro de verify(), que este projeto CHAMA
```

O projeto não passa `pool: true`, logo usa `SMTPTransport` — e `verifySmtp()` chama `transporter.verify()`. Então a linha 390 **está** no caminho do projeto, ao contrário do que a pesquisa dizia.

O veredito "não afeta" **continua correto**, mas a razão precisava ser outra e mais forte:

```js
// v6 lib/smtp-transport/index.js:388-395  (e v9 :400-407, mesma estrutura)
} else if (!authData && connection.allowsAuth && options.forceAuth) {
    const err = new Error('Authentication info was not provided');
    err.code = 'NoAuth';        // v9: err.code = errors.ENOAUTH
```

O ramo exige `options.forceAuth`, que o projeto **nunca** passa. E mesmo que passasse: `verifySmtp()` (`emailer.js:417-420`) só devolve a promessa, e o único consumidor (`routes/config.js:86-93`) lê `err.message`, nunca `err.code`. **Duas barreiras independentes.**

Registrado porque a afirmação errada da pesquisa daria a impressão de que o caminho era estruturalmente inalcançável — e não é; ele é alcançável e simplesmente não é acionado por esta configuração.

### Correção à pesquisa (2) — `errors.ENOAUTH` é literalmente a string `'ENOAUTH'`

Em 9.0.4 os códigos foram centralizados em `lib/errors.js` (efeito do commit *"centralize and standardize error codes"* do 8.0.0). O arquivo define um dicionário de **descrições** e depois reexporta cada chave como constante de string:

```js
module.exports = { ERROR_CODES };
for (const code of Object.keys(ERROR_CODES)) {
    module.exports[code] = code;      // errors.ETIMEDOUT === 'ETIMEDOUT'
}
```

Um leitor apressado do `grep` veria `ENOAUTH: 'Authentication credentials not provided'` e concluiria que `err.code` passou a carregar uma frase. **Não passou** — `errors.X === 'X'` para todos os 21 códigos.

### Achado novo — não previsto pela pesquisa: fallback de conexão por endereço DNS (8.0.0)

Entre os "Bug Fixes" do 8.0.0 está *"add connection fallback to alternative DNS addresses"*. **Isso não aparece em nenhuma seção do `04-RESEARCH.md`**, e tem consequência direta sobre o que REL-02 promete.

O que muda, medido no fonte:

| | 6.10.1 | 9.0.4 |
| - | ------ | ----- |
| `_fallbackAddresses` no `smtp-connection` | **não existe** (`grep -c` → 0) | `index.js:334` guarda todos os endereços resolvidos exceto o em uso |
| Falha na fase de conexão | `_onError(...)` → erro propagado | `_onConnectionError(...)` → se houver endereço alternativo **e** `stage === 'init'`, fecha o socket e **reconecta no próximo endereço** |
| `resolveHostname` | devolve um host | devolve `_addresses: [...]` com a lista completa (`lib/shared/index.js:90`) |

O caminho padrão deste projeto (sem `options.socket`, sem `options.connection`) é exatamente o ramo que popula `_fallbackAddresses` (`lib/smtp-connection/index.js:332-338`).

**Consequência honesta para REL-02:** `connectionTimeout: 10000` deixou de ser um teto absoluto da fase de conexão e passou a valer **por endereço resolvido**. Para um host SMTP com N registros A/AAAA, o pior caso da fase de conexão vai de 10s para ~10s × N, antes de a tentativa ser dada como perdida. O `socketTimeout: 30000` continua limitando a fase de sessão, e `stage === 'init'` restringe o fallback à conexão (nunca depois do banner).

**Por que não foi tratado como obstáculo:**
- Não quebra nenhum teste. O caso (3) do `emailer.timeout.test.js` calcula o pior caso a partir dos **valores de configuração** entregues à fábrica — é aritmética sobre as opções, não execução do nodemailer. Ele continua verde e continua provando o que se propôs a provar.
- Não exige mudança de código. Nenhuma opção nova precisa ser passada; o comportamento é interno à biblioteca.
- É, em disponibilidade, uma **melhoria**: um servidor com um endereço fora do ar passa a ser alcançado pelo outro, em vez de falhar.

**É informação para o checkpoint, não algo a silenciar.** Se em produção o `notification_log` mostrar `ETIMEDOUT` com latência muito acima de 10s na conexão, esta é a explicação.

### Resolução do checkpoint C3+C4 — investigação dirigida e Decisão Q6 (2026-08-04)

O usuário **não aprovou de imediato**: pediu investigação dirigida do achado antes de decidir, sem alterar arquivos. A investigação foi feita sobre o fonte da versão instalada e os fatos abaixo estão medidos, não inferidos.

**1. `connectionTimeout` é aplicado por endereço A/AAAA, não globalmente.** `_connectToHost()` (`lib/smtp-connection/index.js:403`) chama `_setupConnectionHandlers()`, que arma um `setTimeout` novo com `options.connectionTimeout` (`:413-415`). `_onConnectionError()` limpa esse timer (`:427`), tira o próximo endereço da fila (`:438`) e chama `_connectToHost()` de novo (`:468`) — instalando um `connectionTimeout` **inteiro e novo**. Não há acumulador nem deadline compartilhada. A lista vem de `lib/shared/index.js:157-172` (A **e** AAAA concatenados), com o primário escolhido **aleatoriamente** em `:83`.

**2. `greetingTimeout` e `socketTimeout` NÃO são multiplicados.** Ambos vivem dentro de `_onConnect()` (`:847` e `:850`), que só roda depois de a conexão subir e marca `stage = 'connected'` (`:829`); `canFallback` exige `stage === 'init'` (`:430`). Só a fase de conexão multiplica.

**3. Nada mais limita a fase de conexão.** `socketTimeout` não vale antes de existir conexão. `dnsTimeout` (default 30s, `:268`) limita só a resolução, e o `dnsCache` tem TTL de 5 min. `grep` por `totalTimeout|globalTimeout|overallTimeout|maxConnectionTime|disableFallback|noFallback` em todo o `lib/` → **zero ocorrências**. O bloco de documentação das opções (`:44-64`) não menciona o fallback.

**4. Pior caso por destinatário — fórmula:**

```
30N + 69 segundos     (N = registros A + AAAA do smtp_host)
```

| N | Pior caso | Observação |
|---|---|---|
| 1 | 99s | é exatamente o "~1min40s" de D-02 — a garantia original era o caso N=1 |
| **2** | **129s** | **N=2 observado em 2026-08-04 para `smtp.gmail.com`** (padrão, `db.js:108`) |
| 4 | 189s | |
| 8 | 309s | |

O termo dominante continua sendo `socketTimeout`; o fallback acrescenta `(N−1) × connectionTimeout` por tentativa.

**5. A garantia quantitativa de D-02 deixou de ser invariável.** A cláusula de **configuração** (os três valores na fábrica) segue satisfeita ao pé da letra e a v9 honra os mesmos nomes com a mesma semântica — nenhuma mudança de código foi necessária, e nenhuma foi feita. Mas o teto passou a depender do **DNS do provedor**, que o operador não vê nem controla.

**6. Opções avaliadas e descartadas.** Não existe configuração suportada (item 3). Host como IP literal desligaria o fallback (`shared/index.js:103`) mas zera o `servername`, quebrando SNI e validação de certificado, e os IPs do provedor rotacionam. A opção `socket`/`connection` também desligaria, mas exige gerenciar o ciclo de vida do socket. Baixar `connectionTimeout` para `10s/N` não funciona: N não é conhecido em tempo de configuração.

**7. ⚠ `Promise.race` ingênuo é armadilha.** Perder a corrida **não cancela** a operação SMTP subjacente: o socket fica aberto, o `connectionTimeout` do endereço em curso segue armado, e a tentativa continua consumindo descritor. Numa rodada com muitos destinatários isso vaza sockets em vez de limitar tempo. Qualquer teto externo precisa encerrar o transporte explicitamente.

**Decisão Q6 — nova semântica ACEITA nesta fase, upgrade mantido em 9.0.4.** Fundamentos registrados pelo usuário: N=2 no ambiente atual; 129s ainda é redução enorme diante dos ~30min anteriores; suíte integralmente verde; advisory HIGH do nodemailer removido; e ausência de configuração suportada para deadline global. O modo de falha é *mais lento*, não *errado*, e este é um cron diário cujo orçamento é a janela da rodada.

**Pendência rastreável criada:** `.planning/todos/pending/rel-02b-deadline-global-smtp.md` — estudar deadline global controlado **antes do go-live**, com gatilho de reavaliação se o provedor passar a resolver para mais endereços ou se o tempo observado exceder o limite operacional aprovado.

### Compatibilidade da superfície usada — prova por comparação de fonte

Tarball de 6.10.1 baixado com `npm pack` para diretório descartável (fora do repositório) e comparado com `node_modules/nodemailer` em 9.0.4:

| Item da superfície | 6.10.1 | 9.0.4 | Veredito |
| ------------------ | ------ | ----- | -------- |
| `CONNECTION_TIMEOUT` / `SOCKET_TIMEOUT` / `GREETING_TIMEOUT` | 2min / 10min / 30s | **idênticos** | Os defaults que motivaram D-02 não mudaram |
| Nomes das opções `connectionTimeout` / `socketTimeout` / `greetingTimeout` | `this.options.X \|\| DEFAULT` | **mesma leitura, mesmos nomes** | **A mudança do 04-04 sobrevive ao major sem tocar uma linha** |
| `_formatError(message, type, response, command)` | 29 linhas | 29 linhas, **1 diferença**: `let responseCode` → `const responseCode` | Zero mudança de comportamento na montagem do erro que o retry classifica |
| Timeout de socket | `this._onError(new Error('Timeout'), 'ETIMEDOUT', false, 'CONN')` | **linha byte a byte idêntica** | O ramo `err.code === 'ETIMEDOUT'` **e** o ramo por mensagem (`'timeout'`) de `sendMailWithRetry` continuam alcançáveis |
| Timeout de conexão | `_onError('Connection timeout', 'ETIMEDOUT', ...)` | `_onConnectionError('Connection timeout', 'ETIMEDOUT')` → cai em `_onError(err, code, false, 'CONN')` | Mesmo código, mesma mensagem; só ganhou o fallback de DNS descrito acima |
| Timeout de saudação | `_onError('Greeting never received', 'ETIMEDOUT', ...)` | **idêntico** | — |
| Erro de socket | `this._onError(error, 'ESOCKET', false, 'CONN')` | **linha idêntica** | Sustenta a decisão do 04-04 de injetar `ESOCKET` com mensagem `read ECONNRESET`, e não `code: 'ECONNRESET'` |
| `EAUTH` / `EENVELOPE` | 9 / 9 ocorrências | 9 / 9 | — |

O item mais importante da tabela é o terceiro e o segundo juntos: o formato do erro que `sendMailWithRetry` classifica (`err.code`, `err.message`) é **o mesmo**, e as três opções de timeout são lidas **pelos mesmos nomes**. Era o "ponto mais sensível do major" declarado pelo contrato §10 — e ele está estático.

## `npm audit` — antes e depois (contrato §15)

| Momento | Total | High | Moderate | Pacotes listados |
| ------- | ----- | ---- | -------- | ---------------- |
| **Antes** (início do 04-05) | **9** | **3** | 6 | body-parser, brace-expansion, express, morgan, node-cron, **nodemailer**, path-to-regexp, qs, uuid |
| **Depois** (pós-bump) | **8** | **2** | 6 | body-parser, brace-expansion, express, morgan, node-cron, path-to-regexp, qs, uuid |

Saiu exatamente **`nodemailer`**, com seus 4 advisories:

- `GHSA-rcmh-qjqh-p98v` — DoS por recursão no `addressparser` (**HIGH**, `first_patched_version: null` no 6.x)
- `GHSA-wqvq-jvpq-h66f` — `jsonTransport` burla `disableFileAccess`/`disableUrlAccess`
- `GHSA-r7g4-qg5f-qqm2` — validação de certificado TLS na busca de token OAuth2
- `GHSA-p6gq-j5cr-w38f` — opção `raw` permite leitura arbitrária de arquivo e SSRF

**Nenhum high/critical remanescente é atribuível a `nodemailer`** (nem a `axios`, fechado no 04-03) — critério (b) do contrato §15 satisfeito. Os 8 restantes foram registrados nominalmente, com GHSA e com a indicação de quais exigem major, em `.planning/todos/pending/sec-02-dependency-vulnerabilities.md` — critério (c).

## Diff do lockfile (o que C4 revisa)

```
ALTERADOS (1):
  nodemailer: 6.10.1 -> 9.0.4
ADICIONADOS: nenhum
REMOVIDOS:   nenhum
```

Dois hunks, e nada além disso:

1. `packages[""].dependencies.nodemailer`: `"^6.9.13"` → `"^9.0.4"`
2. `node_modules/nodemailer`: `version`, `resolved` e `integrity`. As chaves `license` (`MIT-0`) e `engines` (`{"node": ">=6.0.0"}`) **não mudaram nem de valor**.

O `integrity` gravado (`sha512-LmJNRVRtfSCULxcZpy0Cpg4WWenlUZ9+zbmTO+S7v9wD6XreYLjXRFtDjtV/4F0HT5p1GyZfA0Ux/myxHb18CQ==`) confere com o `dist.integrity` consultado no registry **antes** do install.

## Task Commits

1. **Task 1 — bump isolado de `nodemailer`** — `b69eb63` (`chore!`) — apenas `backend/package.json` + `backend/package-lock.json`
2. **Task 1, passo 7 — advisories remanescentes no `sec-02`** — `ff4d397` (`docs`) — commit separado por exigência de D-06: o commit do bump não pode carregar mais nada
3. **Task 2 — checkpoint C3 + C4** — **aguardando aprovação humana** (`auto_advance: false`, decisão Q4)

## Files Created/Modified

- `backend/package.json` **(modificado, +1 −1)** — spec de `nodemailer` de `^6.9.13` para `^9.0.4`. Nenhuma outra chave tocada.
- `backend/package-lock.json` **(modificado, +4 −4)** — dois hunks, descritos acima.
- `.planning/todos/pending/sec-02-dependency-vulnerabilities.md` **(modificado, +68 −11)** — nova seção "Estado após a Fase 4" com a evolução medida 12 → 9 → 8, a tabela nominal dos 8 remanescentes (GHSA, severidade, se é direto, se exige major), o registro de que o gate permanente de `npm audit` no CI segue **deliberadamente adiado** (ligá-lo agora deixaria o CI vermelho pelos 8 advisories que D-06 pôs fora de escopo), e a regra operacional de nunca usar `npm audit fix` neste backlog. A receita antiga de "Leva 1" foi marcada como superada em vez de apagada, para preservar o raciocínio original.
- **Nada em `backend/src/` e nada em `backend/test/`.**

## Decisions Made

- **9.0.4 confirmada, fallback `^9.0.3` NÃO acionado.** A Assumption A1 registrava o risco de adotar uma versão publicada no mesmo dia (zero tempo de campo). O critério para trocar era "problema concreto", e nenhum apareceu: suíte 112/112, cobertura idêntica, lint idêntico, e a revisão de fonte não achou nada no delta 9.0.3→9.0.4 que toque este projeto negativamente — pelo contrário, as 5 correções são todas em `mime-funcs`/`mime-node` (surrogates não pareados, escape do `name` em `Content-Type`, encode de HT/CR/LF em parâmetros de header), e este projeto **exercita** esse caminho: os assuntos levam `⚠️` e acentos (`emailer.js:223`). Ficar em 9.0.3 seria abrir mão de correções no caminho que o sistema mais usa. `^9.0.3` permanece como rollback intermediário documentado.
- **A revisão de changelog foi feita contra o tarball, não contra a pesquisa — e foi isso que produziu valor.** Reproduzir os três vereditos pré-medidos teria sido barato e teria "cumprido" o C3. Ir ao `CHANGELOG.md` versionado e ao fonte das duas versões rendeu duas correções à pesquisa e um achado que ninguém tinha listado. Os vereditos finais coincidem com os previstos, mas duas das três razões mudaram.
- **O bump ficou sozinho, e a atualização do `sec-02` foi para outro commit.** O passo 7 da Task 1 pede a atualização do todo, e a última linha da mesma `<action>` diz que nenhum arquivo além de `package.json`/`package-lock.json` pode aparecer no commit. As duas instruções só coexistem em commits separados — e D-06 é a que manda. Precedente idêntico ao do 04-03 (`50a41c9` sozinho).
- **`npm audit fix` nunca foi executado** (Pitfall 8), nem `npm update`, nem `slopcheck install`. O único comando de escrita foi `npm install nodemailer@^9.0.4`, e a saída dele já dizia `changed 1 package`. `npm audit` foi usado **exclusivamente como leitura**, duas vezes.
- **`engines` verificado com `npm view` ANTES do install.** Um major que exigisse Node > 20 seria bloqueante para o CI (D-09) e teria que parar no checkpoint com o fato medido, não ser descoberto por um job vermelho depois do merge. Custou uma chamada; `nodemailer@9.0.4` declara `node: ">=6.0.0"`, igual a 6.10.1.
- **Legitimidade re-conferida no ponto de instalação, não só na pesquisa.** Antes do `npm install`: `dependencies` **vazio**, `scripts` **sem nenhum hook de ciclo de vida** (`postinstall`/`preinstall`/`install` ausentes — o `update` listado é script de manutenção do próprio repo, que o npm nunca dispara), `repository.url` = `git+https://github.com/nodemailer/nodemailer.git`, e o `dist.integrity` conferido contra o que foi gravado no lockfile.

## Deviations from Plan

### Ajuste de forma

**1. Dois commits em vez do único listado no `<output>` do plano**

O `<output>` enumera `chore(04-05)!: atualiza nodemailer 6→9 — protegido pelos testes de REL-02`. A `<action>` da Task 1, porém, tem duas exigências que não cabem no mesmo commit: o passo 7 manda atualizar `.planning/todos/pending/sec-02-dependency-vulnerabilities.md`, e a linha de fechamento diz que nenhum arquivo além dos dois de dependência deve aparecer no commit deste plano. Resolvido separando: `b69eb63` traz **só** o bump (o commit nomeado pelo plano, com a mensagem pedida) e `ff4d397` traz a atualização do todo. O rollback do major continua sendo **um único revert**, sem ambiguidade — `ff4d397` não toca código nem dependência.

**Nenhum desvio das Regras 1-4.** Nenhum bug encontrado, nenhuma funcionalidade crítica ausente, nenhum bloqueio. Nenhum arquivo de `src/` precisou de ajuste: `git diff --name-only backend/src/` ficou vazio do início ao fim, então o "ajuste mínimo excepcional" previsto no passo 5 da `<action>` **não foi necessário** — e, portanto, não há nada para o item 3 do roteiro de C3 revisar.

## Issues Encountered

**O `04-RESEARCH.md` §State of the Art tem duas imprecisões e uma omissão** (todas detalhadas na seção de revisão de changelog acima):

1. `'NoAuth'` não está só em `lib/smtp-pool` — está também em `lib/smtp-transport/index.js:390`, dentro de `verify()`, que este projeto chama. Veredito inalterado, razão diferente.
2. O fallback de conexão por endereço DNS alternativo (8.0.0) **não está registrado em lugar nenhum** da pesquisa, e afeta o teto de tempo que REL-02 estabelece.

Nenhuma das duas invalidou uma decisão do plano, mas ambas mostram que "confirmar independentemente", como o passo 1 da `<action>` exigia, não era formalidade.

**Cobertura inalterada, e isso é o resultado correto.** `emailer.js` continua em 35,67% de linhas e 82,14% de branches, e a tabela agregada saiu idêntica ao baseline. Um bump de dependência que mudasse a cobertura seria sinal de que caminhos diferentes passaram a ser exercitados — aqui não mudou nada, o que é a evidência mais direta de que a superfície usada é a mesma.

**Nenhum stub introduzido.** Nenhum arquivo de código foi tocado.

## Threat Flags

Nenhuma superfície de segurança nova fora do `<threat_model>` do plano. As disposições registradas foram cumpridas:

- **T-04-05-01 (mitigate)** — e-mail a domínio não intencionado (<7.0.7): fechado por `^9.0.4`; advisory ausente do `npm audit` pós-bump.
- **T-04-05-02 (mitigate)** — injeção de comando SMTP (`envelope.size`, CRLF em `name`, headers `List-*`): fechado. Reforço medido: o projeto **não passa** `envelope`, `list` nem `headers` a `sendMail` — as únicas chaves usadas em todo o `emailer.js` são `from`, `to`, `subject`, `html`.
- **T-04-05-03 (mitigate)** — `GHSA-rcmh-qjqh-p98v` (DoS no `addressparser`, sem correção no 6.x): fechado; é o motivo de o major ser obrigatório.
- **T-04-05-04 (mitigate)** — leitura arbitrária de arquivo / SSRF pela opção `raw` (≤9.0.0): fechado por 9.0.4 (≥9.0.1 já bastava). `grep -rn "raw:" backend/src/` → **0**.
- **T-04-05-05 (mitigate)** — **PROIBIÇÃO CUMPRIDA.** `grep -rn "rejectUnauthorized" backend/src/` → **0 ocorrências**. Nenhuma opção de TLS foi acrescentada, afrouxada ou desativada; `createTransporter()` está byte a byte como o 04-04 o deixou. O breaking change de 9.0.0 é sobre busca de **conteúdo remoto** e não toca a conexão ao SMTP.
- **T-04-05-06 (mitigate)** — regressão silenciosa no caminho de envio: os 9 casos de `emailer.timeout.test.js` rodam verdes sob v9 em 79ms (exaustão sem throw, recriação do transporter, retorno por destinatário, erro permanente não retentado). **Zero testes editados** — `git diff --name-only backend/test/` vazio.
- **T-04-05-SC (mitigate)** — legitimidade re-conferida no ponto de instalação (zero dependências, zero hooks de ciclo de vida, repositório oficial, `integrity` conferido contra o registry). Commit único json+lock. `npm audit fix` e `slopcheck install` **não** foram executados.

## User Setup Required

Quem tiver o repositório clonado precisa de `npm install` em `backend/` após puxar a branch — o `node_modules` mudou. Nenhuma variável de ambiente nova, nenhuma mudança em `.env`/`.env.example`, nenhum toque em `backend/agendor.db` (`git status --porcelain backend/agendor.db` vazio).

## Verification

```
--- ANTES do bump ---
npm ls nodemailer                                   → nodemailer@6.10.1
npm run test:coverage                               → exit 0 | 112 tests, 112 pass, 0 fail
npm run lint                                        → exit 0 (45 warnings)
npm audit                                           → 9 (3 high, 6 moderate)
npm view nodemailer@9.0.4 engines                   → {"node":">=6.0.0"}   (igual a 6.10.1)
npm view nodemailer@9.0.4 dependencies              → (vazio)
npm view nodemailer@9.0.4 scripts                   → sem postinstall/preinstall/install

--- DEPOIS do bump ---
npm install nodemailer@^9.0.4                       → "changed 1 package"
npm ls nodemailer                                   → nodemailer@9.0.4
grep -c '"nodemailer": "\^9.0.4"' backend/package.json → 1
npm run test:coverage                               → exit 0 | 112 tests, 112 pass, 0 fail
npm run lint                                        → exit 0 (45 warnings — baseline inalterado)
npm audit                                           → 8 (2 high, 6 moderate)

--- Ondas 1-4 revalidadas sob a v9 ---
node --test test/scheduler.resilience.test.js test/scheduler.failsafe.test.js \
            test/agendor.timeout.test.js test/notifications.resolved.test.js \
            test/emailer.timeout.test.js            → 34 tests, 34 pass, 0 fail  em 135ms
node --test test/emailer.timeout.test.js (oráculo)  → 9 tests, 9 pass, 0 fail  em 79ms

--- Cobertura: byte-idêntica ao baseline ---
All files          | 53.66 stmts | 75.74 branch | 54.32 funcs | 53.66 lines   (pisos 20/60/20/20)
 emailer.js        | 35.67       | 82.14        | 53.84       | 35.67   (inalterado)
 agendor.js        | 90.42       | 74.44        | 100         | 90.42   (inalterado)
 scheduler.js      | 67.27       | 59.09        | 66.66       | 67.27   (inalterado)

--- Isolamento do commit ---
git diff --name-only backend/test/                  → (vazio)  ZERO testes editados
git diff --name-only backend/src/                   → (vazio)  ZERO arquivos de produção
git show --stat b69eb63                             → 2 files, 5 insertions(+), 5 deletions(-)
git show b69eb63 --name-only                        → backend/package.json, backend/package-lock.json
git diff --diff-filter=D --name-only b69eb63~1 b69eb63 → (vazio)  nenhuma deleção
git status --porcelain backend/agendor.db           → (vazio)
git stash list                                      → (vazio)

--- Changelog e fonte ---
grep -c "BREAKING" node_modules/nodemailer/CHANGELOG.md → 3  (9.0.0, 8.0.0, 7.0.0 — e nada mais)
diff <(v6 _formatError) <(v9 _formatError)          → 1 linha (let → const), zero mudança de comportamento
grep CONNECTION_TIMEOUT/SOCKET_TIMEOUT/GREETING_TIMEOUT → 2min/10min/30s nas DUAS versões
grep "new Error('Timeout'), 'ETIMEDOUT'"            → linha idêntica nas duas versões
grep "_onError(error, 'ESOCKET', false, 'CONN')"    → linha idêntica nas duas versões
grep -c "_fallbackAddresses" v6 → 0   |   v9 → 3    ← ACHADO NOVO (fallback de DNS do 8.0.0)

--- Superfície do projeto (prova dos vereditos "não afeta") ---
grep -rn "SES\|attachments\|raw:\|oauth2\|OAuth2\|proxy\|dkim\|List-\|envelope\|pool" backend/src/ → 0 relevantes
grep -rn "rejectUnauthorized" backend/src/          → 0   (TLS NÃO foi afrouxado)
chaves entregues a sendMail em emailer.js           → from, to, subject, html  (e nada mais)
```

## Next Phase Readiness

- **Checkpoint C3 + C4 é a única coisa entre este plano e o 04-06.** `auto_advance` está **OFF** por decisão Q4 do usuário; o avanço exige o sinal explícito.
- **04-06 (status de notificação) sem interseção com este plano.** Ele altera `scheduler.js:109-164` e `routes/notifications.js`; este plano não tocou nenhum arquivo de código. A única herança é operacional: `npm install` em `backend/` depois de puxar.
- **Aviso que continua valendo para 04-06 e 04-07:** não copiar `mock.timers.tickAsync` do `04-RESEARCH.md` — a API não existe no Node 20 do CI. Usar `avancarRelogioAte` (`emailer.timeout.test.js:78-101`) como molde. (A pesquisa já foi corrigida em `5b11476`.)
- **Item para a Fase 5 (observabilidade):** o fallback de conexão por endereço DNS descoberto aqui torna o `connectionTimeout` um teto **por endereço**, não por tentativa. Se o `notification_log` passar a mostrar `ETIMEDOUT` com latência bem acima de 10s na fase de conexão, a causa é essa, e o ajuste é baixar `connectionTimeout` — não reverter o major.
- **`sec-02` continua pendente, agora com inventário nominal.** 8 advisories no backend (2 high: `brace-expansion`, `path-to-regexp`), mais o frontend intocado (`vite` 5→8 e cia.). Nenhum é escopo da Fase 4 (D-06). O gate de `npm audit` no CI segue adiado por escolha registrada, não por esquecimento.
- **Sem blockers.** Nada adiado para `deferred-items.md`.

## Self-Check: PASSED

- `backend/package.json` — FOUND (contém `"nodemailer": "^9.0.4"`)
- `backend/package-lock.json` — FOUND (`nodemailer` em 9.0.4)
- `.planning/todos/pending/sec-02-dependency-vulnerabilities.md` — FOUND
- `.planning/phases/04-confiabilidade-das-integra-es/04-05-SUMMARY.md` — FOUND
- Commit `b69eb63` — FOUND
- Commit `ff4d397` — FOUND

---

_Phase: 04-confiabilidade-das-integra-es_
_Completed: 2026-08-04 (Task 1); checkpoint C3+C4 aguardando aprovação humana_
