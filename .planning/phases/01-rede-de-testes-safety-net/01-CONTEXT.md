# Phase 1: Rede de Testes (Safety-Net) - Context

**Gathered:** 2026-07-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase entrega uma **rede de testes de caracterização** que fixa o comportamento **atual** da lógica crítica de notificação (quem recebe / quem não recebe), permitindo detectar regressões antes de qualquer fase de hardening ou refatoração. Cobre TEST-01..TEST-05.

**Em escopo:** runner de teste no backend; testes de caracterização de `getStaleDeals()` (threshold, categoria, stage, owner, funil); dedup diário (`alreadyNotifiedToday`); supressão por funil (`shouldNotifyOwner`/`NO_OWNER_NOTIFY_FUNNELS` = "beefor"); auth sensível (rate-limit + verificação de senha); as costuras mínimas de teste necessárias para isso (export de funções puras, `DB_PATH` via env, mock de HTTP/SMTP).

**Fora de escopo:** mudar qualquer comportamento observável; hardening de segurança (Fase 6); refatoração arquitetural além do estritamente necessário para expor a costura de teste (Fase 7); testes de frontend/componentes (não faz parte de TEST-01..05); timeouts/retry (Fase 4); CI (Fase 2 — esta fase só garante que `npm test` roda e passa localmente e é chamável em CI).
</domain>

<decisions>
## Implementation Decisions

### Runner de Teste (TEST-01)
- **D-01:** Usar o runner nativo `node:test` (embutido no Node 20+), **zero dependência nova** — alinhado ao ethos minimalista do projeto (logger zero-dep, sem frameworks supérfluos). Rejeitados Vitest e Jest para não adicionar dependência/config.
- **D-02:** Cobertura via `c8` (wrapper nativo de cobertura), sem `nyc`/`--coverage` de framework.
- **D-03:** Script `test` no `backend/package.json` chamando `node --test` (executável local e em CI). Nomenclatura/organização dos arquivos de teste fica a critério do planner (não há convenção prévia — ver TESTING.md), mas seguir o estilo do repo: CommonJS, 2-espaços, aspas simples.

### Costura para Testar (TEST-02, TEST-04, TEST-05)
- **D-04:** Abordagem "**exportar puras + mock na borda HTTP**". Extrair/exportar helpers puros hoje inline/não-exportados (`shouldNotifyOwner`, `getDealType`, e a lógica de exclusão por stage `EXCLUDED_STAGE_WORDS`) **sem alterar a lógica** — mudança comportamental zero. Costura de teste **não** é "feature" e exportar função não altera comportamento, portanto isso é permitido pelas regras do projeto.
- **D-05:** Para o caminho integrado (`getStaleDeals`, e onde aplicável `runCheck`), **mockar a borda**: `axios` (Agendor) e `nodemailer` (SMTP), sem tocar na lógica interna.
- **D-06:** TEST-05 (auth): aplicar a mesma estratégia — expor os helpers de rate-limit (`checkRateLimit`/`recordFailedAttempt` operando sobre o `Map` em memória) e testar a verificação de senha via bcrypt. Detalhe exato do seam fica com o planner.
- **Restrição dura:** nenhuma extração pode mudar comportamento observável. Se uma extração for maior que "mover função + adicionar ao `module.exports`", ela pertence à Fase 7 (refatoração) e deve ser adiada, não feita aqui.

### Isolamento de DB (TEST-03, TEST-05)
- **D-07:** `db.js` passa a aceitar o caminho do arquivo SQLite via **variável de ambiente** (ex.: `DB_PATH`), com **default INALTERADO** = `backend/agendor.db`. Produção permanece idêntica. Testes apontam para `:memory:` (ou tempfile). O schema é criado no load do módulo, então `:memory:` auto-migra.
- **D-08:** Rejeitado mockar o módulo `db` inteiro — o mock divergiria do schema real e mascararia bugs; usar SQLite real em memória.
- **Nota:** este seam (`DB_PATH` via env) já pavimenta a Fase 3 (config por ambiente), mas aqui é introduzido apenas como costura de teste, sem outras mudanças de config.

### Fixtures / Baseline (TEST-02, TEST-04)
- **D-09:** Estratégia **"ambos"**: fixtures **sintéticos por regra** como base (um caso por regra: stage excluído, categoria excluída, owner excluído, funil "beefor", limite de dias no boundary) — determinísticos, sem acesso à API, documentando cada regra de negócio.
- **D-10:** Complementar com **alguns deals reais gravados** da API Agendor como sanity check de realismo — capturados **uma vez**, **anonimizados** (remover PII: nomes, e-mails, títulos sensíveis) antes de commitar. O researcher deve detalhar um processo de captura seguro (usar token via env, nunca commitar o token; nunca commitar PII).

### Claude's Discretion
- Organização/nomenclatura dos arquivos de teste (não há convenção prévia).
- Estrutura interna dos helpers de fixture e dos mocks de `axios`/`nodemailer`.
- Detalhe exato do seam de auth para TEST-05.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos & Roadmap
- `.planning/REQUIREMENTS.md` — TEST-01..TEST-05 (definições e critérios de aceite verificáveis)
- `.planning/ROADMAP.md` §"Phase 1" — objetivo e success criteria da fase
- `.planning/PROJECT.md` §Constraints — regras invioláveis (não alterar comportamento sem teste; não misturar refatoração com feature; não remover código sem prova; incremental)

### Estado atual do código (codebase map)
- `.planning/codebase/TESTING.md` — confirma ausência total de tooling de teste; lista o que precisa de mock/seam e recomenda extrair funções puras primeiro (fonte direta de D-04/D-05/D-07)
- `.planning/codebase/CONVENTIONS.md` — estilo (CommonJS, `module.exports` único, camelCase, comentários em PT, tagging de log); seguir ao escrever testes
- `.planning/codebase/CONCERNS.md` §"Fragile Areas" / §"Test Coverage Gaps" — prioriza `getStaleDeals()`, `shouldNotifyOwner`/beefor, dedup como maior valor/menor acoplamento
- `.planning/codebase/ARCHITECTURE.md` — camadas e fluxo (runCheck → agendor/emailer/db)

### Arquivos-alvo (a serem testados / minimamente costurados)
- `backend/src/agendor.js` — `getStaleDeals`, `shouldNotifyOwner`, `getDealType`, `EXCLUDED_STAGE_WORDS`/`EXCLUDED_CATEGORIES`, `NO_OWNER_NOTIFY_FUNNELS`
- `backend/src/db.js` — `alreadyNotifiedToday`, abertura do DB (seam `DB_PATH`)
- `backend/src/routes/auth.js` — rate-limit (`checkRateLimit`/`recordFailedAttempt`, `loginAttempts` Map), verificação de senha bcrypt
- `backend/src/scheduler.js` — `runCheck` (caminho integrado, se coberto)
- `backend/src/emailer.js` — alvo de mock (nodemailer), não de teste de lógica nesta fase
- `backend/package.json` — adicionar script `test`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Nenhum tooling de teste, fixture ou mock existe (TESTING.md) — tudo é greenfield dentro do backend existente.
- `backend/src/logger.js` (zero-dep) é o modelo de "minimalismo" que motivou a escolha por `node:test`.

### Established Patterns
- Backend CommonJS: `require()` no topo, `module.exports = { ... }` único no fim de cada módulo (CONVENTIONS.md). Exportar novas funções puras significa adicioná-las a esse objeto.
- Constantes de regra em `SCREAMING_SNAKE_CASE` no topo de `agendor.js` (`EXCLUDED_CATEGORIES`, `EXCLUDED_STAGE_WORDS`, `NO_OWNER_NOTIFY_FUNNELS`).
- Clientes externos (`axios`, `nodemailer`) instanciados no ponto de uso, sem injeção — por isso o mock é feito na borda do módulo (require-time), não por DI.
- `db.js` abre uma única instância `better-sqlite3` no `require()` contra o arquivo real — daí a necessidade do seam `DB_PATH`.

### Integration Points
- `backend/package.json` scripts (adicionar `test`) — consumido pela Fase 2 (CI roda esse mesmo script).
- Seam `DB_PATH` em `db.js` — reaproveitado pela Fase 3 (config por ambiente).

</code_context>

<specifics>
## Specific Ideas

- "Fixar o comportamento ATUAL" = testes de caracterização/golden, não testes de especificação idealizada. Se o código tem um quirk hoje, o teste documenta o quirk (e uma mudança futura que o altere deve ser uma decisão consciente, coberta por teste).
- Regra beefor (`NO_OWNER_NOTIFY_FUNNELS = 'beefor'`) e a match por substring de `EXCLUDED_STAGE_WORDS` (que pode excluir incidentalmente stages como "Perdão de contrato") devem ter teste explícito — são as áreas mais frágeis segundo CONCERNS.md.
- Segurança das fixtures reais: token da API só via env, nunca commitado; PII anonimizada antes do commit.

</specifics>

<deferred>
## Deferred Ideas

- Log de debug por deal excluído (dizer *por que* um deal foi filtrado) — melhoria de diagnosticabilidade sugerida em CONCERNS.md; é mudança de comportamento (novo output), pertence a uma fase posterior, não à rede de testes.
- Extrações arquiteturais maiores (`getEnrichedStaleDeals`, serviço de agregação) — Fase 7; aqui só a costura mínima para expor funções puras.
- Testes de frontend/componentes (error boundary, fluxos de UI) — fora de TEST-01..05; v2/fases de UI.
- Mover rate-limit para store persistente — v2 (SECV-02), só se houver escala horizontal.

None fora isso — a discussão permaneceu no escopo da fase.

</deferred>

---

*Phase: 1-Rede de Testes (Safety-Net)*
*Context gathered: 2026-07-22*
