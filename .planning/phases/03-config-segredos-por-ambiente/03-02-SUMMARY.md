---
phase: 03-config-segredos-por-ambiente
plan: 02
subsystem: infra
tags: [boot, fail-fast, env-validation, node-test, subprocess, d-05, cfg-04]

# Dependency graph
requires:
  - phase: 03-config-segredos-por-ambiente
    provides: "03-01: backend/src/config.js (REQUIRED + validateEnv) e o carregamento do .env por caminho absoluto"
  - phase: 01-rede-de-testes
    provides: "backend/test/setup.js e o runner node:test"
  - phase: 02-toolchain-e-ci
    provides: "gate de cobertura c8 (branches >= 60), npm run lint com Biome e o job secrets (gitleaks)"
provides:
  - "Fail-fast de configuração ATIVO no boot: backend/src/index.js requer ./config logo após o dotenv"
  - "backend/test/config.bootFailFast.test.js — 11 casos provando os dois ramos de D-05 em subprocessos isolados"
  - "Prova de ordenação: a validação roda antes de qualquer módulo local (Pitfall 2 / T-03-07)"
affects: [03-07-branch-protection, fase-06-hardening, deploy-pm2]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Teste de comportamento de boot via child_process.spawnSync com ambiente CONSTRUÍDO À MÃO (nunca ...process.env)"
    - "Exercitar src/index.js em teste só no caminho que morre antes do app.listen; PORT=0 + killSignal SIGKILL como rede de segurança"
    - "Asserção de ORDEM de require por índice de linha, em vez de número de linha fixo"

key-files:
  created:
    - backend/test/config.bootFailFast.test.js
  modified:
    - backend/src/index.js

key-decisions:
  - "Task 1 (checkpoint humano do .env de produção) registrada como N/A: não existe servidor de produção nem deploy em /opt/agendor — a verificação foi transferida para o todo OPS-01"
  - "O discriminante do teste de boot real é a MENSAGEM (Configuração incompleta + ALLOWED_ORIGINS/ADMIN_USERS), não o código de saída: sem a ligação, quem estouraria seria o secret.js, também com saída != 0"
  - "As 5 obrigatórias são passadas VAZIAS ao subprocesso de boot: o dotenv não sobrescreve chave já presente em process.env, então o backend/.env real não interfere no resultado"
  - "O critério 'linha 2' do plano foi reescrito como 'nada executável entre o dotenv e a validação' — ver Deviations #1"

patterns-established:
  - "Valores dummy em teste devem ser legíveis e de baixa entropia (dummy-*, *.invalid): o job secrets roda em todo PR"

requirements-completed: [CFG-04]

# Metrics
duration: 22min
completed: 2026-07-30
---

# Phase 3 Plan 02: Fail-fast de Configuração no Boot Summary

**`backend/src/index.js` passa a validar as 5 variáveis obrigatórias antes de carregar qualquer módulo local — produção se recusa a subir sem elas, desenvolvimento sobe avisando — com 11 casos em subprocesso provando os dois ramos sem deixar listener nem cron vivos.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-30T17:45:00Z
- **Completed:** 2026-07-30T18:07:00Z
- **Tasks:** 2 (1 executada, 1 N/A) — 2 commits de código (RED/GREEN)
- **Files modified:** 2 (1 criado, 1 modificado)

## Accomplishments

- **CFG-04 fechado.** `require('./config')` entrou no `index.js` imediatamente após o `dotenv`
  (linha 15, depois de 10 linhas de comentário explicando o *porquê*) e **antes** do primeiro módulo
  local. Com `NODE_ENV=production` e qualquer obrigatória ausente, o processo morre no require com a
  lista completa do que falta; fora de produção, sobe com `[WARN] [Config] …`.
- **Ordem verificada, não presumida:** `require('./config')` na linha 15, `./middleware/auth` na 70,
  `./routes/auth` na 74 — a validação precede o `secret.js` **e** o `db.js` (que abre e semeia o
  SQLite no load). O teste do boot real confirma empiricamente que o arquivo de banco **não é criado**
  quando o boot falha (Pitfall 2 / T-03-07).
- **Os 4 comportamentos exigidos estão cobertos por teste automatizado**, todos com valores dummy:
  1. produção + faltando → saída != 0 e `stdout` vazio;
  2. produção + as 5 presentes → saída 0, `stderr` vazio;
  3. `development` **e** `NODE_ENV` ausente + faltando → saída 0 com aviso (dois casos separados);
  4. a mensagem nomeia a faltante e **nenhum** dos 4 valores presentes aparece no `stderr`.
- **Boot local real conferido** (`DB_PATH` temporário, `PORT=0`, SIGTERM após 3 s): avisa exatamente
  sobre `ALLOWED_ORIGINS` e `ADMIN_USERS` — as duas que faltam no `.env` desta máquina — sobe normal e
  encerra com o shutdown gracioso. Nenhum processo remanescente.
- **Suíte: 67 → 78 testes verdes.** Cobertura de branches **71,52 % → 72,72 %** (piso 60).
  `npm run lint` e `npm run test:coverage` saem 0.

## Task Commits

1. **Task 2 (RED): teste vermelho do fail-fast no boot** — `8647036` (test) — 11 casos, 3 vermelhos
   (os que dependem da ligação no `index.js`), 8 verdes desde o início (o `config.js` de 03-01 já
   fazia sua parte).
2. **Task 2 (GREEN): `require('./config')` no boot** — `3c7f2b1` (feat) — 11/11 verdes.

Nenhuma fase REFACTOR foi necessária.

## Task 1 — N/A (não aplicável)

**A Task 1 era um `checkpoint:human-verify` bloqueante: auditar as 5 obrigatórias no `.env` de
produção antes de ligar o `throw` (D-13). Ela é registrada como N/A — nem aprovada, nem bloqueada.**

**Justificativa (declaração do usuário, 2026-07-30):** *não existe servidor de produção e não existe
deploy em `/opt/agendor`; o projeto roda apenas localmente no Mac do desenvolvedor.*
`ecosystem.config.js`, `deploy/instalar.sh` e `deploy/nginx.conf` são configuração aspiracional para
um servidor que nunca foi criado.

O racional de D-13 — "ligar o `throw` derruba o backend no próximo `pm2 restart`" — descreve um risco
que **hoje não existe**, porque não há nada implantado para derrubar. Não faz sentido bloquear a fase
esperando acesso a uma máquina inexistente, nem faz sentido marcar o checkpoint como aprovado:
ninguém verificou um `.env` de produção, porque não há um.

**Nada foi perdido:** a verificação vira pendência rastreada em
`.planning/todos/pending/ops-01-validar-env-e-pm2-no-primeiro-deploy.md` (OPS-01, prioridade alta,
alvo Fase 8 / primeiro deploy), com os três comandos originais do checkpoint preservados literalmente,
os dois riscos herdados da fase (SMTP_PASS sem caminho de recuperação pela UI; possível
`/opt/agendor/.env` órfão) e a regra de decisão.

**O que substituiu a verificação humana, dentro do que é possível a partir do repositório:** a
cobertura automatizada descrita acima, incluindo o boot real do `index.js` em modo produção e o boot
local em modo desenvolvimento. O que nenhum teste pode substituir continua sendo o conteúdo de um
`.env` que não existe.

## Files Created/Modified

- `backend/test/config.bootFailFast.test.js` (novo, 11 casos) — helper `bootConfig(env)` que roda
  `require('./src/config')` num filho com ambiente construído à mão; casos 1-4 (comportamentos de
  D-05), caso do boot real do `index.js`, dois casos de ordem de `require` sobre a fonte, e um caso
  que documenta a divisão de papéis com o `secret.js`.
- `backend/src/index.js` (modificado, +11/-0) — a linha `require('./config');` mais 10 linhas de
  comentário em PT com as duas razões de ordenação e a citação de CFG-04 / D-04 / D-05. Nenhuma
  outra alteração (o arquivo está em `exclude` do `.c8rc.json`).
- `backend/src/secret.js` — **intocado** (`git diff --stat` vazio), como manda o plano.
- `backend/test/setup.js` — **não tocado**; a regra append-only foi respeitada por omissão.

## Decisions Made

- **O discriminante do teste de boot real é a mensagem, não o código de saída.** Sem
  `require('./config')`, o boot com as obrigatórias vazias **também** sai != 0 — só que estourando no
  `secret.js`, cuja mensagem fala apenas do JWT. Só a validação central menciona `ALLOWED_ORIGINS` e
  `ADMIN_USERS`; é isso que o teste afirma, e foi assim que ele nasceu vermelho e ficou verde.
- **As 5 obrigatórias são passadas vazias, não removidas, no teste do boot real.** O `dotenv` não
  sobrescreve chave já presente em `process.env`, então definir `''` neutraliza o `backend/.env` real
  sem depender do que ele contém. O caso é determinístico em qualquer máquina, e o processo não tem
  como prosseguir até o `app.listen` (o `throw` em produção é incondicional).
- **`PORT=0` + `killSignal: 'SIGKILL'` + `timeout` no único caso que toca o `index.js`.** Rede de
  segurança: mesmo num cenário inesperado em que o boot prosseguisse, a porta seria efêmera (nunca a
  3001) e o filho morreria no timeout do `spawnSync`. Nenhum teste deixa listener ou cron vivo.
- **Valores dummy legíveis e de baixa entropia** (`dummy-agendor-token`, `ops@example.invalid`): o job
  `secrets` (gitleaks) roda em todo PR desde 03-06, e um valor com cara de aleatório viraria
  falso-positivo — que só se resolveria mexendo no `.gitleaksignore`, coisa que esta fase não faz.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] O critério "linha 2" tornou-se factualmente impossível depois do 03-01**

- **Found during:** Task 2, ao escrever a asserção de ordem.
- **Issue:** O plano exige que a **linha 2** do `index.js` case `/require\('\.\/config'\)/`, e o
  comando de verify checa `L[1]` literalmente. Mas o próprio 03-01 inseriu **3 linhas de comentário**
  antes da chamada do `dotenv`, que hoje é a linha 4. Satisfazer o critério ao pé da letra exigiria
  apagar o comentário que explica o Pitfall 1 — degradar código correto para agradar um número.
- **Fix:** O critério foi reescrito preservando integralmente a intenção (declarada no RESEARCH
  §"Ordem de carregamento": *depois do dotenv, antes de tudo o mais*) em duas asserções mais fortes e
  imunes a comentários novos: (a) entre a linha do `dotenv` e a do `./config` só pode haver linhas em
  branco ou comentários — nada executável; (b) `require('./config')` precede o **primeiro** `require`
  de módulo local qualquer, não apenas `./middleware/auth` e `./routes/auth`.
- **Files modified:** `backend/test/config.bootFailFast.test.js`
- **Verification:** as duas asserções nascem vermelhas sem a ligação e ficam verdes com ela — o teste
  discrimina de fato os dois estados. Registro factual: `./config` na linha 15, primeiro módulo local
  (`./middleware/auth`) na 70.
- **Committed in:** `8647036` (RED) / `3c7f2b1` (GREEN)

**2. [Rule 1 - Bug] Asserção de ordem passava por vacuidade quando `./config` estava ausente**

- **Found during:** Task 2, na primeira execução do RED.
- **Issue:** O caso "a validação vem antes de qualquer outro módulo local" comparava
  `iConfig < iPrimeiroLocal` sem antes checar `iConfig !== -1`. Com o `require` ausente,
  `findIndex` devolve `-1`, que é menor que qualquer índice — o teste passava **verde** exatamente no
  estado que deveria reprovar.
- **Fix:** `assert.notEqual(iConfig, -1, …)` adicionado antes da comparação.
- **Files modified:** `backend/test/config.bootFailFast.test.js`
- **Verification:** os vermelhos do RED subiram de 2 para 3 após a correção — a prova de que a
  asserção estava mesmo furada.
- **Committed in:** `8647036` (RED)

**3. [Rule 3 - Blocking] `env -i` quebra o wrapper `~/bin/node` — subprocessos usam `process.execPath`**

- **Found during:** Task 2, ao medir o comportamento do boot antes de escrever o teste.
- **Issue:** O comando de verify do plano usa `env -u …`/`env -i` com o `node` do `PATH`. Nesta
  máquina `~/bin/node` é um wrapper `bash` que faz `exec "$HOME/node-v22/bin/node"` — com o ambiente
  zerado, `$HOME` some e o wrapper falha com exit 126 (`No such file or directory`), sem nunca chegar
  a rodar o Node.
- **Fix:** Todos os subprocessos do teste usam `process.execPath` (o binário real já resolvido),
  o que torna o arquivo independente de `PATH`, de wrapper e de shell — inclusive no CI (Ubuntu).
- **Files modified:** `backend/test/config.bootFailFast.test.js`
- **Verification:** 11/11 verdes localmente; nenhuma dependência de `PATH` no arquivo.
- **Committed in:** `8647036`

### Checkpoint declarado N/A

**4. Task 1 (`checkpoint:human-verify`, `gate="blocking-human"`) registrada como N/A**

- **Motivo:** não existe servidor de produção — ver a seção "Task 1 — N/A" acima para a justificativa
  completa e a rastreabilidade (OPS-01).
- **Impacto no risco:** T-03-06 (indisponibilidade em produção por `.env` incompleto) muda de
  *mitigado por auditoria humana* para *inaplicável hoje, com verificação transferida para o primeiro
  deploy*. A outra metade da mitigação de D-13 — o carregamento determinístico do `.env`, entregue em
  03-01 — continua em vigor e coberta por teste.

---

**Total deviations:** 3 auto-corrigidos + 1 checkpoint declarado N/A por instrução explícita do usuário.
**Impact on plan:** Nenhum desvio de escopo. Os itens 1 e 2 corrigem asserções que, seguidas ao pé da
letra, produziriam um critério impossível e um teste vacuosamente verde. As decisões travadas (D-04,
D-05, D-06) foram honradas sem exceção; D-13 teve sua metade humana declarada inaplicável, com o
motivo registrado e a pendência criada.

## Issues Encountered

- **`env -i` + wrapper do Node** (Deviations #3) — vale para qualquer plano futuro que precise de
  subprocesso com ambiente controlado nesta máquina: usar `process.execPath`, nunca `node` do `PATH`.
- **`npx` continua inutilizável** (herdado de 03-01): o Biome foi invocado por caminho direto
  (`node node_modules/@biomejs/biome/bin/biome …`).

## Verificação Final

```
npm run lint                                            → exit 0
npm run test:coverage                                   → exit 0, 78/78 testes, branches 72,72 % (piso 60)
node --test test/config.bootFailFast.test.js            → 11/11 verdes
grep -n "require('./config')" backend/src/index.js      → 15   (antes de middleware/auth:70 e routes/auth:74)
git diff --stat -- backend/src/secret.js                → vazio (intocado)
git diff -U0 -- backend/test/setup.js                   → vazio (append-only respeitado)
boot local (dev, DB temporário, PORT=0)                 → avisa ALLOWED_ORIGINS/ADMIN_USERS, sobe, encerra limpo
lsof -iTCP:3001 -sTCP:LISTEN após a suíte               → nenhum
```

## Known Stubs

Nenhum. Todo código entregue está exercitado por teste.

## User Setup Required

Nenhum agora — e é justamente esse o ponto da Task 1 declarada N/A. **No dia em que existir um
servidor de produção**, antes do primeiro `pm2 start`, executar o roteiro de
`.planning/todos/pending/ops-01-validar-env-e-pm2-no-primeiro-deploy.md`: com o fail-fast ligado,
faltar qualquer uma das 5 obrigatórias em `NODE_ENV=production` significa um processo que **não sobe**.

## Next Phase Readiness

**CFG-04 fechado de fato**, não por marcação: o boot valida, o teste prova os dois ramos, e o
comportamento foi conferido também num boot local real.

**Para 03-07** (último plano da fase): nada aqui muda o `ci.yml` nem o `.gitleaksignore`. Os valores
dummy deste teste foram escolhidos para não acionar o gitleaks — se o job `secrets` reclamar deles, a
correção é trocar o valor no teste, **não** adicionar fingerprint ao `.gitleaksignore`.

**Para a Fase 6 (hardening):** `ADMIN_USERS` agora é obrigatória no boot, o que fecha por
*configuração* o buraco do `requireAdmin()`. O fail-open no código permanece — SEC-03 continua de pé.

## Self-Check: PASSED

Arquivos declarados existem em disco (`backend/test/config.bootFailFast.test.js`,
`backend/src/index.js` com o `require('./config')` na linha 15,
`.planning/todos/pending/ops-01-validar-env-e-pm2-no-primeiro-deploy.md`) e os 2 commits de task
existem no histórico (`8647036`, `3c7f2b1`).

---
*Phase: 03-config-segredos-por-ambiente*
*Completed: 2026-07-30*
