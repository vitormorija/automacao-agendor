# Branch Protection — Required Status Checks (`main`)

Runbook reproduzível para tornar o CI um **gate obrigatório de merge** na branch `main`
(requisito **CI-02**, decisão **D-10**). Branch protection é configuração de repositório no
GitHub — **não versionada no código** — por isso este passo-a-passo existe: para ser
auditável e reproduzível em caso de reset/migração do repositório.

Repositório: `github.com/vitormorija/automacao-agendor` · Branch: `main`
Status checks obrigatórios: `backend` e `frontend` (ids dos jobs em `.github/workflows/ci.yml`).

---

## 1. Pré-requisitos

- **`gh` CLI autenticado** com uma conta que tenha **admin** no repositório:
  ```bash
  gh auth status          # deve listar a conta logada em github.com
  ```
- O workflow `.github/workflows/ci.yml` já precisa ter **rodado ao menos uma vez** num PR
  (assim o GitHub conhece os contextos `backend`/`frontend`). Se os contextos ainda não
  existirem, abra primeiro um PR qualquer para `main` e deixe o CI rodar — ver §4.

> ⚠️ **Pitfall 3 (crítico):** os nomes em `contexts` DEVEM casar exatamente com os **ids dos
> jobs** do `ci.yml` (`backend`, `frontend`). Se você renomear um job, atualize aqui também,
> senão o check requerido nunca fica "verde" e o merge fica travado para sempre.

---

## 2. Aplicar a proteção (via `gh api`)

O endpoint `PUT .../branches/main/protection` exige as **4 chaves de topo** presentes
(nulláveis): `required_status_checks`, `enforce_admins`, `required_pull_request_reviews`,
`restrictions`. `strict: true` = "a branch precisa estar atualizada com a `main` antes do merge".

```bash
gh api --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/vitormorija/automacao-agendor/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["backend", "frontend"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

- `enforce_admins: true` — a proteção vale **também para admins** (ninguém faz bypass do gate).
- `required_pull_request_reviews: null` — não exigimos review humano aprovado nesta fase
  (projeto interno single-maintainer); o gate é o CI. Ajuste no futuro se quiser exigir aprovação.
- `restrictions: null` — sem lista de restrição de quem pode dar push.

> **Se o `gh api` retornar `422`:** falta alguma das 4 chaves de topo, ou um `contexts` não casa
> com job id existente. A mensagem de erro do GitHub aponta a chave. Corrija e re-rode.
> Alternativa: configurar pela UI em **Settings → Branches → Add branch protection rule**
> (padrão `main`, marcar "Require status checks to pass" → adicionar `backend` e `frontend`,
> marcar "Do not allow bypassing the above settings").

---

## 3. Verificar que ficou ativo

```bash
gh api /repos/vitormorija/automacao-agendor/branches/main/protection/required_status_checks
```

Deve retornar `"contexts": ["backend", "frontend"]` (e `"strict": true`). Confirme também
visualmente em **GitHub → Settings → Branches → main**.

---

## 4. Provar o gate — PR de falha proposital (CI-02 / D-11)

Configurar a proteção não basta: é preciso **provar** que um PR quebrado é barrado. Abra um PR
com uma falha barata e reversível e confirme que o merge fica bloqueado.

```bash
git checkout -b test/ci-gate-proof
# Introduzir uma falha barata e reversível (ex.: quebrar um teste de propósito,
# ou um erro de lint que já esteja em "error"):
#   echo "assert.equal(1, 2);" >> backend/test/agendor.futureTasks.test.js
git commit -am "test: prova de gate CI (falha proposital)"
git push -u origin test/ci-gate-proof
gh pr create --fill --base main
```

Confirme:
1. `gh pr checks <n>` — o check `backend` (ou `frontend`) fica **VERMELHO**.
2. No GitHub, o **botão de merge fica BLOQUEADO** por status check obrigatório.

Depois **descarte** (NÃO faça merge):

```bash
gh pr close <n>
git checkout chore/production-readiness   # ou a branch de trabalho
git branch -D test/ci-gate-proof
git push origin --delete test/ci-gate-proof
```

Confirme que nada da falha entrou na `main`.

---

## Referência

- Contextos requeridos = ids dos jobs em `.github/workflows/ci.yml` (`backend`, `frontend`).
- Fonte técnica: `.planning/phases/02-toolchain-de-qualidade-ci/02-RESEARCH.md`
  (§ "Branch protection — required status checks", § "Verificação CI-02").
- Docs GitHub: REST API → Branch protection (`PUT /repos/{owner}/{repo}/branches/{branch}/protection`).
