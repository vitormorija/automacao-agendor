---
phase: 4
slug: confiabilidade-das-integra-es
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-04
updated: 2026-08-04
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test nativo (Node >= 20) + c8 ^12 (gate de cobertura ativo em `backend/.c8rc.json`) |
| **Config file** | `backend/.c8rc.json` (pisos lines/statements/functions 20, branches 60) |
| **Quick run command** | `cd backend && export PATH="$HOME/bin:$PATH" && node --test test/<arquivo>.test.js` |
| **Full suite command** | `cd backend && export PATH="$HOME/bin:$PATH" && npm run test:coverage` |
| **Estimated runtime** | ~1-2 segundos (suíte completa; baseline 78/78 em ~0.5s + overhead c8) |

Baseline medido na entrada da fase (04-RESEARCH.md): 78/78 verdes; cobertura 32 / 72.72 / 33.75 / 32 (lines/branches/functions/statements); lint exit 0 (45 warnings).

---

## Sampling Rate

- **After every task commit:** Run `node --test test/<arquivo-do-plano>.test.js` (arquivo focado do plano)
- **After every plan wave:** Run `npm run test:coverage` (suíte completa + gate)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

Convenção herdada (03-VALIDATION): um arquivo de teste por variação de ambiente — `node --test` roda cada arquivo em processo próprio; é a unidade de isolamento.

Adicional desta fase (contrato §14): **antes e depois de cada bump** (04-03, 04-05) rodar `npm run test:coverage` + `npm ls <pacote>` + `npm audit`, com as saídas registradas no SUMMARY.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| T1 — seam + bootstrap + cenários 1-3 | 04-01 | 1 | REL-03 | T-04-01-01, T-04-01-03 | Falha registrada e não relançada; lock liberado; rodada seguinte roda | caracterização | `node --test test/scheduler.resilience.test.js` | ❌ criado pela task | ⬜ pending |
| T2 — cenários 4-5 + gate | 04-01 | 1 | REL-03 | T-04-01-01, T-04-01-02 | Concorrência recusada (`{skipped:true}`); `runWeeklySummary` não relança | caracterização | `node --test test/scheduler.resilience.test.js && npm run test:coverage && npm run lint` | ⬜ estendido pela task | ⬜ pending |
| T3 — checkpoint C2 | 04-01 | 1 | REL-03 | — | Autorização humana para entrar no primeiro plano comportamental | manual (necessária) | `npm run test:coverage` (evidência) | n/a | ⬜ pending |
| T1 — RED: seam `staleHandler` + 7 cenários | 04-02 | 2 | REL-06 | T-04-02-01, T-04-02-03 | Teste mede o defeito antes da correção (RED) | novo fluxo | `node --test test/scheduler.failsafe.test.js` (espera exit ≠ 0) | ❌ criado pela task | ⬜ pending |
| T2 — GREEN: rethrow + todo `ui-01` | 04-02 | 2 | REL-06 | T-04-02-01, T-04-02-02, T-04-02-04 | 0 envios e 0 linhas no log quando `/tasks` falha; `results.error` preenchido; lock liberado; `GET /stale` → 500 `{error}` | novo fluxo | `node --test test/scheduler.failsafe.test.js && npm run test:coverage && npm run lint` | ✅ da task anterior | ⬜ pending |
| T1 — timeout 15s + `getDealById` + helper | 04-03 | 3 | REL-01 | T-04-03-01, T-04-03-04 | `axios.create` recebe `timeout: 15000`; `getDealById` usa a instância; timeout ∉ retry 429 | unitário + caracterização | `node --test test/agendor.timeout.test.js && npm test` | ❌ criado pela task | ⬜ pending |
| T2 — `/resolved` via `getDealById` + seam | 04-03 | 3 | REL-01 | T-04-03-02, T-04-03-03, T-04-03-06 | Shape completo preservado (incl. `dealStatus`); item com falha → não-resolvido, rota 200; zero `AGENDOR_TOKEN` na rota | regressão | `node --test test/notifications.resolved.test.js && npm run test:coverage && npm run lint` | ❌ criado pela task | ⬜ pending |
| T3 — bump axios `^1.19.0` | 04-03 | 3 | REL-01 | T-04-03-05, T-04-03-SC | Suíte verde antes/depois sem editar testes; lockfile só com axios e transitivas | regressão + gate | `npm ls axios && npm run test:coverage && npm run lint` | ✅ existe | ⬜ pending |
| T4 — checkpoint C4 (lockfile) | 04-03 | 3 | REL-01 | T-04-03-SC | Revisão humana do diff do lockfile | **manual (necessária)** | `git diff HEAD~1 -- backend/package-lock.json` (evidência) | n/a | ⬜ pending |
| T1 — 3 timeouts na fábrica | 04-04 | 4 | REL-02 | T-04-04-01, T-04-04-02 | Transporte recebe `connectionTimeout`/`greetingTimeout`/`socketTimeout` de D-02 | unitário | `node --test test/emailer.timeout.test.js && npm test` | ❌ criado pela task | ⬜ pending |
| T2 — exaustão, recriação e retorno por destinatário | 04-04 | 4 | REL-02 | T-04-04-04 | Exaustão devolve `{success:false}` sem throw; transporter recriado no retry; `{to, success, error?}` inalterado | caracterização | `node --test test/emailer.timeout.test.js && npm run test:coverage && npm run lint` | ✅ da task anterior | ⬜ pending |
| T1 — changelog + bump nodemailer `^9.0.4` | 04-05 | 5 | REL-02 | T-04-05-01..06, T-04-05-SC | Suíte verde sob v9 **sem editar nenhum teste**; lockfile de 1 entrada | regressão + gate | `npm ls nodemailer && npm run test:coverage && npm run lint` | ✅ existe (04-04 é o oráculo) | ⬜ pending |
| T2 — checkpoint C3 + C4 | 04-05 | 5 | REL-02 | T-04-05-05, T-04-05-SC | Revisão humana do changelog e do lockfile; nenhum afrouxamento de TLS | **manual (necessária)** | `git diff --name-only backend/test/` (deve estar vazio) | n/a | ⬜ pending |
| T1 — RED: 6 cenários de status em SQLite real | 04-06 | 6 | REL-05 | T-04-06-01, T-04-06-02 | Teste mede o defeito DESC-1 antes da correção (RED) | novo fluxo | `node --test test/notificationStatus.test.js` (espera exit ≠ 0) | ❌ criado pela task | ⬜ pending |
| T2 — GREEN: `updateNotificationStatus` + fluxo de log + todo | 04-06 | 6 | REL-05 | T-04-06-01..05 | `'sent'` só após ≥1 confirmação; falha total → `'error'` retentável; 1 linha por notificação; dedup de sucesso preservada | novo fluxo + regressão | `node --test test/notificationStatus.test.js && node --test test/db.dedup.test.js && npm run test:coverage && npm run lint` | ✅ da task anterior | ⬜ pending |
| T1 — RED: refetch e contagem por org | 04-07 | 7 | REL-04 | T-04-07-01, T-04-07-03 | Teste mede a categoria obsoleta e o `null`-de-erro persistente (RED) | unitário | `node --test test/agendor.cacheInvalidation.test.js` (espera exit ≠ 0) | ❌ criado pela task | ⬜ pending |
| T2 — GREEN: limpar as chaves no início de `getStaleDeals` | 04-07 | 7 | REL-04 | T-04-07-01, T-04-07-02, T-04-07-04 | 2ª execução usa a categoria nova; 1 chamada por org única; exclusão por categoria intacta (golden `[101, 103]`) | unitário + regressão | `node --test test/agendor.cacheInvalidation.test.js && node --test test/agendor.getStaleDeals.test.js && npm run test:coverage && npm run lint` | ✅ da task anterior + golden existente | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Continuidade de amostragem:** nenhuma sequência de 3 tasks sem `<automated>`. As 3 tasks de checkpoint
(04-01 T3, 04-03 T4, 04-05 T2) são precedidas e sucedidas por tasks automatizadas, e elas próprias carregam
um comando automatizado de evidência.

---

## Wave 0 Requirements

**Nenhum Wave 0 necessário.** A infraestrutura existente cobre todos os requisitos da fase: runner
(`node:test`), gate de cobertura (`c8` + `.c8rc.json`), helpers (`test/helpers/fakeAxios.js`,
`test/helpers/tmpDb.js`, `test/setup.js`) e fixtures (`test/fixtures/synthetic/deals-page.json`) já existem
das Fases 1-3. Os 6 arquivos de teste novos são criados **dentro** dos próprios planos, cada um no mesmo
commit da mudança de produção que ele cobre.

Arquivos de teste criados durante a fase:

- [ ] `backend/test/scheduler.resilience.test.js` — REL-03 (04-01)
- [ ] `backend/test/scheduler.failsafe.test.js` — REL-06 (04-02), incluindo os consumidores B2 e B3
- [ ] `backend/test/agendor.timeout.test.js` — REL-01 (04-03)
- [ ] `backend/test/notifications.resolved.test.js` — REL-01, shape da rota (04-03)
- [ ] `backend/test/emailer.timeout.test.js` — REL-02 (04-04)
- [ ] `backend/test/notificationStatus.test.js` — REL-05 (04-06)
- [ ] `backend/test/agendor.cacheInvalidation.test.js` — REL-04 (04-07)

Extensão aditiva de helper (04-03): `installFakeAxios` passa a devolver também os argumentos recebidos por
`axios.create`. Mudança **retrocompatível** — o retorno atual é um objeto e ganha apenas uma chave nova; os
3 arquivos que já consomem `fake.get.mock` continuam válidos.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Revisão do diff do lockfile do bump de **axios** (C4, fim do 04-03) | REL-01 / D-06 | Julgamento humano sobre mudanças indiretas de lockfile | `git diff HEAD~1 -- backend/package-lock.json` deve conter só axios e transitivas: 5 alteradas (`axios`, `follow-redirects`, `form-data`, `hasown`, `proxy-from-env`) + 6 novas (`agent-base`, `https-proxy-agent` e seus `debug`/`ms`). **`https-proxy-agent`/`agent-base` são novos e ESPERADOS** — `axios@1.19.0` passou a declará-los |
| Revisão do changelog nodemailer 6→9 na superfície usada (C3, antes do avanço do 04-05) | REL-02 (dep) / D-06 | Julgamento humano sobre breaking changes que a suíte não exercita (`emailer.js` tinha 7,16% de cobertura no baseline) | Conferir a tabela de breaking changes no SUMMARY com veredito por item (SESv2 7.0.0 / `NoAuth`→`ENOAUTH` 8.0.0 / TLS de conteúdo remoto 9.0.0); confirmar `git diff --name-only backend/test/` vazio; confirmar que nada afrouxou `tls.rejectUnauthorized` |
| Revisão do diff do lockfile do bump de **nodemailer** (C4, fim do 04-05) | REL-02 (dep) | Mesmo julgamento humano | `git diff HEAD~1 -- backend/package-lock.json` deve conter **exatamente 1** entrada alterada (nodemailer tem zero dependências) |
| Autorização de entrada no primeiro plano comportamental (C2, fim do 04-01) | REL-03 | Decisão humana de risco, exigida pelo contrato §21 e pela Decisão Q4 | Confirmar diff puramente aditivo em `scheduler.js` e que os 5 cenários pinam o comportamento atual |
| Teste SMTP real pós-bump (opcional, dentro de C3) | REL-02 | Assumption A6: comportamento de TLS contra o servidor SMTP real não é verificável por teste automatizado | Se houver credencial disponível, disparar `POST /api/config/test-smtp` uma vez após o bump |

Todos os demais comportamentos da fase têm verificação automatizada (ver matriz de testes do 04-DELIVERY-CONTRACT.md §13 e o Per-Task Verification Map acima).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (nenhum Wave 0 necessário — infra completa das Fases 1-3)
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planejado em 2026-08-04 — aguardando checkpoint C1 (revisão humana dos 7 PLANs).
