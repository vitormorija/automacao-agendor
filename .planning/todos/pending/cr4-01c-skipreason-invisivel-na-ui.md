---
id: cr4-01c-skipreason-invisivel-na-ui
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, plano 04-28 (CR4-01) — residual declarado no inventário de irmãos, fora-de-escopo-com-medição
resolves_phase: null
tags: [frontend, backend, ux, observabilidade, notificacoes, cr4-01, phase-4-carryover]
---

# CR4-01c — o motivo pelo qual UM negócio ficou fora do envio existe no backend e não chega a quem opera

**Onde:** o campo de motivo que `runCheck` grava por negócio suprimido, em
`backend/src/scheduler.js`, e a ausência de qualquer leitor dele em `frontend/src`. O único bloco de
diagnóstico que o painel renderiza é a lista de erros da última execução, no componente do
Dashboard.

**O que acontece:** cada negócio que sai do envio recebe, no resultado da rodada, um motivo escrito —
dedup do dia, funil sem notificação ao responsável, categoria indecidível, ou notificações
desativadas / nenhum destinatário com e-mail cadastrado. Nenhum desses motivos aparece na interface.

**Medição que justificou a exclusão do escopo do 04-28:** `grep -r "skipReason" frontend/src`
devolve **0 ocorrências**. O campo de erro da rodada também não é lido pelo painel; o único bloco
renderizado é o array de erros da última execução.

Depois da rodada 4, o apagão **total** por categoria passou a ser visível — o alarme preenche
justamente o array que o painel renderiza. Mas a supressão de **um** negócio continua sem superfície
nenhuma: para quem opera, um negócio que não recebeu e-mail e um negócio que recebeu são
indistinguíveis fora do histórico.

## Por que a prioridade é média

O dado já existe e está correto; o custo é de **entrega**, não de lógica. Não há e-mail perdido nem
decisão errada no backend — há um operador que abre o painel, vê menos notificações do que negócios
parados, e não tem como saber por quê sem ler log de servidor.

Não é alta porque o comportamento agregado grave (o apagão total) ganhou sinal na rodada 4, e porque
o histórico registra o desfecho por negócio.

## Os pares declarados

Este item **não deve ser fechado sozinho**. Ele é a terceira ocorrência do mesmo padrão nesta fase —
o dado existe no backend e não chega a quem opera:

- **`in-01`** — o status `'pending'` renderiza como falha vermelha no histórico, porque a UI não
  conhece o terceiro valor que o 04-06 introduziu. Mesmo eixo: um estado novo do backend sem
  representação na interface.
- **`in2-04`** — quando o envio parcial vira `'sent'`, quem ficou de fora nunca é retentado e não há
  sinal disso. Mesmo eixo, com consequência maior.

Fechá-los juntos é o que evita três passagens pelo mesmo componente com três decisões de layout
independentes. E o inverso vale como aviso: quem fechar `in-01` sem olhar este item vai mexer
exatamente na tabela onde este motivo precisa aparecer.

## Correção proposta

Exibir o motivo em duas superfícies:

1. **Na lista de negócios do resultado da verificação**, ao lado de cada negócio que não será
   notificado — a prévia já marca quem será notificado desde o 04-31, então o lugar de dizer *por
   quê* já está aberto.
2. **No histórico de notificações**, para os negócios com desfecho de supressão, de modo que a
   resposta continue disponível no dia seguinte.

Os textos devem ser em PT-BR e legíveis por quem não conhece o código — o motivo é para o operador,
não para o desenvolvedor. E não devem conter identificador de organização nem qualquer credencial.

---
Achado original: inventário de irmãos do plano
`.planning/phases/04-confiabilidade-das-integra-es/04-28-PLAN.md`, com a medição registrada no
SUMMARY do mesmo plano.
