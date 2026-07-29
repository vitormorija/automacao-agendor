---
phase: 03-config-segredos-por-ambiente
plan: 04
subsystem: backend+frontend
tags: [smtp, segredos, allowlist, seam-de-teste, react, biome]

# Dependency graph
requires:
  - phase: 03-config-segredos-por-ambiente
    plan: 03
    provides: "senha SMTP fora do banco (defaults + migração de boot) e emailer.js lendo process.env.SMTP_PASS"
  - phase: 01-rede-de-testes
    provides: "backend/test/setup.js (DB_PATH=:memory:, JWT_SECRET, SMTP_PASS='')"
  - phase: 02-toolchain-e-ci
    provides: "gate de cobertura c8 (branches >= 60) e npm run lint com Biome"
provides:
  - "backend/src/routes/config.js: ALLOWED_KEYS como constante de módulo com 9 chaves, sem smtp_pass — o PUT não grava mais a senha"
  - "Seam module.exports.ALLOWED_KEYS no padrão de routes/auth.js:359-369 (sem HTTP, sem supertest)"
  - "backend/test/config.route.smtpPass.test.js (3 casos) fixando a ausência da chave e a integridade do router"
  - "frontend: campo de senha SMTP substituído por nota de D-03 citando SMTP_PASS"
affects: [03-05, 03-06, deploy-env]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Allowlist declarativa içada para constante de módulo e exposta como seam — testável por asserção pura, zero branches novos no gate"
    - "Nota inline na UI substituindo controle removido, explicando a origem do valor (evita ser lida como bug de UI)"

key-files:
  created:
    - backend/test/config.route.smtpPass.test.js
  modified:
    - backend/src/routes/config.js
    - frontend/src/components/ConfigPanel.jsx

key-decisions:
  - "Comparação por conjunto ordenado ([...ALLOWED_KEYS].sort()) em vez de deepEqual posicional — a asserção protege o conteúdo da allowlist sem travar a ordem de declaração"
  - "Nenhum validador novo para smtp_pass: remover da allowlist apenas ESTREITA a superfície (ASVS V5); adicionar validador seria superfície nova"
  - "Mascaramento do GET (routes/config.js:57) intocado, como o RESEARCH determinou — com o valor zerado o ternário já devolve ''"

requirements-completed: []  # CFG-01 ainda depende de 03-06 (gitleaks) + git grep escopado (D-15)

# Metrics
duration: 8min
completed: 2026-07-29
---

# Phase 3 Plan 04: Allowlist do PUT e campo da UI Summary

**O 4º e 5º pontos de toque da senha SMTP foram fechados: `PUT /api/config` não aceita mais `smtp_pass` (allowlist içada para constante de módulo e fixada por seam de teste) e o formulário perdeu o campo de senha, substituído por uma nota que diz de onde o valor vem.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-29T22:42:00Z
- **Completed:** 2026-07-29T22:50:00Z
- **Tasks:** 2 (3 commits — ciclo RED/GREEN na Task 1)
- **Files modified:** 3 (1 criado, 2 modificados)

## Accomplishments

- **`smtp_pass` saiu da allowlist do `PUT /api/config`.** Era o caminho de escrita que 03-03 deixou
  aberto por desenho: o `save()` do painel reenvia `{...config}` inteiro, então a primeira vez que
  alguém salvasse a aba Configurações regravaria a senha no SQLite — e nos backups diários — desfazendo
  a migração (Pitfall 4). `ALLOWED_KEYS` tem agora exatamente 9 chaves.
- **Allowlist içada para constante de módulo** (`ALLOWED_KEYS`, ao lado de `VALIDATORS`), com comentário
  em PT explicando **por que** a chave não está lá — a ausência agora é uma decisão legível, não um
  esquecimento que alguém "conserta" num PR futuro.
- **Seam de teste** `module.exports.ALLOWED_KEYS`, no molde exato de `routes/auth.js:359-369`. Nenhum
  pacote novo: `supertest` continua fora do projeto, como o threat model exigia (T-03-SC).
- **`ConfigPanel.jsx` limpo**: `<Field label="Senha / App Password">` removido inteiro, junto com o
  state `showPass` e os imports `Eye`/`EyeOff` que ficariam órfãos (o Biome os deixa em `warn`, então
  nada os pegaria automaticamente). No lugar, a nota de D-03 citando `SMTP_PASS` e o `.env`.
- **`save()` intocado** — a compatibilidade é do lado do backend: a chave extra chega e é ignorada.
- **Suíte: 58 → 61 testes verdes.** Branches de **70,19 % → 71,52 %** (piso 60). `routes/config.js`
  passou a aparecer no relatório com 100 % de branches.

## Task Commits

1. **Task 1 (RED): teste vermelho da allowlist** — `81361fd` (test) — 2 de 3 casos falhando
   (`ALLOWED_KEYS is not iterable`)
2. **Task 1 (GREEN): `ALLOWED_KEYS` sem `smtp_pass` + seam** — `6b958d0` (feat)
3. **Task 2: campo removido do `ConfigPanel.jsx` + nota de D-03** — `51e0885` (feat)

Nenhuma fase REFACTOR foi necessária.

## Files Created/Modified

- `backend/src/routes/config.js` (+27/-12) — `ALLOWED_KEYS` acima do GET com comentário de 7 linhas;
  handler do PUT itera a constante; bloco de seam no fim do arquivo. GET (linha 57) byte-idêntico.
- `backend/test/config.route.smtpPass.test.js` (novo, 3 casos) — `require('./setup')` primeiro,
  cabeçalho citando CFG-01/D-01/Pitfall 4, asserções de array/ausência/conteúdo e
  `typeof configRouter === 'function'`.
- `frontend/src/components/ConfigPanel.jsx` (+8/-20) — import sem `Eye`/`EyeOff`, sem `showPass`,
  bloco de 18 linhas do campo trocado por um `<div>` de nota com as classes da família local.

## Decisions Made

- **Conjunto ordenado em vez de `deepEqual` posicional.** O plano pede "exatamente as 9 chaves".
  Comparar `[...ALLOWED_KEYS].sort()` com a lista esperada ordenada prova o conteúdo sem transformar a
  ordem de declaração (que segue a agrupada por assunto no código) em contrato de teste — um
  reordenamento cosmético não deve quebrar a suíte, mas acrescentar/remover chave deve.
- **Terceira asserção mantida apesar de nascer verde.** `typeof configRouter === 'function'` passava
  antes da mudança; ela não é um RED, é a guarda contra a regressão que o seam poderia introduzir
  (alguém trocar `module.exports = router` por `module.exports = { router, ALLOWED_KEYS }` e quebrar o
  `app.use()`). Está documentada como tal no arquivo.
- **Quebra de linha da nota ajustada ao formatador.** O JSX pronto no RESEARCH quebrava a frase num
  ponto que o Biome reflui; a redação é idêntica, só o ponto de quebra mudou (ver Deviations #1).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] JSX da nota (verbatim do RESEARCH) não estava no formato do Biome**

- **Found during:** Task 2 (verificação)
- **Issue:** O JSX de `03-RESEARCH.md:1080-1086`, copiado literalmente, faz
  `node backend/node_modules/@biomejs/biome/bin/biome format` acusar diferença: o formatador move
  "ser" para a linha seguinte. `npm run lint` e `npm run build` passavam mesmo assim (o CI não roda
  `biome format --check`), mas o arquivo ficaria fora do padrão do repo e o próximo
  `npm run format` produziria ruído num diff alheio.
- **Fix:** Aplicada a quebra que o próprio Biome imprime. **Texto e classes Tailwind idênticos ao
  RESEARCH** — só mudou onde a linha quebra.
- **Files modified:** `frontend/src/components/ConfigPanel.jsx`
- **Verification:** `biome format src/components/ConfigPanel.jsx` → "No fixes applied", sem diff.
- **Committed in:** `51e0885`

### Nota sobre os critérios de aceite (nenhuma correção necessária)

Os planos 03-01 e 03-03 tiveram critérios de grep que colidiam com o próprio código prescrito. Este
plano **não** teve esse problema: o critério de Task 1 (`grep -n "'smtp_pass'"` só no GET e/ou em
comentários) admite explicitamente ocorrências em comentário, que é onde as duas restantes estão
(linhas 37 e 99). Os 7 critérios das duas tasks foram verificados literalmente, como executados.

---

**Total deviations:** 1 auto-fixed (formatação, sem mudança de conteúdo)
**Impact on plan:** Nenhum desvio de escopo ou de decisão.

## Issues Encountered

Nenhum bloqueio. Confirmado mais uma vez que `npx` é inutilizável no ambiente local; o Biome foi
invocado direto por `node backend/node_modules/@biomejs/biome/bin/biome …` (o frontend não tem o
Biome no próprio `node_modules` — usa o do backend via `../`). `npm run lint`, `npm run build` e
`npm run test:coverage` funcionam normalmente.

## Verificação Final

```
backend  npm run lint                       → exit 0
backend  npm run test:coverage              → exit 0, 61/61 testes, branches 71,52 % (piso 60)
backend  node --test config.route.smtpPass  → 3/3
frontend npm run lint                       → exit 0
frontend npm run build                      → exit 0
grep -n "smtp_pass" routes/config.js        → 3 ocorrências: 37 e 99 (comentários), 57 (GET, intocado)
grep -n "smtp_pass" ConfigPanel.jsx         → 0
grep -c "showPass" ConfigPanel.jsx          → 0
grep -cE "EyeOff|Eye," ConfigPanel.jsx      → 0
git diff -U0 routes/config.js | grep -cE "^-.*safe"        → 0  (mascaramento do GET intocado)
git diff -U0 ConfigPanel.jsx | grep -c "^-.*JSON.stringify" → 0  (save() intocado)
```

## Threat Flags

Nenhuma superfície nova — a mudança **remove** superfície. Disposições do `<threat_model>` aplicadas:

| Threat ID | Estado |
|-----------|--------|
| T-03-SMTP-06 | Mitigado e fixado por teste. A senha não é mais gravável pelo PUT. |
| T-03-SMTP-07 | Mitigado — campo removido; o GET já devolvia `''` desde 03-03. |
| T-03-08 | Aceito e verificado: `typeof configRouter === 'function'` no teste. |
| T-03-SC | Respeitado: zero pacotes npm novos. |

## Known Stubs

Nenhum. O caminho de escrita que 03-03 listou como aberto por desenho está fechado.

## Requisitos

**CFG-01 continua `Pending`, e isso é correto.** Os 5 pontos de toque da senha SMTP estão fechados,
mas o requisito é "nenhum segredo hardcoded no repositório" — sua prova depende ainda de **03-06**
(gitleaks como gate de CI, D-08/D-09) e do `git grep` escopado e documentado que D-15 exige, já que o
gitleaks não detecta a exposição do token em headers `Authorization: Token`. Marcar CFG-01 aqui
declararia provado o que ainda não foi medido.

## Next Phase Readiness

**Pronto para 03-05.** Nada desta plano bloqueia o resto da fase. Lembrete herdado de 03-03, ainda
válido: antes do próximo deploy, garantir `SMTP_PASS` em `/opt/agendor/backend/.env` — com a chave
fora da allowlist, a UI deixou de ser um caminho de recuperação para uma senha faltante no ambiente.

## Self-Check: PASSED

Os 3 arquivos declarados existem em disco e os 3 commits de task existem no histórico
(`81361fd`, `6b958d0`, `51e0885`).

---
*Phase: 03-config-segredos-por-ambiente*
*Completed: 2026-07-29*
