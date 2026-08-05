---
id: in4-02-justificativa-do-retry-descreve-mecanismo-inexistente
type: todo
status: pending
priority: baixa
created: 2026-08-05
source: Fase 4, code review 04-REVIEW.md (rodada 4) §IN4-02 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, agendor, comentario, retry, wr2-06, phase-4-carryover]
---

# IN4-02 — a justificativa de manter a guarda de id FORA do callback do retry descreve um mecanismo que o retry não tem

**Onde:** o bloco de comentário que precede `fetchWithRetry`, em `backend/src/agendor.js`, no
parágrafo que explica por que a guarda de tipo do id de `getDealById` fica ACIMA da chamada e fora
do callback (a âncora é o nome da função e a menção a `D-WR3-01-b`). O **mesmo texto** se repete no
comentário do caso da guarda de tipo em `backend/test/agendor.retry429.test.js`.

**O que acontece:** o comentário afirma que mover a guarda para dentro do callback faria um id
hostil sair **três vezes** pela instância compartilhada, com o token no header, em vez de nenhuma. A
quantificação está errada por dois caminhos independentes:

- `fetchWithRetry` invoca o callback **dentro do `try`**. Um lançamento síncrono ali não traz
  resposta HTTP, logo não casa o ramo de rate limit e é **relançado na primeira iteração** — não há
  segunda nem terceira tentativa.
- E, mesmo que houvesse, a guarda lançaria **antes** de a requisição sair. O número de requisições
  emitidas seria **zero**, não três.

A asserção que conta as chamadas de `getDealById` continua correta e continua útil: o comportamento
verificado é o certo. O defeito é só o **porquê** escrito ao lado dele.

## Por que a prioridade é baixa

Nenhum efeito de execução. A guarda está no lugar certo, o oráculo mede o que precisa medir, e
nenhum e-mail muda de destinatário por causa deste achado. O custo é de **leitura**: quem conferir a
afirmação conclui que a política de retry tem um comportamento que ela não tem, e pode levar essa
conclusão errada para o próximo conserto — que é exatamente como esta fase produziu WR4-01, cuja
justificativa escrita para dispensar um teto de paginação era factualmente falsa.

É a mesma classe de defeito, com um agravante: aqui o texto está em **dois arquivos**. Um leitor que
encontre a afirmação repetida tende a tratá-la como verificada, quando na verdade ela foi copiada.

## Correção proposta

Reescrever o parágrafo para o motivo verdadeiro — validar **antes** de entrar na política de retry
mantém a guarda independente de qualquer mudança futura no helper, e é isso que a torna estável — ou
simplesmente **remover a quantificação**, deixando a afirmação verificável ("emitiria requisição em
vez de nenhuma").

**Os dois pontos precisam ser corrigidos juntos.** Corrigir só o módulo de produção deixa o arquivo
de teste afirmando o contrário sobre o mesmo fato, que é literalmente o achado WR4-02 desta mesma
rodada: dois arquivos do repositório dizendo coisas opostas sobre uma única realidade. E, como lá, a
fonte da verdade deve ser declarada por escrito para que a próxima correção não inverta o sentido.

Ao corrigir, conferir também se a asserção de contagem tem mensagem própria: se a mensagem repetir a
quantificação errada, ela é um terceiro lugar onde o mesmo erro vive.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN4-02.
