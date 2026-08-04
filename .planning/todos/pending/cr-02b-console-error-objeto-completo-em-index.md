---
id: cr-02b-console-error-objeto-completo-em-index
type: todo
status: pending
priority: low
created: 2026-08-04
source: Fase 4, code review 04-REVIEW.md §CR-02 (último parágrafo) — segundo sink, fora do escopo do 04-09
resolves_phase: null
tags: [backend, seguranca, logging, phase-4-carryover]
---

# CR-02b — `index.js` imprime o objeto de erro completo (só fora de produção)

**O que acontece:** o middleware global de erro faz, em `backend/src/index.js:107`:

```js
if (process.env.NODE_ENV !== 'production') console.error(err);
```

Passa o objeto de erro **inteiro**. Quando esse erro é um `AxiosError` vindo da borda Agendor,
`util.inspect` expande suas propriedades próprias enumeráveis — entre elas `config` — e
`config.headers.Authorization` carrega o token de serviço da Agendor. É o **mesmo defeito** que
o CR-02 corrigiu em `backend/src/routes/deals.js`.

**Por que NÃO entrou no CR-02 (e por que a prioridade é `low`):**

1. A linha é **guardada por `NODE_ENV !== 'production'`** — ela **não executa em produção** e
   portanto **não** escreve o token no `/opt/agendor/logs/pm2-error.log`, que era o dano
   concreto do CR-02 (segredo persistido em disco, sobrevivendo a restart).
2. A linha **acima** dela, que roda em **todos** os ambientes e escreve em `logs/error.log`,
   grava `err.message` mais `err.stack` — e **não** o objeto. Uma stack não carrega
   `config.headers`. Ou seja, o artefato persistente do próprio projeto já está limpo.

O que resta é: em **desenvolvimento**, o objeto do axios (com o token) é impresso no terminal
do desenvolvedor — e pode acabar em captura de tela, sessão de pair programming, ou log de
terminal de CI se alguém rodar o servidor com `NODE_ENV` não definido.

## Por que ficou fora da Fase 4

- `backend/src/index.js` está **fora do `include` do `.c8rc.json`** e não tem harness de teste:
  não há como pinar a correção por asserção comportamental, que é exatamente o padrão de prova
  que o 04-09 estabeleceu para CR-02 ("greps são sinal auxiliar; a prova é o teste").
- Alterá-lo sem teste violaria a constraint de processo do `CLAUDE.md` ("não alterar
  comportamento funcional sem teste cobrindo o novo comportamento").
- Criar o harness de `index.js` é trabalho próprio (subir o app Express, exercitar o middleware
  de erro), não emenda de uma rodada de gap closure de segurança.

## Correção sugerida

Junto com LOG-01/LOG-02 na Fase 5 (padronização de logging), trocar por:

```js
if (process.env.NODE_ENV !== 'production') {
  logger.error('[HTTP] Erro não tratado:', err.message, err.stack);
}
```

— mensagem e stack, nunca o objeto — e criar o harness mínimo de `index.js` que permita pinar
isso por teste, no mesmo molde de `backend/test/deals.errorLog.test.js` (token sintético
injetado no header, asserção de que ele não aparece na serialização do que foi logado).

**Relacionado:** `sec-01-rotate-agendor-token`. Enquanto o token não for rotacionado, todo sink
que possa imprimi-lo é uma exposição adicional do **mesmo** segredo já exposto no histórico
público do repositório.
