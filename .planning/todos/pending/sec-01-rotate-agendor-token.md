---
id: sec-01-rotate-agendor-token
type: todo
status: pending
priority: high
created: 2026-07-29
source: 03-CONTEXT discovery (varredura de histórico git durante discuss-phase 3)
resolves_phase: 3
tags: [security, secrets, credential-exposure, phase-3, agendor-api]
---

# SEC-01 — Rotacionar o token da API Agendor (exposto em repositório público)

**Severidade:** alta — credencial de produção válida, publicamente recuperável.

## O que foi encontrado

Durante a varredura de histórico da Fase 3 (`git log --all -S`), o token real da API Agendor
(`c57f59ef-…`) foi localizado no histórico do repositório, que é **público** em
`github.com/vitormorija/automacao-agendor`.

Aparece no commit `13905d4` ("feat: automação de monitoramento de negócios parados no Agendor"),
em dois arquivos:

- `.claude/settings.local.json` — embutido em dois comandos `curl` com header
  `Authorization: Token c57f59ef-…`
- `backend/.env.example` — como `AGENDOR_TOKEN=c57f59ef-…` (valor real, não placeholder)

O commit `20509cd` ("security: remove arquivos locais com tokens do rastreamento git") removeu os
arquivos do rastreamento, mas **não do histórico**. `git show 13905d4:.claude/settings.local.json`
recupera o token em qualquer clone.

## O que NÃO resolve

**Reescrever o histórico** (`git filter-repo`, BFG) não desfaz a exposição: objetos ficam acessíveis
pela API do GitHub mesmo após deixarem de ser referenciados, forks e clones de terceiros permanecem
intactos, e não há como determinar quem já leu. Uma vez publicado, o segredo está queimado.

**Tornar o repositório privado** foi testado em 2026-07-29 e revertido. Além de não recuperar o que
já foi publicado, tem um efeito colateral que quebra a Fase 2: numa conta pessoal free, repositório
privado **não suporta nenhuma forma de gate de merge** — tanto branch protection clássica quanto
rulesets retornam `403 Upgrade to GitHub Pro`. Tornar privado desativa CI-02.

## O que resolve

**Rotacionar o token no painel da Agendor:**

1. Gerar um token novo e revogar `c57f59ef-…`.
2. Atualizar `AGENDOR_TOKEN` no `.env` de produção (`/opt/agendor/.env` ou equivalente).
3. Reiniciar o processo PM2 (`pm2 restart agendor-backend`).
4. Confirmar que a listagem de deals volta a responder (dashboard ou `/api/deals/stale`).

Depois disso, o histórico do git passa a conter apenas um segredo morto e deixa de ser um problema —
sem custo, sem reescrever histórico e sem sacrificar o gate de CI.

## ⚠ Nenhuma camada automática vai lembrar disso (medido em 2026-07-30)

O GitHub Secret Scanning foi habilitado na Fase 3, mas **não vai gerar alerta para este token**.
Motivo: dos 4 toggles, só `secret_scanning` e `secret_scanning_push_protection` ficaram ativos —
`secret_scanning_non_provider_patterns` é recusado em silêncio neste plano de conta (a API devolve
`200` e mantém `disabled`). É justamente essa regra que detectaria segredos genéricos; sem ela, o
scanning nativo só reconhece padrões de **provedores conhecidos**, e a Agendor não é um.

O job `secrets` (gitleaks) também não ajuda aqui: ele escaneia o range do PR, não o histórico.

Ou seja, esta pendência depende **inteiramente de acompanhamento humano**. Não haverá alerta, badge
ou check vermelho lembrando dela.

## Decisão registrada

Em 2026-07-29 optou-se conscientemente por **manter o repositório público e adiar a rotação**,
preservando o gate de CI-02. A exposição segue ativa até a rotação ser feita.

## Verificado como limpo (não requer ação)

- Senhas SMTP no histórico são apenas placeholders (`sua_app_password`, `sua-senha-app`).
- `backend/.env` nunca foi commitado.
- `JWT_SECRET` nunca teve valor real versionado.
- O código atual (`HEAD`) não contém nenhum segredo — a varredura só encontra ocorrências históricas.
