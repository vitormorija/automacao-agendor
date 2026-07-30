---
phase: 03-config-segredos-por-ambiente
plan: 01
subsystem: infra
tags: [dotenv, node-test, c8, env-validation, fail-fast, pm2, commonjs]

# Dependency graph
requires:
  - phase: 01-rede-de-testes
    provides: "backend/test/setup.js (neutralização de efeitos colaterais de require) e o runner node:test"
  - phase: 02-toolchain-e-ci
    provides: "gate de cobertura c8 (branches >= 60) e npm run lint com Biome"
provides:
  - "backend/src/config.js — módulo central com REQUIRED (5 obrigatórias de D-04) e a regra de validação numa função pura"
  - "validateEnv/findMissing/buildMessage: contrato testável dos dois ramos de D-05 (produção lança / demais avisam)"
  - "Carregamento determinístico do .env em backend/src/index.js:4, independente do process.cwd() (D-13, Pitfall 1)"
  - "Preset NODE_ENV='test' em backend/test/setup.js — a suíte nunca cai no ramo de produção"
  - "2 arquivos de teste novos (13 casos) cobrindo CFG-03/CFG-04"
affects: [03-02-boot-fail-fast, 03-03-smtp-pass-migration, 03-05-env-example, deploy-pm2]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Validador de ambiente = função pura + efeito de boot no fim do módulo (variação deliberada de secret.js)"
    - "Asserção sobre o código-fonte do bootstrap via fs.readFileSync + regex (index.js está fora da cobertura do c8)"
    - "Teste de dotenv com processEnv + arquivo temporário: nunca lê o backend/.env real"

key-files:
  created:
    - backend/src/config.js
    - backend/test/config.validateEnv.test.js
    - backend/test/config.dotenvPath.test.js
  modified:
    - backend/src/index.js
    - backend/test/setup.js

key-decisions:
  - "config.js entrega a regra numa função pura (validateEnv(env)) em vez do throw-no-topo de secret.js — protege a folga estreita do gate de branches e dispensa subprocesso no teste"
  - "config.js NÃO requer dotenv: quem carrega o .env é só o boot; a suíte jamais pode ler o .env real (T-03-03)"
  - "index.js continua SEM require('./config') — o fail-fast fica desligado até o checkpoint humano de 03-02 (D-13)"
  - "Preset NODE_ENV='test' no setup.js é sem guarda, pelo mesmo motivo de SMTP_PASS: um NODE_ENV=production herdado do shell/CI faria a suíte lançar"
  - "path.join(__dirname, '../.env') em uma única linha (em vez de '..','.env' em três linhas) para satisfazer o formatador Biome e o critério de grep simultaneamente"

patterns-established:
  - "Tag [Config] nos logs, no padrão [Scheduler]/[Auth]/[Emailer]/[Agendor]"
  - "Mensagem de configuração incompleta lista TODAS as faltantes de uma vez, com dica de como obter cada valor, e nunca ecoa valores (ASVS V7)"
  - "backend/test/setup.js é append-only: alterar linhas existentes faria o job de secret scanning barrar o próprio PR (Pitfall 10)"

requirements-completed: []  # CFG-03 e CFG-04 avançam aqui mas só fecham em 03-05 e 03-02 (D-13) — ver Deviations #5

# Metrics
duration: 34min
completed: 2026-07-29
---

# Phase 3 Plan 01: Fundação de Configuração Summary

**Módulo `backend/src/config.js` com a regra de obrigatoriedade de ambiente numa função pura (100 % de branches) e o carregamento do `.env` tornado independente do `cwd` — as duas peças entregues sem ligar o fail-fast ao boot.**

## Performance

- **Duration:** ~34 min
- **Started:** 2026-07-29T22:26:00Z
- **Completed:** 2026-07-29T23:00:00Z
- **Tasks:** 2 (4 commits — ciclo RED/GREEN por task)
- **Files modified:** 5 (3 criados, 2 modificados)

## Accomplishments

- **`backend/src/config.js`**: `REQUIRED` com as 5 obrigatórias de D-04 na ordem exigida
  (`AGENDOR_TOKEN`, `JWT_SECRET`, `SMTP_PASS`, `ALLOWED_ORIGINS`, `ADMIN_USERS`), cada uma com dica
  de **como obter** o valor. `findMissing`/`buildMessage` são puras; `validateEnv` aplica D-05
  (produção lança, demais ambientes avisam via `logger.warn('[Config] …')`). Cobertura: **100 % de
  statements, branches, funções e linhas**.
- **Pitfall 1 fechado**: `backend/src/index.js` carrega o `.env` por caminho absoluto derivado de
  `__dirname`. Verificado empiricamente a partir de `cwd = /`: resolve
  `/Users/vitormorija/Automacao_agendor/backend/.env`, 12 chaves, sem erro. Antes disso, sob PM2
  (`cwd: '/opt/agendor'`) o dotenv procurava `/opt/agendor/.env` e falhava em **silêncio**.
- **O modo de falha silencioso virou teste**: `config.dotenvPath.test.js` documenta que
  `dotenv.config()` com caminho inexistente devolve `{ error: ENOENT, parsed: {} }` e **não lança** —
  a regressão que derrubaria produção agora falha na suíte antes de chegar lá.
- **Suíte: 35 → 50 testes verdes.** Gate de cobertura de branches subiu de **65,48 % → 68,80 %**
  (piso 60) — o módulo novo em `src/` *aumentou* a folga em vez de consumi-la.
- **Fail-fast permanece DESLIGADO** (D-13): `grep -c "require('./config')" backend/src/index.js` → `0`.

## Task Commits

1. **Task 1 (RED): teste vermelho da validação central de env** — `317794a` (test)
2. **Task 1 (GREEN): módulo central de validação com regra pura** — `c2b1847` (feat)
3. **Task 2 (RED): teste vermelho do carregamento determinístico do .env** — `80d8ad6` (test)
4. **Task 2 (GREEN): carregar o .env por caminho absoluto derivado de `__dirname`** — `c55b789` (fix)

Nenhuma fase REFACTOR foi necessária — os módulos nasceram no formato final.

## Files Created/Modified

- `backend/src/config.js` (novo, 88 linhas) — `REQUIRED` + `findMissing`/`buildMessage`/`validateEnv`
  + efeito de boot `validateEnv(process.env)` antes do `module.exports`. Sem `console.*`, sem
  encerramento forçado do processo, sem `dotenv`.
- `backend/test/config.validateEnv.test.js` (novo, 12 casos) — contrato de `REQUIRED`, pureza de
  `findMissing`, formato e não-vazamento de `buildMessage`, e os dois ramos de D-05 (incluindo o ramo
  "sem `NODE_ENV`", que é onde a suíte e o CI caem).
- `backend/test/config.dotenvPath.test.js` (novo, 3 casos) — (a) o silêncio do ENOENT, (b)
  independência do `cwd` com `processEnv` e arquivos temporários, (c) asserção sobre a fonte do
  `index.js`.
- `backend/src/index.js` (modificado, +4/-1) — apenas a linha do dotenv e 3 linhas de comentário
  explicando o *porquê*. Nenhuma lógica nova (o arquivo está em `exclude` do `.c8rc.json`).
- `backend/test/setup.js` (modificado, **somente append**) — preset `NODE_ENV = 'test'` sem guarda.

## Decisions Made

- **Função pura em vez do `throw`-no-topo de `secret.js`.** D-06 manda seguir o padrão de `secret.js`;
  seguiu-se em *espírito* (efeito de boot, `throw` nunca encerramento forçado, mensagem em PT com
  remediação) e desviou-se em *forma* (a regra mora em `validateEnv(env)`). Medida que justifica:
  `secret.js` tem 50 % de branches justamente porque o caminho de erro exige subprocesso.
- **`'../.env'` em vez de `'..', '.env'`.** Com os três argumentos, a linha passa de 80 colunas e o
  Biome quebra a chamada em 3 linhas — o que faria `require('dotenv')` deixar de compartilhar linha
  com `path:`/`__dirname`, violando um critério de aceite do plano. `path.join` normaliza
  `'../.env'` de forma idêntica em todas as plataformas.
- **Regex do teste (c) usa `[^}]` e não `[^)]`.** Ver Deviations, item 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Regex do `<behavior>` da Task 2 não casava a linha prescrita pela própria Task 2**

- **Found during:** Task 2 (teste (c), asserção sobre a fonte do `index.js`)
- **Issue:** O plano especifica o regex `/require\('dotenv'\)\.config\(\{[^)]*path:[^)]*__dirname/`
  **e** a linha `require('dotenv').config({ path: require('path').join(__dirname, …) })`. São
  incompatíveis: a classe negada `[^)]` para no `)` de `require('path')`, que fica **antes** de
  `__dirname`. O regex nunca casaria a correção correta — o teste nasceria vermelho para sempre.
- **Fix:** Trocado por `[^}]`, que preserva integralmente a intenção (o `path:` e o `__dirname` têm de
  estar dentro do **mesmo objeto de opções**) e casa a linha real. O motivo está comentado no teste.
- **Files modified:** `backend/test/config.dotenvPath.test.js`
- **Verification:** teste (c) vermelho antes da correção do `index.js`, verde depois — a asserção
  discrimina de fato os dois estados.
- **Committed in:** `80d8ad6` (RED da Task 2)

**2. [Rule 1 - Bug] `dotenv` devolve `parsed: {}` (não `undefined`) no ENOENT**

- **Found during:** Task 2 (teste (a))
- **Issue:** A asserção inicial `parsed === undefined` falhou na fase RED por motivo errado — o
  comportamento real do dotenv 16.6.1 é devolver `{}`.
- **Fix:** Asserção ajustada para `deepEqual(parsed, {})`, com comentário registrando a medição. Isso
  **reforça** o ponto do teste: o retorno de um ENOENT é indistinguível de um sucesso vazio para quem
  não inspeciona `.error`.
- **Files modified:** `backend/test/config.dotenvPath.test.js`
- **Verification:** os 3 casos do arquivo verdes após a correção do `index.js`.
- **Committed in:** `80d8ad6` (RED da Task 2)

**3. [Rule 3 - Blocking] Comentário do `config.js` continha a string literal `process.exit`**

- **Found during:** Task 1 (verificação dos critérios de aceite)
- **Issue:** O critério `grep -c "process.exit" backend/src/config.js` → `0` é literal, e o comentário
  que explica *por que não* encerrar o processo à força continha a própria string, retornando `1`.
- **Fix:** Comentário reescrito sem a string literal, preservando a explicação.
- **Files modified:** `backend/src/config.js`
- **Verification:** `grep -c 'process.exit' backend/src/config.js` → `0`.
- **Committed in:** `c2b1847` (GREEN da Task 1)

**4. [Rule 3 - Blocking] Quebras de linha exigidas pelo formatador Biome**

- **Found during:** Tasks 1 e 2
- **Issue:** `npm run lint` roda só `biome lint`, mas `biome format` acusaria diferença em
  `buildMessage` (`config.js`) e em `makeTmpDir` (`config.dotenvPath.test.js`), além de preferir
  aspas duplas numa string com apóstrofos escapados.
- **Fix:** Aplicado o formato canônico do Biome nos três pontos.
- **Files modified:** `backend/src/config.js`, `backend/test/config.dotenvPath.test.js`
- **Verification:** `biome format` limpo nos 5 arquivos tocados; `npm run lint` exit 0.
- **Committed in:** `c2b1847` e `80d8ad6`

---

**5. [Rule 1 - Bug] CFG-03/CFG-04 marcadas como Complete no REQUIREMENTS.md, revertidas para Pending**

- **Found during:** atualização de estado pós-execução
- **Issue:** O frontmatter deste plano declara `requirements: [CFG-03, CFG-04]` e o passo de estado
  marcou as duas como concluídas. **CFG-04 é factualmente falsa hoje**: o texto do requisito é "Boot
  valida a presença das variáveis obrigatórias e falha rápido se faltarem", e o boot **não** requer
  `./config` — é exatamente isso que D-13 mantém desligado até o checkpoint humano. Deixar a marca
  ali poderia levar alguém a acreditar que o fail-fast já está ativo. CFG-03 tem o mesmo problema em
  grau menor: só se completa com o `.env.example` de 03-05.
- **Fix:** Ambas revertidas para `Pending` (checkbox e tabela de rastreabilidade). Verificado nos
  frontmatters da fase que os donos finais existem e vão remarcá-las: **CFG-04 → 03-02**,
  **CFG-03 → 03-05**. Nenhum requisito fica órfão.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Verification:** `grep -A2 '^requirements:' .planning/phases/03-*/03-0*-PLAN.md` confirma
  `03-02 → [CFG-04]` e `03-05 → [CFG-02, CFG-03]`.
- **Committed in:** commit de metadados do plano

---

**Total deviations:** 5 auto-fixed (3 bugs de especificação/estado, 2 bloqueios de critério/tooling)
**Impact on plan:** Nenhum desvio de escopo. Os dois itens de Rule 1 corrigem inconsistências internas
do plano que, se seguidas literalmente, produziriam um teste permanentemente vermelho. As decisões
travadas (D-04, D-05, D-06, D-13) foram honradas sem exceção.

## Issues Encountered

- **`npx` inutilizável no ambiente local.** O wrapper `~/bin/npx` aponta para
  `/tmp/node-v22.13.1-darwin-arm64/bin/node`, que não existe mais no diretório resolvido pelo shim.
  Contornado invocando o Biome direto:
  `node backend/node_modules/@biomejs/biome/bin/biome format <arquivos>`. `npm run lint` e
  `npm run test:coverage` funcionam normalmente — só o `npx` está quebrado. Vale registrar para as
  próximas fases.

## Verificação Final

```
npm run lint                                        → exit 0
npm run test:coverage                               → exit 0, 50/50 testes, branches 68,80 % (piso 60)
config.js na tabela de cobertura                    → 100 / 100 / 100 / 100
grep -c "require('./config')" backend/src/index.js  → 0   (fail-fast desligado, D-13)
git diff -U0 -- backend/test/setup.js | grep -E '^-[^-]' | wc -l → 0   (append-only)
grep -c "console\."  backend/src/config.js          → 0
grep -c "process.exit" backend/src/config.js        → 0
grep -c "require('dotenv')" backend/src/config.js   → 0
git diff --stat -- backend/src/index.js             → 4 insertions(+), 1 deletion(-)
```

## Known Stubs

Nenhum. Todo código entregue está exercitado por teste; o único "não-ligado" é deliberado e
documentado: `index.js` não requer `./config`, por decisão D-13.

## User Setup Required

Nenhum neste plano. **Mas fica pendente e é bloqueante para 03-02:** o `.env` de produção em
`/opt/agendor/backend/.env` precisa ser verificado por um humano (as 5 obrigatórias de D-04) antes de
ligar o fail-fast. Sabe-se que o `.env` **local** — proxy razoável — não tem `ALLOWED_ORIGINS` nem
`ADMIN_USERS`, então há forte indício de que o de produção também não tenha.

## Next Phase Readiness

**Pronto para 03-02:** a peça bloqueadora de D-13 (carregamento determinístico do `.env`) está
entregue e coberta por teste. 03-02 pode adicionar `require('./config')` na linha imediatamente após
o dotenv — **depois** do checkpoint humano de verificação do `.env` de produção.

**Pronto para 03-03:** o preset `NODE_ENV='test'` no `setup.js` já protege os arquivos de teste da
migração de SMTP contra um `NODE_ENV=production` herdado do shell.

**Atenção para as próximas tasks desta fase:**
- `backend/test/setup.js` continua **append-only** (Pitfall 10 — a linha 15 é um falso-positivo
  conhecido do gitleaks; reescrevê-la faria o job `secrets` de 03-06 barrar o PR desta própria fase).
- A folga do gate de branches melhorou (68,80 % contra piso de 60), mas 03-03/03-04 tocam `db.js`,
  `emailer.js` e `routes/config.js` — módulos com cobertura baixa. Manter a regra de entregar teste
  na mesma task que cria código.

## Self-Check: PASSED

Arquivos declarados existem em disco (`backend/src/config.js`,
`backend/test/config.validateEnv.test.js`, `backend/test/config.dotenvPath.test.js`,
`03-01-SUMMARY.md`) e os 4 commits de task existem no histórico (`317794a`, `c2b1847`, `80d8ad6`,
`c55b789`).

---
*Phase: 03-config-segredos-por-ambiente*
*Completed: 2026-07-29*
