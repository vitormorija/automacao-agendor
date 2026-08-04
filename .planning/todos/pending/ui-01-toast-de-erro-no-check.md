---
id: ui-01-toast-de-erro-no-check
type: todo
status: pending
priority: medium
created: 2026-08-04
source: Fase 4, plano 04-02 (REL-06 / Decisão Q2) — consequência conhecida deixada fora de escopo
resolves_phase: null
tags: [frontend, ux, error-handling, dashboard, phase-4-carryover]
---

# UI-01 — Dashboard mostra toast VERDE quando a API responde 500

**O que acontece:** `frontend/src/components/Dashboard.jsx:63-82` (`checkOnly`) só entra no
`catch` em erro de **rede** ou de **parse de JSON**. Numa resposta **HTTP 500 com corpo JSON**
— exatamente o que `POST /api/notifications/check` passou a produzir com o fail-safe do
plano 04-02 — o `fetch` resolve, `r.json()` resolve, `result.total` fica `undefined`, e o
`toast.success` executa mesmo assim:

```
undefined negócio(s) parado(s) encontrado(s)
```

...em verde, como se a verificação tivesse dado certo. O painel em si não é corrompido
(`setCheckResult` está guardado por `typeof result.total === 'number'`, linha 70) — o defeito
é **só** o sinal errado dado ao usuário, que é justamente o pior lugar para errar: a pessoa
conclui que "não há negócios parados" quando na verdade a consulta falhou.

**Análogo mais brando em `sendNow` (`Dashboard.jsx:84-106`):** numa rodada abortada pelo
fail-safe, `runCheck` **não lança** (invariante pinado em `backend/test/scheduler.resilience.test.js`),
então a resposta é 200 com `notified: 0` e `stale: 0`. O toast verde diz
"0 notificação(ões) enviada(s) de 0 negócio(s) parado(s)" — tecnicamente verdadeiro, mas
indistinguível de "estava tudo em dia". O campo que carrega a verdade (`result.error`) é
ignorado pela UI. O ramo `result.skipped` (linha 90) também não ajuda: numa execução real
`skipped` é a **contagem** de deals pulados, não a flag do guard de concorrência.

## Por que não foi consertado no plano 04-02

- É defeito **pré-existente** do frontend. O REL-06 não o criou — apenas o tornou
  **alcançável**, ao trocar um resultado parcial silencioso por uma falha explícita.
- UI está **fora do escopo da Fase 4** por decisão registrada em
  `.planning/phases/04-confiabilidade-das-integra-es/04-CONTEXT.md` §Phase Boundary
  (a fase trata de bordas externas do backend).
- Consertar aqui misturaria hardening de backend com mudança de comportamento de frontend,
  contra a constraint de processo do `CLAUDE.md` ("não misturar refatoração estrutural com
  novas funcionalidades no mesmo trabalho").

## Correção sugerida

Verificar `r.ok` **antes** de tratar o corpo como sucesso, nos dois handlers:

```js
const r = await fetch('/api/notifications/check', { method: 'POST' });
const result = await r.json();
if (!r.ok) {
  toast.error(result.error || 'Erro ao verificar', { id: toastId });
  return;
}
```

E, em `sendNow`, surfar `result.error` quando presente (a rodada abortou), distinguindo-o do
caso legítimo de "0 negócios parados".

**Destino sugerido:** fase de UI / pós-Fase 5. Não bloqueia nada da Fase 4.

**Ao consertar:** o padrão de erro do backend não é único — `routes/deals.js` e
`/api/notifications/check` usam `{ error }`, enquanto `/weekly-owners` usa
`{ ok: false, error }`. Ler `result.error` cobre os dois.
