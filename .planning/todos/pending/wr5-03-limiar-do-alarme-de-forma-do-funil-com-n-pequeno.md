---
id: wr5-03-limiar-do-alarme-de-forma-do-funil-com-n-pequeno
type: todo
status: pending
priority: média
created: 2026-08-05
source: Fase 4, code review 04-REVIEW-r5.md (rodada 5) §WR5-03 — escopo travado pelo usuário — warning vira todo, não plano
resolves_phase: null
tags: [backend, scheduler, observabilidade, alarme, oraculo, phase-4-carryover]
---

# WR5-03 — o alarme de FORMA do funil dispara com N = 1 e afirma uma coisa factualmente falsa nesse caso

**Onde:** o alarme de forma do payload em `runCheck`, em `backend/src/scheduler.js`, que compara
`results.funilNaoAvaliado` com `results.stale`; o oráculo é
`backend/test/scheduler.categoriaIndecidivel.test.js`, cenários **I** e **J**.

**O que acontece:** a condição do alarme exige apenas que exista pelo menos um negócio parado e que
**todos** eles tenham vindo sem funil. Com **um** negócio parado sem funil cadastrado no CRM, a
condição vale trivialmente — e a mensagem emitida afirma que *"a forma do payload da Agendor pode ter
mudado"*, o que nesse caso é **factualmente falso**: um negócio isolado sem funil preenchido é dado
normal, não mudança de contrato da borda.

Três fatos somados fazem disto um alarme **diário**, e não excepcional:

1. **A afirmação mente com N pequeno.** O 04-35 foi cuidadoso ao proibir por gate a frase larga sobre
   supressão; a frase sobre **forma** tem exatamente o mesmo problema e não recebeu o mesmo cuidado.
2. **N pequeno é o caso normal.** `results.stale` não é o total de negócios do CRM: é o subconjunto
   parado além do threshold e **sem** tarefa futura. Um dia com um a três negócios é rotina, e nesse
   regime "100% da rodada" é um limiar quase sem força discriminante.
3. **O oráculo não distingue.** Os cenários **I e J** usam exatamente **2** negócios cada. Uma
   implementação **com** piso mínimo e uma implementação **sem** piso continuam **as duas** verdes
   nos dois cenários — o par existente não separa as duas hipóteses.

## Por que a prioridade é média

Não muda **quem recebe**: o alarme é superfície de observabilidade e não altera elegibilidade de
nenhum negócio. O dano é o que os cenários E e J foram escritos para evitar — nível de erro mais
bloco vermelho no painel **num dia normal** treina o operador a ignorar o bloco vermelho. E vermelho
ignorado é a condição em que o apagão real (WR5-01, CR4-01) volta a passar despercebido: o sinal
custa a credibilidade do sinal.

**Este achado forma par com `wr5-02`**, pelo mesmo motivo escrito ali: os dois são sobre **ruído no
sinal**, um por inundação de log e outro por alarme sem massa. Fechar um e deixar o outro mantém o
operador treinado a ignorar vermelho.

## Correção proposta

Exigir **massa** antes de afirmar mudança de forma, e **separar as duas afirmações**:

- acima de um piso (o revisor sugere três negócios), a condição de "todos sem funil" continua
  disparando o alarme de **forma**, exatamente como hoje;
- abaixo do piso, com pelo menos um negócio sem funil, emitir **informação** e não alarme: um aviso
  em nível de warning dizendo quantos negócios não puderam ter a regra de supressão por funil
  avaliada, e que todos seguem elegíveis. Esse ramo baixo fica **fora** do campo de erro e do array
  de erros da rodada — informação não é alarme.

**O par de casos que falta é o próprio conserto**, e sem ele qualquer piso escolhido fica sem
oráculo: N = 1 sem funil exige **silêncio** no array de erros da rodada; N igual ao piso, também sem
funil, exige **um** alarme. Um caso só de cada lado não basta, porque é justamente a fronteira que
separa as duas implementações que hoje passam igual.

**O mesmo raciocínio NÃO se aplica ao alarme de categoria indecidível**, e isso precisa ficar escrito
para que ninguém "uniformize" os dois: lá a mensagem continua **verdadeira** com N = 1 (nenhum
negócio foi notificado porque a categoria não pôde ser consultada), e o limiar de supressão TOTAL é
**decisão registrada do usuário**. Mexer nele reabriria uma decisão fechada.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW-r5.md`, seção Warnings,
§WR5-03.
