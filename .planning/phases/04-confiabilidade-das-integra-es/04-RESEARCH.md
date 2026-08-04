# Fase 4: Confiabilidade das Integrações — Pesquisa

**Pesquisado:** 2026-08-04
**Domínio:** Resiliência de bordas de saída (HTTP axios / SMTP nodemailer), agendador cron, cache de módulo, atualização de dependências com advisory
**Confiança:** ALTA (quase tudo medido ao vivo nesta sessão; ver Metadata)

> **Natureza deste documento.** As decisões de design desta fase **já estão tomadas**
> (04-CONTEXT D-01..D-06 + contrato Q1-Q5). Esta pesquisa **não propõe alternativas**.
> Ela entrega ao planner: versões fixadas por medição, breaking changes reais conferidos
> contra a superfície usada pelo projeto, inventários completos de consumidores, e a
> arquitetura de validação por requisito.

---

<user_constraints>
## User Constraints (de 04-CONTEXT.md + 04-DELIVERY-CONTRACT.md)

### Decisões travadas — 04-CONTEXT.md (`## Implementation Decisions`)

- **D-01 (REL-01):** **15 segundos** de timeout, aplicado **nos dois pontos**: a instância compartilhada
  `axios.create()` em `agendor.js:6-9` **e** a chamada ad-hoc `axios.get()` em `routes/notifications.js:220`.
  Racional: generoso para uma API que responde em menos de 1s no caminho normal, mas corta um travamento
  antes de comer a janela do cron. O retry de 429 já existente (`fetchDealsPage`, esperas de 5/10/15s)
  continua por cima. Rejeitados 30s e 10s.
- **D-02 (REL-02):** Três timeouts explícitos no `createTransport`: **`connectionTimeout: 10s`,
  `greetingTimeout: 10s`, `socketTimeout: 30s`**. A configuração de timeout deve viver na **função fábrica**,
  não ser repetida em cada chamada.
- **D-03 (REL-02):** **Registrar e seguir para o próximo destinatário** — comportamento atual preservado.
  Rejeitados: resumo de falhas ao admin; marcação de prioridade.
- **D-04 (REL-03):** **Somente caracterização — nenhuma mudança de comportamento.** O teste deve cobrir
  também o `finally` de `scheduler.js:175` que libera o lock `isRunning`.
- **D-05 (REL-04):** **Limpar o cache no início de cada `getStaleDeals`**, não TTL por tempo. Um TTL mudaria
  o formato do dado guardado e a leitura direta de `agendor.js:165` passaria a receber um objeto —
  organizações excluídas voltariam a ser notificadas. Rejeitado também o cache com escopo de execução (Fase 7).
- **D-06 (dependências):** Trazer para esta fase **apenas `axios` e `nodemailer`**. O restante do `sec-02`
  permanece pendente e **não** entra aqui.

### Decisões humanas travadas — contrato (2026-08-04), **supersedem onde conflitam**

- **Q1 → plano 04-06 (REL-05):** `'sent'` somente após envio confirmado; todas as tentativas em falha →
  `'error'`; execução futura pode retentar; dedup de envios realmente bem-sucedidos preservada.
  **Sucesso parcial (≥1 destinatário confirmado) mantém `'sent'`.**
- **Q2 → plano 04-02 (REL-06):** `getDealsWithFutureTasks` passa a ser **completo ou falha explícita**.
  Falha propaga → `runCheck` registra e **encerra a rodada sem disparar nenhuma notificação**.
- **Q3 → plano 04-03:** `getDealById(id)` como nova função de domínio em `agendor.js`, usando **internamente**
  a instância compartilhada. **A instância bruta NÃO é exportada.**
- **Q4:** `workflow.auto_advance` **OFF** via `/gsd-config` antes de `/gsd-execute-phase`; religado só após C6.
  Checkpoints **C1-C6 obrigatórios**.
- **Q5:** Verificação retroativa da Fase 3 = gate de transição, após 04-VERIFICATION e antes do
  planejamento da Fase 5.
- **Critério de `npm audit` da fase:** evidência **informativa**. Exigência restrita a (a) re-medição antes/depois,
  (b) **ausência de high/critical atribuível às versões-alvo de axios e nodemailer**, (c) registro explícito dos
  advisories restantes no `sec-02`. O audit global **não** precisa zerar.

### Claude's Discretion (04-CONTEXT)

- Como expressar os timeouts (constantes de módulo, config, ou literais comentados).
- Se o timeout da chamada ad-hoc de `notifications.js` reusa a instância compartilhada de `agendor.js`
  — **resolvido por Q3: reusa, via `getDealById`.**
- Forma exata dos testes de timeout (fake timers, servidor lento local, ou stub que nunca resolve).
- Onde a limpeza do cache é invocada dentro de `getStaleDeals`.

### Deferred Ideas (FORA DE ESCOPO — ignorar completamente)

- Resumo de falhas de envio ao admin.
- Última falha do agendador visível no dashboard (`lastRunResult` já guarda o dado).
- Alerta após N falhas consecutivas.
- Cache com escopo de execução (Map local) — Fase 7.
- Restante do `sec-02`: `vite` 5→8, `node-cron` 3→4, demais transitivas, e `npm audit` no CI.
- `sec-01` (rotação do token); `ops-01` (Fase 8); `console.*` residual (Fase 5).
- Auth/autorização (Fase 6); regras de seleção/exclusão de deals; UI; refatoração estrutural.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descrição | Suporte desta pesquisa |
|----|-----------|------------------------|
| **REL-01** | Timeout explícito nas chamadas HTTP à API Agendor (instância axios compartilhada + chamada ad-hoc em `/resolved`) | §Stack (axios 1.19.0 fixado), §Padrão 2 (timeout na instância), §Padrão 3 (`getDealById`), §Pitfall 1 (código de erro `ECONNABORTED` ≠ `ETIMEDOUT`), §Validation (REL-01) |
| **REL-02** | Timeout e tratamento de falha no envio SMTP (nodemailer) | §Padrão 4 (3 timeouts na fábrica, 6 call-sites mapeados), §Pitfall 3 (`mock.timers` nas esperas de retry), §Pitfall 2 (classificação de erro real do nodemailer), §Validation (REL-02) |
| **REL-03** | Falha em uma execução do cron é registrada e não derruba o agendador | §Estado atual (já satisfeito — `catch :171` + `finally :174`), §Padrão 1 (caracterização), §Validation (REL-03) |
| **REL-04** | `orgCategoryCache` ganha invalidação para não usar categoria obsoleta | §Padrão 6 (limpar chaves preservando a referência), §Pitfall 6 (ponto de limpeza), §Validation (REL-04) |
| **REL-05** *(novo — Q1)* | Consistência do status de envio: `'sent'` só após confirmação; falha → `'error'` retentável | §Inventário A (todos os leitores/escritores de `status`), §Padrão 5 (`updateNotificationStatus`), §Validation (REL-05) |
| **REL-06** *(novo — Q2)* | Fail-safe na consulta de tarefas futuras: resultado completo ou falha explícita | §Inventário B (**3 consumidores, não 2**), §Achado 1 (WR-02 não pina o catch), §Validation (REL-06) |

**Ação obrigatória do planner:** registrar **REL-05** e **REL-06** em `.planning/REQUIREMENTS.md`
(seção "Confiabilidade das Integrações", linhas 38-41) e na tabela de Traceability (linhas 121-124),
ambos mapeados à Phase 4. Invariante: nenhum plano sem requisito.
</phase_requirements>

---

## Summary

Todas as sete perguntas abertas do contrato (§"A verificar pelo planner") foram respondidas por **medição
direta**, não por inferência. Três resultados mudam o plano de forma material.

**Primeiro: o risco R-3 ("nodemailer 9 incompatível", classificado como *alto* no contrato) é
demonstravelmente baixo.** Rodei a suíte completa do backend em uma cópia isolada com `axios@1.19.0 +
nodemailer@9.0.4` e, como controle, a **mesma cópia** com as versões baseline. Os dois runs produziram
**exatamente as mesmas 6 falhas**, todas artefatos do isolamento (`.env.example` ausente e diretório fora
de um repositório git). **Zero regressão atribuível aos bumps.** Além disso, comparei linha a linha a
superfície que o projeto usa — `createTransport`, `sendMail`, `verify` e, sobretudo, **o formato de erro
que `sendMailWithRetry` classifica** — entre o v6.10.1 instalado e o v9.0.4 alvo: `_formatError` é idêntico,
os códigos `ETIMEDOUT`/`ESOCKET`/`ECONNECTION`/`EAUTH`/`EENVELOPE` são idênticos, e as três opções de
timeout de D-02 existem com os mesmos defaults nas duas versões. As três breaking changes reais (SESv2 em
7.0.0, `NoAuth`→`ENOAUTH` em 8.0.0, validação de TLS ao buscar conteúdo remoto em 9.0.0) **não tocam nenhum
caminho deste projeto** — a de 8.0.0 vive só em `lib/smtp-pool/index.js`, e este projeto não usa pool.

**Segundo: o risco R-12 ("golden WR-02 pinava o catch→break") não existe.** `agendor.futureTasks.test.js`
não exercita o catch — o `routeHandler` do fakeAxios nunca lança, e o relatório de cobertura confirma que
`agendor.js:225-227` (exatamente `catch { console.error; break }`) está **descoberto**. O 04-02 não precisa
atualizar o WR-02; precisa **adicionar** a cobertura que nunca existiu.

**Terceiro — e é o achado que amplia o plano: `getDealsWithFutureTasks` tem TRÊS consumidores, não dois.**
Além de `runCheck` e `runCheckOnly`, `backend/src/routes/deals.js:17` também o chama, e ali o `Set` é usado
apenas como **flag decorativa** (`hasFutureTask`), não como decisão de segurança. Com Q2, uma falha na
consulta de tarefas passa a devolver 500 na aba "Negócios" inteira. O frontend já trata isso corretamente
(`DealsList.jsx:80`), mas a decisão precisa ser **explícita e testada**, não um efeito colateral descoberto
em produção. Junto com ele, mapeei o inventário completo de leitores de `status` exigido pelo 04-06:
`routes/track.js` **não** lê `status` (R-13 se estreita), mas `getNotificationStats`, `getNotifiedDealIds`
e `getNotifiedDeals` leem — e todos vão *encolher* após a correção, o que é o conserto pretendido e precisa
ser documentado como esperado.

**Recomendação primária:** fixar `axios: ^1.19.0` e `nodemailer: ^9.0.4`; executar os 7 planos na ordem do
contrato; ampliar o inventário do 04-02 para incluir `routes/deals.js`; e não gastar o checkpoint C3 com
medo de incompatibilidade do major — gastá-lo revisando o que a suíte atual **não** cobre (o caminho de
envio, hoje em 7,16% de cobertura em `emailer.js`).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Timeout de chamada HTTP à Agendor (REL-01) | Backend — borda HTTP (`agendor.js`) | — | A instância `axios.create()` é o único ponto que todos os 4 consumidores atravessam; configurar ali cobre todos de uma vez |
| Busca de um deal por ID para `/resolved` (Q3) | Backend — borda HTTP (`agendor.js`) | Backend — rota (`routes/notifications.js`) | Q3 travou: acesso à API Agendor é responsabilidade do módulo que já detém a borda; a rota só orquestra |
| Timeout de conexão/greeting/socket SMTP (REL-02) | Backend — borda SMTP (`emailer.js`, fábrica `createTransporter`) | — | D-02 travou: a fábrica é o único ponto por onde os 6 call-sites passam |
| Retry e classificação de erro de envio | Backend — borda SMTP (`sendMailWithRetry`) | — | Já existe; a fase alimenta com timeouts reais, **não substitui** |
| Decisão "esta rodada pode notificar?" (REL-06) | Backend — agendador (`scheduler.js: runCheck`) | Backend — borda HTTP (propaga a falha) | A borda reporta a falha; quem decide abortar a rodada é o orquestrador |
| Consistência do registro de envio (REL-05) | Backend — agendador (`scheduler.js`, fluxo de log) | Backend — camada de dados (`db.js`, helper de update) | O agendador conhece o resultado por destinatário; `db.js` só executa o UPDATE |
| Invalidação do cache de categorias (REL-04) | Backend — borda HTTP (`agendor.js: getStaleDeals`) | — | O cache é estado de módulo de `agendor.js`; a limpeza é interna e não muda assinatura pública |
| Exibição de status de notificação | Frontend (`NotificationHistory.jsx`, `Dashboard.jsx`) | Backend — rotas de leitura | Já implementado; **nenhuma mudança de frontend nesta fase** (verificado: o ternário já trata `!== 'sent'`) |
| Gate de dependências vulneráveis | CI (`.github/workflows/ci.yml`) | — | **Fora de escopo** (decisão adiada); nesta fase o `npm audit` é evidência manual registrada nos SUMMARYs |

---

## Project Constraints (from CLAUDE.md)

Diretivas acionáveis extraídas de `./CLAUDE.md` — o planner deve verificar conformidade de cada plano:

| # | Diretiva | Impacto nos planos 04-01..04-07 |
|---|----------|-------------------------------|
| PC-1 | **Reorganização incremental** — não reescrever o projeto inteiro | 04-02 e 04-07 alteram poucas linhas; nenhum plano pode virar refatoração |
| PC-2 | **Não alterar comportamento funcional sem teste cobrindo o novo comportamento** | 04-02 e 04-06 são comportamentais → os 5 cenários literais de Q2/Q1 são **condição de entrada**, não opcionais |
| PC-3 | **Não misturar refatoração estrutural com novas funcionalidades no mesmo trabalho** | `getDealById` é **adição** no módulo que já detém a borda — permitido; extrair `getEnrichedStaleDeals` **não** (Fase 7) |
| PC-4 | **Não remover código sem comprovar que está inutilizado** | Ver Achado 4: `getClickedDealIds` é código morto comprovado — **mesmo assim, remoção fica fora desta fase** (não há requisito que a cubra) |
| PC-5 | **Manter stack atual** (Express 4, better-sqlite3 9, React 18, Vite 5) | Os bumps são de `axios`/`nodemailer` apenas; `express`/`node-cron`/`vite` ficam no `sec-02` |
| PC-6 | **`node:test` nativo + `c8`; um arquivo de teste = um processo** | Cada variação de ambiente/stub precisa de arquivo próprio; ver §Pitfall 4 |
| PC-7 | **Gate de cobertura ativo** (`.c8rc.json`, `per-file: false`, pisos 20/20/20/60) | Ver §Coverage baseline — folga confortável, mas branches é o piso mais próximo |
| PC-8 | **Biome é o único linter/formatter**; `npm run lint` deve sair 0 | Baseline medido: backend 45 warnings, exit 0. Não introduzir Prettier/ESLint |
| PC-9 | **Comentários, logs e strings em português** | Todo teste e comentário novo em PT-BR |
| PC-10 | **Log com tag entre colchetes** (`[Scheduler]`, `[Agendor]`, `[Emailer]`) | Qualquer log novo segue a convenção; `console.warn` do retry permanece até a Fase 5 |
| PC-11 | **`logger` em código novo, nunca `console.*`** | Nota: o contrato manda **manter** o `console.warn` existente do retry (Fase 5 migra); código **novo** usa `logger` |
| PC-12 | **`module.exports = { ... }` único no fim** de cada módulo backend | `getDealById` e `updateNotificationStatus` entram nos blocos existentes |
| PC-13 | **Nunca logar `SMTP_PASS`, token Agendor ou corpo de e-mail** | Testes de timeout não podem imprimir opções de transporte com `auth.pass` |
| PC-14 | **GSD workflow enforcement** — edições só via comando GSD | `/gsd-execute-phase` com `auto_advance` OFF (Q4) |
| PC-15 | **Funções com 3+ entradas usam objeto destruturado** | `updateNotificationStatus(logId, status, error)` são 3 posicionais — no limite; seguir o estilo de `markResolved(deal_id, resolved_at)`, que é posicional |

---

## Estado atual medido (baseline da fase)

Tudo abaixo foi medido em **2026-08-04** nesta sessão. Substitui os números do contrato onde divergir.

| Item | Valor medido | Fonte |
|---|---|---|
| Node local | **v22.13.1** (wrapper `~/bin/node`; requer `export PATH="$HOME/bin:$PATH"`) | `node -v` [VERIFICADO] |
| npm local | 10.9.2 | `npm -v` [VERIFICADO] |
| Node no CI | `'20'` (`.github/workflows/ci.yml`, ambos os jobs) | leitura do arquivo [VERIFICADO] |
| Suíte backend | **78/78 verdes** | `npm test` [VERIFICADO] |
| Cobertura global | **Stmts 32 · Branch 72.72 · Funcs 33.75 · Lines 32** | `npm run test:coverage` [VERIFICADO] |
| Pisos ativos | lines 20 / statements 20 / functions 20 / **branches 60**; `per-file: false`, `all: true`, exclui `src/index.js` | `backend/.c8rc.json` [VERIFICADO] |
| Lint backend | exit **0**, **45 warnings** | `npm run lint` [VERIFICADO] |
| `axios` instalado | **1.13.6** (spec `^1.7.2`) | `npm ls axios` [VERIFICADO] |
| `nodemailer` instalado | **6.10.1** (spec `^6.9.13`) | `npm ls nodemailer` [VERIFICADO] |
| `npm audit` backend | **12 total — 5 high, 7 moderate, 0 critical** | `npm audit --json` [VERIFICADO] |
| Branch atual | `main` (limpa; push direto **recusado** por `enforce_admins`) | `git branch --show-current` + STATE.md [VERIFICADO] |
| `auto_advance` | **`true`** em `.planning/config.json` — **precisa ir para `false` antes de executar (Q4)** | leitura do arquivo [VERIFICADO] |
| `nyquist_validation` | `true` → seção Validation Architecture obrigatória | `.planning/config.json` [VERIFICADO] |

### Cobertura por arquivo (os alvos da fase)

| Arquivo | % Stmts | % Branch | Linhas descobertas relevantes |
|---|---|---|---|
| `agendor.js` | 79.25 | 69.11 | `43-45` (catch do `getOrgCategory`), `108-114` (retry 429), `137-147`/`151-157` (paginação + `Promise.all` de orgs), **`225-227` (catch do `getDealsWithFutureTasks`)** |
| `scheduler.js` | **10.65** | 100 | `…-245`, `247-275`, `277-285`, `288-305`, `308-317` — praticamente tudo |
| `emailer.js` | **7.16** | 100 | `…-379`, `381-401`, `408-459`, `463-675`, `677-732` |
| `db.js` | 62.61 | 77.77 | vários |
| `routes/notifications.js` | **0** | 0 | `1-264` — inclui o `/resolved` do 04-03 |
| `routes/deals.js` | **0** | 0 | `1-37` |
| `routes/track.js` | **0** | 0 | `1-44` |

> **Leitura para o planner:** os planos 04-01, 04-02, 04-04 e 04-06 atacam justamente os dois arquivos de
> menor cobertura (`scheduler.js` 10.65%, `emailer.js` 7.16%). A cobertura global **sobe** ao longo da fase;
> o piso de branches (60 contra 72.72 atuais, 12.72 pontos de folga) é o único que merece atenção — ver §Pitfall 7.

---

## Standard Stack

Nenhum pacote novo entra nesta fase. As duas linhas abaixo são **atualizações de incumbentes** já presentes
no `backend/package.json`.

### Core

| Biblioteca | Versão alvo | Propósito | Por que esta versão |
|---|---|---|---|
| `axios` | **`^1.19.0`** (1.19.0, publicada 2026-07-29) | Cliente HTTP de toda chamada à API Agendor | Última 1.x sem salto de major. A faixa vulnerável agregada é `1.0.0 – 1.17.0`; **não existe 1.17.1**, logo a primeira versão limpa é 1.18.0 e a mais recente é 1.19.0 [VERIFICADO: npm registry + GitHub Advisory API] |
| `nodemailer` | **`^9.0.4`** (9.0.4, publicada 2026-08-04) | Envio SMTP (alertas de negócio parado, resumos, reset de senha) | `fixAvailable` do próprio `npm audit`. A versão **mínima** que fecha todos os advisories conhecidos é **9.0.1**; 9.0.4 é a mais recente e adiciona só correções de MIME [VERIFICADO: npm registry + GitHub Advisory API] |

**Comando de bump (um por commit — nunca os dois juntos):**

```bash
export PATH="$HOME/bin:$PATH"
cd backend
npm install axios@^1.19.0        # commit do 04-03
npm install nodemailer@^9.0.4    # commit do 04-05
```

### Alternativa medida para o nodemailer (decisão a registrar em C1)

| Em vez de | Poderia usar | Tradeoff medido |
|---|---|---|
| `nodemailer@^9.0.4` | `nodemailer@^9.0.3` (publicada **2026-06-30**, ~5 semanas de exposição) | 9.0.3 já fecha **todos** os advisories (o mais recente exige ≥9.0.1). 9.0.4 foi publicada **hoje, 2026-08-04** — zero tempo de campo. O delta 9.0.3→9.0.4 são 5 correções em `mime-funcs`/`mime-node` (surrogates não pareados, escape em `Content-Type name`, encode de HT/CR/LF em parâmetros de header) — todas no caminho de codificação de cabeçalho, que **este projeto exercita** (assuntos com emoji `⚠️` e acentos em `emailer.js:209`). O contrato diz "9.x mais recente" → **9.0.4**. Registrar em C1 que a escolha foi consciente e que 9.0.3 é o fallback de rollback intermediário se algo aparecer. |

**Nenhuma alternativa a considerar para o axios:** 1.19.0 é a única escolha que satisfaz simultaneamente
"última 1.x" e "sem advisory aberto".

---

## Package Legitimacy Audit

| Pacote | Registry | Idade | Downloads/semana | Repositório | slopcheck | Disposição |
|---|---|---|---|---|---|---|
| `axios` | npm | **11,9 anos** (1ª publicação 2014-08-29) | **118.249.216** | `github.com/axios/axios` | **[OK]** | Aprovado |
| `nodemailer` | npm | **15,5 anos** (1ª publicação 2011-01-21) | **19.202.529** | `github.com/nodemailer/nodemailer` | **[OK]** | Aprovado |

- **Pacotes removidos por veredito [SLOP]:** nenhum.
- **Pacotes marcados [SUS]:** nenhum.
- **`postinstall`:** ambos **vazios** (`npm view axios@1.19.0 scripts.postinstall` e o equivalente para
  nodemailer retornam vazio). `axios` declara `prepare: husky`, que só roda a partir do repositório-fonte,
  não do tarball publicado. [VERIFICADO]
- **Registry correto:** ecossistema Node/npm em ambos os casos; sem risco de confusão cross-ecosystem.
- **Dependências transitivas do alvo:**
  - `axios@1.19.0` → `form-data ^4.0.6`, `proxy-from-env ^2.1.0`, `follow-redirects ^1.16.0`,
    `https-proxy-agent ^5.0.1` [VERIFICADO]
  - `nodemailer@9.0.4` → **nenhuma** (zero dependências) [VERIFICADO]

> ### ⚠️ Armadilha operacional descoberta: `slopcheck install` **instala de verdade**
>
> `slopcheck install <pkgs>` não é uma checagem read-only — ele executa `npm install <pkgs>` no diretório
> corrente após aprovar. Ao rodá-lo aqui, ele adicionou 28 pacotes e modificou o `package.json` e o
> `package-lock.json` **da raiz do repositório**. Foi revertido integralmente (`git checkout --` nos dois
> arquivos + `npm prune`; `git status` limpo, suíte do backend 78/78 verde, árvore da raiz de volta a
> pptxgenjs-only). **O executor não deve usar `slopcheck install` dentro do repositório.** Se precisar
> revalidar, use `slopcheck scan` ou rode em diretório descartável. [VERIFICADO: observado e revertido nesta sessão]
>
> Nota: `slopcheck` foi instalado com `pip3 install --user slopcheck` (o `pip` puro não existe nesta máquina
> e `--break-system-packages` não é suportado pelo pip 21.2.4 do sistema); o binário fica em
> `~/Library/Python/3.9/bin/slopcheck`. A flag `--json` **não** é suportada na versão 0.6.1.

---

## Estratégia de dependências — resultados medidos

Simulei os dois bumps em uma **cópia isolada** de `backend/package.json` + `package-lock.json`
(`npm ci` limpo primeiro, depois um `npm install` por pacote), sem tocar o repositório.

### Passo 1 — `axios` 1.13.6 → 1.19.0

**Delta do lockfile (o que C4 vai ver):**

```
ALTERADOS (5):
  axios:            1.13.6  -> 1.19.0
  follow-redirects: 1.15.11 -> 1.16.0     ← fecha GHSA-r4q5-vmmm-2653 (moderate)
  form-data:        4.0.5   -> 4.0.6      ← fecha GHSA-hmw2-7cc7-3qxx (HIGH)
  hasown:           2.0.2   -> 2.0.4
  proxy-from-env:   1.1.0   -> 2.1.0

ADICIONADOS (6):
  agent-base, agent-base/debug, agent-base/ms,
  https-proxy-agent, https-proxy-agent/debug, https-proxy-agent/ms

REMOVIDOS: nenhum
```

> **Aviso explícito para o checkpoint C4.** O contrato diz que o diff do lockfile deve conter "só o pacote e
> transitivas dele". **`https-proxy-agent` e `agent-base` são novos** — não existiam na árvore antes.
> São dependências **diretas declaradas por `axios@1.19.0`** (`axios` passou a depender de
> `https-proxy-agent ^5.0.1`), portanto satisfazem o critério. Sem esse aviso prévio, o revisor
> corretamente sinalizaria isso como contaminação. [VERIFICADO: simulação isolada]

**`npm audit` após o bump:** 12 (5 high) → **9 (3 high, 6 moderate)**. Desaparecem: `axios`, `form-data`,
`follow-redirects`. [VERIFICADO]

### Passo 2 — `nodemailer` 6.10.1 → 9.0.4

**Delta do lockfile:**

```
ALTERADOS (1):
  nodemailer: 6.10.1 -> 9.0.4

ADICIONADOS: nenhum
REMOVIDOS:   nenhum
```

Uma única linha. `nodemailer` não tem dependências. Este é o diff mais limpo possível para C4. [VERIFICADO]

**`npm audit` após o bump:** 9 (3 high) → **8 (2 high, 6 moderate)**. [VERIFICADO]

### Resumo do critério de audit da fase

| Momento | Total | High | Moderate |
|---|---|---|---|
| Antes (início do 04-03) | 12 | 5 | 7 |
| Depois do axios | 9 | 3 | 6 |
| **Depois do nodemailer (fim do 04-05)** | **8** | **2** | **6** |

**Zero high/critical atribuível a `axios` ou `nodemailer`** — critério (b) do contrato satisfeito.

**Advisories remanescentes (critério (c) — registrar no `sec-02`):**

| Pacote | Sev. | Direto? | Correção | Advisory |
|---|---|---|---|---|
| `path-to-regexp` | **high** | não (via Express 4) | sem major | GHSA-37ch-88jc-xwx2 (ReDoS) |
| `brace-expansion` | **high** | não | sem major | GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895, GHSA-jxxr-4gwj-5jf2 (DoS) |
| `express` | moderate | sim | sem major (via `qs`) | — |
| `qs` | moderate | não | sem major | GHSA-q8mj-m7cp-5q26 |
| `body-parser` | moderate | não | sem major | GHSA-v422-hmwv-36x6 |
| `morgan` | moderate | sim | sem major | GHSA-4vj7-5mj6-jm8m (log forging) |
| `node-cron` | moderate | sim | **major 4.6.0** | via `uuid` |
| `uuid` | moderate | não (via node-cron) | **major do node-cron** | GHSA-w5hq-g745-h8pq |

---

## Architecture Patterns

### System Architecture Diagram

```
                            ┌──────────────────────────────────────────────┐
  ENTRADAS                  │            SUPERFÍCIE HTTP (Express)         │
                            └──────────────────────────────────────────────┘
  ┌──────────────┐   POST /api/notifications/run  ─────────────┐
  │ Dashboard.jsx│   POST /api/notifications/check ──────────┐ │
  └──────────────┘                                           │ │
  ┌──────────────┐   GET  /api/deals/stale ────────────────┐ │ │
  │ DealsList.jsx│   GET  /api/notifications/notified-deals│ │ │
  └──────────────┘                                         │ │ │
  ┌──────────────────┐ GET /api/notifications ─────────┐   │ │ │
  │NotificationHistory│GET /api/notifications/resolved ─┼─┐ │ │ │
  └──────────────────┘                                 │ │ │ │ │
  ┌──────────────┐   GET  /api/track/click ──────┐     │ │ │ │ │
  │ link do e-mail│                              │     │ │ │ │ │
  └──────────────┘                               │     │ │ │ │ │
  ┌──────────────┐                               │     │ │ │ │ │
  │ node-cron    │  0 8 * * *  ──────────────────┼─────┼─┼─┼─┼─┤
  │ (America/SP) │  0 11 * * 5 ──────────────────┼─────┼─┼─┼─┼─┤
  └──────────────┘                               │     │ │ │ │ │
                                                 v     v v v v v
                    ┌────────────────────────────────────────────────────┐
                    │           ORQUESTRAÇÃO — scheduler.js              │
                    │  runCheck()  [guard isRunning :27]                 │
                    │    try {                                           │
                    │      Promise.all([getStaleDeals, getUsers,         │
                    │                   getDealsWithFutureTasks]) ◄──┐   │
                    │      por deal: dedup → funil → destinatário    │   │
                    │        (04-06) log 'pendente' → enviar →       │   │
                    │                atualizar 'sent' | 'error'      │   │
                    │    } catch { results.error = ... }   ◄─ (04-02)┘   │
                    │    finally { isRunning = false }                   │
                    │  runCheckOnly()  ── sem envio, mesma Promise.all   │
                    │  runWeeklySummary() ── catch próprio, sem lock     │
                    └───────┬───────────────────────┬────────────────────┘
                            │                       │
              ┌─────────────v──────────┐   ┌────────v───────────────────┐
              │  BORDA HTTP agendor.js │   │  BORDA SMTP  emailer.js    │
              │                        │   │                            │
              │  api = axios.create({  │   │  createTransporter()  ◄────┼── 6 call-sites
              │    baseURL, headers,   │   │    nodemailer.createTransport({
              │  (04-03) timeout:15000 │   │      host/port/secure/auth,│
              │  })                    │   │  (04-04) connectionTimeout:10s
              │   ├ getUsers           │   │            greetingTimeout:10s
              │   ├ getOrgCategory ────┼─┐ │            socketTimeout:30s
              │   ├ fetchDealsPage     │ │ │    })                      │
              │   │   └ retry SÓ em 429│ │ │  sendMailWithRetry(3×,3s/6s)
              │   ├ getDealsWithFuture │ │ │    ├ classifica erro:      │
              │   │   Tasks            │ │ │    │  ETIMEDOUT|ECONNRESET │
              │   │  (04-02) catch→break│ │ │   │  | msg~/timeout|econnreset/
              │   │   VIRA rethrow     │ │ │    └ recria transporter    │
              │   └ (04-03) getDealById│ │ │  retorna {to,success,error?}
              └────────────┬───────────┘ │ └────────────┬───────────────┘
                           │             │              │
                           │   ┌─────────v──────────┐   │
                           │   │ orgCategoryCache   │   │
                           │   │ {orgId: str|null}  │   │
                           │   │ lido em :36 E :165 │   │
                           │   │ (04-07) limpar as  │   │
                           │   │  CHAVES no início  │   │
                           │   │  de getStaleDeals  │   │
                           │   └────────────────────┘   │
                           v                            v
              ┌────────────────────────┐   ┌────────────────────────────┐
              │   API Agendor (HTTPS)  │   │      Servidor SMTP         │
              │ /deals /users /tasks   │   │                            │
              │ /organizations/:id     │   └────────────────────────────┘
              │ /deals/:id             │
              └────────────────────────┘
                           ▲
                           │
              ┌────────────┴────────────────────────────────────────────┐
              │  PERSISTÊNCIA — db.js (better-sqlite3, síncrono)        │
              │   config · notification_log · weekly_snapshots · …      │
              │   escritores de status: scheduler:113, scheduler:144,   │
              │                         routes/notifications:94         │
              │   leitores de status='sent': alreadyNotifiedToday,      │
              │     getNotificationStats, getNotifiedDealIds,           │
              │     getNotifiedDeals                                    │
              │   (04-06) + updateNotificationStatus(logId,status,error)│
              └─────────────────────────────────────────────────────────┘
```

### Estrutura de arquivos (sem novos diretórios)

```
backend/
├── src/
│   ├── agendor.js        # 04-02 (rethrow) · 04-03 (timeout + getDealById) · 04-07 (limpar cache)
│   ├── emailer.js        # 04-04 (3 timeouts na fábrica)
│   ├── scheduler.js      # 04-01 (só caracterizado) · 04-06 (fluxo de log)
│   ├── db.js             # 04-06 (helper updateNotificationStatus)
│   └── routes/
│       ├── notifications.js  # 04-03 (/resolved passa a usar getDealById)
│       └── deals.js          # 04-02 — CONSUMIDOR DESCOBERTO (ver Inventário B)
├── test/
│   ├── helpers/{fakeAxios.js, tmpDb.js}   # reusar, não recriar
│   ├── setup.js                            # sempre `require('./setup')` primeiro
│   ├── scheduler.resilience.test.js        # NOVO — 04-01
│   ├── scheduler.failsafe.test.js          # NOVO — 04-02
│   ├── agendor.timeout.test.js             # NOVO — 04-03
│   ├── notifications.resolved.test.js      # NOVO — 04-03 (shape da rota)
│   ├── emailer.timeout.test.js             # NOVO — 04-04
│   ├── notificationStatus.test.js          # NOVO — 04-06
│   └── agendor.cacheInvalidation.test.js   # NOVO — 04-07
└── package.json          # 04-03 (axios) · 04-05 (nodemailer)
```

### Padrão 1 — Caracterizar o scheduler sem rede nem SMTP (04-01)

**O quê:** exercitar `runCheck` real, com as três bordas (`axios`, `nodemailer`, SQLite) substituídas.
**Quando usar:** 04-01, 04-02, 04-06 — todos os testes que atravessam `scheduler.js`.

A ordem importa: `agendor.js` cria a instância axios **no load do módulo**, então o stub precisa estar
instalado **antes** do primeiro `require`. `emailer.js` só chama `createTransport()` dentro de
`createTransporter()`, então ali há folga (o stub pode vir depois do require) — essa assimetria já está
documentada em `test/emailer.smtpPass.test.js:35-37`.

```js
// Fonte: padrão composto de backend/test/agendor.futureTasks.test.js:59-69,
//        backend/test/db.dedup.test.js:12-32 e backend/test/emailer.smtpPass.test.js:35-45
// (verificado no repositório em 2026-08-04)

// 1) DB_PATH em arquivo temporário ANTES de qualquer require de src/
const { makeTmpDbPath, openRaw } = require('./helpers/tmpDb');
const { path: DB_PATH, cleanup } = makeTmpDbPath();
process.env.DB_PATH = DB_PATH;

// 2) setup.js DEPOIS: ele só define o que estiver ausente, então o temp vence
require('./setup');

const { test, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakeAxios } = require('./helpers/fakeAxios');
const nodemailer = require('nodemailer');

// 3) fakeAxios ANTES de require('../src/agendor') — a instância nasce no load
const fake = installFakeAxios(async (url, config) => {
  if (url === '/deals')  return { data: { data: [], meta: { totalCount: 0 } } };
  if (url === '/users')  return { data: { data: [] } };
  if (url === '/tasks')  return { data: { data: [] } };
  return { data: { data: [] } };
});

// 4) stub do nodemailer pode vir aqui — createTransport só é chamado em runtime
let enviados = 0;
mock.method(nodemailer, 'createTransport', () => ({
  verify:   async () => true,
  sendMail: async () => { enviados++; return {}; },
}));

const db = require('../src/db');
const { runCheck, getStatus } = require('../src/scheduler');

after(() => { mock.restoreAll(); db.closeDb(); cleanup(); });
```

### Padrão 2 — Timeout na instância compartilhada (04-03, REL-01)

**O quê:** uma opção a mais no `axios.create()` existente. Cobre os **4** consumidores de uma vez
(`getUsers`, `getOrgCategory`, `fetchDealsPage`, `getDealsWithFutureTasks`).

```js
// backend/src/agendor.js:6-9 — mudança mínima
const api = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Token ${TOKEN}` },
  // D-01: 15s. Generoso para uma API que responde em <1s no caminho normal, mas corta
  // um travamento antes de comer a janela do cron. NÃO entra no retry de 429 abaixo:
  // um timeout não traz `err.response`, então fetchDealsPage o propaga direto.
  timeout: 15000,
});
```

**Como testar (sem rede):** `installFakeAxios` já usa `mock.method(axios, 'create', ...)`. Os argumentos
recebidos ficam em `axios.create.mock.calls[0].arguments[0]`. O helper atual **descarta** esses argumentos —
o teste do 04-03 pode inspecioná-los diretamente pelo mock, ou o helper pode ganhar um retorno adicional
(mudança aditiva, compatível com os testes existentes).

### Padrão 3 — `getDealById` como função de domínio (04-03, Q3)

**O quê:** eliminar a chamada `axios.get` órfã de `routes/notifications.js:220-223`, que hoje refaz o header
`Authorization` e relê `AGENDOR_TOKEN` — e por isso **não herda o timeout**.

```js
// backend/src/agendor.js — nova função, entra no module.exports existente (PC-12)
// Q3: usa a instância compartilhada (logo, herda o timeout de 15s). A instância bruta
// NÃO é exportada — a rota não deve conhecer a borda HTTP.
async function getDealById(id) {
  const { data } = await api.get(`/deals/${id}`);
  return data.data || null;
}
```

```js
// backend/src/routes/notifications.js — o /resolved passa a chamar getDealById.
// O catch POR ITEM permanece: um deal que falha continua contando como não-resolvido,
// e a rota inteira continua respondendo 200. Remover o `const TOKEN` local e o
// `require('axios')` do topo se ficarem sem uso.
const deal = await getDealById(d.deal_id);
const currentUpdatedAt = deal?.updatedAt;
```

**Atenção ao shape:** o `axios.get` atual lê `data.data?.updatedAt` e `data.data?.dealStatus?.id`. Se
`getDealById` já devolve `data.data`, a rota passa a ler `deal?.updatedAt` e `deal?.dealStatus?.id`. O teste
de shape do 04-03 tem que cobrir **os dois campos**, incluindo `dealStatus`, que é o mais fácil de esquecer.

### Padrão 4 — Timeouts SMTP na fábrica (04-04, REL-02)

**Os 6 call-sites, mapeados por função** (confirmados por grep em 2026-08-04):

| Linha | Função | Chega ao usuário? |
|---|---|---|
| `emailer.js:197` | `sendMailWithRetry` — **recriação do transporter no retry** | sim (é o caminho de retentativa) |
| `emailer.js:206` | `sendStaleNotification` | sim — o alerta diário |
| `emailer.js:383` | `sendWeeklySummary` (admins) | sim |
| `emailer.js:404` | `verifySmtp` → `POST /api/config/test-smtp` | sim (UI de config) |
| `emailer.js:409` | `sendResetPasswordEmail` | sim (reset de senha) |
| `emailer.js:689` | `sendOwnerWeeklySummary` | sim |

Todos passam pela fábrica `createTransporter()` (`emailer.js:12-22`). **Uma mudança, seis coberturas.**

```js
// backend/src/emailer.js:12-22
function createTransporter() {
  return nodemailer.createTransport({
    host: getConfig('smtp_host'),
    port: parseInt(getConfig('smtp_port')),
    secure: parseInt(getConfig('smtp_port')) === 465,
    auth: {
      user: getConfig('smtp_user'),
      pass: (process.env.SMTP_PASS || '').trim(),
    },
    // D-02 — os defaults do nodemailer (2min / 30s / 10min) deixam uma tentativa
    // travada segurar a rodada. Com socketTimeout de 30s e as 3 tentativas já
    // existentes de sendMailWithRetry, o pior caso por e-mail cai de ~30min p/ ~1min40s.
    connectionTimeout: 10000, // TCP estabelecido
    greetingTimeout: 10000,   // banner 220 do servidor
    socketTimeout: 30000,     // inatividade durante a sessão
  });
}
```

**Verificado:** as três opções existem com **os mesmos nomes e os mesmos defaults** em `nodemailer@6.10.1`
(instalado) e em `nodemailer@9.0.4` (alvo) — `CONNECTION_TIMEOUT = 2*60*1000`, `SOCKET_TIMEOUT = 10*60*1000`,
`GREETING_TIMEOUT = 30*1000`, nas linhas 14-16 de `lib/smtp-connection/index.js` nas duas versões. A premissa
de D-02 está correta e sobrevive ao bump. [VERIFICADO: leitura do fonte das duas versões]

### Padrão 5 — Atualizar a linha existente em vez de inserir uma segunda (04-06, REL-05)

O insert-first **permanece** (o `logId` é necessário antes do envio, para o link de tracking). O que muda é
que ele deixa de gravar um `'sent'` otimista, e o caminho de exceção deixa de inserir uma segunda linha.

```js
// backend/src/db.js — helper novo, no estilo posicional de markResolved (PC-15)
function updateNotificationStatus(log_id, status, error) {
  return db
    .prepare(`UPDATE notification_log SET status = ?, error = ? WHERE id = ?`)
    .run(status, error || null, log_id);
}
```

```js
// backend/src/scheduler.js — esboço do fluxo corrigido (o planner detalha)
const logEntry = logNotification({ /* … */ status: 'pending', error: null, /* … */ });
const logId = logEntry.lastInsertRowid;
try {
  const emailResults = await sendStaleNotification({ deal, ownerEmail, authorEmail, logId });
  const algumSucesso = emailResults.some((r) => r.success);   // Q1: ≥1 confirmado basta
  const erros = emailResults.filter((r) => !r.success).map((r) => r.error);
  if (algumSucesso) {
    updateNotificationStatus(logId, 'sent', erros.length ? erros.join('; ') : null);
  } else {
    updateNotificationStatus(logId, 'error', erros.join('; '));
  }
  // …dealResult.notified / results.errors como hoje
} catch (err) {
  results.errors.push(err.message);
  updateNotificationStatus(logId, 'error', err.message);   // atualiza, NÃO insere segunda linha
}
```

> **Decisão que o planner precisa travar em 04-06: qual é o status inicial da linha?**
> A coluna é `status TEXT NOT NULL DEFAULT 'sent'` (`db.js:23`) e `alreadyNotifiedToday` filtra
> `status = 'sent'` (`db.js:228`). Três opções, todas compatíveis com Q1:
> (a) `'pending'` — mais explícito; nenhum leitor atual conta `'pending'` como enviado, então uma linha
>     órfã por crash do processo fica corretamente **não-deduplicante** e será retentada amanhã (fail-safe);
> (b) `'error'` — mesmo efeito prático, semântica pior enquanto o envio está em curso;
> (c) manter `'sent'` e só corrigir na falha — **rejeitar**: reabre a janela de crash-durante-o-envio, que é
>     exatamente o defeito DESC-1 em miniatura.
> **Recomendação: (a) `'pending'`.** Consequência a documentar: uma linha `'pending'` renderiza como ❌
> vermelho na UI durante os poucos segundos do envio — invisível na prática (a UI não faz polling nesse
> intervalo) e correto do ponto de vista de "ainda não confirmado".

### Padrão 6 — Limpar as chaves, nunca reatribuir o objeto (04-07, REL-04)

```js
// backend/src/agendor.js — primeira instrução de getStaleDeals
async function getStaleDeals(staleDays = 15) {
  // D-05: limpar as CHAVES, não reatribuir. `getOrgCategory` (:36) e a leitura direta
  // (:165) fecham sobre ESTA referência; `orgCategoryCache = {}` deixaria a :36
  // escrevendo em um objeto novo e a :165 lendo o antigo — ou vice-versa, dependendo
  // da ordem de captura. Também zera o `null` que o catch de erro (:43) cacheia hoje,
  // que hoje contamina todas as rodadas seguintes do processo.
  for (const k of Object.keys(orgCategoryCache)) delete orgCategoryCache[k];
  // …resto inalterado
```

### Anti-padrões a evitar

- **Reatribuir `orgCategoryCache = {}`** — quebra a leitura direta de `:165`, e a consequência é
  `EXCLUDED_CATEGORIES.includes(undefined) === false`, ou seja, **organizações excluídas voltam a ser
  notificadas**. É o risco R-7 e o golden `[101, 103]` é quem o acusa.
- **Colocar o timeout SMTP em cada call-site** — 6 lugares para divergir; D-02 manda na fábrica.
- **Colocar o timeout HTTP dentro do retry de 429** — o timeout precisa propagar, não ser retentado como
  rate-limit. `fetchDealsPage` só retenta quando `err.response?.status === 429`, e um timeout não tem
  `err.response` — o comportamento correto já é o default; **não mexer no retry**.
- **Exportar a instância `api` de `agendor.js`** — Q3 proíbe explicitamente. A rota consome `getDealById`.
- **Editar um teste existente para fazer o bump passar** — é o gatilho de parada C3. Teste vermelho sob v9
  é **informação**, não obstáculo.
- **Testar `sendMailWithRetry` com `{ code: 'ECONNRESET' }`** — caminho que o nodemailer real não produz.
  Ver Pitfall 2.
- **`npm audit fix --force`** — arrastaria `node-cron` 3→4 e `vite` 5→8 junto, que são explicitamente
  `sec-02`/fora de escopo.

---

## Don't Hand-Roll

| Problema | Não construir | Usar em vez disso | Por quê |
|---|---|---|---|
| Timeout de requisição HTTP | `Promise.race` com `setTimeout` em volta de cada `api.get` | Opção `timeout` do próprio axios (D-01) | O axios aborta o socket subjacente; um `Promise.race` só abandona a promise — a conexão TCP fica pendurada e continua consumindo o event loop e o file descriptor |
| Timeout de sessão SMTP | Timer manual em volta de `transporter.sendMail` | `connectionTimeout` / `greetingTimeout` / `socketTimeout` (D-02) | São três fases distintas (TCP, banner 220, inatividade). Um único timer externo não distingue "servidor não responde ao connect" de "servidor engasgou no meio do DATA" — e o socket continua aberto |
| Retry com backoff | Nova dependência (`p-retry`, `async-retry`) | Os loops manuais já existentes (`fetchDealsPage`, `sendMailWithRetry`) | Padrão estabelecido do projeto (04-CONTEXT §Established Patterns) e o contrato manda **não** alterar a semântica de retry |
| Invalidação de cache | TTL com timestamp por chave | Limpeza no início de `getStaleDeals` (D-05) | Um TTL muda o **formato** do valor guardado (string → objeto) e quebra a leitura direta de `:165` — a análise estrutural está em 04-CONTEXT D-05 |
| Cliente HTTP para um único deal | `axios.get` avulso com header refeito (o que existe hoje) | `getDealById` na instância compartilhada (Q3) | O ponto órfão de `notifications.js:220` é exatamente a razão de REL-01 ter dois pontos; centralizar impede que reapareça |
| Fake de servidor SMTP/HTTP nos testes | Servidor local lento, `nock`, `msw` | `installFakeAxios` + `mock.method(nodemailer, 'createTransport')` | Já existem no repositório, rodam sub-segundo e não dependem de porta livre nem de rede |
| Fake timers | `sinon` | `mock.timers` do `node:test` | Nativo desde o Node 20; já usado em `agendor.futureTasks.test.js:72` |

**Insight central:** nesta fase, quase toda "solução customizada" que aparece como tentação é uma
**reimplementação pior de algo que a biblioteca já faz na camada certa do socket** — e o modo de falha da
versão caseira é sempre o mesmo: a operação parece cancelada para o código, mas o recurso continua ocupado.

---

## Inventários exigidos pelo contrato

### Inventário A — consumidores do campo `status` de `notification_log` (04-06 / R-13)

**Escritores** (3, não 2):

| # | Local | O que grava hoje | Muda no 04-06? |
|---|---|---|---|
| A1 | `scheduler.js:113` (`logNotification`) | `'sent'` **antes** de enviar | **SIM** — passa a status não-confirmado + update pós-envio |
| A2 | `scheduler.js:144` (`logNotification` no catch) | insere uma **SEGUNDA** linha `'error'` | **SIM** — vira UPDATE da linha existente |
| A3 | **`routes/notifications.js:94`** (`POST /test-card`) | `'sent'` **antes** de enviar | ⚠️ **NÃO, pelo escopo do contrato** — ver Open Question 1 |

**Leitores que filtram `status = 'sent'`** (4):

| # | Função (`db.js`) | Rota | Consumidor final | Efeito do 04-06 |
|---|---|---|---|---|
| A4 | `alreadyNotifiedToday` (`:228`) | — | `scheduler.js:92` (dedup) e `runCheckOnly` (`:303`, campo `alreadyNotifiedToday`) | **É o conserto**: envio falho deixa de bloquear a rodada seguinte |
| A5 | `getNotificationStats` (`:274, :279, :284`) | `GET /api/notifications/status` | `Dashboard.jsx:48` → `totalSent`, `totalClicked`, `clickRate`, `lastSentAt` | Contadores **caem** para o número real de envios confirmados. Correção, não regressão |
| A6 | `getNotifiedDealIds` (`:307`) | `GET /api/notifications/notified-deals` | `DealsList.jsx:64,76` (badge "já notificado") | Deals cujo envio falhou **saem** do mapa — passam a aparecer como não notificados, que é a verdade |
| A7 | `getNotifiedDeals` (`:324`) | `GET /api/notifications/resolved` | `NotificationHistory.jsx:26`; **é também a lista de entrada do `/resolved` que o 04-03 altera** | Lista **encolhe**. Nota de sequência: 04-03 (que troca o cliente HTTP dessa rota) roda **antes** do 04-06 (que muda o que alimenta a lista) — o teste de shape do 04-03 é feito sobre a semântica antiga e continua válido |

**Leitor sem filtro** (1):

| # | Função | Rota | Consumidor | Efeito |
|---|---|---|---|---|
| A8 | `getNotificationLogs` (`:210`, `SELECT *`) | `GET /api/notifications` | `NotificationHistory.jsx:306` e `Dashboard.jsx:447` — **ambos** renderizam `log.status === 'sent' ? <CheckCircle/> : <XCircle/>` | Linhas de falha passam de ✅ verde (mentira) para ❌ vermelho (verdade). **Nenhuma mudança de frontend é necessária** — o ramo `else` já existe e já trata qualquer status ≠ `'sent'` |

**Não-leitores (verificados, contrariando a suspeita do contrato):**

- **`routes/track.js`** — usa `getLogById` e `recordClick`; **não lê `status`**. O redirect de clique
  funciona por `log.web_url`, independentemente do status. **O 04-06 não afeta o tracking.** O risco R-13
  se estreita: os consumidores afetados são A5-A8, todos de leitura/exibição, todos já tolerantes.
- **`routes/reports.js`** — não importa nada de `notification_log` (só `getWeeklySnapshots`).
- **`db.js:295 getClickedDealIds`** — filtra `clicked_at`, não `status`; e é **código morto** (ver Achado 4).

**Conclusão do inventário A:** o 04-06 exige **zero mudanças de frontend** e **zero mudanças em `track.js`**.
O que ele exige é que o SUMMARY registre explicitamente que A5/A6/A7 passam a devolver números menores, e
que essa queda é o conserto — para que ninguém a confunda com regressão em C5.

### Inventário B — consumidores de `getDealsWithFutureTasks` e `runCheckOnly` (04-02)

**`getDealsWithFutureTasks` — 3 consumidores** (o contrato §7 lista 2):

| # | Local | Uso do `Set` | Efeito do fail-safe (Q2) |
|---|---|---|---|
| B1 | `scheduler.js:57` (`runCheck`, dentro do `Promise.all`) | **Decisão de segurança** — `staleDeals.filter(d => !futureTasks.has(d.id))` (`:61`) decide quem é notificado | **É a razão de existir do Q2.** `Promise.all` rejeita → catch de `:171` registra → `finally` de `:174` libera o lock → rodada termina com 0 notificações |
| B2 | `scheduler.js:293` (`runCheckOnly`, `Promise.all`) | Mesmo filtro, **sem envio** (`:298`) | Passa a lançar. `POST /api/notifications/check` (`routes/notifications.js:35-42`) já tem try/catch → responde **500 `{error}`** |
| B3 | ⚠️ **`routes/deals.js:17`** (`GET /api/deals/stale`, `Promise.all`) | **Apenas decorativo** — `hasFutureTask: futureTasks.has(deal.id)` (`:23`), um badge na tabela; **não filtra nada** | Passa a lançar → o catch de `:31` responde **500 `{error}`**. A aba "Negócios" inteira deixa de carregar |

> **B3 não estava no contrato.** É o achado mais relevante desta pesquisa para o 04-02.
> `DealsList.jsx:80` já trata (`if (d.error) throw new Error(d.error)` → mensagem de erro na UI), então
> **nada quebra em silêncio** — mas a decisão precisa ser tomada de propósito. Ver Open Question 2.

**`runCheckOnly` — 1 consumidor:**

| Local | Cadeia até o usuário |
|---|---|
| `routes/notifications.js:37` (`POST /api/notifications/check`) | `Dashboard.jsx:63-82` `checkOnly()` → botão "Verificar agora" |

**`runCheck` — 2 consumidores:**

| Local | Cadeia até o usuário |
|---|---|
| `scheduler.js:266` (`cron.schedule(schedule, runCheck)`) | Execução diária às 8h, `America/Sao_Paulo` |
| `routes/notifications.js:47` (`POST /api/notifications/run`) | `Dashboard.jsx:84-106` `sendNow()` → botão "Enviar agora" |

**Achado de UX embutido no inventário B** (medido em `Dashboard.jsx:63-82`): o `catch` de `checkOnly()`
só dispara em erro de rede/JSON. Numa resposta **500 com corpo JSON** — exatamente o que o Q2 passa a
produzir — `r.json()` **resolve**, `result.total` fica `undefined`, o `if` é pulado, e o
`toast.success(...)` **executa mesmo assim**, exibindo em verde:
`"undefined negócio(s) parado(s) encontrado(s)"`. É um defeito pré-existente do frontend que o Q2 torna
**alcançável**. Ver Open Question 3.

---

## Common Pitfalls

### Pitfall 1 — O código de erro de timeout do axios é `ECONNABORTED`, não `ETIMEDOUT`

**O que dá errado:** o teste do 04-03 assere `err.code === 'ETIMEDOUT'` e nunca passa; ou o código de
produção classifica timeout por `ETIMEDOUT` e nunca acerta.
**Por que acontece:** o adaptador HTTP do axios só emite `AxiosError.ETIMEDOUT` quando
`transitional.clarifyTimeoutError` está ligado — **o default é desligado**, e a ternária de
`lib/adapters/http.js:910` cai em `AxiosError.ECONNABORTED`. A mensagem é
`timeout of 15000ms exceeded`. [VERIFICADO: leitura de `backend/node_modules/axios/lib/adapters/http.js:901-910`]
**Como evitar:** asserir por `ECONNABORTED` **ou** pela mensagem; melhor ainda, testar o que realmente
importa — que o `axios.create` recebeu `timeout: 15000` — sem depender de um timeout real.
**Sinal de alerta:** teste de timeout que espera de verdade em vez de inspecionar a configuração.

### Pitfall 2 — O nodemailer **sobrescreve** `err.code`, e o ramo `ECONNRESET` do retry só dispara pela mensagem

**O que dá errado:** o teste do 04-04 simula `{ code: 'ECONNRESET' }` e passa; em produção um reset real de
conexão **não** é retentado — ou pior, o inverso: alguém "simplifica" a condição de mensagem achando que é
redundante, e quebra o único caminho que de fato funciona.
**Por que acontece:** `_formatError` faz `if (type && type !== 'Error') err.code = type;`
(`lib/smtp-connection/index.js:812-814` no v6.10.1, `:941-943` no v9.0.4 — **idêntico**). O listener de
socket é `this._onSocketError = error => this._onError(error, 'ESOCKET', false, 'CONN')` (v6:196, v9:225).
Ou seja: um `Error` nativo do Node com `code: 'ECONNRESET'` chega ao `sendMailWithRetry` com
**`code: 'ESOCKET'`** — mas o objeto `Error` original é preservado, então `err.message` ainda contém
`read ECONNRESET`. A condição de `emailer.js:188`
(`err.message?.toLowerCase().includes('econnreset')`) é o que realmente captura o caso; a de `:185`
(`err.code === 'ECONNRESET'`) é efetivamente inalcançável por esse caminho.
**Como evitar:** os testes de exaustão do 04-04 devem usar erros **fiéis ao que o nodemailer produz**:
- timeout de conexão → `Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' })`
- greeting → `Object.assign(new Error('Greeting never received'), { code: 'ETIMEDOUT' })`
- socket inativo → `Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT' })`
- reset → `Object.assign(new Error('read ECONNRESET'), { code: 'ESOCKET' })`
**Sinal de alerta:** teste verde com `{ code: 'ECONNRESET' }` e nenhum caso com `ESOCKET`.
**Consequência a documentar (fora de escopo, candidata a todo):** `ESOCKET`/`ECONNECTION` **sem** as palavras
`timeout`/`econnreset` na mensagem **não são retentados** hoje. Comportamento pré-existente; D-03 manda
preservar; o contrato proíbe alterar a semântica de retry. Registrar, não consertar.

### Pitfall 3 — As esperas do retry são reais: 9 segundos por destinatário sem `mock.timers`

**O que dá errado:** o teste de exaustão do 04-04 leva ~9s (3s + 6s) e derruba o tempo total da suíte, que
hoje roda em **~0,5s**.
**Por que acontece:** `sendMailWithRetry` faz `await new Promise(r => setTimeout(r, attempt * 3000))`
(`emailer.js:191-195`).
**Como evitar:** `mock.timers.enable({ apis: ['setTimeout'] })`, **iniciar** a promise sem `await`, então
`await mock.timers.tickAsync(3000)` / `tickAsync(6000)`, e só depois `await` no resultado. Atenção: `tick()`
síncrono não deixa microtasks drenarem entre as tentativas.
**Cuidado extra:** `agendor.futureTasks.test.js:72` habilita apenas `apis: ['Date']`. Habilitar
`['setTimeout']` num teste que atravessa `getStaleDeals` também congela o
`await new Promise(r => setTimeout(r, 1000))` da paginação (`agendor.js:143`) — pode travar o teste se o
fake devolver mais de uma página. Nos testes de scheduler, faça o fake devolver `meta.totalCount ≤ 100`
para não entrar no laço de batches.
**Sinal de alerta:** duração da suíte saltando de centenas de ms para dezenas de segundos.

### Pitfall 4 — Um arquivo de teste = um processo; stubs vazam dentro do arquivo

**O que dá errado:** dois cenários que exigem stubs conflitantes (ex.: `/tasks` que resolve **e** `/tasks`
que rejeita) no mesmo arquivo — o segundo herda o estado do primeiro, ou o `require` cacheado impede o
re-stub.
**Por que acontece:** `node --test` isola por **arquivo**, não por `test()`. `agendor.js` cria a instância
axios no load e o `require` é cacheado no processo.
**Como evitar:** o `routeHandler` do `installFakeAxios` é uma função — ramifique **dentro dela** por uma
variável mutável do arquivo (`let tasksDeveFalhar = false`), em vez de reinstalar o stub. Quando isso não
bastar, **crie outro arquivo** — é a convenção estabelecida na Fase 3
(`config.bootFailFast.test.js`, `db.smtpPassMigration.clear.test.js` vs `.keep.test.js`).
**Sinal de alerta:** `mock.restoreAll()` no meio do arquivo, ou `delete require.cache[...]`.

### Pitfall 5 — `require('./setup')` depois de `process.env.DB_PATH`, mas antes de `require('../src/*')`

**O que dá errado:** o teste escreve no `backend/agendor.db` **real**, ou `secret.js` derruba o processo por
falta de `JWT_SECRET`.
**Por que acontece:** `setup.js` define `DB_PATH` **só se ausente** (`test/setup.js:18-20`) — então um
`DB_PATH` temporário definido **antes** vence; mas `SMTP_PASS`, `ADMIN_EMAIL` e `NODE_ENV` são sobrescritos
**sem guarda** (`:31-40`), então qualquer teste que precise de `SMTP_PASS` tem de defini-lo **depois** do
setup (é literalmente o que `emailer.smtpPass.test.js:16-19` documenta).
**Como evitar:** ordem canônica — (1) `makeTmpDbPath()` + `process.env.DB_PATH`; (2) `require('./setup')`;
(3) `process.env.SMTP_PASS = ...` se necessário; (4) `installFakeAxios(...)`;
(5) `require('../src/agendor')` / `require('../src/scheduler')`.
**Sinal de alerta:** `backend/agendor.db` aparecendo modificado no `git status` depois de rodar a suíte.

### Pitfall 6 — Limpar o cache no ponto errado

**O que dá errado:** a limpeza cai **depois** do `Promise.all(uniqueOrgIds.map(getOrgCategory))`
(`agendor.js:157`) e o laço de `:160-194` lê um dicionário vazio → `orgCategory` vira `null` para todos →
`EXCLUDED_CATEGORIES.includes(null) === false` → **organizações excluídas voltam a ser notificadas**.
**Por que acontece:** "limpar o cache" parece uma operação de higiene sem lugar certo.
**Como evitar:** **primeira instrução** de `getStaleDeals`, antes de `fetchDealsPage(1, …)`.
**Sinal de alerta:** o golden `assert.deepStrictEqual(ids, [101, 103])` de
`agendor.getStaleDeals.test.js:61` fica vermelho (a org 205 é `'Parceiro'`, categoria excluída). É a rede
que protege exatamente este erro — rodar a suíte depois de mexer no cache não é formalidade.

### Pitfall 7 — Código novo sem teste erode a margem do gate de cobertura

**O que dá errado:** `npm run test:coverage` sai diferente de 0 e o CI fica vermelho por cobertura, não por
comportamento.
**Por que acontece:** `.c8rc.json` tem `check-coverage: true` e `all: true`. Baseline global medido hoje:
**32 / 72.72 / 33.75 / 32** contra pisos **20 / 60 / 20 / 20**. A folga menor é a de **branches: 12,72 pontos**.
`getDealById` (+ o `?.`), `updateNotificationStatus` e os ramos novos de 04-06 adicionam branches.
**Como evitar:** cada plano entrega seus testes **no mesmo commit** da mudança de produção. Como os planos
atacam `scheduler.js` (10,65%) e `emailer.js` (7,16%), o efeito líquido esperado é de **alta** — mas rodar
`npm run test:coverage` (não só `npm test`) ao fim de **cada** plano é o que detecta a exceção.
**Sinal de alerta:** `ERROR: Coverage for branches (…%) does not meet global threshold (60%)`.

### Pitfall 8 — `npm audit fix` sem alvo arrasta o `sec-02` inteiro para dentro da fase

**O que dá errado:** o lockfile ganha mudanças em `express`, `qs`, `body-parser`, `morgan`,
`path-to-regexp`, `brace-expansion` — e o checkpoint C4 ("diff só com o pacote do bump e transitivas dele")
falha, com rollback ambíguo.
**Por que acontece:** `npm audit fix` conserta tudo o que couber sem major; **6 dos 8 advisories restantes
têm correção sem major** e entrariam de carona.
**Como evitar:** **sempre** `npm install <pacote>@<versão-alvo>`, nunca `npm audit fix`. O `npm audit`
nesta fase é **leitura**, não ação.
**Sinal de alerta:** mais de 11 entradas alteradas no lockfile do 04-03, ou qualquer entrada no do 04-05.

### Pitfall 9 — Push direto na `main` é recusado; a fase precisa de branch

**O que dá errado:** o executor tenta commitar na `main` e o push é rejeitado.
**Por que acontece:** required checks `[backend, frontend, secrets]` com `strict` + `enforce_admins: true`
(STATE.md, Fase 3). `.planning/config.json` tem `git.branching_strategy: "none"`, então **nenhuma branch é
criada automaticamente**.
**Como evitar:** criar a branch de trabalho **antes** do 04-01. Precedente da Fase 3:
`chore/phase-03-config-segredos`. Sugestão coerente: **`chore/phase-04-confiabilidade-integracoes`**.
PR draft aberto desde o 04-01, ready ao fim do 04-07, **merge commit** (contrato §14).
**Sinal de alerta:** `remote: error: GH006: Protected branch update failed`.

---

## Code Examples

### Provocar a falha da consulta crítica sem rede (04-02)

```js
// Fonte: adaptado de backend/test/agendor.futureTasks.test.js:61-67 (padrão do repositório)
// O routeHandler do fakeAxios é async: `throw` dentro dele vira rejeição da promise,
// que é exatamente o que o Promise.all de scheduler.js:54-58 precisa receber.
let tarefasDevemFalhar = false;

const fake = installFakeAxios(async (url, config) => {
  if (url === '/tasks') {
    if (tarefasDevemFalhar) {
      // Erro fiel ao que o axios produz num timeout (ver Pitfall 1)
      const e = new Error('timeout of 15000ms exceeded');
      e.code = 'ECONNABORTED';
      throw e;
    }
    return { data: { data: [] } };
  }
  if (url === '/deals') return { data: { data: [], meta: { totalCount: 0 } } };
  if (url === '/users') return { data: { data: [] } };
  return { data: { data: [] } };
});
```

### Os 5 cenários de Q2 (04-02) — esqueleto

```js
test('(1) consulta de tarefas falha -> nenhuma notificação enviada', async () => {
  tarefasDevemFalhar = true;
  const antes = enviados;                              // spy do stub de nodemailer
  const r = await runCheck();
  assert.equal(enviados, antes);                       // zero envios
  const { total } = db.getNotificationLogs({ limit: 100 });
  assert.equal(total, 0);                              // nenhuma linha nova no log
});

test('(2) o erro é registrado em results.error', async () => {
  tarefasDevemFalhar = true;
  const r = await runCheck();
  assert.ok(r.error, 'results.error deve estar preenchido');
});

test('(3) o lock é liberado mesmo com a falha', async () => {
  tarefasDevemFalhar = true;
  await runCheck();
  assert.equal(getStatus().isRunning, false);          // finally de scheduler.js:174
});

test('(4) a rodada seguinte executa normalmente', async () => {
  tarefasDevemFalhar = true;  await runCheck();
  tarefasDevemFalhar = false; const r = await runCheck();
  assert.equal(r.skipped, undefined);                  // o guard de :27 não recusou
  assert.equal(r.error, undefined);
});

test('(5) caminho feliz idêntico: deal com tarefa futura segue filtrado', async () => {
  tarefasDevemFalhar = false;
  // …fake devolve 1 deal parado + 1 tarefa futura para ele -> 0 notificações,
  //   e um segundo deal sem tarefa -> 1 notificação
});
```

### Inspecionar as opções entregues ao transporte SMTP (04-04)

```js
// Fonte: backend/test/emailer.smtpPass.test.js:38-45 (padrão já usado no repositório).
// verifySmtp() é o caminho público mais barato que passa por createTransporter(),
// sem abrir seam de teste em emailer.js.
let capturado = null;
mock.method(nodemailer, 'createTransport', (opts) => {
  capturado = opts;
  return { verify: async () => true, sendMail: async () => ({}) };
});

test('a fábrica entrega os três timeouts de D-02', async () => {
  await verifySmtp();
  assert.equal(capturado.connectionTimeout, 10000);
  assert.equal(capturado.greetingTimeout, 10000);
  assert.equal(capturado.socketTimeout, 30000);
  // PC-13: nunca imprimir `capturado` inteiro — contém auth.pass
});
```

### Inspecionar a configuração da instância axios (04-03)

```js
const axios = require('axios');
const { installFakeAxios } = require('./helpers/fakeAxios');
installFakeAxios(async () => ({ data: { data: [] } }));  // instala mock.method em axios.create
require('../src/agendor');                                // dispara o axios.create do load

test('a instância compartilhada nasce com timeout de 15s (D-01)', () => {
  const opts = axios.create.mock.calls[0].arguments[0];
  assert.equal(opts.timeout, 15000);
  assert.equal(opts.baseURL, 'https://api.agendor.com.br/v3');   // não mexeu no resto
});
```

---

## State of the Art

| Abordagem antiga | Abordagem atual | Quando mudou | Impacto neste projeto |
|---|---|---|---|
| `nodemailer` com SDK SES v2/v3 e rate limiting interno | SESv2 SDK; rate limiting/idling removidos | **7.0.0** (2025-05-03) | **Nenhum** — o projeto usa transporte SMTP puro, nunca SES [VERIFICADO: changelog + código] |
| Código de erro `'NoAuth'` | `'ENOAUTH'` | **8.0.0** (2026-02-04) | **Nenhum** — a string existe apenas em `lib/smtp-pool/index.js:632`; o projeto não passa `pool: true`, logo usa `SMTPTransport`, não `SMTPPool` [VERIFICADO: grep no fonte v6 e v9] |
| Busca de conteúdo remoto sem validar certificado TLS | Certificado validado por padrão (href/path de anexo, endpoint OAuth2, CONNECT de proxy HTTP/HTTPS) | **9.0.0** (2026-06-14) | **Nenhum** — sem anexos remotos, sem OAuth2, sem proxy. **Não confundir com o TLS do próprio servidor SMTP**, que continua governado pela opção `tls` do transporte e **não mudou** [VERIFICADO: release notes + fonte] |
| Logs de erro transitório em nível `error` | `ETIMEDOUT`/`ESOCKET`/`ECONNECTION` em nível `warn` | 7.0.13 (2026-01-27) | **Nenhum** — afeta só o logger interno do nodemailer, que o projeto não configura (default desligado) [VERIFICADO: `v9 lib/smtp-connection/index.js:921-926`] |
| `axios` sem `https-proxy-agent` na árvore | `axios@1.19.0` depende de `https-proxy-agent ^5.0.1` e `agent-base` | 1.18.0/1.19.0 | Lockfile ganha 6 entradas — **esperado**, ver aviso de C4 [VERIFICADO: simulação isolada] |
| `axios` com `proxy-from-env ^1.1.0` | `^2.1.0` | 1.19.0 | Transitiva do bump; parte do conjunto de correções de bypass de `NO_PROXY` [VERIFICADO] |

**Depreciado / desatualizado no projeto (registrar, não consertar aqui):**

- `nodemailer` 6.x — fim de linha para correções de segurança; o advisory `GHSA-rcmh-qjqh-p98v` (DoS no
  addressparser, **HIGH**) lista `org.webjars.npm:nodemailer` `<= 6.10.1` com `first_patched_version: null`.
  Ou seja: **não há correção dentro do 6.x** — o major é obrigatório, não opcional. [VERIFICADO: GitHub Advisory API]
- `axios` `^1.7.2` no `package.json` resolvendo para 1.13.6 — o caret já permitia subir; o lockfile é que
  segurava. O bump precisa alterar **os dois** (spec + lock).

---

## Runtime State Inventory

> Fase de mudança de comportamento com efeito em dado persistido (04-06). Aplicável.

| Categoria | Itens encontrados | Ação necessária |
|---|---|---|
| **Dados armazenados** | `backend/agendor.db` → tabela `notification_log`. Linhas históricas gravadas com `status='sent'` cujo envio **de fato falhou** são indistinguíveis das bem-sucedidas — o dado que provaria a diferença nunca foi gravado. Além disso, o caminho de exceção deixou **pares de linhas** (uma `'sent'` + uma `'error'` para o mesmo `deal_id` no mesmo dia). | **Somente edição de código — nenhuma migração de dados.** Não há como reclassificar retroativamente sem informação que não existe. Efeito prático: as linhas antigas continuam contando como enviadas em A5/A6/A7 e continuam deduplicando em A4 pelo dia em que foram criadas — o que é inócuo, porque a dedup é por **data**, e as datas já passaram. **O planner deve declarar isso explicitamente no PLAN do 04-06** para que C5 não cobre uma migração. |
| **Config de serviço vivo** | Nenhum. Não há n8n, Datadog, Cloudflare, Tailscale nem qualquer serviço externo com configuração fora do git. O único serviço externo é a API Agendor (só leitura) e o servidor SMTP (só envio) — nenhum dos dois guarda estado deste projeto. | Nenhuma. |
| **Estado registrado no SO** | `ecosystem.config.js` (PM2, app `agendor-backend`) existe no repositório, mas **não existe servidor de produção** — confirmado pelo usuário em 2026-07-30 e registrado no todo `ops-01`. Nada registrado em launchd/cron/Task Scheduler nesta máquina. | Nenhuma nesta fase. `ops-01` (Fase 8) cobre o primeiro deploy. |
| **Segredos e variáveis de ambiente** | Nenhuma variável muda de nome. `AGENDOR_TOKEN` continua lido em `agendor.js:4` (`getDealById` usa a mesma instância, então **não** relê o token — pelo contrário, o 04-03 **remove** a segunda leitura de `routes/notifications.js:203`). `SMTP_PASS` continua lido em `emailer.js:19`. `backend/.env` e `backend/.env.example` **não mudam**. | Nenhuma. ⚠️ Mas: `envExample.test.js` valida que `.env.example` documenta **exatamente** as `process.env.*` lidas em `src/` — se o 04-03 remover a última leitura de alguma variável, esse teste acusa. **`AGENDOR_TOKEN` continua sendo lido em `agendor.js:4`**, então a remoção da leitura em `notifications.js:203` é segura. [VERIFICADO] |
| **Artefatos de build / pacotes instalados** | `backend/node_modules/axios@1.13.6` e `nodemailer@6.10.1` ficam obsoletos após os bumps. `backend/package-lock.json` é a fonte da verdade do CI (`npm ci`). | `npm install <pacote>@<alvo>` já reescreve `node_modules` e o lockfile. **Depois de cada bump, rodar `npm ls <pacote>`** para confirmar a versão resolvida (o contrato pede isso no aceite). O CI faz `npm ci` limpo — não herda estado local. |

**Pergunta canônica respondida:** depois que todos os arquivos do repositório estiverem atualizados, o único
estado de runtime remanescente é o **histórico de `notification_log`** — e ele é deliberadamente deixado como
está, porque a informação necessária para corrigi-lo retroativamente nunca foi gravada.

---

## Environment Availability

| Dependência | Requerida por | Disponível | Versão | Fallback |
|---|---|---|---|---|
| Node.js | tudo | ✓ | **v22.13.1** (via `~/bin/node`; **exige `export PATH="$HOME/bin:$PATH"`**) | — |
| npm | instalar/auditar | ✓ | 10.9.2 | — |
| Registry npm (rede) | bumps de 04-03/04-05 | ✓ | — | — |
| `node:test` + `c8` | toda a suíte | ✓ | nativo (Node ≥20) + c8 ^12 | — |
| `better-sqlite3` | testes com tmpDb | ✓ | 9.x compilado localmente | — |
| Biome | `npm run lint` | ✓ | 2.5.5 (`biome.json` na raiz) | — |
| `git` | reverts, gate de segredos | ✓ | — | — |
| `gh` CLI | PR draft/ready | ✓ | escopo `workflow` já concedido (STATE.md) | — |
| Servidor SMTP real | **nenhum plano** | ✗ | — | Não é necessário: toda a validação usa `mock.method(nodemailer,'createTransport')` |
| API Agendor real | **nenhum plano** | ✗ | — | Não é necessário: `installFakeAxios` cobre 100% da borda HTTP |
| Servidor de produção / PM2 | **nenhum plano** | ✗ | — | Fora de escopo (`ops-01`, Fase 8) |
| `slopcheck` | auditoria de pacotes | ✓ (instalado nesta sessão) | 0.6.1, em `~/Library/Python/3.9/bin` | ⚠️ **Usar `scan`, nunca `install`** — ver §Package Legitimacy Audit |

**Dependências ausentes sem fallback:** nenhuma. **Nenhum plano de 04-01 a 04-07 precisa de rede real,
de SMTP real ou de servidor.**

**Divergências de ambiente a registrar:** local roda Node **22.13.1**, CI roda Node **20**,
`engines` declara `>=20`, e o alvo de produção do `deploy/instalar.sh` é NodeSource **22.x**. Os quatro são
compatíveis; nenhum plano introduz API dependente de versão. O gate real continua sendo o CI (Node 20).

---

## Validation Architecture

`workflow.nyquist_validation: true` → seção obrigatória.

### Test Framework

| Propriedade | Valor |
|---|---|
| Framework | `node:test` nativo (Node ≥20) + `c8` ^12 para cobertura |
| Arquivo de config | `backend/.c8rc.json` (gate) · `backend/test/setup.js` (neutralização de ambiente) |
| Comando rápido | `export PATH="$HOME/bin:$PATH" && cd backend && npm test` (~0,5s, 78 testes) |
| Suíte completa + gate | `export PATH="$HOME/bin:$PATH" && cd backend && npm run test:coverage` |
| Lint | `cd backend && npm run lint` (Biome; exit 0, 45 warnings de baseline) |
| Unidade de isolamento | **um arquivo = um processo** (PC-6) |

### Mapa Requisito → Teste

| Req | Comportamento a provar | Tipo | Comando automatizado | Arquivo existe? |
|---|---|---|---|---|
| **REL-03** | Falha na borda → `runCheck` resolve com `results.error`, não relança | caracterização | `npm test -- test/scheduler.resilience.test.js` | ❌ Wave 0 |
| REL-03 | `isRunning === false` após a falha (o `finally` de `:174` liberou) | caracterização | idem | ❌ Wave 0 |
| REL-03 | 2ª execução após falha roda (o guard de `:27` não recusou) | caracterização | idem | ❌ Wave 0 |
| REL-03 | Chamada concorrente devolve `{ skipped: true }` | caracterização | idem | ❌ Wave 0 |
| REL-03 | `runWeeklySummary` resolve sem lançar | caracterização | idem | ❌ Wave 0 |
| **REL-06** | Falha em `/tasks` → **0 envios** e **0 linhas** novas no `notification_log` | novo fluxo | `npm test -- test/scheduler.failsafe.test.js` | ❌ Wave 0 |
| REL-06 | Falha em `/tasks` → `results.error` preenchido | novo fluxo | idem | ❌ Wave 0 |
| REL-06 | Falha em `/tasks` → `getStatus().isRunning === false` | novo fluxo | idem | ❌ Wave 0 |
| REL-06 | Rodada seguinte executa normalmente | novo fluxo | idem | ❌ Wave 0 |
| REL-06 | Caminho feliz idêntico: deal com tarefa futura segue filtrado | regressão | idem + `test/agendor.futureTasks.test.js` | ⚠️ parcial (existe; **não** pina o catch — Achado 1) |
| REL-06 | `POST /api/notifications/check` → 500 `{error}` quando `/tasks` falha | novo fluxo | idem (ou arquivo de rota) | ❌ Wave 0 |
| REL-06 | **`GET /api/deals/stale` → 500 `{error}` quando `/tasks` falha** (consumidor B3) | novo fluxo | idem | ❌ Wave 0 — **exigido pelo Achado 3** |
| **REL-01** | `axios.create` recebe `timeout: 15000` (e `baseURL`/`headers` intactos) | unitário | `npm test -- test/agendor.timeout.test.js` | ❌ Wave 0 |
| REL-01 | `getDealById` chama a **instância** (não `axios.get` global) | unitário | idem | ❌ Wave 0 |
| REL-01 | Timeout **não** entra no retry de 429 (propaga; sem `err.response`) | caracterização | idem | ❌ Wave 0 |
| REL-01 | `/resolved` preserva o shape (`resolved`, `pending`, `totalNotified`, `resolvedCount`, `pendingCount`, `resolvedRate`) **e** `dealStatus` | regressão | `npm test -- test/notifications.resolved.test.js` | ❌ Wave 0 |
| REL-01 | `/resolved` com item que falha → deal mantido como **não-resolvido**, rota ainda 200 | regressão | idem | ❌ Wave 0 |
| REL-01 | Suíte verde antes **e** depois do bump de axios | regressão | `npm run test:coverage` | ✅ existe |
| **REL-02** | Transporte recebe `connectionTimeout`/`greetingTimeout`/`socketTimeout` de D-02 | unitário | `npm test -- test/emailer.timeout.test.js` | ❌ Wave 0 |
| REL-02 | Exaustão das 3 tentativas → `{ success: false }` **sem lançar** | caracterização | idem (com `mock.timers`) | ❌ Wave 0 |
| REL-02 | Sucesso após 1 falha → pina a recriação do transporter (`emailer.js:197`) | caracterização | idem | ❌ Wave 0 |
| REL-02 | Retorno por destinatário `{ to, success, error? }` inalterado | regressão | idem | ❌ Wave 0 |
| REL-02 (dep) | Suíte verde sob `nodemailer@9.0.4` **sem editar nenhum teste** | regressão | `npm run test:coverage` | ✅ existe — **pré-verificado nesta pesquisa** |
| **REL-05** | Sucesso confirmado mantém `'sent'` | novo fluxo | `npm test -- test/notificationStatus.test.js` | ❌ Wave 0 |
| REL-05 | Exceção após esgotar tentativas → `'error'`, **sem linha `'sent'` órfã** (exatamente 1 linha) | novo fluxo | idem | ❌ Wave 0 |
| REL-05 | `{ success:false }` em **todos** os destinatários → `'error'` | novo fluxo | idem | ❌ Wave 0 |
| REL-05 | `alreadyNotifiedToday` **não** bloqueia quando o registro anterior é `'error'` | novo fluxo | idem (tmpDb) | ❌ Wave 0 |
| REL-05 | Envio concluído continua bloqueando duplicação no mesmo dia | regressão | idem + `test/db.dedup.test.js` | ✅ existe (dedup) / ❌ integração |
| REL-05 | **Sucesso parcial (≥1 confirmado) mantém `'sent'`** — risco R-11 | novo fluxo | idem | ❌ Wave 0 — **não está nos 5 de Q1, mas R-11 exige** |
| **REL-04** | 2 execuções com categorias diferentes → a 2ª usa a nova | unitário | `npm test -- test/agendor.cacheInvalidation.test.js` | ❌ Wave 0 |
| REL-04 | 1 chamada a `/organizations/:id` por org única **por execução** | unitário | idem | ❌ Wave 0 |
| REL-04 | Exclusão por categoria intacta — golden `[101, 103]` | regressão | `npm test -- test/agendor.getStaleDeals.test.js` | ✅ existe |
| **todos** | Cobertura ≥ pisos (20/20/20/**60**) e lint exit 0 | gate | `npm run test:coverage && npm run lint` | ✅ existe |

### Sampling Rate

- **Por commit de task:** `cd backend && npm test` (~0,5s) — **e** `npm run lint`.
- **Ao fim de cada plano:** `cd backend && npm run test:coverage` (gate de cobertura).
- **Antes e depois de cada bump** (04-03, 04-05): `npm run test:coverage` + `npm ls <pacote>` +
  `npm audit` (registrar a saída no SUMMARY).
- **Gate de fase:** suíte completa verde + lint 0 + CI com os 3 jobs verdes, antes de `/gsd-verify-work`.

### Lacunas de Wave 0

- [ ] `backend/test/scheduler.resilience.test.js` — REL-03 (04-01)
- [ ] `backend/test/scheduler.failsafe.test.js` — REL-06 (04-02), **incluindo os consumidores B2 e B3**
- [ ] `backend/test/agendor.timeout.test.js` — REL-01 (04-03)
- [ ] `backend/test/notifications.resolved.test.js` — REL-01, shape da rota (04-03)
- [ ] `backend/test/emailer.timeout.test.js` — REL-02 (04-04)
- [ ] `backend/test/notificationStatus.test.js` — REL-05 (04-06)
- [ ] `backend/test/agendor.cacheInvalidation.test.js` — REL-04 (04-07)
- [ ] *(opcional, aditivo)* fazer `installFakeAxios` devolver também os argumentos de `axios.create`, para
      o 04-03 inspecioná-los sem alcançar o mock global. **Mudança compatível** — o retorno atual é um
      objeto, basta acrescentar uma chave.

**Instalação de framework necessária:** **nenhuma.** `node:test` e `c8` já estão configurados e verdes.

---

## Security Domain

`security_enforcement` não está definido em `.planning/config.json` (ausente = habilitado).

### Categorias ASVS aplicáveis

| Categoria ASVS | Aplica | Controle padrão nesta fase |
|---|---|---|
| V2 Authentication | não | Auth é Fase 6. Nenhum plano toca `middleware/auth.js` nem `routes/auth.js` |
| V3 Session Management | não | JWT em `localStorage` está explicitamente diferido (Fase 6) |
| V4 Access Control | não | `requireAdmin` fail-open é Fase 6 |
| V5 Input Validation | **parcial** | `getDealById(id)` recebe `d.deal_id`, que vem do **próprio banco** (`getNotifiedDeals`), não do usuário — a rota `/resolved` não aceita id de query. Sem nova superfície de entrada. Manter assim: **não** aceitar `id` do request em `getDealById` |
| V6 Cryptography | não | Nenhum plano toca hashing, tokens ou TLS. ⚠️ **Não** desativar `tls.rejectUnauthorized` ao lidar com o breaking change de nodemailer 9 — ele não afeta este projeto (§State of the Art) |
| **V7 Error Handling & Logging** | **sim** | Novas mensagens de erro **nunca** podem conter `SMTP_PASS`, `AGENDOR_TOKEN` ou corpo de e-mail (PC-13). O `error` agregado gravado em `notification_log` pelo 04-06 vem de `err.message` do nodemailer — verificar que não embute credenciais (`EAUTH` produz `Invalid login`, sem a senha) |
| **V12 Communication** | **sim** | Timeouts (D-01/D-02) são controles de disponibilidade; o bump de axios fecha SSRF via bypass de `NO_PROXY` e o de nodemailer fecha "e-mail para domínio não intencionado" |
| **V14 Configuration** | **sim** | Bumps individuais com lockfile revisado (C4); `npm audit` re-medido antes/depois com os restantes registrados no `sec-02` |

### Padrões de ameaça conhecidos para esta stack

| Padrão | STRIDE | Mitigação padrão | Estado nesta fase |
|---|---|---|---|
| SSRF via bypass de normalização de `NO_PROXY` (axios ≤1.17.0) | Information Disclosure | Atualizar para ≥1.18.0 | **Fechado pelo 04-03** (`^1.19.0`) |
| Prototype pollution → sequestro de requisição / roubo de credencial (axios) | Tampering / Elevation | Atualizar | **Fechado pelo 04-03** |
| Vazamento de `Proxy-Authorization` em redirect HTTP→HTTPS (axios) | Information Disclosure | Atualizar | **Fechado pelo 04-03** |
| Injeção de CRLF em multipart (`form-data` 4.0.0-4.0.5) | Tampering | Transitiva do axios | **Fechado pelo 04-03** (4.0.6) |
| E-mail entregue a domínio não intencionado (nodemailer <7.0.7) | Spoofing | Atualizar | **Fechado pelo 04-05** |
| Injeção de comando SMTP via `envelope.size` / CRLF em `name` / headers `List-*` | Tampering | Atualizar | **Fechado pelo 04-05** |
| DoS por recursão no `addressparser` (nodemailer ≤7.0.10) | DoS | Atualizar — **sem correção dentro do 6.x** | **Fechado pelo 04-05** |
| Leitura arbitrária de arquivo / SSRF via opção `raw` (nodemailer ≤9.0.0) | Information Disclosure | ≥9.0.1 | **Fechado pelo 04-05** |
| Exaustão de recurso por dependência externa lenta (sem timeout) | **DoS** | Timeouts explícitos em toda borda de saída | **REL-01 + REL-02** — é o núcleo da fase |
| Falha silenciosa de controle de segurança (proteção parcial por tarefa futura) | **Repudiation / lógica** | Fail-safe: completo ou exceção | **REL-06** |
| Redirect aberto no tracking de clique | Tampering | Allowlist de domínio `*.agendor.com.br` | **Já existe** (`routes/track.js:7-14`) — **não regredir**; o 04-06 não toca esse caminho |
| ReDoS via múltiplos parâmetros de rota (`path-to-regexp`) | DoS | Atualizar Express | **Fora de escopo** — registrado no `sec-02` |
| Log forging via caracteres de controle (`morgan`) | Repudiation | Atualizar | **Fora de escopo** — registrado no `sec-02` |

---

## Assumptions Log

| # | Alegação | Seção | Risco se estiver errada |
|---|---|---|---|
| A1 | `nodemailer@9.0.4`, publicada **hoje (2026-08-04)**, é estável o suficiente para produção. Todos os advisories já estariam fechados em 9.0.1; a escolha da mais recente segue o contrato, não uma medição de estabilidade. | Standard Stack | Um defeito de 9.0.4 no caminho de codificação MIME (o delta 9.0.3→9.0.4 é todo em `mime-funcs`/`mime-node`) afetaria assuntos com emoji/acento, que este projeto usa. Mitigação: 9.0.3 é o fallback de rollback intermediário; C3 é o ponto de decisão |
| A2 | `axios@1.19.0` (publicada 2026-07-29, ~6 dias) não introduz regressão além do coberto pela suíte. | Standard Stack | A suíte cobre a borda HTTP com stub — ela **não** exercita o adaptador real do axios. Um defeito no adaptador não seria detectado por teste; só em execução real contra a API Agendor. Mitigação: 1.18.0/1.18.1 também são limpas |
| A3 | O `'pending'` recomendado como status inicial do 04-06 não quebra nenhum consumidor. | Padrão 5 | Baseada no inventário A (completo e verificado): todos os leitores filtram `= 'sent'` ou renderizam o `else`. Risco residual: uma consulta ad-hoc futura que assuma o domínio `{'sent','error'}` |
| A4 | O `catch` por item de `/resolved` continua absorvendo a falha depois da troca por `getDealById`. | Padrão 3 | Se `getDealById` lançar de um jeito que escape do `catch` do `.map` (não deve — é `async` dentro de `Promise.all` com try/catch interno), a rota inteira passaria a 500. **Coberto pelo teste de shape do 04-03**, que é obrigatório |
| A5 | A suíte verde sob v9 é evidência **fraca** para o caminho de envio, porque `emailer.js` tem 7,16% de cobertura. | Summary | Se o planner tratar "78 verdes sob v9" como prova suficiente e enxugar os testes do 04-04, o major entra sem oráculo real. **O contrato já prevê isso** (04-05 depende duramente do 04-04) — a suposição aqui é que essa dependência será respeitada |
| A6 | O breaking change de TLS do nodemailer 9.0.0 não afeta a conexão ao servidor SMTP. | State of the Art | Baseada no texto do release ("fetching remote content") e no fonte. Se um servidor SMTP com certificado autoassinado estivesse em uso, o comportamento poderia mudar por outro caminho. **Não verificável sem o SMTP real** — C3 deve confirmar com um `test-smtp` manual, se possível |
| A7 | Não existe consumidor externo (script, integração) lendo `notification_log` fora do código deste repositório. | Inventário A | Um consumidor externo que filtre `status='sent'` veria a contagem cair. Nenhum indício de existência; o banco é local e o backup é cópia bruta do arquivo |

---

## Open Questions (RESOLVED — decisões humanas de 2026-08-04, incorporadas aos PLANs)

> Todas as 5 perguntas foram respondidas pelo usuário em 2026-08-04, seguindo as recomendações:
> (1) `/test-card` fora do 04-06 + todo · (2) 500 em `GET /api/deals/stale` aceito, com teste obrigatório (B3) ·
> (3) toast verde do Dashboard vira todo `ui-01`, não é consertado nesta fase · (4) status inicial `'pending'` no 04-06 ·
> (5) extensão aditiva do `installFakeAxios` adotada no 04-03. Os planos 04-02, 04-03 e 04-06 citam cada decisão.

### 1. (RESOLVED) `POST /api/notifications/test-card` grava `'sent'` antes de enviar — o mesmo defeito DESC-1, fora do escopo declarado

- **O que se sabe:** `routes/notifications.js:87-99` insere `status: 'sent'` **antes** do
  `sendStaleNotification` da linha 101, exatamente como `scheduler.js:113`. Se o envio de teste falhar, fica
  uma linha `'sent'` mentirosa no log, que entra em `getNotificationStats` (A5) e no histórico (A8).
  [VERIFICADO: leitura do código]
- **O que não está claro:** o contrato §11 restringe o diff do 04-06 a "`scheduler.js` + helper em `db.js` +
  testes". `test-card` não está listado — nem como incluído, nem como deliberadamente excluído.
- **Recomendação:** **manter fora do 04-06** (fidelidade ao contrato e ao rollback atômico), mas o PLAN do
  04-06 deve **declarar a exclusão por escrito**, e o SUMMARY deve abrir um todo
  (`rel-05b-test-card-status`). O impacto é baixo: é um endpoint de teste manual, com `deal_id` tipicamente
  `0`, disparado por um humano que vê o resultado na hora. **Decidir em C1.**

### 2. `GET /api/deals/stale` (consumidor B3) passa a devolver 500 quando `/tasks` falha — aceitar ou isolar?

- **O que se sabe:** `routes/deals.js:17` chama `getDealsWithFutureTasks` dentro de um `Promise.all` e usa o
  `Set` **apenas como badge decorativo** (`hasFutureTask`, `:23`), sem filtrar nada. Com o rethrow do Q2, a
  aba "Negócios" inteira deixa de carregar quando `/tasks` falha. `DealsList.jsx:80` trata o erro
  corretamente (mostra mensagem), então não há falha silenciosa. [VERIFICADO]
- **O que não está claro:** o contrato §7 documenta o efeito colateral em `runCheckOnly`, mas **não menciona
  `routes/deals.js`**. A justificativa do fail-safe ("proteção parcial pode notificar indevidamente") **não
  se aplica** a B3, que não envia nada.
- **Recomendação:** **aceitar o 500** — é a opção coerente com "mudança mínima, sem refatoração" (PC-1/PC-3),
  o rollback continua sendo um único revert, e o frontend já trata. Um `try/catch` local em `deals.js`
  reintroduziria o parcial silencioso justamente no lugar de onde ele está sendo removido. **Mas o teste do
  cenário B3 é obrigatório** e a linha do inventário tem de constar do PLAN (DoD do contrato §18).
  **Decidir em C1.**

### 3. Toast verde mentiroso no Dashboard quando `/check` devolve 500

- **O que se sabe:** `Dashboard.jsx:63-82` — o `catch` só pega erro de rede/JSON. Com resposta 500 e corpo
  JSON, `r.json()` resolve, `result.total` fica `undefined`, o `if` da linha 70 é pulado, mas o
  `toast.success` da linha 74 **executa**, exibindo em verde
  `"undefined negócio(s) parado(s) encontrado(s)"`. Defeito pré-existente que o Q2 torna alcançável.
  [VERIFICADO: leitura do código]
- **O que não está claro:** UI está explicitamente fora do escopo desta fase (04-CONTEXT §Phase Boundary).
- **Recomendação:** **não consertar aqui.** Abrir todo (`ui-01-toast-de-erro-no-check`, prioridade média) e
  registrar no SUMMARY do 04-02 como consequência conhecida. O `sendNow()` (`:84-106`) tem o análogo mais
  brando — mostra "0 notificação(ões) enviada(s) de 0 negócio(s)" numa rodada abortada, porque `runCheck`
  nunca lança. Ambos merecem o mesmo todo.

### 4. Status inicial da linha em 04-06: `'pending'`, `'error'` ou manter `'sent'`?

- **O que se sabe:** a coluna é `NOT NULL DEFAULT 'sent'`; todos os leitores filtram `= 'sent'` (A4-A7) ou
  renderizam o `else` (A8); nenhum consumidor conhece um domínio fechado de valores. [VERIFICADO]
- **O que não está claro:** o contrato §11 diz "manter o insert-first" e "atualizar a mesma linha para
  `'error'`", sem nomear o valor inicial.
- **Recomendação:** **`'pending'`** — ver Padrão 5. Trava o comportamento no caso de crash do processo no
  meio do envio (a linha fica não-deduplicante e é retentada amanhã, que é o fail-safe correto).
  **Decidir em C1** e registrar no PLAN.

### 5. Ler os argumentos de `axios.create` — estender o helper ou usar o mock global?

- **O que se sabe:** `installFakeAxios` (`test/helpers/fakeAxios.js:13`) faz
  `mock.method(axios, 'create', () => fakeInstance)` e **descarta** os argumentos. Eles continuam acessíveis
  via `axios.create.mock.calls[0].arguments[0]`. [VERIFICADO]
- **Recomendação:** **estender o helper** para devolver também o que foi capturado (mudança aditiva,
  retrocompatível com os 3 arquivos de teste que já o usam). Alcançar `axios.create.mock` de dentro do teste
  funciona, mas acopla o teste ao detalhe de implementação do helper. Área de discricionariedade do Claude
  (04-CONTEXT: "forma exata dos testes de timeout"), então **não precisa de checkpoint** — só de nota no PLAN.

---

## Sources

### Primárias (confiança ALTA — medidas ou lidas nesta sessão)

- **Código do repositório** (`git status` limpo em 2026-08-04): `backend/src/agendor.js`,
  `scheduler.js`, `emailer.js`, `db.js`, `routes/{notifications,deals,track,reports}.js`,
  `frontend/src/components/{Dashboard,DealsList,NotificationHistory}.jsx`,
  `backend/test/**`, `.c8rc.json`, `package.json`, `.github/workflows/ci.yml`, `.planning/config.json`
- **Fonte do `nodemailer@6.10.1` instalado** — `backend/node_modules/nodemailer/lib/smtp-connection/index.js`,
  `lib/mailer/index.js`, `lib/smtp-transport/index.js`, `lib/smtp-pool/index.js`
- **Fonte do `nodemailer@9.0.4`** — `raw.githubusercontent.com/nodemailer/nodemailer/v9.0.4/lib/…`
  (`smtp-connection/index.js`, `mailer/index.js`, `smtp-transport/index.js`, `nodemailer.js`, `CHANGELOG.md`)
- **Fonte do `axios@1.13.6` instalado** — `lib/adapters/http.js:901-910`, `lib/core/AxiosError.js:79-80`
- **GitHub Releases API** — `api.github.com/repos/nodemailer/nodemailer/releases` (breaking changes de
  7.0.0 / 8.0.0 / 9.0.0)
- **GitHub Advisory API** — `api.github.com/advisories/{GHSA-…}` para 8 advisories de nodemailer e 28 de
  axios, com `vulnerable_version_range` e `first_patched_version` de cada
- **npm registry** — `npm view axios versions|time|dependencies|scripts`, idem nodemailer;
  `api.npmjs.org/downloads/point/last-week/{axios,nodemailer}`
- **Simulação isolada dos bumps** — cópia de `package.json`+`package-lock.json` fora do repositório,
  `npm ci` → `npm install axios@^1.19.0` → `npm install nodemailer@^9.0.4`, com diff programático dos
  lockfiles e `npm audit --json` em cada etapa
- **Execução de controle da suíte** — mesma cópia do `src/`+`test/` sob versões alvo **e** sob versões
  baseline; 6 falhas idênticas nos dois runs, todas artefatos do isolamento
- **`slopcheck` 0.6.1** — veredito `[OK]` para axios e nodemailer

### Secundárias (confiança MÉDIA)

- `.planning/phases/04-confiabilidade-das-integra-es/04-DELIVERY-CONTRACT.md` (contrato vinculante)
- `.planning/phases/04-confiabilidade-das-integra-es/04-CONTEXT.md` (D-01..D-06)
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`,
  `.planning/todos/pending/sec-02-dependency-vulnerabilities.md`
- `./CLAUDE.md` (convenções e constraints do projeto)

### Terciárias (confiança BAIXA — nenhuma)

Nenhum achado desta pesquisa depende de fonte não verificada. Todas as alegações incertas estão no
**Assumptions Log**, não apresentadas como fato.

---

## Metadata

**Confiança por área:**

| Área | Nível | Razão |
|---|---|---|
| Versões alvo e advisories | **ALTA** | `npm view` + GitHub Advisory API + simulação de bump com diff de lockfile e audit medido em cada etapa |
| Changelog nodemailer 6→9 na superfície usada | **ALTA** | Release notes oficiais **mais** comparação linha a linha do fonte das duas versões (`_formatError`, códigos de erro, opções de timeout, `sendMail`, `verify`) |
| Compatibilidade da suíte sob os bumps | **ALTA** | Execução real com **run de controle** que isola artefatos de ambiente. Ressalva honesta: `emailer.js` tem 7,16% de cobertura — a suíte é oráculo **fraco** para o caminho de envio (registrado como A5) |
| Destino do golden WR-02 | **ALTA** | Leitura completa do arquivo + relatório de cobertura apontando `agendor.js:225-227` descoberto |
| Inventários de consumidores | **ALTA** | `grep` exaustivo em `backend/src`, `backend/test` e `frontend/src`, com verificação de cada cadeia até o componente React |
| Baseline de cobertura e lint | **ALTA** | Executados nesta sessão |
| Padrões de teste reutilizáveis | **ALTA** | Lidos integralmente: `fakeAxios.js`, `tmpDb.js`, `setup.js`, `agendor.futureTasks.test.js`, `db.dedup.test.js`, `emailer.smtpPass.test.js` |
| Estabilidade de campo de `nodemailer@9.0.4` | **BAIXA** | Publicada em 2026-08-04 — sem histórico de uso. Registrado como A1 |
| Comportamento real de TLS contra o SMTP de produção | **BAIXA** | Não há SMTP real disponível para testar. Registrado como A6 |

**Data da pesquisa:** 2026-08-04
**Válido até:** ~2026-08-18 (14 dias). Advisories de npm são publicadas continuamente e `axios`/`nodemailer`
tiveram, respectivamente, 8 e 5 releases nos últimos 6 meses. **Re-medir `npm audit` no início do 04-03 e ao
fim do 04-05 é exigência do contrato — não reaproveitar os números desta pesquisa como se fossem os do
momento da execução.**

**Estado do repositório ao fim desta pesquisa:** limpo. O único efeito colateral (o `npm install` disparado
por `slopcheck install` na raiz) foi integralmente revertido — `git checkout --` em `package.json` e
`package-lock.json`, `npm prune` para a árvore de `node_modules`, e a suíte do backend reconfirmada em
**78/78 verdes**.
