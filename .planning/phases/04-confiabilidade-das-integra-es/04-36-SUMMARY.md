---
phase: 04-confiabilidade-das-integra-es
plan: 36
subsystem: agendador + painel
tags: [CR5-01, contrato-de-payload, observabilidade, gap-closure-r5]
requires:
  - "backend/src/scheduler.js — o guard de concorrência de runCheck"
  - "backend/src/routes/notifications.js — POST /run devolvendo o objeto inteiro (não editado)"
provides:
  - "execucaoIgnorada — a chave própria da recusa do lock, aditiva ao contrato antigo"
  - "sendNow ramificando pela chave própria e exibindo o alarme agregado da rodada"
  - "caso (6) de scheduler.resilience.test.js — o par positivo"
  - "cenário K de scheduler.categoriaIndecidivel.test.js — o par negativo"
affects:
  - "frontend/src/components/Dashboard.jsx — a única superfície de feedback do disparo manual"
tech-stack:
  added: []
  patterns:
    - "desambiguação no PRODUTOR, não no consumidor: quando dois significados chegam à UI como o mesmo campo truthy, consertar do lado da tela é adivinhação de tipo"
    - "chave nova ADITIVA e contrato antigo preservado, com um caso de teste asserindo as duas juntas para impedir a 'limpeza'"
key-files:
  created: []
  modified:
    - backend/test/scheduler.resilience.test.js
    - backend/test/scheduler.categoriaIndecidivel.test.js
    - backend/src/scheduler.js
    - frontend/src/components/Dashboard.jsx
decisions:
  - "A desambiguação é no produtor (scheduler.js), não no consumidor: os dois significados chegam à UI como o mesmo campo truthy"
  - "`skipped: true` FICA por compatibilidade com consumidores não medidos — a chave nova é aditiva, não substituta"
  - "`execucaoIgnorada` NÃO nasce no literal de `results`: uma rodada que conclui não carrega o campo, nem 'padronizado' com valor falso"
  - "O toast do alarme agregado usa id próprio (`${toastId}-alarme`) para SOMAR ao resumo em vez de substituí-lo"
  - "Os cenários novos usam `=== 1`/igualdade estrita deliberadamente, para não repetir o afrouxamento do WR5-05"
metrics:
  duration: ~35 min
  completed: 2026-08-05
  tasks: 2
  tests: "192 → 194"
---

# Phase 04 Plano 36: Desambiguar a recusa do lock e devolver o alarme ao disparo manual — Summary

Fechou **CR5-01**: `runCheck` usava a chave `skipped` para o contrato do lock **e** para o contador
de negócios pulados, e o único consumidor do disparo manual ramificava por ela — toda rodada com ao
menos um negócio pulado pintava a tela de vermelho **sem texto**. A recusa ganhou chave própria
(`execucaoIgnorada`), o contrato antigo ficou de pé, e o alarme agregado da rodada passou a chegar
à tela no mesmo clique que o produziu.

## O que foi construído

**Task 1 (RED) — commit `7285f08`.** O PAR que fecha o contrato, aditivo, sem tocar uma linha de
produção:

- **Caso (6)** de `backend/test/scheduler.resilience.test.js` — a chamada recusada pelo lock traz
  `execucaoIgnorada === true`, `reason` string não vazia, `skipped === true` (o contrato antigo) e
  `stale === undefined` (a recusa não executou rodada nenhuma). As três chaves são asseridas
  **juntas** de propósito: é isso que impede alguém de remover a antiga "limpando" o contrato.
- **Cenário K** de `backend/test/scheduler.categoriaIndecidivel.test.js` — a rodada que **concluiu**
  com `r.skipped === 2` **não** traz `execucaoIgnorada` nem `reason`.

**Task 2 (GREEN) — commit `b879535`.**

- `backend/src/scheduler.js`: o guard do topo de `runCheck` passou a devolver
  `{ skipped: true, execucaoIgnorada: true, reason: 'Verificação já em andamento' }`, com o
  comentário registrando as quatro coisas exigidas pelo plano (a colisão medida; por que o contrato
  antigo fica; por que a chave nova não nasce no literal de `results`; e a ameaça mitigada por
  extenso — o operador que conclui ter perdido envios, dispara de novo e gera duplicatas).
- `frontend/src/components/Dashboard.jsx`: `sendNow` ramifica pela chave própria da recusa, com
  texto de reserva (`result.reason || 'Verificação já em andamento'`) para que a superfície nunca
  mais possa renderizar vazio; e, no ramo de sucesso, exibe o primeiro item de `result.errors` num
  toast de **id próprio** (`${toastId}-alarme`, duração 8000), que **soma** ao resumo em vez de
  substituí-lo.

## O RED literal (Task 1)

Saída do runner, `node --test test/scheduler.resilience.test.js`:

```
not ok 6 - (6) a chamada recusada pelo lock traz `execucaoIgnorada` E o motivo escrito, sem perder o contrato antigo
  ---
  failureType: 'testCodeFailure'
  error: |-
    a recusa precisa de uma chave PRÓPRIA: o consumidor não tem informação para distinguir o
    booleano da recusa do contador de negócios pulados
    + actual - expected

    + undefined
    - true

  code: 'ERR_ASSERTION'
  expected: true
  operator: 'strictEqual'
  ...
1..6
# pass 5
# fail 1
```

**Falhou na asserção certa** — a de `execucaoIgnorada`, com a forma exata prevista pelo plano
(`undefined !== true`), e não em `reason`, `skipped` ou `stale`. Os casos (1)–(5) verdes.

## O cenário K nasceu VERDE — e isso é o produto, não um defeito

`node --test test/scheduler.categoriaIndecidivel.test.js` → exit 0, **11 pass** (A–J + K) já no RED.
Isso estava **declarado no plano** e é esperado: `execucaoIgnorada` não existia em lugar nenhum,
então a asserção `r.execucaoIgnorada === undefined` passa por **ausência**.

O valor do caso não está no vermelho — está em ser o **guarda-corpo negativo**. Sem ele:

- um conserto que apenas trocasse o nome lido no consumidor deixaria o lock **silencioso** (a UI
  ramificaria por uma chave que ninguém produz, e a recusa cairia no ramo de sucesso exibindo
  `undefined notificação(ões) enviada(s)`);
- ou alguém "padronizaria" a chave nova pondo-a no literal de `results` — com valor verdadeiro ou
  como contador — e **toda** rodada viraria recusa, sem nenhum outro caso da suíte ficar vermelho.

É literalmente o que o revisor exige: *"sem o par, um conserto que apenas troque o nome no consumidor
deixa o lock silencioso"*.

## Números medidos ao lado dos prescritos

| Critério | Prescrito | Medido | |
|---|---|---|---|
| Suíte inteira | 194/194 | **194/194** (era 192) | ✓ |
| Lint backend | exit 0, 44 warnings | exit **0**, **44** | ✓ |
| Build frontend (o gate dele) | exit 0 | exit **0** | ✓ |
| Lint frontend | exit 0, 60 warnings | exit **0**, **60** | ✓ |
| Cobertura (`test:coverage`) | exit 0 | exit **0** | ✓ |
| `^test(` em `scheduler.resilience.test.js` | 6 | **6** (era 5) | ✓ |
| `^test(` em `scheduler.categoriaIndecidivel.test.js` | 11 | **11** (era 10) | ✓ |
| `execucaoIgnorada` em `backend/test` (ocorrências) | ≥ 2 | **8** | ✓ |
| Caso (4) byte a byte (`'Verificação já em andamento'` no diff de teste) | 0 | **0** | ✓ |
| Task 1 aditiva (`git diff -U0 backend/test/ \| grep -c '^-[^-]'`) | 0 | **0** | ✓ |
| Produção intocada na Task 1 (`--name-only -- backend/src/ frontend/`) | vazio | **vazio** | ✓ |
| `execucaoIgnorada` não-comentário em `scheduler.js` | 1 | **1** | ✓ |
| `skipped: true` não-comentário | 1 | **1** (inalterado) | ✓ |
| `results.skipped++` não-comentário | 4 | **4** (inalterado) | ✓ |
| WR5-01 não tocado (`skippedCategoriaIndecidivel\|funilNaoAvaliado` no diff) | 0 | **0** | ✓ |
| Prévia não tocada (`runCheckOnly\|seraNotificado` no diff) | 0 | **0** | ✓ |
| `skipped` em `frontend/src` | 0 | **0** (era 1) | ✓ |
| `execucaoIgnorada` em `frontend/src` | 1 | **1** | ✓ |
| `\breason\b` em `frontend/src` | 1 | **1** (a linha corrigida, no ramo certo) | ✓ |
| `result.reason \|\|` em `Dashboard.jsx` | 1 | **1** | ✓ |
| `result.errors` em `Dashboard.jsx` | ≥ 1 | **2** | ✓ |
| id do toast do alarme ≠ `toastId` | diferente | `${toastId}-alarme` | ✓ |
| Bloco JSX de erros não editado (`lastRun?.errors` no diff) | 0 | **0** | ✓ |
| `checkOnly` não editada (`result.total` no diff) | 0 | **0** | ✓ |
| `'Erro ao enviar notificações'` (o catch com texto) | 1 | **1** | ✓ |
| `res.json(result)` em `notifications.js` | 2 | **2** | ✓ |
| `notifications/run` em `frontend/src` | 1 | **1** | ✓ |
| Rota tocada | vazio | **vazio** | ✓ |
| Testes editados na Task 2 | vazio | **vazio** | ✓ |
| `package.json`/lockfiles (T-04-36-SC) | vazio | **vazio** | ✓ |
| Referência por número de linha no diff | 0 | **0** | ✓ |

**Invariantes herdadas, medidas e não regredidas:** `catch (erroDeRegistro)` = **1**;
`results.notified++` não-comentário = **2**; `continue;` não-comentário = **3**;
`results.error = ` não-comentário = **3**; `>= 1` em linhas ADICIONADAS do diff (o afrouxamento do
WR5-05, que **não** é escopo daqui) = **0**.

**Cobertura medida de `scheduler.js`:** **87,72%** linhas / **79,06%** branches / 66,66% funções
(`All files` 76,86 / 78,66 / 63,63). Gate de cobertura exit 0.

**Nenhuma divergência de contagem nesta rodada.** Os 24 critérios numéricos das duas tasks bateram
com o valor prescrito. (A fase acumulou onze divergências até aqui, todas registradas; esta é a
primeira sem nenhuma.)

## Divergência de FERRAMENTAL — registrada, não silenciada

O plano manda `npm run format` antes de medir contagens. Duas coisas medidas:

1. **`npm run format` não existe na raiz do repositório** — o script está em `backend/package.json` e
   em `frontend/package.json`, não no `package.json` raiz (`npm error Missing script: "format"`).
   Rodado em cada subprojeto separadamente.
2. **O `biome format --write .` do backend reformata SEIS arquivos de teste preexistentes**, alheios
   a este plano: `dealId.validation`, `deals.errorLog`, `envExample`,
   `notificationStatus.canalParcial`, `notifications.resolved` e `secrets.grep` (81 inserções, 21
   remoções — dívida de `lineWidth` 80 anterior). Eles foram **devolvidos ao estado original** nas
   duas tasks, arquivo por arquivo, para que o diff fique estritamente no escopo e o gate "Task 1 é
   aditiva" / "nenhum teste editado na Task 2" continue significando o que diz. Mesma classe do
   desvio registrado no 04-26. **A dívida continua aberta** e não tem dono nesta rodada.

O frontend saiu **"No fixes applied"** — o `Dashboard.jsx` editado já nasceu formatado.

## Inventário de irmãos — classificação FINAL dos três grupos

### Grupo 1 — irmãos do construto

| # | Construção | Classificação final | Evidência |
|---|---|---|---|
| 1 | `runCheck` — o guard `if (isRunning)` | **corrigida** | Caso (6) verde: `execucaoIgnorada === true` **e** `reason` string não vazia **e** `skipped === true` |
| 2 | `runCheck` — o retorno da rodada que CONCLUIU | **corrigida pelo lado negativo** | Cenário K verde: `r.skipped === 2`, `r.execucaoIgnorada === undefined`, `r.reason === undefined` |
| 3 | `runCheckOnly` (prévia, `POST /check`) | **verificada-e-sã por medição** | Não tem lock e não devolve `skipped` nenhum — devolve array; o consumidor `checkOnly()` ramifica por `typeof result.total === 'number'`. Gate: `runCheckOnly\|seraNotificado` no diff de `scheduler.js` = **0** |
| 4 | `runWeeklySummary` | **verificada-e-sã por medição** | Sem lock `isRunning`, comportamento ATUAL pinado pelo caso (5) do mesmo arquivo. Ausente do diff |
| 5 | `dealResult.skipped` (por negócio) × `results.skipped` (contador) | **verificada-e-sã por medição** | Objetos diferentes e **zero** consumidores de UI do booleano por negócio: `grep -ro 'skipped' frontend/src` foi de **1** para **0**. Quem lê `deals[].skipped` são os testes A–J |
| 6 | O bloco JSX "Erros na última execução" | **verificada-e-sã e REUSADA** | Não editado (`lastRun?.errors` no diff = **0**); o mesmo array passou a ser exibido também no caminho do disparo |

### Grupo 2 — cláusula (a): DIREÇÃO REVERSA (o que pode NEUTRALIZAR o construto novo)

| # | Neutralizador | Classificação | Gate medido |
|---|---|---|---|
| 1 | A rota projetar campos em vez de devolver o objeto | **bloqueado por gate** | `res.json(result)` em `notifications.js` = **2** (inalterado); `git diff --name-only -- backend/src/routes/` **vazio** |
| 2 | Um SEGUNDO produtor de `{ skipped: true }` sem a chave nova | **bloqueado por gate** | `skipped: true` não-comentário em `scheduler.js` = **1** |
| 3 | Um SEGUNDO consumidor de `POST /run` | **bloqueado por gate** | `notifications/run` em `frontend/src` = **1** |
| 4 | O `catch {}` de `sendNow` | **verificado-e-são** | Cai em `toast.error('Erro ao enviar notificações')`, que **tem texto** e não reproduz o defeito. `grep -c` = **1** (a mensagem literal continua no arquivo) |
| 5 | O alarme agregado chegar vazio (virar ruído diário) | **verificado-e-são** | Os pares D/E (04-28) e I/J (04-35) já pinam `r.errors.length === 0` em rodada sã; o cenário K volta a medi-lo |
| 6 | `execucaoIgnorada` nascer no literal de `results` | **bloqueado por gate DUPLO** | Estático: `execucaoIgnorada` não-comentário em `scheduler.js` = **1** (só no retorno do guard). Dinâmico: cenário K assere a ausência numa rodada concluída |

### Grupo 3 — cláusula (b): RETROATIVIDADE DA JUSTIFICATIVA

O comentário novo condena uma forma: *"uma chave que significa duas coisas incompatíveis, e um
consumidor que não tem informação para separá-las"*. Grep do mesmo arquivo por construções que a
frase condena:

| Construção encontrada | Classificação final | Medição / dono |
|---|---|---|
| `results.error` — "a rodada MORREU" (catch externo) **e** "a rodada concluiu com alarme" (04-28, 04-35) | **fora-de-escopo-com-medição** | É o Info **IN5-01**. Medido: `results.error = ` não-comentário = **3**; e **nenhum** consumidor de UI lê o campo escalar (`lastRunResult` em `frontend/src` = 1 ocorrência, que lê `errors`). Dano **latente, não realizado** — diferente do CR5-01, que era realizado. Dono: plano **04-38** |
| `skipped` como booleano por negócio **e** contador da rodada | **verificada-e-sã por medição** | Item 5 do Grupo 1: objetos diferentes e zero consumidores de UI do booleano por negócio depois desta task |
| `reason` (motivo da RECUSA) × `skipReason` (motivo da SUPRESSÃO de um negócio) | **verificada-e-sã por medição** | Nomes distintos, e a distinção é a que o conserto preserva: `\breason\b` em `frontend/src` = **1** antes e **1** depois, agora dentro do ramo certo. `skipReason` em `frontend/src` = **0**, com dono já existente (`cr4-01c`) |
| `results.skipped` incrementado por QUATRO causas | **verificada-e-sã, com dono anterior** | Enfrentado pelo 04-28 com contador dedicado; o comentário do literal já enumera as quatro por escrito. `results.skipped++` = **4** (inalterado) |

## Threat model — dispositions aplicadas

| Threat ID | Disposição | Como ficou |
|---|---|---|
| T-04-36-01 (Spoofing — toast em branco falsifica o desfecho) | **mitigado** | Ramificação por `execucaoIgnorada` (só existe no caminho de recusa) + texto de reserva no toast de erro. Pinado pelo par (6)+K |
| T-04-36-02 (Repudiation — alarme invisível no disparo manual) | **mitigado** | `sendNow` exibe `result.errors[0]` em toast de id próprio, sem substituir o resumo |
| T-04-36-03 (Tampering — quebrar consumidor não medido) | **mitigado** | `skipped: true` e `reason` preservados; o caso (6) assere as três chaves juntas |
| T-04-36-04 (Info Disclosure — texto do alarme) | **mitigado** | Nenhuma mensagem nova no backend e nenhuma interpolação de objeto de erro no frontend. `--name-only -- backend/src/routes/` vazio; nenhum bloco de alarme de `scheduler.js` no diff |
| T-04-36-05 (DoS — volume de toasts) | **aceito (verificado)** | No máximo **dois** por clique: o resumo e, quando existir, **um** alarme por rodada (agregado por construção, pinado por `r.errors.length === 1` em D e I) |
| T-04-36-SC (Tampering — instalação de pacotes) | **mitigado** | Nenhuma instalação: `git status --porcelain` dos três `package.json` e dos três lockfiles **vazio**. O portão humano de legitimidade de pacote não se aplica |

## Desvios

**Nenhuma Rule 1–4 acionada.** Nenhum pacote instalado. Nenhum comportamento fora do plano.

A única intervenção não prescrita foi a **reversão dos seis arquivos reformatados pelo Biome** (ver
"Divergência de ferramental" acima) — que é o cumprimento de um critério de aceite do plano
(diff estritamente no escopo), não uma alteração de comportamento.

## O que este plano NÃO fecha (dono nomeado)

| Achado | Dono |
|---|---|
| **WR5-01** — o alarme de supressão total é desarmado por qualquer `continue` anterior (a dedup do dia inclusive) | plano **04-37** |
| **`cr4-01b`** — o todo cuja "Correção proposta" conserta o denominador quando o defeito está no numerador; precisa ser **reescrito**, não fechado | plano **04-37** |
| **WR5-02** — aviso por negócio no caminho de leitura (N linhas por atualização de tela) | plano **04-38** |
| **WR5-03** — alarme de forma do funil disparando com N=1 | plano **04-38** |
| **WR5-04** — contadores irmãos usando `console.log` vs `logger.warn` | plano **04-38** |
| **WR5-05** — asserções de envio afrouxadas de `=== 1` para `>= 1`, perdendo detecção de e-mail DUPLICADO | plano **04-38** (os cenários novos daqui usam igualdade estrita de propósito; `>= 1` em linhas adicionadas = 0) |
| **IN5-01** — `results.error` significando duas coisas incompatíveis (achado pela cláusula (b) **dentro** deste plano) | plano **04-38** |
| **IN5-02..IN5-04** | plano **04-38** |
| Dívida de formatação Biome em 6 arquivos de teste preexistentes | **sem dono** — registrado aqui |

**SEC-01 permanece ABERTO** (decisão C8) — não tocado, não declarado resolvido; nenhum valor de
segredo aparece em nenhum artefato deste plano.

## Atenção para quem seguir

- `scheduler.resilience.test.js` deixou de ser só o oráculo do lock e passou a ser o oráculo do
  **contrato do payload da recusa**: o caso (4) pina o contrato antigo, o (6) pina o novo, e é o
  **contraste** entre eles que documenta a compatibilidade. Uma terceira chave no retorno do guard
  entra ali, ao lado das duas.
- O cenário **K** é o guarda-corpo de quem mexer no literal de `results`: pôr `execucaoIgnorada` lá
  (com valor verdadeiro ou como contador) fica vermelho nele e em nenhum outro lugar da suíte.

## Self-Check: PASSED

- `backend/test/scheduler.resilience.test.js` — FOUND
- `backend/test/scheduler.categoriaIndecidivel.test.js` — FOUND
- `backend/src/scheduler.js` — FOUND
- `frontend/src/components/Dashboard.jsx` — FOUND
- commit `7285f08` (Task 1, RED) — FOUND
- commit `b879535` (Task 2, GREEN) — FOUND
