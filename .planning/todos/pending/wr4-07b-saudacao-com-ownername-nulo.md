---
id: wr4-07b-saudacao-com-ownername-nulo
type: todo
status: pending
priority: baixa
created: 2026-08-05
source: Fase 4, plano 04-32 (WR4-07) — residual declarado no inventário de irmãos, fora-de-escopo-com-medição
resolves_phase: null
tags: [backend, emailer, template, ux, wr4-07, phase-4-carryover]
---

# WR4-07b — a saudação do e-mail diário interpola o nome do responsável sem guarda

**Onde:** `dealEmailHtml`, em `backend/src/emailer.js` — o template do e-mail de negócio parado. A
âncora é o nome da função e o parâmetro de nome do responsável.

**O que acontece:** o template interpola o nome recebido em **duas saudações** — uma para o
responsável e outra para o criador do negócio —, sem nenhum fallback. Os dois pontos de chamada
passam campos que podem vir nulos: o nome do responsável e o nome do autor, ambos vindos da lista
enriquecida de `getStaleDeals`, que produz nome **nulo explícito** quando o payload da borda traz o
responsável sem nome.

O resultado é uma saudação com a palavra `null` no corpo enviado ao destinatário.

## Medição que justificou a exclusão do escopo do 04-32

O plano 04-32 fechou a **desreferência** no template do resumo semanal individual, onde o nome era
partido para extrair o primeiro nome e a ausência derrubava o relatório de todos os comerciais. Aqui
o caso é diferente, e foi medido:

- **Interpolação não é desreferência.** O template apenas insere o valor no HTML; com nome ausente
  nada é lançado, nenhuma exceção sobe, **nenhum e-mail é perdido**. O custo inteiro é a palavra
  `null` visível para o destinatário.
- **O ponto de chamada é outro** — o do envio diário, no caminho do Core Value. Mudar o texto de um
  e-mail que sai todo dia pede caso próprio; fechar de carona, dentro de um plano sobre o resumo
  semanal, misturaria dois caminhos de envio num diff só.

Medido também no 04-32: `dealEmailHtml` ficou **ausente do diff** daquele plano, por critério de
aceite. A exclusão foi deliberada e registrada, não esquecimento.

## Por que a prioridade é baixa

Nenhum e-mail é perdido, nenhum destinatário muda, nenhuma rodada é abortada. O dano é de
apresentação: um comercial recebe um e-mail que começa com uma palavra técnica em vez do nome dele.
Feio, e não mais que isso.

## Correção proposta

Aplicar o **mesmo encadeamento de fallbacks** que o 04-32 introduziu no relatório individual,
preferindo o nome vindo do negócio e caindo para o nome do **cadastro** antes de chegar ao rótulo
neutro. A ordem importa: o dicionário de usuários costuma ter o nome cadastrado mesmo quando o
negócio não tem, e só evitar a palavra `null` trocaria um defeito visível por uma saudação genérica
desnecessária.

O oráculo deve ser **sobre o HTML enviado**, não sobre contagem: exigir que o corpo não contenha as
palavras `null` nem `undefined`. É a mesma decisão registrada no 04-32, e pelo mesmo motivo — um
conserto que apenas evitasse a exceção e imprimisse uma palavra técnica passaria por qualquer
asserção de quantidade de envios. Cobrir os **dois** pontos de chamada, incluindo o do criador do
negócio: só o do responsável deixaria metade do achado aberto.

E vale a varredura: se restar algum outro template do módulo interpolando nome sem guarda, ele entra
na mesma correção, senão o padrão volta pelo vizinho — que é como esta fase acumulou quatro rodadas
de review.

---
Achado original: inventário de irmãos do plano
`.planning/phases/04-confiabilidade-das-integra-es/04-32-PLAN.md`, com a medição registrada no
SUMMARY do mesmo plano.
