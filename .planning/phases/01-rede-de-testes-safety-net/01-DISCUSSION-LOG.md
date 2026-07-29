# Phase 1: Rede de Testes (Safety-Net) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-22
**Phase:** 1-Rede de Testes (Safety-Net)
**Areas discussed:** Runner de teste, Costura para testar, Isolamento de DB, Fixtures/baseline

---

## Runner de Teste

| Option | Description | Selected |
|--------|-------------|----------|
| node:test nativo | Runner embutido no Node 20+, zero dependência nova; cobertura via c8; sem config | ✓ |
| Vitest | DX superior (watch, cobertura integrada), mas adiciona dependência + config | |
| Jest | Clássico, bom com CommonJS, porém mais pesado e com mais config/transform | |

**User's choice:** node:test nativo
**Notes:** Alinhado ao ethos minimalista do projeto (logger zero-dependência). Cobertura via c8.

---

## Costura para Testar

| Option | Description | Selected |
|--------|-------------|----------|
| Exportar puras + mock HTTP | Extrair/exportar helpers puros sem mudar lógica + mockar axios/nodemailer na borda | ✓ |
| Só mock na borda | Não tocar em nada; mockar axios/nodemailer e testar funções inteiras como estão | |

**User's choice:** Exportar puras + mock HTTP
**Notes:** Costura de teste não é "feature" e exportar função não altera comportamento — permitido pelas regras. Extrações maiores que "mover função + exportar" são adiadas para a Fase 7.

---

## Isolamento de DB

| Option | Description | Selected |
|--------|-------------|----------|
| DB_PATH → :memory: | db.js aceita caminho via env (default inalterado = agendor.db); testes em :memory:/tempfile | ✓ |
| Mockar módulo db | Substituir db.js por um duplo; não toca db.js mas pode divergir do schema real | |

**User's choice:** DB_PATH → :memory:
**Notes:** Produção intacta; SQLite real em memória evita divergência de schema. Pavimenta a Fase 3 (config por ambiente).

---

## Fixtures / Baseline

| Option | Description | Selected |
|--------|-------------|----------|
| Sintéticos por regra | Fixtures à mão, um por regra; determinístico, sem API, documenta cada regra | |
| Gravar reais da API | Capturar deals reais como golden fixtures; realista mas exige API e pode trazer ruído/PII | |
| Ambos | Sintéticos como base + alguns reais gravados (anonimizados) como sanity check | ✓ |

**User's choice:** Ambos
**Notes:** Sintéticos por regra como base determinística; reais anonimizados como sanity de realismo. Reais capturados uma vez, token via env (nunca commitado), PII removida antes do commit.

---

## Claude's Discretion

- Organização/nomenclatura dos arquivos de teste (sem convenção prévia no repo).
- Estrutura interna dos helpers de fixture e dos mocks de axios/nodemailer.
- Detalhe exato do seam de auth (TEST-05).

## Deferred Ideas

- Log de debug por deal excluído (muda comportamento — fase posterior).
- Extrações arquiteturais maiores (`getEnrichedStaleDeals`, serviço de agregação) — Fase 7.
- Testes de frontend/componentes — fora de TEST-01..05.
- Rate-limit em store persistente — v2 (SECV-02).
