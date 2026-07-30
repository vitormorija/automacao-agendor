---
id: ops-01-validar-env-e-pm2-no-primeiro-deploy
type: todo
status: pending
priority: high
created: 2026-07-30
source: Fase 3, checkpoint do plano 03-02 declarado N/A (não existe servidor de produção)
resolves_phase: 8
tags: [deploy, ops, env, pm2, dotenv, phase-3-carryover]
---

# OPS-01 — Validar `.env` e PM2 quando existir um servidor de produção

**Contexto:** em 2026-07-30 o projeto roda **apenas localmente**. Não existe deploy em
`/opt/agendor`; `ecosystem.config.js`, `deploy/instalar.sh` e `deploy/nginx.conf` são
configuração aspiracional para um servidor que nunca foi criado.

Por isso o checkpoint bloqueante da Task 1 do plano `03-02` foi registrado como **N/A**, não como
aprovado nem como bloqueado — ninguém verificou um `.env` de produção, porque não há um. Esta
pendência existe para que essa verificação aconteça no dia em que houver servidor, em vez de se
perder.

## O que precisa ser verificado no primeiro deploy

Rodar no servidor, como o usuário que executa o PM2. **Só imprime nomes de variáveis, nunca
valores:**

```bash
cd /opt/agendor

for v in AGENDOR_TOKEN JWT_SECRET SMTP_PASS ALLOWED_ORIGINS ADMIN_USERS; do
  if grep -qE "^${v}=.+" backend/.env; then echo "OK      $v"; else echo "FALTA   $v"; fi
done

pm2 describe agendor-backend | grep -E "cwd|exec cwd"
ls -l /opt/agendor/.env /opt/agendor/backend/.env 2>&1
```

**Regra de decisão:** qualquer linha `FALTA` é um boot que morre. Com o fail-fast ligado (03-02) e
`NODE_ENV=production`, o processo se recusa a subir se faltar qualquer uma das cinco.

## Por que estas cinco, e não outras

`backend/src/config.js` é a fonte de verdade — a lista vive lá, não neste documento. Se divergirem,
o código vence. As cinco vêm de D-04: três de funcionamento (`AGENDOR_TOKEN`, `JWT_SECRET`,
`SMTP_PASS`) e duas de segurança (`ALLOWED_ORIGINS`, `ADMIN_USERS`).

## Dois riscos específicos herdados da Fase 3

**1. `SMTP_PASS` não tem mais caminho de recuperação pela interface.** O plano 03-03 fez o
`emailer.js` ler a senha **só** do ambiente, e o 03-04 removeu a chave da allowlist do
`PUT /api/config` e o campo do painel. Se `SMTP_PASS` faltar no `.env` de produção, o envio de
e-mail autentica com senha vazia e falha — e a única correção é editar o `.env` no servidor e
reiniciar o PM2. Isso já é verdade hoje com o código mesclado, independentemente do fail-fast.

**2. Pode existir um `/opt/agendor/.env` órfão.** Até a correção do 03-01, `backend/src/index.js`
chamava `require('dotenv').config()` sem `path`, resolvendo a partir do `process.cwd()` — que o
`ecosystem.config.js:6` define como `/opt/agendor`, enquanto o arquivo mora em
`/opt/agendor/backend/.env`. O dotenv falhava em **silêncio** (`{ error: ENOENT }`, não lança).
O 03-01 passou a carregar por caminho absoluto derivado de `__dirname`. Consequência: se um dia
alguém tiver criado um `/opt/agendor/.env` para contornar o problema, **ele deixou de valer** — o
arquivo que conta agora é `backend/.env`. O terceiro comando acima existe para detectar isso.

## Nota sobre o `ecosystem.config.js`

O `cwd: '/opt/agendor'` continua no arquivo e não foi alterado — a correção foi feita no lado do
código (caminho absoluto), que é robusto independentemente do `cwd`. Não há ação pendente ali, mas
vale saber que os dois apontam para lugares diferentes por desenho, não por descuido.

## Quando fechar

Na Fase 8 (Documentação & Runbook), ou antes, se um servidor for criado. O runbook de deploy dessa
fase deve incorporar os comandos acima como passo obrigatório de pós-instalação.
