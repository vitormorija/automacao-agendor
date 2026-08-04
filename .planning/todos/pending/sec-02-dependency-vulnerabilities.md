---
id: sec-02-dependency-vulnerabilities
type: todo
status: pending
priority: high
created: 2026-07-29
source: /doctor run (npm audit ao vivo em backend/ e frontend/, 2026-07-29)
resolves_phase: 4
tags: [security, dependencies, cve, npm-audit, phase-4, supply-chain]
---

# SEC-02 — Vulnerabilidades conhecidas nas dependências

**Medido ao vivo em 2026-07-29** com `npm audit` nos dois pacotes. Números mudam conforme
advisories são publicados — re-medir antes de agir.

| Pacote | Total | High | Moderate | Low |
|---|---|---|---|---|
| `backend/` | **12** | 5 | 7 | 0 |
| `frontend/` | 4 | 2 | 1 | 1 |

**Nada disso é detectado hoje:** o `.github/workflows/ci.yml` roda lint, testes e build, mas
**não roda `npm audit`**. Estas 16 advisories entraram sem nenhum sinal.

---

## Estado após a Fase 4 (medido em 2026-08-04, pós-04-05)

A Fase 4 fechou **apenas** a parte de `axios` e `nodemailer` (decisão D-06). Evolução medida do
`backend/`:

| Momento | Total | High | Moderate |
|---|---|---|---|
| Antes do 04-03 | 12 | 5 | 7 |
| Depois do bump de `axios` (04-03) | 9 | 3 | 6 |
| **Depois do bump de `nodemailer` (04-05)** | **8** | **2** | **6** |

- `axios` `^1.7.2` → **`^1.19.0`** (04-03). Saíram `axios`, `form-data` e `follow-redirects`.
- `nodemailer` `^6.9.13` → **`^9.0.4`** (04-05). Saiu `nodemailer`. Motivo do major: o advisory
  `GHSA-rcmh-qjqh-p98v` (DoS por recursão no `addressparser`, **HIGH**) tem
  `first_patched_version: null` na linha 6.x — **não existe correção dentro do 6.x**.

**Nenhum high/critical remanescente é atribuível a `axios` ou a `nodemailer`.**

### Advisories remanescentes no `backend/` — lista explícita

| Pacote | Sev. | Direto? | Advisory(ies) | Correção disponível |
|---|---|---|---|---|
| `brace-expansion` | **high** | não | GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895, GHSA-jxxr-4gwj-5jf2 | sem major |
| `path-to-regexp` | **high** | não (via Express 4) | GHSA-37ch-88jc-xwx2 (ReDoS) | sem major |
| `qs` | moderate | não | GHSA-q8mj-m7cp-5q26 | sem major |
| `express` | moderate | **sim** | — (via `qs`) | sem major |
| `body-parser` | moderate | não | GHSA-v422-hmwv-36x6 (via `qs`) | sem major |
| `morgan` | moderate | **sim** | GHSA-4vj7-5mj6-jm8m (log forging) | sem major |
| `uuid` | moderate | não (via `node-cron`) | GHSA-w5hq-g745-h8pq | **exige major `node-cron@4.6.0`** |
| `node-cron` | moderate | **sim** | — (via `uuid`) | **major 4.6.0** |

O `frontend/` **não foi tocado** pela Fase 4: `vite` 5→8, `postcss`, `esbuild` e `@babel/core`
seguem pendentes, todos devDependencies.

### O gate permanente de `npm audit` no CI segue deliberadamente adiado

Adicionar `npm audit` como status check obrigatório **agora** deixaria o CI vermelho em toda
execução por causa dos 8 advisories acima — nenhum deles corrigido nesta fase por decisão D-06.
O gate só faz sentido **depois** que o backlog restante for zerado (ou que se defina um
`--audit-level` com allowlist explícita). Continua sendo item próprio, candidato à Fase 6
(Hardening de Segurança).

### Regra operacional aprendida nas Fases 4

`npm audit fix` é **proibido** neste backlog: 6 dos 8 advisories restantes têm correção sem major
e entrariam de carona num bump isolado, contaminando o lockfile e tornando o rollback ambíguo.
Usar sempre `npm install <pacote>@<versão-alvo>`. Nesta fase o `npm audit` foi **leitura**, nunca ação.

---

## Triagem — o que importa e o que não

### Backend: runtime, chega em produção

Três destas são diretamente relevantes ao que o sistema faz, não achados genéricos:

| Severidade | Pacote | Por que importa AQUI |
|---|---|---|
| **HIGH** | `nodemailer` ^6.9.13 | *"Email to an unintended domain due to Interpretation Conflict"* — o propósito inteiro do sistema é enviar e-mail para responsáveis por negócios. Também: injeção de comando SMTP via `envelope.size` não sanitizado. |
| **HIGH** | `axios` ^1.7.2 | SSRF via bypass de normalização de `NO_PROXY`; bypass de autenticação via prototype pollution no merge de `validateStatus`. O backend usa axios para toda chamada à API Agendor. |
| **HIGH** | `path-to-regexp` <0.1.13 | ReDoS via múltiplos parâmetros de rota. Transitiva via Express 4 — atinge o roteamento HTTP. |
| HIGH | `form-data` | Injeção de CRLF via nomes de campo multipart não escapados. Transitiva via axios. |
| HIGH | `brace-expansion` | DoS por expansão exponencial. Transitiva, provavelmente só cadeia de build. |
| MODERATE | `morgan` ^1.10.1 | Log forging via caracteres de controle em `:remote-user`. O backend usa morgan no formato `combined` gravando em `logs/access.log`. |
| MODERATE | `express`, `qs`, `body-parser`, `follow-redirects`, `node-cron`, `uuid` | DoS e vazamento de header em redirect cross-domain. |

### Frontend: apenas devDependencies — risco de build, não de produção

`postcss` (HIGH), `vite` (HIGH), `esbuild` (MODERATE), `@babel/core` (LOW). **Nenhuma é
dependência de runtime** — não vão para o bundle servido ao usuário. As classes de ataque
(leitura arbitrária de arquivo via `sourceMappingURL`, dev server respondendo a qualquer site,
path traversal no `server.fs.deny`) exigem que um atacante alcance a máquina de desenvolvimento
ou o processo de build. Prioridade menor que a do backend, mas não zero em CI.

---

## Como corrigir — em duas levas, não numa só

> ⚠️ **Plano original de 2026-07-29 — parcialmente superado.** A Fase 4 (D-06) executou só
> `axios` e `nodemailer`, e **rejeitou o `npm audit fix` recomendado abaixo** (ver "Regra
> operacional aprendida" acima). Manter o texto como registro do raciocínio inicial; seguir
> a lista de remanescentes da seção "Estado após a Fase 4" ao retomar.

### Leva 1: correções sem quebra de major (baixo risco) — ⚠️ receita superada

`axios` ✅ **feito no 04-03**. `path-to-regexp`, `express`, `qs`, `body-parser`,
`brace-expansion`, `morgan`, `postcss`, `@babel/core` seguem pendentes com correção dentro da
major atual (`form-data` e `follow-redirects` saíram de carona no bump do `axios`).

```bash
# ⚠️ NÃO usar: npm audit fix agrupa todos os pendentes num lockfile só e torna o rollback ambíguo.
# Preferir um pacote por commit:
export PATH="$HOME/bin:$PATH"
cd backend && npm install <pacote>@<versão-alvo> && npm run lint && npm run test:coverage
```

A rede de testes (112 testes ao fim da Fase 4) é a proteção aqui. Se ficar verde, o risco é baixo.

### Leva 2: bumps de major — mudança de comportamento, exige teste

Três exigem salto de major e **caem sob a restrição do projeto** (`PROJECT.md`: nenhuma mudança
de comportamento entra sem teste cobrindo o novo comportamento):

| De | Para | Risco | Status |
|---|---|---|---|
| `nodemailer` ^6.9.13 | **^9.0.4** | 3 majors. É o caminho de envio de e-mail — o núcleo do produto. Exige teste do novo fluxo de envio antes de entrar. | ✅ **feito no 04-05**, com o oráculo de 9 casos criado no 04-04 (`backend/test/emailer.timeout.test.js`) |
| `node-cron` ^3.0.3 | 4.6.0 | Agendador. Uma mudança de API silenciosa aqui para o check diário sem ninguém perceber. | pendente |
| `vite` ^5.3.1 | 8.1.5 | 3 majors no bundler. Só afeta build/dev, mas pode quebrar o `vite build` que é o gate do frontend no CI. | pendente |

Estes **não** devem ir junto com a Leva 1. Um `npm audit fix --force` faria os três de uma vez
e é exatamente o que não se quer.

---

## Onde isso encaixa no roadmap

**Fase 4 — Confiabilidade das Integrações** é o lugar natural: ela já mexe em `axios` (REL-01,
timeout nas chamadas à API Agendor) e `nodemailer` (REL-02, timeout e tratamento de falha no
envio SMTP). Atualizar as duas dependências e adicionar os timeouts no mesmo trabalho evita
tocar os mesmos arquivos duas vezes — e o teste que a Leva 2 exige é essencialmente o mesmo
teste que REL-02 já pede.

**Candidato separado:** adicionar `npm audit` (ou Dependabot) ao CI, para que a próxima
advisory apareça sozinha. **Não** enxertar isso na Fase 3 — ela já está planejada e verificada,
e ampliar escopo depois do plan-checker invalida a verificação. Cabe como item próprio ou na
Fase 6 (Hardening de Segurança).

---

## Nota sobre o dado

O primeiro relato desta sessão (via agente de mapeamento) dizia "11 advisories, 4 high, frontend
limpo". A medição direta contradiz: **12/5 no backend e 4/2 no frontend, não zero**. Use os
números deste arquivo, e re-meça antes de agir — advisories são publicadas continuamente.
