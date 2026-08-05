---
id: in2-01-fetchwithretry-sem-tentativa
type: todo
status: pending
priority: baixa
created: 2026-08-04
source: Fase 4, code review 04-REVIEW.md (rodada 2) §IN2-01 — reconhecido e deliberadamente fora do gap closure r2
resolves_phase: null
tags: [backend, agendor, robustez, phase-4-carryover]
---

# IN2-01 — `fetchWithRetry` devolve `undefined` quando `retries <= 0`

**Onde:** `fetchWithRetry`, em `backend/src/agendor.js` (hoje por volta da linha 161 — a âncora
é o nome da função, não o número).

**O que acontece:** a função é um `for` de tentativas com `return await fn()` dentro:

```js
async function fetchWithRetry(fn, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.response?.status === 429 && attempt < retries - 1) {
        const wait = (attempt + 1) * 5000;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}
```

Com `retries <= 0` a condição `attempt < retries` é falsa já na primeira avaliação: **o corpo do
`for` não executa nenhuma iteração**, a função cai no fim sem `return` e resolve com `undefined`.

**Consequência:** os dois call-sites desestruturam o retorno —
`const { data } = await fetchWithRetry(...)`, em `fetchDealsPage` e em
`getDealsWithFutureTasks` — então o sintoma seria um
`TypeError: Cannot destructure property 'data' of 'undefined'`. É uma mensagem que **não aponta
para a causa**: quem a lesse procuraria um problema na resposta da API Agendor, e não um
argumento de configuração passado errado.

**Alcançabilidade hoje:** nenhuma. `fetchDealsPage` é interno ao módulo e sempre recebe o default
`3`; `getDealsWithFutureTasks` chama `fetchWithRetry(fn)` sem segundo argumento. Mas `retries` é
**parâmetro público da função**, e o helper existe justamente porque a política de retry da borda
Agendor precisa ser reusável por um terceiro consumidor (foi essa a razão de o 04-11 extraí-lo em
vez de manter duas cópias do laço). O primeiro consumidor que passar um valor calculado — vindo
de config, por exemplo — encontra o buraco.

## Por que ficou fora da rodada 2

- **Não é alcançável pelo código atual.** Nenhum caminho de produção chega a `retries <= 0`, então
  não há defeito observável para fechar — é endurecimento preventivo.
- **A correção mudaria o contorno de uma função que o 04-11 acabou de extrair.** Entrar agora
  misturaria endurecimento preventivo com o fechamento dos achados alcançáveis da rodada, contra
  a constraint de processo do `CLAUDE.md` ("não misturar refatoração estrutural com novas
  funcionalidades no mesmo trabalho").
- A prioridade é **baixa** exatamente por isso: o custo de deixar aberto é uma mensagem de erro
  ruim num caminho que ninguém percorre hoje.

## Correção sugerida

Uma das duas (a do review):

1. Guarda no topo, falhando com uma mensagem que aponta para a causa:
   ```js
   if (retries < 1) {
     throw new Error('[Agendor] fetchWithRetry exige ao menos 1 tentativa');
   }
   ```
2. Ou trocar o `for` por `do/while`, garantindo pelo menos uma execução do corpo.

Qualquer das duas exige um caso de teste novo — a constraint do `CLAUDE.md` vale aqui também:
não alterar comportamento sem teste cobrindo o novo comportamento. O oráculo natural é
`backend/test/agendor.retry429.test.js`, que já é quem pina a política de retry desta borda.

---
Achado original: `.planning/phases/04-confiabilidade-das-integra-es/04-REVIEW.md`, seção Info,
§IN2-01.
