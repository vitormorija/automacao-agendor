---
id: in5-01-results-error-com-dois-significados
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, code review 04-REVIEW-r5.md (rodada 5) §IN5-01 — escopo travado pelo usuário — Info vira todo, não plano
resolves_phase: null
tags: [backend, scheduler, contrato, observabilidade, ui, cr4-01, phase-4-carryover]
---

# IN5-01 — o campo de erro da rodada passou a significar duas coisas incompatíveis, e nenhum consumidor consegue separá-las

**Onde:** o campo escalar de erro de `results`, em `runCheck` (`backend/src/scheduler.js`). Ele é
preenchido em **dois contextos que não têm nada em comum**:

- pelo `catch` externo — significa **"a rodada MORREU"**: o laço parou, e o que não foi processado
  não foi processado;
- pelos dois alarmes agregados introduzidos por esta fase (supressão total por categoria indecidível
  e forma anômala do funil) — significa **"a rodada CONCLUIU, mas houve supressão ou forma
  anômala"**: o laço percorreu tudo, e os negócios que puderam ser notificados foram notificados.

**O que acontece:** até o plano 04-28 o campo só tinha o primeiro significado. Agora as duas
situações chegam ao consumidor com a **mesma forma** — um campo escalar preenchido com texto — e um
consumidor que queira responder à pergunta operacional mais básica, *"o cron das oito rodou até o
fim?"*, não consegue mais respondê-la a partir do payload.

O plano 04-37 **estreitou a mensagem** do alarme de categoria (ela passou a afirmar sobre a
**rodada**, com a ressalva da dedup escrita por extenso, em vez de afirmar sobre "o dia"). Isso reduz
o dano de **leitura humana** — quem lê o texto entende o que houve — mas **não** resolve a
ambiguidade para um consumidor **programático**: a forma do campo continua idêntica nos dois casos, e
nenhum código consegue distinguir "morreu" de "concluiu com alarme" sem interpretar a string.

## Por que a prioridade é média

Porque o dano é **latente**, e isso foi **medido**, não presumido: `grep -rn "lastRunResult"
frontend/src` devolve **uma única ocorrência**, no componente do painel, e ela lê o **array** de erros
— não o campo escalar. Ou seja, hoje **nenhum** consumidor de UI lê o campo ambíguo, e a colisão não
produz sintoma visível. O revisor mediu, do lado do backend, três ocorrências não-comentário do campo.

O que sustenta a prioridade média (e não baixa) é que o campo é exatamente o que responde "o cron
rodou até o fim?", a ambiguidade **nasceu nesta fase** — não é dívida herdada — e o precedente
imediato é o **CR5-01**, em que uma chave com dois significados atravessou cinco rodadas de review e
só apareceu quando produziu um toast vermelho em branco na tela. Duas chaves ambíguas na mesma função
é padrão, não coincidência.

**Este achado forma par com `cr4-01c`**, e o próprio revisor registrou que os dois andam juntos: os
dois são sobre **superfícies que a UI não distingue** — aqui o motivo da rodada, lá o motivo por
negócio. Fechar um sem o outro deixa o operador com metade da resposta.

## Correção proposta

Duas saídas legítimas, e a escolha entre elas é decisão de contrato:

1. **Acrescentar um campo de conclusão explícito** ao objeto de resultado, antes do campo de duração
   — a rodada que chegou ao fim o marca, a que morreu no `catch` não. É aditivo e não mexe em nenhum
   consumidor existente.
2. **Mover os alarmes para um campo próprio**, mantendo o array de erros como a superfície que a UI
   já renderiza e devolvendo ao campo escalar o significado único de "a rodada morreu".

Qualquer das duas precisa de oráculo nos **dois** sentidos, senão a distinção não fica pinada: uma
rodada que conclui **com** alarme e uma rodada que **aborta** precisam ser distinguíveis por asserção
sobre o payload, e não por leitura de texto de mensagem.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW-r5.md`, seção Info,
§IN5-01.
