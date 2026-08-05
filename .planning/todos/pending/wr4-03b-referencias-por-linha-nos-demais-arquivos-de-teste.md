---
id: wr4-03b-referencias-por-linha-nos-demais-arquivos-de-teste
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, plano 04-33 (WR4-03) — residual declarado no inventário de irmãos, fora-de-escopo-com-medição
resolves_phase: null
tags: [backend, testes, convencao, wr2-06, ci, phase-4-carryover]
---

# WR4-03b — as referências por número que sobraram na suíte, nos arquivos que o `in3-06` não cobre

**Onde:** `backend/test/`, em dez arquivos. O `in3-06` nomeia **apenas**
`scheduler.resilience.test.js`; todo o resto do volume está sem dono desde a rodada 2, quando a
convenção de WR2-06 foi escrita.

**O que acontece:** comentários, nomes de caso e mensagens de asserção apontam para pontos de módulos
de produção por **número**, e o número se desloca a cada commit que edita o arquivo apontado, sem que
nada acuse. É o defeito que a convenção existe para impedir.

## Medição que justificou a exclusão do escopo do 04-33

Varredura da rodada 4 sobre `backend/test/`, com o padrão que casa referência de arquivo por número e
menção a número de linha em prosa:

| arquivo (em `backend/test/`) | ocorrências |
|---|---|
| `scheduler.failsafe.test.js` | 12 |
| `notificationStatus.test.js` | 11 |
| `agendor.timeout.test.js` | 8 |
| `notifications.resolved.test.js` | 3 |
| `db.smtpPassMigration.keep.test.js` | 2 |
| `config.bootFailFast.test.js` | 1 |
| `config.route.smtpPass.test.js` | 1 |
| `db.smtpPassMigration.clear.test.js` | 1 |
| `emailer.smtpPass.test.js` | 1 |
| `setup.js` | 1 |
| **total sem dono** | **41** |

Fora desta tabela, e de propósito: `scheduler.resilience.test.js`, que tem dono no `in3-06`; e
`emailer.timeout.test.js`, cuja única ocorrência restante aponta para o **fonte do nodemailer** e foi
DELIBERADAMENTE preservada pelo 04-33, com a exclusão declarada por escrito no cabeçalho do arquivo —
é arquivo de dependência, versionado pelo lockfile e não por este repositório, então o número não se
desloca a cada commit daqui. Em `backend/src/` a varredura devolve **zero**: o problema é inteiramente
da suíte.

## Por que a prioridade é média

Não muda comportamento nenhum e não perde e-mail. Mas o dano é sobre o **instrumento**: são
comentários e mensagens de falha que alguém lê no minuto em que a suíte quebrou, e hoje uma parte
deles manda o leitor para o lugar errado. É a rede de testes do Core Value se explicando mal
justamente quando é consultada sob pressão.

## O conserto é mais caro do que parece

**Cada referência precisa ser CONFERIDA contra o arquivo apontado antes de virar âncora nomeada.**
Isto não é zelo: o próprio achado nasceu de referências que estavam **erradas**. O plano 04-33
converteu quatro delas no oráculo de REL-02 e **as quatro apontavam para lugar sem relação** com o
que o texto afirmava — o módulo foi reescrito três vezes depois de o teste ter sido escrito. Trocar
número por nome **sem conferir** reproduz o defeito com outra sintaxe, e aí ele fica pior: hoje o
padrão de busca encontra as referências; uma âncora nomeada errada é invisível para qualquer
varredura e só aparece quando alguém a segue.

## Os pares declarados

- **`in3-06`** — o residual conhecido, com a decisão registrada de converter a mensagem de asserção e
  **não** renomear o nome do caso. A mesma assimetria vai reaparecer aqui: nomes de caso são
  identificadores de oráculo e podem estar citados por outros artefatos.
- **`in3-04`** — o gate de CI para esta convenção. **Este é o volume que aquele gate acusaria.** Se o
  gate entrar antes desta limpeza, ele reprova a suíte inteira de saída; se entrar depois, não tem
  como provar que funciona. Fechá-los na ordem certa — limpeza primeiro, gate em seguida — é parte da
  correção, e este arquivo serve de caso de aceitação para ele.

## Correção proposta

Converter as ocorrências em âncoras nomeadas (nome de função, identificador, nome de constante),
arquivo por arquivo, cada uma conferida contra o alvo antes de escrita. Declarar por escrito, no
cabeçalho de cada arquivo tocado, qualquer ocorrência deliberadamente preservada e o motivo — como o
04-33 fez —, para que a assimetria não pareça esquecimento. Só então ligar o gate do `in3-04`.

---
Achado original: inventário de irmãos do plano
`.planning/phases/04-confiabilidade-das-integra-es/04-33-PLAN.md`, com a medição registrada no
SUMMARY do mesmo plano.
