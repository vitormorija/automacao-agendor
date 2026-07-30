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

### Leva 1: correções sem quebra de major (baixo risco)

`axios`, `path-to-regexp`, `form-data`, `express`, `qs`, `body-parser`, `follow-redirects`,
`brace-expansion`, `morgan`, `postcss`, `@babel/core` têm correção dentro da major atual.

```bash
export PATH="$HOME/bin:$PATH"
cd backend && npm audit fix && npm run lint && npm run test:coverage
cd ../frontend && npm audit fix && npm run lint && npm run build
```

A rede de testes da Fase 1 (35 testes) é a proteção aqui. Se ficar verde, o risco é baixo.

### Leva 2: bumps de major — mudança de comportamento, exige teste

Três exigem salto de major e **caem sob a restrição do projeto** (`PROJECT.md`: nenhuma mudança
de comportamento entra sem teste cobrindo o novo comportamento):

| De | Para | Risco |
|---|---|---|
| `nodemailer` ^6.9.13 | 9.0.3 | 3 majors. É o caminho de envio de e-mail — o núcleo do produto. Exige teste do novo fluxo de envio antes de entrar. |
| `node-cron` ^3.0.3 | 4.6.0 | Agendador. Uma mudança de API silenciosa aqui para o check diário sem ninguém perceber. |
| `vite` ^5.3.1 | 8.1.5 | 3 majors no bundler. Só afeta build/dev, mas pode quebrar o `vite build` que é o gate do frontend no CI. |

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
