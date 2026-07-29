# Quick 260724-lea: Neutralizar SMTP_PASS/ADMIN_EMAIL no setup de testes (WR-01) — Summary

Força a sobrescrita incondicional de `SMTP_PASS` e `ADMIN_EMAIL` em `backend/test/setup.js`, impedindo que um segredo real exportado no shell/CI vaze para o SQLite temporário que os testes semeiam.

## O que foi feito

Em `backend/test/setup.js`, após os três blocos guardados existentes (`JWT_SECRET`, `DB_PATH`, `AGENDOR_TOKEN`), foram adicionadas duas atribuições **incondicionais** (sem guarda `if (!process.env...)`):

```js
process.env.SMTP_PASS = '';
process.env.ADMIN_EMAIL = '';
```

Precedidas de um comentário em português no estilo/voz do arquivo, explicando que — diferentemente dos presets guardados acima — estas duas variáveis são SEMPRE sobrescritas.

## Rationale (WR-01)

O achado de code review WR-01 da Fase 1 apontou que os presets do setup usavam apenas guardas `if (!process.env.X)`. Consequência: um `SMTP_PASS`/`ADMIN_EMAIL` real já exportado num shell ou job de CI venceria a guarda e fluiria (via seeding de config em `db.js:102,106`) para o SQLite temporário em disco criado por `db.dedup.test.js`. Ou seja, um segredo de produção poderia acabar gravado no banco de teste.

A correção torna essas duas atribuições **incondicionais** (force-override). String vazia é o valor inerte pretendido — nenhum teste precisa de valores reais de SMTP_PASS/ADMIN_EMAIL. Esse comportamento incondicional é o ponto central da correção.

## Escopo

- Editado **somente** `backend/test/setup.js`.
- Nenhuma outra variável de ambiente, código de produção ou config foi tocado.
- Nenhum e-mail enviado.

## Verificação

```
export PATH="$HOME/bin:$PATH" && cd backend && npm test
```

Resultado: **28 pass, 0 fail** (0 cancelled, 0 skipped, 0 todo). A contagem permanece idêntica à baseline — a correção não alterou nenhum comportamento fixado.

## Deviations from Plan

Nenhuma — plano executado exatamente como escrito.

## Self-Check: PASSED
