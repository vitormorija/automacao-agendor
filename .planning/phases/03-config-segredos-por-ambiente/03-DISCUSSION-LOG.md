# Phase 3: Config & Segredos por Ambiente — Discussion Log

**Date:** 2026-07-29
**Mode:** default (interativo)

> Registro para referência humana (auditoria/retrospectiva). **Não** é consumido pelos agentes
> downstream — estes leem `03-CONTEXT.md`.

---

## Scout prévio (antes de qualquer pergunta)

Levantamento que reformulou o desenho da fase:

- **Nenhum segredo hardcoded em `HEAD`** — busca por `c57f59ef` em `.js/.jsx/.json/.md/.sh` não
  retornou nada. Tudo vem de `process.env`. CFG-01 estava mais perto do pronto do que o roadmap sugeria.
- **Credenciais SMTP não vivem no ambiente, vivem no banco** — `backend/src/db.js:106-111` usa o env
  apenas como semente; depois `smtp_pass` fica em texto plano na tabela `config` e é editável pela UI.
- **Só `JWT_SECRET` valida no boot** — as outras 17 variáveis têm fallback silencioso (`|| ''`).
- **`.env.example` incompleto** — o código lê 18 variáveis, faltam `DB_PATH`, `LOG_LEVEL`,
  `BASE_URL_FRONTEND`.

---

## Áreas selecionadas

O usuário selecionou **todas as quatro** áreas propostas.

---

## Área 1 — Segredos SMTP: banco vs ambiente

**Pergunta:** Qual deve ser a fonte de verdade das credenciais SMTP?
- Opções: Híbrido (senha no env, resto no banco) / Tudo no ambiente / Manter no banco e documentar exceção
- **Escolha:** Híbrido → **D-01**

**Pergunta:** O que fazer com a senha já gravada no `agendor.db` de produção?
- Opções: Apagar no boot / Deixar órfão / Apagar só após confirmar que o env está setado
- **Escolha:** Apagar só após confirmar → **D-02**
- Nota: escolha mais defensiva que a recomendada. Elimina o cenário de derrubar o envio de e-mail em
  produção por `.env` esquecido, ao custo de poucas linhas.

**Pergunta:** O que a UI deve mostrar no campo de senha SMTP?
- Opções: Campo some com nota / Campo desabilitado / Você decide
- **Escolha:** Campo some com nota explicativa → **D-03**

---

## Área 2 — Escopo do fail-fast no boot (CFG-04)

**Pergunta:** Quais variáveis devem derrubar o boot se ausentes?
- Opções: Só funcionamento / Funcionamento + segurança / Todas as 18
- **Escolha:** Funcionamento + segurança → **D-04**
- Nota: inclui `ALLOWED_ORIGINS` e `ADMIN_USERS`. Registrada a fronteira com a Fase 6 — exigir a
  variável fecha o buraco por configuração, mas `requireAdmin()` continua falhando aberto no código.

**Pergunta:** A exigência deve ser a mesma em dev e produção?
- Opções: Mais frouxa em dev / Idêntica nos dois
- **Escolha:** Mais frouxa em dev → **D-05**

---

## ⚠ Interrupção — achado de segurança durante a varredura de histórico

Antes de perguntar sobre a prova de CFG-01, foi feita uma varredura real do histórico do git.
**Resultado:** o token de produção da API Agendor (`c57f59ef-…`) está no histórico de um repositório
**público**, no commit `13905d4`, em `.claude/settings.local.json` e `backend/.env.example`.

Verificado como limpo: senhas SMTP no histórico são só placeholders; `.env` nunca foi commitado;
`JWT_SECRET` nunca teve valor real versionado.

**Pergunta:** Como tratar o token exposto?
- Opções: Rotacionar agora / Tornar privado agora e rotacionar depois / Registrar para a Fase 6
- **Escolha inicial:** Tornar privado agora, rotacionar depois

**Consequência descoberta na execução:** tornar o repositório privado **desativou a branch protection**
(`403 Upgrade to GitHub Pro`). Rulesets — a API nova — também retornaram `403`. Numa conta pessoal
free, repositório privado não suporta nenhuma forma de gate de merge. CI-02, provado horas antes, foi
funcionalmente regredido.

**Pergunta:** Como resolver o conflito entre proteger o token e manter o gate?
- Opções: Rotacionar e voltar a público / Continuar privado sem gate / Assinar GitHub Pro / Voltar a
  público agora e rotacionar depois
- **Escolha:** Voltar a público agora, rotacionar depois

**Ação executada:** repositório revertido para público; branch protection reaplicada e verificada
idêntica ao estado anterior (`contexts: [backend, frontend]`, `strict: true`, `enforce_admins: true`,
`allow_force_pushes: false`). Rotação registrada como pendência de alta prioridade em
`.planning/todos/pending/sec-01-rotate-agendor-token.md`.

---

## Área 3 — Separação dev vs produção (CFG-03)

**Pergunta:** Como materializar a separação?
- Opções: Um `.env` só com `NODE_ENV` decidindo / Arquivos `.env.development`+`.env.production` /
  Dois arquivos-exemplo
- **Escolha:** Um `.env` só, `NODE_ENV` decide → **D-07**

---

## Área 4 — Prova de "zero segredos" (CFG-01)

**Pergunta:** Como garantir que nenhum segredo novo entre no repositório?
- Opções: Script próprio no CI / `gitleaks` no CI / Verificação manual ao fechar a fase
- **Escolha:** `gitleaks` no CI → **D-08**, **D-09**
- Nota: escolha divergiu da recomendada (script próprio, mais alinhado ao ethos zero-dep). Justificativa
  aceita: regras mantidas pela comunidade cobrem muito mais formatos de segredo do que uma regex caseira
  — precisamente o tipo de cobertura que teria pego o token em `.claude/settings.local.json`.

---

## Ideias adiadas

- Rotação do token da API Agendor — ação operacional, rastreada em `sec-01-rotate-agendor-token.md`.
- `requireAdmin()` falhar fechado — Fase 6.
- JWT em `localStorage` → cookie httpOnly; habilitar CSP — Fase 6.
- GitHub Pro para privado + gate — avaliado e descartado nesta sessão.

## Discricionariedade de Claude

- Formato da mensagem de erro de boot.
- Gitleaks como job próprio vs step de job existente.
- Localização do módulo de validação de config.
- Texto da nota que substitui o campo de senha no `ConfigPanel.jsx`.
