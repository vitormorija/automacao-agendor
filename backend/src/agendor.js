const axios = require('axios');

const BASE_URL = 'https://api.agendor.com.br/v3';
const TOKEN = process.env.AGENDOR_TOKEN;

const api = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Token ${TOKEN}` },
});

// Busca todos os usuários com seus emails
async function getUsers() {
  const users = {};
  let page = 1;
  while (true) {
    const { data } = await api.get('/users', { params: { page, per_page: 100 } });
    for (const user of data.data) {
      users[user.id] = {
        id: user.id,
        name: user.name,
        email: user.contact?.email || null,
      };
    }
    if (!data.links?.next) break;
    page++;
  }
  return users;
}

// Busca negócios criados a partir de 2026, em andamento, com paginação
async function getStaleDeals(staleDays = 15) {
  const cutoffDate = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const startOf2026 = new Date('2026-01-01T00:00:00.000Z');
  const allDeals = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await api.get('/deals', {
      params: {
        page,
        per_page: perPage,
        deal_status_id: 1, // Em andamento
      },
    });

    const deals = data.data;
    if (!deals || deals.length === 0) break;

    for (const deal of deals) {
      const createdAt = new Date(deal.createdAt);
      const updatedAt = new Date(deal.updatedAt);

      // Apenas cards criados a partir de 2026
      if (createdAt < startOf2026) continue;

      // Apenas cards sem atualização há mais de X dias
      if (updatedAt < cutoffDate) {
        const daysSinceUpdate = Math.floor((Date.now() - updatedAt) / (1000 * 60 * 60 * 24));
        allDeals.push({
          id: deal.id,
          title: deal.title?.trim(),
          ownerId: deal.owner?.id || null,
          ownerName: deal.owner?.name || null,
          organization: deal.organization?.name || null,
          stage: deal.dealStage?.name || null,
          funnel: deal.dealStage?.funnel?.name || null,
          createdAt: deal.createdAt,
          updatedAt: deal.updatedAt,
          daysSinceUpdate,
          webUrl: deal._webUrl,
        });
      }
    }

    if (!data.links?.next) break;
    page++;
  }

  return allDeals;
}

module.exports = { getUsers, getStaleDeals };
