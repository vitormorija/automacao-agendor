---
phase: 04-confiabilidade-das-integra-es
plan: 33
subsystem: testes
tags: [gap-closure-r4, wr4-02, wr4-03, instrumento, convencao-wr2-06, diff-de-producao-zero]
requires: [04-13, 04-18, 04-26, 04-32]
provides:
  - "Nenhum comentário vivo da suíte afirma que existe uma cópia do helper de relógio que foi removida"
  - "As 4 âncoras por número de linha do oráculo de REL-02 viraram âncoras nomeadas, conferidas contra o emailer.js atual"
  - "A exclusão da referência ao fonte do nodemailer está declarada por escrito no próprio arquivo"
  - "Inventário medido das 45 linhas de referência por número, com o residual de 39 linhas em 9 arquivos entregue ao wr4-03b"
affects:
  - backend/test/agendor.retry429.test.js
  - backend/test/agendor.cacheConcurrency.test.js
  - backend/test/emailer.timeout.test.js
tech-stack:
  added: []
  patterns:
    - "fonte da verdade única: os arquivos que contradizem o helper são alinhados a ele, nunca o contrário"
    - "âncora nomeada conferida contra o arquivo apontado ANTES de ser escrita"
    - "exclusão de convenção declarada no próprio arquivo, para que a assimetria não pareça esquecimento"
key-files:
  created: []
  modified:
    - backend/test/agendor.retry429.test.js
    - backend/test/agendor.cacheConcurrency.test.js
    - backend/test/emailer.timeout.test.js
decisions:
  - "D-WR4-02-a aplicada: helpers/fakeTimers.js é a fonte da verdade e ficou byte a byte (diff de backend/test/helpers/ vazio)"
  - "D-WR4-02-b aplicada: o parágrafo do envelope local do 04-13 foi PRESERVADO; só saiu a afirmação das duas variantes"
  - "D-WR4-03-a aplicada: as 4 âncoras nomeadas, cada uma localizada no emailer.js atual antes de escrita"
  - "D-WR4-03-b aplicada: a referência ao fonte do nodemailer PERMANECE, com a exclusão declarada no cabeçalho"
  - "D-WR4-03-c respeitada: os outros 9 arquivos (39 linhas) ficaram fora — dono é o wr4-03b, a criar no 04-34"
  - "D-WR4-02-c / D-WR4-03-d: diff de backend/src/ vazio nas DUAS tasks, medido"
  - "IN4-02 não fechado de carona: o parágrafo da guarda de id ficou intocado"
metrics:
  duration: ~25min
  tasks: 2
  files_created: 0
  files_modified: 3
  completed: 2026-08-05
---

# Phase 4 Plan 33: Os Comentários da Suíte Alinhados ao Instrumento Único e Âncoras Nomeadas Summary

Dois arquivos do repositório deixaram de afirmar coisas opostas sobre o mesmo fato, e o oráculo de
REL-02 deixou de mandar o leitor para quatro linhas que não têm relação com o que os comentários
dizem. **Nenhuma linha de produção mudou** — `git diff --name-only backend/src/` ficou vazio nas
duas tasks, e é isso que torna este plano revertível sem risco.

## O achado, e por que comentário conta como defeito aqui

Numa suíte cujo valor é ser oráculo confiável de quem é notificado, comentário que mente sobre o
**instrumento** é defeito do instrumento. Os dois achados são disso:

- **WR4-02** — o commit `46cf90a` (WR3-05, plano 04-26) removeu a cópia local do helper de relógio
  e atualizou **2 dos 4** comentários que a declaravam viva. `helpers/fakeTimers.js` dizia
  corretamente *"NÃO existe mais nenhuma"*; `agendor.retry429.test.js` dizia *"Restam duas variantes
  … a cópia local … continua de propósito"*. **Dois arquivos do repositório afirmando o oposto sobre
  o mesmo fato.** E `agendor.cacheConcurrency.test.js` apontava para *"o helper homônimo de
  emailer.timeout.test.js"* — um símbolo que não existe mais naquele arquivo.
- **WR4-03** — `emailer.timeout.test.js` mantinha 4 referências por número de linha a `emailer.js`,
  e as 4 apontavam para o lugar errado, porque o módulo foi reescrito por 04-17, 04-21 e 04-24
  depois de o teste ter sido escrito.

## Task 1 — WR4-02 (commit `70721d5`)

Duas edições de comentário, uma em cada arquivo.

Em `agendor.retry429.test.js`, o parágrafo REESCRITO (D-WR4-02-b), não apagado — o parágrafo
anterior, que explica por que o **envelope local** daquele arquivo desapareceu no 04-13, continua
verdadeiro e é o que dá contexto à frase nova:

```
- // Restam duas variantes do helper em circulação. A segunda, a cópia local de
- // `emailer.timeout.test.js`, continua de propósito: aquele arquivo é o oráculo de REL-02 e o
- // `emailer.js` ainda muda nesta rodada de gap closure — trocar o instrumento e o objeto medido na
- // mesma rodada é o que a constraint de processo do CLAUDE.md proíbe.
+ // NÃO resta nenhuma variante em circulação: `backend/test/helpers/fakeTimers.js` é a ÚNICA
+ // implementação de `avancarRelogioAte` desde o 04-26 (WR3-05), que removeu a última — a de
+ // `emailer.timeout.test.js`. Quem precisar avançar relógio falso importa de lá; a nota de topo
+ // daquele helper é a fonte da verdade sobre o assunto e enumera as três que convergiram para ele.
```

Em `agendor.cacheConcurrency.test.js`, uma linha: `(o helper homônimo de emailer.timeout.test.js)`
→ `(o helper compartilhado de helpers/fakeTimers.js)`.

### Critérios de aceite da Task 1

| Critério | Esperado | Medido |
|---|---|---|
| `agendor.retry429`, `agendor.cacheConcurrency`, `fakeTimers.helper` | exit 0 | **8/8, 3/3, 3/3, exit 0** |
| `grep -rc "cópia local\|helper homônimo"` nos dois corrigidos | 0 e 0 | **0 e 0** |
| As mesmas expressões nos dois arquivos corretos | 2 linhas | **2** (`emailer.timeout.test.js:50`, `helpers/fakeTimers.js:25`) |
| Asserções no diff (`-U0`, `grep -c "assert"`) | 0 | **0** |
| `grep -c "^test("` | 8 e 3 | **8 e 3** |
| IN4-02 intocado (`grep -c "três vezes"` no diff) | 0 | **0** |
| `git diff --name-only backend/src/` | vazio | **vazio** |
| `git diff --name-only backend/test/helpers/` | vazio | **vazio** |
| `npm run lint` | exit 0 | **exit 0** (44 warnings, baseline) |

## Task 2 — WR4-03 (commit `8356ed1`)

**Cada âncora foi localizada no `emailer.js` atual ANTES de ser escrita** (mitigação de R4-31 —
trocar número por nome sem conferir repetiria o defeito com outra sintaxe). O que foi conferido:

| Âncora nomeada escrita | Onde está de fato hoje | O que a linha antiga apontava |
|---|---|---|
| `sendMailWithRetry` (o laço `for (let attempt = 1; attempt <= retries; ...)`) | `async function sendMailWithRetry(...)` | `emailer.js:178` = `<!-- Footer -->` do template |
| O termo de MENSAGEM da condição `isNetworkError` (`err.message?.toLowerCase().includes('econnreset')`) | `const isNetworkError =` e seus quatro termos | `emailer.js:188` = `</body>` do template |
| A recriação do transporte dentro do `catch` (`transporter = createTransporter()`) | logo depois da espera entre tentativas | `emailer.js:197` = linha de comentário |
| A guarda `authorEmail !== ownerEmail` de `sendStaleNotification` | `if (authorEmail && authorEmail !== ownerEmail) {` | `emailer.js:229` = `}`, o fecha-bloco do ramo de retry |

O comentário do ramo de mensagem ganhou o **porquê** junto com o nome: com `code: 'ESOCKET'` os dois
termos que olham `err.code` (esperando `'ECONNRESET'`/`'ETIMEDOUT'`) não casam, e o único que captura
é o da mensagem. Antes, o número sozinho não dizia isso — o leitor tinha de ir ao arquivo, e ia para
o lugar errado.

O cabeçalho ganhou a declaração dupla exigida por D-WR4-03-b: (i) o arquivo passa a seguir a
convenção de WR2-06 e ficou de fora da limpeza do 04-18 por ter sido editado depois; (ii) a única
referência por número que permanece aponta para o fonte do `nodemailer` — arquivo de dependência,
versionado pelo lockfile e não por este repositório —, e a exclusão é **deliberada, não
esquecimento**. Mesma forma da decisão registrada em `in3-06` sobre o nome do caso.

### Critérios de aceite da Task 2

| Critério | Esperado | Medido |
|---|---|---|
| Os quatro arquivos de `emailer.*` | exit 0 | **9/9, 7/7, 3/3, 3/3, exit 0** |
| `grep -cE "emailer\.js:[0-9]+"` | 0 (era 4) | **0** |
| `grep -cE "\.js:[0-9]+"` | 1 (o `nodemailer`) | **1** — `lib/smtp-connection/index.js:14-16` |
| `grep -c "sendMailWithRetry"` | ≥ 3 | **7** |
| `grep -c "sendStaleNotification"` | ≥ 1 | **10** |
| Asserções no diff (`-U0`, `grep -c "assert"`) | 0 | **0** |
| `grep -c "^test("` | 9 | **9** |
| `npm run test:coverage` com o mesmo total da entrada | 186 | **186/186, exit 0** |
| `npm run lint` | exit 0 | **exit 0** (44 warnings, baseline) |
| `git diff --name-only backend/src/` | vazio | **vazio** |

Cobertura de `emailer.js` inalterada: 89,78 % statements / 63,7 % branches / 94,11 % funcs — os
mesmos valores da saída do 04-32, como esperado de um plano que não toca produção.

## Inventário de irmãos — WR4-02: as frases que declaram a cópia do helper

Critério: `grep -rn "cópia local\|helper homônimo" backend/test` → **4 linhas em 4 arquivos** na
entrada (o número do plano bateu exatamente).

| Arquivo | Classificação | Evidência medida |
|---|---|---|
| `agendor.retry429.test.js` | **corrigida** | Afirmava "restam duas variantes" com motivo extinto pelo 04-26. `grep -c` = **0** depois. |
| `agendor.cacheConcurrency.test.js` | **corrigida** | Apontava para símbolo inexistente. `grep -c` = **0** depois. |
| `emailer.timeout.test.js` | **verificada-e-sã** | **Lida e conferida linha a linha**: a frase está no PASSADO (*"Este arquivo mantinha uma cópia local"*) e descreve corretamente o que o 04-26 fez — inclusive o defeito que a cópia carregava e o motivo que expirou. Não é corrigida porque não está errada. **Preservada byte a byte** pela Task 2 (a linha continua no arquivo, agora na 50, e não aparece no diff). |
| `helpers/fakeTimers.js` | **verificada-e-sã, é a FONTE DA VERDADE** | Afirma que não existe mais nenhuma cópia. Confirmado por `grep -rn "function avancarRelogioAte\|const avancarRelogioAte" backend/test` = **1**. `git diff --name-only backend/test/helpers/` = **vazio** nas duas tasks (mitigação de R4-32). |
| Uma quinta cópia do helper | **inexistente, medido** | Mesmo grep: **1** implementação em toda a suíte. |

## Inventário de irmãos — WR4-03: as referências por número de linha

Critério: `grep -cE "\.js:[0-9]+"` por arquivo em `backend/test`.

**Entrada: 45 linhas em 11 arquivos** — o número do plano bateu, e a distribuição por arquivo também:

```
12 scheduler.failsafe.test.js       11 notificationStatus.test.js
 8 agendor.timeout.test.js           5 emailer.timeout.test.js
 3 notifications.resolved.test.js    1 config.route.smtpPass.test.js
 1 db.smtpPassMigration.clear        1 db.smtpPassMigration.keep
 1 emailer.smtpPass.test.js          1 scheduler.resilience.test.js
 1 setup.js
```

**Saída: 41 linhas em 11 arquivos** — só `emailer.timeout.test.js` mudou, de 5 para 1.

| Escopo | Classificação | Evidência medida |
|---|---|---|
| As 4 referências a `emailer.js` em `emailer.timeout.test.js` | **corrigidas** | São o achado. `grep -cE "emailer\.js:[0-9]+"` = **0**. Cada uma conferida contra o arquivo atual (tabela da Task 2). |
| A 5ª linha do mesmo arquivo, apontando para o fonte do `nodemailer` | **verificada-e-sã** | Permanece por D-WR4-03-b, com a exclusão **declarada no cabeçalho**. `grep -cE "\.js:[0-9]+"` = **1** (mitigação de R4-34: contagem 0 seria a perda da medição de defaults). |
| `scheduler.resilience.test.js` (1 linha) | **fora-de-escopo-com-medição, dono já existente** | É o residual que o todo **`in3-06`** descreve, com a decisão registrada (corrigir a mensagem de asserção, preservar o nome do caso, que é identificador de oráculo e é citado pelo `04-RESEARCH.md`). Por decisão do usuário, `in3-01`..`in3-08` não podem ser editados. Ausente do diff. |
| Os outros 9 arquivos, **39 linhas** | **fora-de-escopo-com-medição, SEM dono hoje** | `in3-06` nomeia APENAS `scheduler.resilience.test.js`. Distribuição acima. Caro de fazer bem: cada referência precisa ser conferida contra o arquivo apontado antes de virar âncora — e o próprio WR4-03 nasceu de referências que estavam erradas. Dono: todo **`wr4-03b`**, a criar no 04-34, com fechamento previsto junto do gate de CI de `in3-04`. Ausentes do diff (`git diff --name-only HEAD~2..HEAD` lista exatamente os 3 arquivos de `files_modified`). |
| `agendor.loteDeOrganizacoes.test.js` (criado nesta rodada) | **verificada-e-sã** | `grep -cE "\.js:[0-9]+"` = **0**. O critério de aceite do 04-30 se sustentou. |
| `backend/src` (os cinco arquivos do 04-18) | **verificada-e-sã** | `grep -rn --include='*.js' -cE "\.js:[0-9]+" backend/src` não devolve nenhum arquivo com contagem > 0. A convenção continua declarada no topo de `agendor.js`. |

## Divergências medidas (registradas, não forçadas)

### 1. O cabeçalho novo tem 8 linhas de texto, e o plano pedia "3 a 5"

**O plano prescrevia:** *"Acrescentar ao cabeçalho do arquivo 3 a 5 linhas PT-BR declarando duas
coisas"*.
**Medido:** **8 linhas** de texto mais 1 separador `//`.

**Por quê:** são **duas** declarações independentes (a adesão à convenção + a exclusão do
`nodemailer`), e cada uma precisa carregar o seu porquê — sem o *"ficou de fora da limpeza do 04-18
porque foi editado depois"* a primeira vira regra sem história, e sem o *"versionado pelo lockfile e
não por este repositório"* a segunda vira exceção sem critério, exatamente o "parecer esquecimento"
que D-WR4-03-b existe para evitar. No wrap de ~85 colunas do bloco de comentário deste arquivo, isso
não cabe em 5 linhas. **O número não foi forçado**: encurtar exigiria cortar um dos dois porquês.
Esta é a **nona rodada da fase com divergência de contagem**, e é de classe nova — orçamento de
linhas de prosa, não forma de grep nem reformatação do Biome.

### 2. `emailer.js:229` não é `error: err.message`; é o fecha-bloco do ramo de retry

**O plano media** (herdado do 04-REVIEW): *"`:229` diz a guarda de autor diferente de dono, hoje é
uma atribuição dentro do retorno de falha"*.
**Medido hoje:** a linha 229 é `}` — o fecha-bloco do `if (isNetworkError && attempt < retries)`.
`error: err.message,` está na 232.

**Consequência:** nenhuma. A conclusão que o número sustenta — **a referência aponta para um lugar
sem relação nenhuma com o que o comentário afirma** — sobrevive intacta e fica até mais forte: a
guarda está na 313. As outras três medições do plano bateram exatamente (`:178` = `<!-- Footer -->`,
`:188` = `</body>`, `:197` = linha de comentário). Registrado para que ninguém "reconcilie" o
inventário com o valor antigo.

## Deviations from Plan

Nenhuma Rule 1-4 acionada. Nenhum pacote instalado; `package.json` e lockfiles intocados
(T-04-33-SC honrada). Nenhuma linha de `backend/src/` tocada — não houve nem tentação: os quatro
alvos das âncoras foram **lidos** para conferir as afirmações, e a leitura confirmou que o
`emailer.js` atual faz exatamente o que os comentários dizem. As duas divergências acima são de
**medição e de forma**, não de escopo nem de comportamento.

Uma escolha tomada dentro da ação e registrada: a âncora do ramo de rede não ficou só no nome
(`isNetworkError`), ganhou o **termo específico** (`err.message?.toLowerCase().includes('econnreset')`)
e o motivo de os termos de `err.code` não casarem com `'ESOCKET'`. Nomear só a condição inteira
manteria o leitor tendo de decidir sozinho qual dos quatro termos captura o erro injetado — que é
justamente o que o comentário existe para responder.

## Threat Flags

Nenhuma. Nenhum endpoint, caminho de autenticação, acesso a arquivo ou alteração de schema foi
introduzido — o diff é integralmente comentário em arquivos de teste. PC-13 preservado: o cabeçalho
novo não cita valor de segredo nem credencial, e nenhuma asserção sobre o objeto de opções foi
tocada (T-04-33-04).

## Escopo que este plano NÃO fecha

- **`wr4-03b`** — as **39 linhas em 9 arquivos** com referência por número que o `in3-06` não cobre.
  Medidas e distribuídas por arquivo acima; dono a criar no 04-34, junto do gate de CI de `in3-04`.
- **`in3-06`** — a linha de `scheduler.resilience.test.js`. Tem dono e não pode ser editado.
- **`IN4-02`** — o parágrafo de `agendor.retry429.test.js` sobre a guarda de id ficar fora do
  callback do retry ficou **byte a byte** (`grep -c "três vezes"` no diff = **0**, mitigação de
  R4-36).
- **Os demais achados da r4** (IN4-* e os 5 residuais): plano 04-34, o último da rodada.

## Atenção para quem seguir

`helpers/fakeTimers.js` é a **fonte da verdade** sobre o helper de relógio. Quem encontrar um
comentário que a contradiga deve corrigir o comentário, nunca o helper — foi a inversão desse
sentido que produziu WR4-02 na primeira vez. E o critério que teria achado WR4-02 em menos de um
segundo está registrado aqui: `grep -rn "cópia local\|helper homônimo" backend/test`.

Quem for fechar o `wr4-03b`: **conferir cada referência contra o arquivo apontado antes de
convertê-la**. Este plano converteu 4 e as 4 estavam erradas. Trocar número por nome sem conferir
reproduz o defeito com outra sintaxe, e aí ele fica invisível para o grep que hoje o encontra.

## Self-Check: PASSED

Arquivos:
- FOUND: `backend/test/agendor.retry429.test.js`
- FOUND: `backend/test/agendor.cacheConcurrency.test.js`
- FOUND: `backend/test/emailer.timeout.test.js`
- FOUND: `.planning/phases/04-confiabilidade-das-integra-es/04-33-SUMMARY.md`
- INTOCADO (por decisão): `backend/test/helpers/fakeTimers.js`

Commits:
- FOUND: `70721d5` — docs(04-33): WR4-02
- FOUND: `8356ed1` — docs(04-33): WR4-03

Estado da árvore: `git diff --name-only HEAD~2..HEAD` lista exatamente os 3 arquivos de
`files_modified`; `git diff --name-only backend/src/` vazio; suíte 186/186; cobertura exit 0; lint
exit 0.
