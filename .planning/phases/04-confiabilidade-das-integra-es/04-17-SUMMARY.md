---
phase: 04-confiabilidade-das-integra-es
plan: 17
subsystem: emailer
tags: [rel-02, wr2-05, smtp, transporte-vivo, retry, tdd, checkpoint-c11]

# Dependency graph
requires:
  - phase: 04-confiabilidade-das-integra-es
    provides: "04-04 (os 3 timeouts de D-02 na fabrica + a caracterizacao de sendMailWithRetry em emailer.timeout.test.js), 04-10 (canal err.resultadosParciais), 04-13 (avancarRelogioAte com desfecho normalizado), 04-16 (emailer.js deixou sendMailWithRetry intocada de proposito)"
provides:
  - "sendMailWithRetry devolve o transporte em uso nos DOIS retornos (sucesso e falha)"
  - "sendStaleNotification reaproveita o transporte recriado no destinatario seguinte — o `let` do chamador deixou de ser variavel morta"
  - "O retorno por destinatario continua com os MESMOS conjuntos de chaves: {to, success} no sucesso e {to, success, error} na falha"
  - "emailer.transporteVivo.test.js como oraculo da contagem de conexoes por rodada (2 no caminho de falha, 1 no caminho feliz)"
affects: [04-18, verificacao-da-fase-04, rel-02b-deadline-global-smtp]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Desestruturacao com rest para separar um campo de transporte do resultado ANTES do push — preserva conjuntos de chaves pinados por Object.keys em teste vizinho"
    - "Stub de createTransport com IDENTIDADE por transporte (indice sequencial preso no fecho) e SEM receber o objeto de opcoes — PC-13 satisfeito por construcao, nao por grep"
    - "Construtor unico de argumentos do SUT no arquivo de teste, para que o nome do parametro publico apareca em um so lugar"

key-files:
  created:
    - backend/test/emailer.transporteVivo.test.js
  modified:
    - backend/src/emailer.js

key-decisions:
  - "D-WR2-05-a aplicada: o transporte vivo volta junto do resultado, em vez de criar um transporte por destinatario (que dobraria as conexoes do caminho de todo dia para resolver um problema do caminho de falha)"
  - "D-WR2-05-b aplicada: o push separa o transporte do resultado com rest; o conjunto de chaves de results[i] nao mudou"
  - "D-WR2-05-c respeitada: emailer.timeout.test.js nao foi editado — e ele quem detecta a regressao de shape"
  - "O transporte volta TAMBEM no retorno de falha, de proposito: apos uma exaustao com recriacoes, o transporte mais novo ainda e a melhor aposta para o destinatario seguinte"
  - "Tres desvios de MEDICAO declarados e aceitos pelo usuario no C11: dois greps do plano contados sobre escopo errado e o PC-13 verificado por construcao"

patterns-established:
  - "Terceira ocorrencia do mesmo achado estrutural da rodada: um criterio de aceite por grep contado sobre escopo diferente do que o plano descreve em prosa — medir antes de prometer o numero"

requirements-completed: [REL-02]

# Metrics
duration: 22min
completed: 2026-08-05
---

# Phase 04 Plan 17: o transporte recriado no retry serve o destinatário seguinte (WR2-05) Summary

**`sendMailWithRetry` recriava a conexão SMTP reatribuindo o próprio parâmetro, então o transporte novo morria com a chamada e o segundo destinatário recomeçava com a conexão que já se provou quebrada — pagando outro ciclo de 3s+6s e com chance maior de sumir sob uma linha `'sent'`; agora o transporte vivo volta junto do resultado e uma rodada de dois destinatários com a primeira conexão morta cria 2 conexões, não 3, sem que o retorno por destinatário mude de forma.**

## Performance

- **Duration:** ~22 min
- **Tasks:** 3 de 3 (RED + GREEN + checkpoint C11 aprovado)
- **Files:** 1 criado, 1 modificado
- **Diff de produção:** 2 retornos de `sendMailWithRetry` e 2 blocos de envio de `sendStaleNotification` (+ comentários); nenhum outro arquivo de produção tocado

## Accomplishments

- **WR2-05 fechado.** `transporter = createTransporter()` dentro do laço de retry reatribui o **parâmetro** da função, não a variável do chamador. Em `sendStaleNotification`, `let transporter = createTransporter()` nunca era reatribuído — era um `let` morto, e o morto escondia justamente a intenção original de reaproveitar a conexão recriada.
- **O custo tinha duas partes, e a segunda é a que importa.** Tempo: cada destinatário adicional pagava um ciclo completo de retry evitável (3s + 6s de espera, mais os timeouts de conexão de D-02). Entrega: o segundo destinatário é o elo mais frágil do fluxo — com a semântica de sucesso parcial vigente (≥ 1 confirmação mantém a linha em `'sent'`), quem **não** recebeu simplesmente **some**, porque a dedup bloqueia o negócio pelo dia inteiro e o único vestígio é a coluna `error` de uma linha cujo status diz `'sent'`. Reduzir a chance de o segundo destinatário falhar ataca diretamente a pior classe de falha do milestone: notificação perdida em silêncio.
- **O retorno por destinatário não mudou de forma.** A desestruturação com rest tira o transporte do resultado **antes** do `push`. `results` continua `{to, success}` no sucesso e `{to, success, error}` na falha — o que importa porque esse array viaja em `err.resultadosParciais` até o agendador e é agregado na coluna `error` do `notification_log`.
- **A semântica de retry de D-03 sobreviveu byte a byte.** As linhas do `for`, do `isNetworkError`, do `console.warn`, da espera e da recriação **não aparecem no diff**. A exaustão continua **resolvendo** com `{ success: false }` em vez de lançar.
- **Nenhum arquivo de teste vizinho teve asserção alterada.** `git diff --name-only backend/test/` vazio ao final da Task 2.
- Suíte: **148/148 verdes** (145 → 148, exatamente os 3 casos novos); cobertura acima dos pisos; `npm run lint` exit 0.

## Task Commits

1. **Task 1: RED — o segundo destinatário recomeça com o transporte que já falhou** — `aa84569` (test)
2. **Task 2: GREEN — o transporte vivo volta junto do resultado e serve o destinatário seguinte** — `97df447` (fix)
3. **Task 3: Checkpoint C11** — aprovado pelo usuário em 2026-08-05 (sem commit de código)

## RED medido, não afirmado — e desta vez a previsão do plano bateu

Saída literal de `node --test test/emailer.transporteVivo.test.js` em `aa84569`, antes de qualquer mudança em produção:

```
# [Emailer] Tentativa 1 falhou (Connection timeout). Aguardando 3s antes de retentar...
# [Emailer] Tentativa 1 falhou (Connection timeout). Aguardando 3s antes de retentar...
not ok 1 - (1) o transporte recriado no retry do dono precisa servir o segundo destinatário (WR2-05)
  ---
  failureType: 'testCodeFailure'
  error: |-
    o autor deve reusar o transporte que o retry do dono acabou de recriar, em vez de recomeçar com o que já falhou

    3 !== 2

  code: 'ERR_ASSERTION'
  expected: 2
  actual: 3
  operator: 'strictEqual'
ok 2 - (2) o retorno por destinatário não muda de forma — o transporte não vaza para results
ok 3 - (3) caminho feliz: uma conexão por rodada, não uma por destinatário
# tests 3
# pass 2
# fail 1
```

Três leituras que valem registrar:

1. **`transportesCriados === 3`, exatamente a inferência do plano.** Diferente do 04-15 e do 04-16, aqui não houve divergência de estado — nenhuma correção de previsão foi necessária, e portanto nenhuma razão para parar e reportar.
2. **A prova operacional está no log do próprio SUT, não só na asserção:** as **duas** linhas `[Emailer] Tentativa 1 falhou (Connection timeout). Aguardando 3s antes de retentar...`. Uma é do dono; a segunda é o autor pagando de novo o ciclo que o defeito torna inevitável. É o desperdício de tempo visível em texto.
3. **Os casos 2 e 3 já passavam no RED, como previsto.** Eles não medem o defeito — existem como detectores locais das duas regressões que o próprio fix poderia introduzir (vazamento do transporte para `results`; e trocar reuso por uma conexão por destinatário).

## O diff de produção

### `backend/src/emailer.js` — os dois retornos de `sendMailWithRetry`

```diff
-      return { success: true };
+      return { success: true, transporteEmUso: transporter };
...
-      return { success: false, error: err.message };
+      return {
+        success: false,
+        error: err.message,
+        transporteEmUso: transporter,
+      };
```

Devolver o transporte **também no retorno de falha** é deliberado: se a exaustão aconteceu depois de uma ou duas recriações, o transporte mais novo ainda é a melhor aposta para o destinatário seguinte. Devolvê-lo só no sucesso deixaria justamente o pior caso sem conserto.

### `backend/src/emailer.js` — os dois blocos de envio

O mesmo par de mudanças no bloco do dono e no do autor:

```diff
-      const result = await sendMailWithRetry(transporter, { … });
-      results.push({ to: ownerEmail, ...result });
+      const { transporteEmUso, ...resultado } = await sendMailWithRetry(
+        transporter,
+        { … },
+      );
+      if (transporteEmUso) transporter = transporteEmUso;
+      results.push({ to: ownerEmail, ...resultado });
```

O corpo do objeto de opções (`from`, `to`, `subject`, `html: dealEmailHtml({…})`) é **byte a byte o mesmo** — só recuou um nível de indentação porque a chamada passou a ocupar múltiplas linhas (quebra do Biome, `lineWidth` 80).

**Por que rest e não listar as chaves:** a alternativa óbvia — `results.push({ to, success: resultado.success, error: resultado.error })` — introduziria `error: undefined` no caminho de sucesso, e `emailer.timeout.test.js` assere `Object.keys(item).sort() === ['success','to']`. Uma chave a mais, **inclusive com valor `undefined`**, quebraria o oráculo de REL-02, que o plano proíbe editar. O rest preserva os conjuntos de chaves sem que ninguém precise mantê-los sincronizados à mão.

### Comentários (PT-BR, âncoras por nome — WR2-06)

Três blocos, todos explicando **decisão**, não mecânica: acima de `sendMailWithRetry` (por que o transporte volta junto do resultado, por que também na falha, e a declaração explícita de que nada de D-03 muda ali); acima do bloco do dono (por que rest, e o que vazaria para `err.resultadosParciais` e para a coluna `error` do `notification_log` se o retorno fosse espalhado inteiro); e acima do bloco do autor (onde está o ganho concreto). Citam `emailer.transporteVivo.test.js` como quem pina a contagem de conexões e `emailer.timeout.test.js` como quem pina o shape do retorno.

### O que NÃO mudou

`createTransporter` e os 3 timeouts de D-02, `dealEmailHtml`, `verifySmtp`, os resumos semanais, o `try` que envolve os dois blocos de envio, a anexação de `err.resultadosParciais`, o `throw err` e o `module.exports`: intocados — nenhum aparece no diff. `scheduler.js`, `agendor.js`, `db.js`, `package.json` e o lockfile: sem diff.

## O teste novo

`backend/test/emailer.transporteVivo.test.js` (227 linhas, 3 casos). Molde de bootstrap copiado de `emailer.timeout.test.js` (exercita `sendStaleNotification` **direto**, sem scheduler e sem banco de negócios), com três diferenças que carregam comentário próprio:

1. **Identidade por transporte.** Cada objeto criado pelo stub recebe um índice sequencial preso no fecho, e o `sendMail` ramifica por esse índice — é o que distingue "transporte antigo" de "transporte novo" e o que torna a contagem de conexões uma asserção possível.
2. **O stub não recebe o objeto de opções.** A assinatura é `() => {…}`, sem parâmetro. O objeto que carrega a senha SMTP nunca é ligado a um nome no arquivo — PC-13 satisfeito **por construção**, mais forte do que o grep que o plano prescrevia.
3. **Helper compartilhado.** `avancarRelogioAte` vem de `./helpers/fakeTimers` (o corrigido no 04-13); a cópia local defeituosa de `emailer.timeout.test.js` **não** foi replicada nem deduplicada — aquele arquivo continua sendo oráculo de REL-02 e é justamente o `emailer.js` que muda aqui.

Ordem das asserções do caso 1, seguindo a lição do 04-15/04-16: as pré-condições que valem **nos dois estados** vêm primeiro (`resultados.length === 2`, `enviosPorTransporte[1] >= 1`), a asserção central vem em seguida (é ela quem deve produzir o vermelho), e a versão forte que **só** vale no estado corrigido (`enviosPorTransporte[1] === 1`) fica por último. Colocar a forte no topo produziria, no RED, um vermelho sobre o instrumento em vez de sobre o defeito.

## Verificação (todos os critérios do plano, medidos)

| Critério | Comando | Resultado |
|---|---|---|
| RED do caso 1 | `node --test test/emailer.transporteVivo.test.js` (em `aa84569`) | exit ≠ 0, `# fail 1`, `3 !== 2` |
| RED: casos 2 e 3 já verdes | idem | `# pass 2` |
| GREEN: 3 casos | `node --test test/emailer.transporteVivo.test.js` | exit 0, `# pass 3` |
| REL-02 sem edição | `node --test test/emailer.timeout.test.js` | exit 0, `# pass 9` |
| Senha SMTP sem edição | `node --test test/emailer.smtpPass.test.js` | exit 0, `# pass 3` |
| REL-05/Q1 sem edição | `node --test test/notificationStatus.test.js` | exit 0, `# pass 6` |
| Sucesso parcial sem edição | `node --test test/notificationStatus.partialFailure.test.js` | exit 0, `# pass 3` |
| WR2-02 sem edição | `node --test test/notificationStatus.registroResiliente.test.js` | exit 0, `# pass 1` |
| WR2-04 sem edição | `node --test test/notificationStatus.canalParcial.test.js` | exit 0, `# pass 1` |
| Testes vizinhos intocados | `git diff --name-only backend/test/` após a Task 2 | vazio |
| `emailer.timeout.test.js` intocado | `git diff --name-only` daquele arquivo | vazio |
| Push não espalha o retorno | `grep -c "\.\.\.result }" src/emailer.js` | `0` |
| Reaproveitamento nos dois blocos | `grep -c "transporter = transporteEmUso" src/emailer.js` | `2` |
| Retry: espera | `grep -c "attempt \* 3000" src/emailer.js` | `1` |
| Retry: tentativas | `grep -c "retries = 3" src/emailer.js` | `1` |
| Task 1 sem tocar produção | `git diff --name-only backend/src/` durante a Task 1 | vazio |
| Produção restrita a um arquivo | `git diff --name-only backend/src/` | `emailer.js` |
| `package.json` / lockfile | `git diff --name-only` | vazio |
| Helper compartilhado | `grep -c "require('./helpers/fakeTimers')"` no teste novo | `1` |
| Sem cópia local do helper | `grep -c "async function avancarRelogioAte"` | `0` |
| Sem `tickAsync` (não existe no Node 20) | `grep -c "tickAsync"` | `0` |
| Pré-condições rotuladas | `grep -c "pré-condição:"` | `4` (≥ 2 exigidas) |
| Tamanho do arquivo | `wc -l` | `227` (≥ 120 exigidas) |
| Suíte + cobertura | `npm run test:coverage` | exit 0, **148/148** |
| Lint | `npm run lint` | exit 0 (44 warnings, baseline) |
| Format | `biome format` nos 2 arquivos | exit 0, "No fixes applied" |

Cobertura global: **59,34% linhas / 80,85% branches** (pisos 20/60). `emailer.js` em 41,42% linhas / 84,84% branches.

## Decisions Made

1. **O transporte vivo volta junto do resultado** (D-WR2-05-a), em vez de criar um transporte por destinatário. Criar por destinatário dobraria o número de conexões no **caminho feliz** — que é o caminho de todo dia — para resolver um problema do caminho de falha. O caso 3 existe exatamente para impedir que alguém "simplifique" nessa direção.
2. **O transporte volta também no retorno de falha.** Depois de uma exaustão com recriações, a conexão mais nova ainda é a melhor aposta para o próximo destinatário; devolvê-la só no sucesso deixaria o pior caso sem conserto.
3. **O `push` separa o transporte com rest** (D-WR2-05-b). Listar as chaves explicitamente introduziria `error: undefined` no sucesso e quebraria `emailer.timeout.test.js`, oráculo de REL-02.
4. **`emailer.timeout.test.js` não foi editado nem deduplicado** (D-WR2-05-c). Ele é o detector desta mudança, e a cópia local defeituosa de `avancarRelogioAte` continua lá de propósito: trocar o instrumento e o objeto medido na mesma rodada é o que a constraint de processo do `CLAUDE.md` proíbe. A deduplicação segue como trabalho futuro.
5. **[C11, decisão vinculante do usuário, 2026-08-05]** Os cinco pontos do roteiro de verificação foram confirmados por escrito: D-03 intacta, transporte sem vazamento, RED reproduzido de fato, caminho feliz com uma conexão por rodada. Entrada no 04-18 autorizada pelo coordenador (não pelo executor).
6. **[C11 (2), usuário, 2026-08-05]** O todo `rel-02b-deadline-global-smtp` **mantém** prioridade alta / pré-go-live, sem alteração. Esta mudança reduz o pior caso de tempo por rodada (um ciclo de retry a menos por destinatário adicional), mas não toca a causa daquele item: desde o nodemailer 8.0.0 o `connectionTimeout` vale **por endereço A/AAAA resolvido**, sem deadline acumulada. Os gatilhos de reavaliação registrados no arquivo continuam valendo tal como estão. **O arquivo do todo NÃO foi editado.**

## Deviations from Plan

Nenhuma deviation de execução das Regras 1-4 (nenhum bug, funcionalidade crítica faltante ou bloqueio foi encontrado fora do escopo). **Três desvios de MEDIÇÃO**, apresentados no C11 e **aceitos pelo usuário**, todos por critérios de aceite do plano contados sobre escopo diferente do que o próprio plano descreve em prosa:

| # | Critério do plano | Valor real medido | Razão |
|---|---|---|---|
| 1 | `grep -v "^\s*//" src/emailer.js \| grep -c "transporter ="` = **3** | antes **6**, depois **8** | O grep é sobre o **arquivo inteiro**, mas o número foi calculado só para `sendMailWithRetry`/`sendStaleNotification`. Os resumos semanais têm 4 `const transporter = createTransporter();` pré-existentes e intocados. E a reatribuição no chamador acontece nos **dois** blocos de envio, não em um — o plano contou 1 onde a sua própria prescrição ("nos dois blocos de envio") exige 2. O intento é verificável direto: `grep -c "transporter = transporteEmUso"` = **2** |
| 2 | `grep -c "success: false" src/emailer.js` = **1** | **3**, antes e depois (sem mudança) | Mesmo escopo errado: as outras 2 são dos resumos semanais (`results.push({ …, success: false, … })`). Dentro de `sendMailWithRetry` continua sendo exatamente **1**, que é o que o critério queria medir |
| 3 | `grep -c "auth" test/emailer.transporteVivo.test.js` = **0** | **2** | Inatingível: uma ocorrência é `authorName` (campo do negócio sintético que o template lê, igual ao molde de `emailer.timeout.test.js`) e a outra é `authorEmail:`, o nome do **parâmetro público do próprio SUT** — escrito num único lugar do arquivo, por um construtor de argumentos compartilhado pelos 3 casos. Nenhuma das duas é credencial. PC-13 foi satisfeito de forma **mais forte** do que o grep media: o stub de `createTransport` não recebe sequer o parâmetro de opções, então o objeto que carrega a senha nunca é ligado a um nome no teste |

Também previsto pelo plano e não observado: nenhuma divergência de estado no RED (`transportesCriados === 3` bateu com a inferência), portanto nenhuma parada por divergência.

**Total deviations:** 0 (Regras 1-4); 3 desvios de medição declarados e aprovados no C11

## Issues Encountered

- **`npx` continua não funcionando nesta máquina** (mesmo achado do 04-12 ao 04-16). O Biome foi invocado por caminho de pacote: `node backend/node_modules/.bin/biome …`.
- **O Biome quebrou duas expressões prescritas em uma linha** (o retorno de falha de `sendMailWithRetry` e o `Object.assign` do erro injetado no teste) em blocos multilinha — `lineWidth` 80, formatador obrigatório pelo `CLAUDE.md`. Sem efeito sobre asserção ou comportamento.
- **Lint reporta 44 warnings**, mesmo baseline das ondas anteriores; os dois arquivos deste plano não acrescentam nenhum. `npm run lint` sai 0 (o gate).

## Threat Flags

Nenhuma superfície nova. Itens do registro do plano:

| Threat ID | Disposição | Como foi tratado | Evidência |
|---|---|---|---|
| T-04-17-01 | mitigate | Transporte vivo devolvido e reaproveitado no destinatário seguinte | Caso 1: `transportesCriados === 2` e os dois destinatários com `success === true`; `enviosPorTransporte[1] === 1` (o transporte morto é encontrado uma única vez na rodada) |
| T-04-17-02 | mitigate | Desestruturação com rest no `push`; o transporte nunca entra em `results` | Caso 2 assere `Object.keys` exato nos dois desfechos; `grep -c "...result }"` = 0; `emailer.timeout.test.js` verde sem edição |
| T-04-17-03 | mitigate | Stub ramifica por índice e por `mailOptions.to`, **sem receber o objeto de opções** | Assinatura `() => {…}` no stub; o objeto com a senha nunca é ligado a um nome. O grep prescrito (`auth` = 0) foi substituído por essa garantia estrutural, com aceite do usuário no C11 |
| T-04-17-04 | mitigate | Política de retry de D-03 fora do diff | Nenhuma linha do `for`, do `isNetworkError`, do `console.warn`, da espera ou da recriação aparece no diff; `attempt * 3000` = 1, `retries = 3` = 1; `emailer.timeout.test.js` `# pass 9` sem edição |
| T-04-17-05 | mitigate | Reuso, não conexão por destinatário | Caso 3 assere `transportesCriados === 1` e `enviosPorTransporte[1] === 2` |
| T-04-17-SC | accept | Nenhuma instalação de pacote | `backend/package.json` e lockfile sem diff |

## Known Stubs

Nenhum. Nenhum valor fixo, placeholder ou fonte de dados não ligada.

## User Setup Required

None.

## Next Phase Readiness

- **04-18 é o último plano da fase** (WR2-06 + os todos IN2-01..IN2-04 + a **DECISÃO C9**, que manda atualizar a redação do Success Criteria 4 do ROADMAP sobre REL-04 para descrever o comportamento garantido — isolamento por execução — e não o mecanismo antigo de "invalidar o cache a cada execução"). A entrada nele foi autorizada no C11, mas **quem despacha é o coordenador**.
- **Ordem de rollback declarada**, caso precisem voltar: 04-17, 04-16, 04-15, 04-14. Reverter este plano volta ao transporte morto e ao ciclo de retry repetido por destinatário; **não** desfaz nada do 04-15 nem do 04-16 (escopos disjuntos dentro do mesmo arquivo: lá só comentário, aqui só o fluxo do transporte).
- **`rel-02b-deadline-global-smtp` continua alta / pré-go-live**, por decisão C11(2). Este plano reduziu o pior caso de tempo por rodada, mas não fecha aquele estudo.
- **`emailer.timeout.test.js` mantém a sua cópia local de `avancarRelogioAte`.** Depois deste plano o motivo de manter a duplicação (não trocar instrumento e objeto medido na mesma rodada) **expirou** — a dedup fica disponível para a Fase 5/7, e agora com um segundo consumidor do helper compartilhado como rede.
- **SEC-01 permanece ABERTO** como risco conscientemente aceito (decisão C8) — nada neste plano o altera.

## Self-Check: PASSED

- Arquivos declarados existem: `backend/test/emailer.transporteVivo.test.js` (227 linhas), `backend/src/emailer.js`, `.planning/phases/04-confiabilidade-das-integra-es/04-17-SUMMARY.md`.
- Commits declarados existem: `aa84569` (RED), `97df447` (GREEN).
- Nenhum arquivo temporário deixado para trás; `git status --short` limpo após cada commit.

---
*Phase: 04-confiabilidade-das-integra-es*
*Completed: 2026-08-05*
