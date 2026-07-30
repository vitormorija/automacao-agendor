---
phase: 03-config-segredos-por-ambiente
plan: 05
subsystem: config+docs
tags: [env-example, documentacao, meta-teste, anti-drift, gitleaks]

# Dependency graph
requires:
  - phase: 03-config-segredos-por-ambiente
    plan: 01
    provides: "backend/src/config.js com REQUIRED (as 5 obrigatórias de D-04) e o rigor escalonado por NODE_ENV"
  - phase: 03-config-segredos-por-ambiente
    plan: 03
    provides: "senha SMTP lida só de process.env.SMTP_PASS — o que torna SMTP_PASS obrigatória e os demais campos SMTP opcionais"
  - phase: 03-config-segredos-por-ambiente
    plan: 04
    provides: "smtp_pass fora da allowlist do PUT /api/config — base da nota 'não editável pelo painel' no README"
  - phase: 01-rede-de-testes
    provides: "backend/test/setup.js e a convenção de cabeçalho dos arquivos de teste"
  - phase: 02-toolchain-e-ci
    provides: "npm run lint (Biome) e o gate de cobertura c8 (branches >= 60)"
provides:
  - "backend/.env.example com as 18 variáveis reais em 3 blocos (Ambiente / OBRIGATÓRIAS / OPCIONAIS), anotadas com default e diferença dev vs prod"
  - "LOG_LEVEL, DB_PATH e BASE_URL_FRONTEND documentados pela primeira vez (D-10)"
  - "STALE_DAYS removido do contrato de configuração (D-12)"
  - "backend/test/envExample.test.js: 3 testes que detectam drift src/ ↔ .env.example nas duas direções + guarda de entropia dos placeholders"
  - "Tabela de variáveis do README espelhando o .env.example, com ✅ só para as 5 obrigatórias de D-04"
affects: [03-06, 03-07, deploy-env, fase-08-documentacao]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Meta-teste de contrato documentação↔código: o teste lê o próprio repositório (walk em src/ + parse do .env.example) em vez de exercitar a aplicação — transforma um requisito de revisão manual em invariante de CI"
    - "Allowlist de exceção vazia e explícita (SOMENTE_DOCUMENTAIS = []) como mecanismo de visibilidade: manter uma variável fantasma passa a exigir uma linha de código com justificativa no diff"
    - "Guarda de entropia por corrida ininterrupta de alfanuméricos, não por comprimento total — separa segredo real de placeholder hifenizado em português"

key-files:
  created:
    - backend/test/envExample.test.js
  modified:
    - backend/.env.example
    - README.md

key-decisions:
  - "Guarda de entropia implementada como /[A-Za-z0-9\\/+]{16,}/ sobre o valor sem comentário, e não como o regex literal do plano ([A-Za-z0-9/+_-]{24,}) — este último reprovaria o próprio placeholder que o plano manda preservar (JWT_SECRET=troque-por-um-segredo-forte-e-aleatorio, 39 caracteres na classe). Ver Deviations #2"
  - "Toda atribuição do .env.example ganhou comentário de fim de linha com default e/ou nota [dev:]/[prod:] — é o que materializa D-07 (um .env único, NODE_ENV decide) por variável, e não só num bloco de cabeçalho"
  - "O .env.example termina com uma nota explicando onde stale_days realmente mora (tabela config, editável pela UI) — remover STALE_DAYS sem dizer para onde foi criaria a pergunta seguinte no próximo deploy"
  - "README ganhou também PORT (ausente antes) para que a tabela seja projeção fiel do .env.example, não um subconjunto arbitrário"

requirements-completed: [CFG-02, CFG-03]

# Metrics
duration: 15min
completed: 2026-07-29
---

# Phase 3 Plan 05: Contrato de Configuração Completo Summary

**O `.env.example` passou a documentar exatamente as 18 variáveis que `backend/src/` lê — nem mais, nem menos — com obrigatoriedade espelhada de `src/config.js` e nota dev vs prod por variável, e um meta-teste impede que ele volte a divergir.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-29T22:52:00Z
- **Completed:** 2026-07-29T23:00:00Z
- **Tasks:** 2 (3 commits — ciclo RED/GREEN na Task 1)
- **Files modified:** 3 (1 criado, 2 modificados)

## What Was Built

### Task 1 — `.env.example` reorganizado + meta-teste anti-drift (RED/GREEN)

O arquivo passou de 12 variáveis documentadas (com uma fantasma) para as **18 reais**, distribuídas em três blocos que preservam a convenção `# ── Nome ───` já usada:

- **`# ── Ambiente ──`** — só `NODE_ENV`, com quatro linhas explicando o que muda de fato entre `development` e `production`: aviso vs boot abortado, log em texto vs JSON, Vite vs `frontend/dist` servido pelo backend. É D-07 escrito no arquivo em vez de subentendido.
- **`# ── OBRIGATÓRIAS (o boot aborta em produção se faltar) ──`** — as 5 de D-04, cada uma com o comentário dizendo **como obter o valor**, reaproveitando o texto das `hint` de `backend/src/config.js`. O bloco é a projeção legível de `REQUIRED`; se um dia divergir, diverge de um módulo que já existe, não de um documento de planejamento.
- **`# ── OPCIONAIS (têm default sensato no código) ──`** — as 12 restantes, cada uma com o default explícito e, quando aplicável, `[dev: …]` / `[prod: …]`.

Entraram `LOG_LEVEL`, `DB_PATH` e `BASE_URL_FRONTEND` (D-10). Saiu `STALE_DAYS` (D-12), substituído por uma nota final dizendo que o valor mora na tabela `config` e é editável pela UI.

`backend/test/envExample.test.js` (3 testes) fixa o contrato:

1. **Faltando** — todo `process.env.X` encontrado por um `walk()` recursivo em `src/` tem linha `X=` no exemplo. Recursivo de propósito: foi um grep raso que deixou `BASE_URL_FRONTEND` (`routes/auth.js`) de fora.
2. **Sobrando** — nenhuma variável documentada deixa de ser lida, com `const SOMENTE_DOCUMENTAIS = []` vazia e comentada. A allowlist não é frouxidão: é o custo deliberado de tornar visível qualquer exceção futura.
3. **Entropia** — nenhum valor do exemplo contém corrida ininterrupta de 16+ alfanuméricos. É a guarda contra repetir `13905d4`, o commit em que o token real da Agendor entrou como "placeholder".

### Task 2 — README sincronizado

A tabela de variáveis (README.md:79-101) virou projeção fiel do `.env.example`: `STALE_DAYS` removido, `PORT`/`DB_PATH`/`BASE_URL_FRONTEND` acrescentados, e a coluna "Obrigatória" refeita segundo D-04 — `✅` **exatamente** para `AGENDOR_TOKEN`, `JWT_SECRET`, `SMTP_PASS`, `ALLOWED_ORIGINS` e `ADMIN_USERS`. A linha agrupada `SMTP_HOST/PORT/USER/PASS/FROM`, que marcava as cinco como obrigatórias, foi quebrada: `SMTP_PASS` sobe para obrigatória (vem do ambiente) e as outras quatro descem para opcionais (editáveis pela UI). `ADMIN_EMAIL`, que era `✅` sem sê-lo, virou opcional.

Abaixo da tabela, duas frases que a tabela sozinha não diz: em `NODE_ENV=production` a ausência de obrigatória **aborta o boot** (CFG-04) e a senha SMTP **não** é mais editável pelo painel (D-01/D-03).

## Key Implementation Details

- **`walk()` recursivo, não `readdirSync` raso** — `src/routes/` e `src/middleware/` leem `process.env`; um grep de primeiro nível reproduziria exatamente o erro que este teste existe para impedir.
- **Parse do exemplo com corte de comentário exigindo espaço antes do `#`** (`m[2].split(/\s+#/)[0]`) — um corte ingênuo no primeiro `#` picaria um valor que legitimamente o contivesse (senhas costumam ter).
- **O teste não requer nenhum módulo de `src/`** — só `fs`/`path`. Consequência prática: zero linhas novas no denominador do gate de cobertura e nenhum efeito colateral de import (`config.js` valida no require e logaria aviso).
- **`require('./setup')` mantido como primeira linha executável** por convenção da suíte, ainda que este teste não dependa dele.
- **`test/setup.js` intocado** — o arquivo é append-only por causa do falso-positivo da linha 15 (Pitfall 10); nada aqui precisou dele.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Critério de aceite da Task 2 ancorado em `^\|` nunca casa — tabela é indentada**

- **Found during:** Task 2, ao rodar o bloco `<verify>`
- **Issue:** a tabela do README vive dentro do item 3 de uma lista numerada e por isso é indentada com **3 espaços**. Os dois greps prescritos (`grep -cE '^\|[^|]*(…)\|[^|]*✅'` e `grep -cE '^\|.*✅'`) retornam `0` — retornavam `0` **antes** da mudança e continuam retornando `0` **depois**. O `<verify>` do plano falharia com o README correto, e nenhuma das duas metades provaria coisa alguma.
- **Fix:** corrigido o critério para `^\s*\|`, preservando integralmente a intenção declarada (as duas metades juntas provando igualdade de conjunto). Com a âncora corrigida: `5` obrigatórias marcadas **e** `5` linhas com `✅` no total. Não se mexeu na indentação do README para satisfazer o regex — desindentar quebraria a renderização da lista numerada, que é o caso clássico de distorcer o conteúdo para agradar um check quebrado.
- **Files modified:** nenhum (correção do critério, não do artefato)
- **Commit:** `f5f622a`

**2. [Rule 1 - Bug] O regex de entropia do plano reprovaria o placeholder que o próprio plano manda preservar**

- **Found during:** Task 1, ao escrever o terceiro teste
- **Issue:** o plano exige literalmente manter `JWT_SECRET=troque-por-um-segredo-forte-e-aleatorio` **e** que nenhum valor case `[A-Za-z0-9/+_-]{24,}`. Esse placeholder tem 39 caracteres, todos dentro da classe (o hífen está incluído) — as duas exigências são incompatíveis assim que a asserção olhe o valor em si. Como grep de arquivo o critério só passa por acidente do `$`: qualquer linha com comentário de fim de linha escapa da âncora.
- **Fix:** o teste implementa a regra pelo que de fato distingue um segredo de uma frase em português — a **corrida ininterrupta** de alfanuméricos (`/[A-Za-z0-9\/+]{16,}/`, sem hífen nem underscore na classe) sobre o valor já sem comentário. Hex de `openssl rand`, base64 e chaves de API caem; `troque-por-um-segredo-forte-e-aleatorio` (maior corrida: 9) passa. O critério de aceite literal do plano continua retornando `0` no arquivo entregue, então nada foi afrouxado — a asserção do teste é mais estrita, não menos.
- **Files modified:** `backend/test/envExample.test.js`
- **Commit:** `91c797a`

**3. [Rule 2 - Robustez] Placeholder de `SEED_ADMIN_PASSWORD` encurtado**

- **Found during:** Task 1
- **Issue:** `troque-no-primeiro-acesso` tem 25 caracteres na classe do regex de aceite — escaparia hoje só porque a linha ganhou comentário de fim de linha. Depender do comentário para não disparar o gitleaks é frágil: basta alguém remover o comentário num futuro `git blame`.
- **Fix:** `troque-no-1o-acesso` (19 caracteres), mesmo tom e mesma obviedade.
- **Files modified:** `backend/.env.example`
- **Commit:** `0e00499`

### Escopo além da letra do plano

- `PORT` foi acrescentada à tabela do README (não estava lá antes e o plano não pediu). Sem ela a tabela seria um subconjunto arbitrário do `.env.example`, contrariando o objetivo declarado da task ("espelhar"). Custo: uma linha.

## Requirements Impact

| Requisito | Antes | Depois | Base |
|-----------|-------|--------|------|
| CFG-02 | Pending | **Complete** | `.env.example` documenta as 18 variáveis reais, sem valor sensível, e um teste impede a regressão |
| CFG-03 | Pending | **Complete** | 03-01 entregou o rigor escalonado por `NODE_ENV`; este plano entrega a metade documental (anotações dev/prod por variável, `.env` único formalizado). 03-01 já registrava "CFG-03 fecha em 03-05" |
| CFG-04 | Pending | Pending | Depende de 03-02 (verificação do `.env` de produção, D-13) |
| CFG-01 | Pending | Pending | Depende de 03-06 (gitleaks) e 03-07 (`git grep` escopado, D-15) |

## Verification

```
node --test test/envExample.test.js                       → 3/3 verdes
npm run lint                                              → exit 0 (45 warnings pré-existentes)
npm run test:coverage                                     → exit 0 · 64 testes (61 → 64) · branches 71.52% (piso 60)
grep -cE "^[A-Z0-9_]+=" backend/.env.example              → 18
grep -c "^STALE_DAYS=" backend/.env.example               → 0
grep -c "^LOG_LEVEL=" / "^DB_PATH=" / "^BASE_URL_FRONTEND=" → 1 cada
grep -cE "^[A-Z0-9_]+=[A-Za-z0-9/+_-]{24,}$" .env.example → 0
grep -c "STALE_DAYS" README.md                            → 0
grep -cE '^\s*\|[^|]*(AGENDOR_TOKEN|JWT_SECRET|SMTP_PASS|ALLOWED_ORIGINS|ADMIN_USERS)[^|]*\|[^|]*✅' README.md → 5
grep -cE '^\s*\|.*✅' README.md                            → 5
git diff --stat -- README.md                              → confinado à seção de variáveis
```

Nenhum arquivo novo em `src/` — a cobertura não se moveu (71.52% de branches, idêntico ao baseline de 03-04).

## Threat Model Outcome

| Threat ID | Resultado |
|-----------|-----------|
| T-03-09 (placeholder realista virando segredo) | Mitigado em duas camadas: placeholders em PT de baixa entropia (bloco verificado em sandbox contra gitleaks 8.30.1) **e** teste automatizado de corrida de entropia, que é mais estrito que o critério de aceite original |
| T-03-10 (`.env` de produção incompleto por documentação faltante) | Mitigado: as 3 ausentes entraram; o bloco OBRIGATÓRIAS espelha `REQUIRED` de `config.js`; o meta-teste impede nova drift |
| T-03-11 (documentar variável que o código não lê) | Mitigado: `STALE_DAYS` removido e o teste inverso, com allowlist vazia e explícita, obriga qualquer exceção futura a ser declarada em código |
| T-03-SC (instalação de pacotes) | Aceito e não exercido: nenhum pacote npm novo; o teste usa só `node:fs`/`node:path` |

**Nenhuma superfície de segurança nova.** As mudanças são um arquivo de exemplo versionado, um teste que só lê o repositório e uma tabela de documentação.

## Para o próximo plano (03-06, gitleaks)

O diff desta fase **adiciona** linhas ao `.env.example`, e o gitleaks só olha linhas adicionadas. As linhas entregues foram escolhidas dentro do conjunto verificado em sandbox (Pitfall 9) e o teste de entropia roda em todo commit, mas o job novo é a primeira vez que elas passam pelo scanner de verdade. Se o job `secrets` nascer vermelho, o suspeito é `JWT_SECRET=troque-por-um-segredo-forte-e-aleatorio` (39 caracteres perto da palavra `SECRET`) — o escape documentado é `# gitleaks:allow` na linha específica, não abrandar o teste.

`backend/test/setup.js` continua **intocado** (append-only por causa do falso-positivo da linha 15).

## Self-Check: PASSED

- `backend/.env.example` — FOUND (18 atribuições, sem `STALE_DAYS`)
- `backend/test/envExample.test.js` — FOUND (3 testes verdes)
- `README.md` — FOUND (tabela sincronizada, 5 `✅`)
- Commit `91c797a` (test, RED) — FOUND
- Commit `0e00499` (feat, GREEN) — FOUND
- Commit `f5f622a` (docs, README) — FOUND
- Gate TDD: `test(...)` → `feat(...)` na ordem correta na Task 1
