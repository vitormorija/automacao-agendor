# Phase 4: Confiabilidade das Integrações - Context

**Gathered:** 2026-07-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase define **o que acontece quando uma dependência externa fica lenta ou falha, em vez de
responder**. Entrega REL-01 a REL-04: timeout explícito nas chamadas HTTP à Agendor e no envio SMTP,
agendador que sobrevive a uma execução que falha, e cache de categorias que não serve dado obsoleto.

**Estado de partida medido no scouting (importante — o roadmap descreve mal dois dos quatro):**

- **REL-01 é real.** Nem a instância compartilhada (`backend/src/agendor.js:6-9`) nem a chamada
  ad-hoc (`backend/src/routes/notifications.js:220`) passam `timeout`.
- **REL-02 é real e pior que o descrito.** `createTransporter()` (`backend/src/emailer.js:12-22`) não
  passa nenhuma opção de timeout, então valem os defaults do nodemailer — e o `socketTimeout` padrão
  é **10 minutos**. Com as 3 tentativas de `sendMailWithRetry` (linha 178), um destinatário
  problemático pode segurar a execução por ~30 minutos.
- **REL-03 JÁ ESTÁ SATISFEITO.** `runCheck` (catch em `scheduler.js:172`, `finally` em 175 liberando
  `isRunning`) e `runWeeklySummary` (catch em 242) já registram o erro e **não relançam**. O
  agendador já sobrevive. Isto é trabalho de caracterização, não de conserto.
- **REL-04 é real, com uma armadilha.** O cache é lido por **dois caminhos**: `getOrgCategory()`
  (`agendor.js:36`) e uma **leitura direta do dicionário** em `agendor.js:165`, que é onde
  `EXCLUDED_CATEGORIES` decide quem é excluído.

**Fora do escopo (fronteiras explícitas):**
- Migrar `console.*` residual para o `logger` — Fase 5.
- Rate limiting em memória, JWT em `localStorage`, `requireAdmin()` fail-open — Fase 6.
- Extrair `getEnrichedStaleDeals` / refatorar o cache para escopo de execução — Fase 7.
- Demais advisories do `sec-02` além de axios e nodemailer (incluindo `vite` 5→8 e `npm audit` no CI).

</domain>

<decisions>
## Implementation Decisions

### Timeouts HTTP — API Agendor (REL-01)
- **D-01:** **15 segundos** de timeout, aplicado **nos dois pontos**: a instância compartilhada
  `axios.create()` em `agendor.js:6-9` **e** a chamada ad-hoc `axios.get()` em
  `routes/notifications.js:220`. Racional: generoso para uma API que responde em menos de 1s no
  caminho normal, mas corta um travamento antes de comer a janela do cron. O retry de 429 já
  existente (`fetchDealsPage`, esperas de 5/10/15s) continua por cima, então o pior caso de uma
  página vira ~15s + backoff em vez de indefinido. Rejeitados 30s (pior caso da execução completa
  cresce demais — são várias páginas mais uma chamada por organização única) e 10s (risco de
  desistir de respostas que chegariam em horário de pico).

### Timeouts SMTP (REL-02)
- **D-02:** Três timeouts explícitos no `createTransport`: **`connectionTimeout: 10s`,
  `greetingTimeout: 10s`, `socketTimeout: 30s`**. Os defaults atuais do nodemailer são 2min/30s/10min
  — o socket de 10 minutos é o que permite uma única tentativa travar tudo. Com 30s e as 3 tentativas
  já existentes, o pior caso por e-mail cai de ~30min para ~1min40s.
- **Nota de implementação:** `createTransporter()` é chamada em **6 lugares** (`emailer.js` linhas
  206, 383, 404, 409, 689 e a definição em 12). A configuração de timeout deve viver na função
  fábrica, não ser repetida em cada chamada.

### Comportamento ao esgotar as tentativas (REL-02)
- **D-03:** **Registrar e seguir para o próximo destinatário** — exatamente o comportamento atual,
  preservado. Grava `status: 'error'` no `notification_log`, loga, continua. **Nenhuma mudança de
  comportamento aqui**; a fase só acrescenta timeout e teste.
- **Fato que sustenta a decisão:** `alreadyNotifiedToday` (`db.js:223-232`) filtra
  `status = 'sent'`. Uma falha grava `'error'` e **não bloqueia** o reenvio no dia seguinte — o
  sistema já tem recuperação natural pela rodada diária. Rejeitados: resumo de falhas ao admin (se o
  SMTP estiver fora, o aviso também não sai) e marcação de prioridade (exige estado novo, ganho
  pequeno dado que a rodada diária já reprocessa tudo).

### Agendador resiliente (REL-03)
- **D-04:** **Somente caracterização — nenhuma mudança de comportamento.** Teste que fixa: uma falha
  em `runCheck`/`runWeeklySummary` é registrada, **não é relançada**, e o agendador segue ativo. O
  teste deve cobrir também o `finally` de `scheduler.js:175` que libera o lock `isRunning` — se ele
  vazasse, toda execução seguinte seria recusada pelo guard da linha 27, e o sistema pararia de
  notificar em silêncio. Mesmo padrão measure-first do WR-02 na Fase 2.

### Cache de categorias (REL-04)
- **D-05:** **Limpar o cache no início de cada `getStaleDeals`**, não TTL por tempo. Dentro da rodada
  continua eficiente (uma chamada por organização única, via o `Promise.all` de `agendor.js:157`);
  entre rodadas está sempre fresco, sem janela de obsolescência.
- **Por que não TTL (a razão é estrutural, não de gosto):** um TTL exige guardar timestamp junto do
  valor, o que **muda o formato do dado guardado** — de string para objeto. A leitura direta em
  `agendor.js:165` (`orgCategoryCache[deal.organization?.id] ?? null`) passaria a receber um objeto,
  `EXCLUDED_CATEGORIES.includes(...)` daria `false` para tudo, e **organizações excluídas voltariam a
  ser notificadas**. Limpar o cache não muda formato nenhum, então a linha 165 não precisa ser tocada.
- Rejeitado também o cache com escopo de execução (Map local): é a solução mais limpa, mas exige
  mudar assinatura de `getOrgCategory` e a linha 165 — refatoração estrutural, que a Fase 7 cobre.

### Atualização de dependências (do `sec-02`)
- **D-06:** Trazer para esta fase **apenas `axios` e `nodemailer`** — as duas que a fase já vai tocar.
  - `axios` ^1.7.2 → correção disponível **sem salto de major**.
  - `nodemailer` ^6.9.13 → **9.0.3, três majors**. É mudança de comportamento no caminho de envio e
    exige teste do novo fluxo — que é essencialmente o mesmo teste que REL-02 já pede. Fazer junto
    evita abrir `emailer.js` duas vezes.
  - Motivação de segurança (medida em 2026-07-30): `nodemailer` tem advisory HIGH de *"e-mail
    entregue a domínio não intencionado"* e injeção de comando SMTP; `axios` tem SSRF e bypass de
    autenticação por prototype pollution.
- O restante do `sec-02` permanece pendente e **não** entra aqui.

### Claude's Discretion
- Como expressar os timeouts (constantes de módulo, config, ou literais comentados).
- Se o timeout da chamada ad-hoc de `notifications.js` reusa a instância compartilhada de
  `agendor.js` em vez de repetir a configuração — desde que o comportamento seja o mesmo.
- Forma exata dos testes de timeout (fake timers, servidor lento local, ou stub que nunca resolve).
- Onde a limpeza do cache é invocada dentro de `getStaleDeals`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requisitos
- `.planning/ROADMAP.md` §"Phase 4: Confiabilidade das Integrações" — goal e os 4 success criteria.
- `.planning/REQUIREMENTS.md` — REL-01 a REL-04 (linhas 38-41).

### Pendência dobrada nesta fase
- `.planning/todos/pending/sec-02-dependency-vulnerabilities.md` — **ler antes de tocar em
  `package.json`.** Contém a triagem completa, a distinção runtime vs devDependency, e a instrução
  explícita de corrigir em duas levas (sem-major primeiro, majors com teste depois). Só a parte de
  `axios` e `nodemailer` entra na Fase 4 (D-06).

### Pontos exatos do código (medidos, não inferidos)
- `backend/src/agendor.js:6-9` — `axios.create()` sem `timeout` (REL-01).
- `backend/src/routes/notifications.js:220` — `axios.get()` ad-hoc sem `timeout` (REL-01).
- `backend/src/emailer.js:12-22` — `createTransporter()` sem opções de timeout (REL-02).
- `backend/src/emailer.js:178-200` — `sendMailWithRetry`, 3 tentativas, esperas de 3s/6s.
- `backend/src/scheduler.js:172` e `:242` — catch que registra e **não relança** (REL-03, já OK).
- `backend/src/scheduler.js:175` — `finally { isRunning = false }`, o lock que precisa de teste.
- `backend/src/scheduler.js:27` — guard `if (isRunning)` que recusaria execuções se o lock vazasse.
- `backend/src/agendor.js:33-46` — `orgCategoryCache` e `getOrgCategory` (REL-04).
- `backend/src/agendor.js:157` — `Promise.all` que popula o cache.
- `backend/src/agendor.js:165` — **leitura direta do dicionário**, o segundo caminho de leitura.
- `backend/src/db.js:223-232` — `alreadyNotifiedToday` filtra `status = 'sent'`.

### Rede de segurança que protege esta fase
- `backend/test/agendor.getStaleDeals.test.js:61` — golden `assert.deepStrictEqual(ids, [101, 103])`.
  O fake axios responde `/organizations/:id` e a org 205 é `'Parceiro'` (categoria excluída), então
  **este golden quebra se a exclusão por categoria parar de funcionar** — é a proteção direta contra
  o risco de D-05. Rodar a suíte após mexer no cache não é formalidade.
- `.planning/phases/03-config-segredos-por-ambiente/03-VALIDATION.md` — convenções de isolamento de
  teste que continuam valendo (um arquivo por variação de ambiente; `node --test` roda cada arquivo
  em processo próprio).

### Riscos herdados
- `.planning/codebase/CONCERNS.md` — origem de REL-04 (cache sem TTL) e REL-01 (sem timeout).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/test/helpers/fakeAxios.js` — stub da borda HTTP já usado pelos testes da Fase 1. É onde os
  testes de timeout de REL-01 devem se apoiar, em vez de rede real.
- `sendMailWithRetry` (`emailer.js:178`) — a lógica de retry já existe e já detecta `timeout` na
  mensagem de erro (linha 187). D-02 alimenta essa lógica com timeouts reais, não a substitui.
- Rede de 78 testes das Fases 1-3, com gate de cobertura ativo (branches 72,72% contra piso 60).

### Established Patterns
- Retry manual com backoff, sem biblioteca: `fetchDealsPage` (429, 5/10/15s) e `sendMailWithRetry`
  (3 tentativas, 3s/6s). Novas tolerâncias a falha devem seguir esse estilo, não introduzir dependência.
- `catch (_) {}` deliberado para operações idempotentes; falhas não-críticas são engolidas e seguem
  (`getOrgCategory` cacheia `null` no catch — `agendor.js:43-45`, ramo hoje **não coberto** por teste).
- Estado de módulo (`orgCategoryCache`, `isRunning`, `currentTask`) reinicia a cada restart do processo.

### Integration Points
- **Borda HTTP Agendor:** `agendor.js` (instância compartilhada) e `routes/notifications.js` (ad-hoc).
- **Borda SMTP:** `emailer.js`, exclusivamente via `createTransporter()`.
- **Agendador:** `scheduler.js`, consumidor das duas bordas acima.
- **`package.json` do backend:** onde os bumps de D-06 entram.

</code_context>

<specifics>
## Specific Ideas

- O teste de REL-03 deve provar que o lock `isRunning` é liberado mesmo quando a execução falha. É a
  parte não óbvia: um lock vazado não derruba nada — faz o sistema **parar de notificar em silêncio**,
  que é exatamente a classe de falha que o Core Value do milestone existe para impedir.
- A limpeza do cache (D-05) e o golden de exclusão por categoria devem ser verificados juntos: rodar
  `agendor.getStaleDeals.test.js` é a prova de que mexer no cache não afrouxou nenhuma regra de quem
  é notificado.

</specifics>

<deferred>
## Deferred Ideas

- **Resumo de falhas de envio ao admin** — considerado em D-03 e rejeitado: se o SMTP estiver fora, o
  próprio aviso não sai. Reavaliar se surgir um canal de alerta que não dependa de e-mail.
- **Última falha do agendador visível no dashboard** — `lastRunResult` já guarda o dado em memória;
  seria só expor. Fora do escopo por puxar frontend para uma fase de backend.
- **Alerta após N falhas consecutivas** — exige estado persistente e um canal de alerta; melhor
  depois que houver observabilidade (Fase 5) e um servidor real (`ops-01`).
- **Cache com escopo de execução (Map local, sem estado de módulo)** — a solução mais limpa para
  REL-04, adiada para a Fase 7 por ser refatoração estrutural.
- **Restante do `sec-02`** — `vite` 5→8, `node-cron` 3→4, demais transitivas, e `npm audit` no CI.

### Reviewed Todos (not folded)
- `sec-01-rotate-agendor-token` — casou por palavra-chave, mas é ação operacional no painel da
  Agendor, não trabalho de código. Segue pendente e **sem nenhum alerta automático** (medido na
  Fase 3: o Secret Scanning nativo não cobre padrões não-provedor neste plano de conta).
- `ops-01-validar-env-e-pm2-no-primeiro-deploy` — depende de um servidor que não existe. Fase 8.

</deferred>

---

*Phase: 4-Confiabilidade das Integrações*
*Context gathered: 2026-07-30*
