---
phase: 04-confiabilidade-das-integra-es
plan: 04
subsystem: integrations
tags:
  [
    timeout,
    smtp,
    nodemailer,
    emailer,
    node-test,
    mock-timers,
    caracterizacao,
    rel-02,
    d-02,
    d-03,
  ]

# Dependency graph
requires:
  - phase: 03-config-segredos-por-ambiente
    plan: 03
    provides: 'emailer.smtpPass.test.js — o molde exato deste arquivo: mesma borda, mesmo mock de nodemailer.createTransport, mesmo caminho público verifySmtp() até a fábrica privada'
  - phase: 04-confiabilidade-das-integra-es
    plan: 03
    provides: 'precedente de prova por inspeção dos argumentos da fábrica (createArgs do fakeAxios) — aqui aplicado à borda SMTP em vez da HTTP'
provides:
  - 'connectionTimeout: 10000, greetingTimeout: 10000 e socketTimeout: 30000 na fábrica createTransporter — teto de tempo nos 6 call-sites SMTP do sistema'
  - 'backend/test/emailer.timeout.test.js — 9 casos: 4 de configuração (D-02) + 5 de caracterização do caminho de envio (D-03)'
  - 'Oráculo real do caminho de envio para o bump de nodemailer 6→9 do 04-05: exaustão sem throw, recriação do transporter no retry e retorno por destinatário estão pinados'
  - 'Helper avancarRelogioAte — relógio falso portátil para Node 20 (mock.timers.tickAsync só existe no Node 23+)'
affects: [04-05-bump-nodemailer, 04-06-status-de-notificacao, 05-observabilidade]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Relógio falso portátil sem tickAsync: alternar setImmediate REAL (não mockado) para drenar microtasks e mock.timers.tick() para avançar o relógio, com laço limitado que falha explicitamente em vez de travar'
    - 'Handler mutável de stub (aoEnviar) parametrizado pelo número da tentativa — permite exaustão, sucesso-após-falha e falha permanente no MESMO arquivo, sem reinstalar mock (Pitfall 4)'
    - 'Asserção de conjunto EXATO de chaves do item de retorno (Object.keys(item).sort()) para provar que error está AUSENTE no sucesso, não null'

key-files:
  created:
    - backend/test/emailer.timeout.test.js
  modified:
    - backend/src/emailer.js

key-decisions:
  - 'Os três timeouts vivem na FÁBRICA, não nos call-sites: createTransporter é o único ponto por onde passam os 6 caminhos de envio — repetir seriam 6 lugares para divergir'
  - 'mock.timers.tickAsync foi substituído por um helper próprio: a API só existe a partir do Node 23 e o alvo do projeto (engines + matriz do CI) é Node 20, onde ela é undefined'
  - 'O cenário de exaustão NÃO usa assert.rejects — a promessa resolve com { success:false }, e é justamente isso que D-03 manda preservar'
  - 'Erros injetados fiéis ao nodemailer: ESOCKET com mensagem read ECONNRESET, nunca { code: ECONNRESET } — o _formatError sobrescreve err.code e o ramo de código é inalcançável'
  - 'O caso (8) roda deliberadamente SEM mock.timers: se um erro permanente passar a ser retentado, a lentidão de 9s reais é o próprio alarme'
  - 'nodemailer permanece em 6.10.1 — o bump 6→9 é escopo exclusivo do 04-05, e package.json não foi tocado'

requirements-completed: [REL-02]

# Metrics
duration: 21min
completed: 2026-08-04
---

# Phase 4 Plan 04: Teto de Tempo na Borda SMTP Summary

**Os 6 call-sites SMTP do sistema passaram a nascer com teto de tempo explícito por uma mudança de 3 chaves numa única fábrica, e o caminho de envio — antes com 7,16% de cobertura — ganhou o oráculo de 9 casos que vai julgar o major do nodemailer no 04-05.**

## Performance

- **Duration:** 21 min
- **Tasks:** 2 (Task 1 em TDD: RED → GREEN; Task 2 aditiva de testes)
- **Files modified:** 2 (1 criado, 1 modificado)
- **Diff de produção:** 14 adições, **0 remoções** em 1 arquivo
- **Diff de teste:** 332 adições, 2 remoções em 1 arquivo

## Accomplishments

- **O socket de 10 minutos deixou de existir.** Sem opções de timeout valiam os defaults do nodemailer — 2min de conexão, 30s de saudação e **10 minutos** de socket. Com as 3 tentativas de `sendMailWithRetry`, um único destinatário problemático podia segurar a rodada por ~30 minutos. Com `socketTimeout: 30000` o pior caso por destinatário cai para **~1min40s** (3 × 30s + as esperas de 3s e 6s), e o teste calcula esse número em vez de confiar nele.
- **Uma mudança, seis coberturas.** As três chaves entraram em `createTransporter()` (`emailer.js:12-35`), que é o único ponto por onde passam os 6 call-sites: o retry (`:210`), o alerta diário (`:219`), os dois resumos semanais (`:396` e `:702`), o `POST /api/config/test-smtp` (`:417`) e o reset de senha (`:422`). O grep de aceite confirma: `connectionTimeout` aparece **exatamente 1 vez** no arquivo.
- **`emailer.js` saiu de 7,16% para 35,67% de cobertura de linhas**, com **82,14% de branches** — a maior subida de um único arquivo na fase. O agregado do backend foi de 52,38/68,55 para **53,66 stmts / 75,74 branches** (pisos 20/60).
- **O retry ficou pinado sem ser tocado.** `git diff --numstat` do `emailer.js` deu **14 adições e zero remoções**: nem uma linha de `sendMailWithRetry` mudou, e o `console.warn` legado de `:205` (que o contrato manda preservar até a Fase 5) continua com exatamente 1 ocorrência.
- **Suíte de 103 para 112 testes**, e o arquivo novo roda em **165ms** — as esperas de 3s e 6s do retry são simuladas, não vividas.

## O que cada teste novo prova

`backend/test/emailer.timeout.test.js` — 9 casos, 330 linhas.

### Configuração (D-02) — Task 1, em TDD

| # | Cenário | Status no RED |
| - | ------- | ------------- |
| 1 | O transporte nasce com os 3 timeouts de D-02 | ✗ falhou |
| 2 | Host, porta, `secure` e usuário continuam vindo da tabela `config` | ✓ já passava |
| 3 | O teto é real: `socketTimeout` < 10min e `connectionTimeout` < 2min, e o pior caso calculado por destinatário ≤ 100s | ✗ falhou |
| 4 | Cada chamada à fábrica produz transporte novo, todos com os mesmos timeouts | ✗ falhou |

O RED foi verificado literalmente: **3 de 4 falharam**. O caso (2) é o único que **deve** passar nos dois estados — é não-regressão do híbrido de D-01 (senha do env, resto do banco), não medição da mudança. Se alguém reescrever o objeto da fábrica em vez de acrescentar chaves, é ele que acusa.

### Caracterização do caminho de envio (D-03) — Task 2

| # | Cenário | O que pina |
| - | ------- | ---------- |
| 5 | Exaustão das 3 tentativas **resolve** com `{ success:false, error: string }` | Que a promessa **não rejeita** — e `sendMail` foi chamado exatamente **3** vezes |
| 6 | Falha de rede seguida de sucesso ainda envia | `createTransport` chamado **mais de uma vez** → a recriação do transporter de `emailer.js:210` |
| 7 | Dois destinatários distintos → 2 itens, chaves exatamente `{ to, success }` | O contrato de retorno, com `error` **ausente** no sucesso (não `null`) |
| 8 | `authorEmail === ownerEmail` → **1** item | A guarda de `emailer.js:242` contra o e-mail duplicado |
| 9 | Erro permanente (`550 Mailbox unavailable`) não é retentado | 1 tentativa para o dono, e o **autor ainda recebe** — D-03 em uma linha |

O caso (9) roda **deliberadamente sem `mock.timers`**: se algum dia um erro permanente passar a ser retentado, ele gasta 9 segundos reais e a lentidão é o próprio alarme.

## Task Commits

1. **Task 1 — RED: os 3 timeouts de D-02** — `e795025` (`test`)
2. **Task 1 — GREEN: timeouts explícitos no transporte SMTP** — `f63d12f` (`feat`)
3. **Task 2 — caracterização de exaustão, retry e retorno por destinatário** — `53b8248` (`test`)

## Files Created/Modified

- `backend/src/emailer.js` **(modificado, +14 −0)** — dois hunks, ambos dentro/acima de `createTransporter`: um parágrafo de DECISÃO em PT-BR acrescentado ao comentário-bloco já existente (por que na fábrica e não nos 6 call-sites, qual era o default do nodemailer, e por que o socket de 10 minutos era o problema), e as três chaves no objeto entregue a `nodemailer.createTransport`, cada uma com o comentário da fase que ela limita (TCP estabelecido / banner 220 / inatividade). `host`, `port`, `secure` e `auth` intactos. **Zero remoções no arquivo inteiro.**
- `backend/test/emailer.timeout.test.js` **(criado, 330 linhas)** — bootstrap no molde de `emailer.smtpPass.test.js`: `require('./setup')` → `setConfig` dos 4 valores sintéticos `*.invalid` → `mock.method(nodemailer, 'createTransport')` → `require('../src/emailer')`. Stub único para o arquivo inteiro, com o comportamento variando por um handler mutável (`aoEnviar`) que recebe o número da tentativa — nenhum mock é reinstalado no meio do arquivo (Pitfall 4).

## Decisions Made

- **Os timeouts na fábrica, não nos call-sites.** É a decisão que multiplica o efeito: 3 chaves cobrindo 6 caminhos de envio. Repeti-las em cada `createTransporter()` chamado seriam 6 lugares para divergir, e a próxima função de envio nasceria sem teto. O comentário no código registra isso, para que ninguém "otimize" movendo a configuração para quem chama.
- **`mock.timers.tickAsync` foi trocado por um helper próprio — e essa é a descoberta mais importante deste plano.** O plano e a pesquisa (§Pitfall 3) prescreviam `tickAsync`. Ele **não existe no Node 20** (alvo declarado em `engines` e na matriz do CI) nem no Node 22.13.1 desta máquina — só a partir do v23. Um teste com `tickAsync` morreria com `TypeError` no CI. O substituto: alternar `setImmediate` **real** (não está mockado, porque só habilitamos `apis: ['setTimeout']`) para drenar as microtasks entre as tentativas, e `mock.timers.tick()` para avançar o relógio. O laço é limitado a 20 iterações e **lança uma mensagem explícita** se a promessa não concluir, em vez de travar a suíte.
- **Nenhum `assert.rejects` no cenário de exaustão.** Seria a escrita instintiva — "as 3 tentativas falharam, logo deve dar erro". É exatamente o oposto do que D-03 manda preservar: `sendMailWithRetry` **retorna** `{ success:false, error }` e o scheduler conta com receber a lista para seguir ao próximo destinatário. O teste assere que a promessa resolve e que o array tem o item do destinatário — se alguém "melhorar" o retry para lançar, ele fica vermelho.
- **Erros injetados fiéis ao que o nodemailer produz.** O `_formatError` do nodemailer **sobrescreve** `err.code`, e o listener de socket usa o tipo `'ESOCKET'` — um `ECONNRESET` nativo chega ao retry como `code: 'ESOCKET'`, e o único ramo que de fato o captura é o da **mensagem** (`emailer.js:201`). Injetar `{ code: 'ECONNRESET' }` daria verde num caminho que a biblioteca real nunca produz. A única ocorrência de `'ECONNRESET'` no arquivo está na **mensagem** (`read ECONNRESET`), com `code: 'ESOCKET'`.
- **O caso do erro permanente entrou por acréscimo.** O plano pedia 4 cenários; o (9) — `550 Mailbox unavailable` não retentado, com o outro destinatário ainda recebendo — é o que prova que o retry **discrimina**, em vez de gastar 3 tentativas em toda falha. Sem ele, um "simplificar a condição `isNetworkError`" passaria despercebido.
- **PC-13 respeitado integralmente.** Nenhuma asserção imprime o objeto de opções nem o usa em `deepStrictEqual` — ele carrega `auth.pass`. O valor da senha é assunto de `emailer.smtpPass.test.js`; aqui assere-se apenas `typeof auth.pass === 'string'`.

## Deviations from Plan

### Desvio técnico (Rule 3 — bloqueio: API inexistente no runtime alvo)

**1. `mock.timers.tickAsync` substituído pelo helper `avancarRelogioAte`**

- **Encontrado durante:** Task 2, antes de escrever qualquer cenário (verificação preventiva de compatibilidade).
- **Issue:** o plano (`<action>` da Task 2) e o `04-RESEARCH.md` (§Pitfall 3) instruíam `await mock.timers.tickAsync(3000)`. Medido nesta máquina: `typeof mock.timers.tickAsync === 'undefined'` no Node 22.13.1. A API foi adicionada no **Node 23**; o alvo do projeto é **Node 20** (`engines.node` do `backend/package.json` e `node-version: '20'` nas duas linhas do `ci.yml`). O teste teria falhado com `TypeError` — localmente e no CI.
- **Fix:** helper `avancarRelogioAte(promessa)` no próprio arquivo de teste, com o "porquê" documentado em 8 linhas de comentário. Alterna `await new Promise(r => setImmediate(r))` — `setImmediate` **não** é mockado, pois só habilitamos `apis: ['setTimeout']`, então ele cede o event loop e todas as microtasks pendentes drenam — com `mock.timers.tick(10000)`. Laço limitado a 20 iterações, com `throw` explícito se não concluir.
- **Verificação:** validado isoladamente antes de aplicar (9s de esperas simuladas em **1ms real**), e depois no arquivo completo: 9 casos em **165ms**.
- **Files modified:** apenas `backend/test/emailer.timeout.test.js` (nenhuma mudança de produção).
- **Commit:** `53b8248`
- **Impacto no contrato:** nenhum. A intenção de Pitfall 3 — "não gastar 9 segundos reais por cenário" — foi cumprida; só o mecanismo mudou, por incompatibilidade de versão.

### Ajuste de forma

**2. Três commits em vez do único listado no `<output>` do plano**

O plano enumerava `feat(04-04): timeouts explícitos no transporte SMTP (REL-02)`. A Task 1 é `tdd="true"`, e o protocolo exige RED separado do GREEN — mesmo precedente do 04-02 e do 04-03. Ficaram: RED (`e795025`), GREEN (`f63d12f`) e os testes de caracterização da Task 2 (`53b8248`). O rollback continua sendo o revert dos três, sem ambiguidade — nenhum deles toca dependências.

**3. Nove casos de teste em vez dos ~5 pedidos**

O critério de aceite pedia "≥ 5 testes". A Task 1 rendeu 4 (o plano descrevia 1 cenário; separá-lo em configuração, não-regressão, teto real e transporte-novo torna cada falha diagnóstica em vez de agregada) e a Task 2 rendeu 5, sendo o (9) um acréscimo justificado acima. Nenhum arquivo de teste pré-existente foi editado.

---

**Total deviations:** 1 desvio técnico (bloqueio real, resolvido) + 2 ajustes de forma
**Impact on plan:** Nenhum scope creep. Todos os critérios de aceite das 2 tasks foram satisfeitos, incluindo os greps literais e o limite de 10s de duração da suíte.

## Issues Encountered

**A pesquisa da fase contém uma instrução que não roda no runtime alvo.** `04-RESEARCH.md` §Pitfall 3 recomenda `mock.timers.tickAsync` como se estivesse disponível — está, no Node 23+, mas não no Node 20 do CI. O 04-06 (`notificationStatus.test.js`) e o 04-07 (`agendor.cacheInvalidation.test.js`) ainda vão consultar essa seção. **Quem for escrever esses planos deve usar o helper `avancarRelogioAte` deste arquivo como referência, não o `tickAsync` da pesquisa.**

**Cobertura: `emailer.js` continua com 64% de linhas descobertas, e isso é esperado.** As faixas não cobertas (`:393-395, 395-415, 422-473, 477-689, 691-746`) são os templates HTML dos resumos semanais e o reset de senha — nenhum deles é escopo de REL-02. O que este plano precisava cobrir era o **caminho de envio**, e ele está: `sendMailWithRetry` e `sendStaleNotification` inteiros, com 82,14% de branches no arquivo.

**Nenhum stub introduzido.** Não há valores vazios codificados, placeholders nem TODO/FIXME nos arquivos tocados.

## Threat Flags

Nenhuma superfície de segurança nova fora do `<threat_model>` do plano. As disposições registradas foram cumpridas:

- **T-04-04-01 (mitigate)** — `connectionTimeout: 10000`, `greetingTimeout: 10000`, `socketTimeout: 30000` na fábrica; provado por inspeção das opções entregues a `nodemailer.createTransport` e pelo cálculo do pior caso (≤ 100s) no caso (3).
- **T-04-04-02 (mitigate)** — PC-13 cumprido: zero `deepStrictEqual` sobre o objeto de opções, zero impressão dele em mensagem de asserção; sobre `auth.pass` assere-se apenas o tipo. `setup.js` continua forçando `SMTP_PASS=''` e o arquivo **não** o sobrescreve.
- **T-04-04-03 (accept)** — 30s de `socketTimeout` aceito como risco R-4. Sinal de alerta em produção: `ETIMEDOUT` frequente no `notification_log`. Rollback é uma linha.
- **T-04-04-04 (mitigate)** — semântica de retry intocada e pinada: contagem exata de 3 tentativas, recriação do transporter, retorno `{ success:false }` sem throw, `console.warn` preservado (1 ocorrência) e diff de produção com **zero remoções**.
- **T-04-04-SC (accept)** — nenhuma instalação de pacote. `npm ls nodemailer` → **6.10.1**; `package.json` e `package-lock.json` não aparecem no `git status` deste plano.

## User Setup Required

Nenhuma. Os testes não abrem conexão de rede (a borda SMTP inteira é substituída por `mock.method`), não dependem de espera real e não tocam `backend/agendor.db` (`git status --porcelain backend/agendor.db` vazio). Nenhuma dependência nova — `node_modules` inalterado.

## Verification

```
node --test test/emailer.timeout.test.js   (RED)    → 4 tests, 1 pass, 3 fail
node --test test/emailer.timeout.test.js   (GREEN)  → 4 tests, 4 pass, 0 fail
npm test                                   (GREEN)  → 107 tests, 107 pass, 0 fail
node --test test/emailer.timeout.test.js   (Task 2) → 9 tests, 9 pass, 0 fail  em 165ms
npm run test:coverage                               → exit 0 | 112 tests, 112 pass, 0 fail
npm run lint                                        → exit 0 (45 warnings — baseline inalterado)
npm ls nodemailer                                   → nodemailer@6.10.1  (inalterado)

Ondas 1-3 revalidadas em conjunto:
node --test test/scheduler.resilience.test.js test/scheduler.failsafe.test.js \
            test/agendor.timeout.test.js test/notifications.resolved.test.js \
            test/emailer.smtpPass.test.js       → 28 tests, 28 pass, 0 fail

All files          | 53.66 stmts | 75.74 branch | 54.32 funcs | 53.66 lines   (pisos 20/60/20/20)
 emailer.js        | 35.67       | 82.14        | 53.84       | 35.67   (era 7,16)
 agendor.js        | 90.42       | 74.44        | 100         | 90.42   (inalterado)
 scheduler.js      | 67.27       | 59.09        | 66.66       | 67.27   (inalterado)

grep -c "connectionTimeout: 10000" backend/src/emailer.js   → 1
grep -c "greetingTimeout: 10000"   backend/src/emailer.js   → 1
grep -c "socketTimeout: 30000"     backend/src/emailer.js   → 1
grep -c "connectionTimeout"        backend/src/emailer.js   → 1  (não repetido em call-site)
grep -c "console.warn"             backend/src/emailer.js   → 1  (legado de :205, preservado)
git diff --numstat backend/src/emailer.js                   → 14/0  (zero remoções: retry intocado)
git diff -U0 backend/src/emailer.js | grep "^@@"            → 2 hunks (:12 e :32), nenhum em sendMailWithRetry
git diff --name-only backend/src/ (Task 2)                  → (vazio)
grep -n "ECONNRESET" test/emailer.timeout.test.js           → só em comentário e em new Error('read ECONNRESET') com code ESOCKET
biome format test/emailer.timeout.test.js                   → No fixes applied
git status --porcelain backend/agendor.db                   → (vazio)
git stash list                                              → (vazio)
```

## Next Phase Readiness

- **04-05 (nodemailer 6→9) liberado, e agora com oráculo de verdade.** Era a dependência dura declarada no plano: com `emailer.js` a 7,16%, "a suíte continua verde sob v9" não provava nada sobre o caminho de envio. Agora 9 casos cobrem a fábrica, a exaustão, a recriação do transporter e o retorno por destinatário. As três opções de timeout existem com **os mesmos nomes e defaults** em 6.10.1 e 9.0.4 (verificado na pesquisa), então a mudança deste plano sobrevive ao bump — se algum dos 9 casos ficar vermelho sob v9, é **informação sobre o major**, não obstáculo a contornar (gatilho de parada C3/C5).
- **Delta de lockfile esperado no 04-05: uma única linha.** `nodemailer` não tem dependências. `npm audit` do backend parte de 9 (3 high) e deve chegar a 8 (2 high).
- **Aviso para o 04-06 e o 04-07:** não copiar `mock.timers.tickAsync` da pesquisa — ela não existe no Node 20. Usar `avancarRelogioAte` (`emailer.timeout.test.js:78-101`) como molde.
- **Sem blockers.** Nada adiado para `deferred-items.md`. `package.json` intocado, `node_modules` inalterado — quem puxar a branch não precisa de `npm install` por causa deste plano.

## Self-Check: PASSED

- `backend/src/emailer.js` — FOUND
- `backend/test/emailer.timeout.test.js` — FOUND
- Commit `e795025` — FOUND
- Commit `f63d12f` — FOUND
- Commit `53b8248` — FOUND

---

_Phase: 04-confiabilidade-das-integra-es_
_Completed: 2026-08-04_
