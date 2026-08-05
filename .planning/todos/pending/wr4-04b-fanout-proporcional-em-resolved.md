---
id: wr4-04b-fanout-proporcional-em-resolved
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, plano 04-30 (WR4-04) — residual declarado no inventário de irmãos, fora-de-escopo-com-medição
resolves_phase: null
tags: [backend, rotas, agendor, concorrencia, retry, sqlite, wr4-04, phase-4-carryover]
---

# WR4-04b — o fan-out gêmeo na rota de negócios resolvidos, alimentado por uma consulta sem limite

**Onde:** o handler de `GET /api/notifications/resolved`, em
`backend/src/routes/notifications.js`, e a consulta que o alimenta, `getNotifiedDeals`, em
`backend/src/db.js`.

**O que acontece:** o handler recebe a lista de negócios já notificados e dispara **uma requisição
por negócio** contra a API do Agendor para checar se cada um foi atualizado — todas simultâneas, num
único `Promise.all`. É o **mesmo perfil** que o plano 04-30 acabou de consertar na consulta de
categoria por organização: número de requisições proporcional ao **volume de dados**, sem teto de
concorrência.

E, desde o 04-22, a consulta por negócio passa pela política única de retry. Sob rate limit da borda,
N requisições viram 3N — e o erro retentado é exatamente o que a API usa para pedir **menos**
tráfego, então retentar em massa prolonga a própria janela que causou a falha.

## Medição que justificou a exclusão do escopo do 04-30

- A consulta que alimenta a lista **não tem limite**: seleciona todas as linhas do log de
  notificações com status de enviado, agrupadas por negócio, ordenadas pela data do último envio.
  Não há `LIMIT`, não há recorte por data, não há paginação.
- Portanto o número de requisições **cresce com a base histórica**, monotonicamente, e nunca
  diminui — cada negócio já notificado permanece no conjunto para sempre.

## Por que ficou fora do 04-30, e por que a prioridade é média e não alta

O perfil de risco é **diferente** do que o 04-30 fechou, em dois pontos que importam:

- **Nenhuma falha aborta a rota.** Cada item tem tratamento de erro próprio: um negócio que falha
  devolve o estado conhecido do banco e a resposta segue. Não existe o modo de falha "a rodada
  inteira cai por causa de uma borda".
- **O caminho é disparado por clique**, não pela rodada diária. Não está no caminho do envio
  automático nem decide quem recebe e-mail.

O que o mantém em média é o crescimento sem teto: uma base histórica grande transforma um clique numa
rajada proporcional contra a borda compartilhada — e a instância é a mesma que a rodada de envio usa.

## Os pares declarados

- **`in3-02`** — as políticas de retry do projeto e o que elas devolvem nos casos de borda. Este item
  não pode ser fechado com uma decisão de retry que contradiga aquela.
- **RETN-01 (v2)** — o crescimento do `notification_log`. É a causa raiz do denominador: enquanto a
  tabela não tiver política de retenção ou recorte, qualquer teto aqui é paliativo. Os dois se
  informam: um limite na consulta é bem mais fácil de defender depois que a retenção estiver
  decidida.

## Correção proposta

Duas metades, na ordem:

1. **Aplicar o mesmo lote de concorrência do plano 04-30** — a constante de teto já existe e está
   exportada; reusá-la mantém uma única resposta do projeto para "quantas requisições em voo", em vez
   de dois números que podem divergir.
2. **Avaliar um recorte na consulta** — por data do último envio, ou por estado não resolvido —
   depois de olhar RETN-01. Um recorte muda o que a rota **responde**, não só como ela consulta, e
   por isso precisa de decisão explícita, não de otimização silenciosa.

O oráculo é o mesmo do 04-30 e a distinção importa: medir **concorrência em voo**, não contagem
total de requisições. A contagem total é idêntica antes e depois do conserto, então uma asserção
sobre ela ficaria verde com o defeito presente.

---
Achado original: inventário de irmãos do plano
`.planning/phases/04-confiabilidade-das-integra-es/04-30-PLAN.md`, com a medição registrada no
SUMMARY do mesmo plano.
