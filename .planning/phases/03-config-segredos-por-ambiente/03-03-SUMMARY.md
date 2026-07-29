---
phase: 03-config-segredos-por-ambiente
plan: 03
subsystem: backend
tags: [smtp, segredos, migracao-sqlite, node-test, nodemailer, better-sqlite3]

# Dependency graph
requires:
  - phase: 01-rede-de-testes
    provides: "backend/test/setup.js (SMTP_PASS='' sem guarda, DB_PATH guardado) e backend/test/helpers/tmpDb.js"
  - phase: 02-toolchain-e-ci
    provides: "gate de cobertura c8 (branches >= 60) e npm run lint com Biome"
  - phase: 03-config-segredos-por-ambiente
    plan: 01
    provides: "preset NODE_ENV='test' no setup.js — a suíte nunca cai no ramo de produção"
provides:
  - "backend/src/db.js: migração idempotente e DEFENSIVA que zera config.smtp_pass só quando SMTP_PASS existe no ambiente (D-02)"
  - "smtp_pass fora do objeto `defaults` — o seeder não pode mais reintroduzir a senha do ambiente no SQLite (Pitfall 3)"
  - "backend/src/emailer.js: createTransporter lê a senha de process.env.SMTP_PASS (D-01)"
  - "3 arquivos de teste novos (8 casos) fixando os dois ramos de D-02, a regressão do re-seed e a borda do nodemailer"
affects: [03-04-allowlist-e-ui, deploy-env, 05-logging]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migração de DADOS (não de schema) no load de db.js, logo depois do seed de defaults, com catch (_) silencioso justificado"
    - "Um arquivo de teste por variação de ambiente: node --test isola por processo e db.js migra no require"
    - "Espião de logger instalado ANTES do require do módulo sob teste, para capturar efeito emitido no load"

key-files:
  created:
    - backend/test/db.smtpPassMigration.keep.test.js
    - backend/test/db.smtpPassMigration.clear.test.js
    - backend/test/emailer.smtpPass.test.js
  modified:
    - backend/src/db.js
    - backend/src/emailer.js

key-decisions:
  - "verifySmtp() como caminho público para exercitar createTransporter() — nenhum seam de teste novo em emailer.js, contrato intacto"
  - "Zerar (setConfig(k,'')) em vez de DELETE: a linha continua existindo, defesa em profundidade contra qualquer seeder futuro"
  - "Asserção sobre logger.warn no ramo keep — sem ela o teste passaria hoje e não discriminaria antes/depois"
  - "Comentário da migração reescrito sem a string literal 'process.env.SMTP_PASS' para satisfazer o critério de grep (ver Deviations #1)"

requirements-completed: []  # CFG-01 só fecha em 03-04 (allowlist do PUT) e 03-06 (gitleaks)

# Metrics
duration: 22min
completed: 2026-07-29
---

# Phase 3 Plan 03: Senha SMTP fora do banco Summary

**A senha SMTP passou a vir exclusivamente de `process.env.SMTP_PASS`, com migração de boot que só zera o valor antigo quando o ambiente realmente tem a senha — e três arquivos de teste que fixam os dois ramos e a regressão do re-seed.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-29T22:18:00Z
- **Completed:** 2026-07-29T22:40:00Z
- **Tasks:** 2 (4 commits — ciclo RED/GREEN por task)
- **Files modified:** 5 (3 criados, 2 modificados)

## Accomplishments

- **`smtp_pass` saiu do objeto `defaults`** de `backend/src/db.js`. Era a metade esquecida da
  correção: com a chave lá, um `DELETE` da linha ou um banco recriado fariam o seeder regravar
  `process.env.SMTP_PASS` dentro do SQLite no boot seguinte, desfazendo a migração em silêncio.
- **Migração condicional de D-02**, logo depois do loop de seed (onde a chave já existe, se existir):
  `envPass && dbPass` → zera + `logger.info`; `!envPass && dbPass` → **preserva** + `logger.warn`
  dizendo o que falta fazer. Envolvida em `try/catch (_)` no padrão das migrações de `ALTER TABLE`
  do próprio arquivo.
- **`createTransporter()` lê `(process.env.SMTP_PASS || '').trim()`** — mesma normalização de
  `getPublicBaseUrl()`. `verifySmtp()` e `POST /api/config/test-smtp` herdaram a mudança sem
  alteração, como previsto.
- **Híbrido de D-01 preservado**: host, porta, usuário e remetente continuam na tabela `config` e
  editáveis pela UI — trocar de servidor de e-mail segue sem exigir redeploy.
- **Suíte: 50 → 58 testes verdes.** Cobertura de branches subiu de **68,80 % → 70,19 %** (piso 60);
  `db.js` foi de 74,07 % → 77,77 % de branches e `emailer.js` está em 100 % de branches.
- **`backend/agendor.db` intocado** (`git status --porcelain backend/agendor.db` vazio): toda a
  suíte roda em `:memory:` ou em arquivo temporário.

## Task Commits

1. **Task 1 (RED): testes vermelhos dos dois ramos da migração** — `deaac39` (test) — 3 de 5 casos
   falhando
2. **Task 1 (GREEN): migração idempotente + remoção do `defaults`** — `0304b40` (feat)
3. **Task 2 (RED): teste vermelho da senha na borda do nodemailer** — `e9453a7` (test) — 2 de 3
   casos falhando
4. **Task 2 (GREEN): `createTransporter` lê o ambiente** — `3703d0f` (feat)

Nenhuma fase REFACTOR foi necessária.

## Files Created/Modified

- `backend/src/db.js` (+34/-1) — `require('./logger')` no topo, `smtp_pass` removida do `defaults`,
  bloco `// ── Migração: a senha SMTP sai do banco (D-01/D-02, CFG-01) ──` depois do seed. Nenhum
  `console.*` novo (contagem continua 0, igual ao `HEAD` anterior).
- `backend/src/emailer.js` (+8/-1) — comentário de 7 linhas documentando a **exceção deliberada** ao
  padrão "config runtime mora no banco" e a troca da linha 12.
- `backend/test/db.smtpPassMigration.keep.test.js` (novo, 3 casos) — ramo defensivo: preservação,
  aviso logado (espião em `logger.warn` instalado antes do `require`), e `getAllConfig()` ainda
  devolvendo a chave.
- `backend/test/db.smtpPassMigration.clear.test.js` (novo, 2 casos) — ramo ativo e a regressão do
  re-seed (`closeDb()` → `delete require.cache[...]` → re-`require` sobre o mesmo arquivo).
- `backend/test/emailer.smtpPass.test.js` (novo, 3 casos) — stub de `nodemailer.createTransport`
  capturando as opções; asserção negativa contra `'db-pass'`; caso do ambiente ausente.

## Decisions Made

- **`verifySmtp()` em vez de um seam de teste.** O plano oferecia as duas opções. `verifySmtp()` é
  exportada e seu corpo inteiro é `createTransporter().verify()` — não há indireção que possa
  mascarar o que se quer medir, e o contrato público de `emailer.js` fica intacto. O motivo está
  registrado no cabeçalho do teste.
- **Ordem crítica das variáveis documentada dentro dos próprios arquivos.** `DB_PATH` antes do
  `require('./setup')` (preset guardado), `SMTP_PASS` depois (sobrescrita sem guarda em
  `setup.js:31`). O comentário no `clear.test.js` explica que inverter faria o teste passar no ramo
  errado — a falha mais perigosa possível aqui.
- **Asserção sobre `logger.warn` no ramo `keep`.** A asserção de preservação já passa em `HEAD`
  (o seeder nunca sobrescreve chave existente); sem a asserção sobre o aviso o arquivo nasceria
  verde e não distinguiria o antes do depois. Com ela, o RED foi real.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Comentário verbatim do RESEARCH violava um critério de aceite do plano**

- **Found during:** Task 1 (verificação dos critérios de aceite)
- **Issue:** O plano manda copiar o comentário da migração "exatamente como redigido em
  03-RESEARCH.md linhas 680-709", e esse texto contém a string literal `process.env.SMTP_PASS`
  ("A partir daqui ela vem só de process.env.SMTP_PASS (emailer.js)"). Mas outro critério do mesmo
  plano exige `grep -c "process.env.SMTP_PASS" backend/src/db.js` → `1`. Com o comentário verbatim o
  grep retornava `2`. Os dois critérios são incompatíveis entre si.
- **Fix:** Reescrita mínima da frase para "A partir daqui ela vem só do ambiente, lida em
  emailer.js." — mesmo significado, sem a string literal. Todo o resto do bloco é verbatim.
- **Files modified:** `backend/src/db.js`
- **Verification:** `grep -c 'process.env.SMTP_PASS' backend/src/db.js` → `1`, dentro da migração.
- **Committed in:** `0304b40` (GREEN da Task 1)
- **Nota:** é a mesma classe de problema do desvio #3 de 03-01 (critério de grep literal colidindo
  com o texto de um comentário). Vale como aprendizado para os planos restantes da fase.

---

**Total deviations:** 1 auto-fixed (colisão entre dois critérios do próprio plano)
**Impact on plan:** Nenhum desvio de escopo ou de decisão. D-01 e D-02 foram implementadas como
travadas, os 3 arquivos de teste exigidos existem e os 4 pontos de toque desta plano (db.js:110,
db.js pós-seed, emailer.js:12) estão fechados. Os pontos #4 (allowlist do PUT em `routes/config.js`)
e #5 (campo da UI em `ConfigPanel.jsx`) são, por desenho, escopo do plano **03-04**.

## Issues Encountered

Nenhum bloqueio. Confirmado o registro de 03-01: `npx` continua inutilizável no ambiente local
(o shim `~/bin/npx` aponta para um diretório de Node inexistente). O Biome foi invocado direto por
`node backend/node_modules/@biomejs/biome/bin/biome …`; `npm run lint` e `npm run test:coverage`
funcionam normalmente.

## Verificação Final

```
npm run lint                                              → exit 0
npm run test:coverage                                     → exit 0, 58/58 testes, branches 70,19 % (piso 60)
node --test (os 3 arquivos novos)                         → 8/8
grep -c "process.env.SMTP_PASS" backend/src/db.js         → 1  (só na migração)
smtp_pass dentro do objeto `defaults`                     → ausente
grep -q "require('./logger')" backend/src/db.js           → ok
grep -c "console\." backend/src/db.js                     → 0  (== HEAD anterior)
grep -c "getConfig('smtp_pass')" backend/src/emailer.js   → 0
grep -c getConfig('smtp_host'|_port|_user) em emailer.js  → 8  (>= 3)
awk de ordem em clear.test.js (SMTP_PASS depois do setup) → exit 0
git status --porcelain backend/agendor.db                 → vazio
```

## Threat Flags

Nenhuma superfície nova. As disposições do `<threat_model>` do plano foram aplicadas:

| Threat ID | Estado |
|-----------|--------|
| T-03-SMTP-01 | Mitigado no código. **Resíduo aceito e registrado:** os backups já existentes em `/opt/agendor/backups` continuam com a senha antiga em texto puro — só a **rotação da senha SMTP** resolve. Não é trabalho de código. |
| T-03-SMTP-02 | Mitigado e fixado por teste (`clear.test.js`, 2º caso). |
| T-03-SMTP-03 | Mitigado e fixado por teste (`keep.test.js`). |
| T-03-SMTP-04 | Herdado de `setup.js:31`, intocado (o arquivo continua append-only; nenhuma linha foi alterada nesta plano). |
| T-03-SMTP-05 | Aceito — `routes/config.js:38` já mascara e com o valor zerado devolve `''`. |

## Known Stubs

Nenhum stub. **Mas há um caminho de escrita ainda aberto, por desenho:** `PUT /api/config` continua
aceitando `smtp_pass` na allowlist (`backend/src/routes/config.js:51`), então um cliente — ou o
próprio `save()` do `ConfigPanel.jsx`, que reenvia o objeto inteiro — pode regravar a senha no banco
até que **03-04** remova a chave da allowlist. A migração de boot desfaz isso no restart seguinte,
mas CFG-01 só é verdadeiro de forma permanente depois de 03-04.

## User Setup Required

**Antes do próximo deploy:** garantir que `SMTP_PASS` está definida em `/opt/agendor/backend/.env`
com a senha real. Sem ela, a migração preserva o valor antigo (o envio de e-mail continua
funcionando via banco até o `PUT` seguinte), mas o `emailer.js` já lê **só** o ambiente — ou seja,
o envio passaria a autenticar com senha vazia. O aviso `[DB] SMTP_PASS ausente no ambiente …`
aparece no log do PM2 exatamente nesse caso.

**Recomendado (não bloqueante):** rotacionar a senha SMTP, já que ela esteve em texto puro em até
30 cópias diárias do `.db`.

## Next Phase Readiness

**Pronto para 03-04:** a fonte de verdade já mudou; falta apenas fechar o caminho de escrita
(allowlist do PUT) e remover o campo da UI. O teste `config.route.smtpPass.test.js` previsto lá pode
seguir o mesmo preâmbulo dos dois arquivos criados aqui.

## Self-Check: PASSED

Os 5 arquivos declarados existem em disco e os 4 commits de task existem no histórico
(`deaac39`, `0304b40`, `e9453a7`, `3703d0f`).

---
*Phase: 03-config-segredos-por-ambiente*
*Completed: 2026-07-29*
