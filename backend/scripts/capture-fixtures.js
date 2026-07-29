// Captura MANUAL e única de uma pequena amostra de deals reais da Agendor para
// gerar a fixture de realismo ANONIMIZADA (D-10). NUNCA rode isto em CI.
//
// Uso:  AGENDOR_TOKEN=xxx node backend/scripts/capture-fixtures.js
//
// Regras de segurança (threats T-02-01 / T-02-02):
//  - O token é lido SOMENTE do ambiente e NUNCA é escrito em disco.
//  - A saída é ANONIMIZADA antes de ser gravada: todo PII (nomes de owner/author,
//    nomes de organização, títulos de deal, e-mails, telefones e CPF/CNPJ) é
//    substituído por rótulos sintéticos determinísticos ("Owner 1", "Org 1", ...).
//  - Mantém apenas os campos estruturais que getStaleDeals consome (ids reatribuídos,
//    datas, ids de status/stage, nome de funil genérico) — nada de payload bruto.
//  - O commit da amostra é feito por outra etapa APÓS revisão humana (checkpoint).

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.AGENDOR_TOKEN;
if (!TOKEN) {
  console.error(
    '[capture] Defina AGENDOR_TOKEN no ambiente (nunca commite o token). Abortando.',
  );
  process.exit(1);
}

const api = axios.create({
  baseURL: 'https://api.agendor.com.br/v3',
  headers: { Authorization: `Token ${TOKEN}` },
});

// Remove QUALQUER PII, mantendo somente a estrutura consumida por getStaleDeals.
// Datas são estruturais (não-PII) e preservadas para o smoke de realismo.
function anonymize(deal, i) {
  const n = i + 1;
  return {
    id: 1000 + i,
    title: `Deal ${n}`,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
    owner: { id: 10 + i, name: `Owner ${n}` },
    author: { id: 20 + i, name: `Author ${n}` },
    organization: { id: 30 + i, name: `Org ${n}` },
    dealStatus: deal.dealStatus ? { id: deal.dealStatus.id } : undefined,
    status: deal.status ? { id: deal.status.id } : undefined,
    dealStage: {
      name: deal.dealStage?.name || null,
      funnel: { name: deal.dealStage?.funnel?.name || null },
    },
    _webUrl: `https://web.agendor.com.br/deal/${1000 + i}`,
  };
}

(async () => {
  const { data } = await api.get('/deals', {
    params: { page: 1, per_page: 10, deal_status_id: 1 },
  });
  const sample = (data.data || []).slice(0, 8).map(anonymize);
  const out = path.join(
    __dirname,
    '..',
    'test',
    'fixtures',
    'real-deals.sample.json',
  );
  fs.writeFileSync(out, JSON.stringify(sample, null, 2) + '\n');
  console.log(
    `[capture] Gravados ${sample.length} deals ANONIMIZADOS em ${out}`,
  );
  console.log(
    '[capture] Revise o arquivo e siga o checkpoint de aprovação antes de commitar.',
  );
})().catch((err) => {
  console.error('[capture] Falha na captura:', err.message);
  process.exit(1);
});
